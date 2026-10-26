import { useEffect, useRef, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Header,
  Icon,
  ModelBadge,
  Separator,
  Stack,
  StatusMessage,
  Text,
  TextArea,
} from "../base";
import { MarkdownView } from "../common";
import type {
  ProposedSectionChange,
  CharacterBrainstormResult,
} from "../../api";
import "./CharacterBrainstormPanel.css";

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
  onApplyAll: (
    proposed: CharacterBrainstormResult["proposedChanges"],
    messageId: string,
  ) => void;
  onClearChat: () => void;
  onClose: () => void;
  loading: boolean;
  error: string | null;
  onCancel: () => void;
};

export function CharacterBrainstormPanel({
  characterName,
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
  const [copyState, setCopyState] = useState<{
    id: string;
    ok: boolean;
  } | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const copyTimerRef = useRef<number | null>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  useEffect(
    () => () => {
      if (copyTimerRef.current !== null)
        window.clearTimeout(copyTimerRef.current);
    },
    [],
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
    if (copyTimerRef.current !== null)
      window.clearTimeout(copyTimerRef.current);
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

  const lastAssistantId =
    [...messages].reverse().find((m) => m.role === "assistant")?.id ?? null;

  return (
    <div className="character-brainstorm-panel">
      {/* ── Header ── */}
      <Header
        variant="panel"
        className="brainstorm-panel-header"
        icon={<Icon name="Sparkles" size={16} />}
        title="AI Brainstorm Assistant"
        subtitle={`Co-editing \u201c${characterName || "Character"}\u201d`}
        actions={
          <Stack direction="row" align="center" gap="xs">
            <Button
              variant="ghost"
              size="xs"
              iconOnly
              className="brainstorm-settings-btn"
              onClick={onOpenSettings}
              title="AI Brainstorm Assistant settings"
              aria-label="AI Brainstorm Assistant settings"
            >
              <Icon name="Settings" size={14} />
              {includeOriginalCcv2 ? (
                <span className="brainstorm-settings-dot" aria-hidden="true" />
              ) : null}
            </Button>

            {messages.length > 0 ? (
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                onClick={onClearChat}
                disabled={loading}
                title="Clear brainstorming chat session"
                aria-label="Clear chat session"
              >
                <Icon name="RotateCcw" size={14} />
              </Button>
            ) : null}

            <Button
              variant="ghost"
              size="xs"
              iconOnly
              onClick={onClose}
              title="Close AI Assistant panel"
              aria-label="Close AI Assistant panel"
            >
              <Icon name="X" size={16} />
            </Button>
          </Stack>
        }
      />

      {/* ── Chat Message List ── */}
      <div className="brainstorm-messages-container">
        {messages.length === 0 ? (
          <div className="brainstorm-empty-state">
            <Card variant="elevated" padding="md">
              <Stack align="center" gap="xs">
                <span className="brainstorm-welcome-icon">
                  <Icon name="Sparkles" size={28} />
                </span>
                <Text as="h3" size="md" weight="bold" align="center">
                  Brainstorm &amp; Refine
                </Text>
                <Text size="xs" tone="secondary" align="center">
                  Ask for creative ideas, personality tweaks, backstory
                  expansion, or surgical section edits. Proposed changes can be
                  applied directly to your character sheet with one click.
                </Text>
              </Stack>
            </Card>
          </div>
        ) : (
          <div
            className="brainstorm-thread"
            role="log"
            aria-live="polite"
            aria-label="Brainstorm conversation"
          >
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`brainstorm-message-row ${msg.role}`}
              >
                <div className="brainstorm-avatar-icon">
                  <Icon
                    name={msg.role === "user" ? "User" : "Sparkles"}
                    size={14}
                  />
                </div>
                <div className="brainstorm-bubble">
                  {editingId === msg.id ? (
                    <Stack gap="xs">
                      <TextArea
                        value={editDraft}
                        onChange={(e) => setEditDraft(e.target.value)}
                        rows={3}
                        size="sm"
                        aria-label="Edit this message"
                      />
                      <Stack direction="row" justify="end" gap="xs">
                        <Button
                          variant="primary"
                          size="xs"
                          leftIcon={<Icon name="Check" size={12} />}
                          onClick={() => commitEdit(msg.id)}
                          disabled={!editDraft.trim()}
                        >
                          Save
                        </Button>
                        <Button
                          variant="secondary"
                          size="xs"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </Stack>
                    </Stack>
                  ) : (
                    <MarkdownView
                      content={msg.content}
                      className="brainstorm-markdown"
                    />
                  )}

                  {/* Proposed Changes Card */}
                  {msg.proposedChanges && (
                    <Card
                      variant="elevated"
                      padding="sm"
                      className="brainstorm-proposal-card"
                    >
                      <Stack gap="sm">
                        <Stack direction="row" justify="between" align="center">
                          <Badge
                            variant="info"
                            size="xs"
                            leftIcon={<Icon name="Sliders" size={11} />}
                          >
                            Proposed Sheet Updates
                          </Badge>
                        </Stack>

                        {/* Sections */}
                        {msg.proposedChanges.sections &&
                          msg.proposedChanges.sections.length > 0 && (
                            <Stack gap="xs">
                              {msg.proposedChanges.sections.map((sec, sIdx) => {
                                const isApplied =
                                  !!msg.appliedChanges?.[
                                    `section:${sec.header.toLowerCase()}`
                                  ] || !!msg.appliedChanges?.all;
                                return (
                                  <Card
                                    key={`${sec.header}-${sIdx}`}
                                    variant="panel"
                                    padding="xs"
                                  >
                                    <Stack gap="xs">
                                      <Stack
                                        direction="row"
                                        justify="between"
                                        align="center"
                                        gap="xs"
                                        wrap
                                      >
                                        <Stack
                                          direction="row"
                                          align="center"
                                          gap="xs"
                                        >
                                          <Text
                                            size="xs"
                                            weight="bold"
                                            tone="accent"
                                          >
                                            [{sec.header}]
                                          </Text>
                                          {msg.newSections?.includes(
                                            sec.header,
                                          ) ? (
                                            <Badge
                                              variant="accent"
                                              size="xs"
                                              pill
                                              title="This section is not part of the format — applying it adds it to the end of the sheet"
                                            >
                                              New section
                                            </Badge>
                                          ) : null}
                                        </Stack>
                                        <Button
                                          variant={
                                            isApplied ? "primary" : "secondary"
                                          }
                                          size="xs"
                                          leftIcon={
                                            <Icon
                                              name={
                                                isApplied ? "Check" : "Plus"
                                              }
                                              size={11}
                                            />
                                          }
                                          onClick={() =>
                                            onApplySection(sec, msg.id)
                                          }
                                          disabled={isApplied}
                                          title={
                                            isApplied
                                              ? "Section applied to draft"
                                              : `Apply [${sec.header}] to sheet`
                                          }
                                        >
                                          {isApplied
                                            ? "Applied"
                                            : `Apply [${sec.header}]`}
                                        </Button>
                                      </Stack>
                                      <pre className="proposal-section-preview">
                                        {sec.body}
                                      </pre>
                                    </Stack>
                                  </Card>
                                );
                              })}
                            </Stack>
                          )}

                        {/* Rename */}
                        {msg.proposedChanges.name && (
                          <Stack gap="none">
                            <Text size="xs" weight="semibold" tone="muted">
                              Character name:
                            </Text>
                            <Stack
                              direction="row"
                              align="baseline"
                              gap="xs"
                              wrap
                            >
                              <Text size="xs" weight="semibold">
                                {msg.proposedChanges.name}
                              </Text>
                              <Text size="xs" tone="muted">
                                currently &ldquo;{characterName || "unnamed"}
                                &rdquo;
                              </Text>
                            </Stack>
                          </Stack>
                        )}

                        {/* Tags */}
                        {msg.proposedChanges.tags &&
                          msg.proposedChanges.tags.length > 0 && (
                            <Card variant="panel" padding="xs">
                              <Stack gap="xs">
                                <Text
                                  size="xs"
                                  weight="semibold"
                                  tone="muted"
                                >
                                  Tags:
                                </Text>
                                <Stack direction="row" gap="xs" wrap>
                                  {msg.proposedChanges.tags.map((tag) => (
                                    <Badge key={tag} variant="info" size="xs">
                                      {tag}
                                    </Badge>
                                  ))}
                                </Stack>
                              </Stack>
                            </Card>
                          )}

                        {/* Creator Notes */}
                        {msg.proposedChanges.creatorNotes && (
                          <Card variant="panel" padding="xs">
                            <Stack gap="xs">
                              <Text size="xs" weight="semibold" tone="muted">
                                Creator Notes:
                              </Text>
                              <Text size="xs" tone="secondary" italic>
                                {msg.proposedChanges.creatorNotes}
                              </Text>
                            </Stack>
                          </Card>
                        )}

                        {/* Full Content Rewrite */}
                        {msg.proposedChanges.fullContent && (
                          <StatusMessage
                            variant="banner"
                            tone="warn"
                            icon="TriangleAlert"
                          >
                            <Stack gap="xs">
                              <Text size="xs">
                                Rewrites the <strong>entire sheet</strong> — the
                                current content is replaced
                              </Text>
                              <details className="proposal-full-details">
                                <summary>Preview the rewritten sheet</summary>
                                <pre className="proposal-section-preview">
                                  {msg.proposedChanges.fullContent}
                                </pre>
                              </details>
                            </Stack>
                          </StatusMessage>
                        )}

                        {/* Unmapped headers */}
                        {msg.unmappedHeaders &&
                        msg.unmappedHeaders.length > 0 ? (
                          <Stack direction="row" align="center" gap="xs">
                            <Icon name="AlertCircle" size={12} />
                            <Text size="xs" tone="muted">
                              Not on this sheet, so left out:{" "}
                              {msg.unmappedHeaders
                                .map((header) => `[${header}]`)
                                .join(", ")}
                            </Text>
                          </Stack>
                        ) : null}

                        {/* Apply All Action */}
                        {((msg.proposedChanges.sections &&
                          msg.proposedChanges.sections.length > 1) ||
                          (msg.proposedChanges.sections &&
                            msg.proposedChanges.sections.length > 0 &&
                            (msg.proposedChanges.tags ||
                              msg.proposedChanges.creatorNotes))) && (
                          <>
                            <Separator spacing="none" />
                            <Stack direction="row" justify="end">
                              <Button
                                variant="primary"
                                size="xs"
                                leftIcon={
                                  <Icon
                                    name={
                                      msg.appliedChanges?.all
                                        ? "CheckCheck"
                                        : "Check"
                                    }
                                    size={13}
                                  />
                                }
                                onClick={() =>
                                  onApplyAll(msg.proposedChanges, msg.id)
                                }
                                disabled={!!msg.appliedChanges?.all}
                              >
                                {msg.appliedChanges?.all
                                  ? "All Changes Applied"
                                  : "Apply All Proposed Changes"}
                              </Button>
                            </Stack>
                          </>
                        )}
                      </Stack>
                    </Card>
                  )}

                  {/* Message actions */}
                  {editingId === msg.id ? null : (
                    <div className="brainstorm-msg-actions">
                      <Button
                        variant="ghost"
                        size="xs"
                        leftIcon={
                          <Icon
                            name={
                              copyState?.id === msg.id && copyState.ok
                                ? "Check"
                                : "Copy"
                            }
                            size={11}
                          />
                        }
                        onClick={() => {
                          void handleCopy(msg);
                        }}
                        title="Copy this message"
                      >
                        {copyState?.id === msg.id
                          ? copyState.ok
                            ? "Copied"
                            : "Copy failed"
                          : "Copy"}
                      </Button>

                      {msg.role === "user" ? (
                        <Button
                          variant="ghost"
                          size="xs"
                          leftIcon={<Icon name="Pencil" size={11} />}
                          onClick={() => startEdit(msg)}
                          disabled={loading}
                          title="Edit this message — anything after it is dropped"
                        >
                          Edit
                        </Button>
                      ) : (
                        <>
                          {msg.id === lastAssistantId ? (
                            <Button
                              variant="ghost"
                              size="xs"
                              leftIcon={<Icon name="RefreshCw" size={11} />}
                              onClick={() => onRegenerate(msg.id)}
                              disabled={loading}
                              title="Ask again and replace this reply"
                            >
                              Regenerate
                            </Button>
                          ) : null}
                          <Button
                            variant="ghost"
                            size="xs"
                            leftIcon={<Icon name="Undo2" size={11} />}
                            onClick={() => onRevertAndRetry(msg.id)}
                            disabled={loading}
                            title="Go back to the question this answered and ask it again"
                          >
                            Revert &amp; Retry
                          </Button>
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
                  <Button
                    variant="secondary"
                    size="xs"
                    onClick={onCancel}
                    title="Cancel generation"
                    style={{ marginLeft: "auto" }}
                  >
                    Cancel
                  </Button>
                </div>
              </div>
            ) : null}

            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {error ? (
        <StatusMessage variant="banner" tone="err" icon="AlertCircle">
          {error}
        </StatusMessage>
      ) : null}

      {/* ── Input Footer ── */}
      <footer className="brainstorm-input-footer">
        <TextArea
          ref={inputRef}
          rows={2}
          size="sm"
          value={inputText}
          onChange={(e) => setInputText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Ask for ideas, section edits (e.g. 'Update [Likes] to include tea brewing'), or dialogue…"
          disabled={loading}
          className="brainstorm-textarea"
        />
        <Button
          variant="ai"
          size="md"
          iconOnly
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
        </Button>
      </footer>
    </div>
  );
}
