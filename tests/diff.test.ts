import { describe, it, expect } from "vitest";
import { computeLineDiff, computeTwoPaneDiff } from "../src/client/engine/diff";

describe("computeLineDiff", () => {
  it("returns all same for identical text", () => {
    const result = computeLineDiff("a\nb\nc", "a\nb\nc");
    expect(result.every((l) => l.type === "same")).toBe(true);
    expect(result).toHaveLength(3);
  });

  it("marks added lines in new text", () => {
    const result = computeLineDiff("a\nb", "a\nb\nc");
    expect(result[2].type).toBe("added");
    expect(result[2].content).toBe("c");
  });

  it("marks removed lines in old text", () => {
    const result = computeLineDiff("a\nb\nc", "a\nc");
    expect(result[1].type).toBe("removed");
    expect(result[1].content).toBe("b");
  });

  it("handles completely different text", () => {
    const result = computeLineDiff("old", "new");
    expect(result).toHaveLength(2);
    expect(result[0].type).toBe("removed");
    expect(result[1].type).toBe("added");
  });

  it("handles empty old text", () => {
    const result = computeLineDiff("", "new content");
    expect(result.every((l) => l.type === "added")).toBe(true);
  });

  it("terminates when old is shorter than new (no infinite loop regression)", () => {
    // old = "a", new = "a\nb\nc": after matching "a", old is exhausted but new
    // remains. Previously this read oldLines[1] (undefined) and looped forever.
    const result = computeLineDiff("a", "a\nb\nc");
    expect(result.map((l) => l.type)).toEqual(["same", "added", "added"]);
  });

  it("terminates when old is longer than new (no infinite loop regression)", () => {
    const result = computeLineDiff("x\ny\nz", "a\nb");
    expect(result.map((l) => l.type)).toEqual(["removed", "removed", "removed", "added", "added"]);
  });
});

describe("computeTwoPaneDiff", () => {
  it("pairs a modified line (removed then added) onto one row", () => {
    const rows = computeTwoPaneDiff("A\nX\nB", "A\nY\nB");
    const pairRow = rows.find((r) => r.left?.content === "X");
    expect(pairRow?.left?.type).toBe("removed");
    expect(pairRow?.right?.content).toBe("Y");
    expect(pairRow?.right?.type).toBe("added");
  });

  it("handles a pure insertion (added line, no removed neighbor)", () => {
    const rows = computeTwoPaneDiff("A\nC", "A\nB\nC");
    const inserted = rows.find((r) => r.left === null && r.right?.content === "B");
    expect(inserted).toBeDefined();
    expect(inserted!.right!.type).toBe("added");
  });

  it("handles a pure deletion (removed line, no added neighbor)", () => {
    const rows = computeTwoPaneDiff("A\nX\nC", "A\nC");
    const deleted = rows.find((r) => r.right === null && r.left?.content === "X");
    expect(deleted).toBeDefined();
    expect(deleted!.left!.type).toBe("removed");
  });

  it("returns identical left+right for identical text", () => {
    const rows = computeTwoPaneDiff("a\nb", "a\nb");
    expect(rows).toHaveLength(2);
    expect(rows.every((r) => r.left?.type === "same" && r.right?.type === "same")).toBe(true);
  });

  it("handles empty old text (all added)", () => {
    const rows = computeTwoPaneDiff("", "x\ny");
    expect(rows.every((r) => r.left === null && r.right?.type === "added")).toBe(true);
  });

  it("handles empty new text (all removed)", () => {
    const rows = computeTwoPaneDiff("x\ny", "");
    expect(rows.every((r) => r.right === null && r.left?.type === "removed")).toBe(true);
  });
});
