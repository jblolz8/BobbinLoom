import { useEffect, useRef, useState } from "react";
import { DEFAULT_CHARACTER_FORMAT } from "../../../engine/characterFormat";
import {
  DEFAULT_IMAGE_GENERATION_SETTINGS,
  IMAGE_HISTORY_MESSAGES_MAX,
  applyInstructionMode,
  instructionModeApplies,
} from "../../../engine/imageDefaults";
import type {
  CharacterFormat,
  CharacterFormatSection,
  ImageGenerationSettings,
  ImageInstructionMode,
  PromptConfig,
} from "../../../schemas";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  DragGhost,
  DragHandle,
  FormGrid,
  FormSection,
  Header,
  Modal,
  SimpleSelect,
  Slider,
  Stack,
  SwitchRow,
  Tabs,
  Text,
  TextArea,
  TextInput,
  TooltipIcon,
  type SimpleSelectOption,
} from "../base";
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
  type PromptModuleSet,
} from "../../api";

/** How long typing settles before the global config is written. Long enough that
 *  a keystroke burst is one write; short enough that closing Settings right after
 *  typing still lands (the pending write is flushed on unmount). */
const PERSIST_DEBOUNCE_MS = 400;

/** Order-insensitive module comparison: reordering is a real change, so order is
 *  compared, but the array is canonicalised by `order` first so a re-fetch that
 *  returns the same modules in a different array position is not "dirty". */
export function modulesEqual(a: PromptModuleSet | undefined, b: PromptModuleSet | undefined): boolean {
  const norm = (set?: PromptModuleSet) =>
    JSON.stringify(
      [...(set?.turn ?? [])]
        .sort((x, y) => x.order - y.order)
        .map((m) => [m.id, m.name, m.description, m.content, m.order, m.enabled])
    );
  return norm(a) === norm(b);
}

function canonicalSectionTuple(s: CharacterFormatSection) {
  return [
    s.name,
    s.order,
    s.instruction ?? "",
    s.examples ?? [],
    s.exampleBody ?? "",
    !!s.inline,
  ] as const;
}

/** Key-order-independent CharacterFormat comparison: `AppSettingsSchema.safeParse`
 *  reconstructs sections in schema key order when `user-settings.json` is read back,
 *  whereas `prompt-presets.json` may list `"inline"` before `"exampleBody"`.
 *  Comparing canonical field tuples ensures key order never causes a false dirty state. */
export function formatEqual(a: CharacterFormat | undefined, b: CharacterFormat | undefined): boolean {
  if (!a?.sections?.length && !b?.sections?.length) return true;
  const norm = (fmt?: CharacterFormat) => {
    const resolved = cloneFormat(fmt);
    return JSON.stringify(resolved.sections.map(canonicalSectionTuple));
  };
  return norm(a) === norm(b);
}

function resolveImageSettings(block?: ImageGenerationSettings): ImageGenerationSettings {
  return { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...(block ?? {}) };
}

function canonicalImageTuple(block?: ImageGenerationSettings) {
  const m = resolveImageSettings(block);
  return [
    m.instruction,
    m.instructionMode,
    m.positivePrefix,
    m.negativePrefix,
    m.promptCharacterLimit,
    m.includeState,
    m.includeCast,
    m.historyMessages,
    m.includePreviousAnswer,
  ] as const;
}

/** Defaults are filled on BOTH sides and compared as a canonical tuple so property
 *  key order in `prompt-presets.json` vs `user-settings.json` never causes a false diff. */
export function imageEqual(
  a: ImageGenerationSettings | undefined,
  b: ImageGenerationSettings | undefined
): boolean {
  return JSON.stringify(canonicalImageTuple(a)) === JSON.stringify(canonicalImageTuple(b));
}

/** Whether the live global config differs from the preset it is backing — the
 *  single definition of "dirty", driving both the Save-enable and the
 *  Load/Reload discard-confirm. */
export function promptConfigDiffers(config: PromptConfig, preset: Preset): boolean {
  if (!modulesEqual(config.modules, preset.modules)) return true;
  if (!formatEqual(config.characterFormat, preset.characterFormat)) return true;
  if (!imageEqual(config.imageGeneration, preset.imageGeneration)) return true;
  return false;
}

function cloneFormat(format?: CharacterFormat): CharacterFormat {
  if (!format || format.sections.length === 0)
    return JSON.parse(JSON.stringify(DEFAULT_CHARACTER_FORMAT)) as CharacterFormat;
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
 *  module or format list while dragging near its top/bottom edge. */
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
  { value: "image", label: "Image Generation" },
];

/** The two perspectives, as a base SimpleSelect option list (it is string-generic,
 *  so the union type rides along and the handler gets a clean "pov" | "scene"). */
const INSTRUCTION_MODE_OPTIONS: Array<SimpleSelectOption<ImageInstructionMode>> = [
  { value: "pov", label: "POV — the scene is seen through the player's eyes" },
  { value: "scene", label: "Scene — third-person frame, everyone in it is a character" },
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
  baselineSection?: CharacterFormatSection;
  hasBaseline: boolean;
  index: number;
  isDragging: boolean;
  isDropTarget: boolean;
  rowRef: (el: HTMLElement | null) => void;
  onGripPointerDown: (e: React.PointerEvent, index: number) => void;
  onChange: (index: number, patch: Partial<CharacterFormatSection>) => void;
  onRemove: (index: number) => void;
};

/** A single editable Character Sheet section row. Owns the Examples textarea's
 *  raw draft locally so typing is freeform; normalization to the stored
 *  string[] happens once on blur. Rows reorder via pointer-based drag on the
 *  grip handle — a single implementation that works for both mouse and touch
 *  (native HTML5 drag-and-drop has no touch support, so we use pointer events). */
function CharacterFormatRow({
  section,
  baselineSection,
  hasBaseline,
  index,
  isDragging,
  isDropTarget,
  rowRef,
  onGripPointerDown,
  onChange,
  onRemove,
}: CharacterFormatRowProps) {
  const [draft, setDraft] = useState(() => examplesToText(section.examples));
  const lastCommittedExamplesRef = useRef<string>(JSON.stringify(section.examples ?? []));

  // Reseed the draft only when `section.examples` changes externally (preset
  // switch, reload, or section reorder). While the user is typing in this
  // textarea, `lastCommittedExamplesRef` already matches `section.examples`, so
  // freeform newlines and spaces are preserved without interruption.
  useEffect(() => {
    const serialized = JSON.stringify(section.examples ?? []);
    if (serialized !== lastCommittedExamplesRef.current) {
      lastCommittedExamplesRef.current = serialized;
      setDraft(examplesToText(section.examples));
    }
  }, [section.examples]);

  const isNewSection = hasBaseline && !baselineSection;
  const nameDirty = hasBaseline && (!baselineSection || section.name !== baselineSection.name);
  const orderDirty = hasBaseline && !!baselineSection && section.order !== baselineSection.order;
  const inlineDirty =
    hasBaseline && (!baselineSection || !!section.inline !== !!baselineSection.inline);
  const instructionDirty =
    hasBaseline &&
    (!baselineSection || (section.instruction ?? "") !== (baselineSection.instruction ?? ""));
  const examplesDirty =
    hasBaseline &&
    (!baselineSection ||
      JSON.stringify(section.examples ?? []) !== JSON.stringify(baselineSection.examples ?? []));
  const bodyDirty =
    hasBaseline &&
    (!baselineSection || (section.exampleBody ?? "") !== (baselineSection.exampleBody ?? ""));
  const sectionDirty =
    isNewSection ||
    nameDirty ||
    orderDirty ||
    inlineDirty ||
    instructionDirty ||
    examplesDirty ||
    bodyDirty;

  return (
    <Card
      ref={rowRef}
      variant="elevated"
      padding="sm"
      dirty={sectionDirty}
      dragging={isDragging}
      dropTarget={isDropTarget}
      data-section-row={index}
    >
      <Stack direction="column" align="stretch" gap="xs">
        <Stack direction="row" align="center" gap="xs" wrap>
          <Badge variant={orderDirty ? "warning" : "neutral"} size="xs">
            {index + 1}
          </Badge>
          <Stack direction="row" align="center" flex1>
            <TextInput
              size="sm"
              fullWidth
              dirty={nameDirty}
              value={section.name}
              onChange={(e) => onChange(index, { name: e.target.value })}
              placeholder="Section name, e.g. Occupation"
              aria-label={`Section ${index + 1} name`}
            />
          </Stack>
          {sectionDirty && (
            <Badge variant="warning" size="xs">
              {isNewSection ? "New" : "Modified"}
            </Badge>
          )}
          <Checkbox
            label="Inline"
            tooltip="Render as [Name]: value on one line instead of a multi-line section."
            dirty={inlineDirty}
            checked={!!section.inline}
            onChange={(e) => onChange(index, { inline: e.target.checked })}
          />
          <Stack direction="row" align="center" gap="2xs">
            <DragHandle onPointerDown={(e) => onGripPointerDown(e, index)} />
            <Button
              variant="danger"
              size="xs"
              iconOnly
              leftIcon="X"
              tooltip="Delete section"
              aria-label={`Delete section ${index + 1}`}
              onClick={() => onRemove(index)}
            />
          </Stack>
        </Stack>

        <TextArea
          label="Instruction"
          tooltip="Instruction for the model explaining what this section should contain."
          dirty={instructionDirty}
          size="sm"
          rows={2}
          value={section.instruction}
          onChange={(e) => onChange(index, { instruction: e.target.value })}
          placeholder="Instruction for the model: what this section should contain."
          aria-label={`Section ${index + 1} instruction`}
        />
        <TextArea
          label="Expected Content (One per line)"
          tooltip="Expected content — one line per bullet. Shown to the model as examples of what this section should contain."
          dirty={examplesDirty}
          size="sm"
          rows={3}
          value={draft}
          onChange={(e) => {
            const nextText = e.target.value;
            setDraft(nextText);
            const nextExamples = textToExamples(nextText);
            const serialized = JSON.stringify(nextExamples);
            if (serialized !== lastCommittedExamplesRef.current) {
              lastCommittedExamplesRef.current = serialized;
              onChange(index, { examples: nextExamples });
            }
          }}
          onBlur={() => setDraft(examplesToText(section.examples))}
          placeholder="Expected content — one line per bullet."
          aria-label={`Section ${index + 1} examples`}
        />
        <TextArea
          label="Sample Sheet Body"
          tooltip="How this section looks in a finished character sheet. Multi-line is supported; this is the shape the model imitates."
          dirty={bodyDirty}
          size="sm"
          rows={4}
          value={section.exampleBody ?? ""}
          onChange={(e) => onChange(index, { exampleBody: e.target.value })}
          placeholder="Sample sheet body — how this section looks in a finished sheet."
          aria-label={`Section ${index + 1} sample body`}
        />
      </Stack>
    </Card>
  );
}

type DragState = {
  list: "turn" | "sheet";
  fromIndex: number;
};

export function PresetEditor() {
  const [presets, setPresets] = useState<PresetSummary[]>([]);
  const [activePresetId, setActivePresetId] = useState<string>("default");
  const [activePreset, setActivePreset] = useState<Preset | null>(null);
  const [config, setConfig] = useState<PromptConfig>({ modules: { turn: [] } });
  const [saving, setSaving] = useState(false);
  const [editingModule, setEditingModule] = useState<PresetModule | null>(null);
  const [editModuleForm, setEditModuleForm] = useState<{
    name: string;
    description: string;
    content: string;
  }>({ name: "", description: "", content: "" });
  const [activeContextTab, setActiveContextTab] = useState<EditorTab>("turn");
  const [status, setStatus] = useState<string | null>(null);
  /** A failure and a success used to look identical. Every catch reports through
   *  `reportStatus(..., true)` so the line can say so. */
  const [statusError, setStatusError] = useState(false);
  const [dialog, setDialog] = useState<PendingDialog | null>(null);

  // Unified pointer-based drag state for reordering both Turn modules and
  // Character Sheet sections (works for both mouse and touch).
  const [dragState, setDragState] = useState<DragState | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);
  const [dragGhost, setDragGhost] = useState<{ x: number; y: number; name: string } | null>(null);
  const moduleRowRefs = useRef<(HTMLElement | null)[]>([]);
  const sectionRowRefs = useRef<(HTMLElement | null)[]>([]);
  const overIndexRef = useRef<number | null>(null);

  /** The newest config, readable from timers and the unmount flush that must not
   *  close over a stale render's value. */
  const configRef = useRef<PromptConfig>(config);
  const persistTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Monotonic sequence guard so an older in-flight preset load/save never
   *  overwrites a newer operation's state. */
  const opSeqRef = useRef(0);

  function cancelPendingPersist() {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
    }
  }

  function flushPendingPersist() {
    if (persistTimer.current) {
      clearTimeout(persistTimer.current);
      persistTimer.current = null;
      void patchPromptConfig(configRef.current).catch(() => {});
    }
  }

  function reportStatus(text: string | null, isError = false) {
    setStatus(text);
    setStatusError(isError);
  }

  // Auto-clear non-error status badges after 4 seconds so the header stays clean.
  useEffect(() => {
    if (!status || statusError) return;
    const timer = setTimeout(() => setStatus(null), 4000);
    return () => clearTimeout(timer);
  }, [status, statusError]);

  // ── Load the global config once ──
  useEffect(() => {
    let cancelled = false;
    const seq = ++opSeqRef.current;
    void (async () => {
      try {
        const [summaries, state] = await Promise.all([listPresets(), getPromptConfig()]);
        if (cancelled || seq !== opSeqRef.current) return;
        const full = await getPreset(state.activePresetId).catch(() => null);
        if (cancelled || seq !== opSeqRef.current) return;
        // Commit all state synchronously in one batch so `config` and `activePreset`
        // transition together in the same render without an intermediate dirty frame.
        setPresets(summaries);
        setActivePresetId(state.activePresetId);
        setConfig(state.promptConfig);
        configRef.current = state.promptConfig;
        setActivePreset(full);
      } catch (e) {
        if (!cancelled && seq === opSeqRef.current) {
          reportStatus(e instanceof Error ? e.message : String(e), true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Flush a pending write on unmount, so a change made just before Settings
  // closes is not lost with the timer.
  useEffect(
    () => () => {
      flushPendingPersist();
    },
    []
  );

  /** Apply a change to the local config immediately (so the UI is responsive)
   *  and schedule a debounced write of the WHOLE config — one global source, so
   *  any edit reaches every playthrough's next generation. */
  function persist(patch: Partial<PromptConfig>) {
    const next: PromptConfig = { ...configRef.current, ...patch };
    configRef.current = next;
    setConfig(next);
    cancelPendingPersist();
    persistTimer.current = setTimeout(() => {
      persistTimer.current = null;
      void patchPromptConfig(next).catch((e) =>
        reportStatus(e instanceof Error ? e.message : String(e), true)
      );
    }, PERSIST_DEBOUNCE_MS);
  }

  const turnDirty = activePreset ? !modulesEqual(config.modules, activePreset.modules) : false;
  const sheetDirty = activePreset
    ? !formatEqual(config.characterFormat, activePreset.characterFormat)
    : false;
  const imageDirty = activePreset
    ? !imageEqual(config.imageGeneration, activePreset.imageGeneration)
    : false;
  const dirty = turnDirty || sheetDirty || imageDirty;

  const activePresetReadonly = activePreset?.readonly ?? false;
  const activePresetName =
    activePreset?.name ?? presets.find((p) => p.id === activePresetId)?.name ?? activePresetId;

  const format = config.characterFormat ?? cloneFormat(undefined);
  const image = config.imageGeneration ?? DEFAULT_IMAGE_GENERATION_SETTINGS;

  // Baseline lookups from the saved preset for granular per-item dirty indicators
  const presetModulesById = new Map<string, PresetModule>(
    (activePreset?.modules.turn ?? []).map((m) => [m.id, m])
  );
  const baselineFormat = activePreset ? cloneFormat(activePreset.characterFormat) : null;
  const baselineSectionsByName = new Map<string, CharacterFormatSection>(
    (baselineFormat?.sections ?? []).map((s) => [s.name, s])
  );
  const baseImage = activePreset ? resolveImageSettings(activePreset.imageGeneration) : null;

  /** Load a preset's saved config over the global config. Switch and reload are
   *  the same server operation — both discard unsaved edits. */
  async function applyActivePreset(presetId: string) {
    cancelPendingPersist();
    const seq = ++opSeqRef.current;
    setSaving(true);
    reportStatus(null);
    try {
      const [state, full] = await Promise.all([
        requestActivePreset(presetId),
        getPreset(presetId).catch(() => null),
      ]);
      if (seq !== opSeqRef.current) return;
      const resolvedPreset =
        full && full.id === state.activePresetId
          ? full
          : await getPreset(state.activePresetId).catch(() => null);
      if (seq !== opSeqRef.current) return;
      // Update `activePresetId`, `config`, and `activePreset` in one synchronous
      // batch so React never renders the new config against the old preset baseline.
      setActivePresetId(state.activePresetId);
      setConfig(state.promptConfig);
      configRef.current = state.promptConfig;
      setActivePreset(resolvedPreset);
      const name =
        resolvedPreset?.name ??
        presets.find((p) => p.id === state.activePresetId)?.name ??
        state.activePresetId;
      reportStatus(`Loaded "${name}".`);
    } catch (e) {
      if (seq === opSeqRef.current) {
        reportStatus(e instanceof Error ? e.message : String(e), true);
      }
    } finally {
      if (seq === opSeqRef.current) {
        setSaving(false);
      }
    }
  }

  /** Switching presets discards unsaved edits, so it confirms first when dirty. */
  function switchPreset(presetId: string) {
    if (saving || presetId === activePresetId) return;
    if (dirty) {
      setDialog({ kind: "confirmLoad", presetId });
      return;
    }
    void applyActivePreset(presetId);
  }

  /** Load/Reload: re-copy the backing preset over the global config, discarding
   *  the temporary changes. Confirms first when there is anything to discard. */
  function reloadPreset() {
    if (saving) return;
    if (!dirty) {
      void applyActivePreset(activePresetId);
      return;
    }
    setDialog({ kind: "confirmLoad", presetId: activePresetId });
  }

  async function savePreset() {
    if (activePresetReadonly || saving || !dirty) return;
    flushPendingPersist();
    const seq = ++opSeqRef.current;
    const snapshot = configRef.current;
    setSaving(true);
    reportStatus(null);
    try {
      const updated = await updatePreset(activePresetId, {
        modules: snapshot.modules,
        characterFormat: snapshot.characterFormat,
        imageGeneration: snapshot.imageGeneration,
      });
      if (seq !== opSeqRef.current) return;
      setActivePreset(updated);
      reportStatus(`"${updated.name}" saved.`);
    } catch (e) {
      if (seq === opSeqRef.current) {
        reportStatus(e instanceof Error ? e.message : String(e), true);
      }
    } finally {
      if (seq === opSeqRef.current) {
        setSaving(false);
      }
    }
  }

  function savePresetAs() {
    setDialog({ kind: "newPresetName", value: `${activePresetName} (copy)` });
  }

  async function createPresetFromName(name: string) {
    if (!name || saving) return;
    cancelPendingPersist();
    const seq = ++opSeqRef.current;
    const snapshot = configRef.current;
    setSaving(true);
    reportStatus(null);
    try {
      const created = await createPreset(name);
      const updated = await updatePreset(created.id, {
        modules: snapshot.modules,
        characterFormat: snapshot.characterFormat,
        imageGeneration: snapshot.imageGeneration,
      });
      // Make the new preset the server's backing preset too, so a restart does not
      // come back pointing at the old preset with an identical-but-"dirty" config.
      const [state, nextSummaries] = await Promise.all([
        requestActivePreset(updated.id),
        listPresets(),
      ]);
      if (seq !== opSeqRef.current) return;
      setPresets(nextSummaries);
      setActivePresetId(state.activePresetId);
      setConfig(state.promptConfig);
      configRef.current = state.promptConfig;
      setActivePreset(updated);
      reportStatus(`Saved as "${updated.name}".`);
    } catch (e) {
      if (seq === opSeqRef.current) {
        reportStatus(e instanceof Error ? e.message : String(e), true);
      }
    } finally {
      if (seq === opSeqRef.current) {
        setSaving(false);
        setDialog(null);
      }
    }
  }

  function renamePreset() {
    if (activePresetReadonly || saving) return;
    setDialog({ kind: "renamePreset", value: activePresetName });
  }

  async function renamePresetTo(name: string) {
    if (!name || name === activePresetName || saving) return;
    const seq = ++opSeqRef.current;
    setSaving(true);
    reportStatus(null);
    try {
      const updated = await updatePreset(activePresetId, { name });
      const nextSummaries = await listPresets();
      if (seq !== opSeqRef.current) return;
      setActivePreset(updated);
      setPresets(nextSummaries);
      reportStatus(`Renamed to "${updated.name}".`);
    } catch (e) {
      if (seq === opSeqRef.current) {
        reportStatus(e instanceof Error ? e.message : String(e), true);
      }
    } finally {
      if (seq === opSeqRef.current) {
        setSaving(false);
        setDialog(null);
      }
    }
  }

  function removePreset() {
    if (activePresetReadonly || saving) return;
    setDialog({ kind: "deletePreset" });
  }

  /** The dialog stays open (with its spinner) until the delete lands: a failure has to
   *  be visible where the user pressed, not only in the status line behind it. */
  async function deleteActivePreset() {
    cancelPendingPersist();
    const seq = ++opSeqRef.current;
    setSaving(true);
    reportStatus(null);
    try {
      await deletePreset(activePresetId);
      const [state, full, nextSummaries] = await Promise.all([
        requestActivePreset("default"),
        getPreset("default").catch(() => null),
        listPresets(),
      ]);
      if (seq !== opSeqRef.current) return;
      const resolvedPreset =
        full && full.id === state.activePresetId
          ? full
          : await getPreset(state.activePresetId).catch(() => null);
      if (seq !== opSeqRef.current) return;
      setPresets(nextSummaries);
      setActivePresetId(state.activePresetId);
      setConfig(state.promptConfig);
      configRef.current = state.promptConfig;
      setActivePreset(resolvedPreset);
      reportStatus("Preset deleted. Loaded Default.");
    } catch (e) {
      if (seq === opSeqRef.current) {
        reportStatus(e instanceof Error ? e.message : String(e), true);
      }
    } finally {
      if (seq === opSeqRef.current) {
        setSaving(false);
        setDialog(null);
      }
    }
  }

  // ── Turn modules ──

  function persistModules(turn: PresetModule[]) {
    persist({ modules: { turn } });
  }

  function toggleModule(moduleId: string) {
    persistModules(
      configRef.current.modules.turn.map((m) =>
        m.id === moduleId ? { ...m, enabled: !m.enabled } : m
      )
    );
  }

  function openEditModule(mod: PresetModule) {
    setEditingModule(mod);
    setEditModuleForm({ name: mod.name, description: mod.description, content: mod.content });
  }

  function saveEditModule() {
    if (!editingModule) return;
    persistModules(
      configRef.current.modules.turn.map((m) =>
        m.id === editingModule.id
          ? {
              ...m,
              name: editModuleForm.name,
              description: editModuleForm.description,
              content: editModuleForm.content,
            }
          : m
      )
    );
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
    const newMod: PresetModule = {
      id: newModuleId(),
      name: "New Module",
      description: "",
      content: "",
      order: configRef.current.modules.turn.length + 1,
      enabled: true,
    };
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
    persistFormat({
      ...format,
      sections: reindex([
        ...format.sections,
        {
          name: "New Section",
          order: format.sections.length + 1,
          instruction: "",
          examples: [],
          exampleBody: "",
          inline: false,
        },
      ]),
    });
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

  // ── Unified Pointer Drag-and-Drop (Turn modules & Character Sheet sections) ──

  const setModuleRowRef = (index: number) => (el: HTMLElement | null) => {
    moduleRowRefs.current[index] = el;
  };

  const setSectionRowRef = (index: number) => (el: HTMLElement | null) => {
    sectionRowRefs.current[index] = el;
  };

  function handleModuleGripPointerDown(e: React.PointerEvent, index: number, name: string) {
    e.preventDefault();
    setDragState({ list: "turn", fromIndex: index });
    overIndexRef.current = null;
    setOverIndex(null);
    setDragGhost({ x: e.clientX, y: e.clientY, name });
  }

  function handleSectionGripPointerDown(e: React.PointerEvent, index: number) {
    e.preventDefault();
    setDragState({ list: "sheet", fromIndex: index });
    overIndexRef.current = null;
    setOverIndex(null);
    setDragGhost({ x: e.clientX, y: e.clientY, name: format.sections[index]?.name ?? "" });
  }

  function handleReorderModules(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const sorted = [...configRef.current.modules.turn].sort((a, b) => a.order - b.order);
    const [moved] = sorted.splice(fromIndex, 1);
    if (!moved) return;
    sorted.splice(toIndex, 0, moved);
    persistModules(sorted.map((m, i) => ({ ...m, order: i + 1 })));
  }

  function handleReorderSections(fromIndex: number, toIndex: number) {
    if (fromIndex === toIndex) return;
    const sections = [...format.sections];
    const [moved] = sections.splice(fromIndex, 1);
    if (!moved) return;
    sections.splice(toIndex, 0, moved);
    persistFormat({ ...format, sections: reindex(sections) });
  }

  // While a module or section is being dragged, track the pointer on the window:
  // move the ghost, highlight the row under the pointer, and commit the reorder on release.
  useEffect(() => {
    if (!dragState) return;
    const { list, fromIndex } = dragState;
    const refs = list === "turn" ? moduleRowRefs : sectionRowRefs;
    const rowAttr = list === "turn" ? "data-module-row" : "data-section-row";

    function onMove(e: PointerEvent) {
      setDragGhost((g) => (g ? { ...g, x: e.clientX, y: e.clientY } : g));
      // Auto-scroll when the pointer nears the top/bottom edge of the scroll
      // container, so a row can be dragged to an off-screen position.
      const container = getScrollParent(refs.current[fromIndex] ?? null);
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
      const row = el && (el.closest(`[${rowAttr}]`) as HTMLElement | null);
      if (row) {
        const idx = Number(list === "turn" ? row.dataset.moduleRow : row.dataset.sectionRow);
        overIndexRef.current = idx;
        setOverIndex(idx);
      }
    }

    function endDrag() {
      const target = overIndexRef.current;
      if (target != null && target !== fromIndex) {
        if (list === "turn") handleReorderModules(fromIndex, target);
        else handleReorderSections(fromIndex, target);
      }
      setDragState(null);
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
  }, [dragState]);

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
          onConfirm={() => {
            void deleteActivePreset();
          }}
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
          onConfirm={() => {
            setDialog(null);
            void applyActivePreset(targetId);
          }}
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
        confirmDisabled={
          !dialog.value.trim() || (!isNew && dialog.value.trim() === activePresetName)
        }
        isLoading={saving}
        onConfirm={() => {
          void (isNew
            ? createPresetFromName(dialog.value.trim())
            : renamePresetTo(dialog.value.trim()));
        }}
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
  const editingBaseModule = editingModule ? presetModulesById.get(editingModule.id) : undefined;

  return (
    <>
      <Stack as="section" direction="column" align="stretch" gap="sm">
        <Stack direction="column" align="stretch" gap="xs" sticky>
          <Card variant="panel" padding="xs" dirty={dirty}>
            <Stack direction="column" align="stretch" gap="xs">
              <Stack direction="row" align="center" justify="between" gap="xs" wrap>
                <Stack direction="row" align="center" gap="xs" wrap>
                  <Stack direction="row" align="center" gap="2xs">
                    <Text as="span" variant="label" size="xs" weight="semibold" tone="secondary">
                      Prompt Preset
                    </Text>
                    <TooltipIcon
                      content={
                        activePresetReadonly
                          ? 'One global prompt configuration for every playthrough — edits apply immediately, even unsaved. This preset is read-only; use "Save as New…" to keep your changes under an editable copy.'
                          : 'One global prompt configuration for every playthrough — edits apply immediately, even unsaved. Save or "Save as New…" keeps them under a name; Load/Reload discards temporary changes.'
                      }
                    />
                  </Stack>

                  {status && (
                    <Badge
                      variant={statusError ? "danger" : "success"}
                      size="xs"
                      leftIcon={statusError ? "AlertCircle" : "Check"}
                      onClick={() => reportStatus(null)}
                      title="Click to dismiss"
                    >
                      {status}
                    </Badge>
                  )}
                </Stack>

                {(activePresetReadonly || dirty) && (
                  <Stack direction="row" align="center" gap="2xs">
                    {activePresetReadonly && (
                      <Badge variant="warning" size="xs" leftIcon="Lock">
                        Read-only
                      </Badge>
                    )}
                    {dirty && (
                      <Badge variant="warning" size="xs">
                        Unsaved edits
                      </Badge>
                    )}
                  </Stack>
                )}
              </Stack>

              <SimpleSelect
                value={activePresetId}
                onChange={(id) => switchPreset(id)}
                options={presets.map((p) => ({
                  value: p.id,
                  label: p.readonly ? `${p.name} (read-only)` : p.name,
                }))}
                disabled={saving}
                size="sm"
                variant="filled"
                fullWidth
                aria-label="Prompt preset"
              />

              <Stack direction="row" align="center" gap="2xs" wrap>
                <Button
                  size="xs"
                  variant="secondary"
                  leftIcon="RotateCcw"
                  onClick={reloadPreset}
                  disabled={saving}
                  title="Discard unsaved changes and reload the saved preset"
                >
                  Load/Reload
                </Button>
                <Button
                  size="xs"
                  variant="primary"
                  leftIcon="Save"
                  onClick={() => void savePreset()}
                  disabled={activePresetReadonly || !dirty || saving}
                >
                  Save
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  leftIcon="Copy"
                  onClick={savePresetAs}
                  disabled={saving}
                >
                  Save as New…
                </Button>
                <Button
                  size="xs"
                  variant="secondary"
                  leftIcon="Pencil"
                  onClick={renamePreset}
                  disabled={activePresetReadonly || saving}
                >
                  Rename
                </Button>
                <Button
                  size="xs"
                  variant="danger"
                  leftIcon="Trash2"
                  onClick={removePreset}
                  disabled={activePresetReadonly || saving}
                >
                  Delete
                </Button>
              </Stack>
            </Stack>
          </Card>

          <Tabs
            tabs={CONTEXT_TABS.map((tab) => ({
              id: tab.value,
              label: tab.label,
              badge:
                tab.value === "sheet"
                  ? sheetDirty
                    ? `${format.sections.length} •`
                    : format.sections.length
                  : tab.value === "turn"
                    ? turnDirty
                      ? `${config.modules.turn.length} •`
                      : config.modules.turn.length
                    : imageDirty
                      ? "Modified"
                      : undefined,
            }))}
            activeTab={activeContextTab}
            onChange={setActiveContextTab}
            variant="underline"
            size="sm"
            ariaLabel="Prompt configuration sections"
          />
        </Stack>

        {activeContextTab === "sheet" ? (
          <FormSection
            icon="FileText"
            title="Character Sheet Structure"
            tooltip="Sections define what generated or AI-updated character sheets must contain, in this order. Extra sections are always allowed in individual sheets — this list sets the defaults, guidance, and layout. Drag the grip handle on any section to reorder."
          >
            <Stack direction="column" align="stretch" gap="xs">
              {format.sections.map((s, idx) => {
                // Match against the preset's section at the same index or by name so edits highlight accurately
                const baselineSec =
                  baselineFormat?.sections[idx]?.name === s.name
                    ? baselineFormat.sections[idx]
                    : baselineSectionsByName.get(s.name);
                return (
                  <CharacterFormatRow
                    key={`${activePresetId}-${idx}`}
                    section={s}
                    baselineSection={baselineSec}
                    hasBaseline={!!activePreset}
                    index={idx}
                    isDragging={dragState?.list === "sheet" && dragState.fromIndex === idx}
                    isDropTarget={dragState?.list === "sheet" && overIndex === idx}
                    rowRef={setSectionRowRef(idx)}
                    onGripPointerDown={handleSectionGripPointerDown}
                    onChange={updateFormatSection}
                    onRemove={removeFormatSection}
                  />
                );
              })}
              <Stack direction="row" align="center" justify="start">
                <Button variant="outline" size="sm" leftIcon="Plus" onClick={addFormatSection}>
                  Add Section
                </Button>
              </Stack>
            </Stack>
          </FormSection>
        ) : activeContextTab === "image" ? (
          <Stack direction="column" align="stretch" gap="sm">
            <FormSection
              icon="Wand2"
              title="Prompt Writer Instruction"
              tooltip='The image prompt the text model writes for a message, before it is handed to the image provider. The model must answer with JSON only — {"prompt": "…", "negative": "…"} — with one line of comma-separated booru-style tags, and the positive prefix below is prepended to it. The negative prefix is joined onto the model&apos;s own negative tags. Keep style and quality keywords out of the instruction: the positive prefix is where art direction lives, so a preset can be restyled by editing one line.'
            >
              <Stack direction="column" align="stretch" gap="xs">
                <SimpleSelect
                  label="Instruction Mode"
                  tooltip={
                    !instructionModeApplies(image.instruction)
                      ? "This instruction carries neither the POV nor the Scene perspective rules, so the mode does not change it — it is your own custom text."
                      : "Switching rewrites the instruction below: Scene makes the player a person in the frame (their own clothing and appearance, like any character), and POV makes the frame the player's own eyes, with no player tags at all. The cast block the writer receives follows the mode too."
                  }
                  dirty={!!baseImage && image.instructionMode !== baseImage.instructionMode}
                  value={image.instructionMode}
                  onChange={(mode) =>
                    updateImage({
                      instructionMode: mode,
                      instruction: applyInstructionMode(image.instruction, mode),
                    })
                  }
                  options={INSTRUCTION_MODE_OPTIONS}
                  size="sm"
                  variant="filled"
                  fullWidth
                  aria-label="Instruction mode"
                />

                <TextArea
                  label="Instruction"
                  tooltip="How the text model should describe the current moment as one still image."
                  dirty={!!baseImage && image.instruction !== baseImage.instruction}
                  rows={12}
                  size="sm"
                  value={image.instruction}
                  onChange={(e) => updateImage({ instruction: e.target.value })}
                  placeholder="How the model should describe the current moment as one still image…"
                  characterCount={image.instruction.length}
                />
              </Stack>
            </FormSection>

            <FormSection icon="Palette" title="Prefixes & Limits">
              <Stack direction="column" align="stretch" gap="xs">
                <TextInput
                  label="Positive Prefix"
                  tooltip="Prefixed to every generated prompt — the one place art direction lives, so the instruction itself stays style-free."
                  dirty={!!baseImage && image.positivePrefix !== baseImage.positivePrefix}
                  value={image.positivePrefix}
                  onChange={(e) => updateImage({ positivePrefix: e.target.value })}
                  placeholder="anime style"
                  size="sm"
                />
                <TextInput
                  label="Negative Prefix"
                  tooltip="Appended after the shipped negative tags, not instead of them."
                  dirty={!!baseImage && image.negativePrefix !== baseImage.negativePrefix}
                  value={image.negativePrefix}
                  onChange={(e) => updateImage({ negativePrefix: e.target.value })}
                  placeholder="lowres, bad anatomy, watermark, text…"
                  size="sm"
                />

                <FormGrid cols={2} gap="xs">
                  <Slider
                    label="Character Limit"
                    description="A soft cap on the composed prompt: the writer is told it and the composer cuts the tag line to it. 0 leaves the provider's own cap as the only limit."
                    dirty={
                      !!baseImage &&
                      image.promptCharacterLimit !== baseImage.promptCharacterLimit
                    }
                    min={0}
                    max={4000}
                    step={50}
                    value={image.promptCharacterLimit}
                    defaultPreview={DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit}
                    integer
                    onChange={(val) =>
                      updateImage({ promptCharacterLimit: Math.max(0, Math.floor(val ?? 0)) })
                    }
                  />

                  <Slider
                    label="Previous Messages of History"
                    description="How many messages behind the frame the writer sees as continuity. 0 turns the block off."
                    dirty={!!baseImage && image.historyMessages !== baseImage.historyMessages}
                    min={0}
                    max={IMAGE_HISTORY_MESSAGES_MAX}
                    step={1}
                    value={image.historyMessages}
                    defaultPreview={DEFAULT_IMAGE_GENERATION_SETTINGS.historyMessages}
                    integer
                    onChange={(val) =>
                      updateImage({
                        historyMessages: Math.min(
                          IMAGE_HISTORY_MESSAGES_MAX,
                          Math.max(0, Math.floor(val ?? 0))
                        ),
                      })
                    }
                  />
                </FormGrid>
              </Stack>
            </FormSection>

            <FormSection
              icon="Sliders"
              title="Context Inclusion"
              tooltip="This block is applied to every playthrough. A generation reads the current values at call time; history and the shape reference are pulled from whichever playthrough is generating."
            >
              <Stack direction="column" align="stretch" gap="xs">
                <SwitchRow
                  icon="Activity"
                  title="Include current state"
                  tooltip="Sends the player's visible conditions and current narrative state to the image prompt writer."
                  description="The player's visible conditions and current narrative state."
                  dirty={!!baseImage && image.includeState !== baseImage.includeState}
                  checked={image.includeState}
                  onChange={(e) => updateImage({ includeState: e.target.checked })}
                />
                <SwitchRow
                  icon="Users"
                  title="Include present characters"
                  tooltip="Sends who is in frame, along with their clothing, mood, and character sheet identity."
                  description="Who is in frame, with their clothing, mood and sheet identity."
                  dirty={!!baseImage && image.includeCast !== baseImage.includeCast}
                  checked={image.includeCast}
                  onChange={(e) => updateImage({ includeCast: e.target.checked })}
                />
                <SwitchRow
                  icon="History"
                  title="Include previous image prompt response"
                  tooltip="One earlier answer, for shape reference only — its scene, clothing and pose belong to that earlier moment. Off by default because an in-context example can anchor a tag model."
                  description="One earlier answer, for shape reference only. Off by default."
                  dirty={
                    !!baseImage && image.includePreviousAnswer !== baseImage.includePreviousAnswer
                  }
                  checked={image.includePreviousAnswer}
                  onChange={(e) => updateImage({ includePreviousAnswer: e.target.checked })}
                />
              </Stack>
            </FormSection>
          </Stack>
        ) : (
          <FormSection
            icon="Sliders"
            title="Turn Prompt Modules"
            tooltip="Ordered prompt modules sent on every story turn when enabled. Drag the grip handle on any module to reorder."
          >
            <Stack direction="column" align="stretch" gap="xs">
              {sortedModules.map((mod, idx) => {
                const isDragging = dragState?.list === "turn" && dragState.fromIndex === idx;
                const isDropTarget = dragState?.list === "turn" && overIndex === idx;
                const hasDescription = mod.description.trim().length > 0;
                const baseMod = presetModulesById.get(mod.id);
                const isNewModule = !!activePreset && !baseMod;
                const isOrderModified = !!activePreset && !!baseMod && mod.order !== baseMod.order;
                const isContentModified =
                  !!activePreset &&
                  !!baseMod &&
                  (mod.name !== baseMod.name ||
                    mod.description !== baseMod.description ||
                    mod.content !== baseMod.content ||
                    mod.enabled !== baseMod.enabled);
                const isModuleDirty = isNewModule || isOrderModified || isContentModified;

                return (
                  <Card
                    key={mod.id}
                    ref={setModuleRowRef(idx)}
                    variant="elevated"
                    padding="xs"
                    dirty={isModuleDirty}
                    dragging={isDragging}
                    dropTarget={isDropTarget}
                    data-module-row={idx}
                  >
                    <Stack direction="row" align="center" justify="between" gap="xs">
                      <Stack direction="row" align="center" gap="xs" flex1>
                        <Badge variant={isOrderModified ? "warning" : "neutral"} size="xs">
                          {idx + 1}
                        </Badge>
                        <Checkbox
                          checked={mod.enabled}
                          onChange={() => toggleModule(mod.id)}
                          label={
                            <Text
                              as="span"
                              size="sm"
                              weight="semibold"
                              tone={mod.enabled ? "primary" : "muted"}
                            >
                              {mod.name}
                            </Text>
                          }
                        />
                        {hasDescription && <TooltipIcon content={mod.description} />}
                        {isModuleDirty && (
                          <Badge variant="warning" size="xs">
                            {isNewModule ? "New" : "Modified"}
                          </Badge>
                        )}
                      </Stack>

                      <Stack direction="row" align="center" gap="2xs">
                        <DragHandle
                          onPointerDown={(e) => handleModuleGripPointerDown(e, idx, mod.name)}
                        />
                        <Button
                          variant="ghost"
                          size="xs"
                          iconOnly
                          leftIcon="Pencil"
                          tooltip={`Edit ${mod.name}`}
                          aria-label={`Edit ${mod.name}`}
                          onClick={() => openEditModule(mod)}
                        />
                        <Button
                          variant="danger"
                          size="xs"
                          iconOnly
                          leftIcon="X"
                          tooltip={`Delete ${mod.name}`}
                          aria-label={`Delete ${mod.name}`}
                          onClick={() => deleteModule(mod.id, mod.name)}
                        />
                      </Stack>
                    </Stack>
                  </Card>
                );
              })}

              <Stack direction="row" align="center" justify="start">
                <Button variant="outline" size="sm" leftIcon="Plus" onClick={addNewModule}>
                  Add Module
                </Button>
              </Stack>
            </Stack>
          </FormSection>
        )}

        {dragGhost ? <DragGhost x={dragGhost.x} y={dragGhost.y} name={dragGhost.name} /> : null}
      </Stack>

      <Modal
        open={!!editingModule}
        onClose={() => setEditingModule(null)}
        size="md"
        ariaLabel="Edit Module"
      >
        <Header
          variant="modal"
          title={editingModule ? `Edit Module: ${editingModule.name}` : "Edit Module"}
          bordered
          actions={
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              leftIcon="X"
              tooltip="Close"
              onClick={() => setEditingModule(null)}
              aria-label="Close Edit Module"
            />
          }
        />
        <Modal.Body>
          <Modal.Content>
            <Stack direction="column" align="stretch" gap="xs">
              <TextInput
                label="Name"
                size="sm"
                dirty={!!editingBaseModule && editModuleForm.name !== editingBaseModule.name}
                value={editModuleForm.name}
                onChange={(e) => setEditModuleForm((f) => ({ ...f, name: e.target.value }))}
              />
              <TextArea
                label="Description"
                tooltip="Shown inside the info tooltip icon beside the module's name in the Turn tab. Leave empty to hide the tooltip icon."
                size="sm"
                rows={2}
                dirty={
                  !!editingBaseModule &&
                  editModuleForm.description !== editingBaseModule.description
                }
                value={editModuleForm.description}
                onChange={(e) =>
                  setEditModuleForm((f) => ({ ...f, description: e.target.value }))
                }
              />
              <TextArea
                label="Content"
                tooltip="Sent to the model verbatim when this module is enabled."
                size="sm"
                rows={10}
                dirty={
                  !!editingBaseModule && editModuleForm.content !== editingBaseModule.content
                }
                value={editModuleForm.content}
                onChange={(e) => setEditModuleForm((f) => ({ ...f, content: e.target.value }))}
              />
            </Stack>
          </Modal.Content>
        </Modal.Body>
        <Modal.Footer>
          <Button variant="secondary" size="sm" onClick={() => setEditingModule(null)}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" leftIcon="Check" onClick={saveEditModule}>
            Save
          </Button>
        </Modal.Footer>
      </Modal>

      {dialog ? renderDialog() : null}
    </>
  );
}
