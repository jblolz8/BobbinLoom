import { useEffect, useMemo, useState } from "react";
import { Badge, Icon } from "../base";
import type {
  ConnectionModelsResult,
  ConnectionTestResult,
  ProviderConnection,
  ProviderConnectionPayload,
  ProviderModelCapabilities,
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
import type { ProviderKind } from "../../../schemas";
import { ApiKeyField, type ApiKeyFieldProps } from "./providers/ApiKeyField";
import { ImageConnectionEditor } from "./providers/ImageConnectionEditor";
import {
  ProviderConnectionList,
  type ProviderSortBy,
  type SortDirection
} from "./providers/ProviderConnectionList";
import { TextConnectionEditor } from "./providers/TextConnectionEditor";

type EditorState =
  | { mode: "closed" }
  | { mode: "create" }
  | { mode: "edit"; connection: ProviderConnection };

type EditorStatus = { kind: "ok" | "err"; text: string } | null;

const SORT_BY_VALUES: ProviderSortBy[] = ["lastActiveAt", "label", "updatedAt", "createdAt"];

/**
 * Sort preferences are per kind: the two lists are user-visible side by side and
 * one shared key meant sorting the image list also re-sorted the text list.
 */
function sortStorageKey(kind: ProviderKind, which: "by" | "dir"): string {
  return `bobbinloom_provider_sort_${which}_${kind}`;
}

function readSortBy(kind: ProviderKind): ProviderSortBy {
  if (typeof window !== "undefined" && window.localStorage) {
    const saved = localStorage.getItem(sortStorageKey(kind, "by"));
    if (saved && (SORT_BY_VALUES as string[]).includes(saved)) {
      return saved as ProviderSortBy;
    }
  }
  return "lastActiveAt";
}

function readSortDir(kind: ProviderKind): SortDirection {
  if (typeof window !== "undefined" && window.localStorage) {
    const saved = localStorage.getItem(sortStorageKey(kind, "dir"));
    if (saved === "asc" || saved === "desc") {
      return saved;
    }
  }
  return "desc";
}

const emptyForm = (kind: ProviderKind): ProviderConnectionPayload =>
  kind === "image"
    ? {
        kind: "image",
        label: "", baseUrl: "", model: "", apiKey: "",
        apiStyle: "openai",
        safeMode: false,
        size: "auto",
        aspectRatio: "",
        promptProviderId: null,
        stylePreset: "",
        hideWatermark: false,
        variants: 1,
        temperature: 0.8, maxTokens: 1200, contextWindow: 32768
      }
    : {
        kind: "text",
        label: "", baseUrl: "", model: "", apiKey: "",
        temperature: 0.8, maxTokens: 1200, contextWindow: 32768
      };

/** Edit form seeded from a stored row. Image-only fields are carried so saving
 *  an image connection cannot silently drop them. */
const formFromConnection = (c: ProviderConnection): ProviderConnectionPayload =>
  c.kind === "image"
    ? {
        kind: "image",
        label: c.label, baseUrl: c.baseUrl, model: c.model, apiKey: "",
        apiStyle: c.apiStyle ?? "openai",
        safeMode: c.safeMode ?? false,
        size: c.size ?? "auto",
        aspectRatio: c.aspectRatio ?? "",
        promptProviderId: c.promptProviderId ?? null,
        stylePreset: c.stylePreset ?? "",
        hideWatermark: c.hideWatermark ?? false,
        variants: c.variants ?? 1,
        seed: c.seed,
        temperature: c.temperature, maxTokens: c.maxTokens, contextWindow: c.contextWindow
      }
    : {
        kind: "text",
        label: c.label, baseUrl: c.baseUrl, model: c.model, apiKey: "",
        temperature: c.temperature, maxTokens: c.maxTokens, contextWindow: c.contextWindow
      };

/**
 * Settings → Provider, both kinds. One container holds every request and every
 * piece of state (registry, editor mode, sort, probe statuses); the list and the
 * editors are presentational. `kind` selects which half of the registry is
 * listed, which slot the Active badge reads, and which editor opens.
 *
 * The parent mounts this with `key={kind}` so a tab switch remounts it: the
 * lazily-read sort preference is then the new kind's, and a half-filled editor
 * from the other kind cannot linger.
 */
export type ProviderConnectionsProps = { kind: ProviderKind };

export function ProviderConnections({ kind }: ProviderConnectionsProps) {
  const [registry, setRegistry] = useState<ProviderRegistry | null>(null);
  const [editor, setEditor] = useState<EditorState>({ mode: "closed" });
  const [form, setForm] = useState<ProviderConnectionPayload>(() => emptyForm(kind));
  const [showKey, setShowKey] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<EditorStatus>(null);
  const [test, setTest] = useState<EditorStatus>(null);
  const [models, setModels] = useState<string[]>([]);
  // Capabilities for the models in `models`, parsed server-side from the SAME
  // listing response — the editor never fires a second models request for them.
  const [modelSpecs, setModelSpecs] = useState<ProviderModelCapabilities>({});
  const [modelsStatus, setModelsStatus] = useState<EditorStatus>(null);
  const [fetchingModels, setFetchingModels] = useState(false);

  const [sortBy, setSortBy] = useState<ProviderSortBy>(() => readSortBy(kind));

  const [sortDir, setSortDir] = useState<SortDirection>(() => readSortDir(kind));

  // Covers a caller that swaps `kind` without remounting.
  useEffect(() => {
    setSortBy(readSortBy(kind));
    setSortDir(readSortDir(kind));
  }, [kind]);

  /** Connections of this kind only — never the other kind's rows. */
  const connections = useMemo(
    () => (registry?.connections ?? []).filter((c) => c.kind === kind),
    [registry, kind]
  );

  const textConnections = useMemo(
    () => (registry?.connections ?? []).filter((c) => c.kind === "text"),
    [registry]
  );

  const activeId = (kind === "text" ? registry?.activeTextProviderId : registry?.activeImageProviderId) ?? "";

  function handleSortByChange(newSortBy: ProviderSortBy) {
    setSortBy(newSortBy);
    const nextDir: SortDirection = newSortBy === "label" ? "asc" : "desc";
    setSortDir(nextDir);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(sortStorageKey(kind, "by"), newSortBy);
      localStorage.setItem(sortStorageKey(kind, "dir"), nextDir);
    }
  }

  function handleToggleSortDir() {
    const nextDir: SortDirection = sortDir === "asc" ? "desc" : "asc";
    setSortDir(nextDir);
    if (typeof window !== "undefined" && window.localStorage) {
      localStorage.setItem(sortStorageKey(kind, "dir"), nextDir);
    }
  }

  const sortedConnections = useMemo(() => {
    const list = [...connections];
    return list.sort((a, b) => {
      let cmp = 0;
      if (sortBy === "label") {
        cmp = a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
      } else if (sortBy === "lastActiveAt") {
        const isAActive = a.id === activeId;
        const isBActive = b.id === activeId;
        const timeA = a.lastActiveAt ? new Date(a.lastActiveAt).getTime() : (isAActive ? 1 : 0);
        const timeB = b.lastActiveAt ? new Date(b.lastActiveAt).getTime() : (isBActive ? 1 : 0);
        cmp = timeA - timeB;
        if (cmp === 0) {
          cmp = a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
        }
      } else if (sortBy === "updatedAt") {
        const timeA = a.updatedAt ? new Date(a.updatedAt).getTime() : (a.createdAt ? new Date(a.createdAt).getTime() : 0);
        const timeB = b.updatedAt ? new Date(b.updatedAt).getTime() : (b.createdAt ? new Date(b.createdAt).getTime() : 0);
        cmp = timeA - timeB;
        if (cmp === 0) {
          cmp = a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
        }
      } else if (sortBy === "createdAt") {
        const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
        const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
        cmp = timeA - timeB;
        if (cmp === 0) {
          cmp = a.label.localeCompare(b.label, undefined, { sensitivity: "base", numeric: true });
        }
      }
      return sortDir === "asc" ? cmp : -cmp;
    });
  }, [connections, activeId, sortBy, sortDir]);

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
    setForm(emptyForm(kind));
    setModels([]); setModelSpecs({}); setModelsStatus(null);
    setShowKey(false);
    setStatus(null); setTest(null);
    setEditor({ mode: "create" });
  }

  function openEdit(c: ProviderConnection) {
    setForm(formFromConnection(c));
    setModels([]); setModelSpecs({}); setModelsStatus(null);
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
      // Image endpoints expose their own model family; asking for it keeps the
      // listing (and the ids you can paste into Model) image-only.
      const r: ConnectionModelsResult = await fetchProviderModels(
        kind === "image" ? { ...target, type: "image" } : target
      );
      setModels(r.models);
      // Capabilities ride along with the ids (same response). A server that
      // predates the field, or a listing with no specs, simply yields {} —
      // the editor shows no block rather than an error.
      setModelSpecs(r.modelSpecs ?? {});
      // Image endpoints frequently expose no /models listing at all. Keep the
      // server's message (a 401 must stay visible) and add why it is not fatal.
      const imageHint = kind === "image"
        ? " Image endpoints often do not list models — type the model id instead."
        : "";
      setModelsStatus(r.ok
        ? { kind: "ok", text: r.models.length ? `${r.models.length} model${r.models.length === 1 ? "" : "s"} loaded.` : `Connected, but the server returned no models.${imageHint}` }
        : { kind: "err", text: r.message ? `Failed (${r.status ?? ""}): ${r.message}${imageHint}` : `Failed to load models.${imageHint}` });
    } catch (err) {
      setModels([]);
      setModelSpecs({});
      setModelsStatus({ kind: "err", text: err instanceof Error ? err.message : String(err) });
    } finally {
      setFetchingModels(false);
    }
  }

  /** Empty image-only strings are dropped rather than stored as "". */
  function toPayload(current: ProviderConnectionPayload): ProviderConnectionPayload {
    if (current.kind !== "image") return { ...current };
    return {
      ...current,
      aspectRatio: current.aspectRatio?.trim() ? current.aspectRatio.trim() : undefined,
      stylePreset: current.stylePreset?.trim() ? current.stylePreset.trim() : undefined
    };
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true); setStatus(null); setTest(null);
    const payload: ProviderConnectionPayload = toPayload(form);
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
    try {
      // Activation answers with the whole registry, so no follow-up reload.
      const r = await setActiveProviderConnection(id);
      setRegistry(r);
    }
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
  const editing = editor.mode === "edit" ? editor.connection : null;
  const isKeyCleared = form.apiKey === null;
  const isStoredKeyActive = editor.mode === "edit" && editor.connection.hasApiKey && !isKeyCleared;

  const apiKeyProps: ApiKeyFieldProps = {
    value: form.apiKey,
    onChange: (value) => setForm((f) => ({ ...f, apiKey: value })),
    showKey,
    onToggleShowKey: toggleShowKey,
    keyBusy,
    isKeyCleared,
    isStoredKeyActive,
    onClearKey: clearKey,
    onRestoreKey: restoreKey
  };

  /** Image rows carry their endpoint dialect, its safety setting, and a warning
   *  when the connection's prompt writer no longer exists. */
  function renderKindTags(c: ProviderConnection) {
    if (kind !== "image") return null;
    const style = c.apiStyle ?? "openai";
    const promptWriterMissing = !!c.promptProviderId && !textConnections.some((t) => t.id === c.promptProviderId);
    return (
      <>
        <Badge
          className="conn-tag style-tag"
          leftIcon={<Icon name="Palette" size={13} />}
          title={style === "venice" ? "Venice endpoint (/image/generate)" : "OpenAI-compatible endpoint (/images/generations)"}
        >
          {style === "venice" ? "Venice" : "OpenAI"}
        </Badge>
        <Badge
          className={`conn-tag ${c.safeMode ? "safe-on" : "safe-off"}`}
          leftIcon={c.safeMode ? <Icon name="ShieldAlert" size={13} /> : <Icon name="ShieldOff" size={13} />}
          title={c.safeMode ? "Safe mode on — the provider blurs adult content" : "Safe mode off — adult content is not blurred"}
        >
          {c.safeMode ? "Safe mode on" : "Safe mode off"}
        </Badge>
        {promptWriterMissing && (
          <Badge
            className="conn-tag warn-tag"
            leftIcon={<Icon name="AlertTriangle" size={13} />}
            title={`Prompt writer "${c.promptProviderId}" no longer exists — the active text provider writes the prompt instead`}
          >
            prompt writer missing — using active
          </Badge>
        )}
      </>
    );
  }

  const emptyLabel = kind === "image"
    ? "No image providers yet. Add one to generate images for an assistant message."
    : "No connections yet. Add one to start generating.";

  return (
    <div className="connections">
      {status && <p className={`conn-status ${status.kind}`}>{status.text}</p>}
      {registry && registry.warnings.length > 0 && (
        <div className="conn-warnings">
          {registry.warnings.map((w, i) => <p key={i}>{w}</p>)}
        </div>
      )}

      {!editable && (
        <ProviderConnectionList
          connections={sortedConnections}
          activeId={activeId}
          sortBy={sortBy}
          sortDir={sortDir}
          onSortByChange={handleSortByChange}
          onToggleSortDir={handleToggleSortDir}
          onActivate={(id) => void activate(id)}
          onEdit={openEdit}
          onDuplicate={(id) => void duplicate(id)}
          onRemove={(c) => void confirmRemove(c)}
          onAdd={openCreate}
          emptyLabel={emptyLabel}
          renderTags={renderKindTags}
        />
      )}

      {editable && (kind === "image" ? (
        <ImageConnectionEditor
          mode={editor.mode === "create" ? "create" : "edit"}
          editing={editing}
          form={form}
          setForm={setForm}
          apiKey={apiKeyProps}
          models={models}
          modelSpecs={modelSpecs}
          modelsStatus={modelsStatus}
          fetchingModels={fetchingModels}
          onFetchModels={() => void loadModels(probeTarget())}
          testStatus={test}
          busy={busy}
          onSubmit={save}
          onTest={(e) => void testCurrent(e)}
          onCancel={closeEditor}
          onDelete={() => { if (editor.mode === "edit") void confirmRemove(editor.connection); }}
          textConnections={textConnections}
        />
      ) : (
        <TextConnectionEditor
          mode={editor.mode === "create" ? "create" : "edit"}
          editing={editing}
          form={form}
          setForm={setForm}
          apiKey={apiKeyProps}
          models={models}
          modelsStatus={modelsStatus}
          fetchingModels={fetchingModels}
          onFetchModels={() => void loadModels(probeTarget())}
          testStatus={test}
          busy={busy}
          onSubmit={save}
          onTest={(e) => void testCurrent(e)}
          onCancel={closeEditor}
          onDelete={() => { if (editor.mode === "edit") void confirmRemove(editor.connection); }}
        />
      ))}
    </div>
  );
}
