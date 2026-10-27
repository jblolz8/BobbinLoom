import { useMemo, useState } from "react";
import type { LorebookEntry, LorebookFile } from "../../../../../schemas";
import { useSideNavMode } from "../../../../hooks/useSideNavMode";
import {
  Badge,
  Button,
  Card,
  CheckboxRow,
  FormGrid,
  FormSection,
  Icon,
  SearchBar,
  SideNav,
  SimpleSelect,
  Stack,
  StatusMessage,
  Text,
  TextArea,
  TextInput,
} from "../../../base";
import { ConfirmModal } from "../../../common";

export type LorebookEditorProps = {
  lorebookId: string;
  lorebook: LorebookFile;
  persistedJson: string;
  variant: "page" | "dialog";
  saving: boolean;
  status: { text: string; isError: boolean } | null;
  onDismissStatus: () => void;
  onChangeLorebook: (updated: LorebookFile) => void;
  onSaveLorebook: (
    updated: LorebookFile,
    statusMessage?: string,
  ) => Promise<void>;
  onExportLorebook: (lorebook: LorebookFile) => void;
  onBackToLibrary: () => void;
  /** Optional initial entry UID to open in the entry editor. */
  initialEditingUid?: number | null;
};

export function blankLorebookEntry(uid: number): LorebookEntry {
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

export function nextLorebookEntryUid(
  entries: Record<string, LorebookEntry>,
): number {
  let max = 0;
  for (const key of Object.keys(entries)) {
    const n = Number(key);
    if (n > max) max = n;
  }
  return max + 1;
}

export function sortLorebookEntries(
  entries: Record<string, LorebookEntry>,
): LorebookEntry[] {
  return Object.values(entries).sort(
    (a, b) => a.order - b.order || a.uid - b.uid,
  );
}

/** Keys are entered as plain text, separated by commas and/or line breaks
 *  (SillyTavern-style). Split on both and drop empties/whitespace. */
const KEY_SEPARATOR = /[\n,]/;
export function splitLorebookKeys(raw: string): string[] {
  return raw
    .split(KEY_SEPARATOR)
    .map((s) => s.trim())
    .filter(Boolean);
}

export function isLorebookEntryModified(
  entryForm: LorebookEntry | null,
  editingUid: number | null,
  lorebook: LorebookFile | null,
): boolean {
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

export function LorebookEditor({
  lorebook,
  persistedJson,
  variant,
  saving,
  status,
  onDismissStatus,
  onChangeLorebook,
  onSaveLorebook,
  onExportLorebook,
  onBackToLibrary,
  initialEditingUid = null,
}: LorebookEditorProps) {
  const nav = useSideNavMode({ respectWorkspaceWidth: variant === "page" });
  const initialEntry =
    initialEditingUid !== null
      ? (lorebook.entries[String(initialEditingUid)] ?? null)
      : null;
  const [editingUid, setEditingUid] = useState<number | null>(
    initialEntry ? initialEntry.uid : null,
  );
  const [entryForm, setEntryForm] = useState<LorebookEntry | null>(
    initialEntry ? { ...initialEntry } : null,
  );
  const [keysRaw, setKeysRaw] = useState(
    initialEntry ? initialEntry.key.join(", ") : "",
  );
  const [secondaryRaw, setSecondaryRaw] = useState(
    initialEntry ? initialEntry.keysecondary.join(", ") : "",
  );
  const [searchTerm, setSearchTerm] = useState("");

  const [deleteEntryUid, setDeleteEntryUid] = useState<number | null>(null);
  const [discardConfirm, setDiscardConfirm] = useState<{
    title: string;
    message: string;
    onConfirm: () => void;
  } | null>(null);

  const isHeaderDirty = useMemo(
    () => JSON.stringify(lorebook) !== persistedJson,
    [lorebook, persistedJson],
  );

  const isEntryDirty = useMemo(
    () => isLorebookEntryModified(entryForm, editingUid, lorebook),
    [entryForm, editingUid, lorebook],
  );

  const isDirty = isHeaderDirty || isEntryDirty;

  const storedEntry =
    editingUid !== null ? lorebook.entries[String(editingUid)] : undefined;

  function applyOpenNewEntry() {
    const uid = nextLorebookEntryUid(lorebook.entries ?? {});
    const entry = blankLorebookEntry(uid);
    setKeysRaw("");
    setSecondaryRaw("");
    setEntryForm(entry);
    setEditingUid(uid);
    if (nav.narrow) nav.closeDrawer();
  }

  function applyOpenEditEntry(entry: LorebookEntry) {
    setKeysRaw(entry.key.join(", "));
    setSecondaryRaw(entry.keysecondary.join(", "));
    setEntryForm({ ...entry });
    setEditingUid(entry.uid);
    if (nav.narrow) nav.closeDrawer();
  }

  function closeEntryEditor() {
    setEntryForm(null);
    setEditingUid(null);
  }

  function requestOpenNewEntry() {
    if (isEntryDirty) {
      setDiscardConfirm({
        title: "Discard unsaved entry edits?",
        message:
          "You have unsaved changes to the current entry. Creating a new entry will discard them.",
        onConfirm: () => {
          setDiscardConfirm(null);
          applyOpenNewEntry();
        },
      });
      return;
    }
    applyOpenNewEntry();
  }

  function requestOpenEditEntry(entry: LorebookEntry) {
    if (editingUid === entry.uid) {
      if (nav.narrow) nav.closeDrawer();
      return;
    }
    if (isEntryDirty) {
      setDiscardConfirm({
        title: "Discard unsaved entry edits?",
        message:
          "You have unsaved changes to the current entry. Switching entries will discard them.",
        onConfirm: () => {
          setDiscardConfirm(null);
          applyOpenEditEntry(entry);
        },
      });
      return;
    }
    applyOpenEditEntry(entry);
  }

  function requestCloseEntryEditor() {
    if (isEntryDirty) {
      setDiscardConfirm({
        title: "Discard unsaved entry edits?",
        message: "Any changes you made to this entry will be lost.",
        onConfirm: () => {
          setDiscardConfirm(null);
          closeEntryEditor();
        },
      });
      return;
    }
    closeEntryEditor();
  }

  function requestBackToLibrary() {
    if (isDirty) {
      setDiscardConfirm({
        title: "Discard unsaved lorebook changes?",
        message:
          "You have unsaved changes to this lorebook or one of its entries. Leaving will discard them.",
        onConfirm: () => {
          setDiscardConfirm(null);
          onBackToLibrary();
        },
      });
      return;
    }
    onBackToLibrary();
  }

  function entryFormField<T extends keyof LorebookEntry>(
    field: T,
    value: LorebookEntry[T],
  ) {
    if (!entryForm) return;
    setEntryForm({ ...entryForm, [field]: value });
  }

  async function handleSaveAll() {
    const merged: LorebookFile =
      entryForm !== null && editingUid !== null
        ? {
            ...lorebook,
            entries: {
              ...lorebook.entries,
              [String(entryForm.uid)]: entryForm,
            },
          }
        : lorebook;
    await onSaveLorebook(merged, "Lorebook saved.");
  }

  async function handleSaveEntry() {
    if (!entryForm) return;
    const updated: LorebookFile = {
      ...lorebook,
      entries: {
        ...lorebook.entries,
        [String(entryForm.uid)]: entryForm,
      },
    };
    await onSaveLorebook(updated, `Entry #${entryForm.uid} saved.`);
  }

  async function handleConfirmDeleteEntry(uid: number) {
    const updatedEntries = { ...lorebook.entries };
    delete updatedEntries[String(uid)];
    const updated: LorebookFile = { ...lorebook, entries: updatedEntries };
    if (editingUid === uid) {
      closeEntryEditor();
    }
    setDeleteEntryUid(null);
    await onSaveLorebook(updated, `Entry #${uid} deleted.`);
  }

  const sortedEntries = useMemo(
    () => sortLorebookEntries(lorebook.entries),
    [lorebook.entries],
  );

  const filteredEntries = useMemo(() => {
    const s = searchTerm.trim().toLowerCase();
    if (!s) return sortedEntries;
    return sortedEntries.filter(
      (e) =>
        e.key.some((k) => k.toLowerCase().includes(s)) ||
        e.keysecondary.some((k) => k.toLowerCase().includes(s)) ||
        e.content.toLowerCase().includes(s) ||
        e.comment.toLowerCase().includes(s),
    );
  }, [sortedEntries, searchTerm]);

  const totalEntriesCount = sortedEntries.length;

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {/* Top Action Bar */}
      <Card variant="panel" padding="sm" dirty={isDirty} fullWidth>
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="sm"
          wrap
          fullWidth
        >
          <Stack direction="row" align="center" gap="sm" wrap>
            <Button
              variant="secondary"
              size="sm"
              leftIcon="ArrowLeft"
              onClick={requestBackToLibrary}
              title="Return to Lorebook Library"
            >
              Back to Library
            </Button>
            <Text as="h3" size="md" weight="bold">
              {lorebook.name || "Untitled Lorebook"}
            </Text>
            <Badge variant="info" size="xs" pill leftIcon="BookOpen">
              {totalEntriesCount}{" "}
              {totalEntriesCount === 1 ? "entry" : "entries"}
            </Badge>
            {variant === "dialog" ? (
              <Badge
                variant="outline"
                size="xs"
                pill
                title="Edits modify global lorebook templates"
              >
                Global Lorebook
              </Badge>
            ) : null}
            {isDirty ? (
              <Badge variant="warning" size="xs" pill>
                Unsaved changes
              </Badge>
            ) : null}
          </Stack>

          <Stack direction="row" align="center" gap="xs">
            <Button
              variant="secondary"
              size="sm"
              leftIcon="Download"
              onClick={() => onExportLorebook(lorebook)}
            >
              Export
            </Button>
            <Button
              variant="primary"
              size="sm"
              leftIcon="Check"
              onClick={() => void handleSaveAll()}
              disabled={saving || !lorebook.name.trim()}
              isLoading={saving}
            >
              {saving ? "Saving…" : "Save Lorebook"}
            </Button>
          </Stack>
        </Stack>
      </Card>

      {status ? (
        <StatusMessage
          variant="banner"
          tone={status.isError ? "err" : "ok"}
          onDismiss={onDismissStatus}
        >
          {status.text}
        </StatusMessage>
      ) : null}

      {/* Lorebook Header Settings & Matching Defaults */}
      <Card variant="elevated" padding="sm" fullWidth>
        <FormSection
          title="Lorebook Settings & Matching Defaults"
          icon="Sliders"
          collapsible
          defaultOpen
        >
          <Stack direction="column" align="stretch" gap="sm" fullWidth>
            <FormGrid cols={2} gap="md">
              <TextInput
                label="Lorebook Name"
                value={lorebook.name}
                onChange={(e) =>
                  onChangeLorebook({ ...lorebook, name: e.target.value })
                }
                size="sm"
                placeholder="Lorebook name"
              />
              <TextInput
                label="Default Scan Depth"
                type="number"
                min={0}
                max={1000}
                value={lorebook.scanDepth ?? 2}
                onChange={(e) =>
                  onChangeLorebook({
                    ...lorebook,
                    scanDepth: Math.max(0, Number(e.target.value) || 0),
                  })
                }
                size="sm"
                helperText="How many recent messages the engine scans for keyword matches unless overridden by an entry."
              />
            </FormGrid>

            <FormGrid cols={2} gap="md">
              <CheckboxRow
                icon="CaseSensitive"
                title="Case Sensitive (Lorebook Default)"
                checked={lorebook.caseSensitive ?? false}
                onChange={(e) =>
                  onChangeLorebook({
                    ...lorebook,
                    caseSensitive: e.target.checked,
                  })
                }
                description="Keyword matching respects letter case for all entries in this lorebook."
              />
              <CheckboxRow
                icon="WholeWord"
                title="Whole Words (Lorebook Default)"
                checked={lorebook.matchWholeWords ?? false}
                onChange={(e) =>
                  onChangeLorebook({
                    ...lorebook,
                    matchWholeWords: e.target.checked,
                  })
                }
                description="Keywords must match whole words rather than substrings across this lorebook."
              />
            </FormGrid>
          </Stack>
        </FormSection>
      </Card>

      {/* Master–Detail Split: Collapsible Entry List SideNav (Left) + Entry Editor (Right) */}
      <SideNav.Layout minHeight="md">
        <SideNav
          id="lorebook-entries-nav"
          ariaLabel="Lorebook entries"
          width="lg"
          hidden={!nav.narrow && nav.collapsed}
          open={nav.narrow && nav.drawerOpen}
          showScrim={nav.narrow && nav.drawerOpen}
          onScrimClick={nav.closeDrawer}
          title={
            <>
              <Icon name="List" size={16} /> Entries
              <Badge variant="neutral" size="xs" pill>
                {totalEntriesCount}
              </Badge>
            </>
          }
          headerExtra={
            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Button
                variant="primary"
                size="sm"
                leftIcon="Plus"
                fullWidth
                onClick={requestOpenNewEntry}
                disabled={saving}
              >
                Add Entry
              </Button>
              <SearchBar
                value={searchTerm}
                onChange={setSearchTerm}
                placeholder="Search entries…"
                size="sm"
              />
            </Stack>
          }
          listOverride={
            filteredEntries.length === 0 ? (
              <Card variant="elevated" padding="md" fullWidth>
                <Stack direction="column" align="center" gap="xs">
                  <Text size="sm" weight="semibold" align="center">
                    {totalEntriesCount === 0
                      ? "No entries yet"
                      : "No entries match your search"}
                  </Text>
                  <Text size="xs" tone="secondary" align="center">
                    {totalEntriesCount === 0
                      ? 'Click "+ Add Entry" to create your first World Info entry.'
                      : "Try adjusting your search keywords."}
                  </Text>
                </Stack>
              </Card>
            ) : (
              <Stack
                direction="column"
                align="stretch"
                gap="xs"
                fullWidth
              >
                {filteredEntries.map((entry) => {
                  const isSelected = entry.uid === editingUid;
                  const entryLabel =
                    (entry.comment ?? "").trim() ||
                    entry.key.slice(0, 3).join(", ") ||
                    "(no keys)";
                  const previewText = entry.content.trim()
                    ? `${entry.content.slice(0, 70)}${entry.content.length > 70 ? "…" : ""}`
                    : "(empty content)";

                  return (
                    <Card
                      key={entry.uid}
                      as="article"
                      variant="elevated"
                      padding="xs"
                      hoverable
                      active={isSelected}
                      dimmed={entry.disable}
                      fullWidth
                    >
                      <Stack
                        direction="column"
                        align="stretch"
                        gap="2xs"
                        fullWidth
                      >
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          fullWidth
                        >
                          <Card.TitleButton
                            title={entryLabel}
                            onClick={() => requestOpenEditEntry(entry)}
                          >
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              fullWidth
                            >
                              <Text as="span" size="xs" tone="muted" mono>
                                #{entry.uid}
                              </Text>
                              <Text
                                as="span"
                                size="sm"
                                weight="semibold"
                                truncate
                              >
                                {entryLabel}
                              </Text>
                            </Stack>
                          </Card.TitleButton>

                          <Card.Interactive>
                            {entry.constant ? (
                              <Badge
                                variant="info"
                                size="xs"
                                pill
                                leftIcon="Zap"
                              >
                                Constant
                              </Badge>
                            ) : null}
                            {entry.disable ? (
                              <Badge variant="outline" size="xs" pill>
                                Disabled
                              </Badge>
                            ) : null}
                          </Card.Interactive>
                        </Stack>

                        <Text as="p" size="xs" tone="muted" truncate>
                          {previewText}
                        </Text>
                      </Stack>
                    </Card>
                  );
                })}
              </Stack>
            )
          }
        />

        {/* Right Column: Selected Entry Editor or Placeholder */}
        <SideNav.Main>
          {editingUid !== null && entryForm !== null ? (
            <Card variant="panel" padding="md" dirty={isEntryDirty} fullWidth>
              <Stack direction="column" align="stretch" gap="md" fullWidth>
                <SideNav.Toolbar bordered>
                  <Stack direction="row" align="center" gap="sm" wrap>
                    <SideNav.Trigger
                      controlsId="lorebook-entries-nav"
                      open={nav.shown}
                      onClick={nav.toggle}
                      label={nav.shown ? "Hide Entries" : "Show Entries"}
                      badge={
                        <Badge variant="neutral" size="xs" pill>
                          {totalEntriesCount}
                        </Badge>
                      }
                      trailingIcon={nav.shown ? undefined : "ChevronRight"}
                      tooltip={
                        nav.shown
                          ? "Hide the entry list sidebar"
                          : "Show the entry list sidebar"
                      }
                    />
                    <Text as="span" variant="label" size="sm" weight="semibold">
                      {`Entry #${entryForm.uid}${entryForm.comment?.trim() ? ` — ${entryForm.comment.trim()}` : ""}`}
                    </Text>
                  </Stack>

                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Button
                      variant="danger"
                      size="xs"
                      leftIcon="Trash2"
                      onClick={() => setDeleteEntryUid(entryForm.uid)}
                      disabled={saving}
                    >
                      Delete Entry
                    </Button>
                    <Button
                      variant="secondary"
                      size="xs"
                      onClick={requestCloseEntryEditor}
                      disabled={saving}
                    >
                      Close Entry
                    </Button>
                    <Button
                      variant="primary"
                      size="xs"
                      leftIcon="Check"
                      onClick={() => void handleSaveEntry()}
                      disabled={saving}
                      isLoading={saving}
                    >
                      Save Entry
                    </Button>
                  </Stack>
                </SideNav.Toolbar>

                <FormGrid cols="sidebar-right" gap="md">
                  {/* Main Entry Text Fields */}
                  <Stack direction="column" align="stretch" gap="sm" fullWidth>
                    <TextArea
                      label="Keys (comma or line separated)"
                      value={keysRaw}
                      onChange={(e) => {
                        setKeysRaw(e.target.value);
                        entryFormField("key", splitLorebookKeys(e.target.value));
                      }}
                      placeholder="Keywords that trigger this entry"
                      rows={3}
                      size="sm"
                      autoGrow
                      helperText="Separate keys with commas or line breaks. The entry activates when any key matches."
                    />
                    <TextArea
                      label="Secondary Keys (comma or line separated)"
                      value={secondaryRaw}
                      onChange={(e) => {
                        setSecondaryRaw(e.target.value);
                        entryFormField(
                          "keysecondary",
                          splitLorebookKeys(e.target.value),
                        );
                      }}
                      placeholder="Secondary keywords for selective matching"
                      rows={2}
                      size="sm"
                      autoGrow
                      helperText="Used only when Selective is enabled — alternatives for AND/NOT logic."
                    />
                    <TextArea
                      label="Content"
                      value={entryForm.content}
                      onChange={(e) =>
                        entryFormField("content", e.target.value)
                      }
                      placeholder="The text injected into the prompt when this entry activates"
                      rows={7}
                      size="md"
                      autoGrow
                      characterCount={entryForm.content.length}
                      maxCharacterCount={8000}
                      helperText={`${entryForm.content.length} / 8000 characters`}
                    />
                    <TextArea
                      label="Comment"
                      value={entryForm.comment}
                      onChange={(e) =>
                        entryFormField("comment", e.target.value)
                      }
                      placeholder="Optional note (not sent to the model)"
                      rows={2}
                      size="sm"
                      autoGrow
                      helperText="Private note for yourself — never injected into the prompt."
                    />
                  </Stack>

                  {/* Collapsible Entry Rule Sections */}
                  <Stack direction="column" align="stretch" gap="xs" fullWidth>
                    <FormSection title="Activation" collapsible defaultOpen>
                      <CheckboxRow
                        icon="Pin"
                        title="Constant"
                        checked={entryForm.constant}
                        dirty={
                          storedEntry
                            ? entryForm.constant !== storedEntry.constant
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("constant", e.target.checked)
                        }
                        description="Always active, regardless of keyword matches."
                      />
                      <CheckboxRow
                        icon="Ban"
                        title="Disabled"
                        checked={entryForm.disable}
                        dirty={
                          storedEntry
                            ? entryForm.disable !== storedEntry.disable
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("disable", e.target.checked)
                        }
                        description="Excluded from prompt injection until re-enabled."
                      />
                      <CheckboxRow
                        icon="Filter"
                        title="Selective"
                        checked={entryForm.selective}
                        dirty={
                          storedEntry
                            ? entryForm.selective !== storedEntry.selective
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("selective", e.target.checked)
                        }
                        description="Entry only fires when secondary keys satisfy the logic rule."
                      />

                      {entryForm.selective ? (
                        <SimpleSelect
                          label="Selective Logic"
                          value={String(entryForm.selectiveLogic)}
                          onChange={(v) =>
                            entryFormField("selectiveLogic", Number(v))
                          }
                          size="sm"
                          fullWidth
                          aria-label="Selective Logic"
                          helperText="Controls how secondary keys combine with primary keys."
                          options={[
                            { value: "0", label: "AND ANY — any key matches" },
                            {
                              value: "1",
                              label: "NOT ALL — not every key matches",
                            },
                            { value: "2", label: "NOT ANY — no key matches" },
                            {
                              value: "3",
                              label: "AND ALL — every key matches",
                            },
                          ]}
                        />
                      ) : null}
                    </FormSection>

                    <FormSection title="Matching" collapsible defaultOpen>
                      <CheckboxRow
                        icon="CaseSensitive"
                        title="Case Sensitive"
                        checked={entryForm.caseSensitive}
                        dirty={
                          storedEntry
                            ? entryForm.caseSensitive !==
                              storedEntry.caseSensitive
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("caseSensitive", e.target.checked)
                        }
                        description="Keyword matching respects letter case."
                      />
                      <CheckboxRow
                        icon="WholeWord"
                        title="Whole Words"
                        checked={entryForm.matchWholeWords}
                        dirty={
                          storedEntry
                            ? entryForm.matchWholeWords !==
                              storedEntry.matchWholeWords
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("matchWholeWords", e.target.checked)
                        }
                        description="Keywords must match whole words, not substrings."
                      />
                      <CheckboxRow
                        icon="Regex"
                        title="Regex"
                        checked={entryForm.useRegex}
                        dirty={
                          storedEntry
                            ? entryForm.useRegex !== storedEntry.useRegex
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("useRegex", e.target.checked)
                        }
                        description="Keywords are treated as regular expressions."
                      />
                    </FormSection>

                    <FormSection title="Injection" collapsible>
                      <TextInput
                        label="Order"
                        type="number"
                        min={0}
                        value={entryForm.order}
                        onChange={(e) =>
                          entryFormField(
                            "order",
                            Number(e.target.value) || 100,
                          )
                        }
                        size="sm"
                        helperText="Lower = injected earlier. Default 100."
                      />
                      <SimpleSelect
                        label="Position"
                        value={String(entryForm.position)}
                        onChange={(v) =>
                          entryFormField("position", Number(v))
                        }
                        size="sm"
                        fullWidth
                        aria-label="Position"
                        helperText="Where in the assembled prompt this entry's content is inserted."
                        options={[
                          {
                            value: "0",
                            label: "Before — system prompt preamble",
                          },
                          {
                            value: "1",
                            label: "After — after character definitions",
                          },
                          {
                            value: "2",
                            label: "Depth — at message depth from bottom",
                          },
                        ]}
                      />
                      <TextInput
                        label="Depth"
                        type="number"
                        min={0}
                        value={entryForm.depth}
                        onChange={(e) =>
                          entryFormField("depth", Number(e.target.value) || 4)
                        }
                        size="sm"
                        helperText="How many messages up from the latest message to inject when Position is Depth."
                      />
                      <TextInput
                        label="Scan Depth"
                        type="number"
                        min={0}
                        value={entryForm.scanDepth ?? ""}
                        onChange={(e) =>
                          entryFormField(
                            "scanDepth",
                            e.target.value ? Number(e.target.value) : null,
                          )
                        }
                        size="sm"
                        placeholder="Inherits from lorebook"
                        helperText="Leave blank to inherit the lorebook default."
                      />
                    </FormSection>

                    <FormSection title="Timing (Turns)" collapsible>
                      <TextInput
                        label="Sticky"
                        type="number"
                        min={0}
                        value={entryForm.sticky}
                        onChange={(e) =>
                          entryFormField("sticky", Number(e.target.value) || 0)
                        }
                        size="sm"
                        helperText="Keeps this entry active for this many turns after it last matched."
                      />
                      <TextInput
                        label="Cooldown"
                        type="number"
                        min={0}
                        value={entryForm.cooldown}
                        onChange={(e) =>
                          entryFormField(
                            "cooldown",
                            Number(e.target.value) || 0,
                          )
                        }
                        size="sm"
                        helperText="Turns this entry must stay inactive after firing."
                      />
                      <TextInput
                        label="Delay"
                        type="number"
                        min={0}
                        value={entryForm.delay}
                        onChange={(e) =>
                          entryFormField("delay", Number(e.target.value) || 0)
                        }
                        size="sm"
                        helperText="Turns to wait before this entry can activate."
                      />
                    </FormSection>

                    <FormSection title="Probability" collapsible>
                      <CheckboxRow
                        icon="Percent"
                        title="Use Probability"
                        checked={entryForm.useProbability}
                        dirty={
                          storedEntry
                            ? entryForm.useProbability !==
                              storedEntry.useProbability
                            : false
                        }
                        onChange={(e) =>
                          entryFormField("useProbability", e.target.checked)
                        }
                        description="Randomize whether this entry fires on each eligible turn."
                      />
                      {entryForm.useProbability ? (
                        <TextInput
                          label="Probability %"
                          type="number"
                          min={0}
                          max={100}
                          value={entryForm.probability}
                          onChange={(e) =>
                            entryFormField(
                              "probability",
                              Number(e.target.value) || 100,
                            )
                          }
                          size="sm"
                          helperText="Chance (0–100) this entry fires when triggered."
                        />
                      ) : null}
                    </FormSection>
                  </Stack>
                </FormGrid>
              </Stack>
            </Card>
          ) : (
            <Card variant="panel" padding="lg" fullWidth>
              <Stack direction="column" align="stretch" gap="md" fullWidth>
                <SideNav.Toolbar bordered>
                  <SideNav.Trigger
                    controlsId="lorebook-entries-nav"
                    open={nav.shown}
                    onClick={nav.toggle}
                    label={nav.shown ? "Hide Entries" : "Show Entries"}
                    badge={
                      <Badge variant="neutral" size="xs" pill>
                        {totalEntriesCount}
                      </Badge>
                    }
                    trailingIcon={nav.shown ? undefined : "ChevronRight"}
                    tooltip={
                      nav.shown
                        ? "Hide the entry list sidebar"
                        : "Show the entry list sidebar"
                    }
                  />
                </SideNav.Toolbar>

                <Stack direction="column" align="center" gap="sm">
                  <Text size="md" weight="semibold" align="center">
                    No entry selected
                  </Text>
                  <Text size="sm" tone="secondary" align="center">
                    Select an entry from the list to edit its keywords, content,
                    and activation settings, or create a new entry.
                  </Text>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon="Plus"
                    onClick={requestOpenNewEntry}
                    disabled={saving}
                  >
                    Add Entry
                  </Button>
                </Stack>
              </Stack>
            </Card>
          )}
        </SideNav.Main>
      </SideNav.Layout>

      {deleteEntryUid !== null ? (
        <ConfirmModal
          title={`Delete Entry #${deleteEntryUid}?`}
          message="The entry will be permanently removed from this lorebook. This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          onCancel={() => setDeleteEntryUid(null)}
          onConfirm={() => void handleConfirmDeleteEntry(deleteEntryUid)}
        />
      ) : null}

      {discardConfirm ? (
        <ConfirmModal
          title={discardConfirm.title}
          message={discardConfirm.message}
          confirmLabel="Discard"
          cancelLabel="Cancel"
          danger
          onCancel={() => setDiscardConfirm(null)}
          onConfirm={discardConfirm.onConfirm}
        />
      ) : null}
    </Stack>
  );
}
