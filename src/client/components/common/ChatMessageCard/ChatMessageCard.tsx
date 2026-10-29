import { useEffect, useMemo, useState } from "react";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import {
  buildImageUrl,
  type ImageGenerationProgress,
  type TokenUsage,
} from "../../../api";
import { formatDuration, imageCaption } from "../../../engine/displayFormat";
import type { FailedResponseNotice } from "../../../hooks/usePlaythrough";
import {
  Accordion,
  Badge,
  Button,
  CodeBlock,
  Icon,
  IconButton,
  ModelBadge,
  Separator,
  Stack,
  Tabs,
  type TabItem,
  TextArea,
} from "../../base";
import type { ImageViewerImage } from "../ImageViewer/ImageViewer";
import { MarkdownView } from "../MarkdownView/MarkdownView";
import "./ChatMessageCard.css";

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
      minute: "2-digit",
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
      second: "2-digit",
    });
  } catch {
    return "";
  }
}

export function imageProgressDisplay(
  progress: ImageGenerationProgress | null | undefined,
): { label: string; percent: number } | null {
  if (!progress?.active) return null;

  const stepRatio =
    progress.step !== undefined &&
    progress.steps !== undefined &&
    progress.steps > 0
      ? progress.step / progress.steps
      : null;
  const ratio = progress.progress ?? stepRatio;
  const percent =
    ratio === null || ratio === undefined
      ? null
      : Math.round(Math.min(Math.max(ratio, 0), 1) * 100);

  const parts: string[] = [];
  if (progress.step !== undefined && progress.steps !== undefined) {
    parts.push(`Sampling ${progress.step}/${progress.steps}`);
  }
  if (percent !== null) parts.push(`${percent}%`);
  if (!parts.length) return null;
  return { label: parts.join(" · "), percent: percent ?? 0 };
}

type DebugTabId = "patch" | "output" | "input";

const DEBUG_TABS: TabItem<DebugTabId>[] = [
  { id: "patch", label: "Patch" },
  { id: "output", label: "Output" },
  { id: "input", label: "Input" },
];

export interface ChatDebugAccordionProps {
  lastPatchInfo: { applied: string[]; rejected: string[]; warnings: string[] };
  tokenUsage: TokenUsage | null;
  playthrough: Playthrough;
  rawInput: string | null;
  rawOutput: string | null;
}

export function ChatDebugAccordion({
  lastPatchInfo,
  tokenUsage,
  playthrough,
  rawInput,
  rawOutput,
}: ChatDebugAccordionProps) {
  const [debugTab, setDebugTab] = useState<DebugTabId>("patch");

  const tabContent = useMemo(() => {
    if (debugTab === "input") {
      return rawInput ? prettyJson(rawInput) : "No turn data yet.";
    }
    if (debugTab === "output") {
      return rawOutput ? prettyJson(rawOutput) : "No turn data yet.";
    }
    return JSON.stringify(
      {
        patch: lastPatchInfo,
        tokenUsage,
        cast: tokenUsage?.castPresence ?? { present: 0, absent: 0 },
        memory: {
          recent: playthrough.memoryLayers?.recent?.length ?? 0,
          compressed: playthrough.memoryLayers?.compressed?.length ?? 0,
          legacy: playthrough.memoryEvents?.length ?? 0,
          hiddenMessages: playthrough.messages.filter((m) => m.hidden).length,
          visibleMessages: playthrough.messages.filter((m) => !m.hidden).length,
        },
      },
      null,
      2,
    );
  }, [debugTab, lastPatchInfo, tokenUsage, playthrough, rawInput, rawOutput]);

  const appliedCount = lastPatchInfo.applied.length;
  const issueCount =
    lastPatchInfo.rejected.length + lastPatchInfo.warnings.length;

  const summaryBadges = (
    <Stack direction="row" align="center" gap="xs" wrap>
      {appliedCount > 0 ? (
        <Badge variant="neutral" size="xs">
          +{appliedCount} patch {appliedCount === 1 ? "op" : "ops"}
        </Badge>
      ) : null}
      {issueCount > 0 ? (
        <Badge
          variant="warning"
          size="xs"
          leftIcon={<Icon name="AlertTriangle" size={10} />}
        >
          {issueCount} {issueCount === 1 ? "warning" : "warnings"}
        </Badge>
      ) : null}
    </Stack>
  );

  return (
    <Accordion
      variant="panel"
      size="sm"
      icon="Bug"
      title="Debug"
      badge={summaryBadges}
      className="chat-debug-accordion"
    >
      <CodeBlock
        code={tabContent}
        tone="panel"
        wrap
        maxHeight={240}
        copyTitle="Copy debug output to clipboard"
        headerExtra={
          <Tabs<DebugTabId>
            tabs={DEBUG_TABS}
            activeTab={debugTab}
            onChange={setDebugTab}
            variant="segmented"
            size="sm"
          />
        }
      />
    </Accordion>
  );
}

export function FailedTurnNotice({
  notice,
  onDismiss,
}: {
  notice: FailedResponseNotice;
  onDismiss: () => void;
}) {
  const formattedError = useMemo(() => {
    if (!notice.rawError) return "";
    try {
      const parsed = JSON.parse(notice.rawError);
      return JSON.stringify(parsed, null, 2);
    } catch {
      return notice.rawError;
    }
  }, [notice.rawError]);

  return (
    <article className="message system error-notice">
      <div className="error-notice-header">
        <div className="error-notice-title">
          <Icon
            name="AlertCircle"
            size={16}
            className="error-notice-icon text-danger"
          />
          <strong>{notice.message}</strong>
          {notice.durationMs !== undefined && notice.durationMs > 0 ? (
            <span className="error-notice-duration">
              ({(notice.durationMs / 1000).toFixed(1)}s)
            </span>
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
        <>
          <Separator spacing="xs" />
          <CodeBlock
            code={formattedError}
            label="Error Details"
            tone="error"
            wrap
            maxHeight={220}
            copyTitle="Copy error details"
          />
        </>
      ) : null}
    </article>
  );
}

export function CancelledTurnNotice({
  notice,
  onDismiss,
}: {
  notice: string;
  onDismiss: () => void;
}) {
  return (
    <article className="message system cancelled-notice">
      <div className="cancelled-notice-text flex items-center gap-2">
        <Icon name="Ban" size={13} className="text-muted" />
        <p>{notice}</p>
      </div>
      <Button
        size="xs"
        variant="ghost"
        iconOnly
        className="dismiss-notice-btn"
        onClick={onDismiss}
        leftIcon={<Icon name="X" size={13} />}
        title="Dismiss"
        aria-label="Dismiss notice"
      />
    </article>
  );
}

export function OptimisticUserMessage({
  content,
  messageNumber,
  showMessageNumbers,
  showMessageTimestamps,
}: {
  content: string;
  messageNumber: number;
  showMessageNumbers: boolean;
  showMessageTimestamps: boolean;
}) {
  return (
    <article className="message user optimistic">
      <div className="message-header">
        <div className="message-header-info">
          <strong>You</strong>
          {showMessageNumbers ? (
            <span
              className="message-number-badge"
              title={`Message #${messageNumber}`}
            >
              #{messageNumber}
            </span>
          ) : null}
          {showMessageTimestamps ? (
            <span className="message-timestamp sending">Sending…</span>
          ) : null}
        </div>
      </div>
      <Separator spacing="xs" />
      <MarkdownView content={content} />
    </article>
  );
}

export function GeneratingResponse({
  showGenerationTime,
}: {
  showGenerationTime: boolean;
}) {
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
            <Badge
              variant="neutral"
              size="xs"
              leftIcon={<Icon name="Clock" size={10} />}
              title="Elapsed generation time"
            >
              {(elapsedMs / 1000).toFixed(1)}s
            </Badge>
          ) : null}
        </div>
      </div>
      <Separator spacing="xs" />
      <p className="generating-placeholder">Generating response…</p>
    </article>
  );
}

function ImageRequestDisclosure({
  request,
  durationMs,
}: {
  request: string;
  durationMs?: number;
}) {
  const formatted = useMemo(() => {
    try {
      return JSON.stringify(JSON.parse(request), null, 2);
    } catch {
      return request;
    }
  }, [request]);

  const title = `image request${durationMs ? ` · ${formatDuration(durationMs)}` : ""}`;

  return (
    <Accordion
      variant="ghost"
      size="sm"
      monoTitle
      title={title}
      className="message-image-request"
    >
      <CodeBlock
        code={formatted}
        label="Request body"
        tone="muted"
        wrap
        maxHeight={180}
        copyTitle="Copy request body"
      />
    </Accordion>
  );
}

function ImagePromptCallDisclosure({
  request,
  response,
  promptDurationMs,
}: {
  request: string;
  response?: string;
  promptDurationMs?: number;
}) {
  const [requestText, responseText] = useMemo(() => {
    const pretty = (raw: string | undefined) => {
      if (!raw) return "";
      try {
        return JSON.stringify(JSON.parse(raw), null, 2);
      } catch {
        return raw;
      }
    };
    return [pretty(request), pretty(response)];
  }, [request, response]);

  const title = `prompt call${promptDurationMs ? ` · ${formatDuration(promptDurationMs)}` : ""}`;

  return (
    <Accordion
      variant="ghost"
      size="sm"
      monoTitle
      title={title}
      className="message-image-request message-image-prompt-call"
    >
      <CodeBlock
        code={requestText}
        label="Request"
        tone="muted"
        wrap
        maxHeight={150}
        copyTitle="Copy prompt call request"
      />
      {responseText ? (
        <CodeBlock
          code={responseText}
          label="Response"
          tone="muted"
          wrap
          maxHeight={150}
          copyTitle="Copy prompt call response"
        />
      ) : null}
    </Accordion>
  );
}

export interface ChatMessageCardProps {
  message: ChatMessage;
  messageIndex: number;
  isRetrying: boolean;
  isDoomed: boolean;
  isViewingArchive: boolean;
  previousChapterId?: string;
  isResummarizing: boolean;
  showMessageNumbers: boolean;
  showModelName: boolean;
  showMessageTimestamps: boolean;
  showGenerationTime: boolean;
  actionLoading: boolean;
  loading: boolean;
  editingMessageId: string | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRequestTruncate: (msg: ChatMessage) => void;
  onRetryRequest: (msg: ChatMessage) => void;
  onRevertRequest: (msg: ChatMessage) => void;
  onBranchRequest?: (msg: ChatMessage) => void;
  onResummarizeChapter: (chapterId: string) => void;
  hasImageProvider: boolean;
  imageGeneratingId: string | null;
  imagePreviewMessageId: string | null;
  imageDeletingId: string | null;
  renderElapsedMs: number | null;
  promptElapsedMs: number | null;
  imageProgress?: ImageGenerationProgress | null;
  progressDisplay: { label: string; percent: number } | null;
  onGenerateImage?: (msg: ChatMessage) => void;
  onCancelImage?: () => void;
  onDeleteImage?: (msg: ChatMessage, file: string) => void;
  onRetryImage?: (msg: ChatMessage, file: string) => void;
  onEditImageRequest?: (msg: ChatMessage, file: string) => void;
  onOpenViewer: (image: ImageViewerImage) => void;
}

export function ChatMessageCard({
  message: msg,
  messageIndex,
  isRetrying,
  isDoomed,
  isViewingArchive,
  previousChapterId,
  isResummarizing,
  showMessageNumbers,
  showModelName,
  showMessageTimestamps,
  showGenerationTime,
  actionLoading,
  loading,
  editingMessageId,
  editDraft,
  onEditDraftChange,
  onStartEdit,
  onSaveEdit,
  onCancelEdit,
  onRequestTruncate,
  onRetryRequest,
  onRevertRequest,
  onBranchRequest,
  onResummarizeChapter,
  hasImageProvider,
  imageGeneratingId,
  imagePreviewMessageId,
  imageDeletingId,
  renderElapsedMs,
  promptElapsedMs,
  imageProgress,
  progressDisplay,
  onGenerateImage,
  onCancelImage,
  onDeleteImage,
  onRetryImage,
  onEditImageRequest,
  onOpenViewer,
}: ChatMessageCardProps) {
  return (
    <article
      id={`message-${msg.id}`}
      className={`message ${msg.role}${isRetrying ? " message-retrying" : ""}${
        isDoomed ? " message-doomed" : ""
      }`}
    >
      <div className="message-header">
        <div className="message-header-info">
          <strong>{msg.role === "user" ? "You" : "BobbinLoom"}</strong>
          {showMessageNumbers ? (
            <span
              className="message-number-badge"
              title={`Message #${messageIndex}`}
            >
              #{messageIndex}
            </span>
          ) : null}
          {showModelName && msg.role === "assistant" && msg.model ? (
            <ModelBadge model={msg.model} />
          ) : null}
          {msg.editedAt ? (
            <span
              className="edited-tag"
              title={`Edited: ${formatMessageFullDate(msg.editedAt)}`}
            >
              (edited)
            </span>
          ) : null}
          {showMessageTimestamps && msg.createdAt ? (
            <span
              className="message-timestamp"
              title={formatMessageFullDate(msg.createdAt)}
            >
              {formatMessageTime(msg.createdAt)}
            </span>
          ) : null}
          {showGenerationTime &&
          msg.role === "assistant" &&
          msg.durationMs !== undefined ? (
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
            isViewingArchive ? (
              <Button
                size="xs"
                variant="ghost"
                className="message-action revert"
                onClick={() => onRevertRequest(msg)}
                disabled={actionLoading || loading}
                leftIcon={<Icon name="Undo2" size={11} />}
                title="Discard this response and everything after it, and make this chapter the running one"
              >
                Revert
              </Button>
            ) : (
              <Button
                size="xs"
                variant="ghost"
                className="message-action retry"
                onClick={() => onRetryRequest(msg)}
                disabled={actionLoading || loading}
                leftIcon={<Icon name="RefreshCw" size={11} />}
              >
                {isRetrying ? "Retrying…" : "Retry"}
              </Button>
            )
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
          {msg.chapterOpening && previousChapterId ? (
            <Button
              size="xs"
              variant="ghost"
              className="message-action resummarize"
              onClick={() => onResummarizeChapter(previousChapterId)}
              disabled={actionLoading || loading || isResummarizing}
              leftIcon={<Icon name="BookOpen" size={11} />}
              title="Re-summarize the previous chapter (updates the chapter record for future turns)"
            >
              {isResummarizing
                ? "Summarizing…"
                : "Re-summarize previous chapter"}
            </Button>
          ) : null}
        </div>
      </div>

      <Separator spacing="xs" />

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
          <Separator spacing="xs" />
          {msg.images && msg.images.length > 0 ? (
            <div className="message-images">
              {msg.images.map((img) => {
                const imageActionBusy =
                  imageDeletingId === msg.id ||
                  imageGeneratingId === msg.id ||
                  imagePreviewMessageId === msg.id;
                return (
                  <div key={img.file} className="message-image-block">
                    <figure className="message-image">
                      <button
                        type="button"
                        className="message-image-open"
                        title="View full screen"
                        aria-label="View this image full screen"
                        onClick={() =>
                          onOpenViewer({
                            src: buildImageUrl(img.file),
                            alt: img.prompt.slice(0, 120),
                            title: img.prompt,
                            caption: imageCaption(img),
                          })
                        }
                      >
                        <img
                          src={buildImageUrl(img.file)}
                          alt={img.prompt.slice(0, 120)}
                          title={img.prompt}
                          loading="lazy"
                        />
                      </button>
                      <IconButton
                        className="message-image-remove"
                        variant="overlay"
                        size="xs"
                        round
                        icon="X"
                        busy={imageDeletingId === msg.id}
                        label="Remove this image"
                        title="Remove this image? The file is deleted if nothing else uses it."
                        onClick={() => onDeleteImage?.(msg, img.file)}
                        disabled={
                          imageDeletingId === msg.id ||
                          imageGeneratingId === msg.id
                        }
                      />
                      <figcaption title={img.prompt}>
                        {imageCaption(img)}
                      </figcaption>
                    </figure>

                    {img.request ? (
                      <div className="message-image-actions">
                        <Button
                          size="xs"
                          variant="ghost"
                          className="message-image-retry"
                          disabled={imageActionBusy}
                          onClick={() => onRetryImage?.(msg, img.file)}
                          leftIcon={<Icon name="RefreshCw" size={11} />}
                          title="Send this image's request body again — no text model, and the same seed, size and checkpoint it used. It replaces this image."
                        >
                          Retry
                        </Button>
                        <Button
                          size="xs"
                          variant="ghost"
                          className="message-image-edit-request"
                          disabled={imageActionBusy}
                          onClick={() => onEditImageRequest?.(msg, img.file)}
                          leftIcon={<Icon name="Pencil" size={11} />}
                          title="Edit the JSON body that went to the image provider, then send it again"
                        >
                          Edit request
                        </Button>
                      </div>
                    ) : null}

                    {img.request ? (
                      <ImageRequestDisclosure
                        request={img.request}
                        durationMs={img.durationMs}
                      />
                    ) : null}
                    {img.promptRequest ? (
                      <ImagePromptCallDisclosure
                        request={img.promptRequest}
                        response={img.promptResponse}
                        promptDurationMs={img.promptDurationMs}
                      />
                    ) : null}
                  </div>
                );
              })}
            </div>
          ) : null}

          <div className="message-footer">
            {imageGeneratingId === msg.id ? (
              <>
                <span className="message-image-status">
                  <Icon name="Loader" size={12} className="animate-spin" />{" "}
                  Generating image…
                  {renderElapsedMs !== null ? (
                    <span className="message-image-elapsed">
                      {formatDuration(renderElapsedMs)}
                    </span>
                  ) : null}
                </span>
                {progressDisplay ? (
                  <span
                    className="message-image-progress"
                    role="progressbar"
                    aria-valuenow={progressDisplay.percent}
                    aria-valuemin={0}
                    aria-valuemax={100}
                    aria-label="Image generation progress"
                    title={
                      imageProgress?.etaSeconds !== undefined &&
                      imageProgress.etaSeconds > 0
                        ? `${progressDisplay.label} · about ${Math.round(imageProgress.etaSeconds)}s left`
                        : progressDisplay.label
                    }
                  >
                    <span
                      className="message-image-progress-bar"
                      aria-hidden="true"
                    >
                      <span
                        className="message-image-progress-fill"
                        style={{
                          width: `${progressDisplay.percent}%`,
                        }}
                      />
                    </span>
                    <span className="message-image-progress-text">
                      {progressDisplay.label}
                    </span>
                  </span>
                ) : null}
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
                  <Icon name="Loader" size={12} className="animate-spin" />{" "}
                  Writing image prompt…
                  {promptElapsedMs !== null ? (
                    <span className="message-image-elapsed">
                      {formatDuration(promptElapsedMs)}
                    </span>
                  ) : null}
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
                disabled={
                  !hasImageProvider ||
                  actionLoading ||
                  loading ||
                  imageDeletingId === msg.id
                }
                title={
                  !hasImageProvider
                    ? "No image provider configured — add one in Settings → Provider → Images"
                    : actionLoading || loading
                      ? "Another action is in progress"
                      : "Generate an image for this message"
                }
                leftIcon={<Icon name="Image" size={11} />}
              >
                {msg.images && msg.images.length > 0
                  ? "Generate another"
                  : "Generate Image"}
              </Button>
            )}
          </div>
        </>
      ) : null}
    </article>
  );
}
export default ChatMessageCard;
