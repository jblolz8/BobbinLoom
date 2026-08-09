import type { CharacterTemplate, LorebookSummary } from "../../../schemas";
import type { Persona } from "../../api";

export type SetupFormState = {
  name: string;
  setting: string;
  generateOpeningChoices: boolean;
};

export const defaultSetupForm: SetupFormState = {
  name: "", setting: "", generateOpeningChoices: false
};

export type SetupViewProps = {
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
  castLibrary: CharacterTemplate[];
  selectedCastIds: string[];
  onToggleCastId: (id: string) => void;
  lorebookLibrary: LorebookSummary[];
  selectedLorebookIds: string[];
  onToggleLorebookId: (id: string) => void;
  setupForm: SetupFormState;
  onSetupFormChange: (updater: (f: SetupFormState) => SetupFormState) => void;
  generating: boolean;
  genError: string | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onStartBlank: () => void;
  onBack: () => void;
  onOpenPersonaManager: () => void;
  onOpenLorebookManager: () => void;
};

export function SetupView(props: SetupViewProps) {
  const {
    personas, selectedPersonaId, onSelectPersona,
    castLibrary, selectedCastIds, onToggleCastId,
    lorebookLibrary, selectedLorebookIds, onToggleLorebookId,
    setupForm, onSetupFormChange,
    generating, genError, onGenerate, onCancelGenerate, onStartBlank, onOpenPersonaManager, onOpenLorebookManager
  } = props;

  return (
    <main className="app-shell setup-view-shell">
      <section className="setup-page">
        <h2>Create New Playthrough</h2>
        <p className="setup-subtitle">Describe your world and let the AI generate a starting scenario, or start with a blank slate.</p>

        <div className="persona-picker-section">
          <h3>Choose a Persona</h3>
          {personas.length === 0 ? (
            <p className="persona-empty">No personas found. Create one in Persona Manager first.</p>
          ) : (
            <div className="persona-picker">
              {personas.map((p) => (
                <label key={p.id} className={`persona-pick-card ${selectedPersonaId === p.id ? "selected" : ""}`}>
                  <input type="radio" name="persona" checked={selectedPersonaId === p.id}
                    onChange={() => onSelectPersona(p.id)} />
                  <strong>{p.name}</strong> {p.isDefault ? "★" : ""}
                  <span className="persona-pick-desc">{p.description}</span>
                </label>
              ))}
            </div>
          )}
          <button className="inline-action" onClick={onOpenPersonaManager}>Manage Personas →</button>
        </div>

        <div className="cast-picker-section">
          <h3>Choose a Cast</h3>
          <p className="cast-picker-hint">Library characters to start with. Generate adds them alongside the AI-created lead. Start Blank uses only these — uncheck all to begin with no characters at all.</p>
          {castLibrary.length === 0 ? (
            <p className="persona-empty">No characters in the library yet. Create some in the Character Manager, or start fresh.</p>
          ) : (
            <div className="cast-picker">
              {castLibrary.map((t) => (
                <label key={t.id} className={`persona-pick-card cast-pick-card ${selectedCastIds.includes(t.id) ? "selected" : ""}`}>
                  <input type="checkbox" checked={selectedCastIds.includes(t.id)} onChange={() => onToggleCastId(t.id)} />
                  <strong>{t.name}</strong> <span className="version-badge">v{t.version}</span>
                  <span className="persona-pick-desc">{t.content.split("\n").find(l => l.trim() && !l.startsWith("["))?.trim().slice(0, 80) || "No description."}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <div className="lorebook-picker-section">
          <h3>Lorebooks</h3>
          <p className="cast-picker-hint">Select World Info lorebooks to include. Content is scanned for keyword matches each turn and injected into the prompt.</p>
          {lorebookLibrary.length === 0 ? (
            <p className="persona-empty">No lorebooks imported yet. Import some in the Lorebook Manager, or leave empty.</p>
          ) : (
            <div className="cast-picker">
              {lorebookLibrary.map((lb) => (
                <label key={lb.id} className={`persona-pick-card cast-pick-card ${selectedLorebookIds.includes(lb.id) ? "selected" : ""}`}>
                  <input type="checkbox" checked={selectedLorebookIds.includes(lb.id)} onChange={() => onToggleLorebookId(lb.id)} />
                  <strong>{lb.name}</strong>
                  <span className="persona-pick-desc">{lb.entryCount} entries · scan depth {lb.scanDepth}</span>
                </label>
              ))}
            </div>
          )}
          <button className="inline-action" onClick={onOpenLorebookManager}>Manage Lorebooks →</button>
        </div>

        <div className="settings-form setup-form">
          <label>
            Playthrough Name
            <input value={setupForm.name} onChange={(e) => onSetupFormChange((f) => ({ ...f, name: e.target.value }))} placeholder="e.g. Dragon's Rest" />
          </label>
          <label>
            Setting
            <span className="field-hint">Describe the world and starting situation. Include genre, tone, location, factions, or anything that sets the stage. The AI uses this to generate your scenario.</span>
            <textarea
              value={setupForm.setting}
              onChange={(e) => {
                onSetupFormChange((f) => ({ ...f, setting: e.target.value }));
                e.target.style.height = "auto";
                e.target.style.height = e.target.scrollHeight + "px";
              }}
              rows={6}
              placeholder="Describe the world and starting situation. Include genre, tone, location, factions, or anything that sets the stage. The AI uses this to generate your scenario."
              className="auto-grow-textarea"
            />
          </label>
          <label className="toggle">
            <input type="checkbox" checked={setupForm.generateOpeningChoices} onChange={(e) => onSetupFormChange((f) => ({ ...f, generateOpeningChoices: e.target.checked }))} />
            Generate initial choices
          </label>
        </div>

        <div className="setup-actions">
          <button className="primary-btn" onClick={onGenerate} disabled={generating}>
            {generating ? "Generating…" : "Generate Scenario"}
          </button>
          {generating ? (
            <button className="danger" onClick={onCancelGenerate}>Cancel</button>
          ) : null}
          <button onClick={onStartBlank} disabled={generating}>
            Start Blank
          </button>
        </div>

        {genError ? (
          <div className="error-box setup-error">
            <p>{genError}</p>
            <button onClick={onGenerate} disabled={generating}>Retry</button>
            <button onClick={onStartBlank}>Use Start Blank Instead</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
