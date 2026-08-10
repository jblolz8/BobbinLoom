import { describe, expect, it } from "vitest";
import type { CharacterTemplate } from "../src/schemas";
import {
  collectCardSettings,
  displayTitle,
  entryKind,
  filterLibraryEntries,
  normalizeCreator,
  normalizeTags
} from "../src/engine/characterCards";

function makeEntry(overrides: Partial<CharacterTemplate> = {}): CharacterTemplate {
  return {
    id: "char_1",
    name: "Mira",
    version: 1,
    content: "x",
    summary: "",
    startingClothing: [],
    ...overrides,
  };
}

describe("normalizeTags", () => {
  it("lowercases, trims, converts spaces to underscores, and dedupes", () => {
    expect(normalizeTags(["Adventurer", "  dark  fantasy ", "Adventurer", "   ", "elf"])).toEqual([
      "adventurer",
      "dark_fantasy",
      "elf",
    ]);
  });

  it("returns [] for empty input", () => {
    expect(normalizeTags([])).toEqual([]);
  });
});

describe("normalizeCreator", () => {
  it("lowercases and trims", () => {
    expect(normalizeCreator("PPLONG")).toBe("pplong");
    expect(normalizeCreator("  Alice  ")).toBe("alice");
  });

  it("strips leading @ and common URL prefixes", () => {
    expect(normalizeCreator("@pplong")).toBe("pplong");
    expect(normalizeCreator("https://x.com/PPLong")).toBe("x.com/pplong");
    expect(normalizeCreator("http://www.example.com/Art")).toBe("example.com/art");
  });

  it("returns empty string for undefined/empty input", () => {
    expect(normalizeCreator(undefined)).toBe("");
    expect(normalizeCreator("   ")).toBe("");
  });
});

describe("entryKind", () => {
  it("classifies ccv2 vs bl", () => {
    expect(entryKind(makeEntry({ format: "ccv2" }))).toBe("ccv2");
    expect(entryKind(makeEntry())).toBe("bl");
  });
});

describe("displayTitle", () => {
  it("uses trimmed title when present, else name", () => {
    expect(displayTitle(makeEntry({ title: "  Mira the Brave  " }))).toBe("Mira the Brave");
    expect(displayTitle(makeEntry())).toBe("Mira");
  });
});

describe("filterLibraryEntries", () => {
  const entries = [
    makeEntry({
      id: "char_1", name: "Mira", title: "Mira the Elf",
      tags: ["adventurer", "elf"], creator: "pplong", format: "ccv2",
    }),
    makeEntry({ id: "char_2", name: "Flora", tags: ["merchant"], creator: "bob" }),
    makeEntry({ id: "char_3", name: "Aldric", tags: ["elf", "knight"], creator: "pplong" }),
  ];

  it("empty query returns everything", () => {
    expect(filterLibraryEntries(entries, "  ")).toHaveLength(3);
  });

  it("ANDs multiple terms across tags/name/title", () => {
    expect(filterLibraryEntries(entries, "elf adventurer").map((e) => e.id)).toEqual(["char_1"]);
    expect(filterLibraryEntries(entries, "elf").map((e) => e.id).sort()).toEqual(["char_1", "char_3"]);
  });

  it("matches name and title case-insensitively", () => {
    expect(filterLibraryEntries(entries, "FLORA").map((e) => e.id)).toEqual(["char_2"]);
    expect(filterLibraryEntries(entries, "the elf").map((e) => e.id)).toEqual(["char_1"]);
  });

  it("-tag excludes", () => {
    expect(filterLibraryEntries(entries, "elf -knight").map((e) => e.id)).toEqual(["char_1"]);
    expect(filterLibraryEntries(entries, "-merchant").map((e) => e.id).sort()).toEqual(["char_1", "char_3"]);
  });

  it("creator: virtual namespace", () => {
    expect(filterLibraryEntries(entries, "creator:pplong").map((e) => e.id).sort()).toEqual(["char_1", "char_3"]);
    expect(filterLibraryEntries(entries, "creator:Bob").map((e) => e.id)).toEqual(["char_2"]);
    expect(filterLibraryEntries(entries, "creator:pplong elf").map((e) => e.id).sort()).toEqual(["char_1", "char_3"]);
  });

  it("format: virtual namespace", () => {
    expect(filterLibraryEntries(entries, "format:ccv2").map((e) => e.id)).toEqual(["char_1"]);
    expect(filterLibraryEntries(entries, "format:bl").map((e) => e.id)).toEqual(["char_2", "char_3"]);
  });

  it("negated namespace terms work", () => {
    expect(filterLibraryEntries(entries, "elf -format:ccv2").map((e) => e.id)).toEqual(["char_3"]);
  });

  it("handles entries with undefined tags", () => {
    expect(filterLibraryEntries([makeEntry({ tags: undefined })], "elf")).toEqual([]);
  });
});

describe("collectCardSettings", () => {
  it("collects non-empty scenarios from ccv2 records only, deduped by scenario", () => {
    const entries = [
      makeEntry({ id: "char_1", title: "Mira", format: "ccv2", scenario: "A dark forest." }),
      makeEntry({ id: "char_2", title: "Mira II", format: "ccv2", scenario: "A dark forest." }),
      makeEntry({ id: "char_3", format: "ccv2", scenario: "  " }),
      makeEntry({ id: "char_4", name: "Flora", scenario: "A garden." }),
    ];
    expect(collectCardSettings(entries)).toEqual([{ title: "Mira", scenario: "A dark forest." }]);
  });

  it("returns [] when no ccv2 scenarios exist", () => {
    expect(collectCardSettings([makeEntry()])).toEqual([]);
    expect(collectCardSettings([makeEntry({ format: "ccv2" })])).toEqual([]);
  });
});
