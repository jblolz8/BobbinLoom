/** Presentation formatting shared by the play view — pure functions, so they are
 *  unit-testable without a React renderer. */

/** Every duration in the panel, in one voice: `4.2s` under a minute, `1m 23s`
 *  above it (a local render is minutes, and `110.0s` is not a number anyone
 *  reads at a glance). Used by the turn badge, the image caption and the live
 *  phase counters. */
export function formatDuration(ms?: number | null): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 100) return "<0.1s";
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  const totalSeconds = Math.round(ms / 1000);
  return `${Math.floor(totalSeconds / 60)}m ${String(totalSeconds % 60).padStart(2, "0")}s`;
}

/** A checkpoint name without its file extension and hash tag. The caption only
 *  has to identify WHICH model rendered — the full string stays on the stored
 *  ref and in the request disclosure. Saves ~25 characters per caption, which is
 *  what made the caption overflow the figure even on a 420px cap.
 *  `waiANINSFWPONYXL_v140.safetensors [4817ae4643]` → `waiANINSFWPONYXL_v140`. */
export function shortModelName(model: string): string {
  const trimmed = model.trim();
  const short = trimmed
    .replace(/\.(safetensors|ckpt|pt|pth|gguf)\b/i, "")
    .replace(/\s*\[[0-9a-f]{6,}\]\s*$/i, "")
    .trim();
  return short || trimmed;
}

/** What the caption needs of a stored image ref. */
export type CaptionImage = {
  model: string;
  durationMs?: number;
  promptDurationMs?: number;
  seed?: number;
};

/**
 * The caption under a generated image. This is the ONE source for it: the
 * thumbnail's figcaption and the full-screen viewer both render this string, so
 * the two can never disagree about what was rendered.
 *
 * Both providers' halves are labelled as soon as the text side is known. A ref
 * written before `promptDurationMs` existed keeps the caption it had: an
 * unlabelled render time.
 */
export function imageCaption(image: CaptionImage): string {
  const render = image.durationMs
    ? image.promptDurationMs
      ? `render ${formatDuration(image.durationMs)}`
      : formatDuration(image.durationMs)
    : "";
  return [
    shortModelName(image.model),
    image.promptDurationMs ? `prompt ${formatDuration(image.promptDurationMs)}` : "",
    render,
    image.seed ? `seed ${image.seed}` : ""
  ]
    .filter(Boolean)
    .join(" · ");
}
