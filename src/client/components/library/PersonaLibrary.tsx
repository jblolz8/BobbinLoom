import { useEffect, useState } from "react";
import {
  createPersona,
  deletePersona,
  getPersona,
  listPersonas,
  setDefaultPersona,
  updatePersona,
  type Persona
} from "../../api";
import { Icon } from "../common/Icon";

export type PersonaLibraryProps = {
  isModal?: boolean;
  onPersonasChanged?: (personas: Persona[]) => void;
};

function emptyPersonaForm(): Persona {
  return {
    id: "", name: "", description: "", bodyType: "average", appearance: "",
    initialClothing: [],
    isDefault: false,
  };
}

export function PersonaLibrary({ isModal, onPersonasChanged }: PersonaLibraryProps) {
  const [personas, setPersonas] = useState<Persona[]>([]);
  const [personaEditorOpen, setPersonaEditorOpen] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [personaForm, setPersonaForm] = useState<Persona>(emptyPersonaForm());
  const [personaClothingSlot, setPersonaClothingSlot] = useState("");
  const [personaClothingName, setPersonaClothingName] = useState("");
  const [personaClothingState, setPersonaClothingState] = useState("");
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaStatus, setPersonaStatus] = useState<{ text: string; isError: boolean } | null>(null);

  useEffect(() => {
    setPersonaStatus(null);
    setPersonaEditorOpen(false);
    setEditingPersonaId(null);
    listPersonas()
      .then(setPersonas)
      .catch((e) => setPersonaStatus({ text: e instanceof Error ? e.message : String(e), isError: true }));
  }, []);

  function startCreatePersona() {
    setEditingPersonaId(null);
    setPersonaForm(emptyPersonaForm());
    setPersonaEditorOpen(true);
    setPersonaStatus(null);
  }

  async function startEditPersona(id: string) {
    try {
      const p = await getPersona(id);
      setPersonaForm(p);
      setEditingPersonaId(id);
      setPersonaEditorOpen(true);
      setPersonaStatus(null);
    } catch (e) {
      setPersonaStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    }
  }

  function closePersonaEditor() {
    setPersonaEditorOpen(false);
    setEditingPersonaId(null);
    setPersonaForm(emptyPersonaForm());
  }

  function addClothingItem() {
    if (!personaClothingSlot.trim() || !personaClothingName.trim()) return;
    setPersonaForm((prev) => ({
      ...prev,
      initialClothing: [
        ...prev.initialClothing.filter((c) => c.slot !== personaClothingSlot.trim()),
        { slot: personaClothingSlot.trim(), name: personaClothingName.trim(), state: personaClothingState.trim() || undefined },
      ],
    }));
    setPersonaClothingSlot(""); setPersonaClothingName(""); setPersonaClothingState("");
  }

  function removeClothingItem(slot: string) {
    setPersonaForm((prev) => ({
      ...prev,
      initialClothing: prev.initialClothing.filter((c) => c.slot !== slot),
    }));
  }

  async function savePersona() {
    if (!personaForm.name.trim() || personaSaving) return;
    setPersonaSaving(true); setPersonaStatus(null);
    try {
      const { id: _id, isDefault: _isDefault, ...updates } = personaForm;
      const wantDefault = personaForm.isDefault;
      let savedId: string;
      let savedName: string;

      if (editingPersonaId) {
        const updated = await updatePersona(editingPersonaId, updates);
        savedId = updated.id;
        savedName = updated.name;
        setPersonaStatus({ text: `"${savedName}" saved.`, isError: false });
      } else {
        const created = await createPersona(personaForm.name.trim());
        const updated = await updatePersona(created.id, updates);
        savedId = updated.id;
        savedName = updated.name;
        setPersonaStatus({ text: `"${savedName}" created.`, isError: false });
      }

      if (wantDefault) {
        await setDefaultPersona(savedId);
      }

      const refreshed = await listPersonas();
      setPersonas(refreshed);
      onPersonasChanged?.(refreshed);
      closePersonaEditor();
    } catch (e) {
      setPersonaStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setPersonaSaving(false);
    }
  }

  async function handleDeletePersona(id: string) {
    const target = personas.find((p) => p.id === id);
    if (!window.confirm(`Delete persona "${target?.name ?? id}"? This cannot be undone.`)) return;
    try {
      await deletePersona(id);
      const refreshed = await listPersonas();
      setPersonas(refreshed);
      onPersonasChanged?.(refreshed);
      setPersonaStatus({ text: "Persona deleted.", isError: false });
    } catch (e) {
      setPersonaStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const updated = await setDefaultPersona(id);
      const next = personas.map((p) => ({ ...p, isDefault: p.id === id }));
      setPersonas(next);
      onPersonasChanged?.(next);
      setPersonaStatus({ text: `"${updated.name}" is now default.`, isError: false });
    } catch (e) {
      setPersonaStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    }
  }

  return (
    <div className={`persona-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
      {isModal ? (
        <div className="global-scope-badge flex items-center gap-1.5" title="Personas represent player identity templates">
          <Icon name="User" size={16} /> User Personas
        </div>
      ) : null}

      {!personaEditorOpen ? (
        <div className="persona-list">
          {personas.map((p) => (
            <div key={p.id} className={`persona-row ${p.isDefault ? "default" : ""}`}>
              <div className="persona-row-info">
                <strong>{p.name}</strong> {p.isDefault ? <span className="default-star" title="Default persona"><Icon name="Star" size={14} className="text-amber-400 fill-amber-400" /></span> : null}
                <span className="persona-row-desc">{p.description || <em>No description</em>}</span>
                <span className="persona-row-meta">
                  {p.bodyType}{p.initialClothing.length > 0 ? ` · ${p.initialClothing.length} clothing item${p.initialClothing.length === 1 ? "" : "s"}` : " · no clothing"}
                </span>
              </div>
              <div className="persona-row-actions">
                <button onClick={() => void startEditPersona(p.id)} disabled={personaSaving}>Edit</button>
                {!p.isDefault ? <button onClick={() => void handleSetDefault(p.id)} disabled={personaSaving}>Set Default</button> : null}
                <button className="danger" onClick={() => void handleDeletePersona(p.id)} disabled={personaSaving || personas.length <= 1}>Delete</button>
              </div>
            </div>
          ))}
          <button className="primary-btn add-module-btn flex items-center gap-1.5 justify-center" onClick={startCreatePersona} disabled={personaSaving}>
            <Icon name="Plus" size={16} /> Create New Persona
          </button>
        </div>
      ) : (
        <div className="persona-editor">
          <div className="persona-editor-header">
            <button className="inline-action flex items-center gap-1" onClick={closePersonaEditor} disabled={personaSaving}>
              <Icon name="ArrowLeft" size={16} /> Back to list
            </button>
            <h3>{editingPersonaId ? `Edit: ${personaForm.name || "Persona"}` : "New Persona"}</h3>
          </div>
          <div className="settings-form">
            <label>Name <input value={personaForm.name} onChange={(e) => setPersonaForm((f) => ({ ...f, name: e.target.value }))} placeholder="Character name" /></label>
            <label>Description <textarea rows={3} value={personaForm.description} onChange={(e) => setPersonaForm((f) => ({ ...f, description: e.target.value }))} placeholder="Who is this character? Personality, background, quirks…" /></label>
            <label>Body Type <input value={personaForm.bodyType} onChange={(e) => setPersonaForm((f) => ({ ...f, bodyType: e.target.value }))} placeholder="e.g. athletic, slender, stocky" /></label>
            <label>Appearance <textarea rows={3} value={personaForm.appearance} onChange={(e) => setPersonaForm((f) => ({ ...f, appearance: e.target.value }))} placeholder="Hair, eyes, distinguishing features, typical dress…" /></label>

            <h4>Initial Clothing</h4>
            <p className="module-hint">Starting clothing may be overridden by scenario generation.</p>
            {personaForm.initialClothing.map((c) => (
              <div key={c.slot} className="clothing-row">
                <span>{c.slot}: {c.name}{c.state ? ` (${c.state})` : ""}</span>
                <button className="icon-btn danger-icon" onClick={() => removeClothingItem(c.slot)}><Icon name="X" size={14} /></button>
              </div>
            ))}
            <div className="clothing-add">
              <input placeholder="Slot" value={personaClothingSlot} onChange={(e) => setPersonaClothingSlot(e.target.value)} />
              <input placeholder="Name" value={personaClothingName} onChange={(e) => setPersonaClothingName(e.target.value)} />
              <input placeholder="State (optional)" value={personaClothingState} onChange={(e) => setPersonaClothingState(e.target.value)} />
              <button onClick={addClothingItem}>Add</button>
            </div>

            <label className="toggle">
              <input type="checkbox" checked={personaForm.isDefault} onChange={(e) => setPersonaForm((f) => ({ ...f, isDefault: e.target.checked }))} />
              Set as default persona
            </label>

            <div className="settings-actions">
              <button className="primary" onClick={() => void savePersona()} disabled={personaSaving || !personaForm.name.trim()}>{personaSaving ? "Saving…" : "Save Persona"}</button>
              <button onClick={closePersonaEditor} disabled={personaSaving}>Cancel</button>
            </div>
          </div>
        </div>
      )}

      {personaStatus ? <pre className={`settings-status ${personaStatus.isError ? "status-error" : "status-ok"}`}>{personaStatus.text}</pre> : null}
    </div>
  );
}
