import { describe, expect, it } from "vitest";
import {
  CHARACTER_SECTION_HEADERS,
  CHARACTER_SHEET_EXAMPLE,
  toJsonExampleContent,
  splitContentSections,
  joinContentSections,
  missingSections,
  ensureAllSections,
  seedMemorySummary,
  parseClothingFromContent,
  summaryFromContent,
  pickSections,
  isStubSection,
  PHYSICAL_SECTION_HEADERS,
  applySectionChanges,
  parseSectionItems,
  addSectionItem,
  removeSectionItem,
  replaceSectionItem
} from "../src/engine/characterSections";

describe("characterSections", () => {
  it("defines the canonical section headers in display order", () => {
    expect(CHARACTER_SECTION_HEADERS).toEqual([
      "Species", "Gender", "Body", "Appearance", "Clothing", "Personality",
      "Communication - Public", "Communication - Private", "Likes", "Dislikes",
      "Sexual Capabilities"
    ]);
  });

  it("example blob contains every canonical header in order", () => {
    let last = -1;
    for (const h of CHARACTER_SECTION_HEADERS) {
      const idx = CHARACTER_SHEET_EXAMPLE.indexOf(`[${h}]`);
      expect(idx).toBeGreaterThan(-1);
      expect(idx).toBeGreaterThan(last);
      last = idx;
    }
  });

  it("toJsonExampleContent escapes newlines so the example embeds as valid JSON", () => {
    const escaped = toJsonExampleContent(CHARACTER_SHEET_EXAMPLE);
    expect(escaped).not.toContain("\n");
    expect(() => JSON.parse(`{"content": "${escaped}"}`)).not.toThrow();
  });

  it("split then join round-trips the example", () => {
    const { sections } = splitContentSections(CHARACTER_SHEET_EXAMPLE);
    expect(joinContentSections(sections)).toBe(CHARACTER_SHEET_EXAMPLE);
  });

  it("missingSections reports gaps in a half-built sheet", () => {
    const half = "[Species]: Human\n[Gender]: Female\n";
    expect(missingSections(half)).toEqual(expect.arrayContaining(["Body", "Clothing", "Personality"]));
    expect(missingSections(half)).not.toContain("Species");
  });

  it("ensureAllSections appends stubs for missing sections in canonical order", () => {
    const content = "[Species]: Human\n\n[Personality]\n- Cheerful\n";
    const filled = ensureAllSections(content, true);
    for (const h of CHARACTER_SECTION_HEADERS) {
      expect(filled).toContain(`[${h}]`);
    }
    // existing body preserved
    expect(filled).toContain("[Species]: Human");
    expect(filled).toContain("- Cheerful");
  });

  it("ensureAllSections does not stub [Sexual Capabilities] by default", () => {
    const filled = ensureAllSections("[Personality]\n- Quiet\n");
    expect(filled).not.toContain("[Sexual Capabilities]");
    // the rest of the canonical sections ARE stubbed
    for (const h of CHARACTER_SECTION_HEADERS.filter((x) => x !== "Sexual Capabilities")) {
      expect(filled).toContain(`[${h}]`);
    }
  });

  it("seedMemorySummary picks the first Personality bullet, else falls back", () => {
    expect(seedMemorySummary("Mira", "[Species]: Human\n\n[Personality]\n- Cheerful, curious\n..."))
      .toBe("Mira — Cheerful, curious");
    expect(seedMemorySummary("Mira", "[Species]: Human\n[Dislikes]\n- x"))
      .toContain("Mira has not formed");
  });
});

describe("pickSections", () => {
  const raya =
    "[Body]\n- Height: 5'6\"\n- Build: Lanky\n\n[Appearance]\n- Skin: Dark gray\n\n[Clothing]\n- Top: White shirt\n";
  it("returns Body, Appearance, Clothing in canonical order", () => {
    expect(pickSections(raya, PHYSICAL_SECTION_HEADERS).map((s) => s.header)).toEqual(["Body", "Appearance", "Clothing"]);
  });
  it("omits absent wanted sections without synthesizing stubs", () => {
    const missing = pickSections("[Body]\n- Tall\n", PHYSICAL_SECTION_HEADERS);
    expect(missing.map((s) => s.header)).toEqual(["Body"]);
  });
  it("ignores inline and out-of-list sections (e.g. Species/Gender)", () => {
    const content = "[Species]: Human\n[Gender]: Female\n\n[Body]\n- Tall\n";
    expect(pickSections(content, PHYSICAL_SECTION_HEADERS).map((s) => s.header)).toEqual(["Body"]);
  });
  it("returns [] for empty content", () => {
    expect(pickSections("", PHYSICAL_SECTION_HEADERS)).toEqual([]);
  });
});
describe("isStubSection", () => {
  it("true for (not established)", () => expect(isStubSection({ header: "Clothing", body: "(not established)" })).toBe(true));
  it("true for empty body", () => expect(isStubSection({ header: "Clothing", body: "" })).toBe(true));
  it("false for real content", () => expect(isStubSection({ header: "Body", body: "- Tall and lithe" })).toBe(false));
});

describe("parseClothingFromContent", () => {
  it("round-trips slot bullets into structured clothing items", () => {
    const content = "[Clothing]\n- Top: Torn silk blouse\n- Bottom: Leather pants";
    expect(parseClothingFromContent(content)).toEqual([
      { slot: "Top", name: "Torn silk blouse" },
      { slot: "Bottom", name: "Leather pants" },
    ]);
  });

  it("ignores freeform lines that don't match the slot pattern", () => {
    const content = "[Clothing]\nA practical cloak worn over simple leathers.\n- Top: Linen vest";
    expect(parseClothingFromContent(content)).toEqual([{ slot: "Top", name: "Linen vest" }]);
  });

  it("returns [] when there is no Clothing section", () => {
    expect(parseClothingFromContent("[Body]\n- Tall and lithe\n\n[Personality]\n- Calm")).toEqual([]);
  });

  it("returns [] when the Clothing section has no slot bullets", () => {
    expect(parseClothingFromContent("[Clothing]\n(not established)")).toEqual([]);
  });
});

describe("summaryFromContent", () => {
  it("returns the first Personality bullet with the dash stripped", () => {
    const content = "[Personality]\n- Disciplined, guarded, fair, and direct.\n- Slow to trust";
    expect(summaryFromContent(content)).toBe("Disciplined, guarded, fair, and direct.");
  });

  it("skips stub bullets such as (not established)", () => {
    const content = "[Personality]\n- (not established)\n- Cheerful";
    expect(summaryFromContent(content)).toBe("Cheerful");
  });

  it("returns \"\" when there is no Personality section", () => {
    expect(summaryFromContent("[Body]\n- Tall")).toBe("");
  });
});

describe("applySectionChanges", () => {
  it("surgically updates an existing section while keeping others untouched", () => {
    const original = "[Species]: Elf\n[Gender]: Female\n\n[Personality]\n- Timid and quiet\n\n[Likes]\n- Reading";
    const updated = applySectionChanges(original, [
      { header: "Personality", body: "- Bold and adventurous\n- Loves challenges" }
    ]);
    expect(updated).toContain("[Species]: Elf");
    expect(updated).toContain("[Gender]: Female");
    expect(updated).toContain("[Personality]\n- Bold and adventurous\n- Loves challenges");
    expect(updated).toContain("[Likes]\n- Reading");
    expect(updated).not.toContain("Timid and quiet");
  });

  it("inserts a missing section in canonical order", () => {
    const original = "[Species]: Elf\n[Gender]: Female\n\n[Personality]\n- Calm\n\n[Dislikes]\n- Noise";
    const updated = applySectionChanges(original, [
      { header: "Likes", body: "- Tea\n- Starlight" }
    ]);
    // [Likes] should be placed before [Dislikes] in canonical order
    const likesIdx = updated.indexOf("[Likes]");
    const dislikesIdx = updated.indexOf("[Dislikes]");
    expect(likesIdx).toBeGreaterThan(-1);
    expect(dislikesIdx).toBeGreaterThan(likesIdx);
    expect(updated).toContain("[Likes]\n- Tea\n- Starlight");
  });

  it("applies multiple section changes at once", () => {
    const original = "[Species]: Human\n[Gender]: Male\n\n[Body]\n- Lean\n\n[Clothing]\n- Top: Vest";
    const updated = applySectionChanges(original, [
      { header: "Body", body: "- Tall and muscular" },
      { header: "Clothing", body: "- Top: Cloak\n- Bottom: Boots" },
      { header: "Personality", body: "- Fierce" }
    ]);
    expect(updated).toContain("[Body]\n- Tall and muscular");
    expect(updated).toContain("[Clothing]\n- Top: Cloak\n- Bottom: Boots");
    expect(updated).toContain("[Personality]\n- Fierce");
  });
});

describe("sectionItemOps", () => {
  const likes = "[Species]: Elf\n[Gender]: Female\n\n[Personality]\n- Timid and quiet\n\n[Likes]\n- Reading\n- Going outside";

  it("parseSectionItems splits a body into trimmed, dash-stripped bullets", () => {
    expect(parseSectionItems("[Likes]\n- Reading\n- Going outside")).toEqual(["Reading", "Going outside"]);
    expect(parseSectionItems("[Likes]\n- Reading\n(not established)")).toEqual(["Reading"]);
    expect(parseSectionItems("[Personality]\n(not established)")).toEqual([]);
  });

  it("addSectionItem appends a bullet to an existing section", () => {
    const out = addSectionItem(likes, "Likes", "Stargazing");
    expect(out.applied).toBe(true);
    expect(out.content).toContain("[Likes]\n- Reading\n- Going outside\n- Stargazing");
  });

  it("addSectionItem is idempotent when the item already exists", () => {
    const out = addSectionItem(likes, "Likes", "Reading");
    expect(out.applied).toBe(true);
    expect(out.content).toBe(likes);
  });

  it("addSectionItem creates a missing section in canonical order", () => {
    const base = "[Species]: Elf\n[Gender]: Female\n\n[Personality]\n- Timid";
    const out = addSectionItem(base, "Dislikes", "Loud crowds");
    expect(out.applied).toBe(true);
    const dislikesIdx = out.content.indexOf("[Dislikes]");
    expect(dislikesIdx).toBeGreaterThan(-1);
    expect(out.content).toContain("[Dislikes]\n- Loud crowds");
  });

  it("addSectionItem refuses a stub target section", () => {
    const base = "[Species]: Elf\n\n[Personality]\n(not established)";
    const out = addSectionItem(base, "Personality", "Quiet");
    expect(out.applied).toBe(true);
    expect(out.content).not.toContain("(not established)");
  });

  it("removeSectionItem deletes the matching bullet", () => {
    const out = removeSectionItem(likes, "Likes", "Going outside");
    expect(out.applied).toBe(true);
    expect(out.content).toContain("- Reading");
    expect(out.content).not.toContain("Going outside");
  });

  it("removeSectionItem rejects when no exact match exists", () => {
    const out = removeSectionItem(likes, "Likes", "Skydiving");
    expect(out.applied).toBe(false);
    expect(out.rejectedReason).toBeTruthy();
    expect(out.content).toBe(likes);
  });

  it("removeSectionItem rejects when the section is missing or a stub", () => {
    const noSection = removeSectionItem("[Personality]\n- Quiet", "Dislikes", "Noise");
    expect(noSection.applied).toBe(false);
    const stub = removeSectionItem("[Personality]\n(not established)", "Personality", "Quiet");
    expect(stub.applied).toBe(false);
  });

  it("replaceSectionItem swaps the matching bullet text", () => {
    const out = replaceSectionItem(likes, "Personality", "Timid and quiet", "Cautious, slow to trust");
    expect(out.applied).toBe(true);
    expect(out.content).toContain("- Cautious, slow to trust");
    expect(out.content).not.toContain("Timid and quiet");
  });

  it("replaceSectionItem rejects when from has no exact match", () => {
    const out = replaceSectionItem(likes, "Personality", "Nothing matches", "Nope");
    expect(out.applied).toBe(false);
    expect(out.content).toBe(likes);
  });

  it("matching is normalized: trims, strips leading dash, case-insensitive", () => {
    const content = "[Likes]\n-  Going Outside";
    const out = removeSectionItem(content, "Likes", "going outside");
    expect(out.applied).toBe(true);
    expect(out.content).not.toContain("Going Outside");
  });
});
