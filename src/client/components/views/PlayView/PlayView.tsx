import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import {
  buildImageUrl,
  getAppearanceSettings,
  getPromptConfig,
  listProviderConnections,
  type ImageGenerationProgress,
  type TokenUsage,
  type Persona,
  type QuestAction
} from "../../../api";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import type { RevertTarget } from "../../../../engine/chapterRevert";
import type { DeleteImageTarget, FailedResponseNotice, ImageGenerationOverrides, ImagePromptRequest, ImageRequestEditorState, RetryImageTarget } from "../../../hooks/usePlaythrough";
import { ScenePanel } from "./ScenePanel";
import { ChatPanel } from "./ChatPanel";
import { ImageRequestBodyModal } from "./ImageRequestBodyModal";
import { InfoPanel } from "./InfoPanel/InfoPanel";
import { incomingOffset, paneIndexOf, paneSide } from "../../../engine/paneSwipe";
import { PANE_ORDER } from "../../../engine/paneSwipe";
import { usePaneSwipe } from "../../../hooks/usePaneSwipe";
import { PlaythroughLibrary } from "../../library/PlaythroughLibrary";
import { SettingsModal } from "../../modals/SettingsModal";
import { PersonaManager } from "../../modals/PersonaManager";
import { CharacterManager } from "../../modals/CharacterManager";
import { LorebookManager } from "../../modals/LorebookManager";
import { TimelineModal } from "../../modals/TimelineModal";
import { ConfirmModal } from "../../common/ConfirmModal";
import { RevertConfirmModal } from "../../common/RevertConfirmModal";
import { Icon, TextInput, Checkbox } from "../../base";

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
  handleQuestAction: (questId: string, action: QuestAction, name?: string, summary?: string) => Promise<void>;
  handleDismissNotice: () => void;
  handleDismissFailedNotice?: () => void;
  openPersonaManager: () => void;
  handlePersonasChanged: (refreshed: Persona[]) => void;
  handleStartNewWithSameScenario: (
    scenarioDescription: string,
    personaId: string | undefined,
    initialCastIds: string[] | undefined,
    originalName: string
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
  handleGenerateImage?: (msg: ChatMessage, overrides?: ImageGenerationOverrides) => Promise<void>;
  handleCancelImage?: () => void;
  closeImagePrompt?: () => void;
  rerunImagePrompt?: () => Promise<void>;
  /** The generated image queued for removal, if any — drives the delete ConfirmModal. */
  deleteImageTarget: DeleteImageTarget | null;
  setDeleteImageTarget: (target: DeleteImageTarget | null) => void;
  requestDeleteImage?: (msg: ChatMessage, file: string) => void;
  confirmDeleteImage?: () => Promise<void>;
  /** Re-sending an image's stored request body. The confirmation (and its
   *  "always" tick) belongs to this view; the render itself belongs to the hook. */
  retryImageTarget?: RetryImageTarget | null;
  requestImageRetry?: (msg: ChatMessage, file: string) => void;
  confirmImageRetry?: (discardAlways: boolean) => Promise<void>;
  cancelImageRetry?: () => void;
  /** The request-body editor: open state, and the actions the modal calls. Saving
   *  renders nothing — the render is `Retry`'s, behind the confirmation above. */
  imageRequestEditor?: ImageRequestEditorState | null;
  openImageRequestEditor?: (msg: ChatMessage, file: string) => void;
  closeImageRequestEditor?: () => void;
  saveImageRequestBody?: (body: string) => Promise<string | null>;
  imageSaving?: boolean;
  /** Skip the retry confirmation entirely (Settings → Chat → Image Generation). */
  alwaysDiscardOldImage?: boolean;
  setAlwaysDiscardOldImage?: (always: boolean) => void;
};

/** How long the released pair takes to reach its rest position. Mirrors the CSS transition on
 *  `.pane-settling` — change them together. */
const PANE_SETTLE_MS = 220;

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
    showGenerationTime,
    setShowGenerationTime,
    showMessageTimestamps,
    setShowMessageTimestamps,
    showModelName,
    setShowModelName,
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
    handleQuestAction,
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
    setAlwaysDiscardOldImage
  } = props;

  // Which side the arriving panel slides in from. It is kept in a ref because the direction only
  // exists as a move — and compared against the previous panel, with the ref written only when the
  // panel actually changed, so a second render cannot flip it.
  const paneMove = useRef<{ to: string; side: "left" | "right" }>({ to: mobileTab, side: "right" });
  // The panel a swipe carried in — or carried and settled back. Its arrival WAS the drag, so it must
  // not also run the entry animation — that would read as one slide too many. The marker lives until
  // the panel changes by some other means, so an unrelated re-render cannot sneak the animation back
  // in.
  const draggedInto = useRef<string | null>(null);
  if (paneMove.current.to !== mobileTab) {
    paneMove.current = {
      to: mobileTab,
      side: paneSide(paneIndexOf(paneMove.current.to), paneIndexOf(mobileTab))
    };
    if (draggedInto.current !== mobileTab) draggedInto.current = null;
  }

  const layoutRef = useRef<HTMLElement | null>(null);
  // Following the finger is motion under the finger, which is what a reduced-motion preference asks
  // to be spared. The gesture still changes panels; it just does not drag them.
  const [reducedMotion, setReducedMotion] = useState(
    () => typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReducedMotion(media.matches);
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  // ── The pane swipe, and the switch that turns it off ──
  // Kept beside the gesture rather than with the other appearance reads: this is the one appearance
  // value the play view ACTS on. Read on mount and again when the Settings dialog closes (that is
  // where the switch lives), so flipping it takes effect without a reload.
  const [paneSwipeEnabled, setPaneSwipeEnabled] = useState(true);
  const refreshPaneSwipe = useCallback(() => {
    void getAppearanceSettings()
      .then((res) => setPaneSwipeEnabled(res.paneSwipeEnabled ?? true))
      .catch(() => {
        /* keep the last known value — the gesture must not flap on a failed read */
      });
  }, []);
  useEffect(() => { refreshPaneSwipe(); }, [refreshPaneSwipe]);

  /** A drag in progress, and the release that finishes it. */
  const [paneDrag, setPaneDrag] = useState<{ target: string; offset: number; released: boolean } | null>(null);
  const settleTimer = useRef<number | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
    },
    []
  );

  // Swiping between panels, on the single-panel layout only, and only while the stored setting
  // leaves it on. The handlers sit on the layout rather than the document, which keeps the header and
  // the tab bar outside the gesture.
  const paneSwipe = usePaneSwipe({
    enabled: isMobile && paneSwipeEnabled,
    live: !reducedMotion,
    index: paneIndexOf(mobileTab),
    paneWidth: () => layoutRef.current?.clientWidth ?? 0,
    onDrag: (drag) => {
      if (!drag) {
        setPaneDrag(null);
        return;
      }
      const target = PANE_ORDER[drag.targetIndex];
      if (!target) return;
      // The incoming panel is shown from the first move, so the pair is already a pair.
      setPaneDrag({ target, offset: drag.offset, released: false });
    },
    onSettle: ({ targetIndex, committed }) => {
      const target = PANE_ORDER[targetIndex];
      if (!target) {
        setPaneDrag(null);
        return;
      }
      const width = layoutRef.current?.clientWidth ?? 0;
      // Where the pair comes to rest: the neighbour in, or back where it started.
      const rest = committed ? (targetIndex > paneIndexOf(mobileTab) ? -width : width) : 0;
      setPaneDrag({ target, offset: rest, released: true });
      if (settleTimer.current !== null) window.clearTimeout(settleTimer.current);
      settleTimer.current = window.setTimeout(() => {
        settleTimer.current = null;
        if (committed) {
          draggedInto.current = target;
          setMobileTab(target);
        } else {
          // A drag that sprang back still MOVED this panel, so it must not also run the entry slide
          // on its way home: that reads as two motions for one gesture, and it is what a revoked
          // swipe looks like. The marker is cleared by the next panel change, like the committed one.
          draggedInto.current = mobileTab;
        }
        setPaneDrag(null);
      }, PANE_SETTLE_MS);
    }
  });

  /**
   * Class and transform for one panel: which one is showing, the arriving panel's slide, and both
   * participants' live positions while a swipe is under the finger.
   */
  function paneLayout(pane: string): { className?: string; style?: CSSProperties } {
    if (!isMobile) return {};
    if (paneDrag) {
      const settled = paneDrag.released ? " pane-settling" : "";
      if (pane === mobileTab) {
        return { className: `pane-dragging${settled}`, style: { transform: `translateX(${paneDrag.offset}px)` } };
      }
      if (pane === paneDrag.target) {
        const width = layoutRef.current?.clientWidth ?? 0;
        const offset = incomingOffset(paneDrag.offset, paneIndexOf(mobileTab), paneIndexOf(paneDrag.target), width);
        return { className: `pane-dragging${settled}`, style: { transform: `translateX(${offset}px)` } };
      }
      return { className: "mobile-hidden" };
    }
    if (mobileTab !== pane) return { className: "mobile-hidden" };
    // Arrived by drag: no entry animation, it already moved.
    return draggedInto.current === pane ? {} : { className: `pane-enter-from-${paneMove.current.side}` };
  }

  // The retry confirmation's own "always" tick. Deliberately NOT seeded from the
  // setting: this modal only appears while the setting is OFF, and a tick here is
  // a one-way promise to stop asking.
  const [retryDiscardAlways, setRetryDiscardAlways] = useState(false);

  const [timelinesOpen, setTimelinesOpen] = useState(false);
  const [branchNameInput, setBranchNameInput] = useState("");
  const [branchAsStandalone, setBranchAsStandalone] = useState(false);
  const [characterManagerEditingId, setCharacterManagerEditingId] = useState<string | undefined>(undefined);

  // ── Image provider availability ──
  // The active image connection is GLOBAL (no per-playthrough override), so the
  // registry is read once on mount and again whenever the Settings modal closes
  // (that is where a connection is added or activated). ChatPanel only receives
  // the derived boolean — it never fetches.
  const [hasImageProvider, setHasImageProvider] = useState(false);
  const [imageConnection, setImageConnection] = useState<{ label: string; model: string } | null>(null);

  const refreshImageProvider = useCallback(async () => {
    try {
      const registry = await listProviderConnections();
      // Mirrors the server's `activeConnectionOfKind`: the active slot when it
      // points at an image connection, else the first image connection.
      const imageConnections = registry.connections.filter((c) => c.kind === "image");
      const active =
        imageConnections.find((c) => c.id === registry.activeImageProviderId) ?? imageConnections[0] ?? null;
      setHasImageProvider(imageConnections.length > 0);
      setImageConnection(active ? { label: active.label, model: active.model } : null);
    } catch {
      /* keep the last known state — the button must not flap on a failed read */
    }
  }, []);

  useEffect(() => {
    void refreshImageProvider();
  }, [refreshImageProvider]);

  // The global config's soft prompt limit (the prompt modal then shows a real
  // `n / limit` counter). Re-read when Settings closes, since the limit is edited
  // there — and it now lives in the one global config, not a playthrough snapshot.
  const [imageCharacterLimit, setImageCharacterLimit] = useState<number | undefined>(undefined);
  const refreshImageCharacterLimit = useCallback(() => {
    void getPromptConfig()
      .then((state) => setImageCharacterLimit(state.promptConfig.imageGeneration?.promptCharacterLimit))
      .catch(() => setImageCharacterLimit(undefined));
  }, []);
  useEffect(() => { refreshImageCharacterLimit(); }, [refreshImageCharacterLimit]);

  // The modal reports ids, not documents: this list is a summary projection, so the
  // replacement playthrough is loaded by id through the same loader the Load button uses.
  function handleCurrentDeleted(remainingIds: string[]) {
    if (remainingIds.length > 0) {
      void loadPlaythrough(remainingIds[0]);
    } else {
      setPlaythrough(null);
      onGoHome();
    }
  }

  return (
    <main className="app-shell play-view-shell">
      {error ? <pre className="error-box">{error}</pre> : null}

      {/* The play view mounts the SAME shelf the home screen renders, as a dialog: one card
          contract, two surfaces. Picking a card loads it and closes — the shelf's own list is a
          projection, so the document is read by id through the same loader. */}
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

      <section className="layout" ref={layoutRef} {...paneSwipe}>
        <ScenePanel
          playthrough={playthrough}
          actionLoading={actionLoading}
          onQuestAction={handleQuestAction}
          {...paneLayout("scene")}
        />

        <ChatPanel
          playthrough={playthrough}
          input={input}
          onInputChange={setInput}
          onSend={() => { void handleSend(); }}
          loading={loading}
          actionLoading={actionLoading}
          choices={choices}
          choicesEnabled={choicesEnabled}
          showDebug={showDebug}
          showContextUsage={showContextUsage}
          showGenerationTime={showGenerationTime}
          showMessageTimestamps={showMessageTimestamps}
          showModelName={showModelName}
          canContinue={canContinue}
          onChoiceSelect={setInput}
          editingMessageId={editingMessageId}
          editDraft={editDraft}
          onEditDraftChange={setEditDraft}
          onStartEdit={startEdit}
          onSaveEdit={() => { void saveEdit(); }}
          onCancelEdit={cancelEdit}
          onRetryRequest={setRetryTarget}
          retryingTargetId={retryingTarget?.messageId ?? null}
          onRequestTruncate={setTruncateTarget}
          onRevertRequest={(msg) => setRevertTarget({ kind: "message", id: msg.id, label: msg.content })}
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
          onGenerateImage={(msg) => { void handleGenerateImage?.(msg); }}
          onCancelImage={handleCancelImage}
          onDeleteImage={(msg, file) => requestDeleteImage?.(msg, file)}
          onRetryImage={(msg, file) => requestImageRetry?.(msg, file)}
          onEditImageRequest={(msg, file) => { void openImageRequestEditor?.(msg, file); }}
          onImagePromptGenerate={(prompt, negativePrompt) => {
            const request = imagePromptRequest;
            if (!request) return;
            // Both overrides present ⇒ the server skips the text call: no second
            // token spend and the edits are what the image provider receives.
            void handleGenerateImage?.(request.message, { promptOverride: prompt, negativeOverride: negativePrompt });
          }}
          onImagePromptRerun={() => { void rerunImagePrompt?.(); }}
          onImagePromptClose={closeImagePrompt}
          {...paneLayout("chat")}
        />

        <InfoPanel
          playthrough={playthrough}
          onPlaythroughChange={setPlaythrough}
          onViewChapter={(chapterId) => {
            setViewingChapterId(chapterId);
            // The transcript renders in the chat panel. On a phone only one panel is on screen, so
            // opening it from the Journal would look like the button did nothing. Desktop has both
            // panels visible and never reaches this branch.
            if (isMobile && mobileTab !== "chat") setMobileTab("chat");
          }}
          onCloseChapterComplete={(tu) => setTokenUsage(tu)}
          onRevertToChapter={(chapterId, name) => setRevertTarget({ kind: "chapter", id: chapterId, label: name })}
          onResummarizeChapter={(chapterId) => { void handleResummarizeChapter(chapterId); }}
          resummarizingChapterId={resummarizingChapterId}
          onStartNewWithSameScenario={(sd, pid, cids, name) => handleStartNewWithSameScenario(sd, pid, cids, name)}
          onOpenLibrary={(templateId) => {
            setCharacterManagerEditingId(templateId);
            setCharacterManagerOpen(true);
          }}
          onOpenTimelines={() => setTimelinesOpen(true)}
          actionLoading={actionLoading}
          {...paneLayout("info")}
        />
      </section>

      {isMobile ? (
        <nav className="mobile-tab-bar" aria-label="Mobile View Panels Navigation" role="tablist">
          <button
            role="tab"
            type="button"
            className={`mobile-tab ${mobileTab === "scene" ? "active" : ""}`}
            onClick={() => setMobileTab("scene")}
            aria-label="Scene view"
            aria-selected={mobileTab === "scene"}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              <Icon name="Compass" size={16} />
            </span>
            <span className="mobile-tab-label">Scene</span>
          </button>
          <button
            role="tab"
            type="button"
            className={`mobile-tab ${mobileTab === "chat" ? "active" : ""}`}
            onClick={() => setMobileTab("chat")}
            aria-label="Chat view"
            aria-selected={mobileTab === "chat"}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              <Icon name="MessageSquare" size={16} />
            </span>
            <span className="mobile-tab-label">Chat</span>
          </button>
          <button
            role="tab"
            type="button"
            className={`mobile-tab ${mobileTab === "info" ? "active" : ""}`}
            onClick={() => setMobileTab("info")}
            aria-label="Info view"
            aria-selected={mobileTab === "info"}
          >
            <span className="mobile-tab-icon" aria-hidden="true">
              <Icon name="BookOpen" size={16} />
            </span>
            <span className="mobile-tab-label">Info</span>
          </button>
        </nav>
      ) : null}

      {/* Removing a generated image is destructive (the file is swept once nothing
          else references it), so it asks through the shared ConfirmModal like
          retry/truncate instead of a native window.confirm. A message can hold
          several images, so the modal previews exactly which one is going. An image
          that is also the playthrough's cover says so: deleting it loses the cover
          choice with it. */}
      {deleteImageTarget ? (
        <ConfirmModal
          title="Remove this image?"
          message={
            playthrough.cover?.file === deleteImageTarget.file
              ? "It is removed from this message. The file is deleted if nothing else uses it — and this image is your playthrough's cover, so the cover falls back to the latest remaining image."
              : "It is removed from this message. The file is deleted if nothing else uses it."
          }
          confirmLabel={imageDeletingId === deleteImageTarget.messageId ? "Removing…" : "Yes, remove"}
          danger
          maxWidth={420}
          isLoading={imageDeletingId === deleteImageTarget.messageId}
          onConfirm={() => { void confirmDeleteImage?.(); }}
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

      {/* The request-body editor. Saving closes it (the reason to be there is
          spent); a save that FAILS keeps it open with the text intact and the
          reason under the field, which is where the user is looking. */}
      {imageRequestEditor ? (
        <ImageRequestBodyModal
          body={imageRequestEditor.body}
          connection={imageRequestEditor.connection}
          saving={imageSaving}
          onSave={async (body) => (saveImageRequestBody ? await saveImageRequestBody(body) : null)}
          onClose={() => closeImageRequestEditor?.()}
        />
      ) : null}

      {/* Re-sending a request body REPLACES the image it came from, so it asks
          first — with the image in question shown, like Remove. The body may be
          the one this image rendered with or one saved since; either way, a
          re-send is the only thing here that renders. The tick is a one-way
          "stop asking me": it turns the same switch the Settings panel owns,
          which is then the way back. */}
      {retryImageTarget ? (
        <ConfirmModal
          title="Re-send this request body?"
          message="The image provider receives this body — the text model is not called, and the seed, size and checkpoint it names are sent as they stand. The image above is replaced once the new one arrives, so nothing is lost if the render fails."
          confirmLabel={imageGeneratingId === retryImageTarget.message.id ? "Generating…" : "Replace image"}
          danger
          maxWidth={460}
          isLoading={imageGeneratingId === retryImageTarget.message.id}
          onConfirm={() => { void confirmImageRetry?.(retryDiscardAlways); }}
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
            <Checkbox
              checked={retryDiscardAlways}
              onChange={(e) => setRetryDiscardAlways(e.target.checked)}
              disabled={imageGeneratingId === retryImageTarget.message.id}
              label="Always discard old image"
              containerClassName="modal-checkbox-label"
            />
          </div>
        </ConfirmModal>
      ) : null}

      {retryTarget ? (
        <RevertConfirmModal
          playthrough={playthrough}
          mode="retry"
          target={{ kind: "message", id: retryTarget.id, label: retryTarget.content }}
          onConfirm={() => { void startRetry(); }}
          onCancel={() => setRetryTarget(null)}
        />
      ) : null}

      {revertTarget ? (
        <RevertConfirmModal
          playthrough={playthrough}
          target={revertTarget}
          isLoading={actionLoading}
          onConfirm={() => { void confirmRevert(); }}
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
          onConfirm={() => { void confirmTruncate(); }}
          onCancel={() => setTruncateTarget(null)}
        >
          <blockquote className="retry-preview">
            {truncateTarget.content.slice(0, 200)}{truncateTarget.content.length > 200 ? "…" : ""}
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
            {branchTarget.content.slice(0, 200)}{branchTarget.content.length > 200 ? "…" : ""}
          </blockquote>
          <div className="modal-form-fields">
            <TextInput
              label="Branch Name (optional)"
              value={branchNameInput}
              onChange={(e) => setBranchNameInput(e.target.value)}
              placeholder={`${playthrough.name} (Branch T${branchTarget.turn ?? playthrough.turn})`}
              disabled={actionLoading}
            />
            <Checkbox
              checked={branchAsStandalone}
              onChange={(e) => setBranchAsStandalone(e.target.checked)}
              disabled={actionLoading}
              label="Also create as separate Playthrough in Save/Load list"
              containerClassName="modal-checkbox-label"
            />
          </div>
        </ConfirmModal>
      ) : null}


      <SettingsModal
        open={settingsOpen}
        onClose={() => {
          setSettingsOpen(false);
          // The image provider is configured in this modal, so re-derive
          // availability (and the caption) on the way out. The prompt character
          // limit is edited there too, so pick that up as well.
          void refreshImageProvider();
          refreshImageCharacterLimit();
          // …and the swipe switch lives there, so arm or disarm the gesture now
          // rather than at the next reload.
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
        imagePromptPreview={imagePromptPreview}
        setImagePromptPreview={setImagePromptPreview}
        autoImageAfterTurn={autoImageAfterTurn}
        setAutoImageAfterTurn={setAutoImageAfterTurn}
        alwaysDiscardOldImage={alwaysDiscardOldImage}
        setAlwaysDiscardOldImage={setAlwaysDiscardOldImage}
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
    </main>
  );
}
