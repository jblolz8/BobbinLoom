import { describe, expect, it, vi } from "vitest";
import type { CharacterTemplate } from "../src/schemas";
import {
  collectCardSettings,
  displayTitle,
  entryKind,
  filterLibraryEntries,
  groupByLineage,
  sortVersionGroups,
  getCharacterCreatedAt,
  getCharacterUpdatedAt,
  getGroupCreatedAt,
  getGroupUpdatedAt,
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

  it("tag: virtual namespace", () => {
    expect(filterLibraryEntries(entries, "tag:elf").map((e) => e.id).sort()).toEqual(["char_1", "char_3"]);
    expect(filterLibraryEntries(entries, "tag:merchant").map((e) => e.id)).toEqual(["char_2"]);
    expect(filterLibraryEntries(entries, "tag:elf -tag:knight").map((e) => e.id)).toEqual(["char_1"]);
  });

  it("tag: virtual namespace does exact matching without false substring hits", () => {
    const tailEntries = [
      makeEntry({ id: "char_tail", name: "Kitsune", tags: ["tail", "fox"] }),
      makeEntry({ id: "char_twin", name: "Hatsune", tags: ["twin-tails", "vocalist"] }),
      makeEntry({ id: "char_pony", name: "Rider", tags: ["ponytail", "spear"] }),
    ];
    // Exact tag match: tag:tail matches ONLY char_tail
    expect(filterLibraryEntries(tailEntries, "tag:tail").map((e) => e.id)).toEqual(["char_tail"]);
    // Exact tag match: tag:twin-tails matches ONLY char_twin
    expect(filterLibraryEntries(tailEntries, "tag:twin-tails").map((e) => e.id)).toEqual(["char_twin"]);
    // Space and underscore variants of twin-tails
    expect(filterLibraryEntries(tailEntries, "tag:twin_tails").map((e) => e.id)).toEqual(["char_twin"]);
    // Wildcard match tag:*tail* matches all 3
    expect(filterLibraryEntries(tailEntries, "tag:*tail*").map((e) => e.id).sort()).toEqual(["char_pony", "char_tail", "char_twin"]);
  });

  it("matches tags with spaces and underscores interchangeably", () => {
    const spaceEntry = makeEntry({ id: "char_space", tags: ["dark fantasy", "magic user"] });
    expect(filterLibraryEntries([spaceEntry], "tag:dark_fantasy").map((e) => e.id)).toEqual(["char_space"]);
    expect(filterLibraryEntries([spaceEntry], 'tag:"dark fantasy"').map((e) => e.id)).toEqual(["char_space"]);
    expect(filterLibraryEntries([spaceEntry], "dark_fantasy").map((e) => e.id)).toEqual(["char_space"]);
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

describe("convertCardApply", () => {
  it("caches original content and creatorNotes onto ccv2Content and ccv2CreatorNotes", async () => {
    const { convertCardApply } = await import("../src/server/characterCards/convertCard");
    const tpl = makeEntry({
      format: "ccv2",
      content: "Original tavern description",
      creatorNotes: "Original author notes",
    });

    const updates = convertCardApply({
      template: tpl,
      content: "[Species]: Fox\n[Personality]\nClever",
    });

    expect(updates.content).toBe("[Species]: Fox\n[Personality]\nClever");
    expect(updates.format).toBeUndefined();
    expect(updates.ccv2Content).toBe("Original tavern description");
    expect(updates.ccv2CreatorNotes).toBe("Original author notes");
  });
});

describe("convertCardGenerate", () => {
  it("calls generateCharacterSheet on initial conversion without feedback", async () => {
    const { convertCardGenerate } = await import("../src/server/characterCards/convertCard");
    const mockProvider = {
      generateCharacterSheet: vi.fn().mockResolvedValue("[Species]: Cat\n[Appearance]\nCute ears"),
      refineCharacterSheet: vi.fn(),
    } as any;

    const tpl = makeEntry({
      name: "Whiskers",
      format: "ccv2",
      content: "A playful stray cat in the city alleyways.",
      scenario: "Rainy cyberpunk alley",
      creatorNotes: "Use playful emotes",
      tags: ["cat", "cyberpunk"],
    });

    const result = await convertCardGenerate(mockProvider, { template: tpl });

    expect(mockProvider.generateCharacterSheet).toHaveBeenCalledTimes(1);
    expect(mockProvider.refineCharacterSheet).not.toHaveBeenCalled();
    expect(mockProvider.generateCharacterSheet).toHaveBeenCalledWith(
      { name: "Whiskers", description: "A playful stray cat in the city alleyways." },
      expect.stringContaining("Setting/Scenario: Rainy cyberpunk alley"),
      undefined,
      undefined
    );
    expect(result.content).toContain("[Species]: Cat");
  });

  it("calls refineCharacterSheet when both feedback and currentContent are provided", async () => {
    const { convertCardGenerate } = await import("../src/server/characterCards/convertCard");
    const mockProvider = {
      generateCharacterSheet: vi.fn(),
      refineCharacterSheet: vi.fn().mockResolvedValue("[Species]: Cat\n[Appearance]\nCute silver ears\n[Personality]\nEnergetic"),
    } as any;

    const tpl = makeEntry({
      name: "Whiskers",
      format: "ccv2",
      content: "A playful stray cat in the city alleyways.",
    });

    const currentDraft = "[Species]: Cat\n[Appearance]\nCute ears\n[Personality]\nLazy";
    const feedback = "Make the ears silver and make personality energetic";

    const result = await convertCardGenerate(mockProvider, {
      template: tpl,
      currentContent: currentDraft,
      feedback,
    });

    expect(mockProvider.generateCharacterSheet).not.toHaveBeenCalled();
    expect(mockProvider.refineCharacterSheet).toHaveBeenCalledTimes(1);
    expect(mockProvider.refineCharacterSheet).toHaveBeenCalledWith(
      currentDraft,
      "A playful stray cat in the city alleyways.",
      feedback,
      "(no additional context)",
      undefined,
      undefined
    );
    expect(result.content).toContain("Cute silver ears");
  });

  it("preserves ccv2Tags and ccv2CreatorNotes when convertCardApply is executed", async () => {
    const { convertCardApply } = await import("../src/server/characterCards/convertCard");
    const tpl = makeEntry({
      name: "Sylvia",
      format: "ccv2",
      content: "Original CCv2 content",
      creatorNotes: "Original notes",
      tags: ["elf", "archer", "forest"],
    });

    const applied = convertCardApply({
      template: tpl,
      content: "[Species]: Elf\n[Class]: Archer",
    });

    expect(applied.content).toBe("[Species]: Elf\n[Class]: Archer");
    expect(applied.format).toBeUndefined();
    expect(applied.ccv2Content).toBe("Original CCv2 content");
    expect(applied.ccv2CreatorNotes).toBe("Original notes");
    expect(applied.ccv2Tags).toEqual(["elf", "archer", "forest"]);
  });

  describe("parseTagsFromModelOutput", () => {
    it("parses standard JSON object with tags array", async () => {
      const { parseTagsFromModelOutput } = await import("../src/server/openAiCompatibleProvider");
      const output = JSON.stringify({ tags: ["female", "elf", "mage", "introvert"] });
      expect(parseTagsFromModelOutput(output)).toEqual(["female", "elf", "mage", "introvert"]);
    });

    it("parses markdown-fenced JSON object or array", async () => {
      const { parseTagsFromModelOutput } = await import("../src/server/openAiCompatibleProvider");
      const output = "```json\n{\n  \"tags\": [\"cyberpunk\", \"hacker\", \"female\"]\n}\n```";
      expect(parseTagsFromModelOutput(output)).toEqual(["cyberpunk", "hacker", "female"]);
    });

    it("parses raw JSON array output", async () => {
      const { parseTagsFromModelOutput } = await import("../src/server/openAiCompatibleProvider");
      const output = '["dragon", "warrior", "fire-magic"]';
      expect(parseTagsFromModelOutput(output)).toEqual(["dragon", "warrior", "fire-magic"]);
    });

    it("parses bullet point text lists from LLMs", async () => {
      const { parseTagsFromModelOutput } = await import("../src/server/openAiCompatibleProvider");
      const output = "- Female\n- Elf\n- Pyromancer\n- Royalty";
      expect(parseTagsFromModelOutput(output)).toEqual(["female", "elf", "pyromancer", "royalty"]);
    });

    it("parses outputs from reasoning models containing <think> blocks", async () => {
      const { parseTagsFromModelOutput } = await import("../src/server/openAiCompatibleProvider");
      const output = "<think>\nThe character is a fox kitsune with magical tail abilities.\nI should output tags for kitsune, fox, magic.\n</think>\n```json\n{\n  \"tags\": [\"kitsune\", \"fox\", \"tail\", \"magic\"]\n}\n```";
      expect(parseTagsFromModelOutput(output)).toEqual(["kitsune", "fox", "tail", "magic"]);
    });
  });

  describe("brainstormCharacter", () => {
    it("parses structured reply with surgical proposedChanges", async () => {
      const { OpenAICompatibleProvider } = await import("../src/server/openAiCompatibleProvider");
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "I've revised the Personality and Likes to make her more cheerful and fond of stargazing.",
                proposedChanges: {
                  sections: [
                    { header: "Personality", body: "- Cheerful and optimistic\n- Always looks on the bright side" },
                    { header: "Likes", body: "- Stargazing\n- Sweet pastries" }
                  ],
                  tags: ["cheerful", "stargazer"]
                }
              })
            }
          }
        ]
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      });

      const provider = new OpenAICompatibleProvider(
        {
          providerId: "openai-compatible",
          label: "Test",
          baseUrl: "http://localhost:1234/v1",
          apiKey: "test",
          model: "test-model",
          temperature: 0.7,
          maxTokens: 2000,
          contextWindow: 32768,
          maxRetries: 1,
          timeoutMs: 120_000
        },
        mockFetch as unknown as typeof fetch
      );

      const result = await provider.brainstormCharacter({
        character: {
          name: "Mira",
          content: "[Species]: Elf\n[Gender]: Female\n\n[Personality]\n- Quiet",
          tags: ["elf"]
        },
        chatHistory: [],
        userMessage: "Make her cheerful and add hobbies"
      });

      expect(result.reply).toContain("cheerful");
      expect(result.proposedChanges?.sections).toHaveLength(2);
      expect(result.proposedChanges?.sections?.[0].header).toBe("Personality");
      expect(result.proposedChanges?.sections?.[0].body).toContain("Cheerful and optimistic");
      expect(result.proposedChanges?.tags).toEqual(["cheerful", "stargazer"]);
    });

    it("handles conversational brainstorming responses with no proposed card edits", async () => {
      const { OpenAICompatibleProvider } = await import("../src/server/openAiCompatibleProvider");
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply: "Here are 3 possible backstory ideas for an ex-pirate navigator...",
                proposedChanges: null
              })
            }
          }
        ]
      };
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => payload,
        text: async () => JSON.stringify(payload),
      });

      const provider = new OpenAICompatibleProvider(
        {
          providerId: "openai-compatible",
          label: "Test",
          baseUrl: "http://localhost:1234/v1",
          apiKey: "test",
          model: "test-model",
          temperature: 0.7,
          maxTokens: 2000,
          contextWindow: 32768,
          maxRetries: 1,
          timeoutMs: 120_000
        },
        mockFetch as unknown as typeof fetch
      );

      const result = await provider.brainstormCharacter({
        character: {
          name: "Captain Jack",
          content: "[Species]: Human"
        },
        chatHistory: [],
        userMessage: "Give me some backstory ideas"
      });

      expect(result.reply).toContain("Here are 3 possible backstory ideas");
      expect(result.proposedChanges).toBeUndefined();
    });
  });
});

describe("groupByLineage and sortVersionGroups", () => {
  const t1 = makeEntry({
    id: "char_1700000000000",
    name: "Zoe",
    createdAt: "2024-01-01T00:00:00.000Z",
    updatedAt: "2024-01-05T00:00:00.000Z",
  });
  const t2 = makeEntry({
    id: "char_1700000001000",
    name: "Alice",
    createdAt: "2024-01-03T00:00:00.000Z",
    updatedAt: "2024-01-03T00:00:00.000Z",
  });
  const t3v1 = makeEntry({
    id: "char_1700000002000",
    lineageId: "lineage_bob",
    name: "Bob",
    version: 1,
    createdAt: "2024-01-02T00:00:00.000Z",
    updatedAt: "2024-01-02T00:00:00.000Z",
  });
  const t3v2 = makeEntry({
    id: "char_1700000003000",
    lineageId: "lineage_bob",
    name: "Bob Updated",
    version: 2,
    createdAt: "2024-01-04T00:00:00.000Z",
    updatedAt: "2024-01-10T00:00:00.000Z",
  });

  const allTemplates = [t1, t2, t3v1, t3v2];

  it("groups by lineage with latest version first inside group", () => {
    const groups = groupByLineage(allTemplates, "name", "asc");
    expect(groups).toHaveLength(3);
    const bobGroup = groups.find((g) => g.key === "lineage_bob")!;
    expect(bobGroup.versions[0].version).toBe(2);
    expect(bobGroup.versions[0].name).toBe("Bob Updated");
    expect(bobGroup.versions[1].version).toBe(1);
  });

  it("sorts by name ascending and descending", () => {
    const asc = groupByLineage(allTemplates, "name", "asc");
    expect(asc.map((g) => g.versions[0].name)).toEqual(["Alice", "Bob Updated", "Zoe"]);

    const desc = groupByLineage(allTemplates, "name", "desc");
    expect(desc.map((g) => g.versions[0].name)).toEqual(["Zoe", "Bob Updated", "Alice"]);
  });

  it("sorts by createdAt (earliest in lineage for created date)", () => {
    // Earliest created dates: Zoe (Jan 1), Bob (Jan 2), Alice (Jan 3)
    const asc = groupByLineage(allTemplates, "createdAt", "asc");
    expect(asc.map((g) => g.versions[0].name)).toEqual(["Zoe", "Bob Updated", "Alice"]);

    const desc = groupByLineage(allTemplates, "createdAt", "desc");
    expect(desc.map((g) => g.versions[0].name)).toEqual(["Alice", "Bob Updated", "Zoe"]);
  });

  it("sorts by updatedAt (latest in lineage for updated date)", () => {
    // Latest updated dates: Alice (Jan 3), Zoe (Jan 5), Bob (Jan 10)
    const asc = groupByLineage(allTemplates, "updatedAt", "asc");
    expect(asc.map((g) => g.versions[0].name)).toEqual(["Alice", "Zoe", "Bob Updated"]);

    const desc = groupByLineage(allTemplates, "updatedAt", "desc");
    expect(desc.map((g) => g.versions[0].name)).toEqual(["Bob Updated", "Zoe", "Alice"]);
  });

  it("falls back to timestamp extracted from char_<timestamp> ID when createdAt is missing", () => {
    const charWithIdOnly = makeEntry({
      id: "char_1704067200000", // 2024-01-01T00:00:00.000Z
      name: "Fallback Test",
    });
    expect(getCharacterCreatedAt(charWithIdOnly)).toBe("2024-01-01T00:00:00.000Z");
  });
});

