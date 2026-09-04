import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Playthrough } from "../../schemas";
import {
  editMessage,
  getContextUsage,
  getPlaythrough,
  listPlaythroughs,
  questAction,
  resummarizeChapter,
  retryTurn,
  saveDraft,
  sendTurn,
  truncatePlaythrough,
  branchPlaythrough,
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
};

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
