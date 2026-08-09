import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import type { CharacterInstance, ClothingItem, Playthrough } from "../../../schemas";
import { TagInput } from "../common/TagInput";
import { CHARACTER_SECTION_HEADERS, splitContentSections, joinContentSections, parseClothingFromContent } from "../../../engine/characterSections";

export type CharacterEditorProps = {
  character: CharacterInstance;
  playthrough: Playthrough;
  inLibrary: boolean;
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
    clothing: form.clothing,
    mood: form.mood || undefined,
    towardPlayer: form.towardPlayer || undefined,
    memorySummary: form.memorySummary || undefined,
    conditions: form.conditions,
    flags: form.flags,
  };
}

export function CharacterEditor({
  character,
  playthrough,
  inLibrary,
  initialMode = "edit",
  onSave,
  onSaveToLibrary,
  onClose,
}: CharacterEditorProps) {
  const initialForm = useRef<EditorForm>(instanceToForm(character, playthrough));
  const [form, setForm] = useState<EditorForm>(initialForm.current);
  const [structuredMode, setStructuredMode] = useState(() => splitContentSections(form.content).sections.length >= 2);
  const contentSections = useMemo(() => splitContentSections(form.content), [form.content]);

  function updateSection(index: number, body: string) {
    const updated = contentSections.sections.map((s, i) => (i === index ? { ...s, body } : s));
    setForm((f) => ({ ...f, content: joinContentSections(updated, contentSections.preamble) }));
  }

  const [clothingSlot, setClothingSlot] = useState("");
  const [clothingName, setClothingName] = useState("");
  const [clothingState, setClothingState] = useState("");

  function addClothingItem() {
    if (!clothingSlot.trim() || !clothingName.trim()) return;
    setForm((prev) => ({
      ...prev,
      clothing: [
        ...prev.clothing.filter((c) => c.slot !== clothingSlot.trim()),
        { slot: clothingSlot.trim(), name: clothingName.trim(), state: clothingState.trim() || undefined }
      ]
    }));
    setClothingSlot("");
    setClothingName("");
    setClothingState("");
  }

  function removeClothingItem(slot: string) {
    setForm((prev) => ({ ...prev, clothing: prev.clothing.filter((c) => c.slot !== slot) }));
  }

  const clothingEditor = (
    <>
      {form.clothing.length === 0 ? (
        <p className="empty-value">No clothing items yet.</p>
      ) : (
        form.clothing.map((c) => (
          <div key={c.slot} className="clothing-row">
            <span>{c.slot}: {c.name}{c.state ? ` (${c.state})` : ""}</span>
            <button className="icon-btn danger-icon" onClick={() => removeClothingItem(c.slot)}>✕</button>
          </div>
        ))
      )}
      <div className="clothing-add">
        <input placeholder="Slot" value={clothingSlot} onChange={(e) => setClothingSlot(e.target.value)} />
        <input placeholder="Name" value={clothingName} onChange={(e) => setClothingName(e.target.value)} />
        <input placeholder="State (optional)" value={clothingState} onChange={(e) => setClothingState(e.target.value)} />
        <button onClick={addClothingItem}>Add</button>
      </div>
    </>
  );

  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [saveToLib, setSaveToLib] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current);

  useEffect(() => {
    initialForm.current = instanceToForm(character, playthrough);
    setForm(initialForm.current);
    setMode(initialMode);
    setStatus(null);
    setSaveToLib(false);
  }, [character.id, initialMode, playthrough.id]);

  const handleClose = useCallback(() => {
    if (mode === "edit" && isDirty) {
      if (!window.confirm("You have unsaved changes. Discard them?")) return;
    }
    onClose();
  }, [mode, isDirty, onClose]);

  async function handleSave(closeAfter: boolean) {
    setSaving(true);
    setStatus(null);
    try {
      const clothing = structuredMode ? form.clothing : parseClothingFromContent(form.content);
      const payload = { ...formToPayload(form), clothing };
      await onSave(payload);

      let libMsg = "";
      if (saveToLib && onSaveToLibrary) {
        const result = await onSaveToLibrary(inLibrary ? "update" : "update");
        libMsg = result.created ? " + saved to library" : " + library updated";
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

  const renderField = (label: string, help: string | undefined, content: React.ReactNode) => (
    <label className="editor-field">
      <span className="editor-field-label">
        {label}
        {help ? <span className="field-help" title={help}>?</span> : null}
      </span>
      {content}
    </label>
  );

  const renderReadOnly = (label: string, value: React.ReactNode) => (
    <div className="editor-field read-only">
      <span className="editor-field-label">{label}</span>
      <span className="read-only-value">{value || <em className="empty-value">—</em>}</span>
    </div>
  );

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) handleClose(); }}>
      <section className="modal character-editor-modal">
        <header className="modal-header">
          <div>
            <h2>{character.name}</h2>
            <p>
              {mode === "view" ? "Read-only view" : "Edit mode"}
              {isDirty ? <span className="dirty-indicator"> — unsaved changes</span> : null}
            </p>
          </div>
          <div className="modal-header-actions">
            <button
              className="mode-toggle"
              onClick={() => {
                if (mode === "edit" && isDirty) {
                  if (!window.confirm("You have unsaved changes. Switch to view mode and discard them?")) return;
                }
                setMode(mode === "view" ? "edit" : "view");
              }}
            >
              {mode === "view" ? "Edit" : "View"}
            </button>
            <button onClick={handleClose}>Close</button>
          </div>
        </header>

        {status ? <p className={status.isError ? "status-error" : "status-ok"}>{status.text}</p> : null}

        <div className="character-editor-body">
          {mode === "view" ? (
            <>
              <h4>Character Sheet</h4>
              <pre className="content-view">{form.content || <em className="empty-value">No character data.</em>}</pre>

              {renderReadOnly("Summary", form.summary || null)}
              {renderReadOnly("Clothing", form.clothing.length > 0 ? form.clothing.map((c) => `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`).join("; ") : null)}

              <h4>Runtime State</h4>
              {renderReadOnly("Mood", form.mood)}
              {renderReadOnly("Toward Player", form.towardPlayer)}
              {renderReadOnly("Memory", form.memorySummary)}
              {renderReadOnly("Conditions", form.conditions.length > 0 ? form.conditions.join(", ") : null)}
              {renderReadOnly("Flags", form.flags.length > 0 ? form.flags.join(", ") : null)}
            </>
          ) : (
            <>
              {renderField("Name", undefined, (
                <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
              ))}

              {renderField("Summary", "One-line description used when the character is away from the scene", (
                <input value={form.summary} onChange={(e) => setForm((f) => ({ ...f, summary: e.target.value }))} />
              ))}

              <h4>Character Sheet</h4>
              <div className="section-mode-toggle">
                <button className={structuredMode ? "active" : ""} onClick={() => setStructuredMode(true)}>Sections</button>
                <button className={!structuredMode ? "active" : ""} onClick={() => setStructuredMode(false)}>Raw</button>
              </div>
              {structuredMode ? (
                contentSections.sections.length === 0 ? (
                  <p className="empty-value">No sections detected — switch to Raw to edit the full sheet text.</p>
                ) : (
                  <div className="section-editor">
                    {contentSections.sections.map((s, i) => (
                      s.header.toLowerCase() === "clothing" ? (
                        <div className="editor-field" key={`${s.header}-${i}`}>
                          <span className="editor-field-label">Clothing</span>
                          {clothingEditor}
                        </div>
                      ) : (
                      <label className="editor-field" key={`${s.header}-${i}`}>
                        <span className="editor-field-label">{s.header}</span>
                        <textarea
                          rows={Math.max(2, Math.min(12, Math.ceil((s.body?.length ?? 0) / 60)))}
                          value={s.body ?? ""}
                          onChange={(e) => updateSection(i, e.target.value)}
                          className="content-textarea"
                        />
                      </label>
                      )
                    ))}
                    {!contentSections.sections.some((s) => s.header.toLowerCase() === "clothing") ? (
                      <div className="editor-field">
                        <span className="editor-field-label">Clothing (structured)</span>
                        {clothingEditor}
                      </div>
                    ) : null}
                  </div>
                )
              ) : (
                renderField("Content", "Full character sheet text — injected directly into the model prompt.", (
                  <textarea
                    rows={20}
                    value={form.content}
                    onChange={(e) => setForm((f) => ({ ...f, content: e.target.value }))}
                    placeholder={"[Species]: ..."}
                    className="content-textarea"
                  />
                ))
              )}

              <h4>Runtime State</h4>
              {renderField("Mood", "Current emotional state", (
                <input value={form.mood} onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))} placeholder="e.g. curious, wary, hostile" />
              ))}
              {renderField("Toward Player", "How the character feels about the player", (
                <input value={form.towardPlayer} onChange={(e) => setForm((f) => ({ ...f, towardPlayer: e.target.value }))} placeholder="e.g. friendly but guarded" />
              ))}
              {renderField("Memory Summary", "What the character remembers about the player and recent events", (
                <textarea rows={3} value={form.memorySummary} onChange={(e) => setForm((f) => ({ ...f, memorySummary: e.target.value }))} />
              ))}
              {renderField("Conditions", undefined, (
                <TagInput value={form.conditions} onChange={(v) => setForm((f) => ({ ...f, conditions: v }))} placeholder="Add a condition…" />
              ))}
              {renderField("Flags", undefined, (
                <TagInput value={form.flags} onChange={(v) => setForm((f) => ({ ...f, flags: v }))} placeholder="Add a flag…" />
              ))}
            </>
          )}
        </div>

        {mode === "edit" ? (
          <footer className="character-editor-footer">
            <div className="footer-left">
              {onSaveToLibrary ? (
                <label className="toggle-field save-to-lib">
                  <input type="checkbox" checked={saveToLib} onChange={(e) => setSaveToLib(e.target.checked)} />
                  <span>Also update library copy</span>
                  {inLibrary ? <span className="lib-badge">in library</span> : <span className="lib-badge not-in-lib">not in library</span>}
                </label>
              ) : null}
            </div>
            <div className="footer-right">
              <button onClick={handleClose} disabled={saving}>Cancel</button>
              <button onClick={() => { void handleSave(false); }} disabled={saving || !isDirty}>
                {saving ? "Saving…" : "Save"}
              </button>
              <button className="primary" onClick={() => { void handleSave(true); }} disabled={saving || !isDirty}>
                {saving ? "Saving…" : "Save & Close"}
              </button>
            </div>
          </footer>
        ) : null}
      </section>
    </div>
  );
}
