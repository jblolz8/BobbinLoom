import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { closeChapterAction, fleshOutCharacterAction, fleshOutCharacterDraftAction, worldStateAction } from "../src/server/stateActions";
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

describe("worldStateAction", () => {
  it("edits a world state name and description", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "WS Edit");
    playthrough.worldState.push({ id: "ws_starter", name: "Old Name", description: "Old." });
    updatePlaythroughRecord(dir, playthrough);

    const result = worldStateAction(dir, playthrough.id, "ws_starter", "edit", "New Name", "New description.");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const ws = result.state.worldState.find((q: any) => q.id === "ws_starter");
    expect(ws?.name).toBe("New Name");
    expect(ws?.description).toBe("New description.");
    
    // Verify persistence
    const stored = getPlaythroughRecord(dir, playthrough.id);
    expect(stored?.worldState.find((w: any) => w.id === "ws_starter")?.name).toBe("New Name");
  });

  it("deletes a world state", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "WS Delete");
    playthrough.worldState.push({ id: "ws_starter", name: "Old Name", description: "Old." });
    updatePlaythroughRecord(dir, playthrough);
    
    const result = worldStateAction(dir, playthrough.id, "ws_starter", "delete");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.worldState.find((q: any) => q.id === "ws_starter")).toBeUndefined();
  });

  it("rejects unknown world states", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "WS Missing");

    const result = worldStateAction(dir, playthrough.id, "ws_nope", "edit", "Foo");
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

describe("fleshOutCharacterDraftAction", () => {
  it("drafts a sheet without mutating the playthrough", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Draft Test");
    const withChar = applyStatePatch(pt, { characterAddSimple: [{ name: "Shopkeep", description: "A friendly shopkeeper.", storyRole: "Merchant" }] });
    updatePlaythroughRecord(dir, withChar.state);
    const charId = withChar.state.characters.find((c) => c.name === "Shopkeep")!.id;

    const provider = new MockProviderShim();
    const out = await fleshOutCharacterDraftAction(dir, withChar.state.id, charId, provider, 4000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.content).toContain("[Species]");

    // No mutation: simple character still present, templateId still undefined
    const after = getPlaythroughRecord(dir, withChar.state.id);
    const afterChar = after?.characters.find((c) => c.id === charId);
    expect(afterChar).toBeDefined();
    expect(afterChar?.templateId).toBeUndefined();
  });

  it("fleshOutCharacterAction with acceptedContent skips the provider", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Confirm Test");
    const withChar = applyStatePatch(pt, { characterAddSimple: [{ name: "Shopkeep", description: "A friendly shopkeeper.", storyRole: "Merchant" }] });
    updatePlaythroughRecord(dir, withChar.state);
    const charId = withChar.state.characters.find((c) => c.name === "Shopkeep")!.id;

    const throwing = { generateCharacterSheet: async () => { throw new Error("should not be called"); } } as unknown as TurnProvider;
    const out = await fleshOutCharacterAction(dir, withChar.state.id, charId, throwing, "[Species]: Human\n\n[Personality]\n- Cheerful", 4000);
    expect(out.ok).toBe(true);
    if (!out.ok) return;
    expect(out.state.characters.some((c) => c.name === "Shopkeep")).toBe(true);
    const promoted = out.state.characters.find((c) => c.name === "Shopkeep");
    expect(promoted?.memorySummary).toContain("Cheerful");
    expect(promoted?.templateId).toBeDefined();
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

  /** Adds a simple character, persists the playthrough, returns the persisted state. */
  function addSimpleChar(dir: string, pt: Playthrough, name: string, active = false): Playthrough {
    const withChar = applyStatePatch(pt, {
      characterAddSimple: [{ name, description: `${name} keeps to themselves.`, storyRole: "Townsfolk" }]
    });
    if (!active) {
      const added = withChar.state.characters.find((c) => c.name === name);
      if (added) {
        withChar.state.activeCharacters = (withChar.state.activeCharacters ?? []).filter((id) => id !== added.id);
      }
    }
    updatePlaythroughRecord(dir, withChar.state);
    return withChar.state;
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

  it("keeps a simple character mentioned in a chapter message", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Mentioned Test");
    seedMessages(pt);
    pt.messages[3].content = "Marta waves from the window.";
    const withChar = addSimpleChar(dir, pt, "Marta", false);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.some((n) => n.name === "Marta")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
    // Existing archiving intact.
    expect(loaded.chapters).toHaveLength(1);
    expect(loaded.chapters[0].messageIds).toHaveLength(8);
  });

  it("keeps a simple character referenced by a chapter memory event", async () => {
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
    const withChar = addSimpleChar(dir, pt, "Corvin", false);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.some((n) => n.name === "Corvin")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
    // Wave-1 event attribution intact.
    expect(loaded.memoryEvents[0].chapterId).toBe(loaded.chapters[0].id);
  });

  it("keeps a simple character active in the current scene (activeCharacters fallback)", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Fallback Test");
    seedMessages(pt);
    const withChar = addSimpleChar(dir, pt, "Pip", true);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.some((n) => n.name === "Pip")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
  });

  it("keeps a simple character active in a scene during this chapter (turn-snapshot path)", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Snapshot Test");
    seedMessages(pt);
    const withChar = addSimpleChar(dir, pt, "Pip", false);
    const pipId = withChar.characters.find((c) => c.name === "Pip")!.id;
    withChar.turn = 3;
    withChar.snapshots = {
      "2": { ...takeTurnSnapshot(withChar), turn: 2, activeCharacters: [pipId] },
      msg_snap1: { ...takeTurnSnapshot(withChar), turn: 2, activeCharacters: [pipId] }
    };
    updatePlaythroughRecord(dir, withChar);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.some((n) => n.name === "Pip")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
  });

  it("prunes a stale simple character and logs the fade system message", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Stale Test");
    seedMessages(pt);
    const withChar = addSimpleChar(dir, pt, "Zelda", false);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.some((n) => n.name === "Zelda")).toBe(false);
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

  it("is a no-op when no simple character is stale", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "NoStale Test");
    seedMessages(pt);
    const withChar = addSimpleChar(dir, pt, "Pip", true);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.some((c) => c.name === "Pip")).toBe(true);
    expect(systemFadeMessages(loaded)).toHaveLength(0);
  });

  it("never prunes the main cast (characters with templateId untouched)", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Cast Test");
    seedMessages(pt);
    const far: CharacterInstance = {
      id: "char_far",
      templateId: "tmpl_far",
      playthroughId: pt.id,
      branchId: pt.branchId,
      name: "Sir Gallant",
      storyRole: "Main Cast",
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
    const detailedBefore = pt.characters.filter((c) => c.templateId).length;
    const withChar = addSimpleChar(dir, pt, "Zelda", false);
    await closeChapter(dir, withChar);

    const loaded = getPlaythroughRecord(dir, withChar.id)!;
    expect(loaded.characters.filter((c) => c.templateId)).toHaveLength(detailedBefore);
    expect(loaded.characters.some((c) => c.id === "char_far")).toBe(true);
    expect(loaded.characters.some((n) => n.name === "Zelda")).toBe(false);
    const fades = systemFadeMessages(loaded);
    expect(fades).toHaveLength(1);
    expect(fades[0].content).toBe("Some background characters faded from the story: Zelda.");
  });
});

describe("flesh-out story context macro expansion", () => {
  it("expands {{user}} and leaves {{char}} ownerless in the cast lines", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Macro Promote Test");
    let captured = "";

    class CapturingProvider extends MockProviderShim {
      async generateCharacterSheet(
        _npc: { name: string; description: string; storyRole?: string },
        storyContext: string
      ): Promise<string> {
        captured = storyContext;
        return "[Species]: Human\n\n[Personality]\n- Cheerful shopkeeper";
      }
    }

    pt.playerCharacter.name = "Anon";
    pt.playerCharacter.description = "{{user}} wanders the district.";
    if (pt.characters.length > 0) {
      pt.characters[0].memorySummary = "{{char}} remembers {{user}}.";
    }
    updatePlaythroughRecord(dir, pt);

    const withChar = applyStatePatch(pt, {
      characterAddSimple: [{ name: "Shopkeep", description: "A friendly shopkeeper.", storyRole: "Merchant" }]
    });
    updatePlaythroughRecord(dir, withChar.state);
    const charId = withChar.state.characters.find((c) => c.name === "Shopkeep")!.id;

    const out = await fleshOutCharacterDraftAction(dir, withChar.state.id, charId, new CapturingProvider(), 4000);
    expect(out.ok).toBe(true);
    expect(captured).toContain("Anon wanders the district.");
    expect(captured).not.toContain("{{user}}");
    // A cast line belongs to another character, so {{char}} there has no owner to name.
    expect(captured).toContain("{{char}} remembers Anon");
  });
});

describe("closeChapterAction — the opening message and the opening mode", () => {
  /** Captures the opening turn's input, so the mode's instruction can be asserted. */
  function makeProvider(captured: { raw?: string }): TurnProvider {
    return {
      async generateTurn(input: ParsedUserInput): Promise<ProviderTurn> {
        captured.raw = input.raw;
        return { turn: { narrative: "The next chapter opens." } };
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

  function seedVisible(pt: Playthrough, count = 8): void {
    pt.messages = [];
    pt.turn = Math.floor(count / 2);
    for (let i = 0; i < count; i++) {
      pt.messages.push({
        id: "msg_" + i,
        role: i % 2 === 0 ? "user" : "assistant",
        content: "message " + i,
        createdAt: "2026-01-01T00:00:0" + i + ".000Z",
        turn: Math.floor(i / 2) + 1
      });
    }
  }

  const SUMMARY = { name: "Closed Chapter", shortDescription: "short", fullSummary: "full" };
  const NOTE = "Three days later, in the harbour town of Rime.";

  it("appends the player message as the first message of the NEW chapter", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Opening Message");
    seedVisible(pt);
    updatePlaythroughRecord(dir, pt);

    const captured: { raw?: string } = {};
    const result = await closeChapterAction(dir, pt.id, SUMMARY, makeProvider(captured), true, 32768, undefined, undefined, undefined, {
      openingMode: "shortJump",
      openingMessage: NOTE
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    const messages = result.state.messages;
    const opening = messages[messages.length - 1];
    // executeTurn appends a hidden machinery instruction and then the assistant message, so the
    // player own message sits two positions before the opening.
    const appended = messages[messages.length - 3];
    expect(opening.role).toBe("assistant");
    expect(appended).toMatchObject({ role: "user", content: NOTE });
    expect(appended.chapterId).toBeUndefined();
    expect(appended.hidden).toBeFalsy();
    expect(appended.turn).toBe(opening.turn);

    // The chapter that closed knows nothing about it.
    const chapter = result.state.chapters[result.state.chapters.length - 1];
    expect(chapter.messageIds).not.toContain(appended.id);
    expect(result.state.messages.filter((m) => m.chapterId === chapter.id).length).toBe(8);

    // And the opening turn was asked for a short jump that honours the message.
    expect(captured.raw).toContain("MOMENTS LATER");
    expect(captured.raw).toContain(NOTE);
  });

  it("appends nothing at all when the player wrote no message", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "No Message");
    seedVisible(pt);
    updatePlaythroughRecord(dir, pt);

    const captured: { raw?: string } = {};
    const result = await closeChapterAction(dir, pt.id, SUMMARY, makeProvider(captured), true, 32768, undefined, undefined, undefined, {
      openingMode: "continuation"
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Eight archived + the hidden machinery instruction + the opening.
    expect(result.state.messages).toHaveLength(10);
    expect(captured.raw).toContain("resumes the story seamlessly");
    expect(captured.raw).not.toContain("<<<");
  });

  it("refuses Custom with no message, and writes nothing", async () => {
    const dir = tempDir();
    const pt = createPlaythroughRecord(dir, "Custom Without Message");
    seedVisible(pt);
    updatePlaythroughRecord(dir, pt);

    const captured: { raw?: string } = {};
    const result = await closeChapterAction(dir, pt.id, SUMMARY, makeProvider(captured), true, 32768, undefined, undefined, undefined, {
      openingMode: "custom"
    });

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);
    expect(result.error).toContain("needs a message");

    const stored = getPlaythroughRecord(dir, pt.id);
    expect(stored?.chapters).toHaveLength(0);
    expect(captured.raw).toBeUndefined();
  });
});
