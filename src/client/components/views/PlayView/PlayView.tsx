import { useCallback, useEffect, useState } from "react";
import type { RevertTarget } from "../../../../engine/chapterRevert";
import type {
  AutoScrollBehavior,
  ChatMessage,
  Playthrough,
} from "../../../../schemas";
import {
  buildImageUrl,
  getAppearanceSettings,
  getPromptConfig,
  listProviderConnections,
  type ImageGenerationProgress,
  type Persona,
  type TokenUsage,
  type WorldStateAction,
} from "../../../api";
import type {
  DeleteImageTarget,
  FailedResponseNotice,
  ImageGenerationOverrides,
  ImagePromptRequest,
  ImageRequestEditorState,
  RetryImageTarget,
} from "../../../hooks/usePlaythrough";
import { CheckboxRow, Stack, StatusMessage, TextInput } from "../../base";
import {
  ConfirmModal,
  PlayWorkspace,
  RevertConfirmModal,
} from "../../common";
import { PlaythroughLibrary } from "../../library/PlaythroughLibrary";
import { CharacterManager } from "../../modals/CharacterManager";
import { LorebookManager } from "../../modals/LorebookManager";
import { PersonaManager } from "../../modals/PersonaManager";
import { SettingsModal } from "../../modals/SettingsModal";
import { TimelineModal } from "../../modals/TimelineModal";
import { ChatPanel } from "./ChatPanel";
import { ImageRequestBodyModal } from "./ImageRequestBodyModal";
import { InfoPanel } from "./InfoPanel/InfoPanel";
import { ScenePanel } from "./ScenePanel";

export type PlayViewProps = {
  playthrough: Playthrough;
  setPlaythrough: React.Dispatch<React.SetStateAction<Playthrough | null>>;
  onGoHome: () => void;
  onOpenSetup: () => void;
  choicesEnabled: boolean;
  setChoicesEnabled: (val: boolean) => void;
  showDebug: boolean;
  setShowDebug: (val: boolean) => void;
  showContextUsage: boolean;
  setShowContextUsage: (val: boolean) => void;
  showGenerationTime?: boolean;
  setShowGenerationTime?: (val: boolean) => void;
  showMessageTimestamps?: boolean;
  setShowMessageTimestamps?: (val: boolean) => void;
  showModelName?: boolean;
  setShowModelName?: (val: boolean) => void;
  showMessageNumbers?: boolean;
  setShowMessageNumbers?: (val: boolean) => void;
  autoScrollBehavior?: AutoScrollBehavior;
  setAutoScrollBehavior?: (val: AutoScrollBehavior) => void;
  choices: string[];
  input: string;
  setInput: (val: string) => void;
  loading: boolean;
  error: string | null;
  setError: (val: string | null) => void;
  lastPatchInfo: { applied: string[]; rejected: string[]; warnings: string[] };
  sendingMessage: string | null;
  cancelledNotice: string | null;
  failedNotice?: FailedResponseNotice | null;
  tokenUsage: TokenUsage | null;
  setTokenUsage: (tu: TokenUsage | null) => void;
  rawInput: string | null;
  rawOutput: string | null;
  editingMessageId: string | null;
  editDraft: string;
  setEditDraft: (val: string) => void;
  retryTarget: ChatMessage | null;
  /** The response whose confirm dialog is open. */
  setRetryTarget: (msg: ChatMessage | null) => void;
  /** The response a retry is replacing while the turn runs inline, so the chat can mark it. */
  retryingTarget?: { messageId: string } | null;
  truncateTarget: ChatMessage | null;
  setTruncateTarget: (msg: ChatMessage | null) => void;
  revertTarget: RevertTarget | null;
  setRevertTarget: (target: RevertTarget | null) => void;
  canContinue: boolean;
  actionLoading: boolean;
  resummarizingChapterId: string | null;
  viewingChapterId: string | null;
  setViewingChapterId: (id: string | null) => void;
  loadPlaythrough: (id: string) => Promise<void>;
  handleSend: () => Promise<void>;
  handleCancel: () => void;
  startEdit: (msg: ChatMessage) => void;
  cancelEdit: () => void;
  saveEdit: () => Promise<void>;
  startRetry: () => Promise<void>;
  confirmTruncate: () => Promise<void>;
  confirmRevert: () => Promise<void>;
  branchTarget: ChatMessage | null;
  setBranchTarget: (msg: ChatMessage | null) => void;
  confirmBranch: (branchName?: string, asStandalone?: boolean) => Promise<void>;
  handleResummarizeChapter: (chapterId: string) => Promise<void>;
  handleWorldStateAction: (
    worldStateId: string,
    action: WorldStateAction,
    name?: string,
    description?: string,
  ) => Promise<void>;
  handleDismissNotice: () => void;
  handleDismissFailedNotice?: () => void;
  openPersonaManager: () => void;
  handlePersonasChanged: (refreshed: Persona[]) => void;
  handleStartNewWithSameScenario: (
    scenarioDescription: string,
    personaId: string | undefined,
    initialCastIds: string[] | undefined,
    originalName: string,
  ) => void;
  isMobile: boolean;
  mobileTab: "scene" | "chat" | "info";
  setMobileTab: (tab: "scene" | "chat" | "info") => void;
  moreMenuOpen: boolean;
  setMoreMenuOpen: React.Dispatch<React.SetStateAction<boolean>>;
  moreMenuRef: React.RefObject<HTMLDivElement>;
  personaManagerOpen: boolean;
  setPersonaManagerOpen: (open: boolean) => void;
  characterManagerOpen: boolean;
  setCharacterManagerOpen: (open: boolean) => void;
  lorebookManagerOpen: boolean;
  setLorebookManagerOpen: (open: boolean) => void;
  settingsOpen: boolean;
  setSettingsOpen: (open: boolean) => void;
  saveLoadOpen: boolean;
  setSaveLoadOpen: (open: boolean) => void;
  // ── Generated images (owned by usePlaythrough in App, passed straight down) ──
  imagePromptPreview?: boolean;
  setImagePromptPreview?: (show: boolean) => void;
  imageGeneratingId?: string | null;
  imagePreviewMessageId?: string | null;
  imageDeletingId?: string | null;
  /** Generate an image after every completed turn (per-device chat setting). */
  autoImageAfterTurn?: boolean;
  setAutoImageAfterTurn?: (auto: boolean) => void;
  /** Phase start stamps for the live counters, owned by the hook. */
  imagePromptStartedAt?: number | null;
  imageGeneratingStartedAt?: number | null;
  /** Live a1111 sampling progress for the image in flight, straight from the
   *  hook. Null whenever nothing is running (and for dialects that cannot
   *  report progress). */
  imageProgress?: ImageGenerationProgress | null;
  imagePromptRequest?: ImagePromptRequest | null;
  handleGenerateImage?: (
    msg: ChatMessage,
    overrides?: ImageGenerationOverrides,
  ) => Promise<void>;
  handleCancelImage?: () => void;
  closeImagePrompt?: () => void;
  rerunImagePrompt?: () => Promise<void>;
  requestDeleteImage?: (msg: ChatMessage, file: string) => void;
  confirmDeleteImage?: () => Promise<void>;
  deleteImageTarget: DeleteImageTarget | null;
  setDeleteImageTarget: (target: DeleteImageTarget | null) => void;
  // ── Image request re-send & JSON editor ──
  retryImageTarget?: RetryImageTarget | null;
  requestImageRetry?: (msg: ChatMessage, file: string) => void;
  confirmImageRetry?: (discardAlways: boolean) => Promise<void>;
  cancelImageRetry?: () => void;
  imageRequestEditor?: ImageRequestEditorState | null;
  openImageRequestEditor?: (msg: ChatMessage, file: string) => Promise<void>;
  closeImageRequestEditor?: () => void;
  saveImageRequestBody?: (body: string) => Promise<string | null>;
  imageSaving?: boolean;
  alwaysDiscardOldImage?: boolean;
  setAlwaysDiscardOldImage?: (always: boolean) => void;
};

export function PlayView(props: PlayViewProps) {
  const {
    playthrough,
    setPlaythrough,
    onGoHome,
    choicesEnabled,
    setChoicesEnabled,
    showDebug,
    setShowDebug,
    showContextUsage,
    setShowContextUsage,
    showGenerationTime = true,
    setShowGenerationTime,
    showMessageTimestamps = true,
    setShowMessageTimestamps,
    showModelName = true,
    setShowModelName,
    showMessageNumbers = true,
    setShowMessageNumbers,
    autoScrollBehavior = "start",
    setAutoScrollBehavior,
    choices,
    input,
    setInput,
    loading,
    error,
    setError,
    lastPatchInfo,
    sendingMessage,
    cancelledNotice,
    failedNotice,
    tokenUsage,
    setTokenUsage,
    rawInput,
    rawOutput,
    editingMessageId,
    editDraft,
    setEditDraft,
    retryTarget,
    setRetryTarget,
    retryingTarget,
    truncateTarget,
    setTruncateTarget,
    revertTarget,
    setRevertTarget,
    canContinue,
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
    startRetry,
    confirmTruncate,
    confirmRevert,
    branchTarget,
    setBranchTarget,
    confirmBranch,
    handleResummarizeChapter,
    handleWorldStateAction,
    handleDismissNotice,
    handleDismissFailedNotice,
    handlePersonasChanged,
    handleStartNewWithSameScenario,
    isMobile,
    mobileTab,
    setMobileTab,
    personaManagerOpen,
    setPersonaManagerOpen,
    characterManagerOpen,
    setCharacterManagerOpen,
    lorebookManagerOpen,
    setLorebookManagerOpen,
    settingsOpen,
    setSettingsOpen,
    saveLoadOpen,
    setSaveLoadOpen,
    imagePromptPreview = true,
    setImagePromptPreview,
    imageGeneratingId = null,
    imagePreviewMessageId = null,
    imageDeletingId = null,
    autoImageAfterTurn = false,
    setAutoImageAfterTurn,
    imagePromptStartedAt = null,
    imageGeneratingStartedAt = null,
    imageProgress = null,
    imagePromptRequest = null,
    handleGenerateImage,
    handleCancelImage,
    closeImagePrompt,
    rerunImagePrompt,
    requestDeleteImage,
    confirmDeleteImage,
    deleteImageTarget,
    setDeleteImageTarget,
    retryImageTarget = null,
    requestImageRetry,
    confirmImageRetry,
    cancelImageRetry,
    imageRequestEditor = null,
    openImageRequestEditor,
    closeImageRequestEditor,
    saveImageRequestBody,
    imageSaving = false,
    alwaysDiscardOldImage = false,
    setAlwaysDiscardOldImage,
  } = props;

  const [paneSwipeEnabled, setPaneSwipeEnabled] = useState(true);
  const refreshPaneSwipe = useCallback(() => {
    void getAppearanceSettings()
      .then((res) => setPaneSwipeEnabled(res.paneSwipeEnabled ?? true))
      .catch(() => {
        /* keep the last known value — the gesture must not flap on a failed read */
      });
  }, []);
  useEffect(() => {
    refreshPaneSwipe();
  }, [refreshPaneSwipe]);

  const [retryDiscardAlways, setRetryDiscardAlways] = useState(false);

  const [timelinesOpen, setTimelinesOpen] = useState(false);
  const [branchNameInput, setBranchNameInput] = useState("");
  const [branchAsStandalone, setBranchAsStandalone] = useState(false);
  const [characterManagerEditingId, setCharacterManagerEditingId] = useState<
    string | undefined
  >(undefined);

  const [hasImageProvider, setHasImageProvider] = useState(false);
  const [imageConnection, setImageConnection] = useState<{
    label: string;
    model: string;
  } | null>(null);

  const refreshImageProvider = useCallback(async () => {
    try {
      const registry = await listProviderConnections();
      const imageConnections = registry.connections.filter(
        (c) => c.kind === "image",
      );
      const active =
        imageConnections.find((c) => c.id === registry.activeImageProviderId) ??
        imageConnections[0] ??
        null;
      setHasImageProvider(imageConnections.length > 0);
      setImageConnection(
        active ? { label: active.label, model: active.model } : null,
      );
    } catch {
      /* keep the last known state — the button must not flap on a failed read */
    }
  }, []);

  useEffect(() => {
    void refreshImageProvider();
  }, [refreshImageProvider]);

  const [imageCharacterLimit, setImageCharacterLimit] = useState<
    number | undefined
  >(undefined);
  const refreshImageCharacterLimit = useCallback(() => {
    void getPromptConfig()
      .then((state) =>
        setImageCharacterLimit(
          state.promptConfig.imageGeneration?.promptCharacterLimit,
        ),
      )
      .catch(() => setImageCharacterLimit(undefined));
  }, []);
  useEffect(() => {
    refreshImageCharacterLimit();
  }, [refreshImageCharacterLimit]);

  function handleCurrentDeleted(remainingIds: string[]) {
    if (remainingIds.length > 0) {
      void loadPlaythrough(remainingIds[0]);
    } else {
      setPlaythrough(null);
      onGoHome();
    }
  }

  return (
    <PlayWorkspace
      isMobile={isMobile}
      activePane={mobileTab}
      onSelectPane={setMobileTab}
      paneSwipeEnabled={paneSwipeEnabled}
      topBanner={
        error ? (
          <StatusMessage variant="banner" tone="err" className="error-box">
            {error}
          </StatusMessage>
        ) : null
      }
      renderScenePane={(paneProps) => (
        <ScenePanel
          playthrough={playthrough}
          actionLoading={actionLoading}
          onWorldStateAction={handleWorldStateAction}
          {...paneProps}
        />
      )}
      renderChatPane={(paneProps) => (
        <ChatPanel
          playthrough={playthrough}
          input={input}
          onInputChange={setInput}
          onSend={() => {
            void handleSend();
          }}
          loading={loading}
          actionLoading={actionLoading}
          choices={choices}
          choicesEnabled={choicesEnabled}
          showDebug={showDebug}
          showContextUsage={showContextUsage}
          showGenerationTime={showGenerationTime}
          showMessageTimestamps={showMessageTimestamps}
          showModelName={showModelName}
          showMessageNumbers={showMessageNumbers}
          autoScrollBehavior={autoScrollBehavior}
          canContinue={canContinue}
          onChoiceSelect={setInput}
          editingMessageId={editingMessageId}
          editDraft={editDraft}
          onEditDraftChange={setEditDraft}
          onStartEdit={startEdit}
          onSaveEdit={() => {
            void saveEdit();
          }}
          onCancelEdit={cancelEdit}
          onRetryRequest={setRetryTarget}
          retryingTargetId={retryingTarget?.messageId ?? null}
          onRequestTruncate={setTruncateTarget}
          onRevertRequest={(msg) =>
            setRevertTarget({ kind: "message", id: msg.id, label: msg.content })
          }
          onBranchRequest={setBranchTarget}
          lastPatchInfo={lastPatchInfo}
          sendingMessage={sendingMessage}
          cancelledNotice={cancelledNotice}
          failedNotice={failedNotice}
          onDismissNotice={handleDismissNotice}
          onDismissFailedNotice={handleDismissFailedNotice}
          onCancel={handleCancel}
          tokenUsage={tokenUsage}
          rawInput={rawInput}
          rawOutput={rawOutput}
          viewingChapterId={viewingChapterId}
          onReturnToCurrentChapter={() => setViewingChapterId(null)}
          onResummarizeChapter={handleResummarizeChapter}
          resummarizingChapterId={resummarizingChapterId}
          hasImageProvider={hasImageProvider}
          imageGeneratingId={imageGeneratingId}
          imagePreviewMessageId={imagePreviewMessageId}
          imageDeletingId={imageDeletingId}
          imagePromptStartedAt={imagePromptStartedAt}
          imageGeneratingStartedAt={imageGeneratingStartedAt}
          imageProgress={imageProgress}
          imagePromptRequest={imagePromptRequest}
          imageCharacterLimit={imageCharacterLimit}
          imageProviderLabel={imageConnection?.label}
          imageProviderModel={imageConnection?.model}
          onGenerateImage={(msg) => {
            void handleGenerateImage?.(msg);
          }}
          onCancelImage={handleCancelImage}
          onDeleteImage={(msg, file) => requestDeleteImage?.(msg, file)}
          onRetryImage={(msg, file) => requestImageRetry?.(msg, file)}
          onEditImageRequest={(msg, file) => {
            void openImageRequestEditor?.(msg, file);
          }}
          onImagePromptGenerate={(prompt, negativePrompt) => {
            const request = imagePromptRequest;
            if (!request) return;
            void handleGenerateImage?.(request.message, {
              promptOverride: prompt,
              negativeOverride: negativePrompt,
            });
          }}
          onImagePromptRerun={() => {
            void rerunImagePrompt?.();
          }}
          onImagePromptClose={closeImagePrompt}
          {...paneProps}
        />
      )}
      renderInfoPane={(paneProps) => (
        <InfoPanel
          playthrough={playthrough}
          onPlaythroughChange={setPlaythrough}
          onViewChapter={(chapterId) => {
            setViewingChapterId(chapterId);
            if (mobileTab !== "chat") setMobileTab("chat");
          }}
          onCloseChapterComplete={(tu) => setTokenUsage(tu)}
          onRevertToChapter={(chapterId, name) =>
            setRevertTarget({ kind: "chapter", id: chapterId, label: name })
          }
          onResummarizeChapter={(chapterId) => {
            void handleResummarizeChapter(chapterId);
          }}
          resummarizingChapterId={resummarizingChapterId}
          onStartNewWithSameScenario={(sd, pid, cids, name) =>
            handleStartNewWithSameScenario(sd, pid, cids, name)
          }
          onOpenLibrary={(templateId) => {
            setCharacterManagerEditingId(templateId);
            setCharacterManagerOpen(true);
          }}
          onOpenTimelines={() => setTimelinesOpen(true)}
          actionLoading={actionLoading}
          {...paneProps}
        />
      )}
    >
      {saveLoadOpen ? (
        <PlaythroughLibrary
          variant="dialog"
          currentPlaythroughId={playthrough.id}
          onOpen={(id) => {
            void loadPlaythrough(id);
            setSaveLoadOpen(false);
          }}
          onClose={() => setSaveLoadOpen(false)}
          onCurrentDeleted={handleCurrentDeleted}
          onCurrentRenamed={setPlaythrough}
          onError={setError}
        />
      ) : null}

      {deleteImageTarget ? (
        <ConfirmModal
          title="Remove this image?"
          message={
            playthrough.cover?.file === deleteImageTarget.file
              ? "It is removed from this message. The file is deleted if nothing else uses it — and this image is your playthrough's cover, so the cover falls back to the latest remaining image."
              : "It is removed from this message. The file is deleted if nothing else uses it."
          }
          confirmLabel={
            imageDeletingId === deleteImageTarget.messageId
              ? "Removing…"
              : "Yes, remove"
          }
          danger
          maxWidth={420}
          isLoading={imageDeletingId === deleteImageTarget.messageId}
          onConfirm={() => {
            void confirmDeleteImage?.();
          }}
          onCancel={() => setDeleteImageTarget(null)}
        >
          <div className="delete-image-preview">
            <img
              src={buildImageUrl(deleteImageTarget.file)}
              alt={deleteImageTarget.prompt.slice(0, 120)}
              title={deleteImageTarget.prompt}
            />
          </div>
        </ConfirmModal>
      ) : null}

      {imageRequestEditor ? (
        <ImageRequestBodyModal
          body={imageRequestEditor.body}
          connection={imageRequestEditor.connection}
          saving={imageSaving}
          onSave={async (body) =>
            saveImageRequestBody ? await saveImageRequestBody(body) : null
          }
          onClose={() => closeImageRequestEditor?.()}
        />
      ) : null}

      {retryImageTarget ? (
        <ConfirmModal
          title="Re-send this request body?"
          message="The image provider receives this body — the text model is not called, and the seed, size and checkpoint it names are sent as they stand. The image above is replaced once the new one arrives, so nothing is lost if the render fails."
          confirmLabel={
            imageGeneratingId === retryImageTarget.message.id
              ? "Generating…"
              : "Replace image"
          }
          danger
          maxWidth={460}
          isLoading={imageGeneratingId === retryImageTarget.message.id}
          onConfirm={() => {
            void confirmImageRetry?.(retryDiscardAlways);
          }}
          onCancel={() => {
            setRetryDiscardAlways(false);
            cancelImageRetry?.();
          }}
        >
          <div className="delete-image-preview">
            <img
              src={buildImageUrl(retryImageTarget.file)}
              alt={retryImageTarget.prompt.slice(0, 120)}
              title={retryImageTarget.prompt}
            />
          </div>
          <div className="modal-form-fields">
            <CheckboxRow
              checked={retryDiscardAlways}
              onChange={(e) => setRetryDiscardAlways(e.target.checked)}
              disabled={imageGeneratingId === retryImageTarget.message.id}
              title="Always discard old image"
            />
          </div>
        </ConfirmModal>
      ) : null}

      {retryTarget ? (
        <RevertConfirmModal
          playthrough={playthrough}
          mode="retry"
          target={{
            kind: "message",
            id: retryTarget.id,
            label: retryTarget.content,
          }}
          onConfirm={() => {
            void startRetry();
          }}
          onCancel={() => setRetryTarget(null)}
        />
      ) : null}

      {revertTarget ? (
        <RevertConfirmModal
          playthrough={playthrough}
          target={revertTarget}
          isLoading={actionLoading}
          onConfirm={() => {
            void confirmRevert();
          }}
          onCancel={() => setRevertTarget(null)}
        />
      ) : null}

      {truncateTarget ? (
        <ConfirmModal
          title="Delete up to here?"
          message="This will permanently delete this message and everything after it, reverting the world state to this point. This cannot be undone."
          confirmLabel={actionLoading ? "Deleting…" : "Yes, delete"}
          danger
          isLoading={actionLoading}
          onConfirm={() => {
            void confirmTruncate();
          }}
          onCancel={() => setTruncateTarget(null)}
        >
          <blockquote className="retry-preview">
            {truncateTarget.content.slice(0, 200)}
            {truncateTarget.content.length > 200 ? "…" : ""}
          </blockquote>
        </ConfirmModal>
      ) : null}

      {branchTarget ? (
        <ConfirmModal
          title="Branch into New Timeline?"
          message="Create a new playthrough timeline branching off right after this message. The world state will be rolled back to this point, leaving your current playthrough untouched."
          confirmLabel={actionLoading ? "Branching…" : "Create Branch & Switch"}
          maxWidth={500}
          isLoading={actionLoading}
          onConfirm={async () => {
            const name = branchNameInput.trim();
            const standalone = branchAsStandalone;
            setBranchNameInput("");
            setBranchAsStandalone(false);
            await confirmBranch(name || undefined, standalone);
          }}
          onCancel={() => {
            setBranchTarget(null);
            setBranchNameInput("");
            setBranchAsStandalone(false);
          }}
        >
          <blockquote className="retry-preview">
            {branchTarget.content.slice(0, 200)}
            {branchTarget.content.length > 200 ? "…" : ""}
          </blockquote>
          <Stack gap="sm" className="modal-form-fields">
            <TextInput
              label="Branch Name (optional)"
              value={branchNameInput}
              onChange={(e) => setBranchNameInput(e.target.value)}
              placeholder={`${playthrough.name} (Branch T${branchTarget.turn ?? playthrough.turn})`}
              disabled={actionLoading}
            />
            <CheckboxRow
              checked={branchAsStandalone}
              onChange={(e) => setBranchAsStandalone(e.target.checked)}
              disabled={actionLoading}
              title="Also create as separate Playthrough in Save/Load list"
            />
          </Stack>
        </ConfirmModal>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          void refreshImageProvider();
          refreshImageCharacterLimit();
          refreshPaneSwipe();
        }}
        choicesEnabled={choicesEnabled}
        setChoicesEnabled={setChoicesEnabled}
        showDebug={showDebug}
        setShowDebug={setShowDebug}
        showContextUsage={showContextUsage}
        setShowContextUsage={setShowContextUsage}
        showGenerationTime={showGenerationTime}
        setShowGenerationTime={setShowGenerationTime}
        showMessageTimestamps={showMessageTimestamps}
        setShowMessageTimestamps={setShowMessageTimestamps}
        showModelName={showModelName}
        setShowModelName={setShowModelName}
        showMessageNumbers={showMessageNumbers}
        setShowMessageNumbers={setShowMessageNumbers}
        imagePromptPreview={imagePromptPreview}
        setImagePromptPreview={setImagePromptPreview}
        autoImageAfterTurn={autoImageAfterTurn}
        setAutoImageAfterTurn={setAutoImageAfterTurn}
        alwaysDiscardOldImage={alwaysDiscardOldImage}
        setAlwaysDiscardOldImage={setAlwaysDiscardOldImage}
        autoScrollBehavior={autoScrollBehavior}
        setAutoScrollBehavior={setAutoScrollBehavior}
      />

      <PersonaManager
        open={personaManagerOpen}
        onClose={() => setPersonaManagerOpen(false)}
        onPersonasChanged={handlePersonasChanged}
      />

      <CharacterManager
        open={characterManagerOpen}
        onClose={() => {
          setCharacterManagerOpen(false);
          setCharacterManagerEditingId(undefined);
        }}
        initialEditingId={characterManagerEditingId}
      />

      <LorebookManager
        open={lorebookManagerOpen}
        onClose={() => setLorebookManagerOpen(false)}
      />

      <TimelineModal
        open={timelinesOpen}
        onClose={() => setTimelinesOpen(false)}
        activePlaythrough={playthrough}
        onSwitchPlaythrough={loadPlaythrough}
      />
    </PlayWorkspace>
  );
}
