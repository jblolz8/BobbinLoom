import { request } from "./client";
import type { MessageImage, Playthrough } from "../../schemas";

/** The persisted message attachment, straight from the schema (one source of
 *  truth shared with the server). */
export type { MessageImage };

/**
 * URL of the served bytes for a content-addressed image file
 * (`<sha256>.<ext>`, written under `data/images/`). The route is immutable, so
 * the browser can cache it forever and a branch that copies the reference does
 * not copy the bytes.
 */
export function buildImageUrl(file: string): string {
  return `/api/images/${file}`;
}

export type ImagePromptPreview = {
  prompt: string;
  negativePrompt: string;
  /** Advisory notes from the prompt-writing call — a suspected refusal used
   *  verbatim, or JSON that carried neither expected key. Shown above the
   *  editable prompt in the review modal; never blocking. Absent/empty when the
   *  model answered exactly what was asked for. */
  warnings?: string[];
};

export type GenerateMessageImageOptions = {
  /** Image connection to use; omitted = the active image connection. */
  imageProviderId?: string;
  /** Reviewed/edited prompt from the preview modal. When BOTH overrides are
   *  given the server skips the text call entirely. */
  promptOverride?: string;
  negativeOverride?: string;
  seed?: number;
  signal?: AbortSignal;
};

export type GenerateMessageImageResult = {
  playthrough: Playthrough;
  image: MessageImage;
  /** What was actually sent, after prefixes and clamping. */
  promptUsed: string;
  negativeUsed: string;
};

/**
 * Live sampling progress for one connection, as `/api/images/progress` reports
 * it. Every number is optional: a job that has not reached sampling yet (and a
 * dialect that cannot report progress at all) sends none of them, so a readout
 * must render from whatever is present.
 */
export type ImageGenerationProgress = {
  /** False when nothing is running on that connection — the normal answer
   *  between generations, and never an error. */
  active: boolean;
  /** 0..1 across the whole request. */
  progress?: number;
  step?: number;
  steps?: number;
  etaSeconds?: number;
};

/**
 * Read the progress of the generation running on one connection. Safe to call
 * at any time: an idle connection answers `{active: false}`. Only the a1111
 * dialect publishes progress, so only its connections ever answer `active:
 * true` — the endpoint itself is dialect-agnostic.
 */
export function fetchImageProgress(
  connectionId: string,
  signal?: AbortSignal
): Promise<ImageGenerationProgress> {
  return request<ImageGenerationProgress>(
    `/api/images/progress?connectionId=${encodeURIComponent(connectionId)}`,
    { signal }
  );
}

/**
 * Dry run for the preview modal: runs the text→image-prompt side call only and
 * returns the composed prompt, generating nothing.
 */
export function previewImagePrompt(
  playthroughId: string,
  messageId: string,
  imageProviderId?: string,
  signal?: AbortSignal
): Promise<ImagePromptPreview> {
  return request<ImagePromptPreview>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/image/prompt`,
    {
      method: "POST",
      body: JSON.stringify(imageProviderId ? { imageProviderId } : {}),
      signal
    }
  );
}

/**
 * Generate one image for an assistant message and append it to the message.
 * With no overrides the server runs the text call itself (the Chat setting
 * "Review Image Prompt Before Generating" off) in a single request.
 */
export function generateMessageImage(
  playthroughId: string,
  messageId: string,
  opts: GenerateMessageImageOptions = {}
): Promise<GenerateMessageImageResult> {
  const body: Record<string, unknown> = {};
  if (opts.imageProviderId) body.imageProviderId = opts.imageProviderId;
  if (opts.promptOverride !== undefined) body.promptOverride = opts.promptOverride;
  if (opts.negativeOverride !== undefined) body.negativeOverride = opts.negativeOverride;
  if (opts.seed !== undefined) body.seed = opts.seed;

  return request<GenerateMessageImageResult>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/image`,
    {
      method: "POST",
      body: JSON.stringify(body),
      // Passed through as `init.signal`, exactly like `sendTurn`.
      signal: opts.signal
    }
  );
}

/** Drop one image reference from a message; the server sweeps the file when
 *  nothing else references it. */
export function deleteMessageImage(
  playthroughId: string,
  messageId: string,
  file: string
): Promise<{ playthrough: Playthrough }> {
  return request<{ playthrough: Playthrough }>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/images/${encodeURIComponent(file)}`,
    { method: "DELETE" }
  );
}
