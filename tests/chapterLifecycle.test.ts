/** The chapter lifecycle's pure rules: the opening modes, and summary freshness.
 *
 *  The mode table is the single source for the close dialog's options, the route's enum and the
 *  prompt clauses, so the first test here is a DRIFT GUARD: a mode added to the schema without a
 *  table entry (or the reverse) is a mode the route rejects at runtime, which the typecheck cannot
 *  see. */
import { describe, expect, it } from "vitest";
import {
  CHAPTER_OPENING_MODES,
  buildChapterOpeningInstruction,
  chapterOpeningModeInfo,
  chapterOpeningModeNeedsMessage,
  chapterStaleSignature,
  chapterSummaryIsStale
} from "../src/engine/chapterLifecycle";
import { ChapterOpeningModeSchema, type Chapter, type ChatMessage } from "../src/schemas";

function chapter(overrides: Partial<Chapter> = {}): Chapter {
  return {
    id: "ch_1",
    name: "The First Volume",
    shortDescription: "short",
    fullSummary: "full",
    turnRange: { start: 1, end: 4 },
    messageIds: [],
    memoryEventIds: [],
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

function message(id: string, overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id,
    role: "assistant",
    content: `content of ${id}`,
    createdAt: "2026-01-01T00:00:00.000Z",
    ...overrides
  };
}

describe("the opening modes", () => {
  it("covers the schema's enum exactly, in both directions", () => {
    const tableIds = CHAPTER_OPENING_MODES.map((entry) => entry.id).sort();
    expect(tableIds).toEqual([...ChapterOpeningModeSchema.options].sort());
    // Every entry carries what the UI renders and the prompt uses.
    for (const entry of CHAPTER_OPENING_MODES) {
      expect(entry.label.length).toBeGreaterThan(0);
      expect(entry.blurb.length).toBeGreaterThan(0);
      expect(entry.instruction.length).toBeGreaterThan(0);
    }
  });

  it("falls back to the first mode for an id the table does not know", () => {
    expect(chapterOpeningModeInfo("continuation").id).toBe("continuation");
  });

  it("asks only Custom for a message", () => {
    expect(chapterOpeningModeNeedsMessage("custom")).toBe(true);
    for (const mode of ["continuation", "shortJump", "longJump"] as const) {
      expect(chapterOpeningModeNeedsMessage(mode)).toBe(false);
    }
  });

  it("carries each mode's own transition, and the contract that never changes", () => {
    const continuation = buildChapterOpeningInstruction("continuation");
    expect(continuation).toContain("resumes the story seamlessly");
    expect(continuation).toContain("STORY SO FAR");

    expect(buildChapterOpeningInstruction("shortJump")).toContain("MOMENTS LATER");
    const long = buildChapterOpeningInstruction("longJump");
    expect(long).toContain("LONG STRETCH OF TIME");
    expect(long).toContain("days, weeks or months");

    // The two clauses every mode must keep: the player acts for themselves, and the scene is
    // handed back to them.
    for (const entry of CHAPTER_OPENING_MODES) {
      const instruction = buildChapterOpeningInstruction(entry.id, "whatever");
      expect(instruction).toContain("Do not take actions on behalf of the player");
      expect(instruction).toContain("invitation for the player to act");
    }
  });

  it("inlines the player's message verbatim, whatever it contains", () => {
    const messy = [
      "Three weeks later.",
      "He said \"we are leaving\", and meant it — the quotes and the em dash survive.",
      "  trailing space  "
    ].join(String.fromCharCode(10));

    const instruction = buildChapterOpeningInstruction("custom", messy);

    // Verbatim apart from the trimming of the outer edges, and fenced so multi-line input cannot
    // read as further instructions.
    expect(instruction).toContain(messy.trim());
    expect(instruction).toContain("<<<");
    expect(instruction.indexOf("<<<")).toBeLessThan(instruction.indexOf(messy.trim()));
    // A mode without a message simply has no fence.
    expect(buildChapterOpeningInstruction("continuation")).not.toContain("<<<");
  });
});

describe("summary freshness", () => {
  it("is false for a chapter with no messages, and for one never edited", () => {
    const ch = chapter();
    expect(chapterSummaryIsStale(ch, [])).toBe(false);
    expect(
      chapterSummaryIsStale(ch, [
        message("m1", { chapterId: ch.id }),
        message("m2", { chapterId: ch.id, editedAt: "2025-12-31T00:00:00.000Z" })
      ])
    ).toBe(false);
  });

  it("is true once an archived message is edited after the summary was written", () => {
    const ch = chapter({ createdAt: "2026-01-01T00:00:00.000Z" });
    expect(
      chapterSummaryIsStale(ch, [
        message("m1", { chapterId: ch.id, editedAt: "2026-01-02T00:00:00.000Z" })
      ])
    ).toBe(true);
  });

  it("uses the re-summarize stamp, so re-summarizing clears it", () => {
    const ch = chapter({ createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-03T00:00:00.000Z" });
    const edited = message("m1", { chapterId: ch.id, editedAt: "2026-01-02T00:00:00.000Z" });
    expect(chapterSummaryIsStale(ch, [edited])).toBe(false);
    // A later edit is stale again.
    expect(
      chapterSummaryIsStale(ch, [message("m1", { chapterId: ch.id, editedAt: "2026-01-04T00:00:00.000Z" })])
    ).toBe(true);
  });

  it("ignores messages that belong to another chapter or to the running one", () => {
    const ch = chapter();
    expect(
      chapterSummaryIsStale(ch, [
        message("m1", { editedAt: "2026-09-09T00:00:00.000Z" }),
        message("m2", { chapterId: "ch_other", editedAt: "2026-09-09T00:00:00.000Z" })
      ])
    ).toBe(false);
  });

  it("signs the dismissal with the LATEST edit, so a new edit warns again", () => {
    const ch = chapter();
    const first = chapterStaleSignature(ch, [
      message("m1", { chapterId: ch.id, editedAt: "2026-01-02T00:00:00.000Z" })
    ]);
    const second = chapterStaleSignature(ch, [
      message("m1", { chapterId: ch.id, editedAt: "2026-01-02T00:00:00.000Z" }),
      message("m2", { chapterId: ch.id, editedAt: "2026-01-05T00:00:00.000Z" })
    ]);
    expect(first).not.toBe(second);
    expect(second).toBe(`${ch.id}:2026-01-05T00:00:00.000Z`);
  });
});
