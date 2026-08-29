import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHARACTER_FORMAT } from "../../../engine/characterFormat";
import type { CharacterFormat, CharacterFormatSection } from "../../../schemas";
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

function cloneFormat(format?: CharacterFormat): CharacterFormat {
  if (!format || format.sections.length === 0) return JSON.parse(JSON.stringify(DEFAULT_CHARACTER_FORMAT)) as CharacterFormat;
  return JSON.parse(JSON.stringify(format)) as CharacterFormat;
}

function reindex(sections: CharacterFormatSection[]): CharacterFormatSection[] {
  return sections.map((s, i) => ({ ...s, order: i + 1 }));
}

/** Examples → single plain-text textarea value (raw join, no transform). */
function examplesToText(examples?: string[]): string {
  return (examples ?? []).join("\n");
}

/** Plain textarea value → examples: split lines, keep trimmed non-empty lines. */
function textToExamples(text: string): string[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}

/** Nearest scrollable ancestor of an element, or null. Used to auto-scroll the
 *  format list while dragging near its top/bottom edge. */
function getScrollParent(el: HTMLElement | null): HTMLElement | null {
  let node = el?.parentElement ?? null;
  while (node) {
    const style = window.getComputedStyle(node);
    if (/(auto|scroll|overlay)/.test(style.overflowY) && node.scrollHeight > node.clientHeight) {
      return node;
    }
    node = node.parentElement;
  }
  return null;
}

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

type CharacterFormatRowProps = {
  section: CharacterFormatSection;
  index: number;
  readonly: boolean;
  isDragging: boolean;
  isDropTarget: boolean;
  rowRef: (el: HTMLDivElement | null) => void;
  onGripPointerDown: (e: React.PointerEvent, index: number) => void;
  onChange: (index: number, patch: Partial<CharacterFormatSection>) => void;
  onRemove: (index: number) => void;
};

/** A single editable Character Sheet section row. Owns the Examples textarea's
 *  raw draft locally so typing is freeform; normalization to the stored
 *  string[] happens once on blur. Rows reorder via pointer-based drag on the
 *  grip handle — a single implementation that works for both mouse and touch
 *  (native HTML5 drag-and-drop has no touch support, so we use pointer events). */
function CharacterFormatRow({ section, index, readonly, isDragging, isDropTarget, rowRef, onGripPointerDown, onChange, onRemove }: CharacterFormatRowProps) {
  const [draft, setDraft] = useState(examplesToText(section.examples));

  // Reseed the draft whenever the section's examples change externally (preset
  // switch, a reorder that remaps this index, or our own blur commit). While
  // the user is typing, section.examples is unchanged so this never fires.
  useEffect(() => {
    setDraft(examplesToText(section.examples));
  }, [section.examples]);

  return (
    <div
      ref={rowRef}
      data-section-row={index}
      className={`format-section-row${isDragging ? " dragging" : ""}${isDropTarget ? " drop-target" : ""}`}
    >
      <div className="format-section-head">
        <span className="format-index">{index + 1}.</span>
        <input
          className="format-section-name"
          value={section.name}
          onChange={(e) => onChange(index, { name: e.target.value })}
          placeholder="Section name, e.g. Occupation"
          disabled={readonly}
        />
        <label className="format-inline-toggle" title="Render as [Name]: value on one line">
          <input type="checkbox" checked={!!section.inline} onChange={(e) => onChange(index, { inline: e.target.checked })} disabled={readonly} />
          inline
        </label>
        <div className="module-row-actions">
          <span
            className="format-drag-handle"
            title="Drag to reorder"
            onPointerDown={(e) => onGripPointerDown(e, index)}
          >⋮⋮</span>
          <button className="icon-btn danger-icon" title="Delete section" onClick={() => onRemove(index)} disabled={readonly}>✕</button>
        </div>
      </div>
      <textarea
        className="format-instruction"
        rows={2}
        value={section.instruction}
        onChange={(e) => onChange(index, { instruction: e.target.value })}
        placeholder="Instruction for the model: what this section should contain."
        disabled={readonly}
      />
      <textarea
        className="format-examples"
        rows={4}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(index, { examples: textToExamples(draft) })}
        placeholder="Optional example content — shown to the model. One line per bullet; write freely, no formatting needed."
        disabled={readonly}
      />
    </div>
  );
}

export function PresetEditor({ playthroughId, playthroughPromptSettings, onPlaythroughPromptSettings }: PresetEditorProps) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("default");
  const [activePresetName, setActivePresetName] = useState("Default");
  const [activePresetReadonly, setActivePresetReadonly] = useState(true);
  const [presetModules, setPresetModules] = useState<PromptModuleSet>({ turn: [], seed: [], sheet: [], summary: [] });
  const [presetFormat, setPresetFormat] = useState<CharacterFormat>(cloneFormat(undefined));
  const [presetDirty, setPresetDirty] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);
  const [editingModule, setEditingModule] = useState<PresetModule | null>(null);
  const [editModuleForm, setEditModuleForm] = useState<{ name: string; description: string; content: string }>({ name: "", description: "", content: "" });
  const [activeContextTab, setActiveContextTab] = useState<ModuleContext>("turn");
  const [status, setStatus] = useState<string | null>(null);

  // Pointer-based drag state for reordering Character Sheet sections (works for
  // both mouse and touch). dragIndex = row being dragged; overIndex = current
  // drop target; dragGhost = floating label following the pointer.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; name: string } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overIndexRef = useRef<number | null>(null);

  function resetPresetState() { setPresetDirty(false); setEditingModule(null); }
  function markDirty() { setPresetDirty(true); }

  useEffect(() => {
    void loadPresetData();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const setRowRef = (index: number) => (el: HTMLDivElement | null) => { rowRefs.current[index] = el; };

  function handleGripPointerDown(e: React.PointerEvent, index: number) {
    if (activePresetReadonly) return;
    e.preventDefault();
    setDragIndex(index);
    overIndexRef.current = null;
    setOverIndex(null);
    setDragGhost({ x: e.clientX, y: e.clientY, name: presetFormat.sections[index]?.name ?? "" });
  }

  // While a section is being dragged, track the pointer on the window: move the
  // ghost, highlight the row under the pointer, and commit the reorder on release.
  useEffect(() => {
    if (dragIndex == null) return;
    const from = dragIndex;
    function onMove(e: PointerEvent) {
      setDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      // Auto-scroll when the pointer nears the top/bottom edge of the scroll
      // container, so a row can be dragged to an off-screen position. The scroll
      // is applied before the hit-test below, so the highlighted target tracks it.
      const container = getScrollParent(rowRefs.current[from] ?? null);
      if (container) {
        const rect = container.getBoundingClientRect();
        const edge = 80;
        if (e.clientY < rect.top + edge) {
          container.scrollTop -= (rect.top + edge - e.clientY) * 0.5;
        } else if (e.clientY > rect.bottom - edge) {
          container.scrollTop += (e.clientY - (rect.bottom - edge)) * 0.5;
        }
      }
      const el = document.elementFromPoint(e.clientX, e.clientY);
      const row = el && (el.closest("[data-section-row]") as HTMLElement | null);
      if (row) {
        const idx = Number(row.dataset.sectionRow);
        overIndexRef.current = idx;
        setOverIndex(idx);
      }
    }
    function endDrag() {
      const target = overIndexRef.current;
      if (target != null && target !== from) handleReorder(from, target);
      setDragIndex(null);
      overIndexRef.current = null;
      setOverIndex(null);
      setDragGhost(null);
    }
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", endDrag);
    window.addEventListener("pointercancel", endDrag);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", endDrag);
      window.removeEventListener("pointercancel", endDrag);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dragIndex]);

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
      setPresetFormat(cloneFormat(fullPreset.characterFormat));
    } catch {
      if (playthroughPromptSettings) {
        setActivePresetName(playthroughPromptSettings.presetName);
        setActivePresetReadonly(false);
        setPresetModules(playthroughPromptSettings.modules);
        setPresetFormat(cloneFormat(playthroughPromptSettings.characterFormat));
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
      setPresetFormat(cloneFormat(fullPreset.characterFormat));
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
      const updated = await updatePreset(activePresetId, { modules: presetModules, characterFormat: presetFormat });
      setPresetModules(updated.modules); setPresetFormat(cloneFormat(updated.characterFormat)); resetPresetState();
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
      const updated = await updatePreset(created.id, { modules: presetModules, characterFormat: presetFormat });
      setActivePresetId(updated.id); setActivePresetName(updated.name);
      setActivePresetReadonly(updated.readonly); setPresetModules(updated.modules);
      setPresetFormat(cloneFormat(updated.characterFormat));
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
      setPresetFormat(cloneFormat(defaultPreset.characterFormat));
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

  // ── Character format (sections) editor ──

  function updateFormatSection(index: number, patch: Partial<CharacterFormatSection>) {
    setPresetFormat((prev) => {
      const sections = prev.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
      return { ...prev, sections };
    });
    markDirty();
  }

  function addFormatSection() {
    setPresetFormat((prev) => ({
      ...prev,
      sections: reindex([...prev.sections, { name: "New Section", order: prev.sections.length + 1, instruction: "", examples: [], inline: false }]),
    }));
    markDirty();
  }

  function removeFormatSection(index: number) {
    if (!window.confirm("Delete this section from the format?")) return;
    setPresetFormat((prev) => ({ ...prev, sections: reindex(prev.sections.filter((_, i) => i !== index)) }));
    markDirty();
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    setPresetFormat((prev) => {
      const sections = [...prev.sections];
      const [moved] = sections.splice(fromIndex, 1);
      sections.splice(toIndex, 0, moved);
      return { ...prev, sections: reindex(sections) };
    });
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
            const count = tab.value === "sheet" ? presetFormat.sections.length : presetModules[tab.value].length;
            return (
              <button key={tab.value} className={`editor-tab${activeContextTab === tab.value ? " active" : ""}`} onClick={() => setActiveContextTab(tab.value)}>
                {tab.label}
                <span className="tab-badge">{count}</span>
              </button>
            );
          })}
        </div>

        {activeContextTab === "sheet" ? (
          <div className="format-editor">
            <p className="module-hint">The character sheet structure. Sections define what generated or AI-updated sheets must contain, in this order. Extra sections are always allowed in individual sheets — this list sets the defaults, guidance, and layout. The format a playthrough uses is snapshotted when it starts; editing it here affects new generation (and the library "update format" tool), not existing sheets.</p>
            {presetFormat.sections.map((s, idx) => (
              <CharacterFormatRow
                key={idx}
                section={s}
                index={idx}
                readonly={activePresetReadonly}
                isDragging={dragIndex === idx}
                isDropTarget={overIndex === idx}
                rowRef={setRowRef(idx)}
                onGripPointerDown={handleGripPointerDown}
                onChange={updateFormatSection}
                onRemove={removeFormatSection}
              />
            ))}
            <button className="add-module-btn" onClick={addFormatSection} disabled={activePresetReadonly}>+ Add Section</button>
            {dragGhost ? (
              <div className="format-drag-ghost" style={{ left: dragGhost.x, top: dragGhost.y }}>
                <span className="format-drag-ghost-name">{dragGhost.name}</span>
              </div>
            ) : null}
          </div>
        ) : (
          <>
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
          </>
        )}
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
