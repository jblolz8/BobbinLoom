/**
 * Pagination maths — pure, framework-free, unit-tested (tests/pagination.test.ts).
 *
 * Extracted from CharacterLibrary's original pager so the Character Library, the SetupView cast
 * picker, and (next) the Lorebook and Persona libraries all page identically. Keep this file free of
 * React imports: the test suite is pure-logic (no jsdom / testing-library in this repo).
 */

/** The page sizes offered in the "Per page" control. */
export const PAGE_SIZE_PRESETS = [12, 24, 48, 96] as const;

/** Sentinel for "show everything". Replaces the old `pageSize >= 1000` shortcut. */
export const ALL_PAGE_SIZE = "all";

/** Upper bound for a custom page size (matches the legacy 1000 sentinel). */
export const MAX_PAGE_SIZE = 1000;

export const DEFAULT_PAGE_SIZE = 12;

export type PageSize = number | typeof ALL_PAGE_SIZE;

export function isAllPageSize(size: PageSize): size is typeof ALL_PAGE_SIZE {
  return size === ALL_PAGE_SIZE;
}

export function totalPagesFor(total: number, pageSize: PageSize): number {
  if (total <= 0) return 1;
  if (isAllPageSize(pageSize)) return 1;
  const per = Math.max(1, Math.floor(pageSize));
  return Math.max(1, Math.ceil(total / per));
}

export function clampPage(page: number, totalPages: number): number {
  if (!Number.isFinite(page)) return 1;
  const whole = Math.floor(page);
  if (whole < 1) return 1;
  return Math.min(whole, Math.max(1, totalPages));
}

/**
 * Page-number window for the pager: `-1` marks an ellipsis. Verbatim behaviour from the original
 * CharacterLibrary helper (≤7 pages, near-start, near-end, middle).
 */
export function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, -1, total];
  }
  if (current >= total - 3) {
    return [1, -1, total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, -1, current - 1, current, current + 1, -1, total];
}

export function pageSlice<T>(items: T[], page: number, pageSize: PageSize): T[] {
  if (isAllPageSize(pageSize)) return items;
  const per = Math.max(1, Math.floor(pageSize));
  const safePage = clampPage(page, totalPagesFor(items.length, pageSize));
  const start = (safePage - 1) * per;
  return items.slice(start, start + per);
}

/** "Showing 13–24 of 57" — the caller supplies the noun separately. */
export type RangeParts = { from: number; to: number; total: number; all: boolean };

/** Structured form for the UI (which renders the numbers in <strong>). */
export function rangeParts(page: number, pageSize: PageSize, total: number): RangeParts {
  if (total <= 0) return { from: 0, to: 0, total: 0, all: false };
  if (isAllPageSize(pageSize)) return { from: 1, to: total, total, all: true };
  const per = Math.max(1, Math.floor(pageSize));
  const safePage = clampPage(page, totalPagesFor(total, pageSize));
  return {
    from: (safePage - 1) * per + 1,
    to: Math.min(safePage * per, total),
    total,
    all: false
  };
}

export function rangeLabel(page: number, pageSize: PageSize, total: number): string {
  const { from, to, all } = rangeParts(page, pageSize, total);
  if (total <= 0) return "Showing 0";
  if (all) return `Showing all ${total}`;
  return `Showing ${from}–${to} of ${total}`;
}

/** Validates the custom page-size input; returns null for anything unusable. */
export function parsePageSizeInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed) || parsed < 1) return null;
  return Math.min(parsed, MAX_PAGE_SIZE);
}

/**
 * Reads a persisted page size. Accepts the legacy numeric format (including the old `1000`
 * "show all" sentinel) and the new `"all"` string.
 */
export function parseStoredPageSize(raw: string | null, fallback: PageSize = DEFAULT_PAGE_SIZE): PageSize {
  if (raw === null || raw === "") return fallback;
  if (raw === ALL_PAGE_SIZE) return ALL_PAGE_SIZE;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 1) return fallback;
  if (parsed >= MAX_PAGE_SIZE) return ALL_PAGE_SIZE;
  return Math.round(parsed);
}

/** True when the size is one of the dropdown presets (i.e. not the custom-input case). */
export function isPresetPageSize(size: PageSize): boolean {
  return isAllPageSize(size) || (PAGE_SIZE_PRESETS as readonly number[]).includes(size);
}
