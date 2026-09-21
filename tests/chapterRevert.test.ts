import Fastify from "fastify";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { describeDeletion, planDeletion, planRevert, retryAnchorMessageId, toRevertAnchor, toRevertRequestAnchor } from "../src/engine/chapterRevert";
import { takeTurnSnapshot } from "../src/engine/engine";
import { createBlankPlaythroughRecord, getPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import type { TurnSnapshot } from "../src/schemas";
import { revertAction } from "../src/server/turnActions";
import { RevertBody, turnRoutes } from "../src/server/routes/turns";
import type { Chapter, MemoryEvent, MessageImage, Playthrough } from "../src/schemas";

function image(file: string): MessageImage {
  return {
    file,
    prompt: `prompt for ${file}`,
    providerId: "venice_images",
    model: "probe",
    createdAt: "2026-01-01T00:00:00.000Z"
  };
}

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-revert-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

/**
 * A story with TWO closed chapters and a running third, built the way the app builds one:
 * a snapshot is taken at the START of each turn (so `snapshots[assistantId]` is the state before
 * that turn), archiving tags only the messages that were not hidden, and the chapter's opening
 * turn happens after the close.
 */
function buildStory(dir: string, options: { snapshots?: boolean } = {}) {
  const keepSnapshots = options.snapshots ?? true;
  const pt = createBlankPlaythroughRecord(dir, "Revert Fixture");
  pt.messages = [];
  pt.turn = 0;
  if (!keepSnapshots) pt.snapshots = {};

  function turn(label: string, flags: { hiddenUser?: boolean; chapterOpening?: boolean } = {}) {
    const turnNumber = pt.turn + 1;
    const snapshot: TurnSnapshot = takeTurnSnapshot(pt);
    const userId = `msg_u${turnNumber}`;
    const assistantId = `msg_a${turnNumber}`;
    pt.messages.push({
      id: userId,
      role: "user",
      content: `user ${label} ${turnNumber}`,
      createdAt: `2026-01-${String(turnNumber).padStart(2, "0")}T00:00:00.000Z`,
      turn: turnNumber,
      ...(flags.hiddenUser ? { hidden: true } : {})
    });
    pt.messages.push({
      id: assistantId,
      role: "assistant",
      content: `assistant ${label} ${turnNumber}`,
      createdAt: `2026-01-${String(turnNumber).padStart(2, "0")}T00:00:01.000Z`,
      turn: turnNumber,
      ...(flags.chapterOpening ? { chapterOpening: true } : {})
    });
    pt.turn = turnNumber;
    if (keepSnapshots) pt.snapshots = { ...(pt.snapshots ?? {}), [assistantId]: snapshot };
    return assistantId;
  }

  /** Archiving tags the NON-hidden messages of the run — synthetic instructions keep no tag. */
  function archive(chapterId: string, fromIndex: number) {
    for (const message of pt.messages.slice(fromIndex)) {
      if (message.hidden) continue;
      message.chapterId = chapterId;
      message.hidden = true;
    }
  }

  function chapter(id: string, name: string, start: number, end: number): Chapter {
    return {
      id,
      name,
      shortDescription: `${name} short`,
      fullSummary: `${name} full summary`,
      turnRange: { start, end },
      messageIds: [],
      memoryEventIds: [],
      createdAt: `2026-02-${String(start).padStart(2, "0")}T00:00:00.000Z`
    };
  }

  function event(id: string, turnNumber: number, chapterId?: string): MemoryEvent {
    return {
      id,
      playthroughId: pt.id,
      branchId: pt.branchId,
      turn: turnNumber,
      type: "story",
      summary: `event ${id}`,
      importance: 4,
      tags: [],
      ...(chapterId ? { chapterId } : {}),
      createdAt: `2026-03-${String(turnNumber).padStart(2, "0")}T00:00:00.000Z`
    };
  }

  // ── Chapter 1: turns 1-4, with a synthetic "Continue" instruction inside it ──
  turn("ch1");
  turn("ch1");
  turn("ch1", { hiddenUser: true });
  turn("ch1");
  const ch1 = chapter("ch_1", "The First Chapter", 1, 4);
  archive(ch1.id, 0);
  pt.chapters = [ch1];
  pt.currentChapterStartedAtTurn = 5;
  pt.memoryEvents = [event("evt_ch1", 3, ch1.id)];
  pt.locationId = "loc_after_ch1";
  pt.flags = ["after-ch1"];

  // ── Chapter 2: opening turn 5, then turns 6-9 ──
  const ch2OpeningAssistant = turn("ch2 opening", { hiddenUser: true, chapterOpening: true });
  turn("ch2");
  turn("ch2");
  turn("ch2");
  turn("ch2");
  const ch2 = chapter("ch_2", "The Second Chapter", 5, 9);
  archive(ch2.id, 8);
  pt.chapters = [ch1, ch2];
  pt.currentChapterStartedAtTurn = 10;
  pt.memoryEvents = [...pt.memoryEvents, event("evt_ch2", 7, ch2.id)];
  pt.locationId = "loc_after_ch2";
  pt.flags = ["after-ch2"];
  // A rolling meta that folds BOTH chapters, so pruning has something to empty.
  pt.storyMetaSummaries = [
    {
      id: "mch_1",
      chapterIds: [ch1.id, ch2.id],
      turnRange: { start: 1, end: 9 },
      summary: "Everything so far, compacted.",
      createdAt: "2026-04-01T00:00:00.000Z",
      updatedAt: "2026-04-01T00:00:00.000Z"
    }
  ];

  // ── Chapter 3 (running): opening turn 10, then turns 11-12 ──
  const ch3OpeningAssistant = turn("ch3 opening", { hiddenUser: true, chapterOpening: true });
  turn("ch3");
  turn("ch3");
  pt.memoryEvents = [...pt.memoryEvents, event("evt_ch3", 11)];

  updatePlaythroughRecord(dir, pt);

  return {
    playthrough: pt,
    dir,
    ch1,
    ch2,
    ids: {
      ch1FirstAssistant: "msg_a1",
      ch1Synthetic: "msg_u3",
      ch2OpeningUser: "msg_u5",
      ch2OpeningAssistant,
      ch2LastAssistant: "msg_a9",
      ch3OpeningUser: "msg_u10",
      ch3OpeningAssistant,
      ch3LastAssistant: "msg_a12"
    }
  };
}

describe("planRevert", () => {
  it("anchors a chapter revert at the message after the chapter's run, and names the restore point", () => {
    const dir = tempDir();
    const { playthrough, ch1, ch2, ids } = buildStory(dir);

    const plan = planRevert(playthrough, { kind: "chapter", chapterId: ch2.id });
    expect(plan).not.toBeNull();
    if (!plan) return;

    const truncationMessage = playthrough.messages[plan.truncationIndex];
    expect(truncationMessage.id).toBe(ids.ch3OpeningUser);
    // The next chapter's OPENING is the first assistant message in the deleted block, so its
    // snapshot is the state as chapter 2 ended — after the close, not before it.
    expect(plan.restorePointMessageId).toBe(ids.ch3OpeningAssistant);
    expect(plan.approximate).toBe(false);
    expect(plan.droppedChapterIds).toEqual([ch2.id]);
    expect(plan.unarchivedChapterIds).toEqual([ch2.id]);
    expect(plan.runningChapterId).toBe(ch2.id);
    expect(plan.currentChapterStartedAtTurn).toBe(5);
    expect(plan.keptTailTurn).toBe(9);

    const plan1 = planRevert(playthrough, { kind: "chapter", chapterId: ch1.id });
    expect(plan1?.truncationIndex).toBe(8);
    expect(plan1?.droppedChapterIds).toEqual([ch1.id, ch2.id]);
    expect(plan1?.unarchivedChapterIds).toEqual([ch1.id]);
    expect(plan1?.currentChapterStartedAtTurn).toBe(1);
  });

  it("anchors a message revert at that response and drops its chapter and the later ones", () => {
    const dir = tempDir();
    const { playthrough, ch2, ids } = buildStory(dir);

    const plan = planRevert(playthrough, { kind: "message", messageId: ids.ch2LastAssistant });
    expect(plan).not.toBeNull();
    if (!plan) return;

    expect(playthrough.messages[plan.truncationIndex].id).toBe(ids.ch2LastAssistant);
    // The clicked response is the first assistant in the deleted block: the world returns to
    // before it, which is the state right after the previous response.
    expect(plan.restorePointMessageId).toBe(ids.ch2LastAssistant);
    expect(plan.droppedChapterIds).toEqual([ch2.id]);
    expect(plan.unarchivedChapterIds).toEqual([ch2.id]);
    // The user message of the reverted turn survives, so it is the kept tail.
    expect(plan.keptTailTurn).toBe(9);
  });

  it("un-archives nothing when the revert cuts a chapter at its own opening", () => {
    const dir = tempDir();
    const { playthrough, ch2, ids } = buildStory(dir);

    const plan = planRevert(playthrough, { kind: "message", messageId: ids.ch2OpeningAssistant });
    expect(plan).not.toBeNull();
    if (!plan) return;

    expect(plan.droppedChapterIds).toEqual([ch2.id]);
    expect(plan.unarchivedChapterIds).toEqual([]);
    expect(plan.runningChapterId).toBeNull();
    // Nothing survives to be a running chapter, so the next one starts after the kept tail.
    expect(plan.currentChapterStartedAtTurn).toBe(5);
  });

  it("refuses an anchor that is not archived, and an unknown one", () => {
    const dir = tempDir();
    const { playthrough, ids } = buildStory(dir);

    expect(planRevert(playthrough, { kind: "chapter", chapterId: "ch_nope" })).toBeNull();
    expect(planRevert(playthrough, { kind: "message", messageId: "msg_nope" })).toBeNull();
    // A live response is the live chat's own delete, never a revert.
    expect(planRevert(playthrough, { kind: "message", messageId: ids.ch3LastAssistant })).toBeNull();
  });

  it("counts what the confirm dialog shows", () => {
    const dir = tempDir();
    const { playthrough, ch2 } = buildStory(dir);

    const plan = planRevert(playthrough, { kind: "chapter", chapterId: ch2.id });
    expect(plan).not.toBeNull();
    if (!plan) return;

    const facts = describeDeletion(plan, playthrough);
    expect(facts.messages).toBe(6);
    expect(facts.turns).toBe(3);
    expect(facts.chapters).toBe(1);
    expect(facts.images).toBe(0);
    expect(facts.approximate).toBe(false);
  });

  it("counts only the images that will actually be removed, not every image in the cut", () => {
    const dir = tempDir();
    const { playthrough, ch1, ch2 } = buildStory(dir);
    // One file shared by a surviving message and a discarded one, one that only the cut holds.
    // Index 1 survives a revert to chapter 2; the cut starts at 18 (chapter 3's opening).
    playthrough.messages[1].images = [image("shared.png")];
    playthrough.messages[19].images = [image("shared.png"), image("doomed.png")];

    const plan = planRevert(playthrough, { kind: "chapter", chapterId: ch2.id });
    expect(plan).not.toBeNull();
    if (!plan) return;

    // The shared file survives in chapter 1, so it is not promised away.
    expect(describeDeletion(plan, playthrough).images).toBe(1);
  });

  it("flags an approximate revert when the restore point has no snapshot", () => {
    const dir = tempDir();
    const { playthrough, ch2 } = buildStory(dir, { snapshots: false });

    const plan = planRevert(playthrough, { kind: "chapter", chapterId: ch2.id });
    expect(plan?.approximate).toBe(true);
  });
});

describe("planDeletion and the retry anchor", () => {
  it("finds the user message that produced a response, and nothing else", () => {
    const dir = tempDir();
    const { playthrough, ids } = buildStory(dir);

    expect(retryAnchorMessageId(playthrough, ids.ch3LastAssistant)).toBe("msg_u12");
    // A chapter opening's response anchors on its hidden instruction — the message a retry re-runs.
    expect(retryAnchorMessageId(playthrough, ids.ch3OpeningAssistant)).toBe(ids.ch3OpeningUser);
    expect(retryAnchorMessageId(playthrough, "msg_nope")).toBeNull();
    // Only a RESPONSE has a user message before it. Asking about a user message is a caller bug, and
    // the answer must be "nothing" rather than the previous turn's message.
    expect(retryAnchorMessageId(playthrough, "msg_u12")).toBeNull();
  });

  it("plans a deletion for a LIVE message, which a revert refuses", () => {
    const dir = tempDir();
    const { playthrough, ids } = buildStory(dir);

    // The live chat's own delete is not a revert anchor…
    expect(planRevert(playthrough, { kind: "message", messageId: ids.ch3LastAssistant })).toBeNull();

    // …but it is exactly what a retry deletes: the user message, the response, and everything after.
    const anchorId = retryAnchorMessageId(playthrough, ids.ch3LastAssistant);
    expect(anchorId).toBe("msg_u12");
    const plan = planDeletion(playthrough, anchorId as string);
    expect(plan?.truncationIndex).toBe(22);
    expect(plan?.restorePointMessageId).toBe(ids.ch3LastAssistant);
    expect(plan?.keptTailTurn).toBe(11);
    expect(plan?.approximate).toBe(false);

    // The count the dialog shows is the count that goes — and a retry drops no chapter record.
    const facts = describeDeletion(plan as NonNullable<typeof plan>, playthrough);
    expect(facts.messages).toBe(playthrough.messages.length - 22);
    expect(facts.chapters).toBe(0);
    expect(facts.turns).toBe(1);
  });

  it("is approximate when the response being replaced has no snapshot", () => {
    const dir = tempDir();
    const { playthrough, ids } = buildStory(dir, { snapshots: false });

    const anchorId = retryAnchorMessageId(playthrough, ids.ch3LastAssistant);
    expect(planDeletion(playthrough, anchorId as string)?.approximate).toBe(true);
  });

  it("folds a dangling synthetic instruction into the cut", () => {
    const dir = tempDir();
    const { playthrough } = buildStory(dir);

    // a3 answers the hidden "Continue" instruction at index 4, and archiving skips hidden messages —
    // so that instruction carries no chapter tag, and a cut at a3 has to take it along.
    expect(planDeletion(playthrough, "msg_a3")?.truncationIndex).toBe(4);

    // A retry anchors ON the instruction rather than after it, so nothing dangles in front of the
    // cut: both paths land on the same index, which is the point of sharing the walk.
    const anchorId = retryAnchorMessageId(playthrough, "msg_a3");
    expect(anchorId).toBe("msg_u3");
    expect(planDeletion(playthrough, anchorId as string)?.truncationIndex).toBe(4);
  });
});

describe("revertAction", () => {
  it("rewinds the world to the end of the chapter and makes its messages live again", () => {
    const dir = tempDir();
    const { playthrough, ch1, ch2, ids } = buildStory(dir);

    const result = revertAction(dir, playthrough.id, { kind: "chapter", chapterId: ch2.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state: Playthrough = result.state;

    // Everything from the running chapter's opening is gone.
    expect(state.messages).toHaveLength(18);
    expect(state.messages.some((message) => message.id === ids.ch3OpeningUser)).toBe(false);

    // The world is as chapter 2 left it — captured by the following chapter's opening snapshot,
    // which is why the close's own effects are part of it.
    expect(state.locationId).toBe("loc_after_ch2");
    expect(state.flags).toEqual(["after-ch2"]);
    expect(state.turn).toBe(9);

    // Chapter 2 is un-closed: its messages are live, its record and summary are gone.
    expect(state.chapters.map((chapter) => chapter.id)).toEqual([ch1.id]);
    expect(state.currentChapterStartedAtTurn).toBe(5);
    for (const message of state.messages.slice(8)) {
      if (message.id === ids.ch2OpeningUser) continue;
      expect(message.chapterId).toBeUndefined();
      expect(message.hidden).toBeFalsy();
    }
    // Chapter 1 stays archived.
    const archived = state.messages.filter((message) => message.chapterId === ch1.id);
    expect(archived).toHaveLength(7);

    // The synthetic instruction inside chapter 1 was never tagged, so it stays hidden.
    expect(state.messages.find((message) => message.id === ids.ch1Synthetic)?.hidden).toBe(true);

    // The meta lost chapter 2's id but kept chapter 1's, so it survives.
    expect(state.storyMetaSummaries).toHaveLength(1);
    expect(state.storyMetaSummaries[0].chapterIds).toEqual([ch1.id]);

    // The surviving event of a dropped chapter belongs to the running chapter now.
    expect(state.memoryEvents.find((event) => event.id === "evt_ch2")?.chapterId).toBeUndefined();
    expect(state.memoryEvents.some((event) => event.id === "evt_ch3")).toBe(false);

    // Snapshots of the deleted messages are gone; the kept ones are intact.
    expect(state.snapshots?.[ids.ch3OpeningAssistant]).toBeUndefined();
    expect(state.snapshots?.[ids.ch2LastAssistant]).toBeDefined();
  });

  it("discards every later chapter when the anchor is an older one, and empties the meta", () => {
    const dir = tempDir();
    const { playthrough, ch1, ids } = buildStory(dir);

    const result = revertAction(dir, playthrough.id, { kind: "chapter", chapterId: ch1.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;

    expect(state.messages).toHaveLength(8);
    expect(state.chapters).toEqual([]);
    expect(state.currentChapterStartedAtTurn).toBe(1);
    expect(state.turn).toBe(4);
    expect(state.locationId).toBe("loc_after_ch1");
    // Every folded chapter went, so the meta has nothing left to say.
    expect(state.storyMetaSummaries).toEqual([]);
    // Chapter 1's own run is live again, its summary gone.
    expect(state.messages.every((message) => message.chapterId === undefined)).toBe(true);
    expect(state.messages.find((message) => message.id === ids.ch1Synthetic)?.hidden).toBe(true);
    expect(state.memoryEvents.map((event) => event.id)).toEqual(["evt_ch1"]);
    expect(state.memoryEvents[0].chapterId).toBeUndefined();
  });

  it("reverts a single response: that response and everything after it go", () => {
    const dir = tempDir();
    const { playthrough, ch1, ch2, ids } = buildStory(dir);

    const result = revertAction(dir, playthrough.id, { kind: "message", messageId: ids.ch2LastAssistant });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;

    expect(state.messages).toHaveLength(17);
    // The player's own message of that turn stays — it is their input; the response is what went.
    expect(state.messages.at(-1)?.id).toBe("msg_u9");
    expect(state.messages.at(-1)?.turn).toBe(9);
    // The restore point is the clicked response's own snapshot: the state before its turn. The
    // counter stays at the surviving message's turn so the next turn cannot reuse its number.
    expect(state.turn).toBe(9);
    expect(state.locationId).toBe("loc_after_ch1");
    // Its chapter is un-closed and every later chapter is gone.
    expect(state.chapters.map((chapter) => chapter.id)).toEqual([ch1.id]);
    expect(state.currentChapterStartedAtTurn).toBe(5);
    expect(state.messages.filter((message) => message.chapterId === ch2.id)).toEqual([]);
  });

  it("reverts without a snapshot: history and chapters go, the world stays, and it says so", () => {
    const dir = tempDir();
    const { playthrough, ch1, ch2, ids } = buildStory(dir, { snapshots: false });

    const result = revertAction(dir, playthrough.id, { kind: "chapter", chapterId: ch2.id });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const state = result.state;

    expect(state.messages).toHaveLength(18);
    expect(state.chapters.map((chapter) => chapter.id)).toEqual([ch1.id]);
    expect(state.currentChapterStartedAtTurn).toBe(5);
    // No rewind happened — and the turn counter still moves back to the kept tail, so the next
    // turn does not claim turns that no longer exist.
    expect(state.locationId).toBe("loc_after_ch2");
    expect(state.turn).toBe(9);
    // Memory the deleted turns recorded is pruned by turn, since no snapshot could replace it.
    expect(state.memoryEvents.some((event) => event.id === "evt_ch3")).toBe(false);
    expect(state.memoryEvents.find((event) => event.id === "evt_ch2")?.chapterId).toBeUndefined();
    expect(state.snapshots).toEqual({});
  });

  it("reports a refusal for an anchor that is not archived, and does not write", () => {
    const dir = tempDir();
    const { playthrough, ids } = buildStory(dir);

    const result = revertAction(dir, playthrough.id, { kind: "message", messageId: ids.ch3LastAssistant });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(400);

    // Nothing was written: the record on disk is untouched.
    const stored = getPlaythroughRecord(dir, playthrough.id);
    expect(stored?.messages).toHaveLength(24);
    expect(stored?.chapters).toHaveLength(2);
  });
});

describe("the body the client sends is the body the route accepts", () => {
  /** This is the tripwire for the shapes: the engine anchor names its id field (`chapterId` /
   *  `messageId`) and the wire body carries one generic `id`. Sending the engine shape validates
   *  as far as the browser and dies at the route with "Required" — which is a 400 the UI can only
   *  report verbatim, so it must be caught here instead. */
  it("validates the wire anchor for both kinds against the route's own schema", () => {
    for (const target of [
      { kind: "chapter" as const, id: "ch_1", label: "The First Volume" },
      { kind: "message" as const, id: "msg_a9", label: "a response" }
    ]) {
      const parsed = RevertBody.safeParse({ anchor: toRevertRequestAnchor(target) });
      expect(parsed.success).toBe(true);
      expect(parsed.success && parsed.data.anchor).toEqual({ kind: target.kind, id: target.id });
    }
  });

  it("rejects the engine's own anchor shape — the bug these two types exist to prevent", () => {
    const engineAnchor = toRevertAnchor({ kind: "chapter", id: "ch_1", label: "The First Volume" });
    expect(engineAnchor).toEqual({ kind: "chapter", chapterId: "ch_1" });
    // Falsification: shipping the engine shape over the wire is precisely the 400 users hit.
    const parsed = RevertBody.safeParse({ anchor: engineAnchor });
    expect(parsed.success).toBe(false);
  });
});

describe("POST /api/playthroughs/:id/revert", () => {
  async function buildApp(dir: string) {
    const app = Fastify();
    await app.register(turnRoutes, { dataDir: dir });
    await app.ready();
    return app;
  }

  it("reverts a chapter and answers with the whole document", async () => {
    const dir = tempDir();
    const { playthrough, ch1, ch2 } = buildStory(dir);
    const app = await buildApp(dir);

    const response = await app.inject({
      method: "POST",
      url: `/api/playthroughs/${playthrough.id}/revert`,
      payload: { anchor: { kind: "chapter", id: ch2.id } }
    });

    expect(response.statusCode).toBe(200);
    const state = response.json() as Playthrough;
    expect(state.chapters.map((chapter) => chapter.id)).toEqual([ch1.id]);
    expect(state.currentChapterStartedAtTurn).toBe(5);
    await app.close();
  });

  it("refuses a malformed anchor with a 400 that names the field", async () => {
    const dir = tempDir();
    const { playthrough } = buildStory(dir);
    const app = await buildApp(dir);

    const bad = await app.inject({
      method: "POST",
      url: `/api/playthroughs/${playthrough.id}/revert`,
      payload: { anchor: { kind: "chapter" } }
    });
    expect(bad.statusCode).toBe(400);
    expect(bad.json().error).toContain("Invalid revert request");

    const wrongKind = await app.inject({
      method: "POST",
      url: `/api/playthroughs/${playthrough.id}/revert`,
      payload: { anchor: { kind: "turn", id: "x" } }
    });
    expect(wrongKind.statusCode).toBe(400);
    await app.close();
  });

  it("refuses a live response — that is the chat's own delete, not a revert", async () => {
    const dir = tempDir();
    const { playthrough, ids } = buildStory(dir);
    const app = await buildApp(dir);

    const response = await app.inject({
      method: "POST",
      url: `/api/playthroughs/${playthrough.id}/revert`,
      payload: { anchor: { kind: "message", id: ids.ch3LastAssistant } }
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error).toContain("nothing to revert to");
    await app.close();
  });

  it("404s an unknown playthrough and 400s an unknown chapter", async () => {
    const dir = tempDir();
    const { playthrough } = buildStory(dir);
    const app = await buildApp(dir);

    const missing = await app.inject({
      method: "POST",
      url: "/api/playthroughs/play_nope/revert",
      payload: { anchor: { kind: "chapter", id: "ch_1" } }
    });
    expect(missing.statusCode).toBe(404);

    const unknownChapter = await app.inject({
      method: "POST",
      url: `/api/playthroughs/${playthrough.id}/revert`,
      payload: { anchor: { kind: "chapter", id: "ch_nope" } }
    });
    expect(unknownChapter.statusCode).toBe(400);
    await app.close();
  });
});
