import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import {
  DEFAULT_CHARACTER_FORMAT,
  NSFW_CHARACTER_FORMAT,
  resolveCharacterFormat,
  formatSections,
  buildFormatExample,
  buildFormatRules,
  ensureAllSections,
  missingFormatSections,
  isFormatAligned,
  normalizedContentSectionNames,
  normalizedFormatSectionNames,
} from "../src/engine/characterFormat";
import { CHARACTER_SECTION_HEADERS, applySectionChanges } from "../src/engine/characterSections";
import type { CharacterFormat } from "../src/schemas";
import { CharacterFormatSchema } from "../src/schemas";

const CUSTOM: CharacterFormat = {
  sections: [
    { name: "Name", order: 1, inline: true, instruction: "The character's name.", examples: ["Mira"] },
    { name: "Occupation", order: 2, instruction: "What they do for a living.", examples: [], inline: false },
    { name: "Loves", order: 3, instruction: "Things they adore.", examples: [], inline: false },
  ],
};

describe("characterFormat shipped defaults", () => {
  it("Default format is the 10 canonical sections without Sexual Capabilities", () => {
    const names = DEFAULT_CHARACTER_FORMAT.sections.map((s) => s.name);
    expect(names).toEqual(
      CHARACTER_SECTION_HEADERS.filter((h) => h !== "Sexual Capabilities")
    );
    expect(DEFAULT_CHARACTER_FORMAT.sections).toHaveLength(10);
    expect(names).not.toContain("Sexual Capabilities");
    // Species/Gender are the inline sections.
    expect(DEFAULT_CHARACTER_FORMAT.sections.filter((s) => s.inline).map((s) => s.name)).toEqual(["Species", "Gender"]);
    // Every shipped section has guidance.
    for (const s of DEFAULT_CHARACTER_FORMAT.sections) {
      expect(s.instruction.length).toBeGreaterThan(0);
      expect(s.order).toBeGreaterThan(0);
    }
  });

  it("NSFW format adds Sexual Capabilities as the 11th section", () => {
    expect(NSFW_CHARACTER_FORMAT.sections.map((s) => s.name)).toEqual([
      ...CHARACTER_SECTION_HEADERS,
    ]);
    const sc = NSFW_CHARACTER_FORMAT.sections.find((s) => s.name === "Sexual Capabilities");
    expect(sc?.order).toBe(11);
    expect(sc?.instruction.length).toBeGreaterThan(0);
  });

  it("shipped Default preset in data/prompt-presets.json matches DEFAULT_CHARACTER_FORMAT", () => {
    const raw = readFileSync(new URL("../data/prompt-presets.json", import.meta.url), "utf8");
    const presets = JSON.parse(raw) as Array<{ id: string; characterFormat?: CharacterFormat }>;
    const def = presets.find((p) => p.id === "default");
    expect(def?.characterFormat).toBeDefined();
    // Parse through the schema so zod defaults (inline/examples) are applied.
    const fmt = CharacterFormatSchema.parse(def?.characterFormat);
    expect(fmt.sections).toEqual(DEFAULT_CHARACTER_FORMAT.sections);
  });

  it("shipped Default (NSFW) preset in data/prompt-presets.json matches NSFW_CHARACTER_FORMAT", () => {
    const raw = readFileSync(new URL("../data/prompt-presets.json", import.meta.url), "utf8");
    const presets = JSON.parse(raw) as Array<{ id: string; characterFormat?: CharacterFormat }>;
    const nsfw = presets.find((p) => p.id === "default-nsfw");
    expect(nsfw?.characterFormat).toBeDefined();
    const fmt = CharacterFormatSchema.parse(nsfw?.characterFormat);
    expect(fmt.sections).toEqual(NSFW_CHARACTER_FORMAT.sections);
  });

  it("resolveCharacterFormat falls back to Default when absent or empty", () => {
    expect(resolveCharacterFormat(undefined)).toEqual(DEFAULT_CHARACTER_FORMAT);
    expect(resolveCharacterFormat({ sections: [] })).toEqual(DEFAULT_CHARACTER_FORMAT);
    expect(resolveCharacterFormat(CUSTOM)).toBe(CUSTOM);
  });
});

describe("characterFormat builders", () => {
  it("buildFormatExample renders inline sections on one line and blocks otherwise", () => {
    const example = buildFormatExample(CUSTOM);
    expect(example).toContain("[Name]: Mira");
    expect(example).toContain("[Occupation]");
    expect(example).not.toContain("--");
    const names = example.split("\n").filter((l) => l.startsWith("["));
    expect(names).toEqual(["[Name]: Mira", "[Occupation]", "[Loves]"]);
  });

  it("buildFormatRules lists the headers in order with per-section guidance", () => {
    const rules = buildFormatRules(CUSTOM);
    expect(rules).toContain("[Name]");
    expect(rules).toContain("[Occupation]");
    expect(rules).toContain("[Loves]");
    // Order: Name before Occupation before Loves.
    expect(rules.indexOf("[Name]")).toBeLessThan(rules.indexOf("[Occupation]"));
    expect(rules.indexOf("[Occupation]")).toBeLessThan(rules.indexOf("[Loves]"));
    expect(rules).toContain("What they do for a living.");
  });

  it("buildFormatRules lists examples as bullets, never doubling the dash", () => {
    const fmt: CharacterFormat = {
      sections: [
        { name: "Kinks", order: 1, instruction: "Intimacy preferences.", examples: ["- Femdom (giving): She loves manhandling.", "- Impact Play (giving): Pushing to the edge.", "- Fear Play (giving): Weight behind every word."], inline: false },
        { name: "Notes", order: 2, instruction: "Freeform.", examples: ["", "only second kept", ""], inline: false },
      ],
    };
    const rules = buildFormatRules(fmt);
    // All three kink examples surface, in order.
    expect(rules).toContain("- Femdom (giving): She loves manhandling.");
    expect(rules).toContain("- Impact Play (giving): Pushing to the edge.");
    expect(rules).toContain("- Fear Play (giving): Weight behind every word.");
    // No doubled bullets (stored as "- x", emitted as "    - x").
    expect(rules).not.toContain("- - Femdom");
    expect(rules).not.toContain("- - Impact");
    // Empty slots are dropped, non-empty ones kept (no blank example lines).
    expect(rules).toContain("- only second kept");
    expect(rules.match(/    - $/g)?.length ?? 0).toBe(0);
  });

  it("buildFormatExample ignores empty examples and falls back to first non-empty", () => {
    const fmt: CharacterFormat = {
      sections: [
        { name: "Kinks", order: 1, instruction: "x", examples: ["", "- Femdom (giving): ..."], inline: false },
        { name: "Empty", order: 2, instruction: "y", examples: ["", "", ""], inline: false },
      ],
    };
    const example = buildFormatExample(fmt);
    expect(example).toContain("[Kinks]\n- Femdom (giving): ...");
    expect(example).toContain("[Empty]\n...");
  });
});

describe("characterFormat ensure / alignment", () => {
  const partial = "[Occupation]\n- Blacksmith\n\n[Species]: Human\n";

  it("ensureAllSections adds missing format sections as stubs, in format order", () => {
    const out = ensureAllSections(partial, CUSTOM);
    const names = normalizedContentSectionNames(out);
    // Name added first (inline stub), Occupation kept, Species (extra) appended, Loves added.
    expect(names).toContain("name");
    expect(names).toContain("occupation");
    expect(names).toContain("loves");
    expect(out).toContain("[Name]: (not established)");
    expect(out).toContain("[Loves]\n(not established)");
    // Existing bodies preserved.
    expect(out).toContain("- Blacksmith");
    expect(out).toContain("[Species]: Human");
    // The format sections come first, extras appended after.
    expect(out.indexOf("[Name]")).toBeLessThan(out.indexOf("[Loves]"));
  });

  it("ensureAllSections reorders existing sections to match the format", () => {
    const out = ensureAllSections("[Loves]\n- Tea\n\n[Name]: Mira\n", CUSTOM);
    expect(out.indexOf("[Name]")).toBeLessThan(out.indexOf("[Loves]"));
    expect(out).toContain("- Tea");
  });

  it("missingFormatSections reports only format sections absent from content", () => {
    expect(missingFormatSections(partial, CUSTOM)).toEqual(["Name", "Loves"]);
  });

  it("isFormatAligned requires every format section present in format order", () => {
    expect(isFormatAligned("[Name]: Mira\n\n[Occupation]\n- Smith\n\n[Loves]\n- Tea\n", CUSTOM)).toBe(true);
    // Missing a format section → not aligned.
    expect(isFormatAligned("[Name]: Mira\n\n[Occupation]\n- Smith\n", CUSTOM)).toBe(false);
    // Wrong relative order → not aligned.
    expect(isFormatAligned("[Name]: Mira\n\n[Loves]\n- Tea\n\n[Occupation]\n- Smith\n", CUSTOM)).toBe(false);
    // Extra sections are fine (open set).
    expect(isFormatAligned("[Name]: Mira\n\n[Occupation]\n- Smith\n\n[Loves]\n- Tea\n\n[Voice]\n- Calm\n", CUSTOM)).toBe(true);
  });
});

describe("applySectionChanges with format opts", () => {
  it("inserts a new section in the format's order using its inline flag", () => {
    const content = "[Name]: Mira\n\n[Loves]\n- Tea\n";
    const out = applySectionChanges(content, [{ header: "Occupation", body: "Blacksmith" }], {
      order: CUSTOM.sections.map((s) => s.name),
      inlineHeaders: CUSTOM.sections.filter((s) => s.inline).map((s) => s.name),
    });
    expect(out.indexOf("[Occupation]")).toBeGreaterThan(out.indexOf("[Name]"));
    expect(out.indexOf("[Occupation]")).toBeLessThan(out.indexOf("[Loves]"));
  });

  it("creates inline sections for headers flagged inline", () => {
    const out = applySectionChanges("[Occupation]\n- Smith\n", [{ header: "Name", body: "Mira" }], {
      order: CUSTOM.sections.map((s) => s.name),
      inlineHeaders: ["Name"],
    });
    expect(out).toContain("[Name]: Mira");
  });
});

describe("formatSections / normalized names", () => {
  it("formatSections resolves the fallback for missing formats", () => {
    expect(formatSections(undefined)).toHaveLength(10);
    expect(normalizedFormatSectionNames(undefined)).toContain("species");
  });
});
