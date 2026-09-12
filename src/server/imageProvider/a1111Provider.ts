import type { ProviderConnection } from "../../schemas";
import { authHeaders } from "../httpAuth";
import type { ResolvedProviderConfig } from "../providerConfig";
import { linkExternalAbort } from "../provider/openaiClient";
import { clampChars, sniffMime } from "./shared";
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from "./types";

/** A1111 publishes NO prompt cap — a prompt is chunked at 75 CLIP tokens and
 *  everything past the first chunk is simply weighted less. This is a sanity
 *  ceiling so a runaway string cannot be posted, NOT a trim: a 2000-character
 *  prompt is sent unchanged (the review modal reports the chunk count instead). */
export const A1111_IMAGE_PROMPT_CAP = 10_000;

/** The interrupt call is fire-and-forget: it gets its own short budget so a
 *  WebUI that is busy sampling cannot hold the cancel path open. */
export const A1111_INTERRUPT_TIMEOUT_MS = 5_000;

/** An `AbortSignal` that fires after `ms`, with the timer handed back so the
 *  caller can cancel it — a leaked timer would keep a test's event loop alive.
 *  (No `AbortSignal.timeout`: one shape, works on every Node this app runs.) */
function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** A1111 speaks its own native `/sdapi/v1/*` API:
 *
 *  - `override_settings.sd_model_checkpoint` swaps the checkpoint for ONE
 *    request. We never POST `/sdapi/v1/options` — that would mutate the user's
 *    own WebUI state, which is not ours to change.
 *  - `seed: -1` means "pick one" and `0` is a legitimate, reproducible seed —
 *    the opposite of Venice, where 0 is the random sentinel.
 *  - Cancel is a REQUEST (`POST /sdapi/v1/interrupt`), not a promise trick: an
 *    aborted fetch alone leaves the WebUI sampling and the GPU busy.
 *  - `variants` maps to `batch_size`, so one call renders the whole batch.
 *
 *  Every optional parameter is omitted when the connection does not set it, so
 *  an absent field means "the WebUI's own default" — which is exactly what a
 *  user who tuned their WebUI expects. */
export class A1111Provider implements ImageProvider {
  constructor(
    private readonly config: ResolvedProviderConfig,
    private readonly connection: ProviderConnection,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async generateImage(req: ImageGenerationRequest): Promise<ImageGenerationResult> {
    const start = Date.now();
    const body: Record<string, unknown> = {
      prompt: clampChars(req.prompt, A1111_IMAGE_PROMPT_CAP),
      seed: req.seed ?? -1, // A1111: -1 = random (0 is a real seed)
      n_iter: 1,
      batch_size: Math.min(Math.max(req.variants ?? 1, 1), 4)
    };

    // Cancellation is a POST. `once` keeps it to exactly one interrupt per
    // signal, and the listener is removed on every exit path.
    const interrupt = () => {
      void this.sendInterrupt();
    };
    req.signal?.addEventListener("abort", interrupt, { once: true });

    try {
      const res = await this.postTxt2Img(body, req.signal);
      const text = await res.text();
      if (!res.ok) throw new Error(`A1111 image provider error ${res.status}: ${text.slice(0, 300)}`);

      const parsed = JSON.parse(text) as { images?: string[] };
      const payloads = Array.isArray(parsed.images) ? parsed.images : [];
      if (!payloads.length) throw new Error("Image provider returned no image data");

      return {
        images: payloads.map((b64) => {
          // The mime comes from the BYTES: the WebUI hands back bare base64 with
          // no filename and no format field, and a wrong content-type would put
          // a mislabelled file in the content-addressed store.
          const bytes = Buffer.from(b64, "base64");
          return { bytes, mime: sniffMime(bytes) };
        }),
        model: this.config.model,
        providerId: this.config.providerId,
        durationMs: Date.now() - start,
        rawRequest: JSON.stringify(body),
        rawOutput: text
      };
    } finally {
      req.signal?.removeEventListener("abort", interrupt);
    }
  }

  /** One POST to the native endpoint, with the connection's own timeout and the
   *  caller's abort linked through — no retry: a 60-second generation is not
   *  something to repeat on a 5xx. */
  private async postTxt2Img(body: Record<string, unknown>, signal?: AbortSignal): Promise<Response> {
    const controller = new AbortController();
    const requestTimeout = setTimeout(() => controller.abort(), this.config.timeoutMs);
    const unlink = linkExternalAbort(signal, controller);
    try {
      return await this.fetchImpl(`${this.config.baseUrl}/sdapi/v1/txt2img`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders(this.config.apiKey, "a1111") },
        body: JSON.stringify(body),
        signal: controller.signal
      });
    } finally {
      clearTimeout(requestTimeout);
      unlink();
    }
  }

  /** Best effort by design: a failed interrupt must never turn the user's cancel
   *  into an error, and the request it is racing has already been abandoned. */
  private async sendInterrupt(): Promise<void> {
    const { signal, cancel } = timeoutSignal(A1111_INTERRUPT_TIMEOUT_MS);
    try {
      await this.fetchImpl(`${this.config.baseUrl}/sdapi/v1/interrupt`, {
        method: "POST",
        headers: authHeaders(this.config.apiKey, "a1111"),
        signal
      });
    } catch {
      // Swallowed on purpose — see above.
    } finally {
      cancel();
    }
  }
}
