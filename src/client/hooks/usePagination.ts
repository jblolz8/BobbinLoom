import { useEffect, useMemo, useState } from "react";
import {
  ALL_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  clampPage,
  pageSlice,
  parsePageSizeInput,
  parseStoredPageSize,
  rangeLabel,
  totalPagesFor,
  type PageSize
} from "../engine/pagination";

export type UsePaginationOptions<T> = {
  /** The caller's already filtered / sorted / grouped list. */
  items: T[];
  /** localStorage key for the persisted page size, e.g. "bobbinloom_library_page_size". */
  storageKey: string;
  defaultPageSize?: PageSize;
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

export function usePagination<T>({
  items,
  storageKey,
  defaultPageSize = DEFAULT_PAGE_SIZE,
  resetDeps = []
}: UsePaginationOptions<T>): PaginationState<T> {
  const [pageSize, setPageSizeState] = useState<PageSize>(() => {
    if (typeof window === "undefined" || !window.localStorage) return defaultPageSize;
    try {
      return parseStoredPageSize(localStorage.getItem(storageKey), defaultPageSize);
    } catch {
      return defaultPageSize;
    }
  });

  const [page, setPageState] = useState(1);

  const totalItems = items.length;
  const totalPages = totalPagesFor(totalItems, pageSize);

  const setPage = (next: number) => setPageState(clampPage(next, totalPages));

  const setPageSize = (size: PageSize) => {
    setPageSizeState(size);
    setPageState(1);
    try {
      localStorage.setItem(storageKey, size === ALL_PAGE_SIZE ? ALL_PAGE_SIZE : String(size));
    } catch { /* silent */ }
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
