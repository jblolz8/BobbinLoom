import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { closeChapterAction } from "../src/server/stateActions";
import { createPlaythroughRecord, getPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import type { Chapter, MemoryEvent, ParsedUserInput, Playthrough } from "../src/schemas";
import type { ProviderTurn, TurnProvider } from "../src/server/provider";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chapters-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

/** Minimal TurnProvider stub. `compactStorySoFar` is spy-able. */
function makeProvider(overrides: Partial<TurnProvider> = {}): TurnProvider & { compactCalls: Parameters<TurnProvider["compactStorySoFar"]>[0][] } {
  const compactCalls: Parameters<TurnProvider["compactStorySoFar"]>[0][] = [];
  return {
    async generateTurn(_i: ParsedUserInput, _s: Playthrough, _c: boolean): Promise<ProviderTurn> {
      return { turn: { narrative: "New chapter opening." } };
    },
    async generateScenarioSeed() { throw new Error("not used"); },
    async summarizeChapter() { throw new Error("not used"); },
    async compactStorySoFar(input) { compactCalls.push(input); return { summary: `compacted(${input.chapterTranscriptions.length})` }; },
    async embedTexts() { return []; },
    async generateCharacterSheet() { throw new Error("not used"); },
    async refineCharacterSheet() { throw new Error("not used"); },
    async suggestCharacterTags() { return []; },
    compactCalls,
    ...overrides
  };
}

function makeChapter(id: string, name: string, startTurn: number, endTurn: number): Chapter {
  return {
    id,
    name,
    shortDescription: name,
    fullSummary: `${name} summary body`,
    turnRange: { start: startTurn, end: endTurn },
    messageIds: [],
    memoryEventIds: [],
    createdAt: `2026-01-0${startTurn}T00:00:00.000Z`
  };
}

function makeEvent(id: string, turn: number, importance: number, chapterId: string, summary = `evt ${id}`): MemoryEvent {
  return {
    id,
    playthroughId: "x",
    branchId: "b",
    turn,
    type: "story",
    summary,
    importance,
    tags: [],
    chapterId,
    createdAt: `2026-01-0${turn}T00:00:00.000Z`
  };
}

/** Adds N visible messages to a playthrough so closeChapterAction's >=6 check passes. */
function seedMessages(pt: Playthrough, count = 8): void {
  pt.messages = [];
  for (let i = 0; i < count; i++) {
    pt.messages.push({
      id: `msg_${i}`,
      role: i % 2 === 0 ? "user" : "assistant",
      content: `message ${i}`,
      createdAt: `2026-01-0${i + 1}T00:00:00.000Z`
    });
  }
}

describe("chapter compaction (foldOldestChaptersIntoMetaSummaries via closeChapterAction)", () => {
  it("SEED: first compaction promotes the oldest chapter directly with NO provider call", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Seed Test");
    // 3 existing uncompacted chapters; closing the session adds a 4th → triggers
    // a single-chapter overflow → seed promotion only.
    for (let i = 1; i <= 3; i++) pt.chapters.push(makeChapter(`ch_${i}`, `C${i}`, i, i));
    seedMessages(pt);
    updatePlaythroughRecord(dir, pt);

    const provider = makeProvider();
    const result = await closeChapterAction(dir, pt.id, {
      name: "Session", shortDescription: "s", fullSummary: "session summary"
    }, provider, false);

    expect(result.ok).toBe(true);
    const loaded = getPlaythroughRecord(dir, pt.id)!;

    // One meta-summary exists, seeded verbatim from the oldest chapter.
    expect(loaded.storyMetaSummaries).toHaveLength(1);
    const meta = loaded.storyMetaSummaries[0];
    expect(meta.chapterIds).toEqual(["ch_1"]);
    expect(meta.summary).toBe("C1 summary body");
    // Seed = no provider call.
    expect(provider.compactCalls).toHaveLength(0);
  });

  it("subsequent fold calls the provider with prior summary + high-importance events verbatim", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Fold Test");
    // Existing meta already seeds C1.
    pt.storyMetaSummaries = [{
      id: "mch_seed",
      chapterIds: ["ch_1"],
      turnRange: { start: 1, end: 1 },
      summary: "C1 rolled summary",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }];
    // Uncompacted chapters: C2, C3, C4 (3, at the limit).
    for (let i = 2; i <= 4; i++) pt.chapters.push(makeChapter(`ch_${i}`, `C${i}`, i, i));
    // C2 has one high-importance and one low-importance event.
    pt.memoryEvents = [
      makeEvent("e_hi", 2, 4, "ch_2", "betrayal at the gate"),
      makeEvent("e_lo", 2, 1, "ch_2", "minor gossip")
    ];
    seedMessages(pt);
    updatePlaythroughRecord(dir, pt);

    const provider = makeProvider();
    const result = await closeChapterAction(dir, pt.id, {
      name: "Session", shortDescription: "s", fullSummary: "session summary"
    }, provider, false);

    expect(result.ok).toBe(true);
    const loaded = getPlaythroughRecord(dir, pt.id)!;

    // C2 folded into the existing meta; only the high-importance event passed through.
    const meta = loaded.storyMetaSummaries[0];
    expect(meta.summary).toBe("compacted(1)");
    expect(meta.chapterIds).toEqual(["ch_1", "ch_2"]);
    expect(meta.turnRange).toEqual({ start: 1, end: 2 });

    expect(provider.compactCalls).toHaveLength(1);
    const call = provider.compactCalls[0];
    expect(call.priorSummary).toBe("C1 rolled summary");
    expect(call.chapterTranscriptions).toEqual([{ name: "C2", fullSummary: "C2 summary body" }]);
    expect(call.importantEvents).toEqual([{ type: "story", summary: "betrayal at the gate", importance: 4, turn: 2 }]);
  });

  it("keeps only VERBATIM_CHAPTER_LIMIT uncompacted chapters after compaction", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Window Test");
    for (let i = 1; i <= 4; i++) pt.chapters.push(makeChapter(`ch_${i}`, `C${i}`, i, i));
    seedMessages(pt);
    updatePlaythroughRecord(dir, pt);

    const provider = makeProvider();
    const result = await closeChapterAction(dir, pt.id, {
      name: "Session", shortDescription: "s", fullSummary: "session summary"
    }, provider, false);

    expect(result.ok).toBe(true);
    const loaded = getPlaythroughRecord(dir, pt.id)!;

    const foldedIds = new Set(loaded.storyMetaSummaries.flatMap((m) => m.chapterIds));
    const uncompacted = loaded.chapters.filter((ch) => !foldedIds.has(ch.id));
    expect(uncompacted.length).toBeLessThanOrEqual(3);
  });

  it("degrades gracefully when the provider fails: ids still folded, prior summary retained", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Degrade Test");
    pt.storyMetaSummaries = [{
      id: "mch_seed",
      chapterIds: ["ch_1"],
      turnRange: { start: 1, end: 1 },
      summary: "C1 rolled summary",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    }];
    for (let i = 2; i <= 4; i++) pt.chapters.push(makeChapter(`ch_${i}`, `C${i}`, i, i));
    seedMessages(pt);
    updatePlaythroughRecord(dir, pt);

    const provider = makeProvider({
      async compactStorySoFar() { throw new Error("provider down"); }
    });

    const result = await closeChapterAction(dir, pt.id, {
      name: "Session", shortDescription: "s", fullSummary: "session summary"
    }, provider, false);

    expect(result.ok).toBe(true); // still succeeds
    const loaded = getPlaythroughRecord(dir, pt.id)!;
    const meta = loaded.storyMetaSummaries[0];
    // Ids folded (verbatim window shrinks) but summary text retained.
    expect(meta.chapterIds).toEqual(["ch_1", "ch_2"]);
    expect(meta.summary).toBe("C1 rolled summary");
  });

  it("is non-destructive: chapters are never removed by compaction", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "NonDestructive Test");
    for (let i = 1; i <= 3; i++) pt.chapters.push(makeChapter(`ch_${i}`, `C${i}`, i, i));
    seedMessages(pt);
    updatePlaythroughRecord(dir, pt);

    const provider = makeProvider();
    await closeChapterAction(dir, pt.id, {
      name: "Session", shortDescription: "s", fullSummary: "session summary"
    }, provider, false);

    const loaded = getPlaythroughRecord(dir, pt.id)!;
    expect(loaded.chapters.length).toBe(4);
    expect(loaded.chapters.map((c) => c.id)).toContain("ch_1");
  });
});
