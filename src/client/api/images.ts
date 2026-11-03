import { request } from "./client";
import type {
  CharacterPortrait,
  GalleryImage,
  ImageInstructionMode,
  MessageImage,
  Playthrough,
} from "../../schemas";

/** The persisted message attachment, straight from the schema (one source of
 *  truth shared with the server). */
export type { CharacterPortrait, GalleryImage, MessageImage };

/**
 * URL of the served bytes for a content-addressed image file
 * (`<sha256>.<ext>`, written under `data/images/`). The route is immutable, so
 * the browser can cache it forever and a branch that copies the reference does
 * not copy the bytes.
 */
export function buildImageUrl(file: string, playthroughId?: string): string {
  if (playthroughId) {
    return `/api/images/${file}?playthroughId=${encodeURIComponent(playthroughId)}`;
  }
  return `/api/images/${file}`;
}

export type ImagePromptPreview = {
  prompt: string;
  negativePrompt: string;
  /** How long the text provider took to write this prompt. The modal shows it,
   *  and the client hands it back on the generate request so the stored ref can
   *  report the text provider's half of the result. */
  promptDurationMs?: number;
  /** The model's own answer, BEFORE the preset prefix was composed onto it. The
   *  reviewed path runs no text call of its own, so the client echoes this back or
   *  the ref cannot record what the writer wrote — and the next image cannot use it
   *  as a reference. */
  writerPrompt?: string;
  writerNegative?: string;
  /** Raw request/response bodies of the prompt-writing side call, echoed back
   *  on the generate request so the stored ref can show the `prompt call`
   *  disclosure even when the prompt was written during the preview step. */
  promptRequest?: string;
  promptResponse?: string;
  /** What the prompt writer was actually given, for the modal's context line. */
  context?: { historyMessages: number; instructionMode: ImageInstructionMode };
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
  /** The dry run's measured text-provider time, echoed back so the stored ref
   *  can show it (this request runs no text call of its own). */
  promptDurationMs?: number;
  /** The dry run's copy of the writer's own answer, echoed back for the same
   *  reason — this request runs no text call, so the ref would otherwise lose it. */
  writerPrompt?: string;
  writerNegative?: string;
  /** The dry run's raw prompt-call request and response bodies, echoed back so
   *  the stored ref retains the `prompt call` disclosure on the reviewed path. */
  promptRequest?: string;
  promptResponse?: string;
  /** The RE-SEND path: a request body (from an existing image's `request`, or a
   *  hand-edited version of it) to send verbatim. The server then makes no text
   *  call and applies no clamping. Mutually exclusive with the overrides above —
   *  sending both is a 400. */
  rawRequest?: string;
  /** The image this generation replaces. The server drops that ref from the
   *  message in the same write that appends the new one, so a failed render
   *  changes nothing. */
  replaceFile?: string;
  signal?: AbortSignal;
};

export type GenerateMessageImageResult = {
  playthrough: Playthrough;
  image: MessageImage;
  /** What was actually sent, after prefixes and clamping. */
  promptUsed: string;
  negativeUsed: string;
  /** The text provider's measured time, when one ran (or was echoed back). */
  promptDurationMs?: number;
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
  signal?: AbortSignal,
): Promise<ImageGenerationProgress> {
  return request<ImageGenerationProgress>(
    `/api/images/progress?connectionId=${encodeURIComponent(connectionId)}`,
    { signal },
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
  signal?: AbortSignal,
): Promise<ImagePromptPreview> {
  return request<ImagePromptPreview>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/image/prompt`,
    {
      method: "POST",
      body: JSON.stringify(imageProviderId ? { imageProviderId } : {}),
      signal,
    },
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
  opts: GenerateMessageImageOptions = {},
): Promise<GenerateMessageImageResult> {
  const body: Record<string, unknown> = {};
  if (opts.imageProviderId) body.imageProviderId = opts.imageProviderId;
  if (opts.promptOverride !== undefined)
    body.promptOverride = opts.promptOverride;
  if (opts.negativeOverride !== undefined)
    body.negativeOverride = opts.negativeOverride;
  if (opts.seed !== undefined) body.seed = opts.seed;
  if (opts.promptDurationMs !== undefined)
    body.promptDurationMs = opts.promptDurationMs;
  if (opts.writerPrompt !== undefined) body.writerPrompt = opts.writerPrompt;
  if (opts.writerNegative !== undefined)
    body.writerNegative = opts.writerNegative;
  if (opts.promptRequest !== undefined)
    body.promptRequest = opts.promptRequest;
  if (opts.promptResponse !== undefined)
    body.promptResponse = opts.promptResponse;
  if (opts.rawRequest !== undefined) body.rawRequest = opts.rawRequest;
  if (opts.replaceFile !== undefined) body.replaceFile = opts.replaceFile;

  return request<GenerateMessageImageResult>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/image`,
    {
      method: "POST",
      body: JSON.stringify(body),
      // Passed through as `init.signal`, exactly like `sendTurn`.
      signal: opts.signal,
    },
  );
}

/** Replace one image's stored request body — the editor's Save. Nothing is
 *  rendered: the bytes, the image and the message are untouched, and the body is
 *  what a later re-send will post. */
export function saveMessageImageRequest(
  playthroughId: string,
  messageId: string,
  file: string,
  requestBody: string,
): Promise<{ playthrough: Playthrough }> {
  return request<{ playthrough: Playthrough }>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/images/${encodeURIComponent(file)}`,
    { method: "PATCH", body: JSON.stringify({ request: requestBody }) },
  );
}

/** Drop one image reference from a message; the server sweeps the file when
 *  nothing else references it. */
export function deleteMessageImage(
  playthroughId: string,
  messageId: string,
  file: string,
): Promise<{ playthrough: Playthrough }> {
  return request<{ playthrough: Playthrough }>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/images/${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );
}

/** Upload a custom image directly into a playthrough's gallery pool. */
export function uploadGalleryImage(
  playthroughId: string,
  payload: {
    dataBase64: string;
    fileName?: string;
    label?: string;
  },
): Promise<{ playthrough: Playthrough; image: GalleryImage }> {
  return request<{ playthrough: Playthrough; image: GalleryImage }>(
    `/api/playthroughs/${playthroughId}/gallery`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/** Delete an image from a playthrough's gallery AND detach it from any messages
 *  or cover reference in the playthrough, then sweep unreferenced bytes on disk. */
export function deleteGalleryImage(
  playthroughId: string,
  file: string,
): Promise<{ playthrough: Playthrough }> {
  return request<{ playthrough: Playthrough }>(
    `/api/playthroughs/${playthroughId}/gallery/${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );
}

export type AttachMessageImagePayload = {
  /** Existing playthrough/gallery image file hash ("<sha256>.<ext>"). */
  file?: string;
  /** Base64 bytes when uploading a new image file directly onto the message. */
  dataBase64?: string;
  fileName?: string;
  label?: string;
  /** Whether to also set the attached image as the playthrough's manual cover. */
  useAsCover?: boolean;
};

/** Attach an image (either an existing gallery/story file or a new upload) to
 *  any user or assistant message. */
export function attachMessageImage(
  playthroughId: string,
  messageId: string,
  payload: AttachMessageImagePayload,
): Promise<{ playthrough: Playthrough; image: MessageImage }> {
  return request<{ playthrough: Playthrough; image: MessageImage }>(
    `/api/playthroughs/${playthroughId}/messages/${messageId}/images/attach`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

export type GenerateCharacterPortraitOptions = GenerateMessageImageOptions & {
  note?: string;
  includeStoryContext?: boolean;
};

export type GenerateCharacterPortraitResult = {
  playthrough: Playthrough;
  portrait: CharacterPortrait;
  promptUsed: string;
  negativeUsed: string;
  promptDurationMs?: number;
};

/** Dry run for character portrait generation: runs the text→image-prompt side
 *  call for a solo chest-to-head portrait from the character's sheet. */
export function previewCharacterPortraitPrompt(
  playthroughId: string,
  characterId: string,
  options?: {
    imageProviderId?: string;
    note?: string;
    includeStoryContext?: boolean;
    signal?: AbortSignal;
  },
): Promise<ImagePromptPreview> {
  const body: Record<string, unknown> = {};
  if (options?.imageProviderId) body.imageProviderId = options.imageProviderId;
  if (options?.note !== undefined) body.note = options.note;
  if (options?.includeStoryContext !== undefined)
    body.includeStoryContext = options.includeStoryContext;

  return request<ImagePromptPreview>(
    `/api/playthroughs/${playthroughId}/characters/${characterId}/portrait/prompt`,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal: options?.signal,
    },
  );
}

/** Generate a solo character portrait (Medium Closeup / Chest to Head) and set
 *  it as the character's active playthrough portrait (`character.avatarFile`). */
export function generateCharacterPortrait(
  playthroughId: string,
  characterId: string,
  opts: GenerateCharacterPortraitOptions = {},
): Promise<GenerateCharacterPortraitResult> {
  const body: Record<string, unknown> = {};
  if (opts.imageProviderId) body.imageProviderId = opts.imageProviderId;
  if (opts.promptOverride !== undefined)
    body.promptOverride = opts.promptOverride;
  if (opts.negativeOverride !== undefined)
    body.negativeOverride = opts.negativeOverride;
  if (opts.seed !== undefined) body.seed = opts.seed;
  if (opts.promptDurationMs !== undefined)
    body.promptDurationMs = opts.promptDurationMs;
  if (opts.writerPrompt !== undefined) body.writerPrompt = opts.writerPrompt;
  if (opts.writerNegative !== undefined)
    body.writerNegative = opts.writerNegative;
  if (opts.promptRequest !== undefined)
    body.promptRequest = opts.promptRequest;
  if (opts.promptResponse !== undefined)
    body.promptResponse = opts.promptResponse;
  if (opts.rawRequest !== undefined) body.rawRequest = opts.rawRequest;
  if (opts.replaceFile !== undefined) body.replaceFile = opts.replaceFile;
  if (opts.note !== undefined) body.note = opts.note;
  if (opts.includeStoryContext !== undefined)
    body.includeStoryContext = opts.includeStoryContext;

  return request<GenerateCharacterPortraitResult>(
    `/api/playthroughs/${playthroughId}/characters/${characterId}/portrait/generate`,
    {
      method: "POST",
      body: JSON.stringify(body),
      signal: opts.signal,
    },
  );
}

/** Upload a custom portrait or select an existing portrait file as the
 *  character's active playthrough portrait (`character.avatarFile`). */
export function setOrUploadCharacterPortrait(
  playthroughId: string,
  characterId: string,
  payload: {
    file?: string;
    dataBase64?: string;
    fileName?: string;
    label?: string;
  },
): Promise<{ playthrough: Playthrough; portrait: CharacterPortrait }> {
  return request<{ playthrough: Playthrough; portrait: CharacterPortrait }>(
    `/api/playthroughs/${playthroughId}/characters/${characterId}/portrait`,
    {
      method: "POST",
      body: JSON.stringify(payload),
    },
  );
}

/** Delete a portrait from a character's portrait history (`character.avatars`),
 *  falling back `character.avatarFile` to the newest remaining portrait. */
export function deleteCharacterPortrait(
  playthroughId: string,
  characterId: string,
  file: string,
): Promise<{ playthrough: Playthrough }> {
  return request<{ playthrough: Playthrough }>(
    `/api/playthroughs/${playthroughId}/characters/${characterId}/portraits/${encodeURIComponent(file)}`,
    { method: "DELETE" },
  );
}
