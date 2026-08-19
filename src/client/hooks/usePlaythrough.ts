import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Playthrough } from "../../schemas";
import {
  editMessage,
  getContextUsage,
  listPlaythroughs,
  questAction,
  resummarizeChapter,
  retryTurn,
  sendTurn,
  type QuestAction,
  type TokenUsage
} from "../api";

const CHAT_SETTINGS_KEY = "bobbinloom_chat_settings";

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

  async function loadPlaythrough(id: string) {
    try {
      const all = await listPlaythroughs();
      const found = all.playthroughs.find((p) => p.id === id);
      if (found) {
        setPlaythrough(found);
        setChoices([]);
        setLastPatchInfo({ applied: [], rejected: [], warnings: [] });
        setRawInput(null);
        setRawOutput(null);
        setCancelledNotice(null);
        setFailedNotice(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }

  async function handleSend() {
    if (!playthrough || !input.trim() || loading) return;
    const currentInput = input;
    setInput("");
    setSendingMessage(currentInput);
    setLoading(true);
    setError(null);
    setCancelledNotice(null);
    setFailedNotice(null);

    const controller = new AbortController();
    abortControllerRef.current = controller;
    const startTime = performance.now();

    try {
      const response = await sendTurn(playthrough.id, currentInput, choicesEnabled, controller.signal);
      setPlaythrough(response.state);
      setChoices(response.choices ?? []);
      setLastPatchInfo({ applied: response.applied, rejected: response.rejected, warnings: response.warnings });
      setTokenUsage(response.tokenUsage ?? null);
      setRawInput(response.rawInput ?? null);
      setRawOutput(response.rawOutput ?? null);
    } catch (e) {
      const durationMs = Math.round(performance.now() - startTime);
      setInput(currentInput);
      if (e instanceof DOMException && e.name === "AbortError") {
        setCancelledNotice("Response cancelled — message restored to input.");
        setFailedNotice(null);
      } else {
        const rawErr = e instanceof Error ? e.message : String(e);
        setFailedNotice({
          message: "Generation failed — your message was restored to the input box.",
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
      setFailedNotice({
        message: "Retry failed — world state was not changed.",
        rawError: rawErr,
        durationMs
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
    setPlaythrough(newPlaythrough);
    setChoices([]);
    setLastPatchInfo({ applied: [], rejected: [], warnings: [] });
    setRawInput(null);
    setRawOutput(null);
  }

  return {
    playthrough,
    setPlaythrough,
    resetTurnState,
    input,
    setInput,
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
    handleResummarizeChapter,
    handleQuestAction
  };
}
