import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CharacterInstance, ClothingItem, Playthrough } from "../../../schemas";
import {
  Badge,
  Button,
  CodeBlock,
  Icon,
  SimpleSelect,
  SwitchRow,
  Tabs,
  TagInput,
  TextArea,
  TextInput
} from "../base";
import { Dialog } from "../base/Dialog";
import { TwoPaneDiff } from "../library/TwoPaneDiff";
import { ConfirmModal } from "../common/ConfirmModal";
import {
  applySectionChanges,
  parseClothingFromContent,
  splitContentSections,
  type ContentSection
} from "../../../engine/characterSections";
import { CharacterSheetSections } from "../views/PlayView/InfoPanel/CharacterSheetSections";
import { sectionProvenance } from "../../engine/sheetProvenance";

export type CharacterEditorProps = {
  character: CharacterInstance;
  playthrough: Playthrough;
  inLibrary: boolean;
  /** The library card's sheet, when one exists — the original this playthrough's copy is measured
   *  against, and the only place a "restore" can come from. */
  originalSheet?: string | null;
  initialMode?: "view" | "edit";
  onSave: (payload: CharacterEditPayload) => Promise<void>;
  onSaveToLibrary?: (mode: "update" | "newVersion") => Promise<{ version: number; created: boolean }>;
  onClose: () => void;
};

export type CharacterEditPayload = {
  mood?: string;
  towardPlayer?: string;
  memorySummary?: string;
  conditions?: string[];
  flags?: string[];
  currentLocationId?: string;
  clothing?: ClothingItem[];
  name?: string;
  content?: string;
  summary?: string;
};

type EditorForm = {
  name: string;
  content: string;
  summary: string;
  clothing: ClothingItem[];
  mood: string;
  towardPlayer: string;
  memorySummary: string;
  conditions: string[];
  flags: string[];
};

function instanceToForm(
  char: CharacterInstance,
  playthrough: Playthrough
): EditorForm {
  const tpl = playthrough.characterTemplates.find((t) => t.id === char.templateId);
  return {
    name: char.name,
    content: tpl?.content ?? "",
    summary: tpl?.summary ?? "",
    clothing: [...(char.clothing ?? [])],
    mood: char.mood,
    towardPlayer: char.towardPlayer,
    memorySummary: char.memorySummary,
    conditions: [...char.conditions],
    flags: [...char.flags],
  };
}

function formToPayload(form: EditorForm): CharacterEditPayload {
  return {
    name: form.name || undefined,
    content: form.content || undefined,
    summary: form.summary || undefined,
    mood: form.mood || undefined,
    towardPlayer: form.towardPlayer || undefined,
    memorySummary: form.memorySummary || undefined,
    conditions: form.conditions,
    flags: form.flags,
  };
}

/**
 * A main-cast character's full sheet: the sheet as the story has grown it, and the editor for it.
 *
 * Everything sits on the app's own parts — `Dialog` for the shell (Escape, focus, the backdrop, the
 * action row and the phone sheet all come from one place), `Tabs` for the mode, `TextInput` /
 * `TextArea` / `TagInput` for the fields, `CodeBlock` for the raw text, `TwoPaneDiff` for the
 * comparison against the library card, and `ConfirmModal` for the discard guard.
 *
 * The sheet GROWS from the story: the engine's `characterSection*` patches rewrite sections and bullets
 * as turns happen. So this dialog also SHOWS that — a mark per section read back out of the turn log,
 * and how far the sheet has drifted from the library card it was taken from.
 */
export function CharacterEditor({
  character,
  playthrough,
  inLibrary,
  originalSheet = null,
  initialMode = "edit",
  onSave,
  onSaveToLibrary,
  onClose,
}: CharacterEditorProps) {
  const template = playthrough.characterTemplates.find((t) => t.id === character.templateId);
  // CCv2-backed sheets are read-only in play (D9): content + clothing are locked.
  const isReadOnlySheet = template?.format === "ccv2";
  const initialForm = useRef<EditorForm>(instanceToForm(character, playthrough));
  const [form, setForm] = useState<EditorForm>(initialForm.current);

  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [saveToLib, setSaveToLib] = useState(false);
  const [libMode, setLibMode] = useState<"update" | "newVersion">("update");
  const [pendingDiscard, setPendingDiscard] = useState<"close" | "view" | null>(null);
  const [showRaw, setShowRaw] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current);

  useEffect(() => {
    initialForm.current = instanceToForm(character, playthrough);
    setForm(initialForm.current);
    setMode(initialMode);
    setStatus(null);
    setSaveToLib(false);
    setLibMode("update");
    setPendingDiscard(null);
    setShowRaw(false);
    setShowDiff(false);
  }, [character.id, initialMode, playthrough.id]);

  // ── The sheet's own history ────────────────────────────────────────────────────────────────
  /** What the story changed, per section — read from the turn log, never stored a second time. */
  const marks = useMemo(
    () => sectionProvenance(playthrough.messages, character.name),
    [playthrough.messages, character.name]
  );

  const sheetSections = useMemo(() => splitContentSections(form.content).sections, [form.content]);
  const sectionHeaders = useMemo(() => sheetSections.map((s) => s.header), [sheetSections]);

  /** The library card's sections by header: the drift check and the per-section restore both need it. */
  const originSections = useMemo(() => {
    if (!originalSheet) return null;
    const map = new Map<string, string>();
    for (const section of splitContentSections(originalSheet).sections) {
      map.set(section.header.trim().toLowerCase(), section.body.trim());
    }
    return map;
  }, [originalSheet]);

  const divergedFromLibrary = originalSheet !== null && (template?.content ?? "").trim() !== originalSheet.trim();

  const driftOf = useCallback(
    (section: ContentSection): "added" | "changed" | "same" | null => {
      if (!originSections) return null;
      const original = originSections.get(section.header.trim().toLowerCase());
      if (original === undefined) return "added";
      return original === section.body.trim() ? "same" : "changed";
    },
    [originSections]
  );

  function restoreSection(header: string) {
    if (!originalSheet) return;
    const original = splitContentSections(originalSheet).sections.find(
      (section) => section.header.trim().toLowerCase() === header.trim().toLowerCase()
    );
    if (!original) return;
    setForm((f) => ({
      ...f,
      content: applySectionChanges(f.content, [{ header, body: original.body }])
    }));
  }

  // ── Leaving, and switching mode, with a draft in hand ───────────────────────────────────────
  // Every exit routes through here — Escape, the backdrop, Close and the mode switch — because four
  // entry points is how a guard gets bypassed.
  const requestClose = useCallback(() => {
    if (mode === "edit" && isDirty) {
      setPendingDiscard("close");
      return;
    }
    onClose();
  }, [mode, isDirty, onClose]);

  const requestMode = useCallback(
    (next: "view" | "edit") => {
      if (next === mode) return;
      if (mode === "edit" && isDirty) {
        setPendingDiscard("view");
        return;
      }
      setMode(next);
    },
    [mode, isDirty]
  );

  function confirmDiscard() {
    const action = pendingDiscard;
    setPendingDiscard(null);
    if (action === "close") {
      onClose();
      return;
    }
    setForm(initialForm.current);
    setMode("view");
  }

  async function handleSave(closeAfter: boolean) {
    setSaving(true);
    setStatus(null);
    try {
      const payload = formToPayload(form);
      if (isReadOnlySheet) {
        // CCv2 sheets are read-only (D9): never submit the sheet blob or clothing.
        delete payload.content;
        delete payload.clothing;
      } else {
        // The content field is authoritative: the [Clothing] section IS the
        // current outfit. Re-derive structured clothing from it on save so the
        // prompt's derived Clothing line stays honest.
        payload.clothing = parseClothingFromContent(form.content);
      }
      await onSave(payload);

      let libMsg = "";
      if (saveToLib && onSaveToLibrary) {
        // The reader chooses: overwrite the card, or mint a version beside it. The choice only means
        // anything once the card exists and this sheet has moved on from it.
        const result = await onSaveToLibrary(libMode);
        libMsg = result.created ? ` + saved to the library as v${result.version}` : " + library card updated";
      }

      initialForm.current = { ...form };
      setStatus({ text: `"${character.name}" updated${libMsg}.`, isError: false });

      if (closeAfter) {
        setTimeout(onClose, 1000);
      }
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  const modeTabs = useMemo(
    () => [
      { id: "view" as const, label: "View" },
      { id: "edit" as const, label: "Edit" }
    ],
    []
  );

  const renderSectionExtra = (section: ContentSection) => {
    const drift = driftOf(section);
    if (!drift || drift === "same") return null;
    return (
      <p className="sheet-section-drift">
        <Badge variant={drift === "added" ? "info" : "warning"} size="xs">
          {drift === "added" ? "new since the library" : "changed since the library"}
        </Badge>
        {/* Read-only CCv2 sheets never submit their blob, so restoring one would look like it worked
            and quietly not persist. The marker still shows; only the action is withheld. */}
        {isReadOnlySheet ? null : (
          <Button
            size="xs"
            variant="ghost"
            leftIcon={<Icon name="RotateCcw" size={11} />}
            onClick={() => restoreSection(section.header)}
          >
            Restore the original
          </Button>
        )}
      </p>
    );
  };

  const driftBlock =
    originalSheet !== null ? (
      <section className="sheet-drift">
        <h4>
          Against the library card
          <Badge variant={divergedFromLibrary ? "warning" : "neutral"} size="xs">
            {divergedFromLibrary ? "changed" : "identical"}
          </Badge>
        </h4>
        <p className="sheet-note">
          {divergedFromLibrary
            ? "This playthrough's sheet has grown since the character was taken from the library. The card is the original; this copy is the story's."
            : "This playthrough's sheet is still the library card's."}
        </p>
        {divergedFromLibrary ? (
          <>
            <Button size="sm" variant="ghost" onClick={() => setShowDiff((v) => !v)}>
              {showDiff ? "Hide the comparison" : "Compare with the original"}
            </Button>
            {showDiff ? (
              <TwoPaneDiff
                leftLabel="Library original"
                rightLabel="This playthrough"
                leftContent={originalSheet}
                rightContent={form.content}
              />
            ) : null}
          </>
        ) : null}
      </section>
    ) : null;

  const runtimeState = (
    <dl className="sheet-readonly">
      <div>
        <dt>Mood</dt>
        <dd>{form.mood || <span className="empty-value">—</span>}</dd>
      </div>
      <div>
        <dt>Toward player</dt>
        <dd>{form.towardPlayer || <span className="empty-value">—</span>}</dd>
      </div>
      <div>
        <dt>Memory</dt>
        <dd>{form.memorySummary || <span className="empty-value">—</span>}</dd>
      </div>
      <div>
        <dt>Conditions</dt>
        <dd>{form.conditions.length > 0 ? form.conditions.join(", ") : <span className="empty-value">—</span>}</dd>
      </div>
      <div>
        <dt>Flags</dt>
        <dd>{form.flags.length > 0 ? form.flags.join(", ") : <span className="empty-value">—</span>}</dd>
      </div>
      <div>
        <dt>Clothing</dt>
        <dd>
          {form.clothing.length > 0
            ? form.clothing.map((c) => `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`).join("; ")
            : <span className="empty-value">—</span>}
        </dd>
      </div>
    </dl>
  );

  const readOnlyBadge = isReadOnlySheet ? (
    <Badge variant="info" size="xs" title="CCv2 sheets are read-only in play — conversion coming later">
      read-only CCv2 sheet
    </Badge>
  ) : null;

  return (
    <>
      <Dialog
        title={character.name}
        description={
          <>
            {mode === "view" ? "Read-only view" : "Edit mode"}
            {isDirty ? <span className="dirty-indicator"> — unsaved changes</span> : null}
          </>
        }
        className="character-editor-modal"
        maxWidth={820}
        isBusy={saving}
        onClose={requestClose}
        headerAction={
          <div className="sheet-header-actions">
            <Tabs
              tabs={modeTabs}
              activeTab={mode}
              onChange={requestMode}
              variant="pill"
              size="sm"
              ariaLabel="Sheet mode"
            />
            <Button size="sm" variant="secondary" onClick={requestClose}>
              Close
            </Button>
          </div>
        }
        footer={
          mode === "edit" ? (
            <>
              <Button
                variant="primary"
                isLoading={saving}
                disabled={saving || !isDirty}
                onClick={() => { void handleSave(true); }}
              >
                Save & Close
              </Button>
              <Button
                variant="secondary"
                disabled={saving || !isDirty}
                onClick={() => { void handleSave(false); }}
              >
                Save
              </Button>
              <Button variant="secondary" disabled={saving} onClick={requestClose}>
                Cancel
              </Button>
            </>
          ) : (
            <>
              {/* A restore from the library card edits the draft in view mode, so view mode needs a
                  way to land it — otherwise the one mode where the sections (and their drift markers)
                  are visible would be the one mode that cannot save. */}
              {isDirty && !isReadOnlySheet ? (
                <Button
                  variant="primary"
                  isLoading={saving}
                  disabled={saving}
                  onClick={() => { void handleSave(false); }}
                >
                  Save
                </Button>
              ) : null}
              <Button variant="secondary" onClick={requestClose}>
                Close
              </Button>
            </>
          )
        }
      >
        <div className="character-editor-body">
          {status ? <p className={status.isError ? "status-error" : "status-ok"}>{status.text}</p> : null}

          {mode === "view" ? (
            <>
              <h4>
                Character sheet
                {readOnlyBadge}
              </h4>
              {sheetSections.length > 0 ? (
                <CharacterSheetSections
                  content={form.content}
                  headers={sectionHeaders}
                  marks={marks}
                  renderSectionExtra={renderSectionExtra}
                />
              ) : (
                <p className="sheet-empty">
                  No character data. <span className="empty-value">This character has no sheet yet.</span>
                </p>
              )}
              <div className="sheet-raw">
                <Button size="sm" variant="ghost" onClick={() => setShowRaw((v) => !v)}>
                  {showRaw ? "Hide the raw sheet" : "Show the raw sheet"}
                </Button>
                {showRaw ? (
                  <CodeBlock code={form.content || "(empty)"} label="Raw sheet" wrap maxHeight={320} showCopy />
                ) : null}
              </div>

              <h4>Runtime state</h4>
              {runtimeState}
            </>
          ) : (
            <>
              <TextInput
                label="Name"
                value={form.name}
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              />

              <TextInput
                label="Summary"
                helperText="One-line description used when the character is away from the scene"
                value={form.summary}
                onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))}
              />

              <h4>
                Character sheet
                {readOnlyBadge}
              </h4>
              <TextArea
                label="Content"
                helperText="Full character sheet text — [Section] headers, in the order your current preset's Character Sheet format defines. [Clothing] slot bullets here are the character's current outfit."
                rows={18}
                value={form.content}
                onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                placeholder={"[Species]: ..."}
                disabled={isReadOnlySheet}
                containerClassName="sheet-content-field"
              />

              <h4>Runtime state</h4>
              <TextInput
                label="Mood"
                helperText="Current emotional state"
                value={form.mood}
                onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                placeholder="e.g. curious, wary, hostile"
              />
              <TextInput
                label="Toward player"
                helperText="How the character feels about the player"
                value={form.towardPlayer}
                onChange={(e) => setForm((f) => ({ ...f, towardPlayer: e.target.value }))}
                placeholder="e.g. friendly but guarded"
              />
              <TextArea
                label="Memory summary"
                helperText="What the character remembers about the player and recent events"
                rows={3}
                autoGrow
                autoGrowMax={180}
                value={form.memorySummary}
                onChange={(e) => setForm((f) => ({ ...f, memorySummary: e.target.value }))}
              />
              <label className="editor-field">
                <span className="editor-field-label">Conditions</span>
                <TagInput
                  value={form.conditions}
                  onChange={(v) => setForm((f) => ({ ...f, conditions: v }))}
                  placeholder="Add a condition…"
                />
              </label>
              <label className="editor-field">
                <span className="editor-field-label">Flags</span>
                <TagInput
                  value={form.flags}
                  onChange={(v) => setForm((f) => ({ ...f, flags: v }))}
                  placeholder="Add a flag…"
                />
              </label>

              {onSaveToLibrary ? (
                <section className="sheet-library">
                  <SwitchRow
                    title="Also update the library copy"
                    description={
                      inLibrary
                        ? "Write this sheet back to the library card it came from"
                        : "There is no library card with this id yet — saving adds one"
                    }
                    checked={saveToLib}
                    onChange={(e) => setSaveToLib(e.target.checked)}
                  />
                  <p className="sheet-library-state">
                    {inLibrary ? (
                      <Badge variant="success" size="xs">in the library</Badge>
                    ) : (
                      <Badge variant="neutral" size="xs">not in the library</Badge>
                    )}
                    {inLibrary && divergedFromLibrary ? (
                      <Badge variant="warning" size="xs">this copy has changed since</Badge>
                    ) : null}
                  </p>
                  {saveToLib && inLibrary && divergedFromLibrary ? (
                    <div className="sheet-library-mode">
                      <SimpleSelect
                        value={libMode}
                        onChange={setLibMode}
                        size="sm"
                        fullWidth
                        aria-label="How to save this sheet to the library"
                        options={[
                          { value: "update", label: "Overwrite the library card", description: "The card becomes this sheet" },
                          { value: "newVersion", label: "Save as a new version", description: "The original card is kept" }
                        ]}
                      />
                      <p className="sheet-note">
                        Overwriting replaces the card every future playthrough starts from — the comparison
                        above shows exactly what would change.
                      </p>
                    </div>
                  ) : null}
                </section>
              ) : null}
            </>
          )}

          {driftBlock}
        </div>
      </Dialog>

      {/* The dirty guard. It STACKS on the sheet, which is what the dialog stack is for: Escape closes
          this one and only this one, and focus stays here. */}
      {pendingDiscard ? (
        <ConfirmModal
          title="Discard unsaved changes?"
          message={`Your edits to ${character.name}'s sheet have not been saved.`}
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          onConfirm={confirmDiscard}
          onCancel={() => setPendingDiscard(null)}
        />
      ) : null}
    </>
  );
}
