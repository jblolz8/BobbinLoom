import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeChapterAction, promoteNpcAction, promoteNpcDraftAction, questAction } from "../src/server/stateActions";
import { applyStatePatch, takeTurnSnapshot } from "../src/engine/engine";
import { createPlaythroughRecord, getPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import type { CharacterInstance, ParsedUserInput, Playthrough, ScenarioPreferences, ScenarioSeed } from "../src/schemas";
import type { ProviderTurn, TurnProvider, CharacterBrainstormOutput } from "../src/server/provider";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-actions-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("questAction", () => {
  it("toggles tracking on a quest", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Quest Track");

    const result = questAction(dir, playthrough.id, "first_steps", "toggleTracking");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const quest = result.state.quests.find((q) => q.id === "first_steps");
    expect(quest?.tracking).toBe(true);

    // Verify persistence
    const stored = getPlaythroughRecord(dir, playthrough.id);
    expect(stored?.quests[0].tracking).toBe(true);
  });

  it("edits a quest name and summary", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Quest Edit");

    const result = questAction(dir, playthrough.id, "first_steps", "edit", "New Name", "New summary.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const quest = result.state.quests.find((q) => q.id === "first_steps");
    expect(quest?.name).toBe("New Name");
    expect(quest?.summary).toBe("New summary.");
  });

  it("deletes a quest and logs abandonment", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Quest Delete");

    const result = questAction(dir, playthrough.id, "first_steps", "delete");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.quests.find((q) => q.id === "first_steps")).toBeUndefined();
  });

  it("rejects unknown quests", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Quest Missing");

    const result = questAction(dir, playthrough.id, "quest_nope", "toggleTracking");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

class MockProviderShim implements TurnProvider {
  async generateTurn(
    _input: ParsedUserInput,
    _state: Playthrough,
    _choicesEnabled: boolean
  ): Promise<ProviderTurn> {
    throw new Error("not used in promote tests");
  }

  async generateScenarioSeed(_preferences: ScenarioPreferences, _lorebookIds?: string[]): Promise<ScenarioSeed> {
    throw new Error("not used in promote tests");
  }

  async summarizeChapter(_transcript: string): Promise<{ name: string; shortDescription: string; fullSummary: string }> {
    throw new Error("not used in promote tests");
  }

  async compactStorySoFar(_input: { priorSummary: string | null; chapterTranscriptions: { name: string; fullSummary: string }[]; importantEvents: { type: string; summary: string; importance: number; turn: number }[]; }): Promise<{ summary: string }> {
    throw new Error("not used in promote tests");
  }

  async embedTexts(_texts: string[]): Promise<number[][]> {
    return [];
  }

  async generateCharacterSheet(_npc: { name: string; description: string; disposition?: string }, _storyContext: string): Promise<string> {
    return "[Species]: Human\n\n[Personality]\n- Cheerful shopkeeper";
  }

  async refineCharacterSheet(_c: string, _o: string, _f: string, _s: string): Promise<string> {
    throw new Error("not used in promote tests");
  }

  async reformatCharacterSheet(_content: string, _format: unknown): Promise<string> {
    throw new Error("not used in promote tests");
  }

  async suggestCharacterTags(): Promise<string[]> {
    return [];
  }

  async brainstormCharacter(): Promise<CharacterBrainstormOutput> {
    throw new Error("not used in promote tests");
  }
}

describe("promoteNpcDraftAction", () => {
  it("drafts a sheet without mutating the playthrough", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Draft Test");
    const withNpc = applyStatePatch(pt, { npcAdd: [{ name: "Shopkeep", description: "A friendly shopkeeper." }] });
    updatePlaythroughRecord(dir, withNpc.state);
    const npcId = withNpc.state.npcs[0].id;

    const provider = new MockProviderShim();
    const out = await promoteNpcDraftAction(dir, withNpc.state.id, npcId, provider, 4000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.content).toContain("[Species]");

    // No mutation: npc still present, no new characters
    const after = getPlaythroughRecord(dir, withNpc.state.id);
    expect(after?.npcs.some((n) => n.id === npcId)).toBe(true);
    expect(after?.characters.length).toBe(withNpc.state.characters.length);
  });

  it("promoteNpcAction with acceptedContent skips the provider", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Confirm Test");
    const withNpc = applyStatePatch(pt, { npcAdd: [{ name: "Shopkeep", description: "A friendly shopkeeper." }] });
    updatePlaythroughRecord(dir, withNpc.state);
    const npcId = withNpc.state.npcs[0].id;

    const throwing = { generateCharacterSheet: async () => { throw new Error("should not be called"); } } as unknown as TurnProvider;
    const out = await promoteNpcAction(dir, withNpc.state.id, npcId, throwing, "[Species]: Human\n\n[Personality]\n- Cheerful", 4000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.characters.some((c) => c.name === "Shopkeep")).toBe(true);
    const promoted = out.state.characters.find((c) => c.name === "Shopkeep");
    expect(promoted?.memorySummary).toContain("Cheerful");
    // The approved draft becomes the promoted template's content (sections ensured).
    const template = out.state.characterTemplates.find((t) => t.id === promoted?.templateId);
    expect(template?.content).toContain("[Species]: Human");
    expect(template?.content).toContain("[Personality]\n- Cheerful");
    expect(template?.content).toContain("[Dislikes]\n(not established)");
  });
});
describe("closeChapterAction — NPC staleness pruning (Phase E)", () => {
  /** Minimal provider whose generateTurn produces the chapter opening. */
  function makeChapterProvider(): TurnProvider {
    return {
      async generateTurn(_input: ParsedUserInput, _state: Playthrough, _choicesEnabled: boolean): Promise<ProviderTurn> {
        return { turn: { narrative: "New chapter opening." } };
      },
      async generateScenarioSeed(): Promise<ScenarioSeed> { throw new Error("not used"); },
      async summarizeChapter(): Promise<{ name: string; shortDescription: string; fullSummary: string }> { throw new Error("not used"); },
      async compactStorySoFar(): Promise<{ summary: string }> { return { summary: "compacted" }; },
      async embedTexts(): Promise<number[][]> { return []; },
      async generateCharacterSheet(): Promise<string> { throw new Error("not used"); },
      async refineCharacterSheet(): Promise<string> { throw new Error("not used"); },
      async reformatCharacterSheet(): Promise<string> { throw new Error("not used"); },
      async suggestCharacterTags(): Promise<string[]> { return []; },
      async brainstormCharacter() { throw new Error("not used"); }
    };
  }

  /** Adds N visible messages so closeChapterAction's >=6 check passes. */
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

  /** Adds a background NPC at a location, persists the playthrough, returns the persisted state. */
  function addNpc(dir: string, pt: Playthrough, name: string, locationId: string): Playthrough {
    const withNpc = applyStatePatch(pt, { npcAdd: [{ name, description: `${name} keeps to themselves.`, locationId }] });
    updatePlaythroughRecord(dir, withNpc.state);
    return withNpc.state;
  }

  async function closeChapter(dir: string, pt: Playthrough): Promise<void> {
    const result = await closeChapterAction(dir, pt.id, {
      name: "Session", shortDescription: "s", fullSummary: "session summary"
    }, makeChapterProvider(), false);
    expect(result.ok).toBe(true);
  }

  function systemFadeMessages(pt: Playthrough): Playthrough["messages"] {
    return pt.messages.filter((m) => m.role === "system");
  }

  it("keeps an NPC mentioned in a chapter message", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Mentioned Test");
    seedMessages(pt);
    pt.messages[3].content = "Marta waves from the window.";
    const withNpc = addNpc(dir, pt, "Marta", "loc_tavern");
    await closeChapter(dir, withNpc);

    const loaded = getPlaythroughRecord(dir, withNpc.id)!;
    expect(loaded.npcs.some((n) => n.name === "Marta")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
    // Existing archiving intact.
    expect(loaded.chapters).toHaveLength(1);
    expect(loaded.chapters[0].messageIds).toHaveLength(8);
  });

  it("keeps an NPC referenced by a chapter memory event", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Event Test");
    seedMessages(pt);
    pt.memoryEvents = [{
      id: "evt_corvin",
      playthroughId: pt.id,
      branchId: pt.branchId,
      turn: 1,
      type: "story",
      summary: "Corvin mends the clock tower.",
      importance: 2,
      tags: ["corvin"],
      createdAt: "2026-01-02T00:00:00.000Z"
    }];
    const withNpc = addNpc(dir, pt, "Corvin", "loc_tavern");
    await closeChapter(dir, withNpc);

    const loaded = getPlaythroughRecord(dir, withNpc.id)!;
    expect(loaded.npcs.some((n) => n.name === "Corvin")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
    // Wave-1 event attribution intact.
    expect(loaded.memoryEvents[0].chapterId).toBe(loaded.chapters[0].id);
  });

  it("keeps an NPC at the player's current location (snapshot-less fallback)", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Fallback Test");
    seedMessages(pt);
    const withNpc = addNpc(dir, pt, "Pip", pt.locationId);
    await closeChapter(dir, withNpc);

    const loaded = getPlaythroughRecord(dir, withNpc.id)!;
    expect(loaded.npcs.some((n) => n.name === "Pip")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
  });

  it("keeps an NPC at a location visited this chapter (turn-snapshot path)", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Snapshot Test");
    seedMessages(pt);
    const withNpc = applyStatePatch(pt, { npcAdd: [{ name: "Pip", description: "Pip tends bar.", locationId: "loc_x" }] });
    withNpc.state.turn = 3;
    withNpc.state.snapshots = {
      "2": { ...takeTurnSnapshot(withNpc.state), turn: 2, locationId: "loc_x" },
      msg_snap1: { ...takeTurnSnapshot(withNpc.state), turn: 2, locationId: "loc_x" }
    };
    updatePlaythroughRecord(dir, withNpc.state);
    await closeChapter(dir, withNpc.state);

    const loaded = getPlaythroughRecord(dir, withNpc.state.id)!;
    expect(loaded.npcs.some((n) => n.name === "Pip")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
  });

  it("prunes a stale NPC and logs the fade system message", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Stale Test");
    seedMessages(pt);
    const withNpc = addNpc(dir, pt, "Zelda", "loc_elsewhere");
    await closeChapter(dir, withNpc);

    const loaded = getPlaythroughRecord(dir, withNpc.id)!;
    expect(loaded.npcs.some((n) => n.name === "Zelda")).toBe(false);
    const fades = systemFadeMessages(loaded);
    expect(fades).toHaveLength(1);
    expect(fades[0].role).toBe("system");
    expect(fades[0].content).toBe("Some background characters faded from the story: Zelda.");
    expect(fades[0].id.startsWith("msg_")).toBe(true);
    // Visible in the new chapter: not archived, not hidden.
    expect(fades[0].hidden).toBeUndefined();
    expect(fades[0].chapterId).toBeUndefined();
    // Chapter still archives correctly.
    expect(loaded.chapters).toHaveLength(1);
    expect(loaded.chapters[0].messageIds).toHaveLength(8);
  });

  it("is a no-op when no NPC is stale", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "NoStale Test");
    seedMessages(pt);
    const withNpc = addNpc(dir, pt, "Pip", pt.locationId);
    await closeChapter(dir, withNpc);

    const loaded = getPlaythroughRecord(dir, withNpc.id)!;
    expect(loaded.npcs).toHaveLength(1);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
  });

  it("never prunes the main cast (characters[] untouched)", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Cast Test");
    seedMessages(pt);
    const far: CharacterInstance = {
      id: "char_far",
      templateId: "tmpl_far",
      playthroughId: pt.id,
      branchId: pt.branchId,
      name: "Sir Gallant",
      currentLocationId: "loc_far",
      mood: "neutral",
      towardPlayer: "neutral",
      memorySummary: "",
      conditions: [],
      flags: [],
      clothing: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z"
    };
    pt.characters.push(far);
    const charsBefore = pt.characters.length;
    const withNpc = addNpc(dir, pt, "Zelda", "loc_elsewhere");
    await closeChapter(dir, withNpc);

    const loaded = getPlaythroughRecord(dir, withNpc.id)!;
    expect(loaded.characters).toHaveLength(charsBefore);
    expect(loaded.characters.some((c) => c.id === "char_far")).toBe(true);
    expect(loaded.npcs.some((n) => n.name === "Zelda")).toBe(false);
    const fades = systemFadeMessages(loaded);
    expect(fades).toHaveLength(1);
    expect(fades[0].content).toBe("Some background characters faded from the story: Zelda.");
  });
});
