import { useRef, useState } from "react";
import {
  createPlaythrough,
  generatePlaythrough,
  listCharacters,
  listLorebooks,
  listPersonas,
  type Persona,
  type PlaythroughPromptSettings,
  type ScenarioPreferences
} from "./api";
import type { CharacterTemplate, LorebookSummary } from "../schemas";
import { usePlaythrough } from "./hooks/usePlaythrough";
import { useResponsive } from "./hooks/useResponsive";
import { useModalState } from "./hooks/useModalState";
import { HomeView, type HomeTab } from "./components/views/HomeView";
import { defaultSetupForm, SetupView, type SetupFormState } from "./components/views/SetupView";
import { PlayView } from "./components/views/PlayView/PlayView";
import { SettingsModal } from "./components/modals/SettingsModal";
import { PersonaManager } from "./components/modals/PersonaManager";
import { CharacterManager } from "./components/modals/CharacterManager";
import { LorebookManager } from "./components/modals/LorebookManager";
import { AppHeader } from "./components/navigation/AppHeader";

type AppView = "play" | "setup" | "home";

export default function App() {
  const [view, setView] = useState<AppView>("home");
  const [homeTab, setHomeTab] = useState<HomeTab>("playthroughs");
  const [saveLoadOpen, setSaveLoadOpen] = useState(false);

  // Custom Hooks
  const playthroughHook = usePlaythrough();
  const responsiveHook = useResponsive();
  const modalHook = useModalState();

  // Setup state
  const [setupForm, setSetupForm] = useState<SetupFormState>(defaultSetupForm);
  const [generating, setGenerating] = useState(false);
  const [genError, setGenError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // Persona picker state (setup view)
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [selectedPersonaId, setSelectedPersonaId] = useState<string>("");

  // Cast & Lorebook pickers (setup view)
  const [castLibrary, setCastLibrary] = useState<CharacterTemplate[]>([]);
  const [selectedCastIds, setSelectedCastIds] = useState<string[]>([]);
  const [lorebookLibrary, setLorebookLibrary] = useState<LorebookSummary[]>([]);
  const [selectedLorebookIds, setSelectedLorebookIds] = useState<string[]>([]);

  // --- New Playthrough Setup ---

  function openSetup(initial?: {
    form?: Partial<SetupFormState>;
    personaId?: string;
    castIds?: string[];
  }) {
    setSetupForm({ ...defaultSetupForm, ...initial?.form });
    setGenError(null);
    setView("setup");
    if (initial?.personaId) setSelectedPersonaId(initial.personaId);
    void loadPersonasForPicker();
    void loadCastLibrary(initial?.castIds);
    void loadLorebookLibrary();
  }

  async function loadPersonasForPicker() {
    try {
      const all = await listPersonas();
      setPersonas(all);
      const def = all.find((p) => p.isDefault) ?? all[0];
      if (def && !selectedPersonaId) setSelectedPersonaId(def.id);
    } catch { /* silent */ }
  }

  async function loadCastLibrary(preSelectIds?: string[]) {
    try {
      const library = await listCharacters();
      setCastLibrary(library);
      if (preSelectIds && preSelectIds.length > 0) {
        const available = preSelectIds.filter((id) => library.some((t) => t.id === id));
        setSelectedCastIds(available);
      } else {
        setSelectedCastIds([]);
      }
    } catch {
      setCastLibrary([]);
      setSelectedCastIds([]);
    }
  }

  function toggleCastId(id: string) {
    setSelectedCastIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function loadLorebookLibrary() {
    try {
      setLorebookLibrary(await listLorebooks());
      setSelectedLorebookIds([]);
    } catch {
      setLorebookLibrary([]);
      setSelectedLorebookIds([]);
    }
  }

  function toggleLorebookId(id: string) {
    setSelectedLorebookIds((prev) => (prev.includes(id) ? prev.filter((c) => c !== id) : [...prev, id]));
  }

  async function handleGenerate() {
    setGenerating(true);
    setGenError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const prefs: ScenarioPreferences = {
        name: setupForm.name || "New Adventure",
        setting: setupForm.setting || undefined
      };
      const response = await generatePlaythrough(
        prefs,
        selectedPersonaId,
        selectedCastIds,
        setupForm.generateOpeningChoices,
        selectedLorebookIds,
        undefined,
        controller.signal
      );
      playthroughHook.resetTurnState(response.state);
      playthroughHook.setTokenUsage(response.tokenUsage ?? null);
      playthroughHook.setRawInput(response.rawInput ?? null);
      playthroughHook.setRawOutput(response.rawOutput ?? null);
      setView("play");
    } catch (e) {
      if (e instanceof DOMException && e.name === "AbortError") {
        setGenError("Scenario generation cancelled.");
      } else {
        setGenError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setGenerating(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancelGenerate() {
    abortControllerRef.current?.abort();
  }

  async function handleStartBlank() {
    try {
      const created = await createPlaythrough(
        setupForm.name || "New Story",
        selectedPersonaId || undefined,
        selectedCastIds,
        true,
        selectedLorebookIds,
        setupForm.setting || undefined
      );
      playthroughHook.resetTurnState(created);
      setView("play");
    } catch (e) {
      playthroughHook.setError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleStartNewWithSameScenario(
    scenarioDescription: string,
    personaId: string | undefined,
    initialCastIds: string[] | undefined,
    originalName: string
  ) {
    setSelectedPersonaId(personaId ?? "");
    openSetup({
      form: {
        name: `${originalName} (new)`,
        setting: scenarioDescription
      },
      personaId,
      castIds: initialCastIds
    });
  }

  function handlePlaythroughPromptSettings(updated: PlaythroughPromptSettings) {
    playthroughHook.setPlaythrough((prev) => (prev ? { ...prev, promptSettings: updated } : prev));
  }

  function handlePersonasChanged(refreshed: Persona[]) {
    setPersonas(refreshed);
    if (selectedPersonaId && !refreshed.some((p) => p.id === selectedPersonaId)) {
      const def = refreshed.find((p) => p.isDefault) ?? refreshed[0];
      setSelectedPersonaId(def?.id ?? "");
    }
  }

  function handleOpenModal(modal: "playthroughs" | "characters" | "lorebooks" | "personas" | "settings") {
    switch (modal) {
      case "playthroughs":
        setSaveLoadOpen(true);
        break;
      case "characters":
        modalHook.openCharacter();
        break;
      case "lorebooks":
        modalHook.openLorebook();
        break;
      case "personas":
        modalHook.openPersona();
        break;
      case "settings":
        modalHook.openSettings();
        break;
    }
  }

  // --- RENDER ---

  const currentView = view === "home" || !playthroughHook.playthrough ? "home" : view;

  return (
    <div className="app-root">
      <AppHeader
        view={currentView}
        activeHomeTab={homeTab}
        onSelectHomeTab={setHomeTab}
        activePlaythroughName={playthroughHook.playthrough?.name ?? null}
        onOpenModal={handleOpenModal}
        onGoHome={() => setView("home")}
        onNewPlaythrough={openSetup}
        onOpenSettings={modalHook.openSettings}
        isMobile={responsiveHook.isMobile}
      />

      {currentView === "setup" ? (
        <SetupView
          personas={personas}
          selectedPersonaId={selectedPersonaId}
          onSelectPersona={setSelectedPersonaId}
          castLibrary={castLibrary}
          selectedCastIds={selectedCastIds}
          onToggleCastId={toggleCastId}
          lorebookLibrary={lorebookLibrary}
          selectedLorebookIds={selectedLorebookIds}
          onToggleLorebookId={toggleLorebookId}
          setupForm={setupForm}
          onSetupFormChange={setSetupForm}
          generating={generating}
          genError={genError}
          onGenerate={() => { void handleGenerate(); }}
          onCancelGenerate={handleCancelGenerate}
          onStartBlank={() => { void handleStartBlank(); }}
          onBack={() => setView("home")}
          onOpenPersonaManager={modalHook.openPersona}
          onOpenLorebookManager={modalHook.openLorebook}
        />
      ) : currentView === "home" ? (
        <>
          <HomeView
            activeTab={homeTab}
            onOpenPlaythrough={(p) => {
              playthroughHook.resetTurnState(p);
              setView("play");
            }}
            onNewPlaythrough={openSetup}
            onOpenSettings={modalHook.openSettings}
            onPersonasChanged={handlePersonasChanged}
          />
          <SettingsModal
            open={modalHook.settingsOpen}
            onClose={modalHook.closeModal}
            playthroughId={null}
            playthroughPromptSettings={null}
            onPlaythroughPromptSettings={handlePlaythroughPromptSettings}
            choicesEnabled={playthroughHook.choicesEnabled}
            setChoicesEnabled={playthroughHook.setChoicesEnabled}
            showDebug={playthroughHook.showDebug}
            setShowDebug={playthroughHook.setShowDebug}
            showContextUsage={playthroughHook.showContextUsage}
            setShowContextUsage={playthroughHook.setShowContextUsage}
          />
          <PersonaManager
            open={modalHook.personaManagerOpen}
            onClose={modalHook.closeModal}
            onPersonasChanged={handlePersonasChanged}
          />
          <CharacterManager
            open={modalHook.characterManagerOpen}
            onClose={modalHook.closeModal}
          />
          <LorebookManager
            open={modalHook.lorebookManagerOpen}
            onClose={modalHook.closeModal}
          />
        </>
      ) : (
        <PlayView
          playthrough={playthroughHook.playthrough!}
          setPlaythrough={playthroughHook.setPlaythrough}
          onGoHome={() => setView("home")}
          onOpenSetup={openSetup}
          choicesEnabled={playthroughHook.choicesEnabled}
          setChoicesEnabled={playthroughHook.setChoicesEnabled}
          showDebug={playthroughHook.showDebug}
          setShowDebug={playthroughHook.setShowDebug}
          showContextUsage={playthroughHook.showContextUsage}
          setShowContextUsage={playthroughHook.setShowContextUsage}
          choices={playthroughHook.choices}
          input={playthroughHook.input}
          setInput={playthroughHook.setInput}
          loading={playthroughHook.loading}
          error={playthroughHook.error}
          setError={playthroughHook.setError}
          lastPatchInfo={playthroughHook.lastPatchInfo}
          sendingMessage={playthroughHook.sendingMessage}
          cancelledNotice={playthroughHook.cancelledNotice}
          tokenUsage={playthroughHook.tokenUsage}
          setTokenUsage={playthroughHook.setTokenUsage}
          rawInput={playthroughHook.rawInput}
          rawOutput={playthroughHook.rawOutput}
          editingMessageId={playthroughHook.editingMessageId}
          editDraft={playthroughHook.editDraft}
          setEditDraft={playthroughHook.setEditDraft}
          retryTarget={playthroughHook.retryTarget}
          setRetryTarget={playthroughHook.setRetryTarget}
          actionLoading={playthroughHook.actionLoading}
          resummarizingChapterId={playthroughHook.resummarizingChapterId}
          viewingChapterId={playthroughHook.viewingChapterId}
          setViewingChapterId={playthroughHook.setViewingChapterId}
          loadPlaythrough={playthroughHook.loadPlaythrough}
          handleSend={playthroughHook.handleSend}
          handleCancel={playthroughHook.handleCancel}
          startEdit={playthroughHook.startEdit}
          cancelEdit={playthroughHook.cancelEdit}
          saveEdit={playthroughHook.saveEdit}
          confirmRetry={playthroughHook.confirmRetry}
          handleResummarizeChapter={playthroughHook.handleResummarizeChapter}
          handleQuestAction={playthroughHook.handleQuestAction}
          handleDismissNotice={() => playthroughHook.setCancelledNotice(null)}
          openPersonaManager={modalHook.openPersona}
          handlePersonasChanged={handlePersonasChanged}
          handlePlaythroughPromptSettings={handlePlaythroughPromptSettings}
          handleStartNewWithSameScenario={handleStartNewWithSameScenario}
          isMobile={responsiveHook.isMobile}
          mobileTab={responsiveHook.mobileTab}
          setMobileTab={responsiveHook.setMobileTab}
          moreMenuOpen={responsiveHook.moreMenuOpen}
          setMoreMenuOpen={responsiveHook.setMoreMenuOpen}
          moreMenuRef={responsiveHook.moreMenuRef}
          personaManagerOpen={modalHook.personaManagerOpen}
          setPersonaManagerOpen={modalHook.setPersonaManagerOpen}
          characterManagerOpen={modalHook.characterManagerOpen}
          setCharacterManagerOpen={modalHook.setCharacterManagerOpen}
          lorebookManagerOpen={modalHook.lorebookManagerOpen}
          setLorebookManagerOpen={modalHook.setLorebookManagerOpen}
          settingsOpen={modalHook.settingsOpen}
          setSettingsOpen={modalHook.setSettingsOpen}
          saveLoadOpen={saveLoadOpen}
          setSaveLoadOpen={setSaveLoadOpen}
        />
      )}
    </div>
  );
}
