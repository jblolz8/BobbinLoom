import { describe, expect, it } from "vitest";
import { FOCUSABLE_SELECTOR, isRenameable, wrapIndex } from "../src/client/engine/dialogFocus";

/** The dialog shell's pure half. The DOM half (querying stops, moving focus) is verified in the
 *  browser: this suite has no jsdom, and pretending otherwise would test a fake. */
describe("dialog focus arithmetic", () => {
  it("steps forward inside the ring", () => {
    expect(wrapIndex(3, 0, false)).toBe(1);
    expect(wrapIndex(3, 1, false)).toBe(2);
  });

  it("wraps the last stop to the first, and the first back to the last", () => {
    expect(wrapIndex(3, 2, false)).toBe(0);
    expect(wrapIndex(3, 0, true)).toBe(2);
  });

  it("steps backward inside the ring", () => {
    expect(wrapIndex(3, 2, true)).toBe(1);
    expect(wrapIndex(3, 1, true)).toBe(0);
  });

  it("enters an empty ring nowhere", () => {
    expect(wrapIndex(0, -1, false)).toBe(-1);
    expect(wrapIndex(0, 0, true)).toBe(-1);
  });

  it("enters a ring from outside it at the near end", () => {
    // Focus on the dialog container, or slipped out of it: Tab goes to the first stop, Shift+Tab to
    // the last, which is the same move the browser would make inside a plain document.
    expect(wrapIndex(3, -1, false)).toBe(0);
    expect(wrapIndex(3, -1, true)).toBe(2);
  });

  it("holds a single stop in place", () => {
    expect(wrapIndex(1, 0, false)).toBe(0);
    expect(wrapIndex(1, 0, true)).toBe(0);
  });
});

describe("the rename guard", () => {
  it("refuses an empty or blank name", () => {
    expect(isRenameable("")).toBe(false);
    expect(isRenameable("   ")).toBe(false);
    expect(isRenameable("\t\n")).toBe(false);
  });

  it("accepts a name with a visible character, spaces and all", () => {
    expect(isRenameable("The Salt Road")).toBe(true);
    expect(isRenameable(" x ")).toBe(true);
  });
});

describe("the focus-stop selector", () => {
  it("names every interactive kind, and never a programmatic tabindex", () => {
    for (const fragment of ["a[href]", "button:not([disabled])", "input:not([disabled])", "textarea:not([disabled])", "select:not([disabled])"]) {
      expect(FOCUSABLE_SELECTOR).toContain(fragment);
    }
    expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
  });
});
