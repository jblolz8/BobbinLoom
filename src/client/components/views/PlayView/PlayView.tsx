import { useState } from "react";
import type { PlaythroughPromptSettings, TokenUsage, Persona, QuestAction } from "../../../api";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import type { FailedResponseNotice } from "../../../hooks/usePlaythrough";
import { ScenePanel } from "./ScenePanel";
import { ChatPanel } from "./ChatPanel";
import { InfoPanel } from "./InfoPanel/InfoPanel";
import { SaveLoadModal } from "../../modals/SaveLoadModal";
import { SettingsModal } from "../../modals/SettingsModal";
import { PersonaManager } from "../../modals/PersonaManager";
import { CharacterManager } from "../../modals/CharacterManager";
import { LorebookManager } from "../../modals/LorebookManager";
import { TimelineModal } from "../../modals/TimelineModal";

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
  } = props;

  const [timelinesOpen, setTimelinesOpen] = useState(false);
  const [branchNameInput, setBranchNameInput] = useState("");
  const [branchAsStandalone, setBranchAsStandalone] = useState(false);
  const [characterManagerEditingId, setCharacterManagerEditingId] = useState<string | undefined>(undefined);

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
        <nav className="mobile-tab-bar" aria-label="Mobile View Panels Navigation">
          <button
            className={`mobile-tab ${mobileTab === "scene" ? "active" : ""}`}
            onClick={() => setMobileTab("scene")}
            aria-label="Scene view"
            aria-current={mobileTab === "scene" ? "page" : undefined}
          >
            <span className="mobile-tab-icon" aria-hidden="true">🗺</span>
            <span className="mobile-tab-label">Scene</span>
          </button>
          <button
            className={`mobile-tab ${mobileTab === "chat" ? "active" : ""}`}
            onClick={() => setMobileTab("chat")}
            aria-label="Chat view"
            aria-current={mobileTab === "chat" ? "page" : undefined}
          >
            <span className="mobile-tab-icon" aria-hidden="true">💬</span>
            <span className="mobile-tab-label">Chat</span>
          </button>
          <button
            className={`mobile-tab ${mobileTab === "info" ? "active" : ""}`}
            onClick={() => setMobileTab("info")}
            aria-label="Info view"
            aria-current={mobileTab === "info" ? "page" : undefined}
          >
            <span className="mobile-tab-icon" aria-hidden="true">ℹ</span>
            <span className="mobile-tab-label">Info</span>
          </button>
        </nav>
      ) : null}

      {retryTarget ? (
        <div className="modal-backdrop">
          <section className="modal confirm-modal">
            <header className="modal-header">
              <div>
                <h2>Retry this response?</h2>
                <p>This will permanently delete this response and everything after it, then generate a new one. World state from the deleted turns will be reverted.</p>
              </div>
            </header>
            <blockquote className="retry-preview">
              {retryTarget.content.slice(0, 200)}{retryTarget.content.length > 200 ? "…" : ""}
            </blockquote>
            <div className="settings-actions">
              <button className="danger" onClick={confirmRetry} disabled={actionLoading}>
                {actionLoading ? "Retrying…" : "Yes, retry"}
              </button>
              <button onClick={() => setRetryTarget(null)} disabled={actionLoading}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {truncateTarget ? (
        <div className="modal-backdrop">
          <section className="modal confirm-modal">
            <header className="modal-header">
              <div>
                <h2>Delete up to here?</h2>
                <p>This will permanently delete this message and everything after it, reverting the world state to this point. This cannot be undone.</p>
              </div>
            </header>
            <blockquote className="retry-preview">
              {truncateTarget.content.slice(0, 200)}{truncateTarget.content.length > 200 ? "…" : ""}
            </blockquote>
            <div className="settings-actions">
              <button className="danger" onClick={confirmTruncate} disabled={actionLoading}>
                {actionLoading ? "Deleting…" : "Yes, delete"}
              </button>
              <button onClick={() => setTruncateTarget(null)} disabled={actionLoading}>Cancel</button>
            </div>
          </section>
        </div>
      ) : null}

      {branchTarget ? (
        <div className="modal-backdrop">
          <section className="modal confirm-modal" style={{ maxWidth: 500 }}>
            <header className="modal-header">
              <div>
                <h2>Branch into New Timeline?</h2>
                <p>Create a new playthrough timeline branching off right after this message. The world state will be rolled back to this point, leaving your current playthrough untouched.</p>
              </div>
            </header>
            <blockquote className="retry-preview">
              {branchTarget.content.slice(0, 200)}{branchTarget.content.length > 200 ? "…" : ""}
            </blockquote>
            <div style={{ margin: "1rem 0" }}>
              <label style={{ display: "block", fontSize: "0.82rem", marginBottom: "0.4rem", color: "#94a3b8" }}>
                Branch Name (optional)
              </label>
              <input
                type="text"
                value={branchNameInput}
                onChange={(e) => setBranchNameInput(e.target.value)}
                placeholder={`${playthrough.name} (Branch T${branchTarget.turn ?? playthrough.turn})`}
                style={{
                  width: "100%",
                  padding: "0.55rem 0.75rem",
                  borderRadius: "6px",
                  background: "#0f131b",
                  border: "1px solid #3a4150",
                  color: "#eceff4",
                  fontSize: "0.88rem"
                }}
              />
              <label
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.5rem",
                  marginTop: "0.75rem",
                  fontSize: "0.82rem",
                  color: "#94a3b8",
                  cursor: "pointer"
                }}
              >
                <input
                  type="checkbox"
                  checked={branchAsStandalone}
                  onChange={(e) => setBranchAsStandalone(e.target.checked)}
                />
                <span>Also create as separate Playthrough in Save/Load list</span>
              </label>
            </div>
            <div className="settings-actions">
              <button
                className="primary"
                onClick={async () => {
                  const name = branchNameInput.trim();
                  const standalone = branchAsStandalone;
                  setBranchNameInput("");
                  setBranchAsStandalone(false);
                  await confirmBranch(name || undefined, standalone);
                }}
                disabled={actionLoading}
              >
                {actionLoading ? "Branching…" : "Create Branch & Switch"}
              </button>
              <button
                onClick={() => {
                  setBranchTarget(null);
                  setBranchNameInput("");
                  setBranchAsStandalone(false);
                }}
                disabled={actionLoading}
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <SettingsModal
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
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
