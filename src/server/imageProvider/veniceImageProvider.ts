import type { ProviderConnection } from "../../schemas";
import type { ResolvedProviderConfig } from "../providerConfig";
import { requestWithRetry } from "../provider/openaiClient";
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from "./types";
import { clampChars, modelFromRawBody, parseSize, sniffMime } from "./shared";

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
    // The re-send path: the body IS the request — nothing is clamped and none
    // of the connection's current settings (size, seed, variants, style preset,
    // safe mode) are re-applied on top of it.
    const body: Record<string, unknown> = req.rawBody ?? buildVeniceBody(req, this.connection, this.config.model);
    // The seed reported on the ref is what the BODY carries, not what the
    // connection asks for: the ordinary path's seed was already RESOLVED by the
    // caller (route: request body → connection → unset), and on the re-send path
    // the body is the authority. `0` is Venice's documented "pick one at
    // random" — the same thing as sending nothing, so it reports as absent
    // rather than as a number nobody chose.
    const seedValue = req.rawBody ? req.rawBody.seed : req.seed ?? 0;
    const seed = typeof seedValue === "number" && Number.isFinite(seedValue) ? seedValue : 0;

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
      // A re-sent body names its own model; the connection's is the fallback.
      model: modelFromRawBody(req.rawBody) ?? this.config.model,
      providerId: this.config.providerId,
      // What was ACTUALLY sent, so the stored ref can be compared or re-rolled.
      seed: seed || undefined,
      durationMs: typeof parsed.timing?.total === "number" ? parsed.timing.total : Date.now() - start,
      rawRequest: JSON.stringify(body),
      rawOutput: text
    };
  }
}

/** The `/image/generate` body this dialect builds from the request and the
 *  connection. Pulled out of `generateImage` so the re-send path can bypass it
 *  wholesale: aspect_ratio and width/height are mutually exclusive upstream, so
 *  every conditional here is a decision about what the provider is allowed to
 *  see. */
function buildVeniceBody(
  req: ImageGenerationRequest,
  connection: ProviderConnection,
  model: string
): Record<string, unknown> {
  const aspectRatio = req.aspectRatio ?? connection.aspectRatio;
  // aspect_ratio and width/height are mutually exclusive upstream: sending
  // both is what makes a ratio-only model 400.
  const dims = aspectRatio ? null : parseSize(req.size ?? connection.size);
  const body: Record<string, unknown> = {
    model,
    prompt: clampChars(req.prompt, VENICE_IMAGE_PROMPT_CAP),
    format: "png",
    return_binary: false,
    variants: req.variants ?? connection.variants ?? 1,
    seed: req.seed ?? 0, // 0 = random (documented)
    safe_mode: req.safeMode ?? connection.safeMode ?? false
  };
  if (req.negativePrompt) body.negative_prompt = clampChars(req.negativePrompt, VENICE_IMAGE_PROMPT_CAP);
  if (aspectRatio) body.aspect_ratio = aspectRatio;
  if (dims) {
    body.width = dims.width;
    body.height = dims.height;
  }
  const stylePreset = req.stylePreset ?? connection.stylePreset;
  if (stylePreset) body.style_preset = stylePreset;
  if (req.hideWatermark ?? connection.hideWatermark) body.hide_watermark = true;
  return body;
}
