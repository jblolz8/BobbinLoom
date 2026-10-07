import { useEffect, useRef, useState } from "react";
import {
  clampPage,
  parsePageSizeInput,
  rangeLabel,
  totalPagesFor,
  type PageSize
} from "../engine/pagination";
import type { PageSizeSurface } from "../api";
import { usePersistedPageSize } from "./usePagination";

export type UseServerPaginationOptions = {
  /** The total items across all pages (returned from server). */
  totalItems: number;
  /**
   * Which list this pager is.
   */
  persistAs: PageSizeSurface;
  /**
   * Page returns to 1 whenever any of these change (search text, sort field/direction, tag
   * filters…).
   */
  resetDeps?: unknown[];
};

export type ServerPaginationState = {
  isReady: boolean;
  page: number;
  pageSize: PageSize;
  totalItems: number;
  totalPages: number;
  /** "Showing 13–24 of 57" — append the noun in the UI. */
  label: string;
  setPage: (page: number) => void;
  setPageSize: (size: PageSize) => void;
  /** Validates raw custom-input text; ignores unusable values (returns false). */
  commitCustomPageSize: (raw: string) => boolean;
};

export function useServerPagination({
  totalItems,
  persistAs,
  resetDeps = []
}: UseServerPaginationOptions): ServerPaginationState {
  const stored = usePersistedPageSize(persistAs);
  const pageSize = stored.pageSize;

  const [page, setPageState] = useState(1);
  const totalPages = totalPagesFor(totalItems, pageSize);

  const setPage = (next: number) => setPageState(clampPage(next, totalPages));

  const setPageSize = (size: PageSize) => {
    setPageState(1);
    stored.write(size);
  };

  const commitCustomPageSize = (raw: string): boolean => {
    const parsed = parsePageSizeInput(raw);
    if (parsed === null) return false;
    setPageSize(parsed);
    return true;
  };

  useEffect(() => {
    if (page > totalPages && totalPages > 0) setPageState(1);
  }, [page, totalPages]);

  const resetKey = JSON.stringify(resetDeps);
  useEffect(() => {
    setPageState(1);
  }, [resetKey]);

  return {
    isReady: stored.isReady,
    page,
    pageSize,
    totalItems,
    totalPages,
    label: rangeLabel(page, pageSize, totalItems),
    setPage,
    setPageSize,
    commitCustomPageSize
  };
}
