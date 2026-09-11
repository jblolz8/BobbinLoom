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
