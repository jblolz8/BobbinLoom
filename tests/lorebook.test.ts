import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { mkdtempSync, rmSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import { describe, expect, it } from "vitest";
import {
  scanLorebooks,
  updateTimingStates,
  type ActivatedEntry,
  type LorebookScanOptions,
} from "../src/engine/engine";
import { saveLorebook, uniqueLorebookId } from "../src/server/store";
import { LorebookLibrary } from "../src/client/components/library/LorebookLibrary";
import { LorebookEditor } from "../src/client/components/library/editor";
import type { EntryTimingState, LorebookEntry } from "../src/schemas";

function entry(overrides: Partial<LorebookEntry> = {}): LorebookEntry {
  return {
    uid: 1,
    key: [],
    keysecondary: [],
    content: "Test content",
    comment: "",
    constant: false,
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
    delayUntilRecursion: false,
    ...overrides,
  };
}

function scanOpts(
  overrides: Partial<LorebookScanOptions> = {},
): LorebookScanOptions {
  return {
    messages: [
      { role: "user", content: "The knight enters the castle." },
      { role: "assistant", content: "The throne room is dark and silent." },
    ],
    entries: [],
    lorebookDefaults: {
      scanDepth: 2,
      caseSensitive: false,
      matchWholeWords: false,
    },
    ...overrides,
  };
}

// ── Keyword matching ──

describe("scanLorebooks - keyword matching", () => {
  it("activates on primary key match", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["knight"] })],
      }),
    );
    expect(result.length).toBe(1);
    expect(result[0].entry.uid).toBe(1);
    expect(result[0].matchedKeys).toContain("knight");
  });

  it("activates on case-insensitive match by default", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["KNIGHT"] })],
      }),
    );
    expect(result.length).toBe(1);
  });

  it("does not activate on case-sensitive mismatch", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["KNIGHT"], caseSensitive: true })],
      }),
    );
    expect(result.length).toBe(0);
  });

  it("matches whole words only", () => {
    const opts = scanOpts({
      entries: [entry({ uid: 1, key: ["cast"], matchWholeWords: true })],
    });
    // "castle" contains "cast" but not as a whole word
    const result = scanLorebooks(opts);
    expect(result.length).toBe(0);
  });

  it("matches whole words when word boundaries present", () => {
    const opts = scanOpts({
      messages: [{ role: "user", content: "I cast a spell." }],
      entries: [entry({ uid: 1, key: ["cast"], matchWholeWords: true })],
    });
    const result = scanLorebooks(opts);
    expect(result.length).toBe(1);
  });

  it("activates on regex key", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["kni.+ht"], useRegex: true })],
      }),
    );
    expect(result.length).toBe(1);
  });

  it("multiple primary keys: any match activates", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["dragon", "knight", "wizard"] })],
      }),
    );
    expect(result.length).toBe(1);
    expect(result[0].matchedKeys).toContain("knight");
  });
});

// ── Selective logic ──

describe("scanLorebooks - selective logic", () => {
  it("AND_ANY: primary match + at least one secondary passes", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["castle", "dragon"],
            selective: true,
            selectiveLogic: 0,
          }),
        ],
      }),
    );
    expect(result.length).toBe(1);
  });

  it("AND_ANY: primary match but no secondary match fails", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["dragon", "wizard"],
            selective: true,
            selectiveLogic: 0,
          }),
        ],
      }),
    );
    expect(result.length).toBe(0);
  });

  it("AND_ALL: all secondaries must match", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["castle", "throne"],
            selective: true,
            selectiveLogic: 3,
          }),
        ],
      }),
    );
    expect(result.length).toBe(1);
  });

  it("AND_ALL: partial secondary match fails", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["castle", "ocean"],
            selective: true,
            selectiveLogic: 3,
          }),
        ],
      }),
    );
    expect(result.length).toBe(0);
  });

  it("NOT_ANY: no secondaries matching passes", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["ocean", "space"],
            selective: true,
            selectiveLogic: 2,
          }),
        ],
      }),
    );
    expect(result.length).toBe(1);
  });

  it("NOT_ANY: a secondary match fails", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["castle", "space"],
            selective: true,
            selectiveLogic: 2,
          }),
        ],
      }),
    );
    expect(result.length).toBe(0);
  });

  it("NOT_ALL: at least one secondary missing passes", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            key: ["knight"],
            keysecondary: ["castle", "ocean"],
            selective: true,
            selectiveLogic: 1,
          }),
        ],
      }),
    );
    expect(result.length).toBe(1);
  });
});

// ── Constant ──

describe("scanLorebooks - constant", () => {
  it("activates constant entry without keywords", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, constant: true })],
      }),
    );
    expect(result.length).toBe(1);
    expect(result[0].activationSource).toBe("constant");
  });

  it("constant entry still obeys probability", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({
            uid: 1,
            constant: true,
            useProbability: true,
            probability: 0,
          }),
        ],
      }),
    );
    expect(result.length).toBe(0);
  });
});

// ── Disabled ──

describe("scanLorebooks - disabled", () => {
  it("disabled entry never activates", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["knight"], disable: true })],
      }),
    );
    expect(result.length).toBe(0);
  });
});

// ── Timing: sticky ──

describe("scanLorebooks - sticky", () => {
  it("sticky entry activates from timing state without keyword", () => {
    const timingStates = new Map<number, EntryTimingState>();
    timingStates.set(1, {
      lastActivatedAt: 0,
      stickyCount: 3,
      cooldownRemaining: 0,
      delayRemaining: 0,
    });
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, sticky: 3 })],
        timingStates,
      }),
    );
    expect(result.length).toBe(1);
    expect(result[0].activationSource).toBe("sticky");
  });
});

// ── Timing: cooldown ──

describe("scanLorebooks - cooldown", () => {
  it("cooldown prevents activation", () => {
    const timingStates = new Map<number, EntryTimingState>();
    timingStates.set(1, {
      lastActivatedAt: 0,
      stickyCount: 0,
      cooldownRemaining: 2,
      delayRemaining: 0,
    });
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["knight"], cooldown: 3 })],
        timingStates,
      }),
    );
    expect(result.length).toBe(0);
  });

  it("expired cooldown allows activation", () => {
    const timingStates = new Map<number, EntryTimingState>();
    timingStates.set(1, {
      lastActivatedAt: 0,
      stickyCount: 0,
      cooldownRemaining: 0,
      delayRemaining: 0,
    });
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["knight"], cooldown: 3 })],
        timingStates,
      }),
    );
    expect(result.length).toBe(1);
  });
});

// ── Timing: delay ──

describe("scanLorebooks - delay", () => {
  it("delay prevents first activation", () => {
    const timingStates = new Map<number, EntryTimingState>();
    timingStates.set(1, {
      lastActivatedAt: null,
      stickyCount: 0,
      cooldownRemaining: 0,
      delayRemaining: 2,
    });
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["knight"], delay: 3 })],
        timingStates,
      }),
    );
    expect(result.length).toBe(0);
  });

  it("expired delay allows activation", () => {
    const timingStates = new Map<number, EntryTimingState>();
    timingStates.set(1, {
      lastActivatedAt: null,
      stickyCount: 0,
      cooldownRemaining: 0,
      delayRemaining: 0,
    });
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["knight"], delay: 3 })],
        timingStates,
      }),
    );
    expect(result.length).toBe(1);
  });
});

// ── Sort order ──

describe("scanLorebooks - ordering", () => {
  it("sorts results by entry order", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [
          entry({ uid: 2, key: ["castle"], order: 200 }),
          entry({ uid: 1, key: ["knight"], order: 50 }),
        ],
      }),
    );
    expect(result.length).toBe(2);
    expect(result[0].entry.uid).toBe(1);
    expect(result[1].entry.uid).toBe(2);
  });
});

// ── updateTimingStates ──

describe("updateTimingStates", () => {
  it("sets sticky and cooldown on activation", () => {
    const entries = [entry({ uid: 1, sticky: 3, cooldown: 2 })];
    const activated: ActivatedEntry[] = [
      {
        entry: entries[0],
        matchedKeys: ["knight"],
        activationSource: "keyword",
      },
    ];
    const prev = new Map<number, EntryTimingState>();
    const next = updateTimingStates(entries, activated, prev, 5);

    const state = next.get(1)!;
    expect(state.stickyCount).toBe(3);
    expect(state.cooldownRemaining).toBe(2);
    expect(state.delayRemaining).toBe(0);
    expect(state.lastActivatedAt).toBe(5);
  });

  it("sticky does not refresh from sticky activation", () => {
    const entries = [entry({ uid: 1, sticky: 3, cooldown: 1 })];
    const activated: ActivatedEntry[] = [
      {
        entry: entries[0],
        matchedKeys: ["[sticky]"],
        activationSource: "sticky",
      },
    ];
    const prev = new Map<number, EntryTimingState>();
    prev.set(1, {
      lastActivatedAt: 2,
      stickyCount: 2,
      cooldownRemaining: 1,
      delayRemaining: 0,
    });
    const next = updateTimingStates(entries, activated, prev, 5);

    const state = next.get(1)!;
    expect(state).toBeDefined();
    // Sticky activation should decrement sticky, not reset
    expect(state.stickyCount).toBe(1);
    // Cooldown should decrement (sticky > 0, so cooldown doesn't decrement — sticky decrements first)
    expect(state.lastActivatedAt).toBe(2); // unchanged
  });

  it("decrements sticky count when not activated", () => {
    const entries = [entry({ uid: 1, sticky: 3 })];
    const prev = new Map<number, EntryTimingState>();
    prev.set(1, {
      lastActivatedAt: 2,
      stickyCount: 2,
      cooldownRemaining: 0,
      delayRemaining: 0,
    });
    const next = updateTimingStates(entries, [], prev, 5);

    const state = next.get(1)!;
    expect(state.stickyCount).toBe(1);
  });

  it("decrements cooldown when sticky is zero", () => {
    const entries = [entry({ uid: 1, cooldown: 3 })];
    const prev = new Map<number, EntryTimingState>();
    prev.set(1, {
      lastActivatedAt: 2,
      stickyCount: 0,
      cooldownRemaining: 2,
      delayRemaining: 0,
    });
    const next = updateTimingStates(entries, [], prev, 5);

    const state = next.get(1)!;
    expect(state.cooldownRemaining).toBe(1);
  });

  it("decrements delay when not activated", () => {
    const entries = [entry({ uid: 1, delay: 3 })];
    const prev = new Map<number, EntryTimingState>();
    prev.set(1, {
      lastActivatedAt: null,
      stickyCount: 0,
      cooldownRemaining: 0,
      delayRemaining: 2,
    });
    const next = updateTimingStates(entries, [], prev, 5);

    const state = next.get(1)!;
    expect(state.delayRemaining).toBe(1);
  });

  it("clears stale timing state when all counters reach zero", () => {
    const entries = [entry({ uid: 1, sticky: 2, cooldown: 1 })];
    const prev = new Map<number, EntryTimingState>();
    prev.set(1, {
      lastActivatedAt: 1,
      stickyCount: 0,
      cooldownRemaining: 0,
      delayRemaining: 0,
    });
    const next = updateTimingStates(entries, [], prev, 5);

    expect(next.has(1)).toBe(false);
  });

  it("ignores entries with no timing config", () => {
    const entries = [entry({ uid: 1 })];
    const next = updateTimingStates(entries, [], new Map(), 5);
    expect(next.size).toBe(0);
  });
});

// ── Schema validation ──

describe("LorebookEntrySchema", () => {
  it("validates a minimal ST entry", async () => {
    const { LorebookEntrySchema } = await import("../src/schemas");
    const result = LorebookEntrySchema.safeParse({
      uid: 12345,
      key: ["test"],
      content: "hello",
    });
    expect(result.success).toBe(true);
  });

  it("rejects entry with missing uid", async () => {
    const { LorebookEntrySchema } = await import("../src/schemas");
    const result = LorebookEntrySchema.safeParse({
      key: ["test"],
      content: "hello",
    });
    expect(result.success).toBe(false);
  });

  it("defaults selectiveLogic to 0", async () => {
    const { LorebookEntrySchema } = await import("../src/schemas");
    const result = LorebookEntrySchema.parse({
      uid: 1,
      key: ["test"],
      content: "hello",
      selective: true,
    });
    expect(result.selectiveLogic).toBe(0);
  });
});

describe("LorebookFileSchema", () => {
  it("validates a complete ST world info file", async () => {
    const { LorebookFileSchema } = await import("../src/schemas");
    const result = LorebookFileSchema.safeParse({
      name: "Test World",
      entries: {
        "1": { uid: 1, key: ["castle"], content: "An old castle." },
        "2": { uid: 2, key: ["forest"], content: "A dark forest." },
      },
    });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.name).toBe("Test World");
      expect(Object.keys(result.data.entries).length).toBe(2);
    }
  });

  it("validates entries keyed as strings", async () => {
    const { LorebookFileSchema } = await import("../src/schemas");
    const result = LorebookFileSchema.safeParse({
      name: "Test",
      entries: {
        "1234567890": { uid: 1234567890, key: ["test"], content: "test" },
      },
    });
    expect(result.success).toBe(true);
  });
});

describe("scanLorebooks - lorebookDefaults inheritance", () => {
  it("inherits lorebook-level caseSensitive when entry caseSensitive is false", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["KNIGHT"], caseSensitive: false })],
        lorebookDefaults: {
          scanDepth: 2,
          caseSensitive: true,
          matchWholeWords: false,
        },
      }),
    );
    expect(result.length).toBe(0);
  });

  it("inherits lorebook-level matchWholeWords when entry matchWholeWords is false", () => {
    const result = scanLorebooks(
      scanOpts({
        entries: [entry({ uid: 1, key: ["cast"], matchWholeWords: false })],
        lorebookDefaults: {
          scanDepth: 2,
          caseSensitive: false,
          matchWholeWords: true,
        },
      }),
    );
    expect(result.length).toBe(0);
  });
});

describe("uniqueLorebookId collision protection", () => {
  it("generates unique numeric suffixes when a lorebook id already exists", () => {
    const tempDir = mkdtempSync(join(tmpdir(), "bl-lorebooks-"));
    try {
      const firstId = uniqueLorebookId("Kanto Region", tempDir);
      expect(firstId).toBe("kanto-region");
      saveLorebook(
        firstId,
        {
          name: "Kanto Region",
          scanDepth: 2,
          caseSensitive: false,
          matchWholeWords: false,
          entries: {},
        },
        tempDir,
      );

      const secondId = uniqueLorebookId("Kanto Region", tempDir);
      expect(secondId).toBe("kanto-region-2");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });
});

describe("LorebookLibrary and LorebookEditor base/common primitive composition", () => {
  it("renders LorebookLibrary in page and dialog variants without legacy lorebook-* CSS classes", () => {
    const pageHtml = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(LorebookLibrary, { variant: "page" }),
      ),
    );
    expect(pageHtml).toContain("base-header base-header--page");
    expect(pageHtml).toContain("Lorebook Library");
    expect(pageHtml).toContain("Import Lorebook");
    expect(pageHtml).toContain("New Lorebook");
    expect(pageHtml).toContain("base-search-bar");
    expect(pageHtml).not.toContain("lorebook-library-container");

    const dialogHtml = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(LorebookLibrary, {
          variant: "dialog",
          onClose: () => {},
        }),
      ),
    );
    expect(dialogHtml).toContain("base-modal--wide");
    expect(dialogHtml).toContain("base-header base-header--section");
    expect(dialogHtml).not.toContain("lorebook-manager-modal");
  });

  it("renders LorebookEditor with collapsible SideNav, CheckboxRow rules, FormSection collapsible, and Card entry rows", () => {
    const sampleLorebook = {
      name: "Chronicles Lore",
      scanDepth: 3,
      caseSensitive: true,
      matchWholeWords: false,
      entries: {
        "1": entry({
          uid: 1,
          key: ["amber", "pattern"],
          comment: "The Pattern of Amber",
          content: "The primal Pattern inscribed beneath Castle Amber.",
          constant: true,
        }),
      },
    };
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(LorebookEditor, {
          lorebookId: "chronicles-lore",
          lorebook: sampleLorebook,
          persistedJson: JSON.stringify(sampleLorebook),
          variant: "page",
          saving: false,
          status: null,
          onDismissStatus: () => {},
          onChangeLorebook: () => {},
          onSaveLorebook: async () => {},
          onExportLorebook: () => {},
          onBackToLibrary: () => {},
          initialEditingUid: 1,
        }),
      ),
    );

    expect(html).toContain("Chronicles Lore");
    expect(html).toContain("base-form-section--collapsible");
    expect(html).toContain("side-nav-layout");
    expect(html).toContain("lorebook-entries-nav");
    expect(html).toContain("side-nav-toolbar");
    expect(html).toContain("side-nav-trigger");
    expect(html).toContain("base-toggle-row--checkbox");
    expect(html).toContain("Case Sensitive (Lorebook Default)");
    expect(html).toContain("Whole Words (Lorebook Default)");
    expect(html).toContain("The Pattern of Amber");
    expect(html).toContain("Constant");
    expect(html).not.toContain("lorebook-master-detail");
    expect(html).not.toContain("lorebook-entry-row");
    expect(html).not.toContain("lorebook-sidebar-section");
  });
});
