import type { CharacterTemplate, LorebookSummary } from "../../../schemas";
import type { Persona } from "../../api";
import { Icon } from "../base";

export type SetupFormState = {
  name: string;
  setting: string;
  generateOpeningChoices: boolean;
  openingMode: "quick" | "fleshedOut";
};

export const defaultSetupForm: SetupFormState = {
  name: "", setting: "", generateOpeningChoices: false, openingMode: "fleshedOut",
};

export type SetupViewProps = {
  open: boolean;
  onClose: () => void;
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
  castLibrary: CharacterTemplate[];
  selectedCastIds: string[];
  onToggleCastId: (id: string) => void;
  lorebookLibrary: LorebookSummary[];
  selectedLorebookIds: string[];
  onToggleLorebookId: (id: string) => void;
  cardSettings: Array<{ title: string; scenario: string }>;
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
    open, onClose,
    personas, selectedPersonaId, onSelectPersona,
    castLibrary, selectedCastIds, onToggleCastId,
    lorebookLibrary, selectedLorebookIds, onToggleLorebookId,
    cardSettings,
    setupForm, onSetupFormChange,
    generating, genError, onGenerate, onCancelGenerate, onStartBlank, onOpenPersonaManager, onOpenLorebookManager
  } = props;

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal setup-modal">
        <header className="modal-header">
          <div>
            <h2>Create New Playthrough</h2>
            <p className="setup-subtitle">Describe your world and let the AI generate a starting scenario, or start with a blank slate.</p>
          </div>
          <button className="flex items-center gap-1" onClick={onClose} disabled={generating}>
            <Icon name="X" size={16} /> Close
          </button>
        </header>

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
          <button className="inline-action flex items-center gap-1" onClick={onOpenPersonaManager}>
            Manage Personas <Icon name="ArrowRight" size={14} />
          </button>
        </div>

        <div className="cast-picker-section">
          <h3>Choose a Cast</h3>
          <p className="cast-picker-hint">Library characters to start with. Generate adds them alongside the AI-created lead. Start Blank uses only these — uncheck all to begin with no characters at all.</p>
          {castLibrary.length === 0 ? (
            <p className="persona-empty">No characters in the library yet. Create some in the Character Manager, or start fresh.</p>
          ) : (
            <div className="cast-picker">
              {castLibrary.map((t) => {
                const isCcv2 = t.format === "ccv2";
                return (
                  <label
                    key={t.id}
                    className={`persona-pick-card cast-pick-card ${selectedCastIds.includes(t.id) ? "selected" : ""} ${isCcv2 ? "cast-disabled" : ""}`}
                    title={isCcv2 ? "Convert to BL first to be able to select this character" : undefined}
                  >
                    <input type="checkbox" disabled={isCcv2} checked={isCcv2 ? false : selectedCastIds.includes(t.id)}
                      onChange={() => onToggleCastId(t.id)} />
                    <strong>{t.name}</strong> {isCcv2 ? <span className="ccv2-badge">CCv2</span> : null} <span className="version-badge">v{t.version}</span>
                    <span className="persona-pick-desc">{t.content.split("\n").find(l => l.trim() && !l.startsWith("["))?.trim().slice(0, 80) || "No description."}</span>
                    {isCcv2 ? <span className="cast-warn">Convert to BL first to be able to select</span> : null}
                  </label>
                );
              })}
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
          <button className="inline-action flex items-center gap-1" onClick={onOpenLorebookManager}>
            Manage Lorebooks <Icon name="ArrowRight" size={14} />
          </button>
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
              rows={4}
              placeholder="Describe the world and starting situation. Include genre, tone, location, factions, or anything that sets the stage. The AI uses this to generate your scenario."
              className="auto-grow-textarea"
            />
          </label>
          {cardSettings.length > 0 ? (
            <label>
              <span className="field-hint">…or use an existing setting from an imported card</span>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return;
                  const picked = cardSettings.find((s) => s.scenario === e.target.value);
                  if (picked) onSetupFormChange((f) => ({ ...f, setting: picked.scenario }));
                }}
              >
                <option value="">Choose a card scenario…</option>
                {cardSettings.map((s) => (
                  <option key={s.scenario} value={s.scenario}>{s.title}</option>
                ))}
              </select>
            </label>
          ) : null}
          <div className="opening-mode-picker">
            <span className="field-hint">How should the opening be written?</span>
            <div className="opening-mode-options">
              <label className={`opening-mode-option ${setupForm.openingMode === "quick" ? "selected" : ""}`}>
                <input type="radio" name="openingMode" checked={setupForm.openingMode === "quick"}
                  onChange={() => onSetupFormChange((f) => ({ ...f, openingMode: "quick" }))} />
                <div>
                  <strong>Quick start</strong>
                  <span className="opening-mode-sub">Scenario + short opening · 1 call · faster/cheaper</span>
                </div>
              </label>
              <label className={`opening-mode-option ${setupForm.openingMode === "fleshedOut" ? "selected" : ""}`}>
                <input type="radio" name="openingMode" checked={setupForm.openingMode === "fleshedOut"}
                  onChange={() => onSetupFormChange((f) => ({ ...f, openingMode: "fleshedOut" }))} />
                <div>
                  <strong>Fleshed-out opening</strong>
                  <span className="opening-mode-sub">Generate, then write the first scene · 2 calls · richer</span>
                </div>
              </label>
            </div>
          </div>
          <label className="toggle">
            <input type="checkbox" checked={setupForm.generateOpeningChoices} onChange={(e) => onSetupFormChange((f) => ({ ...f, generateOpeningChoices: e.target.checked }))} />
            Generate initial choices
          </label>
        </div>

        <div className="setup-actions flex items-center gap-2 mt-4">
          <button className="primary-btn flex items-center gap-1.5" onClick={onGenerate} disabled={generating}>
            <Icon name="Wand2" size={16} /> {generating ? "Generating…" : "Generate Scenario"}
          </button>
          {generating ? (
            <button className="danger flex items-center gap-1.5" onClick={onCancelGenerate}>
              <Icon name="X" size={16} /> Cancel
            </button>
          ) : null}
          <button className="btn-secondary flex items-center gap-1.5" onClick={onStartBlank} disabled={generating}>
            <Icon name="FilePlus" size={16} /> Start Blank
          </button>
        </div>

        {genError ? (
          <div className="error-box setup-error">
            <p>{genError}</p>
            <div className="flex items-center gap-2 mt-2">
              <button className="flex items-center gap-1" onClick={onGenerate} disabled={generating}>
                <Icon name="RotateCcw" size={14} /> Retry
              </button>
              <button className="flex items-center gap-1" onClick={onStartBlank}>
                <Icon name="FilePlus" size={14} /> Use Start Blank Instead
              </button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
