import { describe, expect, it, vi } from "vitest";
import type { CharacterTemplate } from "../src/schemas";
import { DEFAULT_CHARACTER_FORMAT } from "../src/engine/characterFormat";
import {
  buildCharacterFamilyTree,
  collectCardSettings,
  displayTitle,
  hasCcv2Source,
  hasDistinctTitle,
  entryKind,
  filterLibraryEntries,
  groupByLineage,
  sortVersionGroups,
  getCharacterCreatedAt,
  getCharacterUpdatedAt,
  getGroupCreatedAt,
  getGroupUpdatedAt,
  normalizeCreator,
  normalizeTags,
} from "../src/engine/characterCards";

function makeEntry(
  overrides: Partial<CharacterTemplate> = {},
): CharacterTemplate {
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
    expect(
      normalizeTags([
        "Adventurer",
        "  dark  fantasy ",
        "Adventurer",
        "   ",
        "elf",
      ]),
    ).toEqual(["adventurer", "dark_fantasy", "elf"]);
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
    expect(normalizeCreator("http://www.example.com/Art")).toBe(
      "example.com/art",
    );
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

describe("displayTitle and hasDistinctTitle", () => {
  it("uses trimmed title when present, else name", () => {
    expect(displayTitle(makeEntry({ title: "  Mira the Brave  " }))).toBe(
      "Mira the Brave",
    );
    expect(displayTitle(makeEntry())).toBe("Mira");
  });

  it("detects when title is non-empty and distinct from name", () => {
    expect(
      hasDistinctTitle(makeEntry({ name: "Miku", title: "Miku — Anthro Fox" })),
    ).toBe(true);
    expect(hasDistinctTitle(makeEntry({ name: "Miku", title: "miku" }))).toBe(
      false,
    );
    expect(hasDistinctTitle(makeEntry({ name: "Miku", title: "   " }))).toBe(
      false,
    );
    expect(hasDistinctTitle(makeEntry({ name: "Miku" }))).toBe(false);
  });
});

describe("filterLibraryEntries", () => {
  const entries = [
    makeEntry({
      id: "char_1",
      name: "Mira",
      title: "Mira the Elf",
      tags: ["adventurer", "elf"],
      creator: "pplong",
      format: "ccv2",
    }),
    makeEntry({
      id: "char_2",
      name: "Flora",
      tags: ["merchant"],
      creator: "bob",
    }),
    makeEntry({
      id: "char_3",
      name: "Aldric",
      tags: ["elf", "knight"],
      creator: "pplong",
    }),
  ];

  it("empty query returns everything", () => {
    expect(filterLibraryEntries(entries, "  ")).toHaveLength(3);
  });

  it("ANDs multiple terms across tags/name/title", () => {
    expect(
      filterLibraryEntries(entries, "elf adventurer").map((e) => e.id),
    ).toEqual(["char_1"]);
    expect(
      filterLibraryEntries(entries, "elf")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["char_1", "char_3"]);
  });

  it("matches name and title case-insensitively", () => {
    expect(filterLibraryEntries(entries, "FLORA").map((e) => e.id)).toEqual([
      "char_2",
    ]);
    expect(filterLibraryEntries(entries, "the elf").map((e) => e.id)).toEqual([
      "char_1",
    ]);
  });

  it("-tag excludes", () => {
    expect(
      filterLibraryEntries(entries, "elf -knight").map((e) => e.id),
    ).toEqual(["char_1"]);
    expect(
      filterLibraryEntries(entries, "-merchant")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["char_1", "char_3"]);
  });

  it("creator: virtual namespace", () => {
    expect(
      filterLibraryEntries(entries, "creator:pplong")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["char_1", "char_3"]);
    expect(
      filterLibraryEntries(entries, "creator:Bob").map((e) => e.id),
    ).toEqual(["char_2"]);
    expect(
      filterLibraryEntries(entries, "creator:pplong elf")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["char_1", "char_3"]);
  });

  it("format: virtual namespace", () => {
    expect(
      filterLibraryEntries(entries, "format:ccv2").map((e) => e.id),
    ).toEqual(["char_1"]);
    expect(filterLibraryEntries(entries, "format:bl").map((e) => e.id)).toEqual(
      ["char_2", "char_3"],
    );
  });

  it("tag: virtual namespace", () => {
    expect(
      filterLibraryEntries(entries, "tag:elf")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["char_1", "char_3"]);
    expect(
      filterLibraryEntries(entries, "tag:merchant").map((e) => e.id),
    ).toEqual(["char_2"]);
    expect(
      filterLibraryEntries(entries, "tag:elf -tag:knight").map((e) => e.id),
    ).toEqual(["char_1"]);
  });

  it("tag: virtual namespace does exact matching without false substring hits", () => {
    const tailEntries = [
      makeEntry({ id: "char_tail", name: "Kitsune", tags: ["tail", "fox"] }),
      makeEntry({
        id: "char_twin",
        name: "Hatsune",
        tags: ["twin-tails", "vocalist"],
      }),
      makeEntry({
        id: "char_pony",
        name: "Rider",
        tags: ["ponytail", "spear"],
      }),
    ];
    // Exact tag match: tag:tail matches ONLY char_tail
    expect(
      filterLibraryEntries(tailEntries, "tag:tail").map((e) => e.id),
    ).toEqual(["char_tail"]);
    // Exact tag match: tag:twin-tails matches ONLY char_twin
    expect(
      filterLibraryEntries(tailEntries, "tag:twin-tails").map((e) => e.id),
    ).toEqual(["char_twin"]);
    // Space and underscore variants of twin-tails
    expect(
      filterLibraryEntries(tailEntries, "tag:twin_tails").map((e) => e.id),
    ).toEqual(["char_twin"]);
    // Wildcard match tag:*tail* matches all 3
    expect(
      filterLibraryEntries(tailEntries, "tag:*tail*")
        .map((e) => e.id)
        .sort(),
    ).toEqual(["char_pony", "char_tail", "char_twin"]);
  });

  it("matches tags with spaces and underscores interchangeably", () => {
    const spaceEntry = makeEntry({
      id: "char_space",
      tags: ["dark fantasy", "magic user"],
    });
    expect(
      filterLibraryEntries([spaceEntry], "tag:dark_fantasy").map((e) => e.id),
    ).toEqual(["char_space"]);
    expect(
      filterLibraryEntries([spaceEntry], 'tag:"dark fantasy"').map((e) => e.id),
    ).toEqual(["char_space"]);
    expect(
      filterLibraryEntries([spaceEntry], "dark_fantasy").map((e) => e.id),
    ).toEqual(["char_space"]);
  });

  it("negated namespace terms work", () => {
    expect(
      filterLibraryEntries(entries, "elf -format:ccv2").map((e) => e.id),
    ).toEqual(["char_3"]);
  });

  it("handles entries with undefined tags", () => {
    expect(
      filterLibraryEntries([makeEntry({ tags: undefined })], "elf"),
    ).toEqual([]);
  });
});

describe("collectCardSettings", () => {
  it("collects non-empty scenarios from ccv2 records only, deduped by scenario", () => {
    const entries = [
      makeEntry({
        id: "char_1",
        title: "Mira",
        format: "ccv2",
        scenario: "A dark forest.",
      }),
      makeEntry({
        id: "char_2",
        title: "Mira II",
        format: "ccv2",
        scenario: "A dark forest.",
      }),
      makeEntry({ id: "char_3", format: "ccv2", scenario: "  " }),
      makeEntry({ id: "char_4", name: "Flora", scenario: "A garden." }),
    ];
    expect(collectCardSettings(entries)).toEqual([
      { title: "Mira", scenario: "A dark forest." },
    ]);
  });

  it("returns [] when no ccv2 scenarios exist", () => {
    expect(collectCardSettings([makeEntry()])).toEqual([]);
    expect(collectCardSettings([makeEntry({ format: "ccv2" })])).toEqual([]);
  });
});

describe("convertCardApply", () => {
  it("caches original content and creatorNotes onto ccv2Content and ccv2CreatorNotes", async () => {
    const { convertCardApply } =
      await import("../src/server/characterCards/convertCard");
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
    const { convertCardGenerate } =
      await import("../src/server/characterCards/convertCard");
    const mockProvider = {
      generateCharacterSheet: vi
        .fn()
        .mockResolvedValue("[Species]: Cat\n[Appearance]\nCute ears"),
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
      {
        name: "Whiskers",
        description: "A playful stray cat in the city alleyways.",
      },
      expect.stringContaining("Setting/Scenario: Rainy cyberpunk alley"),
      undefined,
      DEFAULT_CHARACTER_FORMAT,
    );
    expect(result.content).toContain("[Species]: Cat");
  });

  it("prefers convertCharacterSheet on initial conversion when implemented on the provider", async () => {
    const { convertCardGenerate } =
      await import("../src/server/characterCards/convertCard");
    const mockProvider = {
      convertCharacterSheet: vi
        .fn()
        .mockResolvedValue("[Species]: Fox\n[Gender]: Female\n[Body]\n- Height: 5'5\""),
      generateCharacterSheet: vi.fn(),
      refineCharacterSheet: vi.fn(),
    } as any;

    const tpl = makeEntry({
      name: "Kitsune",
      format: "ccv2",
      content: "A clever shrine fox spirit.",
      scenario: "Mountain shrine",
      creatorNotes: "Speaks archaically",
      tags: ["fox", "shrine"],
    });

    const result = await convertCardGenerate(mockProvider, {
      template: tpl,
      feedback: "Preserve archaic speech",
    });

    expect(mockProvider.convertCharacterSheet).toHaveBeenCalledTimes(1);
    expect(mockProvider.generateCharacterSheet).not.toHaveBeenCalled();
    expect(mockProvider.convertCharacterSheet).toHaveBeenCalledWith(
      {
        name: "Kitsune",
        content: "A clever shrine fox spirit.",
        scenario: "Mountain shrine",
        creatorNotes: "Speaks archaically",
        tags: ["fox", "shrine"],
        feedback: "Preserve archaic speech",
      },
      DEFAULT_CHARACTER_FORMAT,
      undefined,
    );
    expect(result.content).toContain("[Species]: Fox");
  });

  it("extractSheetContentFromOutput handles canonical JSON, unescaped quotes, and raw [Section] markdown", async () => {
    const { extractSheetContentFromOutput } =
      await import("../src/server/openAiCompatibleProvider");

    // 1. Canonical JSON
    expect(
      extractSheetContentFromOutput(
        JSON.stringify({ content: "[Species]: Human\n[Gender]: Female" }),
      ),
    ).toBe("[Species]: Human\n[Gender]: Female");

    // 2. Unescaped inch-mark quote inside JSON string (e.g. Height: 5'7")
    const brokenJson =
      '{"content": "[Species]: Fox\\n[Gender]: Female\\n\\n[Body]\\n- Height: 5\'7"\\n- Build: Athletic"}';
    expect(extractSheetContentFromOutput(brokenJson)).toContain(
      "- Height: 5'7\"",
    );

    // 3. Raw [Section] output after <think> block without JSON wrapper
    const rawMarkdown =
      "<think>Converting card sections...</think>\n[Species]: Anthro Wolf\n[Gender]: Female\n\n[Personality]\n- Loyal and protective";
    expect(extractSheetContentFromOutput(rawMarkdown)).toBe(
      "[Species]: Anthro Wolf\n[Gender]: Female\n\n[Personality]\n- Loyal and protective",
    );
  });

  it("calls refineCharacterSheet when both feedback and currentContent are provided", async () => {
    const { convertCardGenerate } =
      await import("../src/server/characterCards/convertCard");
    const mockProvider = {
      generateCharacterSheet: vi.fn(),
      refineCharacterSheet: vi
        .fn()
        .mockResolvedValue(
          "[Species]: Cat\n[Appearance]\nCute silver ears\n[Personality]\nEnergetic",
        ),
    } as any;

    const tpl = makeEntry({
      name: "Whiskers",
      format: "ccv2",
      content: "A playful stray cat in the city alleyways.",
    });

    const currentDraft =
      "[Species]: Cat\n[Appearance]\nCute ears\n[Personality]\nLazy";
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
      DEFAULT_CHARACTER_FORMAT,
    );
    expect(result.content).toContain("Cute silver ears");
  });

  it("preserves ccv2Tags and ccv2CreatorNotes when convertCardApply is executed", async () => {
    const { convertCardApply } =
      await import("../src/server/characterCards/convertCard");
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
      const { parseTagsFromModelOutput } =
        await import("../src/server/openAiCompatibleProvider");
      const output = JSON.stringify({
        tags: ["female", "elf", "mage", "introvert"],
      });
      expect(parseTagsFromModelOutput(output)).toEqual([
        "female",
        "elf",
        "mage",
        "introvert",
      ]);
    });

    it("parses markdown-fenced JSON object or array", async () => {
      const { parseTagsFromModelOutput } =
        await import("../src/server/openAiCompatibleProvider");
      const output =
        '```json\n{\n  "tags": ["cyberpunk", "hacker", "female"]\n}\n```';
      expect(parseTagsFromModelOutput(output)).toEqual([
        "cyberpunk",
        "hacker",
        "female",
      ]);
    });

    it("parses raw JSON array output", async () => {
      const { parseTagsFromModelOutput } =
        await import("../src/server/openAiCompatibleProvider");
      const output = '["dragon", "warrior", "fire-magic"]';
      expect(parseTagsFromModelOutput(output)).toEqual([
        "dragon",
        "warrior",
        "fire-magic",
      ]);
    });

    it("parses bullet point text lists from LLMs", async () => {
      const { parseTagsFromModelOutput } =
        await import("../src/server/openAiCompatibleProvider");
      const output = "- Female\n- Elf\n- Pyromancer\n- Royalty";
      expect(parseTagsFromModelOutput(output)).toEqual([
        "female",
        "elf",
        "pyromancer",
        "royalty",
      ]);
    });

    it("parses outputs from reasoning models containing <think> blocks", async () => {
      const { parseTagsFromModelOutput } =
        await import("../src/server/openAiCompatibleProvider");
      const output =
        '<think>\nThe character is a fox kitsune with magical tail abilities.\nI should output tags for kitsune, fox, magic.\n</think>\n```json\n{\n  "tags": ["kitsune", "fox", "tail", "magic"]\n}\n```';
      expect(parseTagsFromModelOutput(output)).toEqual([
        "kitsune",
        "fox",
        "tail",
        "magic",
      ]);
    });
  });

  describe("brainstormCharacter", () => {
    it("parses structured reply with surgical proposedChanges", async () => {
      const { OpenAICompatibleProvider } =
        await import("../src/server/openAiCompatibleProvider");
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply:
                  "I've revised the Personality and Likes to make her more cheerful and fond of stargazing.",
                proposedChanges: {
                  sections: [
                    {
                      header: "Personality",
                      body: "- Cheerful and optimistic\n- Always looks on the bright side",
                    },
                    { header: "Likes", body: "- Stargazing\n- Sweet pastries" },
                  ],
                  tags: ["cheerful", "stargazer"],
                },
              }),
            },
          },
        ],
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
          timeoutMs: 120_000,
        },
        mockFetch as unknown as typeof fetch,
      );

      const result = await provider.brainstormCharacter({
        character: {
          name: "Mira",
          content: "[Species]: Elf\n[Gender]: Female\n\n[Personality]\n- Quiet",
          tags: ["elf"],
        },
        chatHistory: [],
        userMessage: "Make her cheerful and add hobbies",
      });

      expect(result.reply).toContain("cheerful");
      expect(result.proposedChanges?.sections).toHaveLength(2);
      expect(result.proposedChanges?.sections?.[0].header).toBe("Personality");
      expect(result.proposedChanges?.sections?.[0].body).toContain(
        "Cheerful and optimistic",
      );
      expect(result.proposedChanges?.tags).toEqual(["cheerful", "stargazer"]);
    });

    it("handles conversational brainstorming responses with no proposed card edits", async () => {
      const { OpenAICompatibleProvider } =
        await import("../src/server/openAiCompatibleProvider");
      const payload = {
        choices: [
          {
            message: {
              content: JSON.stringify({
                reply:
                  "Here are 3 possible backstory ideas for an ex-pirate navigator...",
                proposedChanges: null,
              }),
            },
          },
        ],
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
          timeoutMs: 120_000,
        },
        mockFetch as unknown as typeof fetch,
      );

      const result = await provider.brainstormCharacter({
        character: {
          name: "Captain Jack",
          content: "[Species]: Human",
        },
        chatHistory: [],
        userMessage: "Give me some backstory ideas",
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
    expect(asc.map((g) => g.versions[0].name)).toEqual([
      "Alice",
      "Bob Updated",
      "Zoe",
    ]);

    const desc = groupByLineage(allTemplates, "name", "desc");
    expect(desc.map((g) => g.versions[0].name)).toEqual([
      "Zoe",
      "Bob Updated",
      "Alice",
    ]);
  });

  it("sorts by createdAt (earliest in lineage for created date)", () => {
    // Earliest created dates: Zoe (Jan 1), Bob (Jan 2), Alice (Jan 3)
    const asc = groupByLineage(allTemplates, "createdAt", "asc");
    expect(asc.map((g) => g.versions[0].name)).toEqual([
      "Zoe",
      "Bob Updated",
      "Alice",
    ]);

    const desc = groupByLineage(allTemplates, "createdAt", "desc");
    expect(desc.map((g) => g.versions[0].name)).toEqual([
      "Alice",
      "Bob Updated",
      "Zoe",
    ]);
  });

  it("sorts by updatedAt (latest in lineage for updated date)", () => {
    // Latest updated dates: Alice (Jan 3), Zoe (Jan 5), Bob (Jan 10)
    const asc = groupByLineage(allTemplates, "updatedAt", "asc");
    expect(asc.map((g) => g.versions[0].name)).toEqual([
      "Alice",
      "Zoe",
      "Bob Updated",
    ]);

    const desc = groupByLineage(allTemplates, "updatedAt", "desc");
    expect(desc.map((g) => g.versions[0].name)).toEqual([
      "Bob Updated",
      "Zoe",
      "Alice",
    ]);
  });

  it("falls back to timestamp extracted from char_<timestamp> ID when createdAt is missing", () => {
    const charWithIdOnly = makeEntry({
      id: "char_1704067200000", // 2024-01-01T00:00:00.000Z
      name: "Fallback Test",
    });
    expect(getCharacterCreatedAt(charWithIdOnly)).toBe(
      "2024-01-01T00:00:00.000Z",
    );
  });

  it("keeps multiple character variants with the same in-story name in separate folders without colliding", async () => {
    const { mkdtempSync, rmSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const {
      createCharacterTemplateRecord,
      duplicateCharacterTemplateRecord,
      listCharacterTemplates,
      updateCharacterTemplateRecord,
    } = await import("../src/server/store");

    const tempDir = mkdtempSync(join(tmpdir(), "bl-char-variants-"));
    try {
      const mikuFox = createCharacterTemplateRecord(
        "Miku",
        tempDir,
        "Miku — Anthro Fox",
      );
      const mikuCruel = createCharacterTemplateRecord(
        "Miku",
        tempDir,
        "Miku — Cruel",
      );

      // Update the second Miku variant and verify the first Miku variant is untouched
      updateCharacterTemplateRecord(
        mikuCruel.id,
        { content: "[Species]: Human\n[Personality]\nCruel and cold" },
        tempDir,
      );

      // Duplicate the first variant and verify it preserves name="Miku" with a variant title
      const duplicated = duplicateCharacterTemplateRecord(mikuFox.id, tempDir);
      expect(duplicated).not.toBeNull();
      expect(duplicated?.name).toBe("Miku");
      expect(duplicated?.title).toBe("Miku — Anthro Fox (Variant)");

      const all = listCharacterTemplates(tempDir);
      expect(all).toHaveLength(3);
      expect(all.every((c) => c.name === "Miku")).toBe(true);
      expect(all.map((c) => displayTitle(c)).sort()).toEqual([
        "Miku — Anthro Fox",
        "Miku — Anthro Fox (Variant)",
        "Miku — Cruel",
      ]);
      // Duplicated variant automatically links parentId to the source card
      expect(duplicated?.parentId).toBe(mikuFox.id);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("builds a Parent -> Child / Sibling family tree and detaches CCv2 source while preserving portrait art", async () => {
    const { existsSync, mkdtempSync, rmSync, writeFileSync } = await import(
      "node:fs"
    );
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const {
      createCharacterTemplateRecord,
      detachCharacterCcv2Source,
      getCharacterAvatarPath,
      listCharacterTemplates,
      saveCharacterTemplateRecord,
      updateCharacterTemplateRecord,
    } = await import("../src/server/store");

    const tempDir = mkdtempSync(join(tmpdir(), "bl-char-family-"));
    try {
      const rootAveri = createCharacterTemplateRecord("Averi", tempDir);
      const bullyAveri = createCharacterTemplateRecord(
        "Averi",
        tempDir,
        "Averi - Bully",
      );

      // Simulate converted CCv2 / BL metadata on bullyAveri with a sidecar PNG
      const bullyFolder = join(tempDir, "averi-bully");
      writeFileSync(join(bullyFolder, "averi-bully.png"), "fake-png-bytes");
      saveCharacterTemplateRecord(
        {
          ...bullyAveri,
          parentId: rootAveri.id,
          ccv2Content: "Original CCv2 description",
          ccv2CreatorNotes: "Original notes",
          ccv2Tags: ["bully"],
          cardRef: { file: "averi-bully.png", kind: "png" },
        },
        tempDir,
      );

      const beforeDetach = listCharacterTemplates(tempDir);
      const fam = buildCharacterFamilyTree(bullyAveri.id, beforeDetach);
      expect(fam).not.toBeNull();
      expect(fam?.root.id).toBe(rootAveri.id);
      expect(fam?.parent?.id).toBe(rootAveri.id);
      expect(fam?.members.map((m) => m.id)).toEqual([
        rootAveri.id,
        bullyAveri.id,
      ]);
      expect(hasCcv2Source(fam!.focus)).toBe(true);

      // Prevent cycle: attempting to set rootAveri.parentId = bullyAveri.id is ignored
      const cycleAttempt = updateCharacterTemplateRecord(
        rootAveri.id,
        { parentId: bullyAveri.id },
        tempDir,
      );
      expect(cycleAttempt?.parentId).toBeUndefined();

      // Detach CCv2 source on bullyAveri -> becomes pure BL and promotes averi-bully.png to portrait.png
      const detached = detachCharacterCcv2Source(bullyAveri.id, tempDir);
      expect(detached).not.toBeNull();
      expect(hasCcv2Source(detached!)).toBe(false);
      expect(detached?.ccv2Content).toBeUndefined();
      expect(detached?.cardRef).toBeUndefined();
      expect(existsSync(join(bullyFolder, "portrait.png"))).toBe(true);
      expect(getCharacterAvatarPath(bullyAveri.id, "portrait", tempDir)).toBe(
        join(bullyFolder, "portrait.png"),
      );
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("exports and imports BobbinLoom character packages with optional CCv2 source and related family cards", async () => {
    const { mkdtempSync, rmSync, writeFileSync } = await import("node:fs");
    const { tmpdir } = await import("node:os");
    const { join } = await import("node:path");
    const {
      createCharacterTemplateRecord,
      listCharacterTemplates,
      saveCharacterTemplateRecord,
    } = await import("../src/server/store");
    const { exportCharacterPackage, importCharacterPackage } = await import(
      "../src/server/characterCards/characterPackage"
    );

    const srcDir = mkdtempSync(join(tmpdir(), "bl-char-export-src-"));
    const dstDir = mkdtempSync(join(tmpdir(), "bl-char-export-dst-"));
    try {
      const rootCard = createCharacterTemplateRecord("Averi", srcDir);
      const childCard = createCharacterTemplateRecord(
        "Averi",
        srcDir,
        "Averi — Knight",
      );
      const ccv2OnlyCard = createCharacterTemplateRecord("RawCcv2", srcDir);

      // Save rootCard with CCv2 source metadata
      const rootFolder = join(srcDir, "averi");
      writeFileSync(
        join(rootFolder, "averi.card.json"),
        '{"name":"Averi","description":"Original CCv2"}',
      );
      saveCharacterTemplateRecord(
        {
          ...rootCard,
          content: "[Species]: Elf\n\n[Personality]\nCalm",
          creator: "author1",
          cardVersion: "2.0",
          tags: ["species:elf"],
          ccv2Content: "Original CCv2 sheet",
          ccv2CreatorNotes: "Original CCv2 notes",
          ccv2Tags: ["elf"],
          scenario: "Original scenario",
          cardRef: { file: "averi.card.json", kind: "json" },
        },
        srcDir,
      );

      // Save childCard linked to rootCard
      saveCharacterTemplateRecord(
        {
          ...childCard,
          parentId: rootCard.id,
          content: "[Species]: Elf\n\n[Personality]\nChivalrous",
          tags: ["species:elf", "role:knight"],
        },
        srcDir,
      );

      // Save ccv2OnlyCard as unconverted CCv2 (also linked to rootCard to verify it is excluded from BL export)
      saveCharacterTemplateRecord(
        {
          ...ccv2OnlyCard,
          parentId: rootCard.id,
          format: "ccv2",
        },
        srcDir,
      );

      // 1. Unconverted CCv2 card cannot be exported as a BL package
      const rejected = await exportCharacterPackage(
        ccv2OnlyCard.id,
        { format: "json" },
        srcDir,
      );
      expect(rejected).toBeNull();

      // 2. Export rootCard as BL-only (includeCcv2: false, includeFamily: false), requesting webp without portrait -> falls back to json
      const blOnlyPkg = await exportCharacterPackage(
        rootCard.id,
        { format: "webp", includeCcv2: false, includeFamily: false },
        srcDir,
      );
      expect(blOnlyPkg).not.toBeNull();
      expect(blOnlyPkg!.actualFormat).toBe("json");
      expect(blOnlyPkg!.fileName).toBe("averi.chara.json");

      const importedSingle = await importCharacterPackage(
        blOnlyPkg!.buffer,
        dstDir,
      );
      expect(importedSingle.records).toHaveLength(1);
      expect(importedSingle.record.name).toBe("Averi");
      expect(importedSingle.record.cardVersion).toBe("2.0");
      expect(hasCcv2Source(importedSingle.record)).toBe(false);

      // 3. Export rootCard WITH CCv2 source AND related family cards (includeCcv2: true, includeFamily: true) as JSON
      const fullFamilyPkg = await exportCharacterPackage(
        rootCard.id,
        { format: "json", includeCcv2: true, includeFamily: true },
        srcDir,
      );
      expect(fullFamilyPkg).not.toBeNull();
      expect(fullFamilyPkg!.fileName).toBe("averi.averi-knight.charapack.json");

      const importedFamily = await importCharacterPackage(
        fullFamilyPkg!.buffer,
        dstDir,
      );
      expect(importedFamily.records).toHaveLength(2);
      const [importedRoot, importedChild] = importedFamily.records;
      expect(hasCcv2Source(importedRoot)).toBe(true);
      expect(importedRoot.ccv2Content).toBe("Original CCv2 sheet");
      expect(importedRoot.scenario).toBe("Original scenario");
      expect(importedChild.title).toBe("Averi — Knight");
      expect(importedChild.parentId).toBe(importedRoot.id);

      // 4. Add a portrait to rootCard and export multi-card .charapack.webp with collage image
      const { loadSharp } = await import("../src/server/imageTranscode");
      const sharp = await loadSharp();
      const redPng = await sharp({
        create: {
          width: 40,
          height: 60,
          channels: 4,
          background: { r: 220, g: 50, b: 50, alpha: 1 },
        },
      })
        .png()
        .toBuffer();
      const { saveCharacterAvatar } = await import("../src/server/store");
      saveCharacterAvatar(rootCard.id, "portrait", redPng, "png", srcDir);

      const webpCollagePkg = await exportCharacterPackage(
        rootCard.id,
        { format: "webp", includeCcv2: false, includeFamily: true },
        srcDir,
      );
      expect(webpCollagePkg).not.toBeNull();
      expect(webpCollagePkg!.actualFormat).toBe("webp");
      expect(webpCollagePkg!.fileName).toBe(
        "averi.averi-knight.charapack.webp",
      );

      // Verify the outer WebP image is a 2-tile collage (width = 2 * 360 + 6 = 726, height = 540)
      const collageMeta = await sharp(webpCollagePkg!.buffer).metadata();
      expect(collageMeta.width).toBe(726);
      expect(collageMeta.height).toBe(540);

      const importedWebpFamily = await importCharacterPackage(
        webpCollagePkg!.buffer,
        dstDir,
      );
      expect(importedWebpFamily.records).toHaveLength(2);
      // Primary card has its individual customPortrait restored, while child had no portrait so it stays empty
      expect(importedWebpFamily.records[0].customPortrait).toBeDefined();
      expect(importedWebpFamily.records[1].customPortrait).toBeUndefined();

      const allInDst = listCharacterTemplates(dstDir);
      expect(allInDst).toHaveLength(5); // 1 single + 2 JSON family + 2 WebP family (duplicates kept separately)
    } finally {
      rmSync(srcDir, { recursive: true, force: true });
      rmSync(dstDir, { recursive: true, force: true });
    }
  });
});
