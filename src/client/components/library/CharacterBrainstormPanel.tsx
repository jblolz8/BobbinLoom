import { useEffect, useRef, useState } from "react";
import { Icon, ModelBadge, TextArea } from "../base";
import { MarkdownView } from "../common/MarkdownView";
import type { ProposedSectionChange, CharacterBrainstormResult } from "../../api";

export type BrainstormChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposedChanges?: CharacterBrainstormResult["proposedChanges"];
  /** Headers the model proposed that this sheet has no section for; dropped from the card. */
  unmappedHeaders?: string[];
  /** Headers kept as additions, so the card can mark them as new sections. */
  newSections?: string[];
  /** Who wrote it, since the connection is now a choice. */
  model?: string;
  appliedChanges?: Record<string, boolean>; // e.g. { "section:Personality": true, "all": true }
};

export type CharacterBrainstormPanelProps = {
  characterName: string;
  /** Whether the card has an original CCv2 copy at all — the setting is only meaningful with one. */
  hasOriginalCcv2: boolean;
  includeOriginalCcv2: boolean;
  onOpenSettings: () => void;
  messages: BrainstormChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onEditMessage: (messageId: string, text: string) => void;
  onRevertAndRetry: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onApplySection: (section: ProposedSectionChange, messageId: string) => void;
  onApplyAll: (proposed: CharacterBrainstormResult["proposedChanges"], messageId: string) => void;
  onClearChat: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
};

export function CharacterBrainstormPanel({
  characterName,
  hasOriginalCcv2,
  includeOriginalCcv2,
  onOpenSettings,
  messages,
  onSendMessage,
  onEditMessage,
  onRevertAndRetry,
  onRegenerate,
  onApplySection,
  onApplyAll,
  onClearChat,
  onClose,
  loading,
  error,
  onCancel,
}: CharacterBrainstormPanelProps) {
  const [inputText, setInputText] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState("");
  const [copyState, setCopyState] = useState<{ id: string; ok: boolean } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    },
    []
  );

  function handleSend() {
    const text = inputText.trim();
    if (!text || loading) return;
    setInputText("");
    void onSendMessage(text);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  }

  async function handleCopy(message: BrainstormChatMessage) {
    let ok = false;
    try {
      await navigator.clipboard.writeText(message.content ?? "");
      ok = true;
    } catch {
      // A browser that refuses the clipboard says so rather than pretending it worked.
      ok = false;
    }
    setCopyState({ id: message.id, ok });
    if (copyTimerRef.current !== null) window.clearTimeout(copyTimerRef.current);
    copyTimerRef.current = window.setTimeout(() => setCopyState(null), 1600);
  }

  function startEdit(message: BrainstormChatMessage) {
    setEditingId(message.id);
    setEditDraft(message.content);
  }

  function commitEdit(messageId: string) {
    const text = editDraft.trim();
    setEditingId(null);
    if (!text) return;
    onEditMessage(messageId, text);
  }

  const lastAssistantId = [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  return (
    <div className="character-brainstorm-panel">
      {/* ── Header ── */}
      <header className="brainstorm-panel-header">
        <div className="brainstorm-header-left">
          <span className="brainstorm-icon-badge">
            <Icon name="Sparkles" size={16} />
          </span>
          <div className="brainstorm-header-titles">
            <h4>AI Brainstorm Assistant</h4>
            <span className="brainstorm-subtitle">
              Co-editing &ldquo;{characterName || "Character"}&rdquo;
            </span>
          </div>
        </div>

        <div className="brainstorm-header-actions">
          <button
            type="button"
            className={`brainstorm-settings-btn ${includeOriginalCcv2 ? "active" : ""}`}
            onClick={onOpenSettings}
            title="AI Brainstorm Assistant settings"
            aria-label="AI Brainstorm Assistant settings"
          >
            <Icon name="Settings" size={14} />
            {includeOriginalCcv2 ? <span className="brainstorm-settings-dot" aria-hidden="true" /> : null}
          </button>

          {messages.length > 0 ? (
            <button
              type="button"
              className="brainstorm-clear-btn"
              onClick={onClearChat}
              disabled={loading}
              title="Clear brainstorming chat session"
              aria-label="Clear chat session"
            >
              <Icon name="RotateCcw" size={14} />
            </button>
          ) : null}

          <button
            type="button"
            className="brainstorm-close-btn"
            onClick={onClose}
            title="Close AI Assistant panel"
            aria-label="Close AI Assistant panel"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
      </header>

      {/* ── Chat Message List ── */}
      <div className="brainstorm-messages-container">
        {messages.length === 0 ? (
          <div className="brainstorm-empty-state">
            <div className="brainstorm-welcome-card">
              <span className="brainstorm-welcome-icon">
                <Icon name="Sparkles" size={28} />
              </span>
              <h3>Brainstorm &amp; Refine</h3>
              <p>
                Ask for creative ideas, personality tweaks, backstory expansion, or surgical section edits.
                Proposed changes can be applied directly to your character sheet with one click.
              </p>
            </div>
          </div>
        ) : (
          <div className="brainstorm-thread" role="log" aria-live="polite" aria-label="Brainstorm conversation">
            {messages.map((msg) => (
              <div key={msg.id} className={`brainstorm-message-row ${msg.role}`}>
                <div className="brainstorm-avatar-icon">
                  <Icon name={msg.role === "user" ? "User" : "Sparkles"} size={14} />
                </div>
                <div className="brainstorm-bubble">
                  {editingId === msg.id ? (
                    <div className="brainstorm-edit-box">
                      <TextArea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        className="brainstorm-edit-textarea"
                        aria-label="Edit this message"
                      />
                      <div className="brainstorm-edit-actions">
                        <button
                          type="button"
                          className="brainstorm-edit-save"
                          onClick={() => commitEdit(msg.id)}
                          disabled={!editDraft.trim()}
                        >
                          <Icon name="Check" size={12} /> Save
                        </button>
                        <button type="button" className="brainstorm-edit-cancel" onClick={() => setEditingId(null)}>
                          Cancel
                        </button>
                      </div>
                    </div>
                  ) : (
                    <MarkdownView content={msg.content} className="brainstorm-markdown" />
                  )}

                  {/* Proposed Changes Card */}
                  {msg.proposedChanges && (
                    <div className="brainstorm-proposal-card">
                      <div className="proposal-card-header">
                        <span className="proposal-badge">
                          <Icon name="Sliders" size={12} /> Proposed Sheet Updates
                        </span>
                      </div>

                      {/* Sections */}
                      {msg.proposedChanges.sections && msg.proposedChanges.sections.length > 0 && (
                        <div className="proposal-sections-list">
                          {msg.proposedChanges.sections.map((sec, sIdx) => {
                            const isApplied = !!msg.appliedChanges?.[`section:${sec.header.toLowerCase()}`] || !!msg.appliedChanges?.all;
                            return (
                              <div key={`${sec.header}-${sIdx}`} className="proposal-section-item">
                                <div className="proposal-section-header">
                                  <span className="proposal-section-tag">[{sec.header}]</span>
                                  {msg.newSections?.includes(sec.header) ? (
                                    <span className="proposal-new-tag" title="This section is not part of the format — applying it adds it to the end of the sheet">
                                      New section
                                    </span>
                                  ) : null}
                                  <button
                                    type="button"
                                    className={`proposal-apply-btn ${isApplied ? "applied" : ""}`}
                                    onClick={() => onApplySection(sec, msg.id)}
                                    disabled={isApplied}
                                    title={isApplied ? "Section applied to draft" : `Apply [${sec.header}] to sheet`}
                                  >
                                    <Icon name={isApplied ? "Check" : "Plus"} size={11} />
                                    {isApplied ? "Applied" : `Apply [${sec.header}]`}
                                  </button>
                                </div>
                                <pre className="proposal-section-preview">{sec.body}</pre>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Rename: the proposal the card used to drop on the floor */}
                      {msg.proposedChanges.name && (
                        <div className="proposal-field-block">
                          <span className="proposal-field-label">Character name:</span>
                          <div className="proposal-name-row">
                            <span className="proposal-name-value">{msg.proposedChanges.name}</span>
                            <span className="proposal-name-current">currently &ldquo;{characterName || "unnamed"}&rdquo;</span>
                          </div>
                        </div>
                      )}

                      {/* Tags */}
                      {msg.proposedChanges.tags && msg.proposedChanges.tags.length > 0 && (
                        <div className="proposal-tags-block">
                          <span className="proposal-field-label">Tags:</span>
                          <div className="proposal-tags-list">
                            {msg.proposedChanges.tags.map((tag) => (
                              <span key={tag} className="proposal-tag-chip">
                                {tag}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Creator Notes */}
                      {msg.proposedChanges.creatorNotes && (
                        <div className="proposal-notes-block">
                          <span className="proposal-field-label">Creator Notes:</span>
                          <p className="proposal-notes-preview">{msg.proposedChanges.creatorNotes}</p>
                        </div>
                      )}

                      {/* A whole-sheet rewrite is the one proposal that can destroy work, so it says so
                          and keeps its content behind a fold until asked for. */}
                      {msg.proposedChanges.fullContent && (
                        <div className="proposal-full-content">
                          <div className="proposal-full-header">
                            <Icon name="TriangleAlert" size={13} />
                            <span>
                              Rewrites the <strong>entire sheet</strong> — the current content is replaced
                            </span>
                          </div>
                          <details className="proposal-full-details">
                            <summary>Preview the rewritten sheet</summary>
                            <pre className="proposal-section-preview">{msg.proposedChanges.fullContent}</pre>
                          </details>
                        </div>
                      )}

                      {/* What it could not place */}
                      {msg.unmappedHeaders && msg.unmappedHeaders.length > 0 ? (
                        <div className="proposal-unmapped">
                          <Icon name="AlertCircle" size={12} />
                          <span>
                            Not on this sheet, so left out:{" "}
                            {msg.unmappedHeaders.map((header) => `[${header}]`).join(", ")}
                          </span>
                        </div>
                      ) : null}

                      {/* Apply All Action */}
                      {((msg.proposedChanges.sections && msg.proposedChanges.sections.length > 1) ||
                        (msg.proposedChanges.sections && msg.proposedChanges.sections.length > 0 &&
                          (msg.proposedChanges.tags || msg.proposedChanges.creatorNotes))) && (
                        <div className="proposal-card-footer">
                          <button
                            type="button"
                            className={`proposal-apply-all-btn ${msg.appliedChanges?.all ? "applied" : ""}`}
                            onClick={() => onApplyAll(msg.proposedChanges, msg.id)}
                            disabled={!!msg.appliedChanges?.all}
                          >
                            <Icon name={msg.appliedChanges?.all ? "CheckCheck" : "Check"} size={13} />
                            {msg.appliedChanges?.all ? "All Changes Applied" : "Apply All Proposed Changes"}
                          </button>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Message actions */}
                  {editingId === msg.id ? null : (
                    <div className="brainstorm-msg-actions">
                      <button
                        type="button"
                        className="brainstorm-msg-action"
                        onClick={() => { void handleCopy(msg); }}
                        title="Copy this message"
                      >
                        <Icon name={copyState?.id === msg.id && copyState.ok ? "Check" : "Copy"} size={11} />
                        {copyState?.id === msg.id ? (copyState.ok ? "Copied" : "Copy failed") : "Copy"}
                      </button>

                      {msg.role === "user" ? (
                        <button
                          type="button"
                          className="brainstorm-msg-action"
                          onClick={() => startEdit(msg)}
                          disabled={loading}
                          title="Edit this message — anything after it is dropped"
                        >
                          <Icon name="Pencil" size={11} /> Edit
                        </button>
                      ) : (
                        <>
                          {msg.id === lastAssistantId ? (
                            <button
                              type="button"
                              className="brainstorm-msg-action"
                              onClick={() => onRegenerate(msg.id)}
                              disabled={loading}
                              title="Ask again and replace this reply"
                            >
                              <Icon name="RefreshCw" size={11} /> Regenerate
                            </button>
                          ) : null}
                          <button
                            type="button"
                            className="brainstorm-msg-action"
                            onClick={() => onRevertAndRetry(msg.id)}
                            disabled={loading}
                            title="Go back to the question this answered and ask it again"
                          >
                            <Icon name="Undo2" size={11} /> Revert &amp; Retry
                          </button>
                        </>
                      )}
                    </div>
                  )}

                  {msg.role === "assistant" && msg.model ? (
                    <div className="brainstorm-message-meta">
                      <ModelBadge model={msg.model} />
                    </div>
                  ) : null}
                </div>
              </div>
            ))}

            {loading ? (
              <div className="brainstorm-message-row assistant is-thinking">
                <div className="brainstorm-avatar-icon">
                  <Icon name="Sparkles" size={14} className="sparkle-pulse" />
                </div>
                <div className="brainstorm-bubble thinking-bubble">
                  <div className="typing-indicator">
                    <span />
                    <span />
                    <span />
                  </div>
                  <span className="thinking-label">Brainstorming ideas…</span>
                  <button
                    type="button"
                    className="brainstorm-cancel-thinking-btn"
                    onClick={onCancel}
                    title="Cancel generation"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error ? (
        <div className="brainstorm-error-banner">
          <Icon name="AlertCircle" size={14} />
          <span>{error}</span>
        </div>
      ) : null}

      {/* ── Input Footer ── */}
      <footer className="brainstorm-input-footer">
        <textarea
          ref={inputRef}
          rows={2}
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for ideas, section edits (e.g. 'Update [Likes] to include tea brewing'), or dialogue…"
          disabled={loading}
          className="brainstorm-textarea"
        />
        <button
          type="button"
          className="brainstorm-send-btn"
          onClick={handleSend}
          disabled={loading || !inputText.trim()}
          title="Send message (Enter)"
          aria-label="Send message"
        >
          {loading ? (
            <Icon name="Sparkles" size={16} className="sparkle-pulse" />
          ) : (
            <Icon name="Send" size={16} />
          )}
        </button>
      </footer>
    </div>
  );
}
