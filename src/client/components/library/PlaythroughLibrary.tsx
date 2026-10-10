import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { LoadFailure, Playthrough } from "../../../schemas";
import { listPlaythroughs, renamePlaythrough, type PlaythroughSummary } from "../../api";
import {
  LIBRARY_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveLibraryPreferences,
  updateViewPreferences
} from "../../api";
import type { ResolvedLibraryPreferences } from "../../api";
import type { ViewPreferences } from "../../../schemas";
import { useServerPagination } from "../../hooks/useServerPagination";
import { Badge, Button, CoverArt, Icon, Pagination, SearchBar, SimpleSelect, Spinner } from "../base";
import { PlaythroughActionsMenu } from "../common/PlaythroughActionsMenu";
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

/** Shared with the home screen's pager: one page size per device, whichever surface is open. */

export const PLAYTHROUGH_SORT_OPTIONS: { value: PlaythroughSortOption; label: string }[] = [
  { value: "updatedAt", label: "Updated Date" },
  { value: "name", label: "Name" },
  { value: "turn", label: "Turn" }
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

/**
 * The playthrough shelf: one card contract, two surfaces.
 *
 * This is the only place a playthrough item is rendered. The home screen mounts it as a page and
 * the play view mounts the same component as a dialog, so a change to the card — like the cover —
 * reaches both, and the save/load list it replaces cannot drift from the home grid it duplicated.
 *
 * The list itself is the server's summary projection: it carries no messages, snapshots or cast
 * sheets, which is why a card can be rendered from it and why opening one reads the document by
 * id instead of reusing what is already loaded.
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
    onError
  } = props;

  const [playthroughs, setPlaythroughs] = useState<PlaythroughSummary[]>([]);
  const [initialLoading, setInitialLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  const [loadFailures, setLoadFailures] = useState<LoadFailure[]>([]);
  const [failuresDismissed, setFailuresDismissed] = useState(false);
  // Which card is being renamed, and the dialog's own state. The draft lives in the dialog.
  const [renameTarget, setRenameTarget] = useState<{ id: string; name: string } | null>(null);
  const [renameSaving, setRenameSaving] = useState(false);
  const [renameError, setRenameError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [prefsReady, setPrefsReady] = useState(false);
  const [viewMode, setViewModeState] = useState<PlaythroughViewMode>(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughViewMode
  );
  const [sortBy, setSortByState] = useState<PlaythroughSortOption>(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughSortBy
  );
  const [sortDir, setSortDirState] = useState<"asc" | "desc">(
    LIBRARY_PREFERENCE_DEFAULTS.playthroughSortDir
  );

  /** Debounce search input to avoid firing requests on every keystroke. */
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

  /** Set the moment the reader changes any of these, so a read that lands later never overwrites what
   *  they just chose. */
  const prefsTouchedRef = useRef(false);

  /** One writer for the shelf's three preferences: state first so the click feels instant, then the
   *  leaves that changed. The device keeps nothing. This component is mounted twice when the play view
   *  is open (the shelf as a dialog over the home page's own), and both instances read the same
   *  server value, so the second mount is a no-op rather than a second source of truth. */
  const writeShelfPreference = (patch: ViewPreferences["library"]) => {
    prefsTouchedRef.current = true;
    void updateViewPreferences({ library: patch }).catch(() => {
      /* The next read reconciles; a failed write must not break the control. */
    });
  };

  // The shelf's layout lives on the server now (adopting whatever this device still holds first), so it
  // arrives after the first paint — while the list is still loading, which keeps the swap invisible.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled) return;
      if (!prefsTouchedRef.current) {
        const resolved: ResolvedLibraryPreferences = resolveLibraryPreferences(preferences);
        setViewModeState(resolved.playthroughViewMode);
        setSortByState(resolved.playthroughSortBy);
        setSortDirState(resolved.playthroughSortDir);
      }
      setPrefsReady(true);
    })().catch(() => {
      if (!cancelled) setPrefsReady(true);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const [totalPlaythroughs, setTotalPlaythroughs] = useState(0);

  const pager = useServerPagination({
    totalItems: totalPlaythroughs,
    persistAs: "home",
    resetDeps: [debouncedSearch, sortBy, sortDir]
  });

  const activeRequestRef = useRef(0);
  type PageCacheEntry = {
    list: PlaythroughSummary[];
    total: number;
    failures: LoadFailure[];
  };
  const pageCacheRef = useRef<Map<string, PageCacheEntry>>(new Map());

  // Invalidate page cache when search, sort, or page size changes
  useEffect(() => {
    pageCacheRef.current.clear();
  }, [debouncedSearch, sortBy, sortDir, pager.pageSize]);

  const refresh = useCallback(
    async (options?: { force?: boolean }) => {
      if (!prefsReady || !pager.isReady) return;

      const cacheKey = `${pager.page}:${pager.pageSize}:${debouncedSearch}:${sortBy}:${sortDir}`;
      if (!options?.force && pageCacheRef.current.has(cacheKey)) {
        const cached = pageCacheRef.current.get(cacheKey)!;
        setPlaythroughs(cached.list);
        setTotalPlaythroughs(cached.total);
        setLoadFailures(cached.failures);
        setFailuresDismissed(false);
        setIsFetching(false);
        setInitialLoading(false);
        return;
      }

      const requestId = ++activeRequestRef.current;
      setIsFetching(true);
      try {
        const { playthroughs: list, failures, total } = await listPlaythroughs({
          page: pager.page,
          pageSize: pager.pageSize,
          search: debouncedSearch,
          sortBy,
          sortDir
        });
        if (requestId !== activeRequestRef.current) return;
        pageCacheRef.current.set(cacheKey, { list, total, failures });
        setPlaythroughs(list);
        setTotalPlaythroughs(total);
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
    [pager.page, pager.pageSize, pager.isReady, debouncedSearch, sortBy, sortDir, prefsReady, onError]
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

  function handleRenameRequest(id: string, name: string) {
    setRenameError(null);
    setRenameTarget({ id, name });
  }

  function handleClearSearch() {
    setSearch("");
    setDebouncedSearch("");
  }

  async function submitRename(id: string, name: string) {
    if (!name.trim()) return;
    setRenameSaving(true);
    setRenameError(null);
    try {
      const updated = await renamePlaythrough(id, name.trim());
      setRenameTarget(null);
      if (currentPlaythroughId === id) onCurrentRenamed?.(updated);
      // The route answers with the whole document; the list is a projection, so re-read it
      // rather than splicing a document into an array of summaries.
      pageCacheRef.current.clear();
      await refresh({ force: true });
    } catch (e) {
      // A failed rename stays in the dialog that asked for it.
      setRenameError(e instanceof Error ? e.message : String(e));
    } finally {
      setRenameSaving(false);
    }
  }

  /** The rename dialog, rendered by the card it belongs to (a portal renders wherever it is declared). */
  function renameDialog(id: string, name: string) {
    return (
      <RenameModal
        title="Rename Playthrough"
        label="Playthrough name"
        initialValue={name}
        isSaving={renameSaving}
        errorMessage={renameError}
        onSave={(next) => { void submitRename(id, next); }}
        onCancel={() => setRenameTarget(null)}
      />
    );
  }

  // The list arrives server-sorted by `updatedAt` desc, so the clone's position (and its
  // projected card) comes from the server — a locally prepended entry is the duplicate.
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
      // The caller owns what happens next: it loads the first survivor, or goes home.
      onCurrentDeleted?.(remaining.map((p) => p.id));
    }
    void refresh({ force: true });
  }

  function openCard(id: string) {
    onOpen(id);
  }

  function actionsMenu(p: PlaythroughSummary) {
    return (
      <PlaythroughActionsMenu
        playthroughId={p.id}
        playthroughName={p.name}
        onRenameRequest={handleRenameRequest}
        onDuplicated={handleDuplicated}
        onDeleted={() => handleDeleted(p.id)}
        onError={onError}
      />
    );
  }

  const currentBadge =
    currentPlaythroughId !== undefined ? (
      <Badge variant="accent" size="xs" pill>
        Current
      </Badge>
    ) : null;

  const paginationElement = (
    <Pagination
      className="home-page-pagination"
      page={pager.page}
      pageSize={pager.pageSize}
      total={pager.totalItems}
      onPageChange={pager.setPage}
      onPageSizeChange={pager.setPageSize}
      onCommitCustomPageSize={pager.commitCustomPageSize}
      itemLabel="playthroughs"
    />
  );

  const hasPlaythroughs = totalPlaythroughs > 0;

  const body = (
    <>
      {initialLoading ? (
        <div className="home-loading flex justify-center py-12">
          <Spinner size={32} />
        </div>
      ) : !hasPlaythroughs ? (
        <div className="home-empty">
          {search ? (
            <>
              <p>No playthroughs match “{search}”.</p>
              <Button variant="secondary" onClick={handleClearSearch}>
                Clear search
              </Button>
            </>
          ) : (
            <>
              <p>No playthroughs yet. Create one to get started.</p>
              {onNewPlaythrough ? (
                <Button
                  variant="primary"
                  className="flex items-center gap-1.5 justify-center mx-auto"
                  onClick={onNewPlaythrough}
                  leftIcon={<Icon name="Plus" size={16} />}
                >
                  New Playthrough
                </Button>
              ) : null}
            </>
          )}
        </div>
      ) : (
        <>
          {paginationElement}
          <div className={`playthrough-shelf-content ${isFetching ? "is-fetching" : ""}`}>
            {viewMode === "grid" ? (
              <div className="playthrough-grid">
                {playthroughs.map((p) => (
                  <article
                    key={p.id}
                    className={`playthrough-card ${p.id === currentPlaythroughId ? "current" : ""}`}
                  >
                    <div className="playthrough-card-cover">
                      <CoverArt cover={p.cover} size="card" />
                    </div>
                    <div className="playthrough-card-header">
                      {/* The name is the navigation target: a real button, stretched over the card, so
                          nothing interactive is nested inside a button and Enter/Space come for free. */}
                      <h3 className="playthrough-card-title">
                        <button
                          type="button"
                          className="playthrough-card-open"
                          onClick={() => openCard(p.id)}
                          aria-current={p.id === currentPlaythroughId ? "true" : undefined}
                        >
                          {p.name}
                        </button>
                      </h3>
                      <div className="playthrough-card-header-right">
                        {p.id === currentPlaythroughId ? currentBadge : null}
                        {actionsMenu(p)}
                      </div>
                      {renameTarget?.id === p.id ? renameDialog(p.id, p.name) : null}
                    </div>
                    <div className="playthrough-card-meta">

                      <span>Turn {p.turn}</span>
                      <span className="inline-flex items-center gap-1">
                        <Icon name="User" size={14} /> {p.castCount}{" "}
                        {p.castCount === 1 ? "character" : "characters"}
                      </span>
                    </div>
                    <p className="playthrough-card-updated">Updated {formatDate(p.updatedAt)}</p>
                    {p.visibleMessageCount > 0 ? (
                      <p className="playthrough-card-preview">{p.lastMessagePreview}…</p>
                    ) : (
                      <p className="playthrough-card-preview">No messages yet.</p>
                    )}
                  </article>
                ))}
              </div>
            ) : (
              <div className="playthrough-list">
                {playthroughs.map((p) => (
                  <div
                    key={p.id}
                    className={`playthrough-row ${p.id === currentPlaythroughId ? "current" : ""}`}
                  >
                    <div className="playthrough-row-cover">
                      <CoverArt cover={p.cover} size="thumb" />
                    </div>
                    <div className="playthrough-row-content">
                      <div className="playthrough-row-title-row">
                        <strong className="playthrough-row-title">
                          <button
                            type="button"
                            className="playthrough-row-open"
                            onClick={() => openCard(p.id)}
                            aria-current={p.id === currentPlaythroughId ? "true" : undefined}
                          >
                            {p.name}
                          </button>
                        </strong>
                        {p.id === currentPlaythroughId ? currentBadge : null}
                        {renameTarget?.id === p.id ? renameDialog(p.id, p.name) : null}
                      </div>
                      <div className="playthrough-card-meta">

                        <span>Turn {p.turn}</span>
                        <span className="inline-flex items-center gap-1">
                          <Icon name="User" size={14} /> {p.castCount}{" "}
                          {p.castCount === 1 ? "character" : "characters"}
                        </span>
                        <span className="playthrough-row-updated">Updated {formatDate(p.updatedAt)}</span>
                      </div>
                      {p.visibleMessageCount > 0 ? (
                        <p className="playthrough-card-preview">{p.lastMessagePreview}…</p>
                      ) : (
                        <p className="playthrough-card-preview">No messages yet.</p>
                      )}
                    </div>
                    <div className="playthrough-row-actions">{actionsMenu(p)}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
          {paginationElement}
        </>
      )}
    </>
  );

  const failuresBanner =
    loadFailures.length > 0 && !failuresDismissed ? (
      <div className="load-failure-banner">
        <div className="load-failure-banner-header">
          <span>{loadFailures.length} playthrough(s) couldn&apos;t be loaded</span>
          <button
            className="load-failure-dismiss"
            onClick={() => setFailuresDismissed(true)}
            aria-label="Dismiss load warnings"
          >
            <Icon name="X" size={16} />
          </button>
        </div>
        <details className="load-failure-details">
          <summary>Details</summary>
          <ul>
            {loadFailures.map((f) => (
              <li key={f.id}>
                <strong>{f.name}</strong> — {f.reason}
                {f.backupPath ? <span className="load-failure-backup"> (backup: {f.backupPath})</span> : null}
              </li>
            ))}
          </ul>
        </details>
      </div>
    ) : null;

  const toolbar = (
    <div className="library-toolbar playthrough-library-toolbar">
      <div className="library-toolbar-actions">
        {onNewPlaythrough ? (
          <Button variant="primary" onClick={onNewPlaythrough} leftIcon={<Icon name="Plus" size={15} />}>
            New Playthrough
          </Button>
        ) : null}
      </div>

      <SearchBar
        value={search}
        onChange={setSearch}
        onClear={handleClearSearch}
        placeholder="Search playthroughs…"
        size="md"
        containerClassName="library-search-wrapper"
      />

      <div className="library-sort-control-group" role="group" aria-label="Sort playthroughs">
        <SimpleSelect<PlaythroughSortOption>
          value={sortBy}
          onChange={setSortBy}
          options={PLAYTHROUGH_SORT_OPTIONS.map((option) => ({
            value: option.value,
            label: option.label,
            icon: <Icon name="ArrowUpDown" size={12} />
          }))}
          size="xs"
          variant="ghost"
          aria-label="Sort playthroughs by"
        />
        <button
          type="button"
          className="library-sort-dir-btn"
          onClick={toggleSortDirection}
          title={
            sortBy === "name"
              ? sortDir === "asc"
                ? "Sort A to Z (click for Z to A)"
                : "Sort Z to A (click for A to Z)"
              : sortDir === "desc"
                ? "Newest first (click for Oldest first)"
                : "Oldest first (click for Newest first)"
          }
          aria-label="Toggle sort order"
        >
          <Icon name={sortDir === "asc" ? "ArrowUpNarrowWide" : "ArrowDownWideNarrow"} size={14} />
        </button>
      </div>

      <div className="view-mode-switcher" role="group" aria-label="View mode">
        <button
          type="button"
          className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
          onClick={() => setViewMode("grid")}
          title="Grid View"
        >
          <Icon name="LayoutGrid" size={16} />
          <span className="view-mode-label">Grid</span>
        </button>
        <button
          type="button"
          className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
          onClick={() => setViewMode("list")}
          title="List View"
        >
          <Icon name="List" size={16} />
          <span className="view-mode-label">List</span>
        </button>
      </div>
    </div>
  );

  if (variant === "dialog") {
    return (
      <div className="modal-backdrop" onClick={onClose}>
        <section
          className="modal playthrough-library-modal"
          onClick={(e) => e.stopPropagation()}
          aria-label="Playthroughs"
        >
          <header className="modal-header">
            <div>
              <h2>Playthroughs</h2>
              <p>Open another story, or manage this shelf.</p>
            </div>
            <button
              className="flex items-center gap-1 modal-close-btn"
              onClick={onClose}
              aria-label="Close playthroughs"
            >
              <Icon name="X" size={14} /> Close
            </button>
          </header>
          {toolbar}
          {failuresBanner}
          <div className="playthrough-library-body">{body}</div>
        </section>
      </div>
    );
  }

  return (
    <div className="playthrough-library">
      {toolbar}
      {failuresBanner}
      <div className="playthrough-library-body">{body}</div>
    </div>
  );
}
