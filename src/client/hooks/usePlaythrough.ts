import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ImageApiStyle, ImageInstructionMode, Playthrough } from "../../schemas";
import {
  deleteMessageImage,
  editMessage,
  fetchImageProgress,
  generateMessageImage,
  getContextUsage,
  getPlaythrough,
  listPlaythroughs,
  listProviderConnections,
  previewImagePrompt,
  questAction,
  resummarizeChapter,
  retryTurn,
  saveDraft,
  saveMessageImageRequest,
  sendTurn,
  truncatePlaythrough,
  branchPlaythrough,
  type ImageGenerationProgress,
  type QuestAction,
  type TokenUsage
} from "../api";
import { checkImageRequestBody, formatImageRequestBody } from "../utils/imageRequestBody";

const CHAT_SETTINGS_KEY = "bobbinloom_chat_settings";

const DRAFT_KEY_PREFIX = "bobbinloom_draft_";

/** Hidden continuation instruction: sent (with hideUserMessage) when the user
 *  hits Continue after a trailing user message, so the model replies to the
 *  player's last visible message without an empty bubble in the chat. */
const CONTINUE_INSTRUCTION =
  "Continue the story from the player's last message. Write the next scene as the " +
  "world and its characters; do not take actions on behalf of the player.";

/** One generated image queued for removal: the thumbnail's X sets it, PlayView's
 *  ConfirmModal renders it, `confirmDeleteImage` consumes it. `prompt` is only the
 *  preview's alt text — the content-addressed file name is the identity. */
export type DeleteImageTarget = { messageId: string; file: string; prompt: string };

function draftKey(playthroughId: string): string {
  return `${DRAFT_KEY_PREFIX}${playthroughId}`;
}

/** In-chat failure notice shown when a send or retry fails (non-abort).
 *  The failed message is restored to the input box, so "retry" is just
 *  pressing Send again — the notice carries the reason and raw error. */
export type FailedResponseNotice = {
  message: string;
  rawError?: string;
  durationMs?: number;
};

type ChatSettings = {
  choicesEnabled: boolean;
  showDebug: boolean;
  showContextUsage: boolean;
  showGenerationTime: boolean;
  showMessageTimestamps: boolean;
  showModelName: boolean;
  imagePromptPreview: boolean;
  /** Generate an image for every completed turn without pressing the button.
   *  OFF by default: it costs a text call plus a render per turn, and a local
   *  render runs for minutes. */
  autoImageAfterTurn: boolean;
  /** Skip the confirmation when re-sending an image's request body. OFF by
   *  default: a re-send is the one image action that destroys the image it came
   *  from, so it asks first until the user says otherwise. */
  alwaysDiscardOldImage: boolean;
};

/** Overrides the preview modal posts back. When BOTH prompt fields are present
 *  the server skips the text call, so the reviewed text is what the image
 *  provider receives and the text model is not paid for twice. */
export type ImageGenerationOverrides = {
  promptOverride?: string;
  negativeOverride?: string;
  imageProviderId?: string;
  /** The RE-SEND path: a request body to send verbatim. The server runs no text
   *  call and applies no clamping, and the body's own fields (model, seed, size,
   *  the checkpoint) are what the provider gets — the connection supplies only
   *  where and how to send it. Mutually exclusive with the overrides above.
   *  See `routes/images.ts` and the adapters' `rawBody`. */
  rawRequest?: string;
  /** The image this generation replaces: dropped from the message in the same
   *  write that appends the new one, so a failed render changes nothing. */
  replaceFile?: string;
};

/** One generated image queued for a re-send: the Retry control sets it, PlayView's
 *  ConfirmModal asks the question, `confirmImageRetry` consumes it. The body is
 *  the stored `request` — the Retry button never edits, which is the whole
 *  difference between it and the editor. */
export type RetryImageTarget = {
  message: ChatMessage;
  file: string;
  body: string;
  /** The image's own prompt, for the confirmation's alt text. */
  prompt: string;
};

/** The request-body editor's open state: WHICH image, and the stored body to
 *  seed it with. The editable draft itself lives in the modal (exactly like the
 *  review modal's prompt text), and the modal stays mounted behind the
 *  confirmation that follows a Send — so cancelling a re-send returns to the
 *  edited text rather than re-seeding it from the stored body. */
export type ImageRequestEditorState = {
  message: ChatMessage;
  file: string;
  /** The stored `request`, pretty-printed — the seed, and what Reset restores. */
  body: string;
  /** The connection the re-send will use — the one this image was made with, not
   *  the active one — reduced to what the editor's caption needs. Null when that
   *  connection no longer exists. */
  connection: { label: string; model: string; apiStyle: ImageApiStyle } | null;
};

/** The generated prompt awaiting review in the modal. The message is carried
 *  along so the modal's Generate button can re-enter `handleGenerateImage`
 *  without the component having to look the message up again. */
export type ImagePromptRequest = {
  message: ChatMessage;
  prompt: string;
  negativePrompt: string;
  /** The text provider's measured time for THIS draft — shown live in the modal
   *  and handed back on the generate request so the ref can report it. */
  promptDurationMs?: number;
  /** The model's own answer for THIS draft. Echoed back on the reviewed path,
   *  where the generate request makes no text call of its own. */
  writerPrompt?: string;
  writerNegative?: string;
  /** What the writer was given for THIS draft (history window + perspective),
   *  straight from the dry run's own report. */
  context?: { historyMessages: number; instructionMode: ImageInstructionMode };
  /** Advisory notes from the prompt-writing call, straight from the dry run —
   *  a suspected refusal used verbatim, or JSON with no usable key. Shown in
   *  the modal above the editable prompt; never blocking. */
  warnings?: string[];
  /** Dialect of the connection that will render this prompt, resolved when the
   *  preview was requested. Drives the modal's a1111-only chunk estimate;
   *  absent (a failed registry read) simply shows no estimate. */
  apiStyle?: ImageApiStyle;
};

/** The connection an image request will actually use, reduced to what the
 *  client needs to know about it: which id to poll for progress, whether the
 *  dialect reports progress at all, and how to label it in the re-send editor. */
export type ResolvedImageConnection = {
  id: string;
  label: string;
  model: string;
  apiStyle: ImageApiStyle;
};

/** Milliseconds between progress reads while an a1111 generation renders. */
const IMAGE_PROGRESS_POLL_MS = 700;

/**
 * Which image connection a request will use — the same rule as the server's
 * `activeConnectionOfKind`, so the client polls the connection the server
 * actually published progress for: the explicit override, else the active
 * image slot, else the first image connection.
 *
 * Never throws: a failed registry read means "unknown dialect", which costs the
 * dialect-specific extras (the estimate and the progress poll) and nothing else.
 */
async function resolveImageConnection(overrideId?: string): Promise<ResolvedImageConnection | null> {
  try {
    const registry = await listProviderConnections();
    const imageConnections = registry.connections.filter((c) => c.kind === "image");
    const active =
      (overrideId ? imageConnections.find((c) => c.id === overrideId) : undefined) ??
      imageConnections.find((c) => c.id === registry.activeImageProviderId) ??
      imageConnections[0] ??
      null;
    return active ? toResolvedImageConnection(active) : null;
  } catch {
    return null;
  }
}

function toResolvedImageConnection(connection: {
  id: string;
  label: string;
  model: string;
  apiStyle?: ImageApiStyle;
}): ResolvedImageConnection {
  return {
    id: connection.id,
    label: connection.label,
    model: connection.model,
    apiStyle: connection.apiStyle ?? "openai"
  };
}

/**
 * The connection one GENERATED image's stored body belongs to — deliberately
 * WITHOUT the active-connection fallback `resolveImageConnection` has.
 *
 * A stored body was composed for one dialect and one endpoint, so "the
 * connection this image was made with is gone" is a fact the user needs to see;
 * answering with whichever connection happens to be active now would aim an
 * a1111 body at a Venice endpoint (or the reverse) and quietly render something
 * nobody composed. The server refuses that case too — this is the pre-check that
 * lets the editor say so before a request is made.
 *
 * A ref that recorded no `providerId` at all is the one exception: there is no
 * owner to miss, and the active connection is the only reading the server has
 * either.
 */
async function resolveImageOwner(providerId: string | undefined): Promise<ResolvedImageConnection | null> {
  if (!providerId) return resolveImageConnection();
  try {
    const registry = await listProviderConnections();
    const owner = registry.connections.find((c) => c.id === providerId && c.kind === "image");
    return owner ? toResolvedImageConnection(owner) : null;
  } catch {
    return null;
  }
}

function loadChatSettings(): ChatSettings {
  try {
    const raw = localStorage.getItem(CHAT_SETTINGS_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      return {
        choicesEnabled: typeof parsed.choicesEnabled === "boolean" ? parsed.choicesEnabled : true,
        showDebug: typeof parsed.showDebug === "boolean" ? parsed.showDebug : true,
        showContextUsage: typeof parsed.showContextUsage === "boolean" ? parsed.showContextUsage : true,
        showGenerationTime: typeof parsed.showGenerationTime === "boolean" ? parsed.showGenerationTime : true,
        showMessageTimestamps: typeof parsed.showMessageTimestamps === "boolean" ? parsed.showMessageTimestamps : true,
        showModelName: typeof parsed.showModelName === "boolean" ? parsed.showModelName : true,
        imagePromptPreview: typeof parsed.imagePromptPreview === "boolean" ? parsed.imagePromptPreview : true,
        autoImageAfterTurn: typeof parsed.autoImageAfterTurn === "boolean" ? parsed.autoImageAfterTurn : false,
        alwaysDiscardOldImage:
          typeof parsed.alwaysDiscardOldImage === "boolean" ? parsed.alwaysDiscardOldImage : false,
      };
    }
  } catch {}
  return {
    choicesEnabled: true,
    showDebug: true,
    showContextUsage: true,
    showGenerationTime: true,
    showMessageTimestamps: true,
    showModelName: true,
    imagePromptPreview: true,
    autoImageAfterTurn: false,
    alwaysDiscardOldImage: false,
  };
}

function saveChatSettings(settings: ChatSettings) {
  try {
    localStorage.setItem(CHAT_SETTINGS_KEY, JSON.stringify(settings));
  } catch {}
}

function readLocalDraft(playthroughId: string): { text: string; at: number } | null {
  try {
    const raw = localStorage.getItem(draftKey(playthroughId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { text?: unknown; at?: unknown };
    if (typeof parsed.text !== "string" || typeof parsed.at !== "number") return null;
    return { text: parsed.text, at: parsed.at };
  } catch {
    return null;
  }
}

/** Persists the draft to both copies: localStorage (immediate) and the server
 *  record (fire-and-forget; failures are fine — the local copy covers). */
async function persistDraft(playthroughId: string, text: string): Promise<void> {
  try {
    if (text) {
      localStorage.setItem(draftKey(playthroughId), JSON.stringify({ text, at: Date.now() }));
    } else {
      localStorage.removeItem(draftKey(playthroughId));
    }
  } catch {}
  try {
    await saveDraft(playthroughId, text);
  } catch {
    /* server copy optional — local copy survives */
  }
}

/** Newer-wins resolution between the local and server draft copies. */
function resolveDraft(playthrough: Playthrough | null): { text: string; localWins: boolean } {
  if (!playthrough) return { text: "", localWins: false };
  const local = readLocalDraft(playthrough.id);
  const serverText = playthrough.draft ?? "";
  const serverAt = playthrough.draftUpdatedAt ? new Date(playthrough.draftUpdatedAt).getTime() : 0;
  if (local) {
    return local.at > serverAt
      ? { text: local.text, localWins: true }
      : { text: serverText, localWins: false };
  }
  return { text: serverText, localWins: false };
}

export function usePlaythrough() {
  const [playthrough, setPlaythrough] = useState<Playthrough | null>(null);
  const [input, setInput] = useState("");
  const [chatSettings, setChatSettingsState] = useState<ChatSettings>(loadChatSettings);

  const choicesEnabled = chatSettings.choicesEnabled;
  const showDebug = chatSettings.showDebug;
  const showContextUsage = chatSettings.showContextUsage;
  const showGenerationTime = chatSettings.showGenerationTime;
  const showMessageTimestamps = chatSettings.showMessageTimestamps;
  const showModelName = chatSettings.showModelName;
  const imagePromptPreview = chatSettings.imagePromptPreview;
  const autoImageAfterTurn = chatSettings.autoImageAfterTurn;
  const alwaysDiscardOldImage = chatSettings.alwaysDiscardOldImage;

  const setChoicesEnabled = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, choicesEnabled: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setAutoImageAfterTurn = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, autoImageAfterTurn: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setShowDebug = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, showDebug: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setShowContextUsage = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, showContextUsage: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setShowGenerationTime = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, showGenerationTime: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setShowMessageTimestamps = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, showMessageTimestamps: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setShowModelName = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, showModelName: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setImagePromptPreview = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, imagePromptPreview: val };
      saveChatSettings(next);
      return next;
    });
  };

  const setAlwaysDiscardOldImage = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, alwaysDiscardOldImage: val };
      saveChatSettings(next);
      return next;
    });
  };
  const [choices, setChoices] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastPatchInfo, setLastPatchInfo] = useState<{ applied: string[]; rejected: string[]; warnings: string[] }>({
    applied: [],
    rejected: [],
    warnings: []
  });
  const [sendingMessage, setSendingMessage] = useState<string | null>(null);
  const [cancelledNotice, setCancelledNotice] = useState<string | null>(null);
  const [failedNotice, setFailedNotice] = useState<FailedResponseNotice | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // ── Generated images (per message) ──
  // One message at a time: the id of the message whose image (or whose prompt)
  // is in flight drives the ChatPanel footer, and one abort ref covers both
  // requests, so "Cancel" always kills whichever call is running.
  const [imageGeneratingId, setImageGeneratingId] = useState<string | null>(null);
  /** When each in-flight phase began, for the live counters. Set ONCE per phase
   *  and never derived from the ids beside them: `imageProgress` lands every
   *  700ms (and the prompt/response state flips more often than that), so a
   *  derived clock would restart on every update. */
  const [imagePromptStartedAt, setImagePromptStartedAt] = useState<number | null>(null);
  const [imageGeneratingStartedAt, setImageGeneratingStartedAt] = useState<number | null>(null);
  const [imagePreviewMessageId, setImagePreviewMessageId] = useState<string | null>(null);
  const [imageDeletingId, setImageDeletingId] = useState<string | null>(null);
  const [imagePromptRequest, setImagePromptRequest] = useState<ImagePromptRequest | null>(null);
  const imageAbortRef = useRef<AbortController | null>(null);
  // Live sampling progress while an a1111 generation renders. `null` reads as
  // "nothing to show" — only a dialect that can report progress ever fills it.
  const [imageProgress, setImageProgress] = useState<ImageGenerationProgress | null>(null);
  const imageProgressStopRef = useRef<(() => void) | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [rawInput, setRawInput] = useState<string | null>(null);
  const [rawOutput, setRawOutput] = useState<string | null>(null);

  const [editingMessageId, setEditingMessageId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [retryTarget, setRetryTarget] = useState<ChatMessage | null>(null);
  const [truncateTarget, setTruncateTarget] = useState<ChatMessage | null>(null);
  const [branchTarget, setBranchTarget] = useState<ChatMessage | null>(null);
  const [deleteImageTarget, setDeleteImageTarget] = useState<DeleteImageTarget | null>(null);
  // The re-send path: the image queued for replacement, and the body editor when
  // it is open. Both live here rather than in the components for the same reason
  // the review modal's text lives in the hook — so a re-render, or a confirmation
  // opening on top, never loses what the user typed.
  const [retryImageTarget, setRetryImageTarget] = useState<RetryImageTarget | null>(null);
  const [imageRequestEditor, setImageRequestEditor] = useState<ImageRequestEditorState | null>(null);
  /** The editor's Save is in flight. Its own flag, not the generation one: a save
   *  renders nothing, so there is no message phase to hang it off. */
  const [imageSaving, setImageSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [resummarizingChapterId, setResummarizingChapterId] = useState<string | null>(null);
  const [viewingChapterId, setViewingChapterId] = useState<string | null>(null);

  const activePlaythroughId = playthrough?.id ?? null;
  useEffect(() => {
    if (!activePlaythroughId) return;
    getContextUsage(activePlaythroughId, choicesEnabled)
      .then(setTokenUsage)
      .catch(() => { /* meter keeps last known value on failure */ });
  }, [activePlaythroughId, choicesEnabled]);

  // ── Per-playthrough input draft ──
  // Debounced persist while typing (skipped while a turn is in flight, so the
  // transiently-cleared input during a send never wipes the draft; success
  // clears it explicitly, failure restores it and re-saves).
  useEffect(() => {
    if (!activePlaythroughId || loading) return;
    const timer = window.setTimeout(() => {
      void persistDraft(activePlaythroughId, input);
    }, 300);
    return () => window.clearTimeout(timer);
  }, [input, activePlaythroughId, loading]);

  /** True when the last visible message is a user message — the input box is
   *  "awaiting the AI's response", so an empty input may Continue instead of
   *  being disabled. */
  const canContinue = (() => {
    if (!playthrough) return false;
    for (let i = playthrough.messages.length - 1; i >= 0; i -= 1) {
      const message = playthrough.messages[i];
      if (!message.hidden) return message.role === "user";
    }
    return false;
  })();

  async function loadPlaythrough(id: string) {
    try {
      const found = await getPlaythrough(id);
      if (found) {
        const oldId = playthrough?.id ?? null;
        if (oldId && oldId !== found.id) void persistDraft(oldId, input);
        setPlaythrough(found);
        setChoices([]);
        // Patch feedback is never re-injected into the prompt (stateless by design),
        // so the Debug panel is the only view of it. Seeding from the newest message
        // that recorded one keeps the last turn's applied/rejected lists visible
        // across a reload instead of silently showing an empty panel.
        const lastPatched = [...(found.messages ?? [])].reverse()
          .find((m) => m.role === "assistant" && m.patchInfo);
        setLastPatchInfo(lastPatched?.patchInfo ?? { applied: [], rejected: [], warnings: [] });
        setRawInput(null);
        setRawOutput(null);
        setCancelledNotice(null);
        setFailedNotice(null);
        // A prompt modal belongs to the playthrough it was opened from.
        setImagePromptRequest(null);
        const { text, localWins } = resolveDraft(found);
        setInput(text);
        if (localWins && text && text !== found.draft) void persistDraft(found.id, text);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSend() {
    if (!playthrough || loading) return;
    const isContinue = canContinue && !input.trim();
    if (!input.trim() && !isContinue) return;
    // Continue sends a hidden instruction so the model replies to the player's
    // last visible message; nothing is shown as a user bubble.
    const currentInput = input.trim() ? input : CONTINUE_INSTRUCTION;
    setInput("");
    setSendingMessage(input.trim() ? currentInput : null);
    setLoading(true);
    setError(null);
    setCancelledNotice(null);
    setFailedNotice(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startTime = performance.now();

    try {
      const response = await sendTurn(
        playthrough.id,
        currentInput,
        choicesEnabled,
        controller.signal,
        isContinue ? { hideUserMessage: true } : undefined
      );
      setPlaythrough(response.state);
      setChoices(response.choices ?? []);
      setLastPatchInfo({ applied: response.applied, rejected: response.rejected, warnings: response.warnings });
      setTokenUsage(response.tokenUsage ?? null);
      setRawInput(response.rawInput ?? null);
      setRawOutput(response.rawOutput ?? null);
      if (!isContinue) void persistDraft(playthrough.id, "");
      // Continuations included; chapter openings are excluded in the guard.
      void maybeAutoGenerateImage(response.state.messages[response.state.messages.length - 1]);
    } catch (e) {
      const durationMs = Math.round(performance.now() - startTime);
      if (!isContinue) setInput(currentInput);
      if (e instanceof DOMException && e.name === "AbortError") {
        setCancelledNotice(isContinue ? "Response cancelled." : "Response cancelled — message restored to input.");
        setFailedNotice(null);
      } else {
        const rawErr = e instanceof Error ? e.message : String(e);
        setFailedNotice({
          message: isContinue
            ? "Continue failed — nothing was sent."
            : "Generation failed — your message was restored to the input box.",
          rawError: rawErr,
          durationMs
        });
      }
    } finally {
      setLoading(false);
      setSendingMessage(null);
      abortControllerRef.current = null;
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  /** Every image-path failure goes through the same in-page failed notice the
   *  send path uses (raw error included) and changes nothing on the record. */
  function reportImageFailure(e: unknown, startTime: number, message: string) {
    setFailedNotice({
      message,
      rawError: e instanceof Error ? e.message : String(e),
      durationMs: Math.round(performance.now() - startTime)
    });
  }

  /** True when both reviewed fields are present, i.e. the server will skip the
   *  text call and use the user's text verbatim (modulo prefix + clamping). */
  function hasPromptOverrides(overrides?: ImageGenerationOverrides): boolean {
    return overrides?.promptOverride !== undefined && overrides?.negativeOverride !== undefined;
  }

  /** True when the request re-sends a stored body. Not a review caller either —
   *  the body was written (and reviewed) when the image was made, so neither the
   *  text model nor the review modal has anything to add. */
  function hasRawRequest(overrides?: ImageGenerationOverrides): boolean {
    return overrides?.rawRequest !== undefined;
  }

  /**
   * Generate one image for an assistant message — one entry point, four paths:
   *  - preview ON (the default) with no overrides: run the text call only and
   *    hand the composed prompt to the modal. Nothing is generated yet.
   *  - preview ON with BOTH overrides (the modal's Generate button): the server
   *    skips the text call, so no second token spend and the user's edits are
   *    what reaches the image provider.
   *  - preview OFF: a single request, no modal, no overrides.
   *  - a RE-SEND (`rawRequest`, with or without preview): a stored body goes
   *    straight to the image provider, and `replaceFile` drops the image it
   *    replaces in the same write. Free of the review modal on purpose — the
   *    body IS the reviewed text, and the editor that can change it is its own
   *    surface (see `openImageRequestEditor`).
   */
  async function handleGenerateImage(message: ChatMessage, overrides?: ImageGenerationOverrides) {
    // The abort ref is part of the guard, not just the state: the registry read
    // below happens BEFORE either in-flight marker is set, so state alone would
    // let a double-click start two generations.
    if (!playthrough || imageGeneratingId || imagePreviewMessageId || imageAbortRef.current) return;
    const reviewing = imagePromptPreview && !hasPromptOverrides(overrides) && !hasRawRequest(overrides);
    // Accepting the review modal hands the prompt straight to the renderer, and
    // the message itself already shows the progress bar and the Cancel control —
    // so the modal has nothing left to say and closes now, rather than sitting
    // there until the render finishes. (The modal's own close ABORTS a preview;
    // this path must not touch the abort ref: the render is the point. Same for
    // a re-send, which can only start from behind the editor.)
    if (hasPromptOverrides(overrides) || hasRawRequest(overrides)) setImagePromptRequest(null);
    setCancelledNotice(null);
    setFailedNotice(null);

    const controller = new AbortController();
    imageAbortRef.current = controller;
    const startTime = performance.now();

    // Which dialect will render this, read BEFORE the request goes out: the
    // modal labels the estimate with it and the progress poller needs the id.
    // One registry read per generation, and a failure here costs only the
    // dialect-specific extras — never the generation.
    const connection = await resolveImageConnection(overrides?.imageProviderId);
    if (controller.signal.aborted) {
      // Cancelled during that read: leave no in-flight marker behind, or every
      // later Generate press would be swallowed by the guard above.
      imageAbortRef.current = null;
      return;
    }

    if (reviewing) {
      setImagePreviewMessageId(message.id);
      setImagePromptStartedAt(performance.now());
      try {
        const preview = await previewImagePrompt(playthrough.id, message.id, overrides?.imageProviderId, controller.signal);
        // A preview the user cancelled must not pop the modal open again.
        if (controller.signal.aborted) return;
        setImagePromptRequest({
          message,
          prompt: preview.prompt,
          negativePrompt: preview.negativePrompt,
          warnings: preview.warnings,
          apiStyle: connection?.apiStyle,
          promptDurationMs: preview.promptDurationMs,
          writerPrompt: preview.writerPrompt,
          writerNegative: preview.writerNegative,
          context: preview.context
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setCancelledNotice("Image prompt cancelled.");
        } else {
          reportImageFailure(e, startTime, "Image generation failed — nothing was changed.");
        }
      } finally {
        setImagePreviewMessageId(null);
        setImagePromptStartedAt(null);
        imageAbortRef.current = null;
      }
      return;
    }

    setImageGeneratingId(message.id);
    setImageGeneratingStartedAt(performance.now());
    // Live progress is a1111-only: this is a no-op for every other dialect.
    startImageProgress(connection, controller.signal);
    try {
      const res = await generateMessageImage(playthrough.id, message.id, {
        ...overrides,
        // The reviewed path: the prompt was written by the dry run, so THIS
        // request makes no text call and can measure nothing — hand the number
        // the modal already showed back so the stored ref can report it.
        promptDurationMs: overrides && imagePromptRequest?.message.id === message.id
          ? imagePromptRequest.promptDurationMs
          : undefined,
        // The writer's own answer, echoed for the same reason as the measured time:
        // this request makes no text call, so it can only come from the dry run that
        // wrote it — and without it the ref cannot serve as a later reference.
        writerPrompt: overrides && imagePromptRequest?.message.id === message.id
          ? imagePromptRequest.writerPrompt
          : undefined,
        writerNegative: overrides && imagePromptRequest?.message.id === message.id
          ? imagePromptRequest.writerNegative
          : undefined,
        signal: controller.signal
      });
      // The response carries the authoritative record — set it exactly like
      // `handleSend` does with `response.state`.
      setPlaythrough(res.playthrough);
      setImagePromptRequest(null);
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setCancelledNotice("Image generation cancelled.");
      } else {
        reportImageFailure(e, startTime, "Image generation failed — nothing was changed.");
      }
    } finally {
      // Settled — success, failure or cancel — so the readout goes with it.
      stopImageProgress();
      setImageGeneratingId(null);
      setImageGeneratingStartedAt(null);
      imageAbortRef.current = null;
    }
  }

  /**
   * Opt-in auto-image: fire the image flow for the answer a turn just produced.
   *
   * Silent by construction — this runs after EVERY turn, so anything it cannot
   * do it must skip without a word. A missing image connection is the common
   * case (the user has no image provider configured), and reporting it would
   * spray a failure notice after every single turn; the manual Generate button
   * still reports it, which is where the user is actually looking.
   *
   * Review ON still wins: this is the ordinary entry point, so the review modal
   * appears for confirmation exactly as it does for a manual press.
   */
  async function maybeAutoGenerateImage(message: ChatMessage | undefined) {
    if (!autoImageAfterTurn || !playthrough) return;
    if (!message || message.role !== "assistant" || message.chapterOpening) return;
    // Already has an image (a re-run, a branch copy) — one answer, one image.
    if (message.images?.length) return;
    // Never fight a manual press or another phase.
    if (imageGeneratingId || imagePreviewMessageId || imageDeletingId || imageAbortRef.current) return;
    // Resolved before anything is touched: no state, no notice, no marker.
    if (!(await resolveImageConnection())) return;
    await handleGenerateImage(message);
  }

  function handleCancelImage() {
    imageAbortRef.current?.abort();
  }

  /** Tear the progress loop down and forget its last readout. Idempotent, and
   *  called on every path out of a generation (success, failure, cancel). */
  function stopImageProgress() {
    imageProgressStopRef.current?.();
    imageProgressStopRef.current = null;
    setImageProgress(null);
  }

  /**
   * Poll the server's live-progress endpoint for `connection` until
   * `stopImageProgress`.
   *
   * Only the a1111 dialect reports progress, so every other dialect (and an
   * unresolved connection) starts nothing at all.
   *
   * Best-effort by construction: a failed read is swallowed — it can never
   * disturb the generation — and the loop re-reads only while it has not been
   * stopped, so a response that lands after the generation settled cannot
   * resurrect a stale readout. `signal` is the generation's own: cancelling the
   * generation also cancels the progress read in flight.
   */
  function startImageProgress(connection: ResolvedImageConnection | null, signal?: AbortSignal) {
    stopImageProgress();
    if (connection?.apiStyle !== "a1111") return;
    const connectionId = connection.id;
    let stopped = false;
    let timer: number | null = null;

    const tick = async () => {
      try {
        const snapshot = await fetchImageProgress(connectionId, signal);
        if (stopped) return;
        setImageProgress(snapshot.active ? snapshot : null);
      } catch {
        /* a failed (or aborted) progress read is not a generation failure — keep
           the last readout and try again on the next tick */
        if (stopped || signal?.aborted) return;
      }
      if (stopped) return;
      timer = window.setTimeout(() => { void tick(); }, IMAGE_PROGRESS_POLL_MS);
    };

    imageProgressStopRef.current = () => {
      stopped = true;
      if (timer !== null) window.clearTimeout(timer);
      timer = null;
    };
    void tick();
  }

  /** Cancel/close the prompt modal. Closing mid-flight aborts the text call, so
   *  the per-message spinner can never be left stuck — the hook owns the
   *  in-flight state, the modal only owns the prompt text. */
  function closeImagePrompt() {
    setImagePromptRequest(null);
    if (imagePreviewMessageId) imageAbortRef.current?.abort();
  }

  /** Fresh draft from the text model without leaving the modal. */
  async function rerunImagePrompt() {
    const request = imagePromptRequest;
    if (!playthrough || !request || imageGeneratingId || imagePreviewMessageId) return;
    const controller = new AbortController();
    imageAbortRef.current = controller;
    setImagePreviewMessageId(request.message.id);
    setImagePromptStartedAt(performance.now());
    setCancelledNotice(null);
    setFailedNotice(null);
    const startTime = performance.now();
    try {
      const preview = await previewImagePrompt(playthrough.id, request.message.id, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setImagePromptRequest({ ...request, prompt: preview.prompt, negativePrompt: preview.negativePrompt, warnings: preview.warnings, promptDurationMs: preview.promptDurationMs, writerPrompt: preview.writerPrompt, writerNegative: preview.writerNegative, context: preview.context });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setCancelledNotice("Image prompt cancelled.");
      } else {
        reportImageFailure(e, startTime, "Image generation failed — nothing was changed.");
      }
    } finally {
      setImagePreviewMessageId(null);
      setImagePromptStartedAt(null);
      imageAbortRef.current = null;
    }
  }

  /**
   * Ask to drop one generated image from a message. Nothing is sent yet — this only
   * queues the target, and PlayView's ConfirmModal asks the question (the same
   * retry/truncate shape). The server sweeps the file when nothing else references
   * those bytes, so the confirmation is worded to cover both cases rather than
   * trying to count references on the client.
   */
  function requestDeleteImage(message: ChatMessage, file: string) {
    if (!playthrough || imageGeneratingId || imagePreviewMessageId || imageDeletingId) return;
    const image = (message.images ?? []).find((i) => i.file === file);
    setDeleteImageTarget({ messageId: message.id, file, prompt: image?.prompt ?? "" });
  }

  /** The confirmed half of `requestDeleteImage`: the body the X button used to run
   *  inline behind `window.confirm`. The modal closes on success AND on failure —
   *  a failed removal surfaces through the usual in-chat failure notice. */
  async function confirmDeleteImage() {
    const target = deleteImageTarget;
    if (!playthrough || !target || imageDeletingId) return;
    setCancelledNotice(null);
    setFailedNotice(null);
    setImageDeletingId(target.messageId);
    const startTime = performance.now();
    try {
      const res = await deleteMessageImage(playthrough.id, target.messageId, target.file);
      setPlaythrough(res.playthrough);
      setDeleteImageTarget(null);
    } catch (e) {
      setDeleteImageTarget(null);
      reportImageFailure(e, startTime, "Removing the image failed — nothing was changed.");
    } finally {
      setImageDeletingId(null);
    }
  }

  /** True while ANY image request is in flight for this playthrough — one
   *  generation at a time, and a re-send also waits for a removal in flight. */
  function imageActionBusy(): boolean {
    return Boolean(imageGeneratingId || imagePreviewMessageId || imageDeletingId || imageAbortRef.current);
  }

  /**
   * Re-send one image's own request body, unchanged. Nothing is sent yet: this
   * queues the target and PlayView's ConfirmModal asks the question, because the
   * render REPLACES the image it came from. With "Always discard old image"
   * on (Settings → Chat → Image Generation) the question is skipped — that is
   * the whole point of the setting.
   */
  function requestImageRetry(message: ChatMessage, file: string) {
    if (!playthrough || imageActionBusy()) return;
    const image = (message.images ?? []).find((i) => i.file === file);
    // No stored body: an image generated before the field existed has nothing to
    // re-send (and the chat renders no Retry control for it either).
    if (!image?.request) return;
    if (alwaysDiscardOldImage) {
      void runImageRetry(message, image.file, image.request);
      return;
    }
    setRetryImageTarget({ message, file: image.file, body: image.request, prompt: image.prompt ?? "" });
  }

  /** The confirmed half of `requestImageRetry`. `discardAlways` is the
   *  confirmation's own checkbox: ticking it turns the setting on for good,
   *  leaving it unticked leaves the setting exactly as it was. */
  async function confirmImageRetry(discardAlways: boolean) {
    const target = retryImageTarget;
    setRetryImageTarget(null);
    if (!target) return;
    if (discardAlways) setAlwaysDiscardOldImage(true);
    await runImageRetry(target.message, target.file, target.body);
  }

  /** Drop the queued re-send without rendering anything. */
  function cancelImageRetry() {
    setRetryImageTarget(null);
  }

  /**
   * Show the editor for one image's request body. The draft is the stored
   * `request`, pretty-printed (via `formatImageRequestBody`, which hands an
   * unparseable body back untouched rather than reformatting it away).
   *
   * The connection resolved here is the one the image was MADE with, not the
   * active one: the body was composed for that dialect and endpoint. It comes
   * back null when that connection has since been deleted, and the editor says
   * so — the server refuses that re-send rather than aiming the body at whatever
   * connection is active now.
   */
  async function openImageRequestEditor(message: ChatMessage, file: string) {
    if (!playthrough || imageActionBusy()) return;
    const image = (message.images ?? []).find((i) => i.file === file);
    if (!image?.request) return;
    const connection = await resolveImageOwner(image.providerId);
    setImageRequestEditor({
      message,
      file: image.file,
      body: formatImageRequestBody(image.request),
      connection: connection
        ? { label: connection.label, model: connection.model, apiStyle: connection.apiStyle }
        : null
    });
  }

  function closeImageRequestEditor() {
    setImageRequestEditor(null);
  }

  /**
   * Send a body to the image provider, replacing the image it came from. The
   * render itself is the ORDINARY generate path (`handleGenerateImage` with the
   * raw override), so the in-flight status, the elapsed clock, the a1111
   * progress readout, Cancel and the failure notice all come from the code that
   * already owns them.
   */
  async function runImageRetry(message: ChatMessage, file: string, body: string) {
    const image = (message.images ?? []).find((i) => i.file === file);
    await handleGenerateImage(message, {
      rawRequest: body,
      replaceFile: file,
      // The image's OWN connection. A body carries a dialect's fields, so the
      // server reports a missing owner instead of re-aiming it.
      imageProviderId: image?.providerId || undefined
    });
  }

  /**
   * The editor's Save. The body is checked HERE, with the same rule the server
   * enforces, so a hand-edit that breaks the JSON is caught without a round trip
   * — and the editor keeps the text either way.
   *
   * Nothing is rendered and nothing is replaced: the image, its bytes and the
   * message are all untouched, and `prompt` / `negativePrompt` keep describing
   * the image that is on screen. The saved body becomes what the next Retry
   * sends. On success the editor closes (the reason to be there is spent); on
   * failure it stays open with the text intact and the reason returned to it,
   * because the in-chat notice sits behind the modal where the user cannot see
   * it.
   */
  async function saveImageRequestBody(body: string): Promise<string | null> {
    const editor = imageRequestEditor;
    if (!editor || !playthrough || imageActionBusy()) return null;
    const check = checkImageRequestBody(body);
    if (!check.ok) return check.error;
    setImageSaving(true);
    setCancelledNotice(null);
    setFailedNotice(null);
    try {
      // Serialized from the parsed object, exactly like every other request
      // stored on a ref, so the saved value has ONE shape on disk.
      const res = await saveMessageImageRequest(
        playthrough.id,
        editor.message.id,
        editor.file,
        JSON.stringify(check.value)
      );
      setPlaythrough(res.playthrough);
      setImageRequestEditor(null);
      return null;
    } catch (error) {
      return error instanceof Error ? error.message : String(error);
    } finally {
      setImageSaving(false);
    }
  }

  function startEdit(message: ChatMessage) {
    setEditingMessageId(message.id);
    setEditDraft(message.content);
  }

  function cancelEdit() {
    setEditingMessageId(null);
    setEditDraft("");
  }

  async function saveEdit() {
    if (!playthrough || !editingMessageId || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const updated = await editMessage(playthrough.id, editingMessageId, editDraft);
      setPlaythrough(updated);
      cancelEdit();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmRetry() {
    if (!playthrough || !retryTarget || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setFailedNotice(null);
    setCancelledNotice(null);
    const startTime = performance.now();
    try {
      const response = await retryTurn(playthrough.id, retryTarget.id, choicesEnabled);
      setPlaythrough(response.state);
      setChoices(response.choices ?? []);
      setLastPatchInfo({ applied: response.applied, rejected: response.rejected, warnings: response.warnings });
      setTokenUsage(response.tokenUsage ?? null);
      setRawInput(response.rawInput ?? null);
      setRawOutput(response.rawOutput ?? null);
      setRetryTarget(null);
      cancelEdit();
      void maybeAutoGenerateImage(response.state.messages[response.state.messages.length - 1]);
    } catch (e) {
      const durationMs = Math.round(performance.now() - startTime);
      const rawErr = e instanceof Error ? e.message : String(e);
      // Restore the failed message to the input box and close the confirm
      // modal, so "retry" is just pressing Send again (same as send failures).
      setInput(retryTarget.content);
      setRetryTarget(null);
      setFailedNotice({
        message: "Retry failed — your message was restored to the input box. World state was not changed.",
        rawError: rawErr,
        durationMs
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmTruncate() {
    if (!playthrough || !truncateTarget || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setFailedNotice(null);
    setCancelledNotice(null);
    try {
      const updated = await truncatePlaythrough(playthrough.id, truncateTarget.id);
      setPlaythrough(updated);
      setTruncateTarget(null);
      cancelEdit();
      setChoices([]);
      setLastPatchInfo({ applied: [], rejected: [], warnings: [] });
      setRawInput(null);
      setRawOutput(null);
    } catch (e) {
      const rawErr = e instanceof Error ? e.message : String(e);
      setTruncateTarget(null);
      setFailedNotice({
        message: "Delete up to here failed — nothing was changed.",
        rawError: rawErr
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function confirmBranch(branchName?: string, asStandalone?: boolean) {
    if (!playthrough || !branchTarget || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      const branched = await branchPlaythrough(playthrough.id, branchTarget.id, branchName, asStandalone);
      setBranchTarget(null);
      resetTurnState(branched);
    } catch (e) {
      const rawErr = e instanceof Error ? e.message : String(e);
      setBranchTarget(null);
      setFailedNotice({
        message: "Branch failed — nothing was changed.",
        rawError: rawErr
      });
    } finally {
      setActionLoading(false);
    }
  }

  async function handleResummarizeChapter(chapterId: string) {
    if (!playthrough || actionLoading) return;
    setActionLoading(true);
    setError(null);
    setResummarizingChapterId(chapterId);
    try {
      const updated = await resummarizeChapter(playthrough.id, chapterId);
      setPlaythrough(updated);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
      setResummarizingChapterId(null);
    }
  }

  async function handleQuestAction(questId: string, action: QuestAction, name?: string, summary?: string) {
    if (!playthrough || actionLoading) return;
    setActionLoading(true);
    setError(null);
    try {
      setPlaythrough(await questAction(playthrough.id, questId, action, name, summary));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionLoading(false);
    }
  }

  function resetTurnState(newPlaythrough: Playthrough | null) {
    // Flush the current playthrough's draft before switching away.
    const oldId = playthrough?.id ?? null;
    if (oldId && oldId !== newPlaythrough?.id) void persistDraft(oldId, input);
    setPlaythrough(newPlaythrough);
    setChoices([]);
    setLastPatchInfo({ applied: [], rejected: [], warnings: [] });
    setRawInput(null);
    setRawOutput(null);
    setCancelledNotice(null);
    setFailedNotice(null);
    setImagePromptRequest(null);
    if (newPlaythrough) {
      const { text, localWins } = resolveDraft(newPlaythrough);
      setInput(text);
      // Sync a newer local draft up to the server even if the user never types again.
      if (localWins && text && text !== newPlaythrough.draft) void persistDraft(newPlaythrough.id, text);
    } else {
      setInput("");
    }
  }

  return {
    playthrough,
    setPlaythrough,
    resetTurnState,
    input,
    setInput,
    canContinue,
    choicesEnabled,
    setChoicesEnabled,
    showDebug,
    setShowDebug,
    showContextUsage,
    setShowContextUsage,
    showGenerationTime,
    setShowGenerationTime,
    showMessageTimestamps,
    setShowMessageTimestamps,
    showModelName,
    setShowModelName,
    imagePromptPreview,
    setImagePromptPreview,
    choices,
    setChoices,
    loading,
    error,
    setError,
    lastPatchInfo,
    setLastPatchInfo,
    sendingMessage,
    cancelledNotice,
    setCancelledNotice,
    failedNotice,
    setFailedNotice,
    tokenUsage,
    setTokenUsage,
    rawInput,
    setRawInput,
    rawOutput,
    setRawOutput,
    editingMessageId,
    editDraft,
    setEditDraft,
    retryTarget,
    setRetryTarget,
    truncateTarget,
    setTruncateTarget,
    branchTarget,
    setBranchTarget,
    actionLoading,
    resummarizingChapterId,
    viewingChapterId,
    setViewingChapterId,
    loadPlaythrough,
    handleSend,
    handleCancel,
    imageGeneratingId,
    imagePreviewMessageId,
    imageDeletingId,
    imagePromptStartedAt,
    imageGeneratingStartedAt,
    autoImageAfterTurn,
    setAutoImageAfterTurn,
    alwaysDiscardOldImage,
    setAlwaysDiscardOldImage,
    imagePromptRequest,
    imageProgress,
    handleGenerateImage,
    handleCancelImage,
    closeImagePrompt,
    rerunImagePrompt,
    requestDeleteImage,
    confirmDeleteImage,
    deleteImageTarget,
    setDeleteImageTarget,
    requestImageRetry,
    confirmImageRetry,
    cancelImageRetry,
    retryImageTarget,
    openImageRequestEditor,
    closeImageRequestEditor,
    saveImageRequestBody,
    imageRequestEditor,
    imageSaving,
    startEdit,
    cancelEdit,
    saveEdit,
    confirmRetry,
    confirmTruncate,
    confirmBranch,
    handleResummarizeChapter,
    handleQuestAction
  };
}
