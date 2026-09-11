import type { ProviderConnection } from "../../schemas";
import type { ResolvedProviderConfig } from "../providerConfig";
import { requestWithRetry } from "../provider/openaiClient";
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from "./types";
import { clampChars, parseSize, sniffMime } from "./shared";

/** POST /image/generate caps the prompt at the model's `promptCharacterLimit`
 *  (≤7500). Applied to the COMPOSED prompt, so a long prefix cannot 400. */
export const VENICE_IMAGE_PROMPT_CAP = 7500;

/** Venice-native image endpoint. Sent negative_prompt (the reason this dialect
 *  exists at all), safe_mode:false to keep adult content unblurred, and
 *  width/height only when the connection has a size — aspect-ratio models
 *  (the qwen-image family) reject width/height with a 400, so a connection can
 *  carry `aspectRatio` instead. */
export class VeniceImageProvider implements ImageProvider {
  constructor(
    private readonly config: ResolvedProviderConfig,
    private readonly connection: ProviderConnection,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const start = Date.now();
    const aspectRatio = req.aspectRatio ?? this.connection.aspectRatio;
    // aspect_ratio and width/height are mutually exclusive upstream: sending
    // both is what makes a ratio-only model 400.
    const dims = aspectRatio ? null : parseSize(req.size ?? this.connection.size);
    const body: Record<string, unknown> = {
      model: this.config.model,
      prompt: clampChars(req.prompt, VENICE_IMAGE_PROMPT_CAP),
      format: "png",
      return_binary: false,
      variants: req.variants ?? this.connection.variants ?? 1,
      seed: req.seed ?? 0, // 0 = random (documented)
      safe_mode: req.safeMode ?? this.connection.safeMode ?? false
    };
    if (req.negativePrompt) body.negative_prompt = clampChars(req.negativePrompt, VENICE_IMAGE_PROMPT_CAP);
    if (aspectRatio) body.aspect_ratio = aspectRatio;
    if (dims) {
      body.width = dims.width;
      body.height = dims.height;
    }
    const stylePreset = req.stylePreset ?? this.connection.stylePreset;
    if (stylePreset) body.style_preset = stylePreset;
    if (req.hideWatermark ?? this.connection.hideWatermark) body.hide_watermark = true;

    const res = await requestWithRetry(this.config, this.fetchImpl, body, "/image/generate", undefined, req.signal);
    const text = await res.text();
    if (!res.ok) throw new Error(`Image provider error ${res.status}: ${text.slice(0, 300)}`);

    const parsed = JSON.parse(text) as { images?: string[]; timing?: { total?: number } };
    const payloads = Array.isArray(parsed.images) ? parsed.images : [];
    if (!payloads.length) throw new Error("Image provider returned no image data");

    return {
      images: payloads.map((b64) => {
        const bytes = Buffer.from(b64, "base64");
        return { bytes, mime: sniffMime(bytes) };
      }),
      model: this.config.model,
      providerId: this.config.providerId,
      seed: req.seed,
      durationMs: typeof parsed.timing?.total === "number" ? parsed.timing.total : Date.now() - start,
      rawRequest: JSON.stringify(body),
      rawOutput: text
    };
  }
}
