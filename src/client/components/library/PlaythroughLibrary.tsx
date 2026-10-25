import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  LoadFailure,
  Playthrough,
  ViewPreferences,
} from "../../../schemas";
import {
  LIBRARY_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  applyLandscapeCardWidth,
  deletePlaythrough,
  duplicatePlaythrough,
  listPlaythroughs,
  listProviderConnections,
  renamePlaythrough,
  resolveLibraryPreferences,
  setTagTextProvider,
  suggestPlaythroughTags,
  updatePlaythroughTags,
  updateViewPreferences,
  type PlaythroughSummary,
  type ProviderRegistry,
  type ResolvedLibraryPreferences,
} from "../../api";
import { cleanTag } from "../../../engine/tagTaxonomy";
import {
  PLAYTHROUGH_BUILT_IN_CATEGORIES,
  SUGGESTED_PLAYTHROUGH_TAGS_BY_CATEGORY,
  canonicalizePlaythroughTag,
  sortPlaythroughTags,
} from "../../../engine/playthroughTagTaxonomy";
import { totalPagesFor, type PageSize } from "../../engine/pagination";
import { useServerPagination } from "../../hooks/useServerPagination";
import {
  ActionsMenu,
  Badge,
  Button,
  Card,
  CheckboxRow,
  CoverArt,
  FormGrid,
  Header,
  Icon,
  Modal,
  Pagination,
  SearchBar,
  Separator,
  SimpleSelect,
  Spinner,
  Stack,
  StatusMessage,
  Tabs,
  TagChip,
  TagInput,
  TagRow,
  TagSidebar,
  Text,
  TextInput,
  Tooltip,
} from "../base";
import { ConfirmModal } from "../common/ConfirmModal";
import { RenameModal } from "../common/RenameModal";

export type PlaythroughLibraryVariant = "page" | "dialog";
export type PlaythroughViewMode = "grid" | "list";
export type PlaythroughSortOption = "updatedAt" | "name" | "turn";

export type PlaythroughLibraryProps = {
  /** `page` renders inline in the workspace (the home screen); `dialog` renders the same shelf
   *  inside the modal shell, for switching stories from inside one (the play view). */
  variant: PlaythroughLibraryVariant;
  /** The playthrough currently installed. Its card is badged, and deleting it switches the
   *  caller to another one instead of leaving a dead view. */
  currentPlaythroughId?: string;
  onOpen: (id: string) => void;
  onNewPlaythrough?: () => void;
  onClose?: () => void;
  /** Ids of the playthroughs still present, in list order — the caller loads the first one.
   *  Ids and not documents: this list is a projection, not full playthroughs. */
  onCurrentDeleted?: (remainingIds: string[]) => void;
  onCurrentRenamed?: (updated: Playthrough) => void;
  /** MUST be a stable reference (a `setError`), because it is a dependency of the initial read. */
  onError: (message: string) => void;
};

export const PLAYTHROUGH_SORT_OPTIONS: {
  value: PlaythroughSortOption;
  label: string;
}[] = [
  { value: "updatedAt", label: "Updated Date" },
  { value: "name", label: "Name" },
  { value: "turn", label: "Turn" },
];

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return (
      d.toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
        year: "numeric",
      }) +
      " " +
      d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" })
    );
  } catch {
    return iso;
  }
}

function formatShortDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return iso;
  }
}

/**
 * The playthrough shelf: one card contract, two surfaces.
 *
 * This is the only place a playthrough item is rendered. The home screen mounts it as a page and
 * the play view mounts the same component as a dialog, so a change to the card — like the cover or tags —
 * reaches both, and the save/load list it replaces cannot drift from the home grid it duplicated.
 */
export function PlaythroughLibrary(props: PlaythroughLibraryProps) {
  const {
    variant,
    currentPlaythroughId,
    onOpen,
    onNewPlaythrough,
    onClose,
    onCurrentDeleted,
    onCurrentRenamed,
    onError,
  } = props;

  const [playthroughs, setPlaythroughs] = useState<PlaythroughSummary[]>([]);
  const [globalTagCounts, setGlobalTagCounts] = useState<
    Array<{ tag: string; count: number }>
  >([]);
  const [selectedTags, setSelectedTags] = useState<string[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [loadFailures, setLoadFailures] = useState<LoadFailure[]>([]);
  const [failuresDismissed, setFailuresDismissed] = useState(false);

  // Rename dialog state
  const [renameTarget, setRenameTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);

  // Edit Tags modal state
  const [tagsTarget, setTagsTarget] = useState<{
    id: string;
    name: string;
    tags: string[];
  } | null>(null);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);

  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [prefsReady, setPrefsReady] = useState(false);
  const [viewMode, setViewModeState] = useState<PlaythroughViewMode>(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughViewMode,
  );
  const [sortBy, setSortByState] = useState<PlaythroughSortOption>(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughSortBy,
  );
  const [sortDir, setSortDirState] = useState<"asc" | "desc">(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughSortDir,
  );
  const [showFullTitle, setShowFullTitle] = useState<boolean>(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughShowFullTitle,
  );
  const [showAllTags, setShowAllTags] = useState<boolean>(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughShowAllTags,
  );

  useEffect(() => {
    if (!search) {
      setDebouncedSearch("");
      return;
    }
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
    }, 250);
    return () => clearTimeout(timer);
  }, [search]);

  const prefsTouchedRef = useRef(false);

  const writeShelfPreference = (patch: ViewPreferences["library"]) => {
    prefsTouchedRef.current = true;
    void updateViewPreferences({ library: patch }).catch(() => {});
  };

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled) return;
      const resolved: ResolvedLibraryPreferences =
        resolveLibraryPreferences(preferences);
      if (!prefsTouchedRef.current) {
        setViewModeState(resolved.playthroughViewMode);
        setSortByState(resolved.playthroughSortBy);
        setSortDirState(resolved.playthroughSortDir);
      }
      setShowFullTitle(resolved.playthroughShowFullTitle);
      setShowAllTags(resolved.playthroughShowAllTags);
      applyLandscapeCardWidth(resolved.playthroughCompactLandscape);
      setPrefsReady(true);
    })().catch(() => {
      if (!cancelled) setPrefsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePrefsUpdated(event: Event) {
      const detail = (
        event as CustomEvent<NonNullable<ViewPreferences["library"]>>
      ).detail;
      if (!detail) return;
      if (typeof detail.playthroughCompactLandscape === "boolean") {
        applyLandscapeCardWidth(detail.playthroughCompactLandscape);
      }
      if (typeof detail.playthroughShowFullTitle === "boolean") {
        setShowFullTitle(detail.playthroughShowFullTitle);
      }
      if (typeof detail.playthroughShowAllTags === "boolean") {
        setShowAllTags(detail.playthroughShowAllTags);
      }
    }
    window.addEventListener(
      "bobbinloom:library-prefs-updated",
      handlePrefsUpdated,
    );
    return () => {
      window.removeEventListener(
        "bobbinloom:library-prefs-updated",
        handlePrefsUpdated,
      );
    };
  }, []);

  const [totalPlaythroughs, setTotalPlaythroughs] = useState(0);

  const tagsKey = useMemo(() => selectedTags.join(","), [selectedTags]);

  const pager = useServerPagination({
    totalItems: totalPlaythroughs,
    persistAs: "home",
    resetDeps: [debouncedSearch, tagsKey, sortBy, sortDir],
  });

  const activeRequestRef = useRef(0);
  type PageCacheEntry = {
    list: PlaythroughSummary[];
    total: number;
    failures: LoadFailure[];
    tagCounts?: Array<{ tag: string; count: number }>;
  };
  const pageCacheRef = useRef<Map<string, PageCacheEntry>>(new Map());

  useEffect(() => {
    pageCacheRef.current.clear();
  }, [debouncedSearch, tagsKey, sortBy, sortDir, pager.pageSize]);

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      if (!prefsReady || !pager.isReady) return;

      const cacheKey = `${pager.page}:${pager.pageSize}:${debouncedSearch}:${tagsKey}:${sortBy}:${sortDir}`;
      if (!options?.force && pageCacheRef.current.has(cacheKey)) {
        const cached = pageCacheRef.current.get(cacheKey)!;
        setPlaythroughs(cached.list);
        setTotalPlaythroughs(cached.total);
        if (cached.tagCounts) {
          setGlobalTagCounts(cached.tagCounts);
        }
        setLoadFailures(cached.failures);
        setFailuresDismissed(false);
        setIsFetching(false);
        setInitialLoading(false);
        return;
      }

      const requestId = ++activeRequestRef.current;
      setIsFetching(true);
      try {
        const {
          playthroughs: list,
          failures,
          total,
          tagCounts,
        } = await listPlaythroughs({
          page: pager.page,
          pageSize: pager.pageSize,
          search: debouncedSearch || undefined,
          tags: selectedTags.length > 0 ? selectedTags : undefined,
          sortBy,
          sortDir,
        });
        if (requestId !== activeRequestRef.current) return;
        pageCacheRef.current.set(cacheKey, {
          list,
          total,
          failures,
          tagCounts,
        });
        setPlaythroughs(list);
        setTotalPlaythroughs(total);
        if (tagCounts) {
          setGlobalTagCounts(tagCounts);
        }
        setLoadFailures(failures);
        setFailuresDismissed(false);
      } catch (e) {
        if (requestId === activeRequestRef.current) {
          onError(e instanceof Error ? e.message : String(e));
        }
      } finally {
        if (requestId === activeRequestRef.current) {
          setIsFetching(false);
          setInitialLoading(false);
        }
      }
    },
    [
      pager.page,
      pager.pageSize,
      pager.isReady,
      debouncedSearch,
      tagsKey,
      selectedTags,
      sortBy,
      sortDir,
      prefsReady,
      onError,
    ],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function setViewMode(mode: PlaythroughViewMode) {
    setViewModeState(mode);
    writeShelfPreference({ playthroughViewMode: mode });
  }

  function setSortBy(option: PlaythroughSortOption) {
    setSortByState(option);
    writeShelfPreference({ playthroughSortBy: option });
  }

  function toggleSortDirection() {
    const next: "asc" | "desc" = sortDir === "asc" ? "desc" : "asc";
    setSortDirState(next);
    writeShelfPreference({ playthroughSortDir: next });
  }

  function toggleTagFilter(rawTag: string) {
    const norm = cleanTag(rawTag);
    if (!norm) return;
    setSelectedTags((prev) => {
      const exists = prev.some((t) => cleanTag(t) === norm);
      return exists
        ? prev.filter((t) => cleanTag(t) !== norm)
        : [...prev, norm];
    });
  }

  function handleClearSearch() {
    setSearch("");
    setDebouncedSearch("");
    setSelectedTags([]);
  }

  function handleRenameRequest(id: string, name: string) {
    setRenameError(null);
    setRenameTarget({ id, name });
  }

  async function submitRename(id: string, name: string) {
    if (!name.trim()) return;
    setRenameSaving(true);
    setRenameError(null);
    try {
      const updated = await renamePlaythrough(id, name.trim());
      setRenameTarget(null);
      if (currentPlaythroughId === id) onCurrentRenamed?.(updated);
      pageCacheRef.current.clear();
      await refresh({ force: true });
    } catch (e) {
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameSaving(false);
    }
  }

  function handleEditTagsRequest(id: string, name: string) {
    const item = playthroughs.find((p) => p.id === id);
    setTagsError(null);
    setTagsTarget({
      id,
      name,
      tags: item?.tags ?? [],
    });
  }

  async function submitTags(nextTags: string[]) {
    if (!tagsTarget) return;
    setTagsSaving(true);
    setTagsError(null);
    try {
      const updated = await updatePlaythroughTags(tagsTarget.id, nextTags);
      const normalized = sortPlaythroughTags(updated.tags ?? nextTags);
      setPlaythroughs((prev) =>
        prev.map((p) => (p.id === updated.id ? { ...p, tags: normalized } : p)),
      );
      if (currentPlaythroughId === updated.id) {
        onCurrentRenamed?.(updated);
      }
      setTagsTarget(null);
      pageCacheRef.current.clear();
      await refresh({ force: true });
    } catch (e) {
      setTagsError(e instanceof Error ? e.message : String(e));
    } finally {
      setTagsSaving(false);
    }
  }

  function handleDuplicated() {
    pageCacheRef.current.clear();
    void refresh({ force: true });
  }

  function handleDeleted(id: string) {
    pageCacheRef.current.clear();
    const remaining = playthroughs.filter((p) => p.id !== id);
    setPlaythroughs(remaining);
    setTotalPlaythroughs((prev) => Math.max(0, prev - 1));
    if (currentPlaythroughId === id) {
      onCurrentDeleted?.(remaining.map((p) => p.id));
    }
    void refresh({ force: true });
  }

  function openCard(id: string) {
    onOpen(id);
    onClose?.();
  }

  function handleNew() {
    onNewPlaythrough?.();
    onClose?.();
  }

  const effectiveTagCounts = useMemo(() => {
    if (globalTagCounts.length > 0) return globalTagCounts;
    const map = new Map<string, number>();
    for (const p of playthroughs) {
      for (const raw of p.tags ?? []) {
        const norm = cleanTag(raw);
        if (norm) map.set(norm, (map.get(norm) ?? 0) + 1);
      }
    }
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [globalTagCounts, playthroughs]);

  const renameDialog = renameTarget ? (
    <RenameModal
      title="Rename Playthrough"
      label="Playthrough name"
      initialValue={renameTarget.name}
      isSaving={renameSaving}
      errorMessage={renameError}
      onSave={(next) => {
        void submitRename(renameTarget.id, next);
      }}
      onCancel={() => {
        if (!renameSaving) {
          setRenameTarget(null);
          setRenameError(null);
        }
      }}
    />
  ) : null;

  const tagsDialog = tagsTarget ? (
    <PlaythroughTagsModal
      playthroughId={tagsTarget.id}
      playthroughName={tagsTarget.name}
      initialTags={tagsTarget.tags}
      libraryTags={effectiveTagCounts.map((t) => t.tag)}
      busy={tagsSaving}
      error={tagsError}
      onSave={(nextTags) => {
        void submitTags(nextTags);
      }}
      onClose={() => {
        if (!tagsSaving) {
          setTagsTarget(null);
          setTagsError(null);
        }
      }}
    />
  ) : null;

  const sortTooltipText =
    sortBy === "name"
      ? sortDir === "asc"
        ? "Sort A to Z (click for Z to A)"
        : "Sort Z to A (click for A to Z)"
      : sortDir === "desc"
        ? "Newest first (click for Oldest first)"
        : "Oldest first (click for Newest first)";

  const body = (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {loadFailures.length > 0 && !failuresDismissed ? (
        <LoadFailuresBanner
          failures={loadFailures}
          onDismiss={() => setFailuresDismissed(true)}
        />
      ) : null}

      <Stack direction="row" align="start" gap="lg" fullWidth stackBelow="md">
        <TagSidebar
          title="Tags"
          taxonomy="playthrough"
          tagCounts={effectiveTagCounts}
          activeTags={selectedTags}
          onToggleTag={toggleTagFilter}
          onClearTags={() => setSelectedTags([])}
          emptyMessage="No tagged playthroughs yet. Use 'Edit Tags' on any card to categorize stories."
        />

        <Stack direction="column" align="stretch" gap="sm" flex1 fullWidth>
          <Card variant="elevated" padding="xs" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              fullWidth
            >
              <SearchBar
                value={search}
                onChange={setSearch}
                onClear={handleClearSearch}
                placeholder="Search playthroughs by title or tag…"
                size="sm"
                flex1
                aria-label="Search playthroughs"
              />

              <SimpleSelect<PlaythroughSortOption>
                value={sortBy}
                onChange={setSortBy}
                options={PLAYTHROUGH_SORT_OPTIONS.map((option) => ({
                  value: option.value,
                  label: option.label,
                  icon: <Icon name="ArrowUpDown" size={12} />,
                }))}
                size="sm"
                aria-label="Sort playthroughs by"
                rightElement={
                  <Tooltip content={sortTooltipText}>
                    <Button
                      variant="secondary"
                      size="sm"
                      iconOnly
                      onClick={toggleSortDirection}
                      aria-label="Toggle sort order"
                    >
                      <Icon
                        name={
                          sortDir === "asc"
                            ? "ArrowUpNarrowWide"
                            : "ArrowDownWideNarrow"
                        }
                        size={14}
                      />
                    </Button>
                  </Tooltip>
                }
              />

              <Tabs<PlaythroughViewMode>
                variant="segmented"
                size="sm"
                activeTab={viewMode}
                onChange={setViewMode}
                ariaLabel="View mode"
                tabs={[
                  {
                    id: "grid",
                    label: "Grid",
                    icon: "LayoutGrid",
                  },
                  {
                    id: "list",
                    label: "List",
                    icon: "List",
                  },
                ]}
              />
            </Stack>
          </Card>

          <PlaythroughShelfContent
            initialLoading={initialLoading}
            isFetching={isFetching}
            total={totalPlaythroughs}
            playthroughs={playthroughs}
            search={search}
            selectedTags={selectedTags}
            viewMode={viewMode}
            showFullTitle={showFullTitle}
            showAllTags={showAllTags}
            currentPlaythroughId={currentPlaythroughId}
            page={pager.page}
            pageSize={pager.pageSize}
            onPageChange={pager.setPage}
            onPageSizeChange={pager.setPageSize}
            onCommitCustomPageSize={pager.commitCustomPageSize}
            onClearSearch={handleClearSearch}
            onToggleTag={toggleTagFilter}
            onNew={onNewPlaythrough ? handleNew : undefined}
            onSelect={openCard}
            onRenameRequest={handleRenameRequest}
            onEditTagsRequest={handleEditTagsRequest}
            onDuplicated={handleDuplicated}
            onDeleted={handleDeleted}
            onError={onError}
          />
        </Stack>
      </Stack>
    </Stack>
  );

  if (variant === "dialog") {
    return (
      <Modal
        open
        onClose={() => onClose?.()}
        size="wide"
        fullScreenMobile
        ariaLabel="Playthroughs"
      >
        <Header
          variant="section"
          icon="BookOpen"
          title="Playthroughs"
          subtitle="Open another story, filter by theme or setting tags, or manage this shelf."
          actions={
            <Stack direction="row" align="center" gap="sm">
              {onNewPlaythrough ? (
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleNew}
                  leftIcon="Plus"
                >
                  New Playthrough
                </Button>
              ) : null}
              <Button variant="secondary" size="sm" onClick={onClose}>
                Close
              </Button>
            </Stack>
          }
        />
        <Modal.Body>
          <Modal.Content>{body}</Modal.Content>
        </Modal.Body>
        {renameDialog}
        {tagsDialog}
      </Modal>
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      <Header
        variant="page"
        title="Playthroughs"
        subtitle="Resume an existing story, filter by theme or setting tags, or start a new adventure."
        actions={
          onNewPlaythrough ? (
            <Button
              variant="primary"
              size="md"
              onClick={handleNew}
              leftIcon="Plus"
            >
              New Playthrough
            </Button>
          ) : undefined
        }
      />

      {body}
      {renameDialog}
      {tagsDialog}
    </Stack>
  );
}

export type PlaythroughShelfContentProps = {
  initialLoading: boolean;
  isFetching: boolean;
  total: number;
  playthroughs: PlaythroughSummary[];
  search: string;
  selectedTags: string[];
  viewMode: PlaythroughViewMode;
  showFullTitle?: boolean;
  showAllTags?: boolean;
  currentPlaythroughId?: string;
  page: number;
  pageSize: PageSize;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: PageSize) => void;
  onCommitCustomPageSize?: (raw: string) => boolean;
  onClearSearch: () => void;
  onToggleTag: (tag: string) => void;
  onNew?: () => void;
  onSelect: (id: string) => void;
  onRenameRequest: (id: string, currentName: string) => void;
  onEditTagsRequest: (id: string, currentName: string) => void;
  onDuplicated: (clone: Playthrough) => void;
  onDeleted: (deletedId: string) => void;
  onError: (message: string) => void;
};

export function PlaythroughShelfContent(props: PlaythroughShelfContentProps) {
  const {
    initialLoading,
    isFetching,
    total,
    playthroughs,
    search,
    selectedTags,
    viewMode,
    showFullTitle = false,
    showAllTags = false,
    currentPlaythroughId,
    page,
    pageSize,
    onPageChange,
    onPageSizeChange,
    onCommitCustomPageSize,
    onClearSearch,
    onToggleTag,
    onNew,
    onSelect,
    onRenameRequest,
    onEditTagsRequest,
    onDuplicated,
    onDeleted,
    onError,
  } = props;

  const hasActiveFilters = Boolean(search.trim()) || selectedTags.length > 0;
  const totalPages = totalPagesFor(total, pageSize);

  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [deleteSaving, setDeleteSaving] = useState(false);

  async function handleDuplicate(id: string) {
    if (duplicatingId) return;
    setDuplicatingId(id);
    try {
      const clone = await duplicatePlaythrough(id);
      onDuplicated(clone);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDuplicatingId(null);
    }
  }

  async function confirmDelete() {
    if (!deleteTarget || deleteSaving) return;
    const targetId = deleteTarget.id;
    setDeleteSaving(true);
    try {
      await deletePlaythrough(targetId);
      setDeleteTarget(null);
      onDeleted(targetId);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setDeleteSaving(false);
    }
  }

  const paginationElement = (
    <Pagination
      page={page}
      pageSize={pageSize}
      total={total}
      onPageChange={onPageChange}
      onPageSizeChange={onPageSizeChange}
      onCommitCustomPageSize={onCommitCustomPageSize}
      itemLabel="playthroughs"
    />
  );

  if (initialLoading) {
    return (
      <Card variant="panel" padding="lg">
        <Stack direction="column" align="center" justify="center" gap="sm">
          <Spinner size={28} />
          <Text size="sm" tone="secondary">
            Loading playthroughs…
          </Text>
        </Stack>
      </Card>
    );
  }

  if (total === 0 && !hasActiveFilters) {
    return (
      <Card variant="panel" padding="lg">
        <Stack direction="column" align="center" gap="sm">
          <Text size="md" weight="semibold">
            No playthroughs yet
          </Text>
          <Text size="sm" tone="secondary" align="center">
            Start a new playthrough to generate a world and begin your story.
          </Text>
          {onNew ? (
            <Button variant="primary" size="md" onClick={onNew} leftIcon="Plus">
              New Playthrough
            </Button>
          ) : null}
        </Stack>
      </Card>
    );
  }

  if (total === 0) {
    return (
      <Card variant="panel" padding="lg">
        <Stack direction="column" align="center" gap="sm">
          <Text size="sm" tone="secondary">
            No playthroughs match your current search or tag filters.
          </Text>
          <Button variant="secondary" size="sm" onClick={onClearSearch}>
            Clear Filters
          </Button>
        </Stack>
      </Card>
    );
  }

  return (
    <Stack
      direction="column"
      align="stretch"
      gap="sm"
      fullWidth
      dimmed={isFetching}
    >
      {/* Top pagination only appears when there is more than 1 page */}
      {totalPages > 1 ? paginationElement : null}

      {viewMode === "grid" ? (
        <FormGrid cols="cards" gap="lg">
          {playthroughs.map((p) => (
            <PlaythroughCard
              key={p.id}
              playthrough={p}
              isCurrent={p.id === currentPlaythroughId}
              isDuplicating={duplicatingId === p.id}
              selectedTags={selectedTags}
              showFullTitle={showFullTitle}
              showAllTags={showAllTags}
              onSelect={onSelect}
              onToggleTag={onToggleTag}
              onRenameRequest={onRenameRequest}
              onEditTagsRequest={onEditTagsRequest}
              onDuplicateRequest={() => void handleDuplicate(p.id)}
              onDeleteRequest={() =>
                setDeleteTarget({ id: p.id, name: p.name })
              }
            />
          ))}
        </FormGrid>
      ) : (
        <Stack direction="column" align="stretch" gap="sm" fullWidth>
          {playthroughs.map((p) => (
            <PlaythroughRow
              key={p.id}
              playthrough={p}
              isCurrent={p.id === currentPlaythroughId}
              isDuplicating={duplicatingId === p.id}
              selectedTags={selectedTags}
              showFullTitle={showFullTitle}
              showAllTags={showAllTags}
              onSelect={onSelect}
              onToggleTag={onToggleTag}
              onRenameRequest={onRenameRequest}
              onEditTagsRequest={onEditTagsRequest}
              onDuplicateRequest={() => void handleDuplicate(p.id)}
              onDeleteRequest={() =>
                setDeleteTarget({ id: p.id, name: p.name })
              }
            />
          ))}
        </Stack>
      )}

      {/* Bottom pagination always appears when items exist */}
      {paginationElement}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete Playthrough"
          message={`Delete "${deleteTarget.name}"? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          isLoading={deleteSaving}
          onConfirm={() => {
            void confirmDelete();
          }}
          onCancel={() => {
            if (!deleteSaving) {
              setDeleteTarget(null);
            }
          }}
        />
      ) : null}
    </Stack>
  );
}

type ItemProps = {
  playthrough: PlaythroughSummary;
  isCurrent: boolean;
  isDuplicating: boolean;
  selectedTags: string[];
  showFullTitle: boolean;
  showAllTags: boolean;
  onSelect: (id: string) => void;
  onToggleTag: (tag: string) => void;
  onRenameRequest: (id: string, currentName: string) => void;
  onEditTagsRequest: (id: string, currentName: string) => void;
  onDuplicateRequest: () => void;
  onDeleteRequest: () => void;
};

const useIsomorphicLayoutEffect =
  typeof window !== "undefined" ? useLayoutEffect : useEffect;

function PlaythroughInfoRow({
  turn,
  chapterCount,
  castCount,
  imageCount,
  updatedAt,
  defaultCompact = false,
  stackDateOnMobile = false,
}: {
  turn: number;
  chapterCount: number;
  castCount: number;
  imageCount: number;
  updatedAt: string;
  defaultCompact?: boolean;
  stackDateOnMobile?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const badgesMeasureRef = useRef<HTMLSpanElement | null>(null);
  const [isClient, setIsClient] = useState(false);
  const [isCompact, setIsCompact] = useState(defaultCompact);

  const turnLabel = `Turn ${turn}`;
  const chapterLabel = `${chapterCount} ${chapterCount === 1 ? "chapter" : "chapters"}`;
  const castLabel = `${castCount} cast`;
  const castTooltipLabel = `${castCount} ${castCount === 1 ? "cast member" : "cast members"}`;
  const imageLabel = `${imageCount} ${imageCount === 1 ? "image" : "images"}`;
  const fullDate = formatDate(updatedAt);
  const shortDate = formatShortDate(updatedAt);

  const recalculate = useCallback(() => {
    const container = containerRef.current;
    const measure = measureRef.current;
    if (!container || !measure) return;
    const availableWidth = container.clientWidth;
    if (availableWidth <= 0) return;
    const isStackedMobile =
      stackDateOnMobile &&
      typeof window !== "undefined" &&
      window.innerWidth <= 680;
    const neededWidth =
      isStackedMobile && badgesMeasureRef.current
        ? badgesMeasureRef.current.scrollWidth + 4
        : measure.scrollWidth + 10;
    setIsCompact(neededWidth > availableWidth);
  }, [stackDateOnMobile]);

  useIsomorphicLayoutEffect(() => {
    setIsClient(true);
  }, []);

  useIsomorphicLayoutEffect(() => {
    if (!isClient) return;
    recalculate();
  }, [
    isClient,
    recalculate,
    turn,
    chapterCount,
    castCount,
    imageCount,
    updatedAt,
  ]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(() => {
      recalculate();
    });
    observer.observe(container);
    return () => observer.disconnect();
  }, [recalculate]);

  return (
    <Stack
      ref={containerRef}
      direction="row"
      align="center"
      justify="between"
      gap="2xs"
      wrap
      stackBelow={stackDateOnMobile ? "sm" : undefined}
      fullWidth
    >
      <Card.Interactive>
        <Stack direction="row" align="center" gap="2xs" wrap>
          <Tooltip content={turnLabel} disabled={!isCompact}>
            <span aria-label={turnLabel}>
              <Badge variant="neutral" size="xs" leftIcon="Clock">
                {isCompact ? turn : turnLabel}
              </Badge>
            </span>
          </Tooltip>
          <Tooltip content={chapterLabel} disabled={!isCompact}>
            <span aria-label={chapterLabel}>
              <Badge variant="neutral" size="xs" leftIcon="BookOpen">
                {isCompact ? chapterCount : chapterLabel}
              </Badge>
            </span>
          </Tooltip>
          <Tooltip content={castTooltipLabel} disabled={!isCompact}>
            <span aria-label={castTooltipLabel}>
              <Badge variant="neutral" size="xs" leftIcon="Users">
                {isCompact ? castCount : castLabel}
              </Badge>
            </span>
          </Tooltip>
          <Tooltip content={imageLabel} disabled={!isCompact}>
            <span aria-label={imageLabel}>
              <Badge variant="neutral" size="xs" leftIcon="Image">
                {isCompact ? imageCount : imageLabel}
              </Badge>
            </span>
          </Tooltip>
        </Stack>
      </Card.Interactive>

      <Card.Interactive>
        <Tooltip content={fullDate} disabled={!isCompact}>
          <Text as="span" size="xs" tone="muted" truncate>
            {isCompact ? shortDate : fullDate}
          </Text>
        </Tooltip>
      </Card.Interactive>

      {isClient ? (
        <div
          ref={measureRef}
          className="base-tag-row__measure"
          aria-hidden="true"
        >
          <span
            ref={badgesMeasureRef}
            className="base-stack base-stack--row base-stack--align-center base-stack--gap-2xs"
          >
            <Badge variant="neutral" size="xs" leftIcon="Clock">
              {turnLabel}
            </Badge>
            <Badge variant="neutral" size="xs" leftIcon="BookOpen">
              {chapterLabel}
            </Badge>
            <Badge variant="neutral" size="xs" leftIcon="Users">
              {castLabel}
            </Badge>
            <Badge variant="neutral" size="xs" leftIcon="Image">
              {imageLabel}
            </Badge>
          </span>
          <Text as="span" size="xs" tone="muted">
            {fullDate}
          </Text>
        </div>
      ) : null}
    </Stack>
  );
}

function PlaythroughCard(props: ItemProps) {
  const {
    playthrough: p,
    isCurrent,
    isDuplicating,
    selectedTags,
    showFullTitle,
    showAllTags,
    onSelect,
    onToggleTag,
    onRenameRequest,
    onEditTagsRequest,
    onDuplicateRequest,
    onDeleteRequest,
  } = props;

  const tags = p.tags ?? [];
  const chapterCount = p.chapterCount ?? 1;
  const imageCount = p.imageCount ?? 0;

  return (
    <Card
      as="article"
      variant="panel"
      padding="sm"
      layout="column"
      hoverable
      active={isCurrent}
    >
      <Card.Cover position="top">
        <CoverArt cover={p.cover} size="card" />
      </Card.Cover>

      <Stack direction="column" align="stretch" gap="xs" fullWidth>
        <Stack
          direction="row"
          align="start"
          justify="between"
          gap="xs"
          fullWidth
        >
          <Card.TitleButton
            onClick={() => onSelect(p.id)}
            aria-current={isCurrent ? "true" : undefined}
          >
            <Text
              as="span"
              size="md"
              weight="bold"
              align="left"
              lineClamp={showFullTitle ? undefined : 2}
              reserveLines={!showFullTitle}
            >
              {p.name}
            </Text>
          </Card.TitleButton>

          <Card.Interactive>
            {isCurrent ? (
              <Badge variant="accent" size="xs" pill>
                Current
              </Badge>
            ) : null}
            <ActionsMenu
              label="More options"
              items={[
                {
                  label: "Rename",
                  icon: "Pencil",
                  onClick: () => onRenameRequest(p.id, p.name),
                },
                {
                  label: "Edit Tags",
                  icon: "Tag",
                  onClick: () => onEditTagsRequest(p.id, p.name),
                },
                {
                  label: isDuplicating ? "Duplicating…" : "Duplicate",
                  icon: "Copy",
                  disabled: isDuplicating,
                  onClick: onDuplicateRequest,
                },
                {
                  label: "Delete",
                  icon: "Trash2",
                  danger: true,
                  onClick: onDeleteRequest,
                },
              ]}
            />
          </Card.Interactive>
        </Stack>

        <PlaythroughInfoRow
          defaultCompact
          turn={p.turn}
          chapterCount={chapterCount}
          castCount={p.castCount}
          imageCount={imageCount}
          updatedAt={p.updatedAt}
        />

        <Separator spacing="none" />

        <TagRow
          tags={tags}
          activeTags={selectedTags}
          taxonomy="playthrough"
          wrapAll={showAllTags}
          onToggleTag={onToggleTag}
          onEditTags={() => onEditTagsRequest(p.id, p.name)}
        />

        <Text
          as="p"
          size="xs"
          tone={p.visibleMessageCount === 0 ? "muted" : "secondary"}
          lineClamp={2}
          reserveLines
        >
          {p.visibleMessageCount === 0
            ? "No messages yet"
            : `${p.lastMessagePreview}${p.lastMessagePreview.length >= 120 ? "…" : ""}`}
        </Text>
      </Stack>
    </Card>
  );
}

function PlaythroughRow(props: ItemProps) {
  const {
    playthrough: p,
    isCurrent,
    isDuplicating,
    selectedTags,
    showFullTitle,
    showAllTags,
    onSelect,
    onToggleTag,
    onRenameRequest,
    onEditTagsRequest,
    onDuplicateRequest,
    onDeleteRequest,
  } = props;

  const tags = p.tags ?? [];
  const chapterCount = p.chapterCount ?? 1;
  const imageCount = p.imageCount ?? 0;

  return (
    <Card
      as="article"
      variant="panel"
      padding="sm"
      layout="row"
      hoverable
      active={isCurrent}
    >
      <Card.Cover position="row">
        <CoverArt cover={p.cover} size="thumb" />
      </Card.Cover>

      <Stack direction="column" align="stretch" gap="xs" flex1 fullWidth>
        <Stack
          direction="row"
          align="start"
          justify="between"
          gap="sm"
          fullWidth
        >
          <Card.TitleButton
            onClick={() => onSelect(p.id)}
            aria-current={isCurrent ? "true" : undefined}
          >
            <Text
              as="span"
              size="md"
              weight="bold"
              align="left"
              lineClamp={showFullTitle ? undefined : 2}
              reserveLines={!showFullTitle}
            >
              {p.name}
            </Text>
          </Card.TitleButton>

          <Card.Interactive>
            {isCurrent ? (
              <Badge variant="accent" size="xs" pill>
                Current
              </Badge>
            ) : null}
            <ActionsMenu
              label="More options"
              items={[
                {
                  label: "Rename",
                  icon: "Pencil",
                  onClick: () => onRenameRequest(p.id, p.name),
                },
                {
                  label: "Edit Tags",
                  icon: "Tag",
                  onClick: () => onEditTagsRequest(p.id, p.name),
                },
                {
                  label: isDuplicating ? "Duplicating…" : "Duplicate",
                  icon: "Copy",
                  disabled: isDuplicating,
                  onClick: onDuplicateRequest,
                },
                {
                  label: "Delete",
                  icon: "Trash2",
                  danger: true,
                  onClick: onDeleteRequest,
                },
              ]}
            />
          </Card.Interactive>
        </Stack>

        <PlaythroughInfoRow
          stackDateOnMobile
          turn={p.turn}
          chapterCount={chapterCount}
          castCount={p.castCount}
          imageCount={imageCount}
          updatedAt={p.updatedAt}
        />

        <Separator spacing="none" />

        <TagRow
          tags={tags}
          activeTags={selectedTags}
          taxonomy="playthrough"
          initialMaxVisible={6}
          wrapAll={showAllTags}
          onToggleTag={onToggleTag}
          onEditTags={() => onEditTagsRequest(p.id, p.name)}
        />

        <Text
          as="p"
          size="xs"
          tone={p.visibleMessageCount === 0 ? "muted" : "secondary"}
          lineClamp={2}
          reserveLines
        >
          {p.visibleMessageCount === 0
            ? "No messages yet"
            : `${p.lastMessagePreview}${p.lastMessagePreview.length >= 120 ? "…" : ""}`}
        </Text>
      </Stack>
    </Card>
  );
}

type PlaythroughTagsModalProps = {
  playthroughId: string;
  playthroughName: string;
  initialTags: string[];
  libraryTags: string[];
  busy: boolean;
  error: string | null;
  onSave: (tags: string[]) => void;
  onClose: () => void;
};

type StagedAiTagResult = {
  added: string[];
  kept: string[];
  removed: string[];
};

function PlaythroughTagsModal({
  playthroughId,
  playthroughName,
  initialTags,
  libraryTags,
  busy,
  error,
  onSave,
  onClose,
}: PlaythroughTagsModalProps) {
  const [draftTags, setDraftTags] = useState<string[]>(() =>
    sortPlaythroughTags(initialTags),
  );
  const [activeCategory, setActiveCategory] = useState<
    "theme" | "setting" | "trope"
  >("theme");
  const [filterQuery, setFilterQuery] = useState("");

  // AI Tagging state
  const [aiPanelOpen, setAiPanelOpen] = useState(false);
  const [providerRegistry, setProviderRegistry] =
    useState<ProviderRegistry | null>(null);
  const [includeWorldState, setIncludeWorldState] = useState(true);
  const [includeCastAndPersona, setIncludeCastAndPersona] = useState(true);
  const [includeChaptersAndTimeline, setIncludeChaptersAndTimeline] =
    useState(true);
  const [includeCurrentChapterMessages, setIncludeCurrentChapterMessages] =
    useState(true);
  const [aiGuidance, setAiGuidance] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [stagedAi, setStagedAi] = useState<StagedAiTagResult | null>(null);
  const [stagedSelectedSet, setStagedSelectedSet] = useState<Set<string>>(
    () => new Set(),
  );
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(() => {
    if (!aiPanelOpen || providerRegistry) return;
    listProviderConnections()
      .then(setProviderRegistry)
      .catch(() => {
        // Non-fatal; falls back to server-side provider resolution
      });
  }, [aiPanelOpen, providerRegistry]);

  const textConnections = useMemo(
    () =>
      (providerRegistry?.connections ?? []).filter((c) => c.kind === "text"),
    [providerRegistry],
  );

  const activeTextProvider = useMemo(
    () =>
      textConnections.find(
        (c) => c.id === providerRegistry?.activeTextProviderId,
      ),
    [textConnections, providerRegistry?.activeTextProviderId],
  );

  const tagProviderOptions = useMemo(
    () => [
      {
        value: "",
        label: activeTextProvider
          ? `Follow active (${activeTextProvider.label})`
          : "Follow active text provider",
      },
      ...textConnections.map((c) => ({ value: c.id, label: c.label })),
    ],
    [textConnections, activeTextProvider],
  );

  const selectedTagProviderId = providerRegistry?.tagTextProviderId ?? "";

  function handleTagProviderOverrideChange(nextId: string) {
    const normalized = nextId || null;
    setProviderRegistry((prev) =>
      prev ? { ...prev, tagTextProviderId: normalized } : prev,
    );
    void setTagTextProvider(normalized)
      .then(setProviderRegistry)
      .catch((err) => {
        setAiError(err instanceof Error ? err.message : String(err));
      });
  }

  useEffect(() => {
    return () => {
      abortControllerRef.current?.abort();
    };
  }, []);

  const activeSet = useMemo(
    () => new Set(draftTags.map((t) => canonicalizePlaythroughTag(t))),
    [draftTags],
  );

  function toggleSuggestedTag(tag: string) {
    const norm = canonicalizePlaythroughTag(tag);
    if (!norm) return;
    setDraftTags((prev) => {
      const exists = prev.some((t) => canonicalizePlaythroughTag(t) === norm);
      const next = exists
        ? prev.filter((t) => canonicalizePlaythroughTag(t) !== norm)
        : [...prev, norm];
      return sortPlaythroughTags(next);
    });
  }

  async function handleGenerateAiTags() {
    abortControllerRef.current?.abort();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAiLoading(true);
    setAiError(null);

    try {
      const res = await suggestPlaythroughTags(
        playthroughId,
        {
          providerId: selectedTagProviderId || undefined,
          currentTags: draftTags,
          libraryTags,
          guidance: aiGuidance.trim() || undefined,
          includeWorldState,
          includeCastAndPersona,
          includeChaptersAndTimeline,
          includeCurrentChapterMessages,
        },
        controller.signal,
      );

      const normalizedSuggestions = Array.from(
        new Set(res.tags.map((t) => canonicalizePlaythroughTag(t)).filter(Boolean)),
      );
      const suggestedSet = new Set(normalizedSuggestions);
      const currentNormalized = draftTags
        .map((t) => canonicalizePlaythroughTag(t))
        .filter(Boolean);
      const currentSet = new Set(currentNormalized);

      const added = sortPlaythroughTags(
        normalizedSuggestions.filter((t) => !currentSet.has(t)),
      );
      const kept = sortPlaythroughTags(
        currentNormalized.filter((t) => suggestedSet.has(t)),
      );
      const removed = sortPlaythroughTags(
        currentNormalized.filter((t) => !suggestedSet.has(t)),
      );

      setStagedAi({ added, kept, removed });
      // Default selection: all new additions + confirmed existing tags checked; suggested removals unchecked
      setStagedSelectedSet(new Set([...added, ...kept]));
    } catch (e) {
      if (controller.signal.aborted) return;
      const msg = e instanceof Error ? e.message : String(e);
      if (!msg.toLowerCase().includes("abort")) {
        setAiError(msg);
      }
    } finally {
      if (abortControllerRef.current === controller) {
        setAiLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  function handleCancelAiRequest() {
    abortControllerRef.current?.abort();
    abortControllerRef.current = null;
    setAiLoading(false);
  }

  function toggleStagedTag(tag: string) {
    const norm = canonicalizePlaythroughTag(tag);
    if (!norm) return;
    setStagedSelectedSet((prev) => {
      const next = new Set(prev);
      if (next.has(norm)) {
        next.delete(norm);
      } else {
        next.add(norm);
      }
      return next;
    });
  }

  function handleRevertStagedAi() {
    setStagedAi(null);
    setStagedSelectedSet(new Set());
    setAiError(null);
  }

  function handleApplyStagedToDraft() {
    if (!stagedAi) return;
    const nextTags = sortPlaythroughTags(Array.from(stagedSelectedSet));
    setDraftTags(nextTags);
    setStagedAi(null);
    setStagedSelectedSet(new Set());
  }

  function handleSaveAndApplyStaged() {
    if (!stagedAi) return;
    const nextTags = sortPlaythroughTags(Array.from(stagedSelectedSet));
    setDraftTags(nextTags);
    onSave(nextTags);
  }

  const categorySuggestions = useMemo(() => {
    const rawList = SUGGESTED_PLAYTHROUGH_TAGS_BY_CATEGORY[activeCategory];
    const q = filterQuery.trim().toLowerCase();
    const normQ = cleanTag(q);
    if (!q) return rawList;
    return rawList.filter(
      (t) => t.includes(q) || (normQ && cleanTag(t).includes(normQ)),
    );
  }, [activeCategory, filterQuery]);

  const categoryMeta = useMemo(
    () => PLAYTHROUGH_BUILT_IN_CATEGORIES.find((c) => c.id === activeCategory),
    [activeCategory],
  );

  return (
    <Modal
      open
      onClose={onClose}
      size="lg"
      fullScreenMobile
      ariaLabel={`Edit tags for ${playthroughName}`}
    >
      <Header
        variant="section"
        icon="Tag"
        title={`Edit Tags — ${playthroughName}`}
        subtitle="Assign themes, settings, tropes, or use AI to analyze the story and suggest tags."
        actions={
          <Button
            variant={aiPanelOpen ? "primary" : "secondary"}
            size="sm"
            leftIcon="Sparkles"
            disabled={busy}
            onClick={() => setAiPanelOpen((v) => !v)}
          >
            {aiPanelOpen ? "Hide AI Tagger" : "Edit Tags with AI"}
          </Button>
        }
      />
      <Modal.Body>
        <Modal.Content>
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            {error ? (
              <StatusMessage variant="banner" tone="err">
                {error}
              </StatusMessage>
            ) : null}

            <Stack direction="column" align="stretch" gap="xs" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="xs"
                fullWidth
              >
                <Text size="xs" weight="semibold" tone="secondary">
                  Assigned Tags ({draftTags.length})
                </Text>
                {draftTags.length > 0 ? (
                  <Button
                    variant="ghost"
                    size="xs"
                    disabled={busy || aiLoading}
                    onClick={() => setDraftTags([])}
                  >
                    Clear All
                  </Button>
                ) : null}
              </Stack>
              <TagInput
                value={draftTags}
                onChange={(next) => setDraftTags(sortPlaythroughTags(next))}
                taxonomy="playthrough"
                disabled={busy || aiLoading}
                placeholder="Type a tag (e.g. horror, workplace, femdom, theme:noir) and press Enter…"
              />
              <Text size="xs" tone="muted">
                Tip: Built-in keywords automatically color-code into Theme,
                Setting, or Trope. You can also prefix custom tags with{" "}
                <code>theme:</code>, <code>setting:</code>, or{" "}
                <code>trope:</code>.
              </Text>
            </Stack>

            {aiPanelOpen ? (
              <Card variant="elevated" padding="md" fullWidth>
                <Stack direction="column" align="stretch" gap="sm" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    wrap
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs">
                      <Icon
                        name="Sparkles"
                        size={15}
                        className="ds-icon-accent"
                      />
                      <Text size="sm" weight="semibold">
                        Edit Tags with AI
                      </Text>
                    </Stack>
                    <Badge variant="outline" size="xs">
                      Uses Built-in + Shelf Taxonomy
                    </Badge>
                  </Stack>

                  <Text size="xs" tone="secondary">
                    Choose which story context the AI should review to suggest
                    relevant Theme, Setting, and Trope tags (and flag any
                    irrelevant existing tags for removal).
                  </Text>

                  <SimpleSelect
                    label="AI Tagging Provider"
                    labelIcon="Sliders"
                    size="sm"
                    variant="filled"
                    fullWidth
                    value={selectedTagProviderId}
                    options={tagProviderOptions}
                    disabled={
                      aiLoading || busy || textConnections.length === 0
                    }
                    onChange={handleTagProviderOverrideChange}
                    aria-label="AI Tagging Provider Override"
                  />

                  <FormGrid cols={2} gap="xs">
                    <CheckboxRow
                      icon="Globe"
                      title="World State & Premise"
                      description="Scenario setup and active world state entries."
                      checked={includeWorldState}
                      disabled={aiLoading || busy}
                      onChange={(e) => setIncludeWorldState(e.target.checked)}
                    />
                    <CheckboxRow
                      icon="Users"
                      title="Player Persona & Cast"
                      description="Player details, main cast sheets, and NPCs."
                      checked={includeCastAndPersona}
                      disabled={aiLoading || busy}
                      onChange={(e) =>
                        setIncludeCastAndPersona(e.target.checked)
                      }
                    />
                    <CheckboxRow
                      icon="BookOpen"
                      title="Chapters & Event Timeline"
                      description="Archived chapter summaries and memory events."
                      checked={includeChaptersAndTimeline}
                      disabled={aiLoading || busy}
                      onChange={(e) =>
                        setIncludeChaptersAndTimeline(e.target.checked)
                      }
                    />
                    <CheckboxRow
                      icon="MessageSquare"
                      title="Current Chapter Chat History"
                      description="Visible messages from the active chapter."
                      checked={includeCurrentChapterMessages}
                      disabled={aiLoading || busy}
                      onChange={(e) =>
                        setIncludeCurrentChapterMessages(e.target.checked)
                      }
                    />
                  </FormGrid>

                  <TextInput
                    label="Custom Focus / Guidance (Optional)"
                    labelIcon="Compass"
                    size="sm"
                    value={aiGuidance}
                    onChange={(e) => setAiGuidance(e.target.value)}
                    disabled={aiLoading || busy}
                    placeholder="e.g. Focus on dark fantasy themes, or invent new setting tags for the floating city…"
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !aiLoading && !busy) {
                        e.preventDefault();
                        void handleGenerateAiTags();
                      }
                    }}
                    rightElement={
                      <Stack direction="row" align="center" gap="xs">
                        {aiLoading ? (
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="X"
                            onClick={handleCancelAiRequest}
                          >
                            Stop
                          </Button>
                        ) : null}
                        <Button
                          variant="primary"
                          size="sm"
                          leftIcon="Sparkles"
                          isLoading={aiLoading}
                          disabled={busy}
                          onClick={() => void handleGenerateAiTags()}
                        >
                          {stagedAi ? "Regenerate" : "Suggest Tags"}
                        </Button>
                      </Stack>
                    }
                  />

                  {aiError ? (
                    <StatusMessage
                      variant="banner"
                      tone="err"
                      onDismiss={() => setAiError(null)}
                    >
                      {aiError}
                    </StatusMessage>
                  ) : null}

                  {stagedAi ? (
                    <Card variant="panel" padding="sm" fullWidth>
                      <Stack
                        direction="column"
                        align="stretch"
                        gap="sm"
                        fullWidth
                      >
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          wrap
                          fullWidth
                        >
                          <Stack direction="row" align="center" gap="xs" wrap>
                            <Badge variant="accent" size="xs" leftIcon="Check">
                              Staging Area ({stagedSelectedSet.size} selected)
                            </Badge>
                            <Text size="xs" tone="secondary">
                              Click any tag chip below to toggle whether it will
                              be kept or applied.
                            </Text>
                          </Stack>

                          <Stack direction="row" align="center" gap="xs" wrap>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              onClick={() =>
                                setStagedSelectedSet(
                                  new Set([
                                    ...stagedAi.added,
                                    ...stagedAi.kept,
                                    ...stagedAi.removed,
                                  ]),
                                )
                              }
                            >
                              Select All
                            </Button>
                            <Button
                              variant="ghost"
                              size="xs"
                              disabled={busy}
                              onClick={() => setStagedSelectedSet(new Set())}
                            >
                              Deselect All
                            </Button>
                          </Stack>
                        </Stack>

                        {stagedAi.added.length > 0 ? (
                          <Stack
                            direction="column"
                            align="stretch"
                            gap="2xs"
                            fullWidth
                          >
                            <Text size="xs" weight="semibold" tone="primary">
                              + New AI Suggestions ({stagedAi.added.length})
                            </Text>
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              {stagedAi.added.map((tag) => (
                                <TagChip
                                  key={`add-${tag}`}
                                  tag={tag}
                                  size="sm"
                                  taxonomy="playthrough"
                                  active={stagedSelectedSet.has(
                                    canonicalizePlaythroughTag(tag),
                                  )}
                                  disabled={busy}
                                  onClick={() => toggleStagedTag(tag)}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        ) : null}

                        {stagedAi.kept.length > 0 ? (
                          <Stack
                            direction="column"
                            align="stretch"
                            gap="2xs"
                            fullWidth
                          >
                            <Text size="xs" weight="semibold" tone="secondary">
                              ✓ Confirmed Existing Tags ({stagedAi.kept.length})
                            </Text>
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              {stagedAi.kept.map((tag) => (
                                <TagChip
                                  key={`keep-${tag}`}
                                  tag={tag}
                                  size="sm"
                                  taxonomy="playthrough"
                                  active={stagedSelectedSet.has(
                                    canonicalizePlaythroughTag(tag),
                                  )}
                                  disabled={busy}
                                  onClick={() => toggleStagedTag(tag)}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        ) : null}

                        {stagedAi.removed.length > 0 ? (
                          <Stack
                            direction="column"
                            align="stretch"
                            gap="2xs"
                            fullWidth
                          >
                            <Text size="xs" weight="semibold" tone="warning">
                              − Suggested Removals (Unchecked = Remove, Click to
                              Keep) ({stagedAi.removed.length})
                            </Text>
                            <Stack
                              direction="row"
                              align="center"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              {stagedAi.removed.map((tag) => (
                                <TagChip
                                  key={`rem-${tag}`}
                                  tag={tag}
                                  size="sm"
                                  taxonomy="playthrough"
                                  active={stagedSelectedSet.has(
                                    canonicalizePlaythroughTag(tag),
                                  )}
                                  disabled={busy}
                                  onClick={() => toggleStagedTag(tag)}
                                />
                              ))}
                            </Stack>
                          </Stack>
                        ) : null}

                        <Separator spacing="none" />

                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          wrap
                          fullWidth
                        >
                          <Button
                            variant="secondary"
                            size="sm"
                            leftIcon="RotateCcw"
                            disabled={busy}
                            onClick={handleRevertStagedAi}
                          >
                            Cancel / Revert
                          </Button>
                          <Stack direction="row" align="center" gap="xs" wrap>
                            <Button
                              variant="secondary"
                              size="sm"
                              leftIcon="Check"
                              disabled={busy}
                              onClick={handleApplyStagedToDraft}
                            >
                              Apply to Draft
                            </Button>
                            <Button
                              variant="primary"
                              size="sm"
                              leftIcon="Sparkles"
                              isLoading={busy}
                              onClick={handleSaveAndApplyStaged}
                            >
                              Save & Apply ({stagedSelectedSet.size})
                            </Button>
                          </Stack>
                        </Stack>
                      </Stack>
                    </Card>
                  ) : null}
                </Stack>
              </Card>
            ) : null}

            <Separator spacing="none" />

            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                fullWidth
                stackBelow="sm"
              >
                <Tabs<"theme" | "setting" | "trope">
                  variant="segmented"
                  size="sm"
                  fullWidth
                  activeTab={activeCategory}
                  onChange={setActiveCategory}
                  tabs={[
                    { id: "theme", label: "Theme & Genre" },
                    { id: "setting", label: "Setting & Backdrop" },
                    { id: "trope", label: "Tropes & Dynamics" },
                  ]}
                />
                <SearchBar
                  size="sm"
                  flex1
                  value={filterQuery}
                  onChange={setFilterQuery}
                  placeholder="Filter suggestions…"
                  aria-label="Filter suggested tags"
                />
              </Stack>

              {categoryMeta?.description ? (
                <Text size="xs" tone="muted">
                  {categoryMeta.description}
                </Text>
              ) : null}

              <Card variant="elevated" padding="sm" fullWidth>
                <Stack
                  direction="row"
                  align="center"
                  gap="xs"
                  wrap
                  scrollable
                  fullWidth
                >
                  {categorySuggestions.length === 0 ? (
                    <Text size="xs" tone="muted">
                      No presets match &ldquo;{filterQuery}&rdquo;. Press Enter
                      in the field above to add it as a custom tag.
                    </Text>
                  ) : (
                    categorySuggestions.map((tag) => (
                      <TagChip
                        key={tag}
                        tag={tag}
                        size="sm"
                        taxonomy="playthrough"
                        active={activeSet.has(canonicalizePlaythroughTag(tag))}
                        disabled={busy}
                        onClick={() => toggleSuggestedTag(tag)}
                      />
                    ))
                  )}
                </Stack>
              </Card>
            </Stack>
          </Stack>
        </Modal.Content>
      </Modal.Body>
      <Modal.Footer>
        <Stack direction="row" align="center" justify="end" gap="sm">
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            isLoading={busy}
            onClick={() => onSave(draftTags)}
          >
            Save Tags
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}

function LoadFailuresBanner(props: {
  failures: LoadFailure[];
  onDismiss: () => void;
}) {
  const { failures, onDismiss } = props;
  return (
    <Card variant="elevated" padding="sm" dirty fullWidth role="alert">
      <Stack direction="column" align="stretch" gap="xs" fullWidth>
        <Stack
          direction="row"
          align="center"
          justify="between"
          gap="sm"
          fullWidth
        >
          <Text size="sm" weight="semibold" tone="warning">
            {failures.length === 1
              ? "1 playthrough file could not be loaded"
              : `${failures.length} playthrough files could not be loaded`}
          </Text>
          <Button variant="ghost" size="xs" onClick={onDismiss}>
            Dismiss
          </Button>
        </Stack>
        <Text size="xs" tone="secondary">
          Corrupt or unreadable files were moved aside to <code>.bak</code>{" "}
          backups so the rest of your library could load:
        </Text>
        <Stack as="ul" direction="column" align="stretch" gap="2xs">
          {failures.map((f) => (
            <Text key={f.id} as="span" size="xs" tone="secondary">
              <strong>{f.name}</strong> ({f.id}): {f.reason}
              {f.backupPath ? (
                <Text as="span" size="xs" tone="muted">
                  {" "}
                  — saved to <code>{f.backupPath}</code>
                </Text>
              ) : null}
            </Text>
          ))}
        </Stack>
      </Stack>
    </Card>
  );
}
