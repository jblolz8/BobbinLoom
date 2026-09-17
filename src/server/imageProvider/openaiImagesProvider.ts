import type { ProviderConnection } from "../../schemas";
import type { ResolvedProviderConfig } from "../providerConfig";
import { requestWithRetry } from "../provider/openaiClient";
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from "./types";
import { clampChars, dataUrlPayload, modelFromRawBody, sniffMime } from "./shared";

/** POST /images/generations has a hard 1500-character prompt cap. Applied to
 *  the COMPOSED prompt (prefix + body), so a long prefix can never 400. */
export const OPENAI_IMAGE_PROMPT_CAP = 1500;

/** OpenAI-compatible image endpoint (OpenAI, LM Studio, Automatic1111's
 *  compat shim, Venice's `/images/generations`). No negative prompt: that is
 *  the whole reason the Venice-native dialect exists. */
export class OpenAIImagesProvider implements ImageProvider {
  constructor(
    private readonly config: ResolvedProviderConfig,
    private readonly connection: ProviderConnection,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const start = Date.now();
    // The re-send path: a body the user re-issued is sent as given — no clamp,
    // no connection settings re-applied — and the provider's own limit error
    // (this dialect's 1500-character 400 included) is reported verbatim.
    const body: Record<string, unknown> = req.rawBody ?? {
      model: this.config.model,
      prompt: clampChars(req.prompt, OPENAI_IMAGE_PROMPT_CAP),
      size: req.size ?? this.connection.size ?? "auto",
      response_format: "b64_json",
      output_format: "png",
      // Venice maps moderation "low" → no adult-content blur; OpenAI ignores the
      // field. safeMode is opt-in and defaults off (see the schema comment).
      moderation: (req.safeMode ?? this.connection.safeMode ?? false) ? "auto" : "low",
      n: 1
    };

    const res = await requestWithRetry(this.config, this.fetchImpl, body, "/images/generations", undefined, req.signal);
    const text = await res.text();
    if (!res.ok) throw new Error(`Image provider error ${res.status}: ${text.slice(0, 300)}`);

    const first = (JSON.parse(text) as { data?: Array<{ b64_json?: string; url?: string }> }).data?.[0];
    // `url` in this dialect is a data URL; a plain http URL is treated as no
    // image data (we do not chase remote URLs).
    const b64 = first?.b64_json ?? dataUrlPayload(first?.url);
    if (!b64) throw new Error("Image provider returned no image data");
    const bytes = Buffer.from(b64, "base64");

    return {
      images: [{ bytes, mime: sniffMime(bytes) }],
      // A re-sent body names its own model; the connection's is the fallback.
      model: modelFromRawBody(req.rawBody) ?? this.config.model,
      providerId: this.config.providerId,
      durationMs: Date.now() - start,
      rawRequest: JSON.stringify(body),
      rawOutput: text
    };
  }
}
