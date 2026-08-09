import { useEffect, useState } from "react";
import { TextInput } from "../common/TextInput";
import { Icon } from "../common/Icon";
import type {
  ConnectionModelsResult,
  ConnectionTestResult,
  ProviderConnection,
  ProviderConnectionPayload,
  ProviderRegistry
} from "../../api";
import {
  createProviderConnection,
  deleteProviderConnection,
  duplicateProviderConnection,
  fetchProviderModels,
  getProviderApiKey,
  listProviderConnections,
  setActiveProviderConnection,
  testProviderConnection,
  updateProviderConnection
} from "../../api";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; connection: ProviderConnection };

const emptyForm = (): ProviderConnectionPayload => ({
  label: "", baseUrl: "", model: "", apiKey: "",
  temperature: 0.8, maxTokens: 1200, contextWindow: 32768
});

export function ProviderConnections() {
  const [registry, setRegistry] = useState<ProviderRegistry | null>(null);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [form, setForm] = useState<ProviderConnectionPayload>(emptyForm());
  const [showKey, setShowKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [test, setTest] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [models, setModels] = useState<string[]>([]);
  const [modelsStatus, setModelsStatus] = useState<{ kind: "ok" | "err"; text: string } | null>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  useEffect(() => {
    listProviderConnections().then(setRegistry).catch((e) =>
      setStatus({ kind: "err", text: e instanceof Error ? e.message : String(e) }));
  }, []);

  async function reload() {
    const r = await listProviderConnections();
    setRegistry(r);
    return r;
  }

  function openCreate() {
    setForm(emptyForm());
    setModels([]); setModelsStatus(null);
    setShowKey(false);
    setStatus(null); setTest(null);
    setEditor({ mode: "create" });
  }

  function openEdit(c: ProviderConnection) {
    setForm({
      label: c.label, baseUrl: c.baseUrl, model: c.model, apiKey: "",
      temperature: c.temperature, maxTokens: c.maxTokens, contextWindow: c.contextWindow
    });
    setModels([]); setModelsStatus(null);
    setShowKey(false); setStatus(null); setTest(null);
    setEditor({ mode: "edit", connection: c });
    void loadModels({ id: c.id });

    if (c.hasApiKey) {
      setKeyBusy(true);
      getProviderApiKey(c.id)
        .then(({ apiKey }) => {
          setForm((f) => ({ ...f, apiKey }));
        })
        .catch((err) => {
          setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
        })
        .finally(() => {
          setKeyBusy(false);
        });
    }
  }

  function closeEditor() { setEditor({ mode: "closed" }); }

  function probeTarget(): { id?: string; baseUrl?: string; apiKey?: string } {
    if (editor.mode === "edit") {
      const baseUrlChanged = form.baseUrl.trim() !== editor.connection.baseUrl;
      const apiKeyChanged = form.apiKey !== undefined && form.apiKey !== "";
      if (baseUrlChanged || apiKeyChanged) {
        return {
          baseUrl: form.baseUrl.trim(),
          apiKey: form.apiKey !== null ? form.apiKey : undefined
        };
      }
      return { id: editor.connection.id };
    }
    return { baseUrl: form.baseUrl.trim(), apiKey: form.apiKey ? form.apiKey : undefined };
  }

  async function loadModels(target: { id?: string; baseUrl?: string; apiKey?: string }) {
    if (fetchingModels) return;
    setFetchingModels(true);
    setModelsStatus(null);
    try {
      const r: ConnectionModelsResult = await fetchProviderModels(target);
      setModels(r.models);
      setModelsStatus(r.ok
        ? { kind: "ok", text: r.models.length ? `${r.models.length} model${r.models.length === 1 ? "" : "s"} loaded.` : "Connected, but the server returned no models." }
        : { kind: "err", text: r.message ? `Failed (${r.status ?? ""}): ${r.message}` : "Failed to load models." });
    } catch (err) {
      setModels([]);
      setModelsStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setFetchingModels(false);
    }
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setStatus(null); setTest(null);
    const payload: ProviderConnectionPayload = { ...form };
    try {
      if (editor.mode === "edit") {
        const p = editor.connection;
        await updateProviderConnection(p.id, payload);
        setStatus({ kind: "ok", text: "Saved." });
      } else {
        await createProviderConnection(payload);
        setStatus({ kind: "ok", text: "Provider created." });
      }
      const r = await reload();
      if (editor.mode === "edit" && r.connections.length) {
        const fresh = r.connections.find((c) => c.id === editor.connection.id);
        if (fresh) setEditor({ mode: "edit", connection: fresh });
      } else {
        closeEditor();
      }
    } catch (err) {
      setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setBusy(false);
    }
  }

  async function testCurrent(e: React.MouseEvent) {
    e.preventDefault();
    setTest(null);
    const target = probeTarget();
    if (!target.id && !target.baseUrl?.trim()) return;
    setTest({ kind: "ok", text: "Testing…" });
    try {
      const r: ConnectionTestResult = await testProviderConnection(target);
      setTest(r.ok
        ? { kind: "ok", text: `Connected (${r.latencyMs ?? "?"}ms).` }
        : { kind: "err", text: r.message ? `Failed (${r.status ?? ""}): ${r.message}` : "Connection failed." });
      if (r.ok) void loadModels(target);
    } catch (err) {
      setTest({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    }
  }

  async function activate(id: string) {
    setStatus(null);
    try { await setActiveProviderConnection(id); await reload(); }
    catch (err) { setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) }); }
  }

  async function duplicate(id: string) {
    setStatus(null);
    try {
      const created = await duplicateProviderConnection(id);
      const r = await reload();
      const fresh = r.connections.find((x) => x.id === created.id);
      setStatus({ kind: "ok", text: `Duplicated as "${created.label}".` });
      if (fresh) openEdit(fresh);
    } catch (err) { setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) }); }
  }

  async function confirmRemove(c: ProviderConnection) {
    if (!window.confirm(`Delete connection "${c.label}"? This cannot be undone.`)) return;
    setStatus(null);
    try {
      const r = await deleteProviderConnection(c.id);
      setRegistry(r);
      if (editor.mode === "edit" && editor.connection.id === c.id) closeEditor();
      setStatus({ kind: "ok", text: `Deleted "${c.label}".` });
    } catch (err) { setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) }); }
  }

  function clearKey() {
    setForm((f) => ({ ...f, apiKey: null }));
    setShowKey(false);
  }

  function restoreKey() {
    if (editor.mode !== "edit" || !editor.connection.hasApiKey) return;
    setKeyBusy(true);
    getProviderApiKey(editor.connection.id)
      .then(({ apiKey }) => {
        setForm((f) => ({ ...f, apiKey }));
      })
      .catch((err) => {
        setStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
      })
      .finally(() => {
        setKeyBusy(false);
      });
  }

  function toggleShowKey() {
    setShowKey((s) => !s);
  }

  const editable = editor.mode !== "closed";
  const isKeyCleared = form.apiKey === null;
  const isStoredKeyActive = editor.mode === "edit" && editor.connection.hasApiKey && !isKeyCleared;

  return (
    <div className="connections">
      {status && <p className={`conn-status ${status.kind}`}>{status.text}</p>}
      {registry && registry.warnings.length > 0 && (
        <div className="conn-warnings">
          {registry.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}
      {!editable && (
        <>
          <div className="conn-list">
            {(registry?.connections ?? []).length === 0 ? (
              <p className="conn-empty">No connections yet. Add one to start generating.</p>
            ) : (registry?.connections ?? []).map((c) => {
              const isActive = c.id === registry?.activeProviderId;
              return (
                <div key={c.id} className={`conn-card ${isActive ? "active" : ""}`}>
                  <div className="conn-card-body">
                    <div className="conn-card-header">
                      <div className="conn-title-group">
                        <span className="conn-name">{c.label}</span>
                        {isActive && <span className="conn-badge active">Active</span>}
                      </div>
                      <div className="conn-actions">
                        <button
                          type="button"
                          className="primary-btn"
                          onClick={() => activate(c.id)}
                          disabled={isActive}
                          title={isActive ? "Active connection" : "Activate connection"}
                        >
                          <span className="btn-label">{isActive ? "Active" : "Activate"}</span>
                          <span className="btn-icon">{isActive ? <Icon name="Check" size={14} /> : <Icon name="Zap" size={14} />}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openEdit(c)}
                          title="Edit connection"
                        >
                          <span className="btn-label">Edit</span>
                          <span className="btn-icon"><Icon name="Pencil" size={14} /></span>
                        </button>
                        <button
                          type="button"
                          onClick={() => duplicate(c.id)}
                          title="Duplicate connection"
                        >
                          <span className="btn-label">Duplicate</span>
                          <span className="btn-icon"><Icon name="Copy" size={14} /></span>
                        </button>
                        <button
                          type="button"
                          className="danger"
                          onClick={() => confirmRemove(c)}
                          title="Delete connection"
                        >
                          <span className="btn-label">Delete</span>
                          <span className="btn-icon"><Icon name="Trash2" size={14} /></span>
                        </button>
                      </div>
                    </div>
                    <div className="conn-tags">
                      <span className="conn-tag" title={`Base URL: ${c.baseUrl}`}>
                        <span className="tag-icon"><Icon name="Globe" size={13} className="text-slate-400" /></span> {c.baseUrl}
                      </span>
                      <span className="conn-tag" title={`Model: ${c.model}`}>
                        <span className="tag-icon"><Icon name="Zap" size={13} className="text-amber-400" /></span> {c.model}
                      </span>
                      <span className={`conn-tag ${c.hasApiKey ? "has-key" : "no-key"}`}>
                        <span className="tag-icon">
                          {c.hasApiKey ? <Icon name="KeyRound" size={13} className="text-lime-400" /> : <Icon name="LockKeyholeOpen" size={13} className="text-slate-500" />}
                        </span>{" "}
                        {c.hasApiKey ? c.apiKeyMasked : "No key"}
                      </span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <button className="conn-add flex items-center justify-center gap-1.5" onClick={openCreate}>
            <Icon name="Plus" size={16} /> Add connection
          </button>
        </>
      )}

      {editable && (
        <form className="conn-editor conn-editor-card" onSubmit={save}>
          <div className="conn-editor-header">
            <h4>{editor.mode === "create" ? "New Provider Connection" : `Edit: ${editor.connection.label}`}</h4>
          </div>

          <div className="conn-section">
            <h5 className="conn-section-title">Connection Basics</h5>
            <div className="conn-fields-group">
              <TextInput
                label="Name"
                value={form.label}
                onChange={(e) => setForm((f) => ({ ...f, label: e.target.value }))}
                placeholder="e.g. Local LM Studio"
              />

              <TextInput
                label="Base URL"
                value={form.baseUrl}
                onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                placeholder="http://localhost:1234/v1"
              />

              <div>
                <TextInput
                  label="API Key"
                  type={showKey ? "text" : "password"}
                  value={form.apiKey ?? ""}
                  onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                  placeholder={isKeyCleared ? "Key will be cleared on Save" : "Enter API key"}
                  rightElement={
                    <button type="button" className="btn-secondary" onClick={toggleShowKey} disabled={keyBusy}>
                      {keyBusy ? "…" : showKey ? "Hide" : "Show"}
                    </button>
                  }
                />
                {isKeyCleared ? (
                  <p className="conn-status err" style={{ marginTop: "0.25rem", fontSize: "0.8rem" }}>
                    Stored key will be cleared when saved.{" "}
                    <button type="button" className="link" onClick={restoreKey}>Undo</button>
                  </p>
                ) : isStoredKeyActive ? (
                  <button type="button" className="link" onClick={clearKey}>Clear stored key</button>
                ) : null}
              </div>
            </div>
          </div>

          <div className="conn-section">
            <h5 className="conn-section-title">Model Configuration</h5>
            <div className="conn-fields-group">
              <div>
                <TextInput
                  label="Model ID"
                  value={form.model}
                  onChange={(e) => setForm((f) => ({ ...f, model: e.target.value }))}
                  placeholder="e.g. llama-3"
                  rightElement={
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={() => void loadModels(probeTarget())}
                      disabled={fetchingModels || busy || (editor.mode !== "edit" && !form.baseUrl.trim())}
                    >
                      {fetchingModels ? "Loading…" : "Fetch models"}
                    </button>
                  }
                />
                {models.length > 0 && (
                  <label className="form-field" style={{ marginTop: "0.5rem" }}>
                    <span className="field-label-text">Select from Fetched Models ({models.length} available)</span>
                    <select
                      className="form-input form-select"
                      value={models.includes(form.model) ? form.model : ""}
                      onChange={(e) => {
                        if (e.target.value) {
                          setForm((f) => ({ ...f, model: e.target.value }));
                        }
                      }}
                    >
                      <option value="" disabled>-- Select a fetched model --</option>
                      {models.map((m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                {modelsStatus && <p className={`conn-status ${modelsStatus.kind}`}>{modelsStatus.text}</p>}
              </div>
            </div>
          </div>

          <div className="conn-section">
            <h5 className="conn-section-title">Generation Parameters</h5>
            <div className="settings-grid-3">
              <TextInput
                label="Temperature"
                type="number"
                step="0.1"
                value={form.temperature}
                onChange={(e) => setForm((f) => ({ ...f, temperature: Number(e.target.value) }))}
              />
              <TextInput
                label="Max Tokens"
                type="number"
                value={form.maxTokens}
                onChange={(e) => setForm((f) => ({ ...f, maxTokens: Number(e.target.value) }))}
              />
              <TextInput
                label="Context Window"
                type="number"
                value={form.contextWindow}
                onChange={(e) => setForm((f) => ({ ...f, contextWindow: Number(e.target.value) }))}
              />
            </div>
          </div>

          {test && <p className={`conn-status ${test.kind}`}>{test.text}</p>}
          <div className="settings-actions conn-actions-bar">
            <div className="actions-left">
              <button type="submit" className="primary-btn flex items-center gap-1.5" disabled={busy}>
                <Icon name="Save" size={14} /> {busy ? "Saving…" : "Save"}
              </button>
              <button type="button" className="btn-secondary flex items-center gap-1.5" onClick={(e) => void testCurrent(e)} disabled={busy}>
                <Icon name="Activity" size={14} /> Test connection
              </button>
              <button type="button" className="btn-ghost flex items-center gap-1.5" onClick={closeEditor}>
                <Icon name="X" size={14} /> Cancel
              </button>
            </div>
            {editor.mode === "edit" && (
              <button type="button" className="danger flex items-center gap-1.5" onClick={() => { if (editor.mode === "edit") void confirmRemove(editor.connection); }}>
                <Icon name="Trash2" size={14} /> Delete
              </button>
            )}
          </div>
        </form>
      )}
    </div>
  );
}
