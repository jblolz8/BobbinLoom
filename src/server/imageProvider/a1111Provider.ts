import type { ProviderConnection } from "../../schemas";
import { authHeaders } from "../httpAuth";
import type { ResolvedProviderConfig } from "../providerConfig";
import { linkExternalAbort } from "../provider/openaiClient";
import { A1111_API_MISSING_HINT } from "../providerRegistry";
import { clampChars, parseSize, sniffMime } from "./shared";
import type { ImageGenerationRequest, ImageGenerationResult, ImageProvider } from "./types";

/** A1111 publishes NO prompt cap — a prompt is chunked at 75 CLIP tokens and
 *  everything past the first chunk is simply weighted less. This is a sanity
 *  ceiling so a runaway string cannot be posted, NOT a trim: a 2000-character
 *  prompt is sent unchanged (the review modal reports the chunk count instead). */
export const A1111_IMAGE_PROMPT_CAP = 10_000;

/** The interrupt call is fire-and-forget: it gets its own short budget so a
 *  WebUI that is busy sampling cannot hold the cancel path open. */
export const A1111_INTERRUPT_TIMEOUT_MS = 5_000;

/** How often the WebUI's `/progress` route is read while a generation runs.
 *  One small local GET per ~600 ms: cheap against a localhost WebUI, and fine
 *  grained enough that the footer bar moves. */
export const A1111_PROGRESS_POLL_MS = 600;

/** Per-poll budget. A `/progress` read that hangs must not stack up behind the
 *  next poll — and it is discarded anyway once the generation settles. */
export const A1111_PROGRESS_TIMEOUT_MS = 3_000;

/** An `AbortSignal` that fires after `ms`, with the timer handed back so the
 *  caller can cancel it — a leaked timer would keep a test's event loop alive.
 *  (No `AbortSignal.timeout`: one shape, works on every Node this app runs.) */
function timeoutSignal(ms: number): { signal: AbortSignal; cancel: () => void } {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  return { signal: controller.signal, cancel: () => clearTimeout(timer) };
}

/** `GET /sdapi/v1/progress?skip_current_image=true`. Every field is optional on
 *  purpose: an older build's shape must degrade to "no news", never to a throw. */
type A1111ProgressResponse = {
  progress?: number;
  eta_relative?: number;
  state?: { sampling_step?: number; sampling_steps?: number };
};

/** A finite number, or nothing — a string, null, NaN and Infinity all mean the
 *  WebUI did not report that field. */
function optionalNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A1111 answers with `info` as a JSON STRING (not an object), and it is the only
 *  place the seed that was actually used appears — a request that asked for a
 *  random image sent `-1`, which is not a seed anybody can reproduce from.
 *
 *  Every part of this is optional: a build that omits `info`, truncates it, or
 *  answers something that is not a JSON object yields "unknown seed", never a
 *  throw — the image itself is still perfectly usable. `all_seeds[0]` is the
 *  documented fallback for a batch. */
function seedFromInfo(info: unknown): number | undefined {
  let parsed: unknown = info;
  if (typeof info === "string") {
    if (!info.trim()) return undefined;
    try {
      parsed = JSON.parse(info);
    } catch {
      return undefined;
    }
  }
  if (!parsed || typeof parsed !== "object") return undefined;
  const record = parsed as { seed?: unknown; all_seeds?: unknown };
  const direct = lenientNumber(record.seed);
  if (direct !== undefined) return direct;
  return Array.isArray(record.all_seeds) ? lenientNumber(record.all_seeds[0]) : undefined;
}

/** Numbers, and numeric strings (some forks stringify the whole info object).
 *  Anything else — including NaN and Infinity — is "not reported". */
function lenientNumber(value: unknown): number | undefined {
  if (typeof value === "number") return Number.isFinite(value) ? value : undefined;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** A non-2xx from the WebUI, with the status and a usable excerpt of the body.
 *  A 404 gets the one cause that is worth naming: without `--api` the WebUI
 *  answers 404 on EVERY `/sdapi/v1/*` route, so "Not Found" alone leaves the
 *  user with nothing to check. */
function a1111HttpError(status: number, text: string): Error {
  const excerpt = text.replace(/\s+/g, " ").trim().slice(0, 300);
  const hint = status === 404 ? ` — ${A1111_API_MISSING_HINT}` : "";
  return new Error(`A1111 image provider error ${status}: ${excerpt}${hint}`);
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
    const body = buildTxt2ImgBody(req, this.connection);

    // Cancellation is a POST. `once` keeps it to exactly one interrupt per
    // signal, and the listener is removed on every exit path.
    const interrupt = () => {
      void this.sendInterrupt();
    };
    req.signal?.addEventListener("abort", interrupt, { once: true });

    // Once this flips, nothing that arrives late may touch the result — a
    // progress sample for a finished job would move the caller's bar backwards.
    let settled = false;
    let pollTimer: ReturnType<typeof setTimeout> | undefined;

    const pollProgress = async (): Promise<void> => {
      const { signal, cancel } = timeoutSignal(A1111_PROGRESS_TIMEOUT_MS);
      try {
        const res = await this.fetchImpl(`${this.config.baseUrl}/sdapi/v1/progress?skip_current_image=true`, {
          method: "GET",
          headers: authHeaders(this.config.apiKey, "a1111"),
          signal
        });
        if (!res.ok || settled) return;
        const data = (await res.json()) as A1111ProgressResponse;
        if (settled) return;
        req.onProgress?.({
          progress: optionalNumber(data?.progress) ?? 0,
          step: optionalNumber(data?.state?.sampling_step),
          steps: optionalNumber(data?.state?.sampling_steps),
          etaSeconds: optionalNumber(data?.eta_relative)
        });
      } catch {
        // Progress is a nicety. The route can be missing on an old build, slow
        // while the GPU is busy, or answer something that is not JSON — none of
        // which is a reason to fail a generation that is otherwise fine. A
        // throwing callback is swallowed for the same reason.
      } finally {
        cancel();
      }
    };

    const schedulePoll = (): void => {
      pollTimer = setTimeout(() => {
        void pollProgress().finally(() => {
          if (!settled) schedulePoll();
        });
      }, A1111_PROGRESS_POLL_MS);
    };

    try {
      const pending = this.postTxt2Img(body, req.signal);
      // Poll from the moment the request is away, not one interval later: a
      // short generation would otherwise report nothing at all.
      if (req.onProgress) {
        void pollProgress().finally(() => {
          if (!settled) schedulePoll();
        });
      }

      const res = await pending;
      const text = await res.text();
      if (!res.ok) throw a1111HttpError(res.status, text);

      const parsed = JSON.parse(text) as { images?: string[]; info?: unknown };
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
        // The seed the WebUI used, read back out of `info` — absent when it did
        // not say, which is honest, unlike reporting the -1 we sent.
        seed: seedFromInfo(parsed.info),
        durationMs: Date.now() - start,
        rawRequest: JSON.stringify(body),
        rawOutput: text
      };
    } finally {
      settled = true;
      if (pollTimer) clearTimeout(pollTimer);
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

/** The `/sdapi/v1/txt2img` body. A1111 takes any SUBSET of its parameters and
 *  fills in the rest from the WebUI's own settings, so the rule here is "send a
 *  field only when the connection actually asks for it": an absent `steps` means
 *  "the number the user already set in their WebUI", and overriding that with a
 *  hardcoded 20 would silently ignore their tuning. */
function buildTxt2ImgBody(
  req: ImageGenerationRequest,
  conn: ProviderConnection
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    prompt: clampChars(req.prompt, A1111_IMAGE_PROMPT_CAP),
    seed: req.seed ?? -1, // A1111: -1 = random (0 is a real seed)
    n_iter: 1,
    batch_size: Math.min(Math.max(req.variants ?? 1, 1), 4)
  };
  if (req.negativePrompt) body.negative_prompt = clampChars(req.negativePrompt, A1111_IMAGE_PROMPT_CAP);
  // "auto" / absent / unparseable → no width/height at all, so the WebUI's own
  // canvas size applies rather than a size this app invented.
  const dims = parseSize(req.size);
  if (dims) {
    body.width = dims.width;
    body.height = dims.height;
  }
  if (conn.steps !== undefined) body.steps = conn.steps;
  if (conn.cfgScale !== undefined) body.cfg_scale = conn.cfgScale;
  if (conn.sampler) body.sampler_name = conn.sampler;
  if (conn.scheduler) body.scheduler = conn.scheduler;
  if (conn.model) {
    body.override_settings = { sd_model_checkpoint: conn.model };
    // Explicit, so "one request" never depends on a fork's default.
    body.override_settings_restore_afterwards = true;
  }
  return body;
}
