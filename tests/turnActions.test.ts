import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { MockProvider } from "../src/server/provider";
import type { ProviderTurn, TurnProvider } from "../src/server/provider";
import type { ScenarioSeed } from "../src/schemas";
import {
  createPlaythroughRecord,
  getPlaythroughRecord,
  updatePlaythroughRecord
} from "../src/server/store";
import {
  buildOpeningPrompt,
  editChatMessage,
  executeTurn,
  retryAssistantTurn,
  truncateChat
} from "../src/server/turnActions";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-turnactions-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("executeTurn", () => {
  it("appends both messages and stores a pre-turn snapshot keyed by the assistant message id", async () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Execute Turn Test");
    const provider = new MockProvider();

    const result = await executeTurn(playthrough, 'I wave and say, "Hello."', provider, false);

    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[0].role).toBe("user");
    expect(result.state.messages[1].role).toBe("assistant");
    expect(result.state.turn).toBe(1);

    const assistantId = result.state.messages[1].id;
    const snapshot = result.state.snapshots?.[assistantId];
    expect(snapshot).toBeDefined();
    expect(snapshot?.turn).toBe(0);
    expect(snapshot?.memoryEvents).toHaveLength(0);
  });

  it("substitutes the placeholder when a provider returns an empty narrative", async () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Empty Narrative Test");

    class EmptyNarrativeProvider extends MockProvider {
      override async generateTurn(): Promise<ProviderTurn> {
        return { turn: { narrative: "   " } };
      }
    }

    const result = await executeTurn(playthrough, "hello", new EmptyNarrativeProvider(), false);

    expect(result.state.messages[1].role).toBe("assistant");
    expect(result.state.messages[1].content).toBe("The provider returned an empty response.");
    expect(result.narrative).toBe("The provider returned an empty response.");
  });

  it("forwards the caller's abort signal to the provider", async () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Signal Forward Test");
    const controller = new AbortController();

    let receivedSignal: AbortSignal | undefined;
    class SignalProbeProvider extends MockProvider {
      override async generateTurn(
        _input: Parameters<MockProvider["generateTurn"]>[0],
        _state: Parameters<MockProvider["generateTurn"]>[1],
        _choicesEnabled: Parameters<MockProvider["generateTurn"]>[2],
        signal?: AbortSignal
      ): Promise<ProviderTurn> {
        receivedSignal = signal;
        return { turn: { narrative: "ok" } };
      }
    }

    await executeTurn(playthrough, "hi", new SignalProbeProvider(), false, 65536, { signal: controller.signal });

    expect(receivedSignal).toBe(controller.signal);
  });

  it("hides the user message when hideUserMessage is set (Continue flow)", async () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Hide User Message Test");
    const provider = new MockProvider();

    const result = await executeTurn(playthrough, "*continue*", provider, false, 65536, { hideUserMessage: true });

    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[0].role).toBe("user");
    expect(result.state.messages[0].content).toBe("*continue*");
    expect(result.state.messages[0].hidden).toBe(true);
    expect(result.state.messages[1].role).toBe("assistant");
    expect(result.state.messages[1].hidden).toBeUndefined();
    // The hidden user message is still snapshotted/recorded (retry can find it).
    expect(result.state.snapshots?.[result.state.messages[1].id]).toBeDefined();
  });
});

describe("retryAssistantTurn", () => {
  it("truncates later messages, restores snapshotted state, and regenerates from the original user input", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Retry Test");

    // Build two full turns.
    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    playthrough = (await executeTurn(playthrough, "second input", provider, false)).state;

    // Simulate extra state that turn 2 produced.
    playthrough.flags.push("flag_from_turn_2");
    updatePlaythroughRecord(dir, playthrough);

    const secondAssistantId = playthrough.messages[3].id;
    const result = await retryAssistantTurn(dir, playthrough.id, secondAssistantId, provider, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // Everything from turn 2 was replaced by exactly one regenerated turn.
    expect(result.state.messages).toHaveLength(4);
    expect(result.state.messages[2].role).toBe("user");
    expect(result.state.messages[2].content).toBe("second input");
    expect(result.state.messages[3].role).toBe("assistant");

    // State was rolled back to the snapshot, then the turn re-ran.
    expect(result.state.turn).toBe(2);
    expect(result.state.flags).not.toContain("flag_from_turn_2");

    // The old assistant message id is gone, and its snapshot was pruned.
    const newAssistantId = result.state.messages[3].id;
    expect(newAssistantId).not.toBe(secondAssistantId);
    expect(result.state.snapshots?.[secondAssistantId]).toBeUndefined();
    expect(result.state.snapshots?.[newAssistantId]).toBeDefined();

    // Persisted.
    const stored = getPlaythroughRecord(dir, playthrough.id);
    expect(stored?.messages).toHaveLength(4);
  });

  it("retrying an early turn permanently deletes everything after it", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Retry Early Test");

    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    playthrough = (await executeTurn(playthrough, "second input", provider, false)).state;
    updatePlaythroughRecord(dir, playthrough);

    const firstAssistantId = playthrough.messages[1].id;
    const result = await retryAssistantTurn(dir, playthrough.id, firstAssistantId, provider, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[0].content).toBe("first input");
    expect(result.state.turn).toBe(1);
    expect(result.state.memoryEvents).toHaveLength(1);
  });

  it("captures and restores itemCatalog and lorebookTimingStates across turns and retry", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Item and Timing Snapshot Test");

    playthrough.itemCatalog = [
      { id: "item_sword", name: "Iron Sword", type: "weapon", description: "A simple blade", stackable: false }
    ];
    playthrough.lorebookTimingStates = {
      "100": { lastActivatedAt: 1, stickyCount: 0, delayRemaining: 0, cooldownRemaining: 2 }
    };
    updatePlaythroughRecord(dir, playthrough);

    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    const firstAssistantId = playthrough.messages[1].id;
    const snapshot1 = playthrough.snapshots?.[firstAssistantId];
    expect(snapshot1?.itemCatalog).toHaveLength(1);
    expect(snapshot1?.itemCatalog?.[0].id).toBe("item_sword");
    expect(snapshot1?.lorebookTimingStates?.["100"]).toBeDefined();

    // Mutate items and timing on turn 2
    playthrough.itemCatalog!.push({
      id: "item_shield",
      name: "Wooden Shield",
      type: "armor",
      description: "A wooden shield",
      stackable: false
    });
    playthrough.lorebookTimingStates!["200"] = {
      lastActivatedAt: 2,
      stickyCount: 1,
      delayRemaining: 0,
      cooldownRemaining: 0
    };
    updatePlaythroughRecord(dir, playthrough);

    playthrough = (await executeTurn(playthrough, "second input", provider, false)).state;
    updatePlaythroughRecord(dir, playthrough);
    const secondAssistantId = playthrough.messages[3].id;
    expect(playthrough.itemCatalog).toHaveLength(2);
    expect(playthrough.lorebookTimingStates?.["200"]).toBeDefined();

    // Retry turn 1: should restore turn 1's snapshot (1 item, only timing for 100)
    const result = await retryAssistantTurn(dir, playthrough.id, firstAssistantId, provider, false);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.itemCatalog).toHaveLength(1);
    expect(result.state.itemCatalog?.[0].id).toBe("item_sword");
    expect(result.state.lorebookTimingStates?.["100"]).toBeDefined();
    expect(result.state.lorebookTimingStates?.["200"]).toBeUndefined();
  });

  it("still truncates when no snapshot exists, without touching state", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    const playthrough = createPlaythroughRecord(dir, "No Snapshot Test");
    const now = new Date().toISOString();

    playthrough.turn = 5;
    playthrough.messages.push(
      { id: "u1", role: "user", content: "legacy input", createdAt: now },
      { id: "a1", role: "assistant", content: "legacy response", createdAt: now }
    );
    updatePlaythroughRecord(dir, playthrough);

    const result = await retryAssistantTurn(dir, playthrough.id, "a1", provider, false);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.messages).toHaveLength(2);
    expect(result.state.messages[0].content).toBe("legacy input");
  });

  it("rejects retry on user messages and unknown messages", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Retry Errors Test");
    playthrough = (await executeTurn(playthrough, "hello", provider, false)).state;
    updatePlaythroughRecord(dir, playthrough);

    const userMessageId = playthrough.messages[0].id;

    const onUser = await retryAssistantTurn(dir, playthrough.id, userMessageId, provider, false);
    expect(onUser.ok).toBe(false);
    if (!onUser.ok) expect(onUser.status).toBe(400);

    const onMissing = await retryAssistantTurn(dir, playthrough.id, "msg_missing", provider, false);
    expect(onMissing.ok).toBe(false);
    if (!onMissing.ok) expect(onMissing.status).toBe(404);

    const onMissingPlaythrough = await retryAssistantTurn(dir, "play_missing", userMessageId, provider, false);
    expect(onMissingPlaythrough.ok).toBe(false);
    if (!onMissingPlaythrough.ok) expect(onMissingPlaythrough.status).toBe(404);
  });

  it("does not persist a retried turn when the caller's signal is aborted", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Abort Retry Test");

    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    playthrough = (await executeTurn(playthrough, "second input", provider, false)).state;
    updatePlaythroughRecord(dir, playthrough);

    const secondAssistantId = playthrough.messages[3].id;
    const controller = new AbortController();
    controller.abort();

    const result = await retryAssistantTurn(dir, playthrough.id, secondAssistantId, provider, false, 65536, controller.signal);

    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(499);

    // The on-disk record is untouched — the regenerated turn was dropped.
    const reloaded = getPlaythroughRecord(dir, playthrough.id);
    expect(reloaded?.messages).toHaveLength(4);
    expect(reloaded?.messages[3].id).toBe(secondAssistantId);
  });
});

describe("editChatMessage", () => {
  it("rewrites a user message and marks it edited", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Edit Test");
    const now = new Date().toISOString();
    playthrough.messages.push(
      { id: "u1", role: "user", content: "original", createdAt: now },
      { id: "a1", role: "assistant", content: "response", createdAt: now }
    );
    updatePlaythroughRecord(dir, playthrough);

    const result = editChatMessage(dir, playthrough.id, "u1", "rewritten content");

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.messages[0].content).toBe("rewritten content");
    expect(result.state.messages[0].editedAt).toBeDefined();
    expect(result.state.messages[1].content).toBe("response");

    const stored = getPlaythroughRecord(dir, playthrough.id);
    expect(stored?.messages[0].content).toBe("rewritten content");
  });

  it("rewrites an assistant message", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Edit Assistant Test");
    const now = new Date().toISOString();
    playthrough.messages.push({ id: "a1", role: "assistant", content: "old narrative", createdAt: now });
    updatePlaythroughRecord(dir, playthrough);

    const result = editChatMessage(dir, playthrough.id, "a1", "new narrative");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.state.messages[0].content).toBe("new narrative");
  });

  it("returns 404 for unknown messages", () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Edit Missing Test");
    const result = editChatMessage(dir, playthrough.id, "msg_missing", "x");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.status).toBe(404);
  });
});

describe("executeTurn tokenUsage", () => {
  it("passes through the provider's real prompt usage with the context window", async () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Usage Passthrough Test");
    const usage = {
      estimated: 1234,
      breakdown: {
        modules: 500, outputFormat: 400, lorebook: 0, storySoFar: 0, stateSummary: 200,
        recentMessages: 100, memoryEvents: 20, lorebookDepth: 0, userInput: 14
      }
    };
    const provider: TurnProvider = {
      async generateTurn() {
        return { turn: { narrative: "stub narrative" }, promptUsage: usage };
      },
      async generateScenarioSeed() { throw new Error("not needed"); },
      async summarizeChapter() { throw new Error("not needed"); },
      async compactStorySoFar() { throw new Error("not needed"); },
      async embedTexts() { return []; },
      async generateCharacterSheet() { throw new Error("not needed"); },
      async refineCharacterSheet() { throw new Error("not needed"); },
      async reformatCharacterSheet() { throw new Error("not needed"); },
      async suggestCharacterTags() { return []; },
      async brainstormCharacter() { throw new Error("not needed"); }
    };

    const result = await executeTurn(playthrough, "hello", provider, false, 65536);

    expect(result.tokenUsage.estimated).toBe(1234);
    expect(result.tokenUsage.contextWindow).toBe(65536);
    expect(result.tokenUsage.breakdown).toEqual(usage.breakdown);
  });

  it("falls back to a fixed estimate when the provider supplies no usage (mock)", async () => {
    const dir = tempDir();
    const playthrough = createPlaythroughRecord(dir, "Usage Fallback Test");
    const result = await executeTurn(playthrough, "hello", new MockProvider(), false, 32768);

    const { tokenUsage } = result;
    expect(tokenUsage.contextWindow).toBe(32768);
    // Regression for the est(String(x)) bug: real magnitudes, not ~1 token
    expect(tokenUsage.breakdown.outputFormat).toBeGreaterThan(100);
    expect(tokenUsage.breakdown.stateSummary).toBeGreaterThan(10);
    expect(tokenUsage.estimated).toBe(
      Object.values(tokenUsage.breakdown).reduce((a, b) => a + b, 0)
    );
  });

  it("charges present characters for their full sheet and absent ones as capped one-liners, reporting castPresence", async () => {
    const dir = tempDir();

    const presentPt = createPlaythroughRecord(dir, "Usage Present Cast Test");
    const presentResult = await executeTurn(presentPt, "hello", new MockProvider(), false, 32768);
    expect(presentResult.tokenUsage.castPresence).toEqual({ present: 1, absent: 0 });

    const absentPt = createPlaythroughRecord(dir, "Usage Absent Cast Test");
    absentPt.characters[0].currentLocationId = "loc_other";
    const absentResult = await executeTurn(absentPt, "hello", new MockProvider(), false, 32768);
    expect(absentResult.tokenUsage.castPresence).toEqual({ present: 0, absent: 1 });

    // Present chars pay for the full sheet; absent chars are capped one-liners.
    expect(absentResult.tokenUsage.breakdown.stateSummary).toBeLessThan(
      presentResult.tokenUsage.breakdown.stateSummary
    );
  });

  it("measures and stamps durationMs on assistant message and records createdAt on all messages", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    const pt = createPlaythroughRecord(dir, "Timestamps Test");

    const result = await executeTurn(pt, "look around", provider, false);
    expect(result.durationMs).toBeTypeOf("number");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);

    const userMsg = result.state.messages.find(m => m.role === "user");
    const assistantMsg = result.state.messages.find(m => m.role === "assistant");

    expect(userMsg).toBeDefined();
    expect(userMsg?.createdAt).toBeDefined();
    expect(userMsg?.durationMs).toBeUndefined();

    expect(assistantMsg).toBeDefined();
    expect(assistantMsg?.createdAt).toBeDefined();
    expect(assistantMsg?.durationMs).toBeTypeOf("number");
    expect(assistantMsg?.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("captures model identifier from provider and stamps on assistant message and TurnExecution", async () => {
    const dir = tempDir();
    class NamedModelProvider extends MockProvider {
      override async generateTurn(): Promise<ProviderTurn> {
        return {
          turn: { narrative: "A turn from deepseek." },
          model: "deepseek/deepseek-chat"
        };
      }
    }

    const pt = createPlaythroughRecord(dir, "Model Test");
    const result = await executeTurn(pt, "hello", new NamedModelProvider(), false);

    expect(result.model).toBe("deepseek/deepseek-chat");
    const assistantMsg = result.state.messages.find(m => m.role === "assistant");
    expect(assistantMsg?.model).toBe("deepseek/deepseek-chat");
  });
});

describe("buildOpeningPrompt", () => {
  it("includes the setting and starting location, and is second person", () => {
    const seed = {
      locations: [{ id: "loc_a", name: "The Fox Den", description: "A mossy burrow.", state: "", icon: "", connections: [] }],
      character: { name: "Mira", content: "x" },
      quest: { id: "q", name: "Q", summary: "s" },
      items: [], npcs: [], startingFlags: [], openingText: "",
    } as ScenarioSeed;
    const out = buildOpeningPrompt("A fog-wrapped valley.", seed);
    expect(out).toContain("A fog-wrapped valley.");
    expect(out).toContain("The Fox Den");
    expect(out).toContain("second person");
  });

  it("omits the world context when no setting is given", () => {
    const seed = {
      locations: [{ id: "loc_a", name: "A", description: "", state: "", icon: "", connections: [] }],
      character: { name: "Mira", content: "x" }, quest: { id: "q", name: "Q", summary: "s" },
      items: [], npcs: [], startingFlags: [], openingText: "",
    } as ScenarioSeed;
    const out = buildOpeningPrompt(undefined, seed);
    expect(out).not.toContain("World context");
  });
});

describe("truncateChat (Delete up to here)", () => {
  /** Builds U1 A1 U2 A2 with observable state mutations between turns:
   *  - turn 1 runs → S1 (turn=1)
   *  - "flag_before_turn_2" pushed (state present when turn 2 starts)
   *  - turn 2 runs (snapshot[A2] = S1 + flag_before_turn_2)
   *  - "flag_after_turn_2" pushed (state produced after turn 2) */
  async function buildTwoTurns(dir: string) {
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Truncate Test");
    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    playthrough.flags.push("flag_before_turn_2");
    updatePlaythroughRecord(dir, playthrough);
    playthrough = (await executeTurn(playthrough, "second input", provider, false)).state;
    playthrough.flags.push("flag_after_turn_2");
    updatePlaythroughRecord(dir, playthrough);
    return { playthrough, provider };
  }

  it("deletes an assistant message and everything after it (inclusive), restoring the pre-turn snapshot", async () => {
    const dir = tempDir();
    const { playthrough } = await buildTwoTurns(dir);

    const assistant2Id = playthrough.messages[3].id; // A2
    const result = truncateChat(dir, playthrough.id, assistant2Id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    // U1 A1 U2 remain; A2 and its effects are gone.
    expect(result.state.messages.map((m) => m.role)).toEqual(["user", "assistant", "user"]);
    expect(result.state.messages[2].content).toBe("second input");
    expect(result.state.turn).toBe(1);
    expect(result.state.flags).toContain("flag_before_turn_2");
    expect(result.state.flags).not.toContain("flag_after_turn_2");

    // Snapshot of the deleted assistant message is pruned.
    expect(result.state.snapshots?.[assistant2Id]).toBeUndefined();
  });

  it("deleting up to a user message keeps it as the trailing message and reverts to its reply's snapshot", async () => {
    const dir = tempDir();
    const { playthrough } = await buildTwoTurns(dir);

    const user2Id = playthrough.messages[2].id; // U2
    const result = truncateChat(dir, playthrough.id, user2Id);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.messages.map((m) => m.role)).toEqual(["user", "assistant"]);
    expect(result.state.turn).toBe(1);
    expect(result.state.flags).toContain("flag_before_turn_2");
    expect(result.state.flags).not.toContain("flag_after_turn_2");
  });

  it("deleting the last assistant message reverts that turn's effects (its own snapshot)", async () => {
    const dir = tempDir();
    const { playthrough } = await buildTwoTurns(dir);

    const lastId = playthrough.messages[3].id; // A2 is the last message
    const result = truncateChat(dir, playthrough.id, lastId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.messages).toHaveLength(3); // U1 A1 U2
    expect(result.state.turn).toBe(1);
    expect(result.state.flags).not.toContain("flag_after_turn_2");
  });

  it("deleting a trailing user message with no reply keeps live state (nothing happened after it)", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Trailing User Test");
    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    // Queue a user message with no reply yet.
    playthrough.messages.push({ id: "msg_trailing_user", role: "user", content: "queued input", createdAt: new Date().toISOString() });
    updatePlaythroughRecord(dir, playthrough);

    const result = truncateChat(dir, playthrough.id, "msg_trailing_user");
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.messages).toHaveLength(2); // U1 A1
    expect(result.state.turn).toBe(1);
  });

  it("deleting the very first message wipes back to the pristine initial state", async () => {
    const dir = tempDir();
    const { playthrough } = await buildTwoTurns(dir);

    const firstId = playthrough.messages[0].id; // U1
    const result = truncateChat(dir, playthrough.id, firstId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.messages).toHaveLength(0);
    expect(result.state.turn).toBe(0);
    expect(result.state.flags).not.toContain("flag_before_turn_2");
    expect(result.state.snapshots).toEqual({});
  });

  it("restores itemCatalog and lorebookTimingStates from the target snapshot", async () => {
    const dir = tempDir();
    const provider = new MockProvider();
    let playthrough = createPlaythroughRecord(dir, "Truncate Items Test");

    playthrough.itemCatalog = [
      { id: "item_sword", name: "Iron Sword", type: "weapon", description: "A simple blade", stackable: false }
    ];
    playthrough.lorebookTimingStates = {
      "100": { lastActivatedAt: 1, stickyCount: 0, delayRemaining: 0, cooldownRemaining: 2 }
    };
    updatePlaythroughRecord(dir, playthrough);

    playthrough = (await executeTurn(playthrough, "first input", provider, false)).state;
    playthrough.itemCatalog!.push({ id: "item_shield", name: "Wooden Shield", type: "armor", description: "A wooden shield", stackable: false });
    playthrough.lorebookTimingStates!["200"] = { lastActivatedAt: 2, stickyCount: 1, delayRemaining: 0, cooldownRemaining: 0 };
    updatePlaythroughRecord(dir, playthrough);

    const lastId = playthrough.messages[1].id; // A1 — deleting it reverts turn 1's snapshot
    const result = truncateChat(dir, playthrough.id, lastId);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.state.itemCatalog).toHaveLength(1);
    expect(result.state.itemCatalog?.[0].id).toBe("item_sword");
    expect(result.state.lorebookTimingStates?.["100"]).toBeDefined();
    expect(result.state.lorebookTimingStates?.["200"]).toBeUndefined();
  });

  it("reports 404 for a missing playthrough or message", async () => {
    const dir = tempDir();
    const { playthrough } = await buildTwoTurns(dir);

    const noPlaythrough = truncateChat(dir, "play_missing", "msg_x");
    expect(noPlaythrough.ok).toBe(false);
    if (!noPlaythrough.ok) expect(noPlaythrough.status).toBe(404);

    const missing = truncateChat(dir, playthrough.id, "msg_missing");
    expect(missing.ok).toBe(false);
    if (!missing.ok) expect(missing.status).toBe(404);
  });
});
