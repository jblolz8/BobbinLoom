import type { ProviderConnection, RegionDirection } from "../../schemas";
import { authHeaders } from "../httpAuth";
import type { ResolvedProviderConfig } from "../providerConfig";
import { linkExternalAbort } from "../provider/openaiClient";
import { A1111_API_MISSING_HINT } from "../providerRegistry";
import { clampChars, detectForgeCouple, parseSize, sniffMime } from "./shared";
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
 *  - When the WebUI has the Forge Couple extension AND the composed prompt
 *    carries two or more ` | ` groups, the request also carries that
 *    extension's 17-argument `alwayson_scripts` entry so each character gets
 *    its own attention region. Both conditions are checked before the entry is
 *    built: a key naming a script the WebUI does not have is an HTTP 422 on
 *    EVERY render (`modules/api/api.py`).
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
    const plan = await this.regionPlan(req);
    const body = buildTxt2ImgBody(req, this.connection, plan);

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

  /** This request's regions, or null for "exactly today's behaviour".
   *
   *  The two LOCAL checks come first and cost nothing: a connection that
   *  switched regions off, and a prompt with fewer than THREE groups both
   *  return before any request is made. Three, not two, because the first group
   *  is the shared scene — two groups means ONE character in frame and nothing
   *  to separate, and sending regions anyway would only halve the weight of the
   *  scene tags for no benefit. Only then is the extension consulted — and that
   *  answer is cached per base URL, so even a multi-character scene pays for it
   *  once every few minutes rather than once per render.
   *
   *  A missing, failing or unknown extension is `false` all the way down: the
   *  caller keeps rendering, just without regions. */
  private async regionPlan(req: ImageGenerationRequest): Promise<RegionPlan> {
    if (this.connection.regionsEnabled === false) return null;
    const groups = promptGroups(req.prompt);
    if (groups.length < 3) return null;
    const detection = await detectForgeCouple(this.config.baseUrl, {
      fetchImpl: this.fetchImpl,
      headers: authHeaders(this.config.apiKey, "a1111")
    });
    if (!detection.detected || !detection.title) return null;
    return {
      // The server's OWN spelling: A1111 resolves the key by exact name.
      script: detection.title,
      direction: this.connection.regionDirection ?? REGION_DIRECTION_DEFAULT,
      groups
    };
  }
}

/** The `/sdapi/v1/txt2img` body. A1111 takes any SUBSET of its parameters and
 *  fills in the rest from the WebUI's own settings, so the rule here is "send a
 *  field only when the connection actually asks for it": an absent `steps` means
 *  "the number the user already set in their WebUI", and overriding that with a
 *  hardcoded 20 would silently ignore their tuning. */
function buildTxt2ImgBody(
  req: ImageGenerationRequest,
  conn: ProviderConnection,
  plan: RegionPlan = null
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    // With regions engaged the prompt is REBUILT from the groups, so the
    // separator we hand the extension is literally the one it will find — a
    // prompt normalized one way and advertised another way would silently be a
    // single region.
    prompt: clampChars(plan ? plan.groups.join(FORGE_COUPLE_SEPARATOR) : req.prompt, A1111_IMAGE_PROMPT_CAP),
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
  if (plan) {
    body.alwayson_scripts = { [plan.script]: { args: forgeCoupleArgs(plan.direction, plan.groups.length) } };
  }
  return body;
}

/** Forge Couple's group separator, spelled exactly as the extension's wiki
 *  does. The string the composed prompt is split on IS the string passed as
 *  `separator` — one constant, so the two can never drift apart. */
export const FORGE_COUPLE_SEPARATOR = " | ";

/** Which way the canvas splits when the connection names no direction. */
export const REGION_DIRECTION_DEFAULT: RegionDirection = "Horizontal";

/** The composed prompt's character groups: split on `|`, each trimmed, empties
 *  dropped. A group that ends up empty is not a group (a stray separator must
 *  not invent a character), and a single group means "no regions". */
export function promptGroups(prompt: string): string[] {
  return prompt
    .split("|")
    .map((group) => group.trim())
    .filter(Boolean);
}

/** One request's regions: the extension's own title (which is also the
 *  `alwayson_scripts` key), the direction, and the groups the prompt is
 *  rebuilt from. `null` means "no regions" — the body is then byte-identical to
 *  a render that never heard of the extension. */
type RegionPlan = { script: string; direction: RegionDirection; groups: string[] } | null;

/** Forge Couple's 17 arguments, in the extension's own order:
 *  `enable, disable_hr, mode, separator, direction, background,
 *  background_weight, mapping, common_parser, common_debug, def_in_prompt`,
 *  then the six Tile-mode slots (left `null`: they are unused, and Tile mode is
 *  not what this app asks for).
 *
 *  Basic mode splits the whole canvas in half — no coordinates — and the FIRST
 *  group becomes the shared background line, which is where the preset's own
 *  style prefix already lands. */
/** Forge Couple's 17 arguments, in the extension's own order. The mapping slot
 *  is the one entry that is not a scalar — Advanced mode reads its geometry
 *  from an array of boxes. */
export function forgeCoupleArgs(
  direction: RegionDirection,
  groupCount: number
): Array<boolean | string | number | number[][] | null> {
  return [
    true, // enable
    true, // disable_hr — the regions must hold for the high-res pass too
    FORGE_COUPLE_MODE, // mode — Advanced; Basic cannot carry what we send
    FORGE_COUPLE_SEPARATOR, // separator
    null, // direction — Advanced geometry is the mapping, not a direction
    null, // background — no separate global line; the shared group IS one
    null, // background_weight
    forgeCoupleMapping(direction, groupCount), // mapping
    "off", // common_parser
    false, // common_debug
    true, // def_in_prompt
    null, // Tile mode …
    null,
    null,
    null,
    null,
    null
  ];
}

/** Advanced mode, deliberately — Basic mode cannot express what this app sends.
 *  Its handler (`scripts/forge_couple.py`) rejects a prompt outright unless it
 *  carries at least THREE lines (`len(couples) < 3 - int(background == "None")`)
 *  and builds its geometry from the WebUI's own persisted UI state. A two-group
 *  prompt — a shared scene plus one character, i.e. any POV scene where the
 *  viewer is never named — therefore died on a live WebUI with
 *  "[Forge Couple] ERROR - Not Enough Lines in Prompt... [2 / 3]".
 *  Advanced mode takes the geometry FROM US: it validates
 *  `len(couples) == len(mapping)` and nothing else. */
export const FORGE_COUPLE_MODE = "Advanced";

/** The shared group's weight across the whole frame — the same number the
 *  extension's own "Global Effect Weight" defaults to. */
export const FORGE_COUPLE_BACKGROUND_WEIGHT = 0.5;

/** One box per group, `[x1, x2, y1, y2, weight]` in 0..1 canvas fractions —
 *  the shape the extension's Advanced mapping and its own `validate_mapping`
 *  expect (numbers only, coords inside 0..1, x2 >= x1, y2 >= y1).
 *
 *  The FIRST group is the shared scene, so it gets the WHOLE FRAME at the
 *  background weight: that is exactly what Basic mode's "First Line" global
 *  effect did, reproduced under our control. Every group after it is a
 *  character and gets an equal slice — columns when Horizontal, rows when
 *  Vertical. A lone character takes the whole frame, since there is nothing to
 *  separate it from. */
export function forgeCoupleMapping(direction: RegionDirection, groupCount: number): number[][] {
  const boxes: number[][] = [[0, 1, 0, 1, FORGE_COUPLE_BACKGROUND_WEIGHT]];
  const characters = Math.max(1, groupCount - 1);
  for (let index = 0; index < characters; index += 1) {
    const from = index / characters;
    const to = (index + 1) / characters;
    boxes.push(direction === "Vertical" ? [0, 1, from, to, 1] : [from, to, 0, 1, 1]);
  }
  return boxes;
}
