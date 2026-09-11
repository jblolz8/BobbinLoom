import { useEffect, useMemo, useRef, useState } from "react";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import { buildImageUrl, type TokenUsage } from "../../../api";
import type { FailedResponseNotice, ImagePromptRequest } from "../../../hooks/usePlaythrough";
import { ContextMeter } from "../../common/ContextMeter";
import { MarkdownView } from "../../common/MarkdownView";
import { Badge, Button, Icon, ModelBadge, TextArea } from "../../base";
import { ImagePromptModal } from "./ImagePromptModal";

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
  showGenerationTime?: boolean;
  showMessageTimestamps?: boolean;
  showModelName?: boolean;
  canContinue: boolean;
  onChoiceSelect: (text: string) => void;
  editingMessageId: string | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRetryRequest: (msg: ChatMessage) => void;
  onRequestTruncate: (msg: ChatMessage) => void;
  onBranchRequest?: (msg: ChatMessage) => void;
  lastPatchInfo: { applied: string[]; rejected: string[]; warnings: string[] };
  sendingMessage: string | null;
  cancelledNotice: string | null;
  failedNotice?: FailedResponseNotice | null;
  onDismissNotice: () => void;
  onDismissFailedNotice?: () => void;
  onCancel: () => void;
  tokenUsage: TokenUsage | null;
  viewingChapterId: string | null;
  onReturnToCurrentChapter: () => void;
  onResummarizeChapter: (chapterId: string) => void;
  resummarizingChapterId: string | null;
  rawInput: string | null;
  rawOutput: string | null;
  className?: string;
  // ── Generated images ──
  /** Whether ANY image connection is configured. Derived in PlayView from the
   *  provider registry so this panel stays presentational. */
  hasImageProvider?: boolean;
  imageGeneratingId?: string | null;
  /** The text call that writes a prompt is in flight for this message. */
  imagePreviewMessageId?: string | null;
  /** An image is being removed from this message. */
  imageDeletingId?: string | null;
  /** The composed prompt awaiting review; non-null renders the modal. */
  imagePromptRequest?: ImagePromptRequest | null;
  imageCharacterLimit?: number;
  imageProviderLabel?: string;
  imageProviderModel?: string;
  onGenerateImage?: (msg: ChatMessage) => void;
  onCancelImage?: () => void;
  onDeleteImage?: (msg: ChatMessage, file: string) => void;
  onImagePromptGenerate?: (prompt: string, negativePrompt: string) => void;
  onImagePromptRerun?: () => void;
  onImagePromptClose?: () => void;
};



function prettyJson(raw: string | null): string {
  if (!raw) return "";
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

function formatMessageTime(iso?: string): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      weekday: "short",
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit"
    });
  } catch {
    return "";
  }
}

function formatMessageFullDate(iso?: string): string {
  if (!iso) return "";
  try {
    const date = new Date(iso);
    if (isNaN(date.getTime())) return "";
    return date.toLocaleString([], {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit"
    });
  } catch {
    return "";
  }
}

function formatDuration(ms?: number): string {
  if (ms === undefined || ms === null) return "";
  if (ms < 100) return "<0.1s";
  return `${(ms / 1000).toFixed(1)}s`;
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
        hiddenMessages: playthrough.messages.filter(m => m.hidden).length, // archived chapters + synthetic instructions
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
      <summary className="debug-summary">Debug</summary>
      <div className="debug-header-row">
        <div className="debug-tabs">
          <button type="button" className={`debug-tab ${debugTab === "patch" ? "active" : ""}`} onClick={() => setDebugTab("patch")}>Patch</button>
          <button type="button" className={`debug-tab ${debugTab === "output" ? "active" : ""}`} onClick={() => setDebugTab("output")}>Output</button>
          <button type="button" className={`debug-tab ${debugTab === "input" ? "active" : ""}`} onClick={() => setDebugTab("input")}>Input</button>
        </div>
        <Button
          size="xs"
          variant="ghost"
          className="debug-copy-btn"
          onClick={handleCopy}
          leftIcon={<Icon name={copied ? "Check" : "Copy"} size={12} />}
          title="Copy to clipboard"
        >
          {copied ? "Copied" : "Copy"}
        </Button>
      </div>
      <pre className="debug-pre">{tabContent}</pre>
    </details>
  );
}

function ErrorNotice({
  notice,
  onDismiss
}: {
  notice: FailedResponseNotice;
  onDismiss: () => void;
}) {
  const [copied, setCopied] = useState(false);

  const formattedError = useMemo(() => {
    if (!notice.rawError) return "";
    try {
      const parsed = JSON.parse(notice.rawError);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return notice.rawError;
    }
  }, [notice.rawError]);

  const handleCopy = () => {
    if (formattedError) {
      navigator.clipboard.writeText(formattedError);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <article className="message system error-notice">
      <div className="error-notice-header">
        <div className="error-notice-title">
          <Icon name="AlertCircle" size={16} className="error-notice-icon text-danger" />
          <strong>{notice.message}</strong>
          {notice.durationMs !== undefined && notice.durationMs > 0 ? (
            <span className="error-notice-duration">({(notice.durationMs / 1000).toFixed(1)}s)</span>
          ) : null}
        </div>
        <Button
          size="xs"
          variant="ghost"
          iconOnly
          className="dismiss-notice-btn"
          onClick={onDismiss}
          leftIcon={<Icon name="X" size={13} />}
          title="Dismiss notice"
          aria-label="Dismiss notice"
        />
      </div>

      {formattedError ? (
        <div className="error-code-wrapper">
          <div className="error-code-header">
            <span className="error-code-label">Error Details</span>
            <Button
              size="xs"
              variant="ghost"
              className="error-copy-btn"
              onClick={handleCopy}
              leftIcon={<Icon name={copied ? "Check" : "Copy"} size={12} />}
              title="Copy error details"
            >
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
          <pre className="error-code-block">
            <code>{formattedError}</code>
          </pre>
        </div>
      ) : null}
    </article>
  );
}

function GeneratingResponse({ showGenerationTime }: { showGenerationTime: boolean }) {
  const [elapsedMs, setElapsedMs] = useState(0);

  useEffect(() => {
    const start = performance.now();
    const interval = setInterval(() => {
      setElapsedMs(Math.round(performance.now() - start));
    }, 100);

    return () => clearInterval(interval);
  }, []);

  return (
    <article className="message assistant generating">
      <div className="message-header">
        <div className="message-header-info">
          <strong>BobbinLoom</strong>
          {showGenerationTime ? (
            <span className="message-duration generating" title="Elapsed generation time">
              <Icon name="Clock" size={10} />
              <span>{(elapsedMs / 1000).toFixed(1)}s</span>
            </span>
          ) : null}
        </div>
      </div>
      <p className="generating-placeholder">Generating response…</p>
    </article>
  );
}

export function ChatPanel(props: ChatPanelProps) {
  const {
    playthrough, input, onInputChange, onSend, loading, actionLoading,
    choices, choicesEnabled, showDebug, showContextUsage,
    showGenerationTime = true, showMessageTimestamps = true, showModelName = true,
    canContinue,
    onChoiceSelect,
    editingMessageId, editDraft, onEditDraftChange, onStartEdit, onSaveEdit, onCancelEdit,
    onRetryRequest, onRequestTruncate, onBranchRequest, lastPatchInfo,
    sendingMessage, cancelledNotice, failedNotice, onDismissNotice, onDismissFailedNotice, onCancel, tokenUsage,
    viewingChapterId, onReturnToCurrentChapter,
    onResummarizeChapter, resummarizingChapterId,
    rawInput, rawOutput, className,
    hasImageProvider = false,
    imageGeneratingId = null,
    imagePreviewMessageId = null,
    imageDeletingId = null,
    imagePromptRequest = null,
    imageCharacterLimit,
    imageProviderLabel,
    imageProviderModel,
    onGenerateImage,
    onCancelImage,
    onDeleteImage,
    onImagePromptGenerate,
    onImagePromptRerun,
    onImagePromptClose
  } = props;

  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [playthrough.messages.length, loading, sendingMessage, cancelledNotice, failedNotice]);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && (input.trim() || canContinue)) {
        onSend();
      }
    }
  }

  const isViewingArchive = viewingChapterId !== null;
  const chapterName = isViewingArchive
    ? (playthrough.chapters ?? [])[(playthrough.chapters ?? []).findIndex(ch => ch.id === viewingChapterId)]?.name ?? "Archived Chapter"
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
            <Button size="xs" variant="secondary" onClick={onReturnToCurrentChapter}>Return to current chapter</Button>
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
              <div className="message-header-info">
                <strong>{msg.role === "user" ? "You" : "BobbinLoom"}</strong>
                {showModelName && msg.role === "assistant" && msg.model ? (
                  <ModelBadge model={msg.model} />
                ) : null}
                {msg.editedAt ? <span className="edited-tag" title={`Edited: ${formatMessageFullDate(msg.editedAt)}`}>(edited)</span> : null}
                {showMessageTimestamps && msg.createdAt ? (
                  <span className="message-timestamp" title={formatMessageFullDate(msg.createdAt)}>
                    {formatMessageTime(msg.createdAt)}
                  </span>
                ) : null}
                {showGenerationTime && msg.role === "assistant" && msg.durationMs !== undefined ? (
                  <Badge
                    variant="neutral"
                    size="xs"
                    leftIcon={<Icon name="Clock" size={10} />}
                    title={`Response generation time: ${(msg.durationMs / 1000).toFixed(2)}s`}
                  >
                    {formatDuration(msg.durationMs)}
                  </Badge>
                ) : null}
              </div>
              <div className="message-actions">
                <Button
                  size="xs"
                  variant="ghost"
                  className="message-action"
                  onClick={() => onStartEdit(msg)}
                  disabled={actionLoading || editingMessageId === msg.id || loading}
                  leftIcon={<Icon name="Pencil" size={11} />}
                >
                  Edit
                </Button>
                {msg.role === "assistant" ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="message-action retry"
                    onClick={() => onRetryRequest(msg)}
                    disabled={actionLoading || loading}
                    leftIcon={<Icon name="RefreshCw" size={11} />}
                  >
                    Retry
                  </Button>
                ) : null}
                <Button
                  size="xs"
                  variant="ghost"
                  className="message-action branch"
                  onClick={() => onBranchRequest?.(msg)}
                  disabled={actionLoading || loading}
                  leftIcon={<Icon name="GitBranch" size={11} />}
                  title="Branch into a new playthrough timeline from here"
                >
                  Branch
                </Button>
                {msg.chapterOpening && previousChapter ? (
                  <Button
                    size="xs"
                    variant="ghost"
                    className="message-action resummarize"
                    onClick={() => onResummarizeChapter(previousChapter.id)}
                    disabled={actionLoading || loading || isResummarizing}
                    leftIcon={<Icon name="BookOpen" size={11} />}
                    title="Re-summarize the previous chapter (updates the chapter record for future turns)"
                  >
                    {isResummarizing ? "Summarizing…" : "Re-summarize previous chapter"}
                  </Button>
                ) : null}
              </div>
            </div>
            {editingMessageId === msg.id ? (
              <div className="edit-area">
                <TextArea
                  value={editDraft}
                  onChange={(e) => onEditDraftChange(e.target.value)}
                  rows={Math.min(12, Math.max(3, editDraft.split("\n").length))}
                  className="edit-draft-textarea"
                />
                <div className="edit-actions">
                  <Button
                    size="sm"
                    variant="primary"
                    onClick={onSaveEdit}
                    disabled={actionLoading || !editDraft.trim()}
                    isLoading={actionLoading}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={onCancelEdit}
                    disabled={actionLoading}
                  >
                    Cancel
                  </Button>
                  <Button
                    size="sm"
                    variant="danger"
                    onClick={() => onRequestTruncate(msg)}
                    disabled={actionLoading}
                    leftIcon={<Icon name="Trash2" size={12} />}
                    title="Permanently delete this message and everything after it"
                  >
                    Delete up to here
                  </Button>
                </div>
              </div>
            ) : (
              <MarkdownView content={msg.content} />
            )}
            {msg.role === "assistant" ? (
              <>
                {msg.images && msg.images.length > 0 ? (
                  <div className="message-images">
                    {msg.images.map((img, index) => (
                      <figure key={`${img.file}-${index}`} className="message-image">
                        <img
                          src={buildImageUrl(img.file)}
                          alt={img.prompt.slice(0, 120)}
                          title={img.prompt}
                          loading="lazy"
                        />
                        <button
                          type="button"
                          className="message-image-remove"
                          title="Remove this image? The file is deleted if nothing else uses it."
                          aria-label="Remove this image"
                          onClick={() => onDeleteImage?.(msg, img.file)}
                          disabled={imageDeletingId === msg.id || imageGeneratingId === msg.id}
                        >
                          <Icon name={imageDeletingId === msg.id ? "Loader" : "X"} size={11} className={imageDeletingId === msg.id ? "animate-spin" : ""} />
                        </button>
                        <figcaption title={img.prompt}>
                          {img.model}
                          {img.durationMs ? ` · ${(img.durationMs / 1000).toFixed(1)}s` : ""}
                          {img.seed ? ` · seed ${img.seed}` : ""}
                        </figcaption>
                      </figure>
                    ))}
                  </div>
                ) : null}
                <div className="message-footer">
                  {imageGeneratingId === msg.id ? (
                    <>
                      <span className="message-image-status">
                        <Icon name="Loader" size={12} className="animate-spin" /> Generating image…
                      </span>
                      <Button
                        size="xs"
                        variant="danger"
                        className="message-action cancel-image"
                        onClick={onCancelImage}
                        leftIcon={<Icon name="Square" size={11} />}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : imagePreviewMessageId === msg.id ? (
                    <>
                      <span className="message-image-status">
                        <Icon name="Loader" size={12} className="animate-spin" /> Writing image prompt…
                      </span>
                      <Button
                        size="xs"
                        variant="danger"
                        className="message-action cancel-image"
                        onClick={onCancelImage}
                        leftIcon={<Icon name="Square" size={11} />}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="xs"
                      variant="ghost"
                      className="message-action message-image-generate"
                      onClick={() => onGenerateImage?.(msg)}
                      disabled={!hasImageProvider || actionLoading || loading || imageDeletingId === msg.id}
                      title={
                        !hasImageProvider
                          ? "No image provider configured — add one in Settings → Provider → Images"
                          : actionLoading || loading
                            ? "Another action is in progress"
                            : "Generate an image for this message"
                      }
                      leftIcon={<Icon name="Image" size={11} />}
                    >
                      {msg.images && msg.images.length > 0 ? "Generate another" : "Generate Image"}
                    </Button>
                  )}
                </div>
              </>
            ) : null}
          </article>
          );
        })}

        {sendingMessage ? (
          <>
            <article className="message user optimistic">
              <div className="message-header">
                <div className="message-header-info">
                  <strong>You</strong>
                  {showMessageTimestamps ? (
                    <span className="message-timestamp sending">Sending…</span>
                  ) : null}
                </div>
              </div>
              <MarkdownView content={sendingMessage} />
            </article>
            <GeneratingResponse showGenerationTime={showGenerationTime} />
          </>
        ) : null}

        {!sendingMessage && loading ? (
          <GeneratingResponse showGenerationTime={showGenerationTime} />
        ) : null}

        {cancelledNotice ? (
          <article className="message system cancelled-notice">
            <div className="cancelled-notice-text flex items-center gap-2">
              <Icon name="Ban" size={13} className="text-muted" />
              <p>{cancelledNotice}</p>
            </div>
            <Button
              size="xs"
              variant="ghost"
              iconOnly
              className="dismiss-notice-btn"
              onClick={onDismissNotice}
              leftIcon={<Icon name="X" size={13} />}
              title="Dismiss"
              aria-label="Dismiss notice"
            />
          </article>
        ) : null}

        {failedNotice ? (
          <ErrorNotice
            notice={failedNotice}
            onDismiss={onDismissFailedNotice ?? onDismissNotice}
          />
        ) : null}

        <div ref={messagesEndRef} />
      </div>

      {imagePromptRequest ? (
        <ImagePromptModal
          prompt={imagePromptRequest.prompt}
          negativePrompt={imagePromptRequest.negativePrompt}
          providerLabel={imageProviderLabel}
          model={imageProviderModel}
          characterLimit={imageCharacterLimit}
          generating={imageGeneratingId === imagePromptRequest.message.id}
          rerunning={imagePreviewMessageId === imagePromptRequest.message.id}
          onGenerate={(prompt, negativePrompt) => onImagePromptGenerate?.(prompt, negativePrompt)}
          onRerun={() => onImagePromptRerun?.()}
          onClose={() => onImagePromptClose?.()}
        />
      ) : null}

      {choicesEnabled && choices.length > 0 && !loading ? (
        <div className="choices">
          {choices.map((c) => (
            <Button
              key={c}
              size="sm"
              variant="secondary"
              className="choice-btn"
              onClick={() => onChoiceSelect(c)}
            >
              {c}
            </Button>
          ))}
        </div>
      ) : null}

      {!isViewingArchive ? (
        <div className="prompt-card-container">
          <TextArea
            value={input}
            onChange={(e) => onInputChange(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder='Plain text is action. "Quoted text" is dialogue.'
            rows={3}
            disabled={loading}
            className="prompt-card-textarea"
          />
          <div className="prompt-card-footer">
            <div className="prompt-card-hints">
              <span className="prompt-hint-item">
                <kbd className="prompt-kbd">Enter ↵</kbd> send
              </span>
              <span className="prompt-hint-dot">·</span>
              <span className="prompt-hint-item">
                <kbd className="prompt-kbd">Shift + Enter</kbd> new line
              </span>
            </div>
            <div className="prompt-card-actions">
              {loading ? (
                <Button
                  size="sm"
                  variant="danger"
                  className="cancel-btn"
                  onClick={onCancel}
                  leftIcon={<Icon name="Square" size={12} />}
                >
                  Cancel
                </Button>
              ) : (
                <Button
                  size="sm"
                  variant="primary"
                  className="send-btn"
                  onClick={onSend}
                  disabled={!input.trim() && !canContinue}
                  leftIcon={<Icon name={!input.trim() && canContinue ? "FastForward" : "Send"} size={13} />}
                  title={!input.trim() && canContinue ? "Ask the AI to respond to your last message" : undefined}
                >
                  {!input.trim() && canContinue ? "Continue" : "Send"}
                </Button>
              )}
            </div>
          </div>
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
