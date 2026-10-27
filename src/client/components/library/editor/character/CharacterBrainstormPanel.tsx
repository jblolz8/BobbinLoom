import { useEffect, useRef, useState } from "react";
import type { TagTaxonomyConfig } from "../../../../../engine/tagTaxonomy";
import {
  Badge,
  Button,
  Card,
  Header,
  Icon,
  ModelBadge,
  Separator,
  Spinner,
  Stack,
  StatusMessage,
  TagChip,
  Text,
  TextArea,
} from "../../../base";
import { MarkdownView } from "../../../common";
import type {
  ProposedSectionChange,
  CharacterBrainstormResult,
} from "../../../../api";

export type BrainstormApplyableField =
  | "name"
  | "tags"
  | "creatorNotes"
  | "fullContent";

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
  appliedChanges?: Record<string, boolean>; // e.g. { "section:personality": true, "tags": true, "all": true }
};

export type CharacterBrainstormPanelProps = {
  characterName: string;
  /** Whether the card has an original CCv2 copy at all — the setting is only meaningful with one. */
  hasOriginalCcv2: boolean;
  includeOriginalCcv2: boolean;
  taxonomyConfig?: TagTaxonomyConfig | null;
  onOpenSettings: () => void;
  messages: BrainstormChatMessage[];
  onSendMessage: (text: string) => Promise<void>;
  onEditMessage: (messageId: string, text: string) => void;
  onRevertAndRetry: (messageId: string) => void;
  onRegenerate: (messageId: string) => void;
  onApplySection: (section: ProposedSectionChange, messageId: string) => void;
  onApplyField?: (
    field: BrainstormApplyableField,
    proposed: NonNullable<CharacterBrainstormResult["proposedChanges"]>,
    messageId: string,
  ) => void;
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
  taxonomyConfig,
  onOpenSettings,
  messages,
  onSendMessage,
  onEditMessage,
  onRevertAndRetry,
  onRegenerate,
  onApplySection,
  onApplyField,
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
    <Card
      variant="elevated"
      padding="none"
      fullWidth
      style={{
        display: "flex",
        flexDirection: "column",
        height: "100%",
        maxHeight: "100%",
        minHeight: 0,
        overflow: "hidden",
        borderColor: "var(--ai-accent-translucent)",
      }}
    >
      {/* ── Header ── */}
      <div
        style={{
          padding: "10px 14px",
          background: "var(--bg-surface-elevated)",
          borderBottom: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <Header
          variant="panel"
          icon={<Icon name="Sparkles" size={16} />}
          title="AI Brainstorm Assistant"
          subtitle={`Co-editing \u201c${characterName || "Character"}\u201d`}
          actions={
            <Stack direction="row" align="center" gap="xs">
              <Button
                variant="ghost"
                size="xs"
                iconOnly
                onClick={onOpenSettings}
                title="AI Brainstorm Assistant settings"
                aria-label="AI Brainstorm Assistant settings"
                style={{ position: "relative" }}
              >
                <Icon name="Settings" size={14} />
                {includeOriginalCcv2 ? (
                  <span
                    aria-hidden="true"
                    style={{
                      position: "absolute",
                      top: 4,
                      right: 4,
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--accent-highlight, var(--accent-base))",
                    }}
                  />
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
      </div>

      {/* ── Chat Message List ── */}
      <Stack
        direction="column"
        gap="md"
        flex1
        style={{
          minHeight: 0,
          overflowY: "auto",
          padding: "14px",
        }}
      >
        {messages.length === 0 ? (
          <Stack
            direction="column"
            gap="md"
            style={{ margin: "auto 0", padding: "8px 0" }}
          >
            <Card variant="elevated" padding="md">
              <Stack align="center" gap="xs">
                <span
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    color: "var(--ai-accent)",
                    margin: "0 auto 4px",
                  }}
                >
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
          </Stack>
        ) : (
          <Stack
            direction="column"
            gap="md"
            role="log"
            aria-live="polite"
            aria-label="Brainstorm conversation"
          >
            {messages.map((msg) => {
              const isUser = msg.role === "user";
              return (
                <div
                  key={msg.id}
                  style={{
                    display: "flex",
                    flexDirection: isUser ? "row-reverse" : "row",
                    gap: "10px",
                    alignItems: "flex-start",
                  }}
                >
                  <div
                    style={{
                      width: 26,
                      height: 26,
                      borderRadius: "50%",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      background: isUser
                        ? "var(--accent-base)"
                        : "var(--ai-accent)",
                      color: isUser ? "var(--accent-text)" : "#ffffff",
                      boxShadow: isUser
                        ? undefined
                        : "0 2px 6px var(--ai-accent-translucent)",
                    }}
                  >
                    <Icon
                      name={isUser ? "User" : "Sparkles"}
                      size={14}
                    />
                  </div>

                  <div
                    style={{
                      maxWidth: "88%",
                      minWidth: 0,
                      flex: "0 1 auto",
                      padding: "10px 14px",
                      borderRadius: 12,
                      borderTopLeftRadius: isUser ? 12 : 3,
                      borderTopRightRadius: isUser ? 3 : 12,
                      fontSize: "0.85rem",
                      lineHeight: 1.5,
                      wordBreak: "break-word",
                      background: isUser
                        ? "var(--chat-user-bg)"
                        : "var(--ai-bubble-bg)",
                      border: isUser
                        ? "1px solid var(--chat-user-border)"
                        : "1px solid var(--ai-bubble-border)",
                      color: isUser
                        ? "var(--chat-user-text)"
                        : "var(--ai-bubble-text)",
                    }}
                  >
                    <Stack direction="column" gap="sm">
                      {editingId === msg.id ? (
                        <Stack gap="xs">
                          <TextArea
                            value={editDraft}
                            onChange={(e) => setEditDraft(e.target.value)}
                            rows={3}
                            autoGrow
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
                        <MarkdownView content={msg.content} />
                      )}

                      {/* Proposed Changes Card */}
                      {msg.proposedChanges ? (
                        <Card
                          variant="elevated"
                          padding="sm"
                          style={{
                            borderColor: "var(--ai-accent-translucent)",
                          }}
                        >
                          {(() => {
                            const proposed = msg.proposedChanges!;
                            const applied = msg.appliedChanges ?? {};
                            const isAllFlagged = Boolean(applied.all);
                            const isNameApplied =
                              Boolean(applied.name) || isAllFlagged;
                            const isTagsApplied =
                              Boolean(applied.tags) || isAllFlagged;
                            const isNotesApplied =
                              Boolean(applied.creatorNotes) || isAllFlagged;
                            const isFullApplied =
                              Boolean(applied.fullContent) || isAllFlagged;

                            const sectionCount = proposed.sections?.length ?? 0;
                            const totalProposedItems =
                              sectionCount +
                              (proposed.name ? 1 : 0) +
                              (proposed.tags && proposed.tags.length > 0
                                ? 1
                                : 0) +
                              (proposed.creatorNotes ? 1 : 0) +
                              (proposed.fullContent ? 1 : 0);

                            const allSectionsApplied =
                              sectionCount === 0 ||
                              (proposed.sections ?? []).every(
                                (sec) =>
                                  Boolean(
                                    applied[
                                      `section:${sec.header.toLowerCase()}`
                                    ],
                                  ) || isAllFlagged,
                              );
                            const allItemsApplied =
                              isAllFlagged ||
                              (allSectionsApplied &&
                                (!proposed.name || isNameApplied) &&
                                (!(proposed.tags && proposed.tags.length > 0) ||
                                  isTagsApplied) &&
                                (!proposed.creatorNotes || isNotesApplied) &&
                                (!proposed.fullContent || isFullApplied));

                            const applySingleField = (
                              field: BrainstormApplyableField,
                            ) => {
                              if (onApplyField) {
                                onApplyField(field, proposed, msg.id);
                              } else {
                                onApplyAll(
                                  { [field]: proposed[field] },
                                  msg.id,
                                );
                              }
                            };

                            return (
                              <Stack gap="sm">
                                <Stack
                                  direction="row"
                                  justify="between"
                                  align="center"
                                >
                                  <Badge
                                    variant="info"
                                    size="xs"
                                    leftIcon={<Icon name="Sliders" size={11} />}
                                  >
                                    Proposed Sheet Updates
                                  </Badge>
                                </Stack>

                                {/* Sections */}
                                {proposed.sections &&
                                proposed.sections.length > 0 ? (
                                  <Stack gap="xs">
                                    {proposed.sections.map((sec, sIdx) => {
                                      const isApplied =
                                        Boolean(
                                          applied[
                                            `section:${sec.header.toLowerCase()}`
                                          ],
                                        ) || isAllFlagged;
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
                                                  isApplied
                                                    ? "primary"
                                                    : "secondary"
                                                }
                                                size="xs"
                                                leftIcon={
                                                  <Icon
                                                    name={
                                                      isApplied
                                                        ? "Check"
                                                        : "Plus"
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
                                            <pre
                                              style={{
                                                margin: 0,
                                                fontFamily: "inherit",
                                                fontSize: "0.76rem",
                                                color: "var(--text-secondary)",
                                                whiteSpace: "pre-wrap",
                                                wordBreak: "break-word",
                                                background:
                                                  "var(--bg-surface-elevated)",
                                                padding: "6px 8px",
                                                borderRadius: 6,
                                                border:
                                                  "1px solid var(--border-subtle)",
                                                maxHeight: 140,
                                                overflowY: "auto",
                                              }}
                                            >
                                              {sec.body}
                                            </pre>
                                          </Stack>
                                        </Card>
                                      );
                                    })}
                                  </Stack>
                                ) : null}

                                {/* Rename */}
                                {proposed.name ? (
                                  <Card variant="panel" padding="xs">
                                    <Stack
                                      direction="row"
                                      justify="between"
                                      align="center"
                                      gap="xs"
                                      wrap
                                    >
                                      <Stack gap="2xs">
                                        <Text
                                          size="xs"
                                          weight="semibold"
                                          tone="muted"
                                        >
                                          Character Name:
                                        </Text>
                                        <Stack
                                          direction="row"
                                          align="baseline"
                                          gap="xs"
                                          wrap
                                        >
                                          <Text size="xs" weight="semibold">
                                            {proposed.name}
                                          </Text>
                                          <Text size="xs" tone="muted">
                                            currently &ldquo;
                                            {characterName || "unnamed"}
                                            &rdquo;
                                          </Text>
                                        </Stack>
                                      </Stack>
                                      <Button
                                        variant={
                                          isNameApplied
                                            ? "primary"
                                            : "secondary"
                                        }
                                        size="xs"
                                        leftIcon={
                                          <Icon
                                            name={
                                              isNameApplied ? "Check" : "Plus"
                                            }
                                            size={11}
                                          />
                                        }
                                        onClick={() => applySingleField("name")}
                                        disabled={isNameApplied}
                                        title={
                                          isNameApplied
                                            ? "Character name applied to draft"
                                            : "Apply proposed character name"
                                        }
                                      >
                                        {isNameApplied
                                          ? "Applied"
                                          : "Apply Name"}
                                      </Button>
                                    </Stack>
                                  </Card>
                                ) : null}

                                {/* Tags */}
                                {proposed.tags && proposed.tags.length > 0 ? (
                                  <Card variant="panel" padding="xs">
                                    <Stack gap="xs">
                                      <Stack
                                        direction="row"
                                        justify="between"
                                        align="center"
                                        gap="xs"
                                        wrap
                                      >
                                        <Text
                                          size="xs"
                                          weight="semibold"
                                          tone="muted"
                                        >
                                          Tags ({proposed.tags.length}):
                                        </Text>
                                        <Button
                                          variant={
                                            isTagsApplied
                                              ? "primary"
                                              : "secondary"
                                          }
                                          size="xs"
                                          leftIcon={
                                            <Icon
                                              name={
                                                isTagsApplied ? "Check" : "Plus"
                                              }
                                              size={11}
                                            />
                                          }
                                          onClick={() =>
                                            applySingleField("tags")
                                          }
                                          disabled={isTagsApplied}
                                          title={
                                            isTagsApplied
                                              ? "Tags applied to draft"
                                              : "Apply proposed tags to sheet"
                                          }
                                        >
                                          {isTagsApplied
                                            ? "Applied"
                                            : "Apply Tags"}
                                        </Button>
                                      </Stack>
                                      <Stack direction="row" gap="2xs" wrap>
                                        {proposed.tags.map((tag) => (
                                          <TagChip
                                            key={tag}
                                            tag={tag}
                                            userConfig={taxonomyConfig}
                                            size="sm"
                                          />
                                        ))}
                                      </Stack>
                                    </Stack>
                                  </Card>
                                ) : null}

                                {/* Creator Notes */}
                                {proposed.creatorNotes ? (
                                  <Card variant="panel" padding="xs">
                                    <Stack gap="xs">
                                      <Stack
                                        direction="row"
                                        justify="between"
                                        align="center"
                                        gap="xs"
                                        wrap
                                      >
                                        <Text
                                          size="xs"
                                          weight="semibold"
                                          tone="muted"
                                        >
                                          Creator&apos;s Notes:
                                        </Text>
                                        <Button
                                          variant={
                                            isNotesApplied
                                              ? "primary"
                                              : "secondary"
                                          }
                                          size="xs"
                                          leftIcon={
                                            <Icon
                                              name={
                                                isNotesApplied
                                                  ? "Check"
                                                  : "Plus"
                                              }
                                              size={11}
                                            />
                                          }
                                          onClick={() =>
                                            applySingleField("creatorNotes")
                                          }
                                          disabled={isNotesApplied}
                                          title={
                                            isNotesApplied
                                              ? "Creator's Notes applied to draft"
                                              : "Apply proposed Creator's Notes"
                                          }
                                        >
                                          {isNotesApplied
                                            ? "Applied"
                                            : "Apply Notes"}
                                        </Button>
                                      </Stack>
                                      <Text size="xs" tone="secondary" italic>
                                        {proposed.creatorNotes}
                                      </Text>
                                    </Stack>
                                  </Card>
                                ) : null}

                                {/* Full Content Rewrite */}
                                {proposed.fullContent ? (
                                  <StatusMessage
                                    variant="banner"
                                    tone="warn"
                                    icon="TriangleAlert"
                                  >
                                    <Stack gap="xs">
                                      <Stack
                                        direction="row"
                                        justify="between"
                                        align="center"
                                        gap="xs"
                                        wrap
                                      >
                                        <Text size="xs">
                                          Rewrites the{" "}
                                          <strong>entire sheet</strong> — the
                                          current content is replaced
                                        </Text>
                                        <Button
                                          variant={
                                            isFullApplied
                                              ? "primary"
                                              : "secondary"
                                          }
                                          size="xs"
                                          leftIcon={
                                            <Icon
                                              name={
                                                isFullApplied ? "Check" : "Plus"
                                              }
                                              size={11}
                                            />
                                          }
                                          onClick={() =>
                                            applySingleField("fullContent")
                                          }
                                          disabled={isFullApplied}
                                          title={
                                            isFullApplied
                                              ? "Rewritten sheet applied to draft"
                                              : "Replace sheet content with rewritten sheet"
                                          }
                                        >
                                          {isFullApplied
                                            ? "Applied"
                                            : "Apply Rewrite"}
                                        </Button>
                                      </Stack>
                                      <details>
                                        <summary
                                          style={{
                                            cursor: "pointer",
                                            fontSize: "0.75rem",
                                            color: "var(--text-secondary)",
                                          }}
                                        >
                                          Preview the rewritten sheet
                                        </summary>
                                        <pre
                                          style={{
                                            margin: "4px 0 0",
                                            fontFamily: "inherit",
                                            fontSize: "0.76rem",
                                            color: "var(--text-secondary)",
                                            whiteSpace: "pre-wrap",
                                            wordBreak: "break-word",
                                            background:
                                              "var(--bg-surface-elevated)",
                                            padding: "6px 8px",
                                            borderRadius: 6,
                                            border:
                                              "1px solid var(--border-subtle)",
                                            maxHeight: 160,
                                            overflowY: "auto",
                                          }}
                                        >
                                          {proposed.fullContent}
                                        </pre>
                                      </details>
                                    </Stack>
                                  </StatusMessage>
                                ) : null}

                                {/* Unmapped headers */}
                                {msg.unmappedHeaders &&
                                msg.unmappedHeaders.length > 0 ? (
                                  <Stack
                                    direction="row"
                                    align="center"
                                    gap="xs"
                                  >
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
                                {totalProposedItems > 1 ? (
                                  <>
                                    <Separator spacing="none" />
                                    <Stack direction="row" justify="end">
                                      <Button
                                        variant="primary"
                                        size="xs"
                                        leftIcon={
                                          <Icon
                                            name={
                                              allItemsApplied
                                                ? "CheckCheck"
                                                : "Check"
                                            }
                                            size={13}
                                          />
                                        }
                                        onClick={() =>
                                          onApplyAll(proposed, msg.id)
                                        }
                                        disabled={allItemsApplied}
                                      >
                                        {allItemsApplied
                                          ? "All Changes Applied"
                                          : "Apply All Proposed Changes"}
                                      </Button>
                                    </Stack>
                                  </>
                                ) : null}
                              </Stack>
                            );
                          })()}
                        </Card>
                      ) : null}

                      {/* Message actions */}
                      {editingId === msg.id ? null : (
                        <Stack direction="row" gap="2xs" wrap align="center">
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

                          {isUser ? (
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
                        </Stack>
                      )}

                      {msg.role === "assistant" && msg.model ? (
                        <div>
                          <ModelBadge model={msg.model} />
                        </div>
                      ) : null}
                    </Stack>
                  </div>
                </div>
              );
            })}

            {loading ? (
              <Stack direction="row" gap="sm" align="start">
                <div
                  style={{
                    width: 26,
                    height: 26,
                    borderRadius: "50%",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    flexShrink: 0,
                    background: "var(--ai-accent)",
                    color: "#ffffff",
                    boxShadow: "0 2px 6px var(--ai-accent-translucent)",
                  }}
                >
                  <Icon name="Sparkles" size={14} pulse />
                </div>
                <Card
                  variant="panel"
                  padding="sm"
                  style={{
                    background: "var(--ai-bubble-bg)",
                    borderColor: "var(--ai-bubble-border)",
                  }}
                >
                  <Stack direction="row" align="center" gap="sm">
                    <Spinner size={14} />
                    <Text as="span" size="xs" tone="accent" italic>
                      Brainstorming ideas…
                    </Text>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={onCancel}
                      title="Cancel generation"
                    >
                      Cancel
                    </Button>
                  </Stack>
                </Card>
              </Stack>
            ) : null}

            <div ref={messagesEndRef} />
          </Stack>
        )}
      </Stack>

      {error ? (
        <div style={{ padding: "0 14px 8px", flexShrink: 0 }}>
          <StatusMessage variant="banner" tone="err" icon="AlertCircle">
            {error}
          </StatusMessage>
        </div>
      ) : null}

      {/* ── Input Footer ── */}
      <footer
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: "8px",
          padding: "10px 12px",
          background: "var(--bg-surface-elevated)",
          borderTop: "1px solid var(--border-subtle)",
          flexShrink: 0,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <TextArea
            ref={inputRef}
            rows={2}
            autoGrow
            autoGrowMax={110}
            size="sm"
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ask for ideas, section edits (e.g. 'Update [Likes] to include tea brewing'), or dialogue…"
            disabled={loading}
          />
        </div>
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
            <Icon name="Sparkles" size={16} pulse />
          ) : (
            <Icon name="Send" size={16} />
          )}
        </Button>
      </footer>
    </Card>
  );
}
