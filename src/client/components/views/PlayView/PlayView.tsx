import { useCallback, useEffect, useState } from "react";
import {
  listProviderConnections,
  type ImageGenerationProgress,
  type PlaythroughPromptSettings,
  type TokenUsage,
  type Persona,
  type QuestAction
} from "../../../api";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import type { FailedResponseNotice, ImageGenerationOverrides, ImagePromptRequest } from "../../../hooks/usePlaythrough";
import { ScenePanel } from "./ScenePanel";
import { ChatPanel } from "./ChatPanel";
import { InfoPanel } from "./InfoPanel/InfoPanel";
import { SaveLoadModal } from "../../modals/SaveLoadModal";
import { SettingsModal } from "../../modals/SettingsModal";
import { PersonaManager } from "../../modals/PersonaManager";
import { CharacterManager } from "../../modals/CharacterManager";
import { LorebookManager } from "../../modals/LorebookManager";
import { TimelineModal } from "../../modals/TimelineModal";
import { ConfirmModal } from "../../common/ConfirmModal";
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
  setRetryTarget: (msg: ChatMessage | null) => void;
  truncateTarget: ChatMessage | null;
  setTruncateTarget: (msg: ChatMessage | null) => void;
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
  confirmRetry: () => Promise<void>;
  confirmTruncate: () => Promise<void>;
  branchTarget: ChatMessage | null;
  setBranchTarget: (msg: ChatMessage | null) => void;
  confirmBranch: (branchName?: string, asStandalone?: boolean) => Promise<void>;
  handleResummarizeChapter: (chapterId: string) => Promise<void>;
  handleQuestAction: (questId: string, action: QuestAction, name?: string, summary?: string) => Promise<void>;
  handleDismissNotice: () => void;
  handleDismissFailedNotice?: () => void;
  openPersonaManager: () => void;
  handlePersonasChanged: (refreshed: Persona[]) => void;
  handlePlaythroughPromptSettings: (updated: PlaythroughPromptSettings) => void;
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
  /** Live a1111 sampling progress for the image in flight, straight from the
   *  hook. Null whenever nothing is running (and for dialects that cannot
   *  report progress). */
  imageProgress?: ImageGenerationProgress | null;
  imagePromptRequest?: ImagePromptRequest | null;
  handleGenerateImage?: (msg: ChatMessage, overrides?: ImageGenerationOverrides) => Promise<void>;
  handleCancelImage?: () => void;
  closeImagePrompt?: () => void;
  rerunImagePrompt?: () => Promise<void>;
  handleDeleteImage?: (msg: ChatMessage, file: string) => Promise<void>;
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
    truncateTarget,
    setTruncateTarget,
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
    confirmRetry,
    confirmTruncate,
    branchTarget,
    setBranchTarget,
    confirmBranch,
    handleResummarizeChapter,
    handleQuestAction,
    handleDismissNotice,
    handleDismissFailedNotice,
    handlePersonasChanged,
    handlePlaythroughPromptSettings,
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
    imageProgress = null,
    imagePromptRequest = null,
    handleGenerateImage,
    handleCancelImage,
    closeImagePrompt,
    rerunImagePrompt,
    handleDeleteImage
  } = props;

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

  // The preset's soft prompt limit, when this playthrough's snapshot carries one
  // (the prompt modal then shows a real `n / limit` counter).
  const imageCharacterLimit = playthrough.promptSettings?.imageGeneration?.promptCharacterLimit;

  function handleCurrentDeleted(remaining: Playthrough[]) {
    if (remaining.length > 0) {
      setPlaythrough(remaining[0]);
    } else {
      setPlaythrough(null);
      onGoHome();
    }
  }

  return (
    <main className="app-shell play-view-shell">
      {error ? <pre className="error-box">{error}</pre> : null}

      <SaveLoadModal
        open={saveLoadOpen}
        onClose={() => setSaveLoadOpen(false)}
        currentPlaythroughId={playthrough.id}
        onLoad={(id) => { void loadPlaythrough(id); }}
        onCurrentDeleted={handleCurrentDeleted}
        onCurrentRenamed={setPlaythrough}
        onError={setError}
      />

      <section className="layout">
        <ScenePanel
          playthrough={playthrough}
          actionLoading={actionLoading}
          onQuestAction={handleQuestAction}
          className={isMobile && mobileTab !== "scene" ? "mobile-hidden" : undefined}
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
          onRequestTruncate={setTruncateTarget}
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
          imageProgress={imageProgress}
          imagePromptRequest={imagePromptRequest}
          imageCharacterLimit={imageCharacterLimit}
          imageProviderLabel={imageConnection?.label}
          imageProviderModel={imageConnection?.model}
          onGenerateImage={(msg) => { void handleGenerateImage?.(msg); }}
          onCancelImage={handleCancelImage}
          onDeleteImage={(msg, file) => { void handleDeleteImage?.(msg, file); }}
          onImagePromptGenerate={(prompt, negativePrompt) => {
            const request = imagePromptRequest;
            if (!request) return;
            // Both overrides present ⇒ the server skips the text call: no second
            // token spend and the edits are what the image provider receives.
            void handleGenerateImage?.(request.message, { promptOverride: prompt, negativeOverride: negativePrompt });
          }}
          onImagePromptRerun={() => { void rerunImagePrompt?.(); }}
          onImagePromptClose={closeImagePrompt}
          className={isMobile && mobileTab !== "chat" ? "mobile-hidden" : undefined}
        />

        <InfoPanel
          playthrough={playthrough}
          onPlaythroughChange={setPlaythrough}
          onViewChapter={setViewingChapterId}
          onCloseChapterComplete={(tu) => setTokenUsage(tu)}
          onStartNewWithSameScenario={(sd, pid, cids, name) => handleStartNewWithSameScenario(sd, pid, cids, name)}
          onOpenLibrary={(templateId) => {
            setCharacterManagerEditingId(templateId);
            setCharacterManagerOpen(true);
          }}
          onOpenTimelines={() => setTimelinesOpen(true)}
          actionLoading={actionLoading}
          className={isMobile && mobileTab !== "info" ? "mobile-hidden" : undefined}
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
              <Icon name="Compass" size={20} />
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
              <Icon name="MessageSquare" size={20} />
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
              <Icon name="BookOpen" size={20} />
            </span>
            <span className="mobile-tab-label">Info</span>
          </button>
        </nav>
      ) : null}

      {retryTarget ? (
        <ConfirmModal
          title="Retry this response?"
          message="This will permanently delete this response and everything after it, then generate a new one. World state from the deleted turns will be reverted."
          confirmLabel={actionLoading ? "Retrying…" : "Yes, retry"}
          danger
          isLoading={actionLoading}
          onConfirm={() => { void confirmRetry(); }}
          onCancel={() => setRetryTarget(null)}
        >
          <blockquote className="retry-preview">
            {retryTarget.content.slice(0, 200)}{retryTarget.content.length > 200 ? "…" : ""}
          </blockquote>
        </ConfirmModal>
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
          // availability (and the caption) on the way out.
          void refreshImageProvider();
        }}
        playthroughId={playthrough?.id ?? null}
        playthroughPromptSettings={playthrough?.promptSettings ?? null}
        onPlaythroughPromptSettings={handlePlaythroughPromptSettings}
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
