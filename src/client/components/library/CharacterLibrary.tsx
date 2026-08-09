import { useEffect, useMemo, useState } from "react";
import type { CharacterTemplate } from "../../../schemas";
import { createCharacter, deleteCharacter, listCharacters, updateCharacter } from "../../api";
import type { CharacterTemplateUpdate } from "../../api";
import { CHARACTER_SHEET_EXAMPLE } from "../../../engine/characterSections";

export type CharacterLibraryProps = {
  isModal?: boolean;
};

type CharacterForm = {
  name: string;
  content: string;
};

function blankForm(): CharacterForm {
  return { name: "", content: "" };
}

function templateToForm(t: CharacterTemplate): CharacterForm {
  return {
    name: t.name,
    content: t.content,
  };
}

function formToUpdate(form: CharacterForm): CharacterTemplateUpdate {
  return {
    name: form.name,
    content: form.content,
  };
}

type VersionGroup = { key: string; versions: CharacterTemplate[] };

function groupByLineage(templates: CharacterTemplate[]): VersionGroup[] {
  const map = new Map<string, CharacterTemplate[]>();
  for (const t of templates) {
    const key = t.lineageId ?? t.id;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  const groups = [...map.entries()].map(([key, versions]) => ({
    key,
    versions: versions.sort((a, b) => b.version - a.version)
  }));
  groups.sort((a, b) => a.versions[0].name.localeCompare(b.versions[0].name));
  return groups;
}

export function CharacterLibrary({ isModal }: CharacterLibraryProps) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [form, setForm] = useState<CharacterForm>(blankForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  async function loadData() {
    try {
      setTemplates(await listCharacters());
    } catch {
      setTemplates([]);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  function openCreate() {
    setForm(blankForm());
    setEditingId(null);
    setEditorOpen(true);
    setStatus(null);
  }

  function openEdit(t: CharacterTemplate) {
    setForm(templateToForm(t));
    setEditingId(t.id);
    setEditorOpen(true);
    setStatus(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setStatus(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const update = formToUpdate(form);
      if (editingId) {
        await updateCharacter(editingId, update);
        setStatus(`"${form.name}" updated.`);
      } else {
        await createCharacter(form.name);
        const all = await listCharacters();
        const created = all.find(t => t.name === form.name && !t.content.trim());
        if (created) {
          await updateCharacter(created.id, { content: form.content });
        }
        setStatus(`"${form.name}" created.`);
      }
      setTemplates(await listCharacters());
      closeEditor();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}" from the library?`)) return;
    await deleteCharacter(id);
    setTemplates(await listCharacters());
  }

  const filteredTemplates = useMemo(() => {
    if (!search.trim()) return templates;
    const query = search.toLowerCase().trim();
    return templates.filter((t) =>
      t.name.toLowerCase().includes(query) ||
      t.content.toLowerCase().includes(query) ||
      (t.summary && t.summary.toLowerCase().includes(query))
    );
  }, [templates, search]);

  const groups = useMemo(() => groupByLineage(filteredTemplates), [filteredTemplates]);

  return (
    <div className={`character-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
      {isModal ? (
        <div className="global-scope-badge" title="Edits modify global templates used for new playthroughs">
          🌐 Global Character Templates
        </div>
      ) : null}

      <div className="character-manager-body">
        {editorOpen ? (
          <div className="character-editor-inline">
            <h3>{editingId ? `Edit: ${form.name}` : "New Character"}</h3>
            {status ? <p className="status-message">{status}</p> : null}

            <label className="editor-field">
              <span className="editor-field-label">Name</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </label>

            <label className="editor-field">
              <span className="editor-field-label">Content (full character sheet)</span>
              <textarea rows={20} value={form.content} onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                placeholder={CHARACTER_SHEET_EXAMPLE}
                className="content-textarea" />
            </label>

            <div className="modal-actions">
              <button onClick={closeEditor}>Cancel</button>
              <button className="primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="library-toolbar">
              <button className="primary-btn" onClick={openCreate}>+ New Character</button>
              <div className="library-search-wrapper">
                <input
                  type="text"
                  placeholder="Search characters by name or content…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="library-search-input"
                />
                {search ? (
                  <button className="clear-search-btn" onClick={() => setSearch("")}>✕</button>
                ) : null}
              </div>
            </div>

            {groups.length === 0 ? (
              <p className="empty-value">
                {search ? "No characters found matching search." : "No characters in the library yet."}
              </p>
            ) : (
              <div className="version-groups">
                {groups.map(group => {
                  const latest = group.versions[0];
                  return (
                    <div key={group.key} className="version-group">
                      <div className="version-group-header">
                        <strong>{latest.name}</strong> <span className="version-badge">v{latest.version}</span>
                        {group.versions.length > 1 ? (
                          <span className="version-count">({group.versions.length} versions)</span>
                        ) : null}
                      </div>
                      <p className="content-preview">{latest.summary?.trim() ? latest.summary.trim().slice(0, 100) : (latest.content.split("\n").find(l => l.trim() && !l.startsWith("["))?.trim().slice(0, 100) || "(empty)")}</p>
                      <div className="version-group-actions">
                        <button onClick={() => openEdit(latest)}>Edit</button>
                        <button className="danger" onClick={() => handleDelete(latest.id, latest.name)}>Delete</button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
