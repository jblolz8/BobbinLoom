import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate } from "../../../schemas";
import { createCharacter, deleteCharacter, importCharacter, listCharacters, updateCharacter } from "../../api";
import { convertCharacterApply, convertCharacterGenerate } from "../../api";
import type { CharacterTemplateUpdate } from "../../api";
import { CHARACTER_SHEET_EXAMPLE } from "../../../engine/characterSections";
import { displayTitle, entryKind, filterLibraryEntries, cardBadgeLabel } from "../../../engine/characterCards";
import { DiffModal } from "./DiffModal";
import { TwoPaneDiff } from "./TwoPaneDiff";

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

/** Avatar for a library card: the record's PNG (imported CCv2 cards), falling
 *  back to a letter placeholder when the route 404s (BL-native records). */
function CharacterAvatar({ template }: { template: CharacterTemplate }) {
  const [failed, setFailed] = useState(false);

  // Reset the fallback when the card changes (list reloads reuse components).
  useEffect(() => {
    setFailed(false);
  }, [template.id]);

  if (failed) {
    return <div className="avatar-placeholder">{displayTitle(template).charAt(0).toUpperCase()}</div>;
  }
  return (
    <img
      className="library-avatar"
      src={`/api/characters/${template.id}/avatar`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

export function CharacterLibrary({ isModal }: CharacterLibraryProps) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [form, setForm] = useState<CharacterForm>(blankForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsCcv2, setEditingIsCcv2] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Conversion state ──
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [diffData, setDiffData] = useState<{
    oldContent: string;
    newContent: string;
    recordId: string;
    readOnly?: boolean;
  } | null>(null);

  // ── Edit-form tab (converted cards): BL Format (default) / Original / Both ──
  const [viewTab, setViewTab] = useState<"bl" | "original" | "both">("bl");

  // ── Import notice state ──
  const [importNotice, setImportNotice] = useState<{
    message: string;
    existingRecord: CharacterTemplate;
  } | null>(null);

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
    setEditingIsCcv2(false);
    setEditorOpen(true);
    setStatus(null);
  }

  function openEdit(t: CharacterTemplate) {
    setForm(templateToForm(t));
    setEditingId(t.id);
    setEditingIsCcv2(t.format === "ccv2");
    setViewTab("bl");
    setEditorOpen(true);
    setStatus(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setEditingIsCcv2(false);
    setViewTab("bl");
    setStatus(null);
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const update = formToUpdate(form);
      if (editingId) {
        await updateCharacter(editingId, editingIsCcv2 ? { name: update.name } : update);
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

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    setStatus(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1); // strip data: prefix
      const result = await importCharacter(file.name, base64);
      // Check for already-converted notice
      if ("notice" in result && (result as Record<string, unknown>).notice === "already_converted") {
        const existing = (result as Record<string, unknown>).existingRecord as CharacterTemplate;
        setImportNotice({
          message: "This character already exists with its original content, importing will make no change.",
          existingRecord: existing,
        });
        return;
      }
      setTemplates(await listCharacters());
      setStatus(`Imported "${displayTitle(result.record)}".`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  // ── Conversion handlers ──

  async function handleConvert(template: CharacterTemplate) {
    setConvertingId(template.id);
    setConvertLoading(true);
    setConvertError(null);
    try {
      const result = await convertCharacterGenerate(template.id);
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: template.id,
      });
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConvertLoading(false);
    }
  }

  async function handleConvertRetry(feedback: string) {
    if (!diffData) return;
    setConvertLoading(true);
    setConvertError(null);
    try {
      const result = await convertCharacterGenerate(diffData.recordId, feedback || undefined);
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: diffData.recordId,
      });
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConvertLoading(false);
    }
  }

  async function handleConvertAccept() {
    if (!diffData) return;
    setConvertLoading(true);
    setConvertError(null);
    try {
      await convertCharacterApply(diffData.recordId, diffData.newContent);
      setDiffData(null);
      setConvertingId(null);
      setTemplates(await listCharacters());
      setStatus("Card converted to BL format.");
      // If the editor was open for this card, refresh the form
      if (editingId === diffData.recordId) {
        setEditingIsCcv2(false);
        setViewTab("bl");
        const updated = (await listCharacters()).find(t => t.id === diffData.recordId);
        if (updated) setForm(templateToForm(updated));
      }
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConvertLoading(false);
    }
  }

  function closeDiffModal() {
    setDiffData(null);
    setConvertingId(null);
    setConvertError(null);
  }

  const filteredTemplates = useMemo(() => filterLibraryEntries(templates, search), [templates, search]);

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

            <div className="editor-header-actions">
              {editingIsCcv2 ? (
                <button
                  className="convert-btn"
                  onClick={() => {
                    const tpl = templates.find(t => t.id === editingId);
                    if (tpl) handleConvert(tpl);
                  }}
                  disabled={convertLoading}
                >
                  {convertLoading ? "Converting…" : "Convert to BL Format"}
                </button>
              ) : null}
            </div>

            <label className="editor-field">
              <span className="editor-field-label">Name</span>
              <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
            </label>

            {(() => {
              const tpl = editingId ? templates.find(t => t.id === editingId) : undefined;
              const isConverted = editingId !== null && !!tpl?.ccv2Content && !editingIsCcv2;

              if (!isConverted) {
                // Unconverted CCv2 (read-only) or native BL (editable) — single view.
                return (
                  <label className="editor-field">
                    <span className="editor-field-label">
                      Content (full character sheet)
                      {editingIsCcv2 ? <span className="ccv2-readonly-badge">Read-only CCv2 sheet</span> : null}
                    </span>
                    <textarea rows={20} value={form.content}
                      onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                      placeholder={CHARACTER_SHEET_EXAMPLE}
                      className="content-textarea"
                      disabled={editingIsCcv2} />
                  </label>
                );
              }

              // Converted → tabs: BL Format (editable) / Original (read-only) / Both (live).
              return (
                <div className="editor-tabs-wrap">
                  <div className="editor-tabs" role="tablist">
                    <button className={viewTab === "bl" ? "active" : ""} onClick={() => setViewTab("bl")} role="tab">BL Format</button>
                    <button className={viewTab === "original" ? "active" : ""} onClick={() => setViewTab("original")} role="tab">Original</button>
                    <button className={viewTab === "both" ? "active" : ""} onClick={() => setViewTab("both")} role="tab">Both</button>
                  </div>
                  {viewTab === "bl" ? (
                    <label className="editor-field">
                      <span className="editor-field-label">Content (BL format — editable)</span>
                      <textarea rows={20} value={form.content}
                        onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                        className="content-textarea" />
                    </label>
                  ) : viewTab === "original" ? (
                    <div className="editor-field read-only">
                      <span className="editor-field-label">Original CCv2</span>
                      <pre className="content-view">{tpl!.ccv2Content!}</pre>
                    </div>
                  ) : (
                    <TwoPaneDiff
                      leftLabel="Original CCv2"
                      rightLabel="BL Format"
                      leftContent={tpl!.ccv2Content!}
                      rightContent={form.content}
                      className="editor-both-diff"
                    />
                  )}
                </div>
              );
            })()}

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
              <button className="import-btn" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                {importing ? "Importing…" : "Import Card"}
              </button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".png,.json"
                style={{ display: "none" }}
                onChange={handleImportFile}
              />
              <div className="library-search-wrapper">
                <input
                  type="text"
                  placeholder="Search name, tags, creator:…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="library-search-input"
                />
                {search ? (
                  <button className="clear-search-btn" onClick={() => setSearch("")}>✕</button>
                ) : null}
              </div>
            </div>

            {status ? <p className={`status-message ${status.startsWith("Imported") ? "" : "status-error"}`}>{status}</p> : null}

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
                        <CharacterAvatar template={latest} />
                        <div className="version-group-title">
                          <strong>{displayTitle(latest)}</strong>
                          {(() => {
                            const badge = cardBadgeLabel(latest);
                            if (badge === "ccv2") return <span className="ccv2-badge">CCv2</span>;
                            if (badge === "ccv2bl") return <span className="ccv2bl-badge">CCv2 / BL</span>;
                            return null;
                          })()}
                          <span className="version-badge">v{latest.cardVersion ?? String(latest.version)}</span>
                          {group.versions.length > 1 ? (
                            <span className="version-count">({group.versions.length} versions)</span>
                          ) : null}
                        </div>
                      </div>
                      {latest.creatorNotes?.trim() ? (
                        <p className="creator-notes-line">
                          <span className="creator-notes-label">Creator's Notes:</span> {latest.creatorNotes.trim()}
                        </p>
                      ) : null}
                      <p className="content-preview">{latest.summary?.trim() ? latest.summary.trim().slice(0, 100) : (latest.content.split("\n").find(l => l.trim() && !l.startsWith("["))?.trim().slice(0, 100) || "(empty)")}</p>
                      {(latest.tags ?? []).length > 0 ? (
                        <div className="tag-chips">
                          {(latest.tags ?? []).map((tag) => (
                            <button
                              key={tag}
                              type="button"
                              className={`tag-chip${search.trim().toLowerCase() === tag.toLowerCase() ? " active" : ""}`}
                              onClick={() => setSearch((s) => (s.trim().toLowerCase() === tag.toLowerCase() ? "" : tag))}
                            >
                              {tag}
                            </button>
                          ))}
                        </div>
                      ) : null}
                      <div className="version-group-actions">
                        {entryKind(latest) === "ccv2" ? (
                          <button
                            className="convert-btn"
                            onClick={() => handleConvert(latest)}
                            disabled={convertingId === latest.id && convertLoading}
                          >
                            {convertingId === latest.id && convertLoading ? "Converting…" : "Convert to BL"}
                          </button>
                        ) : null}
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

      {/* Diff comparison modal */}
      {diffData ? (
        diffData.readOnly ? (
          <DiffModal
            title="Compare: Original CCv2 vs Current BL"
            oldLabel="Original CCv2"
            newLabel="Current BL"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onClose={closeDiffModal}
            loading={false}
            error={null}
          />
        ) : (
          <DiffModal
            title="Convert to BL Format"
            oldLabel="Original CCv2"
            newLabel="Generated BL"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onAccept={handleConvertAccept}
            onRetry={handleConvertRetry}
            onClose={closeDiffModal}
            loading={convertLoading}
            error={convertError}
          />
        )
      ) : null}

      {/* Import notice modal */}
      {importNotice ? (
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setImportNotice(null); }}>
          <section className="modal import-notice-modal">
            <header className="modal-header">
              <h2>Already Imported</h2>
              <button onClick={() => setImportNotice(null)}>Close</button>
            </header>
            <p>{importNotice.message}</p>
            <div className="version-group" style={{ margin: "12px 0", padding: "12px", border: "1px solid var(--border-color, #333)", borderRadius: "6px" }}>
              <div className="version-group-header">
                <CharacterAvatar template={importNotice.existingRecord} />
                <div className="version-group-title">
                  <strong>{displayTitle(importNotice.existingRecord)}</strong>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setImportNotice(null)}>Dismiss</button>
              <button className="primary" onClick={() => {
                setImportNotice(null);
                openEdit(importNotice.existingRecord);
              }}>View / Edit</button>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}