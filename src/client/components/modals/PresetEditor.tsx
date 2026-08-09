import { useEffect, useState } from "react";
import {
  createPreset,
  deletePreset,
  getDefaultPresetId,
  getPreset,
  listPresets,
  setDefaultPresetId,
  updatePlaythroughPromptSettings,
  updatePreset,
  type ModuleContext,
  type PlaythroughPromptSettings,
  type PromptModuleSet,
  type PresetModule,
  type PresetSummary
} from "../../api";

export type PresetEditorProps = {
  playthroughId: string | null;
  playthroughPromptSettings: PlaythroughPromptSettings | null;
  onPlaythroughPromptSettings: (updated: PlaythroughPromptSettings) => void;
};

function newModuleId(): string {
  return `mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

const CONTEXT_TABS: Array<{ value: ModuleContext; label: string }> = [
  { value: "turn", label: "Turn" },
  { value: "seed", label: "New Scenario" },
  { value: "sheet", label: "Character Sheet" },
  { value: "summary", label: "Summary" }
];

export function PresetEditor({ playthroughId, playthroughPromptSettings, onPlaythroughPromptSettings }: PresetEditorProps) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("default");
  const [activePresetName, setActivePresetName] = useState("Default");
  const [activePresetReadonly, setActivePresetReadonly] = useState(true);
  const [presetModules, setPresetModules] = useState<PromptModuleSet>({ turn: [], seed: [], sheet: [], summary: [] });
  const [presetDirty, setPresetDirty] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);
  const [editingModule, setEditingModule] = useState<PresetModule | null>(null);
  const [editModuleForm, setEditModuleForm] = useState<{ name: string; description: string; content: string }>({ name: "", description: "", content: "" });
  const [activeContextTab, setActiveContextTab] = useState<ModuleContext>("turn");
  const [status, setStatus] = useState<string | null>(null);

  function resetPresetState() { setPresetDirty(false); setEditingModule(null); }
  function markDirty() { setPresetDirty(true); }

  useEffect(() => {
    void loadPresetData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  async function loadPresetData() {
    const summaries = await listPresets();
    setPresets(summaries);

    let currentId = playthroughPromptSettings?.presetId;
    if (!currentId) {
      try {
        const { defaultPresetId } = await getDefaultPresetId();
        currentId = defaultPresetId ?? "default";
      } catch {
        currentId = "default";
      }
    }

    setActivePresetId(currentId);
    try {
      const fullPreset = await getPreset(currentId);
      setActivePresetName(fullPreset.name);
      setActivePresetReadonly(fullPreset.readonly);
      setPresetModules(fullPreset.modules);
    } catch {
      if (playthroughPromptSettings) {
        setActivePresetName(playthroughPromptSettings.presetName);
        setActivePresetReadonly(false);
        setPresetModules(playthroughPromptSettings.modules);
      }
    }
    resetPresetState();
  }

  async function switchPreset(presetId: string) {
    setPresetSaving(true); setStatus(null);
    try {
      const fullPreset = await getPreset(presetId);
      setActivePresetId(fullPreset.id); setActivePresetName(fullPreset.name);
      setActivePresetReadonly(fullPreset.readonly); setPresetModules(fullPreset.modules);
      resetPresetState();
      if (playthroughId) {
        const updated = await updatePlaythroughPromptSettings(playthroughId, presetId);
        onPlaythroughPromptSettings(updated);
        setStatus(`Switched to "${fullPreset.name}" and applied to playthrough.`);
      } else {
        await setDefaultPresetId(presetId);
        setStatus(`Switched to "${fullPreset.name}" as global default.`);
      }
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
    finally { setPresetSaving(false); }
  }

  async function savePreset() {
    if (activePresetReadonly || presetSaving) return;
    setPresetSaving(true); setStatus(null);
    try {
      const updated = await updatePreset(activePresetId, { modules: presetModules });
      setPresetModules(updated.modules); resetPresetState();
      setStatus(`"${activePresetName}" saved.`);
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
    finally { setPresetSaving(false); }
  }

  async function savePresetAs() {
    setPresetSaving(true); setStatus(null);
    const name = window.prompt("New preset name:", `${activePresetName} (copy)`);
    if (!name) { setPresetSaving(false); return; }
    try {
      const created = await createPreset(name);
      const updated = await updatePreset(created.id, { modules: presetModules });
      setActivePresetId(updated.id); setActivePresetName(updated.name);
      setActivePresetReadonly(updated.readonly); setPresetModules(updated.modules);
      setPresets(await listPresets()); resetPresetState();
      setStatus(`Saved as "${updated.name}".`);
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
    finally { setPresetSaving(false); }
  }

  async function renamePreset() {
    if (activePresetReadonly || presetSaving) return;
    const name = window.prompt("Rename preset:", activePresetName);
    if (!name || name === activePresetName) return;
    setPresetSaving(true); setStatus(null);
    try {
      const updated = await updatePreset(activePresetId, { name });
      setActivePresetName(updated.name); setPresets(await listPresets());
      setStatus(`Renamed to "${updated.name}".`);
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
    finally { setPresetSaving(false); }
  }

  async function removePreset() {
    if (activePresetReadonly || presetSaving) return;
    if (!window.confirm(`Delete preset "${activePresetName}"? This cannot be undone.`)) return;
    setPresetSaving(true); setStatus(null);
    try {
      await deletePreset(activePresetId);
      const defaultPreset = await getPreset("default");
      setActivePresetId(defaultPreset.id); setActivePresetName(defaultPreset.name);
      setActivePresetReadonly(defaultPreset.readonly); setPresetModules(defaultPreset.modules);
      setPresets(await listPresets()); resetPresetState();
      setStatus("Preset deleted. Switched to Default.");
    } catch (e) { setStatus(e instanceof Error ? e.message : String(e)); }
    finally { setPresetSaving(false); }
  }

  function toggleModule(moduleId: string) {
    setPresetModules((prev) => ({ ...prev, [activeContextTab]: prev[activeContextTab].map((m) => (m.id === moduleId ? { ...m, enabled: !m.enabled } : m)) }));
    markDirty();
  }

  function moveModule(moduleId: string, direction: -1 | 1) {
    setPresetModules((prev) => {
      const sorted = [...prev[activeContextTab]].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((m) => m.id === moduleId);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= sorted.length) return prev;
      [sorted[idx], sorted[targetIdx]] = [sorted[targetIdx], sorted[idx]];
      return { ...prev, [activeContextTab]: sorted.map((m, i) => ({ ...m, order: i + 1 })) };
    });
    markDirty();
  }

  function openEditModule(mod: PresetModule) {
    setEditingModule(mod);
    setEditModuleForm({ name: mod.name, description: mod.description, content: mod.content });
  }

  function saveEditModule() {
    if (!editingModule) return;
    setPresetModules((prev) => ({
      ...prev,
      [activeContextTab]: prev[activeContextTab].map((m) =>
        m.id === editingModule.id ? { ...m, name: editModuleForm.name, description: editModuleForm.description, content: editModuleForm.content } : m
      )
    }));
    setEditingModule(null);
    markDirty();
  }

  function deleteModule(moduleId: string) {
    if (!window.confirm("Delete this module?")) return;
    setPresetModules((prev) => ({ ...prev, [activeContextTab]: prev[activeContextTab].filter((m) => m.id !== moduleId) }));
    markDirty();
  }

  function addNewModule() {
    const newMod: PresetModule = { id: newModuleId(), name: "New Module", description: "", content: "", order: presetModules[activeContextTab].length + 1, enabled: true };
    setPresetModules((prev) => ({ ...prev, [activeContextTab]: [...prev[activeContextTab], newMod] }));
    setEditingModule(newMod);
    setEditModuleForm({ name: newMod.name, description: "", content: "" });
    markDirty();
  }

  return (
    <>
      <section className="prompt-config">
        <div className="preset-bar">
          <label>Preset: <select value={activePresetId} onChange={(e) => void switchPreset(e.target.value)} disabled={presetSaving}>{presets.map((p) => <option key={p.id} value={p.id}>{p.name} {p.readonly ? "(read-only)" : ""}</option>)}</select></label>
          <div className="preset-actions">
            <button onClick={() => void savePreset()} disabled={activePresetReadonly || !presetDirty || presetSaving}>Save</button>
            <button onClick={() => void savePresetAs()} disabled={presetSaving}>Save as New…</button>
            <button onClick={() => void renamePreset()} disabled={activePresetReadonly || presetSaving}>Rename</button>
            <button className="danger" onClick={() => void removePreset()} disabled={activePresetReadonly || presetSaving}>Delete</button>
          </div>
        </div>
        {activePresetReadonly ? <p className="module-hint">Read-only. Use "Save as New…" to create an editable copy.</p> : null}

        <div className="preset-context-tabs">
          {CONTEXT_TABS.map((tab) => {
            const count = presetModules[tab.value].length;
            return (
              <button key={tab.value} className={`editor-tab${activeContextTab === tab.value ? " active" : ""}`} onClick={() => setActiveContextTab(tab.value)}>
                {tab.label}
                <span className="tab-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {(() => {
          const sortedModules = [...presetModules[activeContextTab]].sort((a, b) => a.order - b.order);
          if (sortedModules.length === 0) return null;
          return (
            <div className="module-group">
              {sortedModules.map((mod) => {
                const idx = sortedModules.indexOf(mod);
                return (
                  <div key={mod.id} className="module-row">
                    <label className="module-toggle" title={mod.description}><input type="checkbox" checked={mod.enabled} onChange={() => toggleModule(mod.id)} /><span className="module-name">{mod.name}</span></label>
                    <div className="module-row-actions">
                      <button className="icon-btn" title="Move up" onClick={() => moveModule(mod.id, -1)} disabled={idx === 0}>↑</button>
                      <button className="icon-btn" title="Move down" onClick={() => moveModule(mod.id, 1)} disabled={idx === sortedModules.length - 1}>↓</button>
                      <button className="icon-btn" title="Edit" onClick={() => openEditModule(mod)}>✎</button>
                      <button className="icon-btn danger-icon" title="Delete" onClick={() => deleteModule(mod.id)}>✕</button>
                    </div>
                  </div>
                );
              })}
            </div>
          );
        })()}
        <button className="add-module-btn" onClick={addNewModule}>+ Add Module</button>
        {status ? <pre className="settings-status">{status}</pre> : null}
      </section>

      {editingModule ? (
        <div className="modal-backdrop">
          <section className="modal module-edit-modal">
            <header className="modal-header"><h2>Edit Module</h2><button onClick={() => setEditingModule(null)}>Close</button></header>
            <div className="settings-form">
              <label>Name <input value={editModuleForm.name} onChange={(e) => setEditModuleForm((f) => ({ ...f, name: e.target.value }))} /></label>
              <label>Description <textarea rows={2} value={editModuleForm.description} onChange={(e) => setEditModuleForm((f) => ({ ...f, description: e.target.value }))} /></label>
              <label>Content <textarea rows={10} value={editModuleForm.content} onChange={(e) => setEditModuleForm((f) => ({ ...f, content: e.target.value }))} /></label>
              <div className="settings-actions"><button onClick={saveEditModule}>Save</button><button onClick={() => setEditingModule(null)}>Cancel</button></div>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
