import { useEffect, useMemo, useRef, useState } from "react";
import type { LorebookFile, LorebookSummary } from "../../../schemas";
import {
  ActionsMenu,
  Badge,
  Button,
  Card,
  Header,
  Modal,
  Pagination,
  SearchBar,
  SortSelect,
  Stack,
  StatusMessage,
  Text,
  TextInput,
  type ActionsMenuItem,
  type SortSelectOption,
} from "../base";
import { usePagination } from "../../hooks/usePagination";
import { ConfirmModal } from "../common";
import {
  createLorebook,
  deleteLorebook,
  getLorebook,
  importLorebook,
  listLorebooks,
  saveLorebook,
} from "../../api";
import { LorebookEditor } from "./editor";

export type LorebookLibraryVariant = "page" | "dialog";
export type LorebookSortBy = "name" | "entryCount";
export type LorebookSortDir = "asc" | "desc";

export type LorebookLibraryProps = {
  /** `page` renders inline in the Home workspace; `dialog` renders inside a Modal shell. */
  variant?: LorebookLibraryVariant;
  /** Legacy alias for `variant="dialog"`. */
  isModal?: boolean;
  onClose?: () => void;
  onLorebooksChanged?: () => void;
};

const LOREBOOK_SORT_OPTIONS: SortSelectOption<LorebookSortBy>[] = [
  { value: "name", label: "Name" },
  {
    value: "entryCount",
    label: "Entry Count",
    ascLabel: "Fewest",
    descLabel: "Most",
    ascTooltip: "Fewest entries first",
    descTooltip: "Most entries first",
  },
];

export function downloadLorebookJson(lorebook: LorebookFile): void {
  const blob = new Blob([JSON.stringify(lorebook, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${lorebook.name.replace(/[^a-zA-Z0-9_\- ]/g, "_") || "lorebook"}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function LorebookLibrary({
  variant,
  isModal,
  onClose,
  onLorebooksChanged,
}: LorebookLibraryProps) {
  const resolvedVariant: LorebookLibraryVariant =
    variant ?? (isModal ? "dialog" : "page");

  const [summaries, setSummaries] = useState<LorebookSummary[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [lorebook, setLorebook] = useState<LorebookFile | null>(null);
  const [persistedJson, setPersistedJson] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [importing, setImporting] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<LorebookSortBy>("name");
  const [sortDir, setSortDir] = useState<LorebookSortDir>("asc");

  const [creating, setCreating] = useState(false);
  const [createName, setCreateName] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const filteredAndSortedLorebooks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? summaries.filter(
          (s) =>
            s.name.toLowerCase().includes(q) || s.id.toLowerCase().includes(q),
        )
      : summaries;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "entryCount" && a.entryCount !== b.entryCount) {
        return (a.entryCount - b.entryCount) * dir;
      }
      return a.name.localeCompare(b.name) * dir;
    });
  }, [summaries, searchQuery, sortBy, sortDir]);

  const lorebookPager = usePagination({
    items: filteredAndSortedLorebooks,
    persistAs: "lorebook",
    resetDeps: [searchQuery, sortBy, sortDir],
  });

  const paginationElement = (
    <Pagination
      page={lorebookPager.page}
      pageSize={lorebookPager.pageSize}
      total={lorebookPager.totalItems}
      onPageChange={lorebookPager.setPage}
      onPageSizeChange={lorebookPager.setPageSize}
      onCommitCustomPageSize={lorebookPager.commitCustomPageSize}
      itemLabel="lorebooks"
    />
  );

  useEffect(() => {
    void refresh();
  }, []);

  async function refresh() {
    try {
      setSummaries(await listLorebooks());
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    }
  }

  async function selectLorebook(id: string) {
    setStatus(null);
    try {
      const lb = await getLorebook(id);
      setLorebook(lb);
      setPersistedJson(JSON.stringify(lb));
      setSelectedId(id);
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    }
  }

  function clearToLibrary() {
    setPersistedJson("");
    setSelectedId(null);
    setLorebook(null);
    void refresh();
  }

  function startCreateLorebook() {
    setCreateName("");
    setCreating(true);
    setStatus(null);
  }

  async function handleCreate(name: string) {
    const trimmed = name.trim();
    if (!trimmed) return;
    setSaving(true);
    try {
      await createLorebook(trimmed);
      await refresh();
      onLorebooksChanged?.();
      setStatus({ text: `"${trimmed}" created.`, isError: false });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleDuplicateLorebook(summary: LorebookSummary) {
    setSaving(true);
    try {
      const source = await getLorebook(summary.id);
      const copyName = `${source.name} (Copy)`;
      await createLorebook(copyName, {
        ...source,
        name: copyName,
      });
      await refresh();
      onLorebooksChanged?.();
      setStatus({ text: `Duplicated as "${copyName}".`, isError: false });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  async function handleExportFromShelf(summary: LorebookSummary) {
    try {
      const full = await getLorebook(summary.id);
      downloadLorebookJson(full);
      setStatus({ text: `Exported "${summary.name}".`, isError: false });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    }
  }

  async function handleDelete(id: string, name: string) {
    setSaving(true);
    try {
      await deleteLorebook(id);
      if (selectedId === id) {
        clearToLibrary();
      }
      await refresh();
      onLorebooksChanged?.();
      setStatus({ text: `"${name}" deleted.`, isError: false });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setSaving(false);
      setDeleteTarget(null);
    }
  }

  async function handleImport() {
    const input = fileInputRef.current;
    if (!input) return;
    const file = input.files?.[0];
    if (!file) return;

    setImporting(true);
    try {
      const text = await file.text();
      const contents = JSON.parse(text);
      if (!contents.entries || typeof contents.entries !== "object") {
        throw new Error("Invalid lorebook file: missing entries object");
      }
      const filename = file.name.replace(/\.json$/i, "");
      const imported = await importLorebook(filename, contents);
      await refresh();
      onLorebooksChanged?.();
      setStatus({
        text: `"${imported.name || filename}" imported.`,
        isError: false,
      });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setImporting(false);
      if (input) input.value = "";
    }
  }

  async function handleSaveLorebook(
    updated: LorebookFile,
    statusMessage = "Saved.",
  ) {
    if (!selectedId) return;
    const snapshot = JSON.stringify(updated);
    setSaving(true);
    try {
      await saveLorebook(selectedId, updated);
      setLorebook(updated);
      setPersistedJson(snapshot);
      await refresh();
      onLorebooksChanged?.();
      setStatus({ text: statusMessage, isError: false });
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  function buildLorebookMenuItems(s: LorebookSummary): ActionsMenuItem[] {
    return [
      {
        label: "Edit",
        icon: "Pencil",
        onClick: () => void selectLorebook(s.id),
      },
      {
        label: "Duplicate",
        icon: "Copy",
        disabled: saving,
        onClick: () => void handleDuplicateLorebook(s),
      },
      {
        label: "Export",
        icon: "Download",
        onClick: () => void handleExportFromShelf(s),
      },
      {
        label: "Delete",
        icon: "Trash2",
        danger: true,
        disabled: saving,
        onClick: () => setDeleteTarget({ id: s.id, name: s.name }),
      },
    ];
  }

  const editorOpen = Boolean(selectedId && lorebook);

  const contentBody = (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {!editorOpen && status ? (
        <StatusMessage
          variant="banner"
          tone={status.isError ? "err" : "ok"}
          onDismiss={() => setStatus(null)}
        >
          {status.text}
        </StatusMessage>
      ) : null}

      {!editorOpen ? (
        <Stack direction="column" align="stretch" gap="md" fullWidth>
          {/* Shelf Control Toolbar */}
          <Card variant="panel" padding="sm" fullWidth>
            <Stack
              direction="row"
              align="center"
              gap="sm"
              wrap
              stackBelow="sm"
              fullWidth
            >
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                placeholder="Search lorebooks by name…"
                size="sm"
              />

              <SortSelect<LorebookSortBy>
                value={sortBy}
                onChange={setSortBy}
                direction={sortDir}
                onDirectionChange={setSortDir}
                options={LOREBOOK_SORT_OPTIONS}
                size="sm"
                groupAriaLabel="Sort lorebooks"
                aria-label="Sort lorebooks by"
              />
            </Stack>
          </Card>

          {filteredAndSortedLorebooks.length === 0 ? (
            <Card variant="panel" padding="lg" fullWidth>
              <Stack direction="column" align="center" gap="sm">
                <Text size="md" weight="semibold">
                  {summaries.length === 0
                    ? "No lorebooks yet"
                    : "No lorebooks match your search"}
                </Text>
                <Text size="sm" tone="secondary" align="center">
                  {summaries.length === 0
                    ? "Create a lorebook or import a SillyTavern World Info .json file to inject world lore into your stories."
                    : "Try adjusting your search query."}
                </Text>
                {searchQuery ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear Search
                  </Button>
                ) : null}
              </Stack>
            </Card>
          ) : (
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              {lorebookPager.totalPages > 1 ? paginationElement : null}

              <Stack direction="column" align="stretch" gap="sm" fullWidth>
                {lorebookPager.pageItems.map((s) => (
                  <Card
                    key={s.id}
                    as="article"
                    variant="panel"
                    padding="sm"
                    layout="row"
                    hoverable
                    fullWidth
                  >
                    <Stack
                      direction="column"
                      align="stretch"
                      gap="xs"
                      flex1
                      fullWidth
                    >
                      <Stack
                        direction="row"
                        align="start"
                        justify="between"
                        gap="sm"
                        fullWidth
                      >
                        <Card.TitleButton
                          title={s.name}
                          onClick={() => void selectLorebook(s.id)}
                        >
                          <Text
                            as="span"
                            size="md"
                            weight="semibold"
                            truncate
                          >
                            {s.name}
                          </Text>
                        </Card.TitleButton>

                        <Card.Interactive>
                          <Stack inline gap="xs" hideBelow="sm">
                            <Button
                              variant="secondary"
                              size="xs"
                              leftIcon="Pencil"
                              onClick={() => void selectLorebook(s.id)}
                            >
                              Edit
                            </Button>
                            <Button
                              variant="secondary"
                              size="xs"
                              leftIcon="Copy"
                              disabled={saving}
                              onClick={() => void handleDuplicateLorebook(s)}
                            >
                              Duplicate
                            </Button>
                            <Button
                              variant="secondary"
                              size="xs"
                              leftIcon="Download"
                              onClick={() => void handleExportFromShelf(s)}
                            >
                              Export
                            </Button>
                            <Button
                              variant="danger"
                              size="xs"
                              leftIcon="Trash2"
                              disabled={saving}
                              onClick={() =>
                                setDeleteTarget({ id: s.id, name: s.name })
                              }
                            >
                              Delete
                            </Button>
                          </Stack>
                          <Stack inline showBelow="sm">
                            <ActionsMenu
                              label={`Actions for ${s.name}`}
                              items={buildLorebookMenuItems(s)}
                            />
                          </Stack>
                        </Card.Interactive>
                      </Stack>

                      <Stack direction="row" align="center" gap="xs" wrap>
                        <Badge variant="info" size="xs" leftIcon="BookOpen">
                          {s.entryCount}{" "}
                          {s.entryCount === 1 ? "entry" : "entries"}
                        </Badge>
                        <Badge variant="neutral" size="xs" leftIcon="Search">
                          Scan depth: {s.scanDepth}
                        </Badge>
                      </Stack>
                    </Stack>
                  </Card>
                ))}
              </Stack>

              {paginationElement}
            </Stack>
          )}
        </Stack>
      ) : selectedId && lorebook ? (
        <LorebookEditor
          lorebookId={selectedId}
          lorebook={lorebook}
          persistedJson={persistedJson}
          variant={resolvedVariant}
          saving={saving}
          status={status}
          onDismissStatus={() => setStatus(null)}
          onChangeLorebook={setLorebook}
          onSaveLorebook={handleSaveLorebook}
          onExportLorebook={downloadLorebookJson}
          onBackToLibrary={clearToLibrary}
        />
      ) : null}

      {creating ? (
        <ConfirmModal
          title="New Lorebook"
          message="Create an empty lorebook to start adding World Info entries, or import a SillyTavern .json file."
          confirmLabel={saving ? "Creating…" : "Create"}
          confirmDisabled={!createName.trim() || saving}
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
          <TextInput
            label="Lorebook name"
            value={createName}
            onChange={(e) => setCreateName(e.target.value)}
            placeholder="e.g. Kanto Region Lore"
            disabled={saving}
            autoFocus
          />
        </ConfirmModal>
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title={`Delete "${deleteTarget.name}"?`}
          message="This will permanently remove the lorebook and all of its entries. This cannot be undone."
          confirmLabel="Delete"
          cancelLabel="Cancel"
          danger
          isLoading={saving}
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void handleDelete(deleteTarget.id, deleteTarget.name)}
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={() => void handleImport()}
      />
    </Stack>
  );

  if (resolvedVariant === "dialog") {
    return (
      <Modal
        open
        onClose={() => onClose?.()}
        size="wide"
        fullScreenMobile
        ariaLabel="Lorebook Library"
      >
        <Header
          variant="section"
          icon="BookMarked"
          title="Lorebook Library"
          subtitle="Manage World Info lorebooks for prompt context injection."
          actions={
            <Stack direction="row" align="center" gap="sm">
              {!editorOpen ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon="Upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing || saving}
                    isLoading={importing}
                  >
                    {importing ? "Importing…" : "Import"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon="Plus"
                    onClick={startCreateLorebook}
                    disabled={importing || saving}
                  >
                    New Lorebook
                  </Button>
                </>
              ) : null}
              {onClose ? (
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Close
                </Button>
              ) : null}
            </Stack>
          }
        />
        <Modal.Body>
          <Modal.Content>{contentBody}</Modal.Content>
        </Modal.Body>
      </Modal>
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      <Header
        variant="page"
        title="Lorebook Library"
        subtitle="Manage World Info lorebooks for prompt context injection."
        actions={
          !editorOpen ? (
            <Stack direction="row" align="center" gap="sm">
              <Button
                variant="secondary"
                size="md"
                leftIcon="Upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing || saving}
                isLoading={importing}
              >
                {importing ? "Importing…" : "Import Lorebook"}
              </Button>
              <Button
                variant="primary"
                size="md"
                leftIcon="Plus"
                onClick={startCreateLorebook}
                disabled={importing || saving}
              >
                New Lorebook
              </Button>
            </Stack>
          ) : undefined
        }
      />
      {contentBody}
    </Stack>
  );
}
