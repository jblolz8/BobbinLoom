import { useEffect, useRef, useState, type ReactNode } from "react";
import type { LorebookEntry, LorebookFile, LorebookSummary } from "../../../schemas";
import { Icon, Button, SearchBar, TextArea, TextInput, SimpleSelect, Checkbox, Badge } from "../base";
import { ConfirmModal } from "../common/ConfirmModal";
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
  onClose?: () => void;
  onLorebooksChanged?: () => void;
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

/** Collapsible heading + body used to group the entry-editor sidebar fields. */
function SidebarSection({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="lorebook-sidebar-section">
      <button
        type="button"
        className={`lorebook-sidebar-section-head ${open ? "is-open" : ""}`}
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
      >
        <span>{title}</span>
        <Icon name={open ? "ChevronDown" : "ChevronRight"} size={13} />
      </button>
      {open ? <div className="lorebook-sidebar-section-body">{children}</div> : null}
    </div>
  );
}

/** Minimal badge shown on an entry list row. */
function entryStateBadges(entry: LorebookEntry): ReactNode {
  const badges: ReactNode[] = [];
  if (entry.constant) {
    badges.push(<Badge key="constant" variant="info" size="xs" pill leftIcon={<Icon name="Zap" size={10} />}>Constant</Badge>);
  }
  if (entry.disable) {
    badges.push(<Badge key="disable" variant="outline" size="xs" pill>Disabled</Badge>);
  }
  return badges.length ? <span className="entry-state-badges">{badges}</span> : null;
}

export function LorebookLibrary({ isModal, onClose, onLorebooksChanged }: LorebookLibraryProps) {
  const [summaries, setSummaries] = useState<LorebookSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lorebook, setLorebook] = useState<LorebookFile | null>(null);
  const [editingUid, setEditingUid] = useState<number | null>(null);
  const [entryForm, setEntryForm] = useState<LorebookEntry | null>(null);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{ text: string; isError: boolean } | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState<{ kind: "lorebook"; id: string; name: string } | { kind: "entry"; uid: number } | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState<{ onConfirm: () => void; onCancel: () => void; title: string; message: string } | null>(null);
  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
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
    if (editingUid !== null && hasUnsavedEntryEdit()) {
      setDiscardConfirm({
        title: "Discard unsaved entry edits?",
        message: "You have unsaved changes to an entry. Switching lorebooks will discard them.",
        onConfirm: async () => {
          setDiscardConfirm(null);
          setEditingUid(null);
          setEntryForm(null);
          try {
            const lb = await getLorebook(id);
            setLorebook(lb);
            setSelectedId(id);
            setStatus(null);
          } catch (e) {
            setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
          }
        },
        onCancel: () => setDiscardConfirm(null),
      });
      return;
    }
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

  async function handleCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createLorebook(trimmed);
      await refresh();
      setStatus({ text: `"${trimmed}" created.`, isError: false });
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
    }
  }

  function renderCreateConfirm() {
    if (!creating) return null;
    const canSubmit = createName.trim().length > 0 && !saving;
    return (
      <ConfirmModal
        title="New Lorebook"
        message="Create an empty lorebook to start adding World Info entries, or import a SillyTavern .json later."
        confirmLabel={saving ? "Creating…" : "Create"}
        confirmDisabled={!canSubmit}
        isLoading={saving}
        maxWidth={480}
        onCancel={() => {
          setCreating(false);
          setCreateName("");
        }}
        onConfirm={async () => {
          const name = createName.trim();
          if (!name) return;
          setCreating(false);
          setCreateName("");
          await handleCreate(name);
        }}
      >
        <div className="modal-form-fields">
          <TextInput
            label="Lorebook name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Kanto Region Lore"
            disabled={saving}
            autoFocus
          />
        </div>
      </ConfirmModal>
    );
  }

  async function handleDelete(id: string, name: string) {
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

  function hasUnsavedEntryEdit(): boolean {
    if (entryForm === null || editingUid === null || !lorebook) return false;
    const stored = lorebook.entries[String(editingUid)];
    if (!stored) return true;
    return (
      entryForm.key.join("\n") !== stored.key.join("\n") ||
      entryForm.keysecondary.join("\n") !== stored.keysecondary.join("\n") ||
      entryForm.content !== stored.content ||
      entryForm.comment !== stored.comment ||
      entryForm.constant !== stored.constant ||
      entryForm.disable !== stored.disable ||
      entryForm.selective !== stored.selective ||
      entryForm.selectiveLogic !== stored.selectiveLogic ||
      entryForm.caseSensitive !== stored.caseSensitive ||
      entryForm.matchWholeWords !== stored.matchWholeWords ||
      entryForm.useRegex !== stored.useRegex ||
      entryForm.order !== stored.order ||
      entryForm.position !== stored.position ||
      entryForm.depth !== stored.depth ||
      entryForm.scanDepth !== stored.scanDepth ||
      entryForm.sticky !== stored.sticky ||
      entryForm.cooldown !== stored.cooldown ||
      entryForm.delay !== stored.delay ||
      entryForm.probability !== stored.probability ||
      entryForm.useProbability !== stored.useProbability ||
      entryForm.group !== stored.group ||
      entryForm.groupWeight !== stored.groupWeight ||
      entryForm.preventRecursion !== stored.preventRecursion ||
      entryForm.excludeRecursion !== stored.excludeRecursion ||
      entryForm.delayUntilRecursion !== stored.delayUntilRecursion
    );
  }

  function handleCloseEntryEditor() {
    if (hasUnsavedEntryEdit()) {
      setDiscardConfirm({
        title: "Discard unsaved entry edits?",
        message: "Any changes you made to this entry will be lost.",
        onConfirm: () => {
          setDiscardConfirm(null);
          closeEntryEditor();
        },
        onCancel: () => setDiscardConfirm(null),
      });
      return;
    }
    closeEntryEditor();
  }

  async function handleSaveEntry() {
    if (!lorebook || !entryForm || !selectedId) return;
    setSaving(true);
    try {
      const updated: LorebookFile = {
        ...lorebook,
        entries: { ...lorebook.entries, [String(entryForm.uid)]: entryForm },
      };
      // NOTE: onLorebooksChanged triggers a full re-fetch of the lorebook summary
      // in App.tsx. The active editor's local `lorebook` state is set to `updated`
      // below BEFORE the callback fires, so the re-fetch reads back the same data.
      // If a second editor for the same lorebook were ever open simultaneously,
      // the re-fetch would clobber it — guard against that before allowing
      // concurrent editors.
      await saveLorebook(selectedId, updated);
      setLorebook(updated);
      setStatus({ text: "Entry saved.", isError: false });
      onLorebooksChanged?.();
      closeEntryEditor();
    } catch (e) {
      setStatus({ text: e instanceof Error ? e.message : String(e), isError: true });
    } finally {
      setSaving(false);
    }
  }

  function handleDeleteEntry(uid: number) {
    if (!lorebook) return;
    const updated = { ...lorebook.entries };
    delete updated[String(uid)];
    setLorebook({ ...lorebook, entries: updated });
    if (editingUid === uid) closeEntryEditor();
  }

  function renderDeleteConfirm() {
    if (!deleteConfirm) return null;
    const isLorebook = deleteConfirm.kind === "lorebook";
    return (
      <ConfirmModal
        title={isLorebook ? `Delete "${deleteConfirm.name}"?` : "Delete this entry?"}
        message={
          isLorebook
            ? "This will permanently remove the lorebook and all of its entries. This cannot be undone."
            : "The entry will be removed from this lorebook. This cannot be undone."
        }
        confirmLabel="Delete"
        cancelLabel="Cancel"
        danger
        onCancel={() => setDeleteConfirm(null)}
        onConfirm={async () => {
          if (isLorebook) {
            await handleDelete(deleteConfirm.id, deleteConfirm.name);
          } else {
            handleDeleteEntry(deleteConfirm.uid);
          }
          setDeleteConfirm(null);
        }}
      />
    );
  }

  function renderDiscardConfirm() {
    if (!discardConfirm) return null;
    return (
      <ConfirmModal
        title={discardConfirm.title}
        message={discardConfirm.message}
        confirmLabel="Discard"
        cancelLabel="Cancel"
        onCancel={discardConfirm.onCancel}
        onConfirm={discardConfirm.onConfirm}
      />
    );
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

  const entryListPanel = (
    <div className="lorebook-entry-list">
      <div className="lorebook-entry-list-header">
        <SearchBar
          value={searchTerm}
          onChange={setSearchTerm}
          placeholder="Search entries…"
          size="sm"
        />
        <Button variant="primary" size="sm" leftIcon={<Icon name="Plus" size={14} />} onClick={openNewEntry} disabled={saving}>
          Add Entry
        </Button>
      </div>
      {filteredEntries.length === 0 ? (
        <p className="lorebook-empty">No entries. Click "+ Add Entry" to create one, or import from a SillyTavern World Info file.</p>
      ) : (
        <ul className="lorebook-entry-rows">
          {filteredEntries.map((entry) => (
            <li
              key={entry.uid}
              className={`lorebook-entry-row ${entry.uid === editingUid ? "selected" : ""} ${entry.disable ? "disabled" : ""}`}
              onClick={() => openEditEntry(entry)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  openEditEntry(entry);
                }
              }}
            >
              <div className="entry-row-top">
                <span className="entry-uid">#{entry.uid}</span>
                <span className="entry-label">
                  {entry.key.slice(0, 3).join(", ") || "(no keys)"}
                </span>
                {entryStateBadges(entry)}
              </div>
              <span className="entry-preview">{entry.content.slice(0, 60)}{entry.content.length > 60 ? "…" : ""}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );

  if (selectedId && lorebook && !editingUid) {
    return (
      <>
        <div className={`lorebook-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
          {isModal ? (
            <div className="global-scope-badge" title="Edits modify global lorebook templates">
              🌐 Global Lorebooks
            </div>
          ) : null}

        <div className="lorebook-editor-subhead">
          <h3>Lorebook: {lorebook.name} ({Object.keys(lorebook.entries).length} entries)</h3>
          <div className="modal-header-actions">
            <Button variant="primary" size="sm" onClick={handleSaveLorebook} disabled={saving} isLoading={saving}>
              {saving ? "Saving…" : "Save Lorebook"}
            </Button>
            <Button variant="secondary" size="sm" onClick={handleExport}>Export</Button>
            <Button variant="ghost" size="sm" onClick={handleCloseEntryEditor}>Back to List</Button>
          </div>
        </div>

        {status ? (
          <div style={{ marginBottom: "8px" }}>
            {status.isError ? (
              <Badge variant="danger" leftIcon={<Icon name="AlertCircle" size={13} />}>{status.text}</Badge>
            ) : (
              <Badge variant="success" leftIcon={<Icon name="Check" size={13} />}>{status.text}</Badge>
            )}
          </div>
        ) : null}

        <div className="lorebook-settings-bar">
          <div className="lorebook-settings-name">
            <TextInput
              label="Name"
              value={lorebook.name}
              onChange={(e) => setLorebook({ ...lorebook, name: e.target.value })}
              size="sm"
              placeholder="Lorebook name"
            />
          </div>
          <div className="lorebook-settings-scan">
            <TextInput
              label="Scan Depth"
              type="number"
              min={0}
              max={1000}
              value={lorebook.scanDepth ?? 2}
              onChange={(e) => setLorebook({ ...lorebook, scanDepth: Number(e.target.value) || 2 })}
              size="sm"
              title="How many messages back the engine scans for keyword matches."
            />
          </div>
          <div className="lorebook-settings-toggles">
            <Checkbox
              label="Case Sensitive"
              checked={lorebook.caseSensitive ?? false}
              onChange={(e) => setLorebook({ ...lorebook, caseSensitive: e.target.checked })}
              description="Keyword matching respects letter case for this lorebook."
            />
            <Checkbox
              label="Whole Words"
              checked={lorebook.matchWholeWords ?? false}
              onChange={(e) => setLorebook({ ...lorebook, matchWholeWords: e.target.checked })}
              description="Keywords must match whole words, not substrings."
            />
          </div>
        </div>

        <div className="lorebook-master-detail">
          {entryListPanel}

          <div className="lorebook-entry-editor-placeholder">
            <p>Select an entry from the list to edit it, or click "+ Add Entry".</p>
          </div>
        </div>
      </div>
        {renderDeleteConfirm()}
        {renderDiscardConfirm()}
      </>
    );
  }

  if (selectedId && lorebook && editingUid && entryForm) {
    return (
      <>
        <div className={`lorebook-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
          <div className="lorebook-editor-subhead">
            <h3>{lorebook.name} — Editing Entry #{entryForm.uid}</h3>
            <div className="modal-header-actions">
              <Button variant="primary" size="sm" onClick={handleSaveEntry} disabled={saving} isLoading={saving}>
                Save Entry
              </Button>
              <Button variant="secondary" size="sm" onClick={handleExport}>Export</Button>
              <Button variant="ghost" size="sm" onClick={handleCloseEntryEditor}>Back to List</Button>
            </div>
          </div>

          {status ? (
            <div style={{ marginBottom: "8px" }}>
              {status.isError ? (
                <Badge variant="danger" leftIcon={<Icon name="AlertCircle" size={13} />}>{status.text}</Badge>
              ) : (
                <Badge variant="success" leftIcon={<Icon name="Check" size={13} />}>{status.text}</Badge>
              )}
            </div>
          ) : null}

          <div className="lorebook-master-detail">
            {entryListPanel}

        <div className="lorebook-entry-editor">
          <div className="lorebook-entry-editor-main">
            <TextArea
              label="Keys (one per line)"
              value={entryForm.key.join("\n")}
              onChange={(e) => entryFormField("key", e.target.value.split("\n").filter(Boolean))}
              placeholder="Keywords that trigger this entry"
              rows={3}
              size="sm"
              helperText="One keyword per line. The entry activates when any key matches."
            />
            <TextArea
              label="Secondary Keys (one per line)"
              value={entryForm.keysecondary.join("\n")}
              onChange={(e) => entryFormField("keysecondary", e.target.value.split("\n").filter(Boolean))}
              placeholder="Secondary keywords for selective matching"
              rows={2}
              size="sm"
              helperText="Used only when Selective is enabled — alternatives for AND/NOT logic."
            />
            <TextArea
              label="Content"
              value={entryForm.content}
              onChange={(e) => entryFormField("content", e.target.value)}
              placeholder="The text injected into the prompt when this entry activates"
              rows={6}
              size="md"
              characterCount={entryForm.content.length}
              maxCharacterCount={8000}
              helperText={`${entryForm.content.length} / 8000 characters`}
            />
            <TextArea
              label="Comment"
              value={entryForm.comment}
              onChange={(e) => entryFormField("comment", e.target.value)}
              placeholder="Optional note (not sent to the model)"
              rows={2}
              size="sm"
              helperText="Private note for yourself — never injected into the prompt."
            />
          </div>

          <div className="lorebook-entry-editor-sidebar">
            <SidebarSection title="Activation" defaultOpen>
              <Checkbox
                label="Constant"
                checked={entryForm.constant}
                onChange={(e) => entryFormField("constant", e.target.checked)}
                description="Always active, regardless of keyword matches."
              />
              <Checkbox
                label="Disabled"
                checked={entryForm.disable}
                onChange={(e) => entryFormField("disable", e.target.checked)}
                description="Excluded from prompt injection until re-enabled."
              />
              <Checkbox
                label="Selective"
                checked={entryForm.selective}
                onChange={(e) => entryFormField("selective", e.target.checked)}
                description="Entry only fires when secondary keys satisfy the logic rule."
              />

              {entryForm.selective ? (
                <div className="lorebook-sidebar-field">
                  <span className="field-label-text">Selective Logic</span>
                  <SimpleSelect
                    value={String(entryForm.selectiveLogic)}
                    onChange={(v) => entryFormField("selectiveLogic", Number(v))}
                    size="sm"
                    fullWidth
                    aria-label="Selective Logic"
                    options={[
                      { value: "0", label: "AND ANY — any key matches" },
                      { value: "1", label: "NOT ALL — not every key matches" },
                      { value: "2", label: "NOT ANY — no key matches" },
                      { value: "3", label: "AND ALL — every key matches" },
                    ]}
                  />
                  <span className="field-helper-text">Controls how secondary keys combine with primary keys.</span>
                </div>
              ) : null}
            </SidebarSection>

            <SidebarSection title="Matching" defaultOpen>
              <Checkbox
                label="Case Sensitive"
                checked={entryForm.caseSensitive}
                onChange={(e) => entryFormField("caseSensitive", e.target.checked)}
                description="Keyword matching respects letter case."
              />
              <Checkbox
                label="Whole Words"
                checked={entryForm.matchWholeWords}
                onChange={(e) => entryFormField("matchWholeWords", e.target.checked)}
                description="Keywords must match whole words, not substrings."
              />
              <Checkbox
                label="Regex"
                checked={entryForm.useRegex}
                onChange={(e) => entryFormField("useRegex", e.target.checked)}
                description="Keywords are treated as regular expressions."
              />
            </SidebarSection>

            <SidebarSection title="Injection" defaultOpen={false}>
              <TextInput
                label="Order"
                type="number"
                min={0}
                value={entryForm.order}
                onChange={(e) => entryFormField("order", Number(e.target.value) || 100)}
                size="sm"
                helperText="Lower = injected earlier. Default 100."
              />
              <div className="lorebook-sidebar-field">
                <span className="field-label-text">Position</span>
                <SimpleSelect
                  value={String(entryForm.position)}
                  onChange={(v) => entryFormField("position", Number(v))}
                  size="sm"
                  fullWidth
                  aria-label="Position"
                  options={[
                    { value: "0", label: "Before — system prompt preamble" },
                    { value: "1", label: "After — after character definitions" },
                    { value: "2", label: "Depth — at the current message index" },
                  ]}
                />
                <span className="field-helper-text">Where in the assembled prompt this entry's content is inserted.</span>
              </div>
              <TextInput
                label="Depth"
                type="number"
                min={0}
                value={entryForm.depth}
                onChange={(e) => entryFormField("depth", Number(e.target.value) || 4)}
                size="sm"
                helperText="Recursion depth for nested matches."
              />
              <TextInput
                label="Scan Depth"
                type="number"
                min={0}
                value={entryForm.scanDepth ?? ""}
                onChange={(e) => entryFormField("scanDepth", e.target.value ? Number(e.target.value) : null)}
                size="sm"
                placeholder="Inherits from lorebook"
                helperText="Leave blank to inherit the lorebook default."
              />
            </SidebarSection>

            <SidebarSection title="Timing" defaultOpen={false}>
              <TextInput
                label="Sticky"
                type="number"
                min={0}
                value={entryForm.sticky}
                onChange={(e) => entryFormField("sticky", Number(e.target.value) || 0)}
                size="sm"
                helperText="Turns sticky after this many activations."
              />
              <TextInput
                label="Cooldown"
                type="number"
                min={0}
                value={entryForm.cooldown}
                onChange={(e) => entryFormField("cooldown", Number(e.target.value) || 0)}
                size="sm"
                helperText="Seconds before this entry can fire again."
              />
              <TextInput
                label="Delay"
                type="number"
                min={0}
                value={entryForm.delay}
                onChange={(e) => entryFormField("delay", Number(e.target.value) || 0)}
                size="sm"
                helperText="Milliseconds to wait before injecting."
              />
            </SidebarSection>

            <SidebarSection title="Probability" defaultOpen={false}>
              <Checkbox
                label="Use Probability"
                checked={entryForm.useProbability}
                onChange={(e) => entryFormField("useProbability", e.target.checked)}
                description="Randomize whether this entry fires on each eligible turn."
              />
              {entryForm.useProbability ? (
                <TextInput
                  label="Probability %"
                  type="number"
                  min={0}
                  max={100}
                  value={entryForm.probability}
                  onChange={(e) => entryFormField("probability", Number(e.target.value) || 100)}
                  size="sm"
                  helperText="Chance (0–100) this entry fires when selected."
                />
              ) : null}
            </SidebarSection>

            <div className="entry-editor-actions">
              <Button variant="danger" size="sm" onClick={() => setDeleteConfirm({ kind: "entry", uid: entryForm.uid })}>Delete Entry</Button>
            </div>
          </div>
        </div>
      </div>
      </div>
        {renderDeleteConfirm()}
        {renderDiscardConfirm()}
      </>
    );
  }

  return (
    <>
    <div className={`lorebook-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
      {isModal ? (
        <div className="global-scope-badge" title="Edits modify global lorebook templates">
          🌐 Global Lorebooks
        </div>
      ) : null}

      {status ? (
        <div style={{ marginBottom: "8px" }}>
          {status.isError ? (
            <Badge variant="danger" leftIcon={<Icon name="AlertCircle" size={13} />}>{status.text}</Badge>
          ) : (
            <Badge variant="success" leftIcon={<Icon name="Check" size={13} />}>{status.text}</Badge>
          )}
        </div>
      ) : null}

      <div className="lorebook-toolbar">
        <Button variant="primary" size="sm" onClick={() => { setCreateName(""); setCreating(true); }} disabled={saving} leftIcon={<Icon name="FilePlus" size={14} />}>
          New Lorebook
        </Button>
        <Button variant="secondary" size="sm" onClick={() => fileInputRef.current?.click()} leftIcon={<Icon name="Upload" size={14} />}>
          Import from File
        </Button>
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
                <Button variant="secondary" size="sm" onClick={() => void selectLorebook(s.id)}>Edit</Button>
                <Button variant="danger" size="sm" onClick={() => setDeleteConfirm({ kind: "lorebook", id: s.id, name: s.name })}>Delete</Button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
    {renderCreateConfirm()}
    </>
  );
}
