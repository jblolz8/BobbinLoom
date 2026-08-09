import { useEffect, useRef, useState } from "react";
import type { LorebookEntry, LorebookFile, LorebookSummary } from "../../../schemas";
import {
  createLorebook,
  deleteLorebook,
  getLorebook,
  importLorebook,
  listLorebooks,
  saveLorebook,
} from "../../api";

export type LorebookLibraryProps = {
  isModal?: boolean;
  onLorebooksChanged?: () => void;
};

const SELECTIVE_LOGIC_LABELS: Record<number, string> = {
  0: "AND ANY",
  1: "NOT ALL",
  2: "NOT ANY",
  3: "AND ALL",
};

function blankEntry(uid: number): LorebookEntry {
  return {
    uid,
    key: [],
    keysecondary: [],
    content: "",
    comment: "",
    constant: false,
    selective: false,
    selectiveLogic: 0,
    scanDepth: null,
    caseSensitive: false,
    matchWholeWords: false,
    useRegex: false,
    useProbability: false,
    probability: 100,
    sticky: 0,
    cooldown: 0,
    delay: 0,
    order: 100,
    position: 0,
    depth: 4,
    disable: false,
    group: "",
    groupWeight: 100,
    preventRecursion: false,
    excludeRecursion: false,
    delayUntilRecursion: false,
  };
}

function nextUid(entries: Record<string, LorebookEntry>): number {
  let max = 0;
  for (const key of Object.keys(entries)) {
    const n = Number(key);
    if (n > max) max = n;
  }
  return max + 1;
}

function sortEntries(entries: Record<string, LorebookEntry>): LorebookEntry[] {
  return Object.values(entries).sort((a, b) => a.order - b.order || a.uid - b.uid);
}

export function LorebookLibrary({ isModal, onLorebooksChanged }: LorebookLibraryProps) {
  const [summaries, setSummaries] = useState<LorebookSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lorebook, setLorebook] = useState<LorebookFile | null>(null);
  const [editingUid, setEditingUid] = useState<number | null>(null);
  const [entryForm, setEntryForm] = useState<LorebookEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    try {
      setSummaries(await listLorebooks());
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    }
  }

  async function selectLorebook(id: string) {
    setStatus(null);
    setEditingUid(null);
    setEntryForm(null);
    try {
      const lb = await getLorebook(id);
      setLorebook(lb);
      setSelectedId(id);
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    }
  }

  function backToList() {
    setSelectedId(null);
    setLorebook(null);
    setEditingUid(null);
    setEntryForm(null);
    refresh();
  }

  async function handleCreate() {
    const name = window.prompt("Lorebook name:");
    if (!name?.trim()) return;
    setSaving(true);
    try {
      await createLorebook(name.trim());
      await refresh();
      setStatus({ text: `"${name.trim()}" created.`, isError: false });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete lorebook "${name}"? This cannot be undone.`)) return;
    setSaving(true);
    try {
      await deleteLorebook(id);
      if (selectedId === id) backToList();
      await refresh();
      setStatus({ text: `"${name}" deleted.`, isError: false });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
    }
  }

  async function handleImport() {
    const input = fileInputRef.current;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    setSaving(true);
    try {
      const text = await file.text();
      const contents = JSON.parse(text);
      if (!contents.entries || typeof contents.entries !== "object") {
        throw new Error("Invalid lorebook file: missing entries object");
      }
      const filename = file.name.replace(/\.json$/i, "");
      await importLorebook(filename, contents);
      await refresh();
      setStatus({ text: `"${filename}" imported.`, isError: false });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
      if (input) input.value = "";
    }
  }

  function handleExport() {
    if (!lorebook) return;
    const blob = new Blob([JSON.stringify(lorebook, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${lorebook.name.replace(/[^a-zA-Z0-9_\- ]/g, "_")}.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  async function handleSaveLorebook() {
    if (!lorebook || !selectedId) return;
    setSaving(true);
    try {
      await saveLorebook(selectedId, lorebook);
      setStatus({ text: "Saved.", isError: false });
      onLorebooksChanged?.();
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
    }
  }

  function openNewEntry() {
    const uid = nextUid(lorebook?.entries ?? {});
    const entry = blankEntry(uid);
    setEntryForm(entry);
    setEditingUid(uid);
  }

  function openEditEntry(entry: LorebookEntry) {
    setEntryForm({ ...entry });
    setEditingUid(entry.uid);
  }

  function closeEntryEditor() {
    setEntryForm(null);
    setEditingUid(null);
  }

  function handleSaveEntry() {
    if (!lorebook || !entryForm) return;
    const updated = { ...lorebook.entries, [String(entryForm.uid)]: entryForm };
    setLorebook({ ...lorebook, entries: updated });
    closeEntryEditor();
  }

  function handleDeleteEntry(uid: number) {
    if (!lorebook) return;
    if (!window.confirm("Delete this entry?")) return;
    const updated = { ...lorebook.entries };
    delete updated[String(uid)];
    setLorebook({ ...lorebook, entries: updated });
    if (editingUid === uid) closeEntryEditor();
  }

  function entryFormField<T extends keyof LorebookEntry>(field: T, value: LorebookEntry[T]) {
    if (!entryForm) return;
    setEntryForm({ ...entryForm, [field]: value });
  }

  const filteredEntries = lorebook
    ? sortEntries(lorebook.entries).filter((e) => {
        if (!searchTerm) return true;
        const s = searchTerm.toLowerCase();
        return (
          e.key.some((k) => k.toLowerCase().includes(s)) ||
          e.keysecondary.some((k) => k.toLowerCase().includes(s)) ||
          e.content.toLowerCase().includes(s) ||
          e.comment.toLowerCase().includes(s)
        );
      })
    : [];

  if (selectedId && lorebook && !editingUid) {
    return (
      <div className={`lorebook-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
        {isModal ? (
          <div className="global-scope-badge" title="Edits modify global lorebook templates">
            🌐 Global Lorebooks
          </div>
        ) : null}

        <div className="lorebook-editor-subhead">
          <h3>Lorebook: {lorebook.name} ({Object.keys(lorebook.entries).length} entries)</h3>
          <div className="modal-header-actions">
            <button onClick={handleSaveLorebook} disabled={saving}>{saving ? "Saving…" : "Save Lorebook"}</button>
            <button onClick={handleExport}>Export</button>
            <button onClick={backToList}>Back to List</button>
          </div>
        </div>

        {status ? <p className={status.isError ? "status-error" : "status-ok"}>{status.text}</p> : null}

        <div className="lorebook-settings-bar">
          <label>Name <input
            value={lorebook.name}
            onChange={(e) => setLorebook({ ...lorebook, name: e.target.value })}
          /></label>
          <label>Scan Depth <input
            type="number" min={0} max={1000}
            value={lorebook.scanDepth ?? 2}
            onChange={(e) => setLorebook({ ...lorebook, scanDepth: Number(e.target.value) || 2 })}
          /></label>
          <label className="toggle"><input
            type="checkbox"
            checked={lorebook.caseSensitive ?? false}
            onChange={(e) => setLorebook({ ...lorebook, caseSensitive: e.target.checked })}
          /> Case Sensitive</label>
          <label className="toggle"><input
            type="checkbox"
            checked={lorebook.matchWholeWords ?? false}
            onChange={(e) => setLorebook({ ...lorebook, matchWholeWords: e.target.checked })}
          /> Whole Words</label>
        </div>

        <div className="lorebook-editor-layout">
          <div className="lorebook-entry-list">
            <div className="lorebook-entry-list-header">
              <input
                type="text"
                placeholder="Search entries…"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
              <button onClick={openNewEntry} disabled={saving}>+ Add Entry</button>
            </div>
            {filteredEntries.length === 0 ? (
              <p className="lorebook-empty">No entries. Click "+ Add Entry" to create one, or import from a SillyTavern World Info file.</p>
            ) : (
              <ul className="lorebook-entry-rows">
                {filteredEntries.map((entry) => (
                  <li
                    key={entry.uid}
                    className={`lorebook-entry-row ${entry.disable ? "disabled" : ""}`}
                    onClick={() => openEditEntry(entry)}
                  >
                    <span className="entry-uid">#{entry.uid}</span>
                    <span className="entry-label">
                      {entry.constant ? "⚡" : ""}
                      {entry.key.slice(0, 3).join(", ") || "(no keys)"}
                    </span>
                    <span className="entry-preview">{entry.content.slice(0, 60)}{entry.content.length > 60 ? "…" : ""}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="lorebook-entry-editor-placeholder">
            <p>Select an entry from the list to edit it, or click "+ Add Entry".</p>
          </div>
        </div>
      </div>
    );
  }

  if (selectedId && lorebook && editingUid && entryForm) {
    return (
      <div className={`lorebook-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
        <div className="lorebook-editor-subhead">
          <h3>{lorebook.name} — Entry #{entryForm.uid}</h3>
          <div className="modal-header-actions">
            <button onClick={handleSaveEntry} disabled={saving}>Save Entry</button>
            <button onClick={closeEntryEditor}>Cancel</button>
          </div>
        </div>

        <div className="lorebook-entry-editor">
          <div className="lorebook-entry-editor-main">
            <label>Keys (one per line)
              <textarea
                rows={3}
                value={entryForm.key.join("\n")}
                onChange={(e) => entryFormField("key", e.target.value.split("\n").filter(Boolean))}
                placeholder="Keywords that trigger this entry"
              />
            </label>
            <label>Secondary Keys (one per line)
              <textarea
                rows={2}
                value={entryForm.keysecondary.join("\n")}
                onChange={(e) => entryFormField("keysecondary", e.target.value.split("\n").filter(Boolean))}
                placeholder="Secondary keywords for selective matching"
              />
            </label>
            <label>Content
              <textarea
                rows={6}
                value={entryForm.content}
                onChange={(e) => entryFormField("content", e.target.value)}
                placeholder="The text injected into the prompt when this entry activates"
              />
            </label>
            <label>Comment
              <textarea
                rows={2}
                value={entryForm.comment}
                onChange={(e) => entryFormField("comment", e.target.value)}
                placeholder="Optional note (not sent to the model)"
              />
            </label>
          </div>

          <div className="lorebook-entry-editor-sidebar">
            <h4>Activation</h4>
            <label className="toggle"><input type="checkbox" checked={entryForm.constant} onChange={(e) => entryFormField("constant", e.target.checked)} /> Constant</label>
            <label className="toggle"><input type="checkbox" checked={entryForm.disable} onChange={(e) => entryFormField("disable", e.target.checked)} /> Disabled</label>
            <label className="toggle"><input type="checkbox" checked={entryForm.selective} onChange={(e) => entryFormField("selective", e.target.checked)} /> Selective</label>

            {entryForm.selective ? (
              <label>Selective Logic
                <select value={entryForm.selectiveLogic} onChange={(e) => entryFormField("selectiveLogic", Number(e.target.value))}>
                  {Object.entries(SELECTIVE_LOGIC_LABELS).map(([val, label]) => (
                    <option key={val} value={Number(val)}>{label}</option>
                  ))}
                </select>
              </label>
            ) : null}

            <h4>Matching</h4>
            <label className="toggle"><input type="checkbox" checked={entryForm.caseSensitive} onChange={(e) => entryFormField("caseSensitive", e.target.checked)} /> Case Sensitive</label>
            <label className="toggle"><input type="checkbox" checked={entryForm.matchWholeWords} onChange={(e) => entryFormField("matchWholeWords", e.target.checked)} /> Whole Words</label>
            <label className="toggle"><input type="checkbox" checked={entryForm.useRegex} onChange={(e) => entryFormField("useRegex", e.target.checked)} /> Regex</label>

            <h4>Injection</h4>
            <label>Order <input type="number" min={0} value={entryForm.order} onChange={(e) => entryFormField("order", Number(e.target.value) || 100)} /></label>
            <label>Position
              <select value={entryForm.position} onChange={(e) => entryFormField("position", Number(e.target.value))}>
                <option value={0}>0 - Before (system prompt preamble)</option>
                <option value={1}>1 - After (after character defs)</option>
                <option value={2}>2 - Depth (at message index)</option>
              </select>
            </label>
            <label>Depth <input type="number" min={0} value={entryForm.depth} onChange={(e) => entryFormField("depth", Number(e.target.value) || 4)} /></label>
            <label>Scan Depth <input type="number" min={0} value={entryForm.scanDepth ?? ""} onChange={(e) => entryFormField("scanDepth", e.target.value ? Number(e.target.value) : null)} placeholder="Inherits from lorebook" /></label>

            <h4>Timing</h4>
            <label>Sticky <input type="number" min={0} value={entryForm.sticky} onChange={(e) => entryFormField("sticky", Number(e.target.value) || 0)} /></label>
            <label>Cooldown <input type="number" min={0} value={entryForm.cooldown} onChange={(e) => entryFormField("cooldown", Number(e.target.value) || 0)} /></label>
            <label>Delay <input type="number" min={0} value={entryForm.delay} onChange={(e) => entryFormField("delay", Number(e.target.value) || 0)} /></label>

            <h4>Probability</h4>
            <label className="toggle"><input type="checkbox" checked={entryForm.useProbability} onChange={(e) => entryFormField("useProbability", e.target.checked)} /> Use Probability</label>
            {entryForm.useProbability ? (
              <label>Probability % <input type="number" min={0} max={100} value={entryForm.probability} onChange={(e) => entryFormField("probability", Number(e.target.value) || 100)} /></label>
            ) : null}

            <div className="entry-editor-actions">
              <button className="danger" onClick={() => handleDeleteEntry(entryForm.uid)}>Delete Entry</button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`lorebook-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
      {isModal ? (
        <div className="global-scope-badge" title="Edits modify global lorebook templates">
          🌐 Global Lorebooks
        </div>
      ) : null}

      {status ? <p className={status.isError ? "status-error" : "status-ok"}>{status.text}</p> : null}

      <div className="lorebook-toolbar">
        <button className="primary-btn" onClick={handleCreate}>New Lorebook</button>
        <button onClick={() => fileInputRef.current?.click()}>Import from File</button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          style={{ display: "none" }}
          onChange={() => void handleImport()}
        />
      </div>

      {summaries.length === 0 ? (
        <p className="lorebook-empty">No lorebooks yet. Create one or import a SillyTavern World Info .json file.</p>
      ) : (
        <ul className="lorebook-list">
          {summaries.map((s) => (
            <li key={s.id} className="lorebook-list-row">
              <div className="lorebook-list-info" onClick={() => void selectLorebook(s.id)}>
                <strong>{s.name}</strong>
                <span>{s.entryCount} entries</span>
                <span>Scan depth: {s.scanDepth}</span>
              </div>
              <div className="lorebook-list-actions">
                <button onClick={() => void selectLorebook(s.id)}>Edit</button>
                <button className="danger" onClick={() => void handleDelete(s.id, s.name)}>Delete</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
