import type { PlaythroughPromptSettings, TokenUsage, Persona, QuestAction } from "../../../api";
import type { ChatMessage, Playthrough } from "../../../../schemas";
import { ScenePanel } from "./ScenePanel";
import { ChatPanel } from "./ChatPanel";
import { InfoPanel } from "./InfoPanel/InfoPanel";
import { SaveLoadModal } from "../../modals/SaveLoadModal";
import { SettingsModal } from "../../modals/SettingsModal";
import { PersonaManager } from "../../modals/PersonaManager";
import { CharacterManager } from "../../modals/CharacterManager";
import { LorebookManager } from "../../modals/LorebookManager";

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
  choices: string[];
  input: string;
  setInput: (val: string) => void;
  loading: boolean;
  error: string | null;
  setError: (val: string | null) => void;
  lastPatchInfo: { applied: string[]; rejected: string[]; warnings: string[] };
  sendingMessage: string | null;
  cancelledNotice: string | null;
  tokenUsage: TokenUsage | null;
  setTokenUsage: (tu: TokenUsage | null) => void;
  rawInput: string | null;
  rawOutput: string | null;
  editingMessageId: string | null;
  editDraft: string;
  setEditDraft: (val: string) => void;
  retryTarget: ChatMessage | null;
  setRetryTarget: (msg: ChatMessage | null) => void;
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
  handleResummarizeChapter: (chapterId: string) => Promise<void>;
  handleQuestAction: (questId: string, action: QuestAction, name?: string, summary?: string) => Promise<void>;
  handleDismissNotice: () => void;
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
    choices,
    input,
    setInput,
    loading,
    error,
    setError,
    lastPatchInfo,
    sendingMessage,
    cancelledNotice,
    tokenUsage,
    setTokenUsage,
    rawInput,
    rawOutput,
    editingMessageId,
    editDraft,
    setEditDraft,
    retryTarget,
    setRetryTarget,
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
    handleResummarizeChapter,
    handleQuestAction,
    handleDismissNotice,
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
          onChoiceSelect={setInput}
          editingMessageId={editingMessageId}
          editDraft={editDraft}
          onEditDraftChange={setEditDraft}
          onStartEdit={startEdit}
          onSaveEdit={() => { void saveEdit(); }}
          onCancelEdit={cancelEdit}
          onRetryRequest={setRetryTarget}
          lastPatchInfo={lastPatchInfo}
          sendingMessage={sendingMessage}
          cancelledNotice={cancelledNotice}
          onDismissNotice={handleDismissNotice}
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
      />

      <PersonaManager
        open={personaManagerOpen}
        onClose={() => setPersonaManagerOpen(false)}
        onPersonasChanged={handlePersonasChanged}
      />

      <CharacterManager open={characterManagerOpen} onClose={() => setCharacterManagerOpen(false)} />

      <LorebookManager
        open={lorebookManagerOpen}
        onClose={() => setLorebookManagerOpen(false)}
      />
    </main>
  );
}
