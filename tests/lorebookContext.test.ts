import { describe, expect, it } from "vitest";
import type { LorebookEntry } from "../src/schemas";
import { buildLorebookContextFromEntries, lorebookBudgetChars } from "../src/server/lorebookContext";

const entry = (uid: number, opts: { key?: string[]; constant?: boolean; content: string }): LorebookEntry => ({
  uid,
  key: opts.key ?? [],
  keysecondary: [],
  content: opts.content,
  comment: "",
  constant: opts.constant ?? false,
  selective: false,
  selectiveLogic: 0,
  scanDepth: null,
  caseSensitive: false,
  matchWholeWords: false,
  useRegex: false,
  useProbability: false,
  probability: 100,
  sticky: 0,
  cooldown: 0,
  delay: 0,
  order: 100,
  position: 0,
  depth: 4,
  disable: false,
  group: "",
  groupWeight: 100,
  preventRecursion: false,
  excludeRecursion: false,
  delayUntilRecursion: false
});

describe("lorebookContext", () => {
  it("budgets ~25% of max tokens at 4 chars/token", () => {
    expect(lorebookBudgetChars(4000)).toBe(4000);
  });

  it("includes constants, keyword-matched selective entries, excludes unmatched, respects budget", () => {
    const entries = [
      entry(1, { constant: true, content: "The realm is old." }),
      entry(2, { key: ["salt"], content: "Saltmere mines salt." }),
      entry(3, { key: ["fog"], content: "The fog is deep." })
    ];
    const out = buildLorebookContextFromEntries(entries, "a coastal town of salt flats", 10_000);
    expect(out).toContain("The realm is old.");
    expect(out).toContain("Saltmere mines salt.");
    expect(out).not.toContain("The fog is deep.");
    expect(out).toContain("WORLD LORE");
  });

  it("respects a tight budget by truncating entries", () => {
    const entries = [
      entry(1, { constant: true, content: "A constant entry that is fairly long." }),
      entry(2, { key: ["salt"], content: "Saltmere mines salt." })
    ];
    const out = buildLorebookContextFromEntries(entries, "town of salt flats", 10);
    expect(out).toBe("");
  });

  it("returns empty string when nothing matches", () => {
    expect(buildLorebookContextFromEntries([entry(9, { key: ["fog"], content: "deep" })], "sunny plains", 1000)).toBe("");
  });
});