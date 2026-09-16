import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHARACTER_FORMAT } from "../../../engine/characterFormat";
import { DEFAULT_IMAGE_GENERATION_SETTINGS, IMAGE_HISTORY_MESSAGES_MAX, applyInstructionMode, instructionModeApplies } from "../../../engine/imageDefaults";
import type { CharacterFormat, CharacterFormatSection, ImageGenerationSettings, ImageInstructionMode } from "../../../schemas";
import { Badge, Button, Checkbox, Icon, SimpleSelect, SwitchRow, Tabs, TextArea, TextInput, type SimpleSelectOption } from "../base";
import { ConfirmModal } from "../common/ConfirmModal";
import {
  createPreset,
  deletePreset,
  getDefaultPresetId,
  getPreset,
  listPresets,
  setDefaultPresetId,
  refreshImagePromptBlock,
  patchPlaythroughImageBlock,
  updatePlaythroughPromptSettings,
  updatePreset,
  type PlaythroughPromptSettings,
  type PresetUpdatePayload,
  type PromptModuleSet,
  type PresetModule,
  type PresetSummary
} from "../../api";

/**
 * Whether a playthrough is still running an image prompt block that differs from
 * its preset's current one. Defaults are filled in before comparing, because a
 * preset may legitimately omit any field (the read sites default them) and a raw
 * object comparison would then report a difference that does not exist.
 */
function imageBlockDiffers(
  snapshot: ImageGenerationSettings | undefined,
  preset: ImageGenerationSettings | undefined
): boolean {
  const fields = (block?: ImageGenerationSettings) => {
    const merged = { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...(block ?? {}) };
    // Hand-written on purpose, and it has to grow with the schema: a field missing
    // here makes the "this playthrough is still on its own block" marker lie about
    // a difference it cannot see.
    return [
      merged.instruction,
      merged.instructionMode,
      merged.positivePrefix,
      merged.negativePrefix,
      merged.promptCharacterLimit,
      merged.includeCast,
      merged.includeState,
      merged.historyMessages,
      merged.includePreviousAnswer
    ];
  };
  const a = fields(snapshot);
  const b = fields(preset);
  return a.some((value, index) => value !== b[index]);
}

function cloneFormat(format?: CharacterFormat): CharacterFormat {
  if (!format || format.sections.length === 0) return JSON.parse(JSON.stringify(DEFAULT_CHARACTER_FORMAT)) as CharacterFormat;
  return JSON.parse(JSON.stringify(format)) as CharacterFormat;
}

/** Seed the Image Generation tab. A preset with no block falls back to the
 *  shipped defaults at read time — the same fallback the server uses. */
function cloneImage(settings?: ImageGenerationSettings): ImageGenerationSettings {
  return JSON.parse(JSON.stringify(settings ?? DEFAULT_IMAGE_GENERATION_SETTINGS)) as ImageGenerationSettings;
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

/** One dialog at a time. A union rather than four booleans, and one render helper
 *  below rather than four backdrops — the repo's pattern for modal confirmations. */
type PendingDialog =
  | { kind: "newPresetName"; value: string }
  | { kind: "renamePreset"; value: string }
  | { kind: "deletePreset" }
  | { kind: "deleteModule"; moduleId: string; name: string }
  | { kind: "deleteSection"; index: number; name: string };

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
        <TextInput
          containerClassName="format-name-field"
          size="sm"
          value={section.name}
          onChange={(e) => onChange(index, { name: e.target.value })}
          placeholder="Section name, e.g. Occupation"
          disabled={readonly}
          aria-label={`Section ${index + 1} name`}
        />
        <Checkbox
          containerClassName="format-inline-toggle"
          label="inline"
          title="Render as [Name]: value on one line"
          checked={!!section.inline}
          onChange={(e) => onChange(index, { inline: e.target.checked })}
          disabled={readonly}
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
            disabled={readonly}
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
        disabled={readonly}
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
        disabled={readonly}
        aria-label={`Section ${index + 1} examples`}
      />
    </div>
  );
}

export function PresetEditor({ playthroughId, playthroughPromptSettings, onPlaythroughPromptSettings }: PresetEditorProps) {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("default");
  const [activePresetName, setActivePresetName] = useState("Default");
  const [activePresetReadonly, setActivePresetReadonly] = useState(true);
  const [presetModules, setPresetModules] = useState<PromptModuleSet>({ turn: [] });
  const [presetFormat, setPresetFormat] = useState<CharacterFormat>(cloneFormat(undefined));
  const [presetImage, setPresetImage] = useState<ImageGenerationSettings>(() => cloneImage(undefined));
  const [presetDirty, setPresetDirty] = useState(false);
  const [presetSaving, setPresetSaving] = useState(false);
  /** The surgical image-block refresh is in flight. */
  const [refreshingBlock, setRefreshingBlock] = useState(false);
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

  function reportStatus(text: string | null, isError = false) { setStatus(text); setStatusError(isError); }
  function resetPresetState() { setPresetDirty(false); setEditingModule(null); }
  function markDirty() { setPresetDirty(true); }

  /** The playthrough presetId this editor last loaded from, or null for "no
   *  playthrough open" (it loaded the global default). **undefined means nothing has
   *  loaded yet, and that is NOT the same as null**: on Home there is no playthrough,
   *  so a null-initialized ref compared null to null, skipped the load on the very
   *  first mount, and left the editor on empty defaults — no presets in the picker, no
   *  modules in the Turn tab, the shipped sheet format instead of the preset's.
   *
   *  Not the selected preset either: "Save as New…" legitimately shows a copy the
   *  playthrough is not running yet, and a re-sync must not undo that. */
  const syncedPresetId = useRef<string | null | undefined>(undefined);

  // One loader for both cases — the first mount and "the playthrough's preset
  // changed underneath us" — so the two can never race into a double fetch. A
  // re-sync never lands on top of unsaved edits.
  useEffect(() => {
    const incoming = playthroughPromptSettings?.presetId ?? null;
    const loaded = syncedPresetId.current !== undefined;
    if (loaded && incoming === syncedPresetId.current) return;
    if (loaded && presetDirty) return;
    syncedPresetId.current = incoming;
    void loadPresetData(incoming ?? undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [playthroughPromptSettings?.presetId, presetDirty]);

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

  /** Load the preset the playthrough runs (`explicitId`), or the global default for
   *  new playthroughs when there is none. Called by the single loader effect above,
   *  which is also what re-syncs when the playthrough's preset changes. */
  async function loadPresetData(explicitId?: string) {
    const summaries = await listPresets();
    setPresets(summaries);

    let currentId = explicitId;
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
      setPresetImage(cloneImage(fullPreset.imageGeneration));
    } catch {
      if (playthroughPromptSettings) {
        setActivePresetName(playthroughPromptSettings.presetName);
        setActivePresetReadonly(false);
        setPresetModules(playthroughPromptSettings.modules);
        setPresetFormat(cloneFormat(playthroughPromptSettings.characterFormat));
        setPresetImage(cloneImage(playthroughPromptSettings.imageGeneration));
      }
    }
    resetPresetState();
  }

  /** Pull just the image prompt block from the preset, leaving the turn modules
   *  and the sheet format this playthrough runs exactly as they are. */
  async function refreshImageBlock() {
    if (!playthroughId || refreshingBlock) return;
    setRefreshingBlock(true);
    reportStatus(null);
    try {
      const updated = await refreshImagePromptBlock(playthroughId);
      onPlaythroughPromptSettings(updated);
      reportStatus("Image prompt block refreshed from the preset.");
    } catch (e) {
      reportStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setRefreshingBlock(false);
    }
  }

  async function switchPreset(presetId: string) {
    if (presetSaving) return;
    setPresetSaving(true); reportStatus(null);
    try {
      const fullPreset = await getPreset(presetId);
      // The WRITE comes first. An optimistic switch left the dropdown showing a
      // preset the playthrough never got, with the reason buried in the status
      // line — and the two branches mean different things, which is why they say
      // so now.
      if (playthroughId) {
        const updated = await updatePlaythroughPromptSettings(playthroughId, presetId);
        onPlaythroughPromptSettings(updated);
        // This playthrough now runs it, so a re-sync would only re-fetch the same
        // preset.
        syncedPresetId.current = presetId;
        reportStatus(`Switched to "${fullPreset.name}" and applied to this playthrough.`);
      } else {
        await setDefaultPresetId(presetId);
        reportStatus(`"${fullPreset.name}" is now the default for NEW playthroughs — existing ones keep theirs.`);
      }
      setActivePresetId(fullPreset.id); setActivePresetName(fullPreset.name);
      setActivePresetReadonly(fullPreset.readonly); setPresetModules(fullPreset.modules);
      setPresetFormat(cloneFormat(fullPreset.characterFormat));
      setPresetImage(cloneImage(fullPreset.imageGeneration));
      resetPresetState();
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setPresetSaving(false); }
  }

  async function savePreset() {
    if (activePresetReadonly || presetSaving) return;
    setPresetSaving(true); reportStatus(null);
    try {
      const payload: PresetUpdatePayload = { modules: presetModules, characterFormat: presetFormat, imageGeneration: presetImage };
      const updated = await updatePreset(activePresetId, payload);
      setPresetModules(updated.modules); setPresetFormat(cloneFormat(updated.characterFormat));
      setPresetImage(cloneImage(updated.imageGeneration)); resetPresetState();
      reportStatus(`"${activePresetName}" saved.`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setPresetSaving(false); }
  }

  function savePresetAs() {
    setDialog({ kind: "newPresetName", value: `${activePresetName} (copy)` });
  }

  async function createPresetFromName(name: string) {
    if (!name || presetSaving) return;
    setPresetSaving(true); reportStatus(null);
    try {
      const created = await createPreset(name);
      const payload: PresetUpdatePayload = { modules: presetModules, characterFormat: presetFormat, imageGeneration: presetImage };
      const updated = await updatePreset(created.id, payload);
      setActivePresetId(updated.id); setActivePresetName(updated.name);
      setActivePresetReadonly(updated.readonly); setPresetModules(updated.modules);
      setPresetFormat(cloneFormat(updated.characterFormat));
      setPresetImage(cloneImage(updated.imageGeneration));
      setPresets(await listPresets()); resetPresetState();
      reportStatus(`Saved as "${updated.name}".`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setPresetSaving(false); setDialog(null); }
  }

  function renamePreset() {
    if (activePresetReadonly || presetSaving) return;
    setDialog({ kind: "renamePreset", value: activePresetName });
  }

  async function renamePresetTo(name: string) {
    if (!name || name === activePresetName || presetSaving) return;
    setPresetSaving(true); reportStatus(null);
    try {
      const updated = await updatePreset(activePresetId, { name });
      setActivePresetName(updated.name); setPresets(await listPresets());
      reportStatus(`Renamed to "${updated.name}".`);
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setPresetSaving(false); setDialog(null); }
  }

  function removePreset() {
    if (activePresetReadonly || presetSaving) return;
    setDialog({ kind: "deletePreset" });
  }

  /** The dialog stays open (with its spinner) until the delete lands: a failure has to
   *  be visible where the user pressed, not only in the status line behind it. */
  async function deleteActivePreset() {
    setPresetSaving(true); reportStatus(null);
    try {
      await deletePreset(activePresetId);
      const defaultPreset = await getPreset("default");
      setActivePresetId(defaultPreset.id); setActivePresetName(defaultPreset.name);
      setActivePresetReadonly(defaultPreset.readonly); setPresetModules(defaultPreset.modules);
      setPresetFormat(cloneFormat(defaultPreset.characterFormat));
      setPresetImage(cloneImage(defaultPreset.imageGeneration));
      setPresets(await listPresets()); resetPresetState();
      reportStatus("Preset deleted. Switched to Default.");
    } catch (e) { reportStatus(e instanceof Error ? e.message : String(e), true); }
    finally { setPresetSaving(false); setDialog(null); }
  }

  function toggleModule(moduleId: string) {
    setPresetModules((prev) => ({ ...prev, turn: prev.turn.map((m) => (m.id === moduleId ? { ...m, enabled: !m.enabled } : m)) }));
    markDirty();
  }

  function moveModule(moduleId: string, direction: -1 | 1) {
    setPresetModules((prev) => {
      const sorted = [...prev.turn].sort((a, b) => a.order - b.order);
      const idx = sorted.findIndex((m) => m.id === moduleId);
      if (idx < 0) return prev;
      const targetIdx = idx + direction;
      if (targetIdx < 0 || targetIdx >= sorted.length) return prev;
      [sorted[idx], sorted[targetIdx]] = [sorted[targetIdx], sorted[idx]];
      return { ...prev, turn: sorted.map((m, i) => ({ ...m, order: i + 1 })) };
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
      turn: prev.turn.map((m) =>
        m.id === editingModule.id ? { ...m, name: editModuleForm.name, description: editModuleForm.description, content: editModuleForm.content } : m
      )
    }));
    setEditingModule(null);
    markDirty();
  }

  function deleteModule(moduleId: string, name: string) {
    setDialog({ kind: "deleteModule", moduleId, name });
  }

  function applyModuleDelete(moduleId: string) {
    setPresetModules((prev) => ({ ...prev, turn: prev.turn.filter((m) => m.id !== moduleId) }));
    markDirty();
    setDialog(null);
  }

  function addNewModule() {
    const newMod: PresetModule = { id: newModuleId(), name: "New Module", description: "", content: "", order: presetModules.turn.length + 1, enabled: true };
    setPresetModules((prev) => ({ ...prev, turn: [...prev.turn, newMod] }));
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
    setDialog({ kind: "deleteSection", index, name: presetFormat.sections[index]?.name ?? "" });
  }

  function applySectionDelete(index: number) {
    setPresetFormat((prev) => ({ ...prev, sections: reindex(prev.sections.filter((_, i) => i !== index)) }));
    markDirty();
    setDialog(null);
  }

  // ── Image generation (preset-owned prompt config) ──

  /** Where an image-block edit LANDS. A read-only preset cannot be written, but the
   *  block is this playthrough's to own — the mode is this story's frame — so the
   *  fields stay live and the write goes to the playthrough's own snapshot. */
  const editingPlaythroughBlock = activePresetReadonly && !!playthroughId;
  const imageFieldsDisabled = activePresetReadonly && !playthroughId;

  function updateImage(patch: Partial<ImageGenerationSettings>) {
    setPresetImage((prev) => ({ ...prev, ...patch }));
    if (editingPlaythroughBlock) {
      // The optimistic state above keeps the control responsive; the write is what
      // makes it real, and a failure says so rather than leaving the panel lying.
      reportStatus(null);
      void patchPlaythroughImageBlock(playthroughId!, patch)
        .then((updated) => { onPlaythroughPromptSettings(updated); reportStatus("Saved to this playthrough."); })
        .catch((e) => reportStatus(e instanceof Error ? e.message : String(e), true));
      return;
    }
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

  /** One dialog, whichever kind is pending. The two name dialogs are the SAME modal
   *  with a TextInput inside it — ConfirmModal takes children, so no new component. */
  function renderDialog() {
    if (!dialog) return null;
    if (dialog.kind === "deletePreset") {
      return (
        <ConfirmModal
          title={`Delete preset "${activePresetName}"?`}
          message="This cannot be undone. Playthroughs already using it keep their own snapshot and keep working."
          confirmLabel="Delete"
          danger
          isLoading={presetSaving}
          onConfirm={() => { void deleteActivePreset(); }}
          onCancel={() => setDialog(null)}
        />
      );
    }
    if (dialog.kind === "deleteModule") {
      return (
        <ConfirmModal
          title={`Delete module "${dialog.name}"?`}
          message="It is dropped from this preset when you press Save — nothing is written until then."
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
          message="Existing sheets are untouched: the format decides what generated sheets must contain, and nothing is written until you save."
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
        message={isNew ? "A copy of the current work under its own name. Switch to it to make it a playthrough's preset." : undefined}
        confirmLabel={isNew ? "Create" : "Rename"}
        confirmDisabled={!dialog.value.trim() || (!isNew && dialog.value.trim() === activePresetName)}
        isLoading={presetSaving}
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

  return (
    <>
      <section className="prompt-config">
        <div className="preset-bar">
          <div className="preset-bar-field">
            <span className="field-label-text">Preset</span>
            <SimpleSelect
              value={activePresetId}
              onChange={(id) => void switchPreset(id)}
              options={presets.map((p) => ({ value: p.id, label: p.readonly ? `${p.name} (read-only)` : p.name }))}
              disabled={presetSaving}
              size="sm"
              fullWidth
              aria-label="Prompt preset"
            />
          </div>
          <div className="preset-actions">
            <Button size="sm" variant="primary" onClick={() => void savePreset()} disabled={activePresetReadonly || !presetDirty || presetSaving}>Save</Button>
            <Button size="sm" variant="secondary" onClick={() => void savePresetAs()} disabled={presetSaving}>Save as New…</Button>
            <Button size="sm" variant="secondary" onClick={() => void renamePreset()} disabled={activePresetReadonly || presetSaving}>Rename</Button>
            <Button size="sm" variant="danger" onClick={() => void removePreset()} disabled={activePresetReadonly || presetSaving}>Delete</Button>
          </div>
        </div>
        {playthroughId ? (
          <p className="module-hint">
            {`Applies to THIS playthrough: it keeps the settings it was applied with, so editing a preset afterwards does not reach it — use "Refresh image prompt from preset" on the Image Generation tab for that.`}
          </p>
        ) : (
          <p className="module-hint">
            {`No playthrough open: switching here sets the default preset for NEW playthroughs. Existing ones keep theirs.`}
          </p>
        )}
        {activePresetReadonly ? <p className="module-hint">Read-only. Use "Save as New…" to create an editable copy.</p> : null}

        <Tabs
          tabs={CONTEXT_TABS.map((tab) => ({
            id: tab.value,
            label: tab.label,
            // The image tab holds one settings block, not a list, so it has no count.
            badge:
              tab.value === "sheet" ? presetFormat.sections.length
              : tab.value === "turn" ? presetModules.turn.length
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
            <Button
              variant="outline"
              size="sm"
              className="add-module-btn"
              leftIcon={<Icon name="Plus" size={14} />}
              onClick={addFormatSection}
              disabled={activePresetReadonly}
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
            {playthroughId && imageBlockDiffers(playthroughPromptSettings?.imageGeneration, presetImage) ? (
              <div className="image-block-refresh">
                <span className="image-block-refresh-text">
                  {`This playthrough's image block differs from "${activePresetName}" — either it was created before the preset was edited, or it was changed here. Refreshing copies the preset's block into this playthrough; the turn modules and the sheet format stay untouched.`}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  className="add-module-btn"
                  leftIcon={<Icon name="RefreshCw" size={14} />}
                  isLoading={refreshingBlock}
                  onClick={() => { void refreshImageBlock(); }}
                  disabled={refreshingBlock}
                >
                  Refresh image prompt from preset
                </Button>
              </div>
            ) : null}
            <div className="preset-form">
              <div className="preset-field">
                <span className="field-label-text">Instruction Mode</span>
                <SimpleSelect
                  value={presetImage.instructionMode}
                  // Rewrite the field as well as the flag: the textarea must never show
                  // a document other than the one that will be sent. The server applies
                  // the same swap at call time, idempotently, so the two can never
                  // disagree.
                  onChange={(mode) => updateImage({ instructionMode: mode, instruction: applyInstructionMode(presetImage.instruction, mode) })}
                  options={INSTRUCTION_MODE_OPTIONS}
                  disabled={imageFieldsDisabled}
                  size="sm"
                  fullWidth
                  aria-label="Instruction mode"
                />
              </div>
              {!instructionModeApplies(presetImage.instruction) ? (
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
                value={presetImage.instruction}
                onChange={(e) => updateImage({ instruction: e.target.value })}
                placeholder="How the model should describe the current moment as one still image…"
                disabled={imageFieldsDisabled}
                // The COUNT only. `promptCharacterLimit` caps the COMPOSED prompt (the
                // tag line), not this text — the shipped instructions are 15-16k chars,
                // so pairing them rendered every preset as "16105 / 1200" and looked
                // like a violation instead of a fact.
                characterCount={presetImage.instruction.length}
              />
              <TextInput
                label="Positive Prefix"
                value={presetImage.positivePrefix}
                onChange={(e) => updateImage({ positivePrefix: e.target.value })}
                placeholder="anime style"
                disabled={imageFieldsDisabled}
                size="sm"
                helperText="Prefixed to every generated prompt — the one place art direction lives, so the instruction itself stays style-free."
              />
              <TextInput
                label="Negative Prefix"
                value={presetImage.negativePrefix}
                onChange={(e) => updateImage({ negativePrefix: e.target.value })}
                placeholder="lowres, bad anatomy, watermark, text…"
                disabled={imageFieldsDisabled}
                size="sm"
                helperText="Appended after the shipped negative tags, not instead of them."
              />
              <TextInput
                label="Character Limit"
                type="number"
                min={0}
                step={50}
                value={presetImage.promptCharacterLimit}
                onChange={(e) => updateImage({ promptCharacterLimit: Math.max(0, Math.floor(Number(e.target.value) || 0)) })}
                disabled={imageFieldsDisabled}
                size="sm"
                helperText="A soft cap on the COMPOSED prompt: the writer is told it and the composer cuts the tag line to it. 0 leaves the provider's own cap as the only limit."
              />
              <SwitchRow
                icon="MapPin"
                title="Include current state"
                description="The location and the player's visible conditions."
                checked={presetImage.includeState}
                onChange={(e) => updateImage({ includeState: e.target.checked })}
                disabled={imageFieldsDisabled}
              />
              <SwitchRow
                icon="Users"
                title="Include present characters"
                description="Who is in frame, with their clothing, mood and sheet identity."
                checked={presetImage.includeCast}
                onChange={(e) => updateImage({ includeCast: e.target.checked })}
                disabled={imageFieldsDisabled}
              />
              <TextInput
                label="Previous messages of history"
                type="number"
                min={0}
                max={IMAGE_HISTORY_MESSAGES_MAX}
                step={1}
                value={presetImage.historyMessages}
                onChange={(e) => updateImage({ historyMessages: Math.min(IMAGE_HISTORY_MESSAGES_MAX, Math.max(0, Math.floor(Number(e.target.value) || 0))) })}
                disabled={imageFieldsDisabled}
                size="sm"
                helperText="How many messages behind the frame the writer sees as continuity. 0 turns the block off."
              />
              <SwitchRow
                icon="History"
                title="Include previous image prompt response"
                description="ONE earlier answer, for SHAPE only — its scene, clothing and pose belong to that earlier moment. Off by default: an in-context example anchors a tag model."
                checked={presetImage.includePreviousAnswer}
                onChange={(e) => updateImage({ includePreviousAnswer: e.target.checked })}
                disabled={imageFieldsDisabled}
              />
            </div>
            <p className="module-hint">
              {editingPlaythroughBlock
                ? `"${activePresetName}" is a read-only shipped preset, so these changes are saved to THIS playthrough's own image block — the preset itself is never touched. "Refresh image prompt from preset" above puts it back.`
                : imageFieldsDisabled
                  ? `"${activePresetName}" is read-only and no playthrough is open, so this block cannot be edited here. Use "Save as New…" for an editable copy.`
                  : `Changes here are saved to "${activePresetName}" when you press Save. A playthrough snapshots this block when its preset is applied, so an edit does not change a playthrough already using this preset — use "Refresh image prompt from preset" on it instead.`}
            </p>
          </div>
        ) : (
          <>
            {(() => {
              const sortedModules = [...presetModules.turn].sort((a, b) => a.order - b.order);
              if (sortedModules.length === 0) return null;
              return (
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
              );
            })()}
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
