import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHARACTER_FORMAT } from "../../../engine/characterFormat";
import { DEFAULT_IMAGE_GENERATION_SETTINGS, IMAGE_HISTORY_MESSAGES_MAX, applyInstructionMode, instructionModeApplies } from "../../../engine/imageDefaults";
import type { CharacterFormat, CharacterFormatSection, ImageGenerationSettings, ImageInstructionMode, PromptConfig } from "../../../schemas";
import { Button, Checkbox, Icon, SimpleSelect, SwitchRow, Tabs, TextArea, TextInput, type SimpleSelectOption } from "../base";
import { ConfirmModal } from "../common/ConfirmModal";
import {
  createPreset,
  deletePreset,
  getPreset,
  getPromptConfig,
  listPresets,
  patchPromptConfig,
  setActivePreset as requestActivePreset,
  updatePreset,
  type Preset,
  type PresetModule,
  type PresetSummary,
  type PromptModuleSet
} from "../../api";

/** How long typing settles before the global config is written. Long enough that
 *  a keystroke burst is one write; short enough that closing Settings right after
 *  typing still lands (the pending write is flushed on unmount). */
const PERSIST_DEBOUNCE_MS = 400;

/** Order-insensitive module comparison: reordering is a real change, so order is
 *  compared, but the array is canonicalised by `order` first so a re-fetch that
 *  returns the same modules in a different array position is not "dirty". */
function modulesEqual(a: PromptModuleSet | undefined, b: PromptModuleSet | undefined): boolean {
  const norm = (set?: PromptModuleSet) =>
    JSON.stringify(
      [...(set?.turn ?? [])]
        .sort((x, y) => x.order - y.order)
        .map((m) => [m.id, m.name, m.description, m.content, m.order, m.enabled])
    );
  return norm(a) === norm(b);
}

function formatEqual(a: CharacterFormat | undefined, b: CharacterFormat | undefined): boolean {
  return JSON.stringify(a?.sections ?? null) === JSON.stringify(b?.sections ?? null);
}

/** Defaults are filled on BOTH sides before comparing, because a preset may
 *  legitimately omit the image block (the read sites default it) and a raw
 *  comparison would then report a difference that does not exist. */
function imageEqual(a: ImageGenerationSettings | undefined, b: ImageGenerationSettings | undefined): boolean {
  const merged = (block?: ImageGenerationSettings) => JSON.stringify({ ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...(block ?? {}) });
  return merged(a) === merged(b);
}

/** Whether the live global config differs from the preset it is backing — the
 *  single definition of "dirty", driving both the Save-enable and the
 *  Load/Reload discard-confirm. */
function promptConfigDiffers(config: PromptConfig, preset: Preset): boolean {
  if (!modulesEqual(config.modules, preset.modules)) return true;
  if (!formatEqual(config.characterFormat, preset.characterFormat)) return true;
  if (!imageEqual(config.imageGeneration, preset.imageGeneration)) return true;
  return false;
}

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

function newModuleId(): string {
  return `mod_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

type EditorTab = "turn" | "sheet" | "image";

const CONTEXT_TABS: Array<{ value: EditorTab; label: string }> = [
  { value: "turn", label: "Turn" },
  { value: "sheet", label: "Character Sheet" },
  { value: "image", label: "Image Generation" }
];

/** The two perspectives, as a base SimpleSelect option list (it is string-generic,
 *  so the union type rides along and the handler gets a clean "pov" | "scene"). */
const INSTRUCTION_MODE_OPTIONS: Array<SimpleSelectOption<ImageInstructionMode>> = [
  { value: "pov", label: "POV — the scene is seen through the player's eyes" },
  { value: "scene", label: "Scene — third-person frame, everyone in it is a character" }
];

/** One dialog at a time. A union rather than a pile of booleans, and one render
 *  helper below rather than a backdrop each — the repo's pattern for modal
 *  confirmations. */
type PendingDialog =
  | { kind: "newPresetName"; value: string }
  | { kind: "renamePreset"; value: string }
  | { kind: "deletePreset" }
  | { kind: "deleteModule"; moduleId: string; name: string }
  | { kind: "deleteSection"; index: number; name: string }
  /** Load/Reload (or a preset switch) that would discard unsaved edits. */
  | { kind: "confirmLoad"; presetId: string };

type CharacterFormatRowProps = {
  section: CharacterFormatSection;
  index: number;
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
function CharacterFormatRow({ section, index, isDragging, isDropTarget, rowRef, onGripPointerDown, onChange, onRemove }: CharacterFormatRowProps) {
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
        <TextInput
          containerClassName="format-name-field"
          size="sm"
          value={section.name}
          onChange={(e) => onChange(index, { name: e.target.value })}
          placeholder="Section name, e.g. Occupation"
          aria-label={`Section ${index + 1} name`}
        />
        <Checkbox
          containerClassName="format-inline-toggle"
          label="inline"
          title="Render as [Name]: value on one line"
          checked={!!section.inline}
          onChange={(e) => onChange(index, { inline: e.target.checked })}
        />
        <div className="module-row-actions">
          {/* Kept hand-rolled: a base component cannot express the pointer-drag
              affordance (native HTML5 drag has no touch support, which is why this
              uses pointer events at all). Tokenized, not flattened. */}
          <span
            className="format-drag-handle"
            title="Drag to reorder"
            onPointerDown={(e) => onGripPointerDown(e, index)}
          >
            <Icon name="GripVertical" size={14} />
          </span>
          <Button
            variant="ghost"
            size="xs"
            iconOnly
            className="danger-icon"
            title="Delete section"
            aria-label={`Delete section ${index + 1}`}
            onClick={() => onRemove(index)}
          >
            <Icon name="X" size={14} />
          </Button>
        </div>
      </div>
      <TextArea
        size="sm"
        rows={2}
        value={section.instruction}
        onChange={(e) => onChange(index, { instruction: e.target.value })}
        placeholder="Instruction for the model: what this section should contain."
        aria-label={`Section ${index + 1} instruction`}
      />
      <TextArea
        size="sm"
        rows={4}
        className="format-examples-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onChange(index, { examples: textToExamples(draft) })}
        placeholder="Optional example content — shown to the model. One line per bullet; write freely, no formatting needed."
        aria-label={`Section ${index + 1} examples`}
      />
    </div>
  );
}

export function PresetEditor() {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("default");
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [config, setConfig] = useState<PromptConfig>({ modules: { turn: [] } });
  const [saving, setSaving] = useState(false);
  const [editingModule, setEditingModule] = useState<PresetModule | null>(null);
  const [editModuleForm, setEditModuleForm] = useState<{ name: string; description: string; content: string }>({ name: "", description: "", content: "" });
  const [activeContextTab, setActiveContextTab] = useState<EditorTab>("turn");
  const [status, setStatus] = useState<string | null>(null);
  /** A failure and a success used to look identical. Every catch reports through
   *  `reportStatus(..., true)` so the line can say so. */
  const [statusError, setStatusError] = useState(false);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);

  // Pointer-based drag state for reordering Character Sheet sections (works for
  // both mouse and touch). dragIndex = row being dragged; overIndex = current
  // drop target; dragGhost = floating label following the pointer.
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; name: string } | null>(null);
  const rowRefs = useRef<(HTMLDivElement | null)[]>([]);
  const overIndexRef = useRef<number | null>(null);

  /** The newest config, readable from timers and the unmount flush that must not
   *  close over a stale render's value. */
  const configRef = useRef<PromptConfig>(config);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function reportStatus(text: string | null, isError = false) { setStatus(text); setStatusError(isError); }

  // ── Load the global config once ──
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const [summaries, state] = await Promise.all([listPresets(), getPromptConfig()]);
        if (cancelled) return;
        setPresets(summaries);
        setActivePresetId(state.activePresetId);
        setConfig(state.promptConfig);
        configRef.current = state.promptConfig;
        try {
          const full = await getPreset(state.activePresetId);
          if (!cancelled) setActivePreset(full);
        } catch {
          // The backing preset may be gone; the config still stands on its own.
          if (!cancelled) setActivePreset(null);
        }
      } catch (e) {
        if (!cancelled) reportStatus(e instanceof Error ? e.message : String(e), true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  // Flush a pending write on unmount, so a change made just before Settings
  // closes is not lost with the timer.
  useEffect(() => () => {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
      void patchPromptConfig(configRef.current).catch(() => {});
    }
  }, []);

  /** Apply a change to the local config immediately (so the UI is responsive)
   *  and schedule a debounced write of the WHOLE config — one global source, so
   *  any edit reaches every playthrough's next generation. */
  function persist(patch: Partial<PromptConfig>) {
    const next: PromptConfig = { ...configRef.current, ...patch };
    configRef.current = next;
    setConfig(next);
    if (persistTimer.current) clearTimeout(persistTimer.current);
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void patchPromptConfig(next).catch((e) => reportStatus(e instanceof Error ? e.message : String(e), true));
    }, PERSIST_DEBOUNCE_MS);
  }

  const dirty = activePreset ? promptConfigDiffers(config, activePreset) : false;
  const activePresetReadonly = activePreset?.readonly ?? false;
  const activePresetName = activePreset?.name ?? presets.find((p) => p.id === activePresetId)?.name ?? activePresetId;

  const format = config.characterFormat ?? cloneFormat(undefined);
  const image = config.imageGeneration ?? DEFAULT_IMAGE_GENERATION_SETTINGS;

  /** Load a preset's saved config over the global config. Switch and reload are
   *  the same server operation — both discard unsaved edits. */
  async function applyActivePreset(presetId: string) {
    setSaving(true); reportStatus(null);
    try {
      const state = await requestActivePreset(presetId);
      setActivePresetId(state.activePresetId);
      setConfig(state.promptConfig);
      configRef.current = state.promptConfig;
      try { setActivePreset(await getPreset(state.activePresetId)); } catch { setActivePreset(null); }
      const name = presets.find((p) => p.id === state.activePresetId)?.name ?? state.activePresetId;
      reportStatus(`Loaded "${name}".`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); }
  }

  /** Switching presets discards unsaved edits, so it confirms first when dirty. */
  function switchPreset(presetId: string) {
    if (saving || presetId === activePresetId) return;
    if (dirty) { setDialog({ kind: "confirmLoad", presetId }); return; }
    void applyActivePreset(presetId);
  }

  /** Load/Reload: re-copy the backing preset over the global config, discarding
   *  the temporary changes. Confirms first when there is anything to discard. */
  function reloadPreset() {
    if (saving) return;
    if (!dirty) { void applyActivePreset(activePresetId); return; }
    setDialog({ kind: "confirmLoad", presetId: activePresetId });
  }

  async function savePreset() {
    if (activePresetReadonly || saving || !dirty) return;
    setSaving(true); reportStatus(null);
    try {
      const updated = await updatePreset(activePresetId, {
        modules: config.modules,
        characterFormat: config.characterFormat,
        imageGeneration: config.imageGeneration
      });
      setActivePreset(updated);
      reportStatus(`"${updated.name}" saved.`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); }
  }

  function savePresetAs() {
    setDialog({ kind: "newPresetName", value: `${activePresetName} (copy)` });
  }

  async function createPresetFromName(name: string) {
    if (!name || saving) return;
    setSaving(true); reportStatus(null);
    try {
      const created = await createPreset(name);
      const updated = await updatePreset(created.id, {
        modules: config.modules,
        characterFormat: config.characterFormat,
        imageGeneration: config.imageGeneration
      });
      // Make the new preset the server's backing preset too, so a restart does not
      // come back pointing at the old preset with an identical-but-"dirty" config.
      const state = await requestActivePreset(updated.id);
      setActivePresetId(state.activePresetId);
      setConfig(state.promptConfig);
      configRef.current = state.promptConfig;
      setActivePreset(updated);
      setPresets(await listPresets());
      reportStatus(`Saved as "${updated.name}".`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); setDialog(null); }
  }

  function renamePreset() {
    if (activePresetReadonly || saving) return;
    setDialog({ kind: "renamePreset", value: activePresetName });
  }

  async function renamePresetTo(name: string) {
    if (!name || name === activePresetName || saving) return;
    setSaving(true); reportStatus(null);
    try {
      const updated = await updatePreset(activePresetId, { name });
      setActivePreset(updated);
      setPresets(await listPresets());
      reportStatus(`Renamed to "${updated.name}".`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); setDialog(null); }
  }

  function removePreset() {
    if (activePresetReadonly || saving) return;
    setDialog({ kind: "deletePreset" });
  }

  /** The dialog stays open (with its spinner) until the delete lands: a failure has to
   *  be visible where the user pressed, not only in the status line behind it. */
  async function deleteActivePreset() {
    setSaving(true); reportStatus(null);
    try {
      await deletePreset(activePresetId);
      const state = await requestActivePreset("default");
      setActivePresetId(state.activePresetId);
      setConfig(state.promptConfig);
      configRef.current = state.promptConfig;
      try { setActivePreset(await getPreset(state.activePresetId)); } catch { setActivePreset(null); }
      setPresets(await listPresets());
      reportStatus("Preset deleted. Loaded Default.");
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setSaving(false); setDialog(null); }
  }

  // ── Turn modules ──

  function persistModules(turn: PresetModule[]) {
    persist({ modules: { turn } });
  }

  function toggleModule(moduleId: string) {
    persistModules(configRef.current.modules.turn.map((m) => (m.id === moduleId ? { ...m, enabled: !m.enabled } : m)));
  }

  function moveModule(moduleId: string, direction: -1 | 1) {
    const sorted = [...configRef.current.modules.turn].sort((a, b) => a.order - b.order);
    const idx = sorted.findIndex((m) => m.id === moduleId);
    if (idx < 0) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= sorted.length) return;
    [sorted[idx], sorted[targetIdx]] = [sorted[targetIdx], sorted[idx]];
    persistModules(sorted.map((m, i) => ({ ...m, order: i + 1 })));
  }

  function openEditModule(mod: PresetModule) {
    setEditingModule(mod);
    setEditModuleForm({ name: mod.name, description: mod.description, content: mod.content });
  }

  function saveEditModule() {
    if (!editingModule) return;
    persistModules(configRef.current.modules.turn.map((m) =>
      m.id === editingModule.id ? { ...m, name: editModuleForm.name, description: editModuleForm.description, content: editModuleForm.content } : m
    ));
    setEditingModule(null);
  }

  function deleteModule(moduleId: string, name: string) {
    setDialog({ kind: "deleteModule", moduleId, name });
  }

  function applyModuleDelete(moduleId: string) {
    persistModules(configRef.current.modules.turn.filter((m) => m.id !== moduleId));
    setDialog(null);
  }

  function addNewModule() {
    const newMod: PresetModule = { id: newModuleId(), name: "New Module", description: "", content: "", order: configRef.current.modules.turn.length + 1, enabled: true };
    persistModules([...configRef.current.modules.turn, newMod]);
    setEditingModule(newMod);
    setEditModuleForm({ name: newMod.name, description: "", content: "" });
  }

  // ── Character format (sections) editor ──

  function persistFormat(next: CharacterFormat) {
    persist({ characterFormat: next });
  }

  function updateFormatSection(index: number, patch: Partial<CharacterFormatSection>) {
    const sections = format.sections.map((s, i) => (i === index ? { ...s, ...patch } : s));
    persistFormat({ ...format, sections });
  }

  function addFormatSection() {
    persistFormat({ ...format, sections: reindex([...format.sections, { name: "New Section", order: format.sections.length + 1, instruction: "", examples: [], inline: false }]) });
  }

  function removeFormatSection(index: number) {
    setDialog({ kind: "deleteSection", index, name: format.sections[index]?.name ?? "" });
  }

  function applySectionDelete(index: number) {
    persistFormat({ ...format, sections: reindex(format.sections.filter((_, i) => i !== index)) });
    setDialog(null);
  }

  // ── Image generation ──

  function updateImage(patch: Partial<ImageGenerationSettings>) {
    persist({ imageGeneration: { ...image, ...patch } });
  }

  const setRowRef = (index: number) => (el: HTMLDivElement | null) => { rowRefs.current[index] = el; };

  function handleGripPointerDown(e: React.PointerEvent, index: number) {
    e.preventDefault();
    setDragIndex(index);
    overIndexRef.current = null;
    setOverIndex(null);
    setDragGhost({ x: e.clientX, y: e.clientY, name: format.sections[index]?.name ?? "" });
  }

  function handleReorder(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const sections = [...format.sections];
    const [moved] = sections.splice(fromIndex, 1);
    sections.splice(toIndex, 0, moved);
    persistFormat({ ...format, sections: reindex(sections) });
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

  /** One dialog, whichever kind is pending. The two name dialogs are the SAME modal
   *  with a TextInput inside it — ConfirmModal takes children, so no new component. */
  function renderDialog() {
    if (!dialog) return null;
    if (dialog.kind === "deletePreset") {
      return (
        <ConfirmModal
          title={`Delete preset "${activePresetName}"?`}
          message="This cannot be undone. The global prompt configuration keeps working; it just loses this preset as its backing name."
          confirmLabel="Delete"
          danger
          isLoading={saving}
          onConfirm={() => { void deleteActivePreset(); }}
          onCancel={() => setDialog(null)}
        />
      );
    }
    if (dialog.kind === "confirmLoad") {
      const targetId = dialog.presetId;
      const targetName = presets.find((p) => p.id === targetId)?.name ?? targetId;
      const isReload = targetId === activePresetId;
      return (
        <ConfirmModal
          title={isReload ? "Reload the saved configuration?" : `Load "${targetName}"?`}
          message="Are you sure to load the saved preset configuration? Your temporary changes will be discarded."
          confirmLabel={isReload ? "Reload" : "Load"}
          danger
          isLoading={saving}
          onConfirm={() => { setDialog(null); void applyActivePreset(targetId); }}
          onCancel={() => setDialog(null)}
        />
      );
    }
    if (dialog.kind === "deleteModule") {
      return (
        <ConfirmModal
          title={`Delete module "${dialog.name}"?`}
          message="It is removed from the configuration immediately."
          confirmLabel="Delete"
          danger
          onConfirm={() => applyModuleDelete(dialog.moduleId)}
          onCancel={() => setDialog(null)}
        />
      );
    }
    if (dialog.kind === "deleteSection") {
      return (
        <ConfirmModal
          title={`Remove section "${dialog.name}" from the format?`}
          message="Existing sheets are untouched: the format decides what generated sheets must contain."
          confirmLabel="Remove"
          danger
          onConfirm={() => applySectionDelete(dialog.index)}
          onCancel={() => setDialog(null)}
        />
      );
    }
    const isNew = dialog.kind === "newPresetName";
    return (
      <ConfirmModal
        title={isNew ? "Save as new preset" : "Rename preset"}
        message={isNew ? "Saves the current configuration under its own name." : undefined}
        confirmLabel={isNew ? "Create" : "Rename"}
        confirmDisabled={!dialog.value.trim() || (!isNew && dialog.value.trim() === activePresetName)}
        isLoading={saving}
        onConfirm={() => { void (isNew ? createPresetFromName(dialog.value.trim()) : renamePresetTo(dialog.value.trim())); }}
        onCancel={() => setDialog(null)}
      >
        <TextInput
          label="Name"
          value={dialog.value}
          onChange={(e) => setDialog({ ...dialog, value: e.target.value })}
          autoFocus
        />
      </ConfirmModal>
    );
  }

  const sortedModules = [...config.modules.turn].sort((a, b) => a.order - b.order);

  return (
    <>
      <section className="prompt-config">
        <div className="preset-bar">
          <div className="preset-bar-field">
            <span className="field-label-text">Preset</span>
            <SimpleSelect
              value={activePresetId}
              onChange={(id) => switchPreset(id)}
              options={presets.map((p) => ({ value: p.id, label: p.readonly ? `${p.name} (read-only)` : p.name }))}
              disabled={saving}
              size="sm"
              fullWidth
              aria-label="Prompt preset"
            />
          </div>
          <div className="preset-actions">
            <Button size="sm" variant="secondary" onClick={reloadPreset} disabled={saving} title="Discard unsaved changes and reload the saved preset">Load/Reload</Button>
            <Button size="sm" variant="primary" onClick={() => void savePreset()} disabled={activePresetReadonly || !dirty || saving}>Save</Button>
            <Button size="sm" variant="secondary" onClick={savePresetAs} disabled={saving}>Save as New…</Button>
            <Button size="sm" variant="secondary" onClick={renamePreset} disabled={activePresetReadonly || saving}>Rename</Button>
            <Button size="sm" variant="danger" onClick={removePreset} disabled={activePresetReadonly || saving}>Delete</Button>
          </div>
        </div>
        <p className="module-hint">
          {`One global prompt configuration for every playthrough — edits apply immediately, even unsaved. Save or "Save as New…" keeps them under a name; Load/Reload discards them.`}
        </p>
        {activePresetReadonly ? <p className="module-hint">Read-only. Use "Save as New…" to keep your changes under an editable copy.</p> : null}

        <Tabs
          tabs={CONTEXT_TABS.map((tab) => ({
            id: tab.value,
            label: tab.label,
            // The image tab holds one settings block, not a list, so it has no count.
            badge:
              tab.value === "sheet" ? format.sections.length
              : tab.value === "turn" ? config.modules.turn.length
              : undefined
          }))}
          activeTab={activeContextTab}
          onChange={setActiveContextTab}
          variant="underline"
          size="sm"
          ariaLabel="Prompt configuration sections"
        />

        {activeContextTab === "sheet" ? (
          <div className="format-editor">
            <p className="module-hint">The character sheet structure. Sections define what generated or AI-updated sheets must contain, in this order. Extra sections are always allowed in individual sheets — this list sets the defaults, guidance, and layout.</p>
            {format.sections.map((s, idx) => (
              <CharacterFormatRow
                key={idx}
                section={s}
                index={idx}
                isDragging={dragIndex === idx}
                isDropTarget={overIndex === idx}
                rowRef={setRowRef(idx)}
                onGripPointerDown={handleGripPointerDown}
                onChange={updateFormatSection}
                onRemove={removeFormatSection}
              />
            ))}
            <Button
              variant="outline"
              size="sm"
              className="add-module-btn"
              leftIcon={<Icon name="Plus" size={14} />}
              onClick={addFormatSection}
            >
              Add Section
            </Button>
            {dragGhost ? (
              <div className="format-drag-ghost" style={{ left: dragGhost.x, top: dragGhost.y }}>
                <span className="format-drag-ghost-name">{dragGhost.name}</span>
              </div>
            ) : null}
          </div>
        ) : activeContextTab === "image" ? (
          <div className="format-editor">
            <p className="module-hint">
              {`The image prompt the text model writes for a message, before it is handed to the image provider. The model must answer with JSON only — {"prompt": "…", "negative": "…"} — with one line of comma-separated booru-style tags, and the positive prefix below is prepended to it. The negative prefix is joined onto the model's own negative tags. The composed prompt is then clamped to the character limit, which cuts from the end. Keep style and quality keywords out of the instruction: the positive prefix is where art direction lives, so a preset can be restyled by editing one line.`}
            </p>
            <div className="preset-form">
              <div className="preset-field">
                <span className="field-label-text">Instruction Mode</span>
                <SimpleSelect
                  value={image.instructionMode}
                  // Rewrite the field as well as the flag: the textarea must never show
                  // a document other than the one that will be sent. The server applies
                  // the same swap at call time, idempotently, so the two can never
                  // disagree.
                  onChange={(mode) => updateImage({ instructionMode: mode, instruction: applyInstructionMode(image.instruction, mode) })}
                  options={INSTRUCTION_MODE_OPTIONS}
                  size="sm"
                  fullWidth
                  aria-label="Instruction mode"
                />
              </div>
              {!instructionModeApplies(image.instruction) ? (
                <p className="module-hint">
                  {`This instruction carries neither the POV nor the Scene perspective rules, so the mode does not change it — it is your own text.`}
                </p>
              ) : (
                <p className="module-hint">
                  {`Switching rewrites the instruction below: Scene makes the player a person IN the frame — their own clothing and appearance, like any character — and POV makes the frame the player's own eyes, with no player tags at all. The cast block the writer receives follows the mode too. The server applies the same swap when the prompt call is made, so the field and the call can never disagree.`}
                </p>
              )}
              <TextArea
                label="Instruction"
                rows={12}
                size="sm"
                value={image.instruction}
                onChange={(e) => updateImage({ instruction: e.target.value })}
                placeholder="How the model should describe the current moment as one still image…"
                // The COUNT only. `promptCharacterLimit` caps the COMPOSED prompt (the
                // tag line), not this text — the shipped instructions are 15-16k chars,
                // so pairing them rendered every preset as "16105 / 1200" and looked
                // like a violation instead of a fact.
                characterCount={image.instruction.length}
              />
              <TextInput
                label="Positive Prefix"
                value={image.positivePrefix}
                onChange={(e) => updateImage({ positivePrefix: e.target.value })}
                placeholder="anime style"
                size="sm"
                helperText="Prefixed to every generated prompt — the one place art direction lives, so the instruction itself stays style-free."
              />
              <TextInput
                label="Negative Prefix"
                value={image.negativePrefix}
                onChange={(e) => updateImage({ negativePrefix: e.target.value })}
                placeholder="lowres, bad anatomy, watermark, text…"
                size="sm"
                helperText="Appended after the shipped negative tags, not instead of them."
              />
              <TextInput
                label="Character Limit"
                type="number"
                min={0}
                step={50}
                value={image.promptCharacterLimit}
                onChange={(e) => updateImage({ promptCharacterLimit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                size="sm"
                helperText="A soft cap on the COMPOSED prompt: the writer is told it and the composer cuts the tag line to it. 0 leaves the provider's own cap as the only limit."
              />
              <SwitchRow
                icon="MapPin"
                title="Include current state"
                description="The location and the player's visible conditions."
                checked={image.includeState}
                onChange={(e) => updateImage({ includeState: e.target.checked })}
              />
              <SwitchRow
                icon="Users"
                title="Include present characters"
                description="Who is in frame, with their clothing, mood and sheet identity."
                checked={image.includeCast}
                onChange={(e) => updateImage({ includeCast: e.target.checked })}
              />
              <TextInput
                label="Previous messages of history"
                type="number"
                min={0}
                max={IMAGE_HISTORY_MESSAGES_MAX}
                step={1}
                value={image.historyMessages}
                onChange={(e) => updateImage({ historyMessages: Math.min(IMAGE_HISTORY_MESSAGES_MAX, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                size="sm"
                helperText="How many messages behind the frame the writer sees as continuity. 0 turns the block off."
              />
              <SwitchRow
                icon="History"
                title="Include previous image prompt response"
                description="ONE earlier answer, for SHAPE only — its scene, clothing and pose belong to that earlier moment. Off by default: an in-context example anchors a tag model."
                checked={image.includePreviousAnswer}
                onChange={(e) => updateImage({ includePreviousAnswer: e.target.checked })}
              />
            </div>
            <p className="module-hint">
              {`This block is applied to every playthrough. A generation reads the current values at call time; history and the shape reference are pulled from whichever playthrough is generating.`}
            </p>
          </div>
        ) : (
          <>
            {sortedModules.length === 0 ? null : (
              <div className="module-group">
                {sortedModules.map((mod) => {
                  const idx = sortedModules.indexOf(mod);
                  return (
                    <div key={mod.id} className="module-row">
                      <Checkbox
                        containerClassName="module-toggle"
                        label={<span className="module-name">{mod.name}</span>}
                        title={mod.description}
                        checked={mod.enabled}
                        onChange={() => toggleModule(mod.id)}
                      />
                      <div className="module-row-actions">
                        <Button variant="ghost" size="xs" iconOnly title="Move up" aria-label={`Move ${mod.name} up`} onClick={() => moveModule(mod.id, -1)} disabled={idx === 0}>
                          <Icon name="ArrowUp" size={14} />
                        </Button>
                        <Button variant="ghost" size="xs" iconOnly title="Move down" aria-label={`Move ${mod.name} down`} onClick={() => moveModule(mod.id, 1)} disabled={idx === sortedModules.length - 1}>
                          <Icon name="ArrowDown" size={14} />
                        </Button>
                        <Button variant="ghost" size="xs" iconOnly title="Edit" aria-label={`Edit ${mod.name}`} onClick={() => openEditModule(mod)}>
                          <Icon name="Pencil" size={14} />
                        </Button>
                        <Button variant="ghost" size="xs" iconOnly className="danger-icon" title="Delete" aria-label={`Delete ${mod.name}`} onClick={() => deleteModule(mod.id, mod.name)}>
                          <Icon name="X" size={14} />
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
            <Button
              variant="outline"
              size="sm"
              className="add-module-btn"
              leftIcon={<Icon name="Plus" size={14} />}
              onClick={addNewModule}
            >
              Add Module
            </Button>
          </>
        )}
        {status ? <pre className={`settings-status${statusError ? " status-error" : ""}`}>{status}</pre> : null}
      </section>

      {editingModule ? (
        <div className="modal-backdrop">
          <section className="modal module-edit-modal">
            <header className="modal-header">
              <h2>Edit Module</h2>
              <Button variant="ghost" size="sm" onClick={() => setEditingModule(null)}>Close</Button>
            </header>
            <div className="preset-form">
              <TextInput
                label="Name"
                value={editModuleForm.name}
                onChange={(e) => setEditModuleForm((f) => ({ ...f, name: e.target.value }))}
              />
              <TextArea
                label="Description"
                rows={2}
                value={editModuleForm.description}
                onChange={(e) => setEditModuleForm((f) => ({ ...f, description: e.target.value }))}
                helperText="Shown as the row's tooltip in the Turn tab."
              />
              <TextArea
                label="Content"
                rows={10}
                value={editModuleForm.content}
                onChange={(e) => setEditModuleForm((f) => ({ ...f, content: e.target.value }))}
                helperText="Sent to the model verbatim when this module is enabled."
              />
              <div className="settings-actions">
                <Button variant="primary" onClick={saveEditModule}>Save</Button>
                <Button variant="secondary" onClick={() => setEditingModule(null)}>Cancel</Button>
              </div>
            </div>
          </section>
        </div>
      ) : null}

      {dialog ? renderDialog() : null}
    </>
  );
}
