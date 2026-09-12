/** Helpers shared by both image dialects. Nothing here imports a provider or
 *  the registry — this module is pure so both adapters (and tests) can use it. */

export const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  webp: "image/webp"
};

/** Clamp to the endpoint's character cap. The compat endpoint 400s above 1500,
 *  and a 400 is worse than a truncated prompt. */
export function clampChars(text: string, limit: number): string {
  return text.length <= limit ? text : text.slice(0, limit).trimEnd();
}

/** "1024x1024" → dims; "auto"/absent/invalid → null. */
export function parseSize(size?: string): { width: number; height: number } | null {
  if (!size || size === "auto") return null;
  const m = /^(\d{2,5})x(\d{2,5})$/.exec(size);
  return m ? { width: Number(m[1]), height: Number(m[2]) } : null;
}

const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/** Magic-byte sniff, falling back to png (the format both dialects are asked
 *  for by default, so the fallback is the common truth). */
export function sniffMime(bytes: Buffer): string {
  if (bytes.subarray(0, 8).equals(PNG_SIGNATURE)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8) return "image/jpeg";
  if (bytes.subarray(0, 4).toString("ascii") === "RIFF") return "image/webp";
  return "image/png";
}

/** `data:image/png;base64,…` → payload. Plain http(s) URLs return null: we do
 *  not chase remote URLs (Venice's `url` format is itself a data URL), and
 *  silently fetching an arbitrary URL from a provider response is worse than
 *  reporting "no image data". */
export function dataUrlPayload(url?: string): string | null {
  if (!url) return null;
  const match = /^data:[^;,]*;base64,(.*)$/s.exec(url.trim());
  return match ? match[1] : null;
}

/** Join a preset prefix with a model-written body, dropping an empty prefix so
 *  the composed prompt never starts with a stray space. */
export function composePrompt(prefix: string, body: string): string {
  const p = prefix.trim();
  const b = body.trim();
  if (!p) return b;
  if (!b) return p;
  return `${p} ${b}`;
}

// ── Forge Couple detection ──────────────────────────────────────────────────

/** The Forge Couple script's TITLE, as its wiki spells it in the
 *  `alwayson_scripts` example. Matching is case-INSENSITIVE; the spelling the
 *  WebUI itself reports is what goes back on the wire. */
export const FORGE_COUPLE_SCRIPT_NAME = "forge couple";

/** How long a detection answer is trusted. Installing or removing a WebUI
 *  extension means restarting the WebUI, so five minutes is short enough to
 *  notice without asking on every render — and a render must never pay a round
 *  trip for a script it does not use. */
export const FORGE_COUPLE_TTL_MS = 5 * 60_000;

/** Detection's own budget. It is a nicety, like the progress poll: a busy or
 *  hung WebUI must not hold a generation up, and "no answer" already means the
 *  safe default ("not installed"). */
export const FORGE_COUPLE_TIMEOUT_MS = 5_000;

/** What `/sdapi/v1/script-info` said about Forge Couple. `title` is ALWAYS the
 *  server's own string: A1111 looks an `alwayson_scripts` key up by exact name
 *  and answers HTTP 422 when it misses, so a title we invented would be worse
 *  than sending nothing at all. */
export type ForgeCoupleDetection = {
  detected: boolean;
  title?: string;
};

/** Per base URL, including NEGATIVE answers: a WebUI without the extension is
 *  the common case and must not be asked again on every generation. */
const forgeCoupleCache = new Map<string, { until: number; value: ForgeCoupleDetection }>();

/** Tests only: this cache lives for the life of the process, so a test must not
 *  inherit another test's answer. */
export function clearForgeCoupleCache(): void {
  forgeCoupleCache.clear();
}

/** Ask the WebUI whether Forge Couple is installed:
 *  `GET {baseUrl}/sdapi/v1/script-info`.
 *
 *  `baseUrl` is used VERBATIM — an a1111 connection's base URL is already the
 *  WebUI root, and re-running a normalizer over it is how a stray `/v1` gets
 *  inserted into every path. Headers are the caller's (the a1111 dialect's own
 *  auth rule), because this module owns no dialect knowledge.
 *
 *  Never throws and never rejects: an unreachable WebUI, a 404, a body that is
 *  not a JSON array of scripts, or a listing without the extension all mean the
 *  same thing — "not installed" — and every one of them is cached for the TTL
 *  like any other answer. */
export async function detectForgeCouple(
  baseUrl: string,
  options: {
    fetchImpl?: typeof fetch;
    headers?: Record<string, string>;
    now?: () => number;
  } = {}
): Promise<ForgeCoupleDetection> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const now = options.now ?? Date.now;
  const base = baseUrl.replace(/\/+$/, "");
  const cached = forgeCoupleCache.get(base);
  if (cached && now() < cached.until) return cached.value;

  const value = await probeForgeCouple(base, options.headers ?? {}, fetchImpl);
  forgeCoupleCache.set(base, { until: now() + FORGE_COUPLE_TTL_MS, value });
  return value;
}

async function probeForgeCouple(
  base: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<ForgeCoupleDetection> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FORGE_COUPLE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${base}/sdapi/v1/script-info`, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    if (!res.ok) return { detected: false };
    const title = forgeCoupleTitle(await res.text());
    return title === undefined ? { detected: false } : { detected: true, title };
  } catch {
    return { detected: false };
  } finally {
    clearTimeout(timer);
  }
}

/** The extension's title out of a script-info body, or nothing. The list also
 *  carries every built-in script, so the match is exact apart from case (a
 *  name that merely starts with "forge couple" is a different script); an
 *  alwayson entry wins over a same-named non-alwayson one. */
function forgeCoupleTitle(bodyText: string): string | undefined {
  let parsed: unknown;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    return undefined;
  }
  if (!Array.isArray(parsed)) return undefined;
  let fallback: string | undefined;
  for (const entry of parsed) {
    if (!entry || typeof entry !== "object") continue;
    const row = entry as { name?: unknown; is_alwayson?: unknown };
    if (typeof row.name !== "string") continue;
    const title = row.name.trim();
    if (title.toLowerCase() !== FORGE_COUPLE_SCRIPT_NAME) continue;
    if (row.is_alwayson === true) return title;
    if (fallback === undefined) fallback = title;
  }
  return fallback;
}
