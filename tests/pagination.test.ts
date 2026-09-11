import { describe, expect, it } from "vitest";
import {
  ALL_PAGE_SIZE,
  DEFAULT_PAGE_SIZE,
  MAX_PAGE_SIZE,
  clampPage,
  getPageNumbers,
  isPresetPageSize,
  pageSlice,
  parsePageSizeInput,
  parseStoredPageSize,
  rangeLabel,
  rangeParts,
  totalPagesFor
} from "../src/client/engine/pagination";

/**
 * Page-size value transitions live in hooks/usePagination (React); everything here is the pure
 * maths the pager and the hook share. Behaviour pinned to what the CharacterLibrary pager did
 * before the extraction, plus the "all" sentinel that replaces its `pageSize >= 1000` shortcut.
 */

describe("totalPagesFor", () => {
  it("rounds up and never returns less than 1", () => {
    expect(totalPagesFor(0, 12)).toBe(1);
    expect(totalPagesFor(1, 12)).toBe(1);
    expect(totalPagesFor(12, 12)).toBe(1);
    expect(totalPagesFor(13, 12)).toBe(2);
    expect(totalPagesFor(57, 12)).toBe(5);
  });

  it("returns a single page for the 'all' sentinel", () => {
    expect(totalPagesFor(0, ALL_PAGE_SIZE)).toBe(1);
    expect(totalPagesFor(500, ALL_PAGE_SIZE)).toBe(1);
  });

  it("treats a zero or negative page size as 1 per page", () => {
    expect(totalPagesFor(5, 0)).toBe(5);
  });
});

describe("clampPage", () => {
  it("keeps the page inside 1..totalPages", () => {
    expect(clampPage(0, 3)).toBe(1);
    expect(clampPage(1, 3)).toBe(1);
    expect(clampPage(2, 3)).toBe(2);
    expect(clampPage(4, 3)).toBe(3);
    expect(clampPage(99, 3)).toBe(3);
  });

  it("survives junk input", () => {
    expect(clampPage(Number.NaN, 3)).toBe(1);
    expect(clampPage(2.7, 5)).toBe(2);
  });
});

describe("getPageNumbers (verbatim from the original pager)", () => {
  it("lists every page when there are 7 or fewer", () => {
    expect(getPageNumbers(1, 1)).toEqual([1]);
    expect(getPageNumbers(3, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it("windows near the start", () => {
    expect(getPageNumbers(1, 20)).toEqual([1, 2, 3, 4, 5, -1, 20]);
    expect(getPageNumbers(4, 20)).toEqual([1, 2, 3, 4, 5, -1, 20]);
  });

  it("windows near the end", () => {
    expect(getPageNumbers(20, 20)).toEqual([1, -1, 16, 17, 18, 19, 20]);
    expect(getPageNumbers(17, 20)).toEqual([1, -1, 16, 17, 18, 19, 20]);
  });

  it("windows in the middle with two ellipses", () => {
    expect(getPageNumbers(10, 20)).toEqual([1, -1, 9, 10, 11, -1, 20]);
  });
});

describe("pageSlice", () => {
  const items = Array.from({ length: 25 }, (_, i) => i + 1);

  it("slices the requested window", () => {
    expect(pageSlice(items, 1, 12)).toEqual(items.slice(0, 12));
    expect(pageSlice(items, 3, 12)).toEqual([25]);
    expect(pageSlice(items, 2, 10)).toEqual(items.slice(10, 20));
  });

  it("returns everything for the 'all' sentinel", () => {
    expect(pageSlice(items, 1, ALL_PAGE_SIZE)).toEqual(items);
    expect(pageSlice(items, 4, ALL_PAGE_SIZE)).toEqual(items);
  });

  it("clamps an out-of-range page to the LAST page instead of returning nothing", () => {
    // The hook also resets to page 1 when filtering shrinks the list; this clamp is the render-time
    // safety net, so a stale page shows the final window rather than an empty grid.
    expect(pageSlice(items, 99, 12)).toEqual([25]);
    expect(pageSlice(items, 0, 12)).toEqual(items.slice(0, 12));
  });

  it("handles an empty list", () => {
    expect(pageSlice([], 1, 12)).toEqual([]);
  });
});

describe("rangeParts / rangeLabel", () => {
  it("reports the visible window", () => {
    expect(rangeParts(1, 12, 57)).toEqual({ from: 1, to: 12, total: 57, all: false });
    expect(rangeParts(5, 12, 57)).toEqual({ from: 49, to: 57, total: 57, all: false });
    expect(rangeLabel(5, 12, 57)).toBe("Showing 49–57 of 57");
  });

  it("marks the 'all' case", () => {
    expect(rangeParts(1, ALL_PAGE_SIZE, 57)).toEqual({ from: 1, to: 57, total: 57, all: true });
    expect(rangeLabel(1, ALL_PAGE_SIZE, 57)).toBe("Showing all 57");
  });

  it("handles an empty collection", () => {
    expect(rangeParts(1, 12, 0)).toEqual({ from: 0, to: 0, total: 0, all: false });
    expect(rangeLabel(1, 12, 0)).toBe("Showing 0");
  });
});

describe("parsePageSizeInput", () => {
  it("accepts positive integers", () => {
    expect(parsePageSizeInput("15")).toBe(15);
    expect(parsePageSizeInput(" 30 ")).toBe(30);
    expect(parsePageSizeInput("1")).toBe(1);
  });

  it("caps at MAX_PAGE_SIZE", () => {
    expect(parsePageSizeInput("9999")).toBe(MAX_PAGE_SIZE);
  });

  it("rejects junk", () => {
    for (const raw of ["", "0", "-5", "abc", "12px", "1e3", "3.5", " "]) {
      expect(parsePageSizeInput(raw)).toBeNull();
    }
  });
});

describe("parseStoredPageSize", () => {
  it("reads the legacy numeric format", () => {
    expect(parseStoredPageSize("24")).toBe(24);
    expect(parseStoredPageSize("96")).toBe(96);
  });

  it("maps the legacy 1000 sentinel and the new 'all' string to ALL", () => {
    expect(parseStoredPageSize("1000")).toBe(ALL_PAGE_SIZE);
    expect(parseStoredPageSize("all")).toBe(ALL_PAGE_SIZE);
  });

  it("falls back for missing or unusable values", () => {
    expect(parseStoredPageSize(null)).toBe(DEFAULT_PAGE_SIZE);
    expect(parseStoredPageSize("")).toBe(DEFAULT_PAGE_SIZE);
    expect(parseStoredPageSize("0")).toBe(DEFAULT_PAGE_SIZE);
    expect(parseStoredPageSize("nonsense")).toBe(DEFAULT_PAGE_SIZE);
    expect(parseStoredPageSize(null, 48)).toBe(48);
  });
});

describe("isPresetPageSize", () => {
  it("knows presets from custom values", () => {
    expect(isPresetPageSize(12)).toBe(true);
    expect(isPresetPageSize(96)).toBe(true);
    expect(isPresetPageSize(ALL_PAGE_SIZE)).toBe(true);
    expect(isPresetPageSize(15)).toBe(false);
    expect(isPresetPageSize(1000)).toBe(false);
  });
});
