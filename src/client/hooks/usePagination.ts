import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageSlice,
  parsePageSizeInput,
  rangeLabel,
  totalPagesFor,
  type PageSize
} from "../engine/pagination";
import { adoptLocalPreferences, updateViewPreferences, type PageSizeSurface } from "../api";
import type { ViewPreferences } from "../../schemas";

export type UsePaginationOptions<T> = {
  /** The caller's already filtered / sorted / grouped list. */
  items: T[];
  /**
   * Which list this pager is. The page size it keeps lives with every other preference, in the single
   * instance's settings (`viewPreferences.pageSizes`), so this hook no longer knows about device
   * storage: it reads the stored size once on mount and writes a change back.
   */
  persistAs: PageSizeSurface;
  /**
   * Page returns to 1 whenever any of these change (search text, sort field/direction, tag
   * filters…). Replaces the old scatter of `setCurrentPage(1)` calls in every handler.
   */
  resetDeps?: unknown[];
};

export type PaginationState<T> = {
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
  /** items.slice() for the current page ("all" returns everything). */
  pageItems: T[];
  /** "Showing 13–24 of 57" — append the noun in the UI. */
  label: string;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  /** Validates raw custom-input text; ignores unusable values (returns false). */
  commitCustomPageSize: (raw: string) => boolean;
};

/** The stored page size for one list, plus the writer for a change. */
function usePersistedPageSize(surface: PageSizeSurface): {
  pageSize: PageSize;
  write: (size: PageSize) => void;
} {
  const [pageSize, setPageSize] = useState<PageSize>(DEFAULT_PAGE_SIZE);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled) return;
      const stored = preferences.pageSizes?.[surface];
      if (stored !== undefined) setPageSize(stored);
    })().catch(() => {
      /* A failed read leaves the pager's own default. */
    });
    return () => {
      cancelled = true;
    };
  }, [surface]);

  const write = (size: PageSize) => {
    const patch: ViewPreferences["pageSizes"] = {};
    patch[surface] = size;
    void updateViewPreferences({ pageSizes: patch }).catch(() => {
      /* The next read reconciles; a failed write must not break the control. */
    });
  };

  return { pageSize, write };
}

export function usePagination<T>({
  items,
  persistAs,
  resetDeps = []
}: UsePaginationOptions<T>): PaginationState<T> {
  const stored = usePersistedPageSize(persistAs);
  const [pageSize, setPageSizeState] = useState<PageSize>(stored.pageSize);
  /** Set the moment the reader picks a size, so a read that lands afterwards cannot undo their choice. */
  const chosenRef = useRef(false);

  // The stored size may arrive AFTER the first paint (it is read from the server on mount), so the
  // pager adopts it once — unless the reader has already picked a size of their own.
  useEffect(() => {
    if (chosenRef.current) return;
    setPageSizeState(stored.pageSize);
  }, [stored.pageSize]);

  const [page, setPageState] = useState(1);

  const totalItems = items.length;
  const totalPages = totalPagesFor(totalItems, pageSize);

  const setPage = (next: number) => setPageState(clampPage(next, totalPages));

  const setPageSize = (size: PageSize) => {
    chosenRef.current = true;
    setPageSizeState(size);
    setPageState(1);
    stored.write(size);
  };

  const commitCustomPageSize = (raw: string): boolean => {
    const parsed = parsePageSizeInput(raw);
    if (parsed === null) return false;
    setPageSize(parsed);
    return true;
  };

  // Filters shrank the list past the current page → back to page 1 (the SetupView copy lacked this,
  // which left an empty grid after filtering).
  useEffect(() => {
    if (page > totalPages) setPageState(1);
  }, [page, totalPages]);

  // Reset when the caller's filter/sort identity changes. JSON-keyed so an inline array literal
  // doesn't re-fire every render.
  const resetKey = JSON.stringify(resetDeps);
  useEffect(() => {
    setPageState(1);
  }, [resetKey]);

  const pageItems = useMemo(
    () => pageSlice(items, page, pageSize),
    [items, page, pageSize]
  );

  return {
    page,
    pageSize,
    totalItems,
    totalPages,
    pageItems,
    label: rangeLabel(page, pageSize, totalItems),
    setPage,
    setPageSize,
    commitCustomPageSize
  };
}
