import { useEffect, useRef, useState } from "react";
import type { ChatMessage, ImageApiStyle, Playthrough } from "../../schemas";
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
  sendTurn,
  truncatePlaythrough,
  branchPlaythrough,
  type ImageGenerationProgress,
  type QuestAction,
  type TokenUsage
} from "../api";

const CHAT_SETTINGS_KEY = "bobbinloom_chat_settings";

const DRAFT_KEY_PREFIX = "bobbinloom_draft_";

/** Hidden continuation instruction: sent (with hideUserMessage) when the user
 *  hits Continue after a trailing user message, so the model replies to the
 *  player's last visible message without an empty bubble in the chat. */
const CONTINUE_INSTRUCTION =
  "Continue the story from the player's last message. Write the next scene as the " +
  "world and its characters; do not take actions on behalf of the player.";

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
};

/** Overrides the preview modal posts back. When BOTH prompt fields are present
 *  the server skips the text call, so the reviewed text is what the image
 *  provider receives and the text model is not paid for twice. */
export type ImageGenerationOverrides = {
  promptOverride?: string;
  negativeOverride?: string;
  imageProviderId?: string;
};

/** The generated prompt awaiting review in the modal. The message is carried
 *  along so the modal's Generate button can re-enter `handleGenerateImage`
 *  without the component having to look the message up again. */
export type ImagePromptRequest = {
  message: ChatMessage;
  prompt: string;
  negativePrompt: string;
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
 *  client needs to know about it: which id to poll for progress, and whether
 *  the dialect reports progress at all. */
export type ResolvedImageConnection = { id: string; apiStyle: ImageApiStyle };

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
    return active ? { id: active.id, apiStyle: active.apiStyle ?? "openai" } : null;
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

  const setChoicesEnabled = (val: boolean) => {
    setChatSettingsState((prev) => {
      const next = { ...prev, choicesEnabled: val };
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
        setLastPatchInfo({ applied: [], rejected: [], warnings: [] });
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

  /**
   * Generate one image for an assistant message — one entry point, three paths:
   *  - preview ON (the default) with no overrides: run the text call only and
   *    hand the composed prompt to the modal. Nothing is generated yet.
   *  - preview ON with BOTH overrides (the modal's Generate button): the server
   *    skips the text call, so no second token spend and the user's edits are
   *    what reaches the image provider.
   *  - preview OFF: a single request, no modal, no overrides.
   */
  async function handleGenerateImage(message: ChatMessage, overrides?: ImageGenerationOverrides) {
    // The abort ref is part of the guard, not just the state: the registry read
    // below happens BEFORE either in-flight marker is set, so state alone would
    // let a double-click start two generations.
    if (!playthrough || imageGeneratingId || imagePreviewMessageId || imageAbortRef.current) return;
    const reviewing = imagePromptPreview && !hasPromptOverrides(overrides);
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
      try {
        const preview = await previewImagePrompt(playthrough.id, message.id, overrides?.imageProviderId, controller.signal);
        // A preview the user cancelled must not pop the modal open again.
        if (controller.signal.aborted) return;
        setImagePromptRequest({
          message,
          prompt: preview.prompt,
          negativePrompt: preview.negativePrompt,
          warnings: preview.warnings,
          apiStyle: connection?.apiStyle
        });
      } catch (e) {
        if (e instanceof DOMException && e.name === "AbortError") {
          setCancelledNotice("Image prompt cancelled.");
        } else {
          reportImageFailure(e, startTime, "Image generation failed — nothing was changed.");
        }
      } finally {
        setImagePreviewMessageId(null);
        imageAbortRef.current = null;
      }
      return;
    }

    setImageGeneratingId(message.id);
    // Live progress is a1111-only: this is a no-op for every other dialect.
    startImageProgress(connection, controller.signal);
    try {
      const res = await generateMessageImage(playthrough.id, message.id, { ...overrides, signal: controller.signal });
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
      imageAbortRef.current = null;
    }
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
    setCancelledNotice(null);
    setFailedNotice(null);
    const startTime = performance.now();
    try {
      const preview = await previewImagePrompt(playthrough.id, request.message.id, undefined, controller.signal);
      if (controller.signal.aborted) return;
      setImagePromptRequest({ ...request, prompt: preview.prompt, negativePrompt: preview.negativePrompt, warnings: preview.warnings });
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setCancelledNotice("Image prompt cancelled.");
      } else {
        reportImageFailure(e, startTime, "Image generation failed — nothing was changed.");
      }
    } finally {
      setImagePreviewMessageId(null);
      imageAbortRef.current = null;
    }
  }

  /**
   * Drop one generated image from a message. The server sweeps the file when
   * nothing else references those bytes, so the confirmation is worded to cover
   * both cases rather than trying to count references on the client.
   */
  async function handleDeleteImage(message: ChatMessage, file: string) {
    if (!playthrough || imageGeneratingId || imagePreviewMessageId || imageDeletingId) return;
    if (!window.confirm("Remove this image? The file is deleted if nothing else uses it.")) return;
    setCancelledNotice(null);
    setFailedNotice(null);
    setImageDeletingId(message.id);
    const startTime = performance.now();
    try {
      const res = await deleteMessageImage(playthrough.id, message.id, file);
      setPlaythrough(res.playthrough);
    } catch (e) {
      reportImageFailure(e, startTime, "Removing the image failed — nothing was changed.");
    } finally {
      setImageDeletingId(null);
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
    imagePromptRequest,
    imageProgress,
    handleGenerateImage,
    handleCancelImage,
    closeImagePrompt,
    rerunImagePrompt,
    handleDeleteImage,
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
