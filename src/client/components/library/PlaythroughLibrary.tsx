import { useCallback, useEffect, useMemo, useState } from "react";
import type { LoadFailure, Playthrough } from "../../../schemas";
import { listPlaythroughs, renamePlaythrough, type PlaythroughSummary } from "../../api";
import { usePagination } from "../../hooks/usePagination";
import { Badge, Button, CoverArt, Icon, Pagination, SearchBar, SimpleSelect } from "../base";
import { PlaythroughActionsMenu } from "../common/PlaythroughActionsMenu";

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

const VIEW_MODE_KEY = "bobbinloom_playthrough_view_mode";
const SORT_BY_KEY = "bobbinloom_playthrough_sort_by";
const SORT_DIR_KEY = "bobbinloom_playthrough_sort_dir";
/** Shared with the home screen's pager: one page size per device, whichever surface is open. */
const PAGE_SIZE_KEY = "bobbinloom_home_page_size";

export const PLAYTHROUGH_SORT_OPTIONS: { value: PlaythroughSortOption; label: string }[] = [
  { value: "updatedAt", label: "Updated Date" },
  { value: "name", label: "Name" },
  { value: "turn", label: "Turn" }
];

function readStored<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  if (typeof window !== "undefined" && window.localStorage) {
    const saved = localStorage.getItem(key);
    if (saved && (allowed as readonly string[]).includes(saved)) return saved as T;
  }
  return fallback;
}

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
  const [loading, setLoading] = useState(true);
  const [loadFailures, setLoadFailures] = useState<LoadFailure[]>([]);
  const [failuresDismissed, setFailuresDismissed] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState("");
  const [search, setSearch] = useState("");
  const [viewMode, setViewModeState] = useState<PlaythroughViewMode>(() =>
    readStored<PlaythroughViewMode>(VIEW_MODE_KEY, ["grid", "list"], "grid")
  );
  const [sortBy, setSortByState] = useState<PlaythroughSortOption>(() =>
    readStored<PlaythroughSortOption>(SORT_BY_KEY, ["updatedAt", "name", "turn"], "updatedAt")
  );
  const [sortDir, setSortDirState] = useState<"asc" | "desc">(() =>
    readStored<"asc" | "desc">(SORT_DIR_KEY, ["asc", "desc"], "desc")
  );

  const refresh = useCallback(async () => {
    try {
      const { playthroughs: list, failures } = await listPlaythroughs();
      setPlaythroughs(list);
      setLoadFailures(failures);
      setFailuresDismissed(false);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }, [onError]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  function setViewMode(mode: PlaythroughViewMode) {
    setViewModeState(mode);
    if (typeof window !== "undefined" && window.localStorage) localStorage.setItem(VIEW_MODE_KEY, mode);
  }

  function setSortBy(option: PlaythroughSortOption) {
    setSortByState(option);
    if (typeof window !== "undefined" && window.localStorage) localStorage.setItem(SORT_BY_KEY, option);
  }

  function toggleSortDirection() {
    const next: "asc" | "desc" = sortDir === "asc" ? "desc" : "asc";
    setSortDirState(next);
    if (typeof window !== "undefined" && window.localStorage) localStorage.setItem(SORT_DIR_KEY, next);
  }

  // The server sends the list newest-first; a name or turn sort is the client's, and a direction
  // flip is one reverse away. Search matches the two fields a card makes visible.
  const visible = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const filtered = needle
      ? playthroughs.filter(
          (p) =>
            p.name.toLowerCase().includes(needle) || p.locationName.toLowerCase().includes(needle)
        )
      : playthroughs;
    const sorted = [...filtered].sort((a, b) => {
      if (sortBy === "name") return a.name.localeCompare(b.name);
      if (sortBy === "turn") return a.turn - b.turn;
      return a.updatedAt.localeCompare(b.updatedAt);
    });
    return sortDir === "asc" ? sorted : sorted.reverse();
  }, [playthroughs, search, sortBy, sortDir]);

  const pager = usePagination({
    items: visible,
    storageKey: PAGE_SIZE_KEY,
    resetDeps: [search, sortBy, sortDir, viewMode]
  });

  function handleRenameRequest(id: string, name: string) {
    setRenamingId(id);
    setRenameDraft(name);
  }

  async function confirmRename(id: string) {
    if (!renameDraft.trim()) return;
    try {
      const updated = await renamePlaythrough(id, renameDraft.trim());
      setRenamingId(null);
      if (currentPlaythroughId === id) onCurrentRenamed?.(updated);
      // The route answers with the whole document; the list is a projection, so re-read it
      // rather than splicing a document into an array of summaries.
      await refresh();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  // The list arrives server-sorted by `updatedAt` desc, so the clone's position (and its
  // projected card) comes from the server — a locally prepended entry is the duplicate.
  function handleDuplicated() {
    void refresh();
  }

  function handleDeleted(id: string) {
    const remaining = playthroughs.filter((p) => p.id !== id);
    setPlaythroughs(remaining);
    if (currentPlaythroughId === id) {
      // The caller owns what happens next: it loads the first survivor, or goes home.
      onCurrentDeleted?.(remaining.map((p) => p.id));
    }
  }

  function renameField(id: string, name: string) {
    if (renamingId !== id) return null;
    return (
      <>
        <input
          className="rename-input"
          value={renameDraft}
          onChange={(e) => setRenameDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void confirmRename(id);
            if (e.key === "Escape") setRenamingId(null);
          }}
          onClick={(e) => e.stopPropagation()}
          autoFocus
        />
        <span className="rename-actions flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
          <span
            role="button"
            tabIndex={0}
            className="rename-action save"
            title="Save"
            onClick={() => void confirmRename(id)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                void confirmRename(id);
              }
            }}
          >
            <Icon name="Check" size={14} />
          </span>
          <span
            role="button"
            tabIndex={0}
            className="rename-action cancel"
            title="Cancel"
            onClick={() => setRenamingId(null)}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setRenamingId(null);
              }
            }}
          >
            <Icon name="X" size={14} />
          </span>
        </span>
      </>
    );
  }

  function openCard(id: string) {
    onOpen(id);
  }

  function cardKeyDown(e: React.KeyboardEvent, id: string) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      openCard(id);
    }
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

  const body = (
    <>
      {loading ? (
        <p className="home-loading">Loading playthroughs…</p>
      ) : visible.length === 0 ? (
        <div className="home-empty">
          {search ? (
            <>
              <p>No playthroughs match “{search}”.</p>
              <Button variant="secondary" onClick={() => setSearch("")}>
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
          {viewMode === "grid" ? (
            <div className="playthrough-grid">
              {pager.pageItems.map((p) => (
                <article
                  key={p.id}
                  className={`playthrough-card ${p.id === currentPlaythroughId ? "current" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCard(p.id)}
                  onKeyDown={(e) => cardKeyDown(e, p.id)}
                >
                  <div className="playthrough-card-cover">
                    <CoverArt cover={p.cover} size="card" />
                  </div>
                  <div className="playthrough-card-header">
                    {renamingId === p.id ? (
                      renameField(p.id, p.name)
                    ) : (
                      <>
                        <h3>{p.name}</h3>
                        <div className="playthrough-card-header-right">
                          {p.id === currentPlaythroughId ? currentBadge : null}
                          {actionsMenu(p)}
                        </div>
                      </>
                    )}
                  </div>
                  <div className="playthrough-card-meta">
                    <span className="inline-flex items-center gap-1">
                      <Icon name="MapPin" size={14} /> {p.locationName}
                    </span>
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
              {pager.pageItems.map((p) => (
                <div
                  key={p.id}
                  className={`playthrough-row ${p.id === currentPlaythroughId ? "current" : ""}`}
                  role="button"
                  tabIndex={0}
                  onClick={() => openCard(p.id)}
                  onKeyDown={(e) => cardKeyDown(e, p.id)}
                >
                  <div className="playthrough-row-cover">
                    <CoverArt cover={p.cover} size="thumb" />
                  </div>
                  <div className="playthrough-row-content">
                    <div className="playthrough-row-title-row">
                      {renamingId === p.id ? (
                        renameField(p.id, p.name)
                      ) : (
                        <>
                          <strong className="playthrough-row-title">{p.name}</strong>
                          {p.id === currentPlaythroughId ? currentBadge : null}
                        </>
                      )}
                    </div>
                    <div className="playthrough-card-meta">
                      <span className="inline-flex items-center gap-1">
                        <Icon name="MapPin" size={14} /> {p.locationName}
                      </span>
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
        placeholder="Search name or location…"
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
