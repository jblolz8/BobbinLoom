import { useEffect, useRef, useState } from "react";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import type { TokenUsage } from "../../../api";
import { ContextMeter } from "../../common/ContextMeter";
import { MarkdownView } from "../../common/MarkdownView";

export type ChatPanelProps = {
  playthrough: Playthrough;
  input: string;
  onInputChange: (value: string) => void;
  onSend: () => void;
  loading: boolean;
  actionLoading: boolean;
  choices: string[];
  choicesEnabled: boolean;
  showDebug: boolean;
  showContextUsage: boolean;
  onChoiceSelect: (text: string) => void;
  editingMessageId: string | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRetryRequest: (msg: ChatMessage) => void;
  lastPatchInfo: { applied: string[]; rejected: string[]; warnings: string[] };
  sendingMessage: string | null;
  cancelledNotice: string | null;
  onDismissNotice: () => void;
  onCancel: () => void;
  tokenUsage: TokenUsage | null;
  viewingChapterId: string | null;
  onReturnToCurrentChapter: () => void;
  onResummarizeChapter: (chapterId: string) => void;
  resummarizingChapterId: string | null;
  rawInput: string | null;
  rawOutput: string | null;
  className?: string;
};



function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function DebugBox(props: {
  lastPatchInfo: { applied: string[]; rejected: string[]; warnings: string[] };
  tokenUsage: TokenUsage | null;
  playthrough: Playthrough;
  rawInput: string | null;
  rawOutput: string | null;
}) {
  const { lastPatchInfo, tokenUsage, playthrough, rawInput, rawOutput } = props;
  const [debugTab, setDebugTab] = useState<"patch" | "output" | "input">("patch");
  const [copied, setCopied] = useState(false);

  const tabContent = (() => {
    if (debugTab === "input") {
      return rawInput ? prettyJson(rawInput) : "No turn data yet.";
    }
    if (debugTab === "output") {
      return rawOutput ? prettyJson(rawOutput) : "No turn data yet.";
    }
    return JSON.stringify({
      patch: lastPatchInfo,
      tokenUsage,
      cast: tokenUsage?.castPresence ?? { present: 0, absent: 0 },
      memory: {
        recent: playthrough.memoryLayers?.recent?.length ?? 0,
        compressed: playthrough.memoryLayers?.compressed?.length ?? 0,
        legacy: playthrough.memoryEvents?.length ?? 0,
        ghostedMessages: playthrough.messages.filter(m => m.hidden).length,
        visibleMessages: playthrough.messages.filter(m => !m.hidden).length
      }
    }, null, 2);
  })();

  const handleCopy = () => {
    navigator.clipboard.writeText(tabContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <details className="debug-box">
      <summary>Debug</summary>
      <div className="debug-tabs">
        <button className={`debug-tab ${debugTab === "patch" ? "active" : ""}`} onClick={() => setDebugTab("patch")}>Patch</button>
        <button className={`debug-tab ${debugTab === "output" ? "active" : ""}`} onClick={() => setDebugTab("output")}>Output</button>
        <button className={`debug-tab ${debugTab === "input" ? "active" : ""}`} onClick={() => setDebugTab("input")}>Input</button>
      </div>
      <button className="debug-copy" onClick={handleCopy} title="Copy to clipboard">
        {copied ? "Copied!" : "📋"}
      </button>
      <pre>{tabContent}</pre>
    </details>
  );
}

export function ChatPanel(props: ChatPanelProps) {
  const {
    playthrough, input, onInputChange, onSend, loading, actionLoading,
    choices, choicesEnabled, showDebug, showContextUsage, onChoiceSelect,
    editingMessageId, editDraft, onEditDraftChange, onStartEdit, onSaveEdit, onCancelEdit,
    onRetryRequest, lastPatchInfo,
    sendingMessage, cancelledNotice, onDismissNotice, onCancel, tokenUsage,
    viewingChapterId, onReturnToCurrentChapter,
    onResummarizeChapter, resummarizingChapterId,
    rawInput, rawOutput, className
  } = props;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [playthrough.messages.length, loading, sendingMessage, cancelledNotice]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && input.trim()) {
        onSend();
      }
    }
  }

  const isViewingArchive = viewingChapterId !== null;
  const chapterName = isViewingArchive
    ? (playthrough.chapters ?? []).find(ch => ch.id === viewingChapterId)?.name ?? "Archived Chapter"
    : "";

  const showRealMessages = isViewingArchive
    ? playthrough.messages.filter((m) => m.chapterId === viewingChapterId)
    : playthrough.messages.filter((m) => !m.hidden);

  return (
    <section className={`chat-panel${className ? ` ${className}` : ""}`}>
      <div className="messages">
        {isViewingArchive ? (
          <div className="chapter-view-banner">
            <span>Viewing archived chapter: <strong>{chapterName}</strong> — read only.</span>
            <button onClick={onReturnToCurrentChapter}>Return to current chapter</button>
          </div>
        ) : null}

        {showRealMessages.length === 0 && !sendingMessage ? (
          <p className="empty-chat">No messages yet.</p>
        ) : null}

        {showRealMessages.map((msg) => {
          const previousChapter = msg.chapterOpening
            ? (playthrough.chapters ?? [])[(playthrough.chapters ?? []).length - 1]
            : undefined;
          const isResummarizing = previousChapter ? resummarizingChapterId === previousChapter.id : false;
          return (
          <article key={msg.id} className={`message ${msg.role}`}>
            <div className="message-header">
              <strong>{msg.role === "user" ? "You" : "BobbinLoom"}{msg.editedAt ? <span className="edited-tag"> (edited)</span> : null}</strong>
              <div className="message-actions">
                <button className="message-action" onClick={() => onStartEdit(msg)} disabled={actionLoading || editingMessageId === msg.id || loading}>Edit</button>
                {msg.role === "assistant" ? <button className="message-action retry" onClick={() => onRetryRequest(msg)} disabled={actionLoading || loading}>Retry</button> : null}
                {msg.chapterOpening && previousChapter ? (
                  <button
                    className="message-action resummarize"
                    onClick={() => onResummarizeChapter(previousChapter.id)}
                    disabled={actionLoading || loading || isResummarizing}
                    title="Re-summarize the previous chapter (updates the chapter record for future turns)"
                  >
                    {isResummarizing ? "Summarizing…" : "Re-summarize previous chapter"}
                  </button>
                ) : null}
              </div>
            </div>
            {editingMessageId === msg.id ? (
              <div className="edit-area">
                <textarea value={editDraft} onChange={(e) => onEditDraftChange(e.target.value)} rows={Math.min(12, Math.max(3, editDraft.split("\n").length))} />
                <div className="edit-actions">
                  <button onClick={onSaveEdit} disabled={actionLoading || !editDraft.trim()}>{actionLoading ? "Saving…" : "Save"}</button>
                  <button onClick={onCancelEdit} disabled={actionLoading}>Cancel</button>
                </div>
              </div>
            ) : (
              <MarkdownView content={msg.content} />
            )}
          </article>
          );
        })}

        {sendingMessage ? (
          <>
            <article className="message user optimistic">
              <div className="message-header"><strong>You</strong></div>
              <MarkdownView content={sendingMessage} />
            </article>
            <article className="message assistant generating">
              <div className="message-header"><strong>BobbinLoom</strong></div>
              <p className="generating-placeholder">Generating response…</p>
            </article>
          </>
        ) : null}

        {cancelledNotice ? (
          <article className="message system cancelled-notice">
            <p>{cancelledNotice}</p>
            <button className="dismiss-notice" onClick={onDismissNotice} title="Dismiss">✕</button>
          </article>
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {choicesEnabled && choices.length > 0 && !loading ? (
        <div className="choices">{choices.map((c) => <button key={c} onClick={() => onChoiceSelect(c)}>{c}</button>)}</div>
      ) : null}

      {!isViewingArchive ? (
      <div className="input-row">
        <textarea
          value={input}
          onChange={(e) => onInputChange(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder='Plain text is action. "Quoted text" is dialogue. Enter to send, Shift+Enter for new line.'
          rows={3}
          disabled={loading}
        />
        {loading ? (
          <button className="cancel-btn" onClick={onCancel}>Cancel</button>
        ) : (
          <button onClick={onSend} disabled={!input.trim()}>Send</button>
        )}
      </div>
      ) : null}

      {showContextUsage ? <ContextMeter tokenUsage={tokenUsage} /> : null}

      {showDebug ? (
        <DebugBox
          lastPatchInfo={lastPatchInfo}
          tokenUsage={tokenUsage}
          playthrough={playthrough}
          rawInput={rawInput}
          rawOutput={rawOutput}
        />
      ) : null}
    </section>
  );
}
