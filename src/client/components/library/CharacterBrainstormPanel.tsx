import { useEffect, useRef, useState } from "react";
import { Icon } from "../base";
import type { ProposedSectionChange, CharacterBrainstormResult } from "../../api";

export type BrainstormChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposedChanges?: CharacterBrainstormResult["proposedChanges"];
  appliedChanges?: Record<string, boolean>; // e.g. { "section:Personality": true, "all": true }
};

export type CharacterBrainstormPanelProps = {
  characterName: string;
  hasOriginalCcv2: boolean;
  includeOriginalCcv2: boolean;
  onToggleIncludeOriginalCcv2: (include: boolean) => void;
  messages: BrainstormChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
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
  onToggleIncludeOriginalCcv2,
  messages,
  onSendMessage,
  onApplySection,
  onApplyAll,
  onClearChat,
  onClose,
  loading,
  error,
  onCancel,
}: CharacterBrainstormPanelProps) {
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

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
          {hasOriginalCcv2 ? (
            <label
              className={`brainstorm-ccv2-toggle ${includeOriginalCcv2 ? "active" : ""}`}
              title="Include original CCv2 card context in AI prompts"
            >
              <input
                type="checkbox"
                checked={includeOriginalCcv2}
                onChange={(e) => onToggleIncludeOriginalCcv2(e.target.checked)}
              />
              <span>Original Card Context</span>
            </label>
          ) : null}

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
          <div className="brainstorm-thread">
            {messages.map((msg) => (
              <div key={msg.id} className={`brainstorm-message-row ${msg.role}`}>
                <div className="brainstorm-avatar-icon">
                  <Icon name={msg.role === "user" ? "User" : "Sparkles"} size={14} />
                </div>
                <div className="brainstorm-bubble">
                  {/* Text Content */}
                  <div className="brainstorm-text-content">
                    {msg.content.split("\n").map((line, idx) => (
                      <p key={idx}>{line || "\u00A0"}</p>
                    ))}
                  </div>

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

                      {/* Apply All Action */}
                      {((msg.proposedChanges.sections && msg.proposedChanges.sections.length > 1) ||
                        (msg.proposedChanges.sections && msg.proposedChanges.sections.length > 0 && (msg.proposedChanges.tags || msg.proposedChanges.creatorNotes))) && (
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
