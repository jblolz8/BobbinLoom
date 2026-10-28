import type { CSSProperties } from "react";
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  AutoScrollBehavior,
  ChatMessage,
  Playthrough,
} from "../../../../schemas";
import type { ImageGenerationProgress, TokenUsage } from "../../../api";
import { useElapsed } from "../../../hooks/useElapsed";
import type {
  FailedResponseNotice,
  ImagePromptRequest,
} from "../../../hooks/usePlaythrough";
import { triggerHaptic } from "../../../utils/haptics";
import { Button, Icon, Stack, StatusMessage } from "../../base";
import {
  CancelledTurnNotice,
  ChatDebugAccordion,
  ChatMessageCard,
  ContextMeter,
  FailedTurnNotice,
  GeneratingResponse,
  ImageViewer,
  imageProgressDisplay,
  type ImageViewerImage,
  OptimisticUserMessage,
  PromptComposer,
} from "../../common";
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
  showMessageNumbers?: boolean;
  autoScrollBehavior?: AutoScrollBehavior;
  canContinue: boolean;
  onChoiceSelect: (choice: string) => void;
  editingMessageId: string | null;
  editDraft: string;
  onEditDraftChange: (value: string) => void;
  onStartEdit: (msg: ChatMessage) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
  onRetryRequest: (msg: ChatMessage) => void;
  /** The response a retry is replacing while the turn runs inline, so its bubble can dim. */
  retryingTargetId?: string | null;
  onRequestTruncate: (msg: ChatMessage) => void;
  onRevertRequest: (msg: ChatMessage) => void;
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
  style?: CSSProperties;
  // ── Generated images ──
  /** True when the global provider registry has at least one `kind: "image"` connection. */
  hasImageProvider?: boolean;
  imageGeneratingId?: string | null;
  imagePreviewMessageId?: string | null;
  imagePromptStartedAt?: number | null;
  imageGeneratingStartedAt?: number | null;
  imageDeletingId?: string | null;
  /** Live a1111 sampling progress while `imageGeneratingId` is running. */
  imageProgress?: ImageGenerationProgress | null;
  imagePromptRequest?: ImagePromptRequest | null;
  /** Soft character limit from the active playthrough's image settings (for the counter). */
  imageCharacterLimit?: number;
  imageProviderLabel?: string;
  imageProviderModel?: string;
  onGenerateImage?: (msg: ChatMessage) => void;
  onCancelImage?: () => void;
  onDeleteImage?: (msg: ChatMessage, file: string) => void;
  /** Re-send one image's stored request body (after the confirmation). */
  onRetryImage?: (msg: ChatMessage, file: string) => void;
  /** Open the JSON request-body editor for one image. */
  onEditImageRequest?: (msg: ChatMessage, file: string) => void;
  onImagePromptGenerate?: (prompt: string, negativePrompt: string) => void;
  onImagePromptRerun?: () => void;
  onImagePromptClose?: () => void;
};

export function ChatPanel(props: ChatPanelProps) {
  const {
    playthrough,
    input,
    onInputChange,
    onSend,
    loading,
    actionLoading,
    choices,
    choicesEnabled,
    showDebug,
    showContextUsage,
    showGenerationTime = true,
    showMessageTimestamps = true,
    showModelName = true,
    showMessageNumbers = true,
    autoScrollBehavior = "start",
    canContinue,
    onChoiceSelect,
    editingMessageId,
    editDraft,
    onEditDraftChange,
    onStartEdit,
    onSaveEdit,
    onCancelEdit,
    onRetryRequest,
    retryingTargetId = null,
    onRequestTruncate,
    onRevertRequest,
    onBranchRequest,
    lastPatchInfo,
    sendingMessage,
    cancelledNotice,
    failedNotice,
    onDismissNotice,
    onDismissFailedNotice,
    onCancel,
    tokenUsage,
    viewingChapterId,
    onReturnToCurrentChapter,
    onResummarizeChapter,
    resummarizingChapterId,
    rawInput,
    rawOutput,
    className,
    hasImageProvider = false,
    imageGeneratingId = null,
    imagePreviewMessageId = null,
    imagePromptStartedAt = null,
    imageGeneratingStartedAt = null,
    imageDeletingId = null,
    imageProgress = null,
    imagePromptRequest = null,
    imageCharacterLimit,
    imageProviderLabel,
    imageProviderModel,
    onGenerateImage,
    onCancelImage,
    onDeleteImage,
    onRetryImage,
    onEditImageRequest,
    onImagePromptGenerate,
    onImagePromptRerun,
    onImagePromptClose,
  } = props;

  const [viewerImage, setViewerImage] = useState<ImageViewerImage | null>(null);

  const messagesContainerRef = useRef<HTMLDivElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messagesStartRef = useRef<HTMLDivElement>(null);
  const [showScrollBottom, setShowScrollBottom] = useState(false);

  const lastPlaythroughIdRef = useRef<string | null>(null);
  const prevLoadingRef = useRef(loading);
  const prevSendingRef = useRef(sendingMessage);
  const prevMessagesLengthRef = useRef(playthrough.messages.length);

  const progressDisplay = imageGeneratingId
    ? imageProgressDisplay(imageProgress)
    : null;
  const promptElapsedMs = useElapsed(
    imagePromptStartedAt,
    imagePreviewMessageId !== null && imagePreviewMessageId !== undefined,
  );
  const renderElapsedMs = useElapsed(
    imageGeneratingStartedAt,
    imageGeneratingId !== null && imageGeneratingId !== undefined,
  );

  const handleScroll = useCallback(() => {
    const el = messagesContainerRef.current;
    if (!el) return;
    const distanceFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowScrollBottom(distanceFromBottom > 160);
  }, []);

  const scrollToBottom = useCallback(() => {
    triggerHaptic(8);
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const scrollToFirstPartOfMessage = useCallback((msgId: string) => {
    const performScroll = () => {
      const container = messagesContainerRef.current;
      const messageEl = document.getElementById(`message-${msgId}`);
      if (container && messageEl) {
        const containerRect = container.getBoundingClientRect();
        const messageRect = messageEl.getBoundingClientRect();
        const targetScrollTop =
          container.scrollTop + (messageRect.top - containerRect.top) - 12;
        container.scrollTo({
          top: Math.max(0, targetScrollTop),
          behavior: "smooth",
        });
        setShowScrollBottom(false);
        return true;
      }
      return false;
    };

    if (!performScroll()) {
      requestAnimationFrame(() => {
        if (!performScroll()) {
          messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
          setShowScrollBottom(false);
        }
      });
    }
  }, []);

  useEffect(() => {
    if (lastPlaythroughIdRef.current !== playthrough.id) {
      lastPlaythroughIdRef.current = playthrough.id;
      prevLoadingRef.current = loading;
      prevSendingRef.current = sendingMessage;
      prevMessagesLengthRef.current = playthrough.messages.length;
      messagesEndRef.current?.scrollIntoView({ behavior: "auto" });
      setShowScrollBottom(false);
      return;
    }

    const wasLoading = prevLoadingRef.current;
    const wasSending = prevSendingRef.current;
    const prevCount = prevMessagesLengthRef.current;

    prevLoadingRef.current = loading;
    prevSendingRef.current = sendingMessage;
    prevMessagesLengthRef.current = playthrough.messages.length;

    if ((!wasSending && sendingMessage) || (!wasLoading && loading)) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowScrollBottom(false);
      return;
    }

    const isNowSettled =
      (wasLoading && !loading) || (wasSending && !sendingMessage);
    const lastMessage = playthrough.messages[playthrough.messages.length - 1];
    const isNewAssistantMessage =
      isNowSettled &&
      lastMessage &&
      lastMessage.role === "assistant" &&
      !lastMessage.hidden;

    if (isNewAssistantMessage) {
      if (autoScrollBehavior === "start") {
        scrollToFirstPartOfMessage(lastMessage.id);
        return;
      } else if (autoScrollBehavior === "none") {
        return;
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        setShowScrollBottom(false);
        return;
      }
    }

    if (cancelledNotice || failedNotice) {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowScrollBottom(false);
      return;
    }

    if (playthrough.messages.length > prevCount) {
      if (lastMessage?.role === "assistant") {
        if (autoScrollBehavior === "start") {
          scrollToFirstPartOfMessage(lastMessage.id);
          return;
        } else if (autoScrollBehavior === "none") {
          return;
        }
      }
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
      setShowScrollBottom(false);
    }
  }, [
    playthrough.id,
    playthrough.messages,
    loading,
    sendingMessage,
    cancelledNotice,
    failedNotice,
    autoScrollBehavior,
    scrollToFirstPartOfMessage,
  ]);

  useEffect(() => {
    if (viewingChapterId === null) return;
    messagesStartRef.current?.scrollIntoView({ block: "start" });
  }, [viewingChapterId]);

  useEffect(() => {
    if (typeof window === "undefined" || !window.visualViewport) return;
    const vv = window.visualViewport;
    const handleViewportResize = () => {
      if (document.activeElement?.tagName === "TEXTAREA") {
        messagesEndRef.current?.scrollIntoView({
          behavior: "smooth",
          block: "end",
        });
      }
    };
    vv.addEventListener("resize", handleViewportResize);
    return () => {
      vv.removeEventListener("resize", handleViewportResize);
    };
  }, []);

  const handleInputFocus = useCallback(() => {
    setTimeout(() => {
      messagesEndRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "end",
      });
    }, 250);
  }, []);

  function handleKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      if (!loading && (input.trim() || canContinue)) {
        triggerHaptic(10);
        onSend();
      }
    }
  }

  const handleSendClick = useCallback(() => {
    triggerHaptic(10);
    onSend();
  }, [onSend]);

  const handleChoiceClick = useCallback(
    (c: string) => {
      triggerHaptic(8);
      onChoiceSelect(c);
    },
    [onChoiceSelect],
  );

  const isViewingArchive = viewingChapterId !== null;
  const chapterName = isViewingArchive
    ? ((playthrough.chapters ?? [])[
        (playthrough.chapters ?? []).findIndex(
          (ch) => ch.id === viewingChapterId,
        )
      ]?.name ?? "Archived Chapter")
    : "";

  const showRealMessages = isViewingArchive
    ? playthrough.messages.filter((m) => m.chapterId === viewingChapterId)
    : playthrough.messages.filter((m) => !m.hidden);

  const { messageIndexMap, totalStoryMessagesCount } = useMemo(() => {
    const map = new Map<string, number>();
    const allStoryMessages = playthrough.messages.filter(
      (m) => !m.hidden || m.chapterId,
    );
    allStoryMessages.forEach((msg, idx) => {
      map.set(msg.id, idx);
    });
    return {
      messageIndexMap: map,
      totalStoryMessagesCount: allStoryMessages.length,
    };
  }, [playthrough.messages]);

  const { doomedIds, firstDoomedId } = useMemo(() => {
    if (!retryingTargetId)
      return {
        doomedIds: null as Set<string> | null,
        firstDoomedId: null as string | null,
      };
    const index = playthrough.messages.findIndex(
      (message) => message.id === retryingTargetId,
    );
    if (index === -1)
      return {
        doomedIds: null as Set<string> | null,
        firstDoomedId: null as string | null,
      };
    const ids = playthrough.messages.slice(index + 1);
    return {
      doomedIds: new Set(ids.map((message) => message.id)),
      firstDoomedId: ids[0]?.id ?? null,
    };
  }, [playthrough.messages, retryingTargetId]);

  return (
    <section
      className={`chat-panel${className ? ` ${className}` : ""}`}
      style={props.style}
    >
      <div className="messages-wrap">
        <div
          className="messages"
          ref={messagesContainerRef}
          onScroll={handleScroll}
        >
          {isViewingArchive ? <div ref={messagesStartRef} /> : null}
          {isViewingArchive ? (
            <StatusMessage variant="banner" tone="neutral" icon="BookOpen">
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                wrap
              >
                <span>
                  Viewing archived chapter: <strong>{chapterName}</strong> —
                  history only. The running story is in the current chapter.
                </span>
                <Button
                  size="xs"
                  variant="secondary"
                  onClick={onReturnToCurrentChapter}
                >
                  Return to current chapter
                </Button>
              </Stack>
            </StatusMessage>
          ) : null}

          {showRealMessages.length === 0 && !sendingMessage ? (
            <p className="empty-chat">No messages yet.</p>
          ) : null}

          {showRealMessages.map((msg, index) => {
            const messageIndex = messageIndexMap.get(msg.id) ?? index;
            const previousChapter = msg.chapterOpening
              ? (playthrough.chapters ?? [])[
                  (playthrough.chapters ?? []).length - 1
                ]
              : undefined;
            const isResummarizing = previousChapter
              ? resummarizingChapterId === previousChapter.id
              : false;
            return (
              <Fragment key={msg.id}>
                {msg.id === firstDoomedId && doomedIds ? (
                  <div className="messages-doomed-note">
                    <Icon name="Trash2" size={11} />
                    <span>
                      {doomedIds.size} message{doomedIds.size === 1 ? "" : "s"}{" "}
                      after this will be discarded when the new response lands
                    </span>
                  </div>
                ) : null}
                <ChatMessageCard
                  message={msg}
                  messageIndex={messageIndex}
                  isRetrying={retryingTargetId === msg.id}
                  isDoomed={Boolean(doomedIds?.has(msg.id))}
                  isViewingArchive={isViewingArchive}
                  previousChapterId={previousChapter?.id}
                  isResummarizing={isResummarizing}
                  showMessageNumbers={showMessageNumbers}
                  showModelName={showModelName}
                  showMessageTimestamps={showMessageTimestamps}
                  showGenerationTime={showGenerationTime}
                  actionLoading={actionLoading}
                  loading={loading}
                  editingMessageId={editingMessageId}
                  editDraft={editDraft}
                  onEditDraftChange={onEditDraftChange}
                  onStartEdit={onStartEdit}
                  onSaveEdit={onSaveEdit}
                  onCancelEdit={onCancelEdit}
                  onRequestTruncate={onRequestTruncate}
                  onRetryRequest={onRetryRequest}
                  onRevertRequest={onRevertRequest}
                  onBranchRequest={onBranchRequest}
                  onResummarizeChapter={onResummarizeChapter}
                  hasImageProvider={hasImageProvider}
                  imageGeneratingId={imageGeneratingId}
                  imagePreviewMessageId={imagePreviewMessageId}
                  imageDeletingId={imageDeletingId}
                  renderElapsedMs={renderElapsedMs}
                  promptElapsedMs={promptElapsedMs}
                  imageProgress={imageProgress}
                  progressDisplay={progressDisplay}
                  onGenerateImage={onGenerateImage}
                  onCancelImage={onCancelImage}
                  onDeleteImage={onDeleteImage}
                  onRetryImage={onRetryImage}
                  onEditImageRequest={onEditImageRequest}
                  onOpenViewer={setViewerImage}
                />
              </Fragment>
            );
          })}

          {sendingMessage ? (
            <>
              <OptimisticUserMessage
                content={sendingMessage}
                messageNumber={totalStoryMessagesCount}
                showMessageNumbers={showMessageNumbers}
                showMessageTimestamps={showMessageTimestamps}
              />
              <GeneratingResponse showGenerationTime={showGenerationTime} />
            </>
          ) : null}

          {!sendingMessage && loading ? (
            <GeneratingResponse showGenerationTime={showGenerationTime} />
          ) : null}

          {cancelledNotice ? (
            <CancelledTurnNotice
              notice={cancelledNotice}
              onDismiss={onDismissNotice}
            />
          ) : null}

          {failedNotice ? (
            <FailedTurnNotice
              notice={failedNotice}
              onDismiss={onDismissFailedNotice ?? onDismissNotice}
            />
          ) : null}

          <div ref={messagesEndRef} />
        </div>

        {showScrollBottom ? (
          <button
            type="button"
            className="scroll-to-bottom-floating-btn"
            onClick={scrollToBottom}
            title="Scroll to bottom"
            aria-label="Scroll to bottom"
          >
            <Icon name="ArrowDown" size={16} />
          </button>
        ) : null}
      </div>

      {imagePromptRequest ? (
        <ImagePromptModal
          prompt={imagePromptRequest.prompt}
          negativePrompt={imagePromptRequest.negativePrompt}
          warnings={imagePromptRequest.warnings}
          providerLabel={imageProviderLabel}
          model={imageProviderModel}
          characterLimit={imageCharacterLimit}
          apiStyle={imagePromptRequest.apiStyle}
          context={imagePromptRequest.context}
          generating={imageGeneratingId === imagePromptRequest.message.id}
          rerunning={imagePreviewMessageId === imagePromptRequest.message.id}
          onGenerate={(prompt, negativePrompt) =>
            onImagePromptGenerate?.(prompt, negativePrompt)
          }
          onRerun={() => onImagePromptRerun?.()}
          onClose={() => onImagePromptClose?.()}
          promptElapsedMs={promptElapsedMs}
        />
      ) : null}

      <ImageViewer image={viewerImage} onClose={() => setViewerImage(null)} />

      <PromptComposer
        value={input}
        onChange={onInputChange}
        onSend={handleSendClick}
        onKeyDown={handleKeyDown}
        onFocus={handleInputFocus}
        loading={loading}
        canContinue={canContinue}
        onCancel={onCancel}
        choicesEnabled={choicesEnabled}
        choices={choices}
        onChoiceClick={handleChoiceClick}
        showComposer={!isViewingArchive}
      />

      {showContextUsage ? <ContextMeter tokenUsage={tokenUsage} /> : null}

      {showDebug ? (
        <ChatDebugAccordion
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
