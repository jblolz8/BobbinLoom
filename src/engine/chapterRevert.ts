/** Reverting to an earlier chapter: what goes, what comes back, and where the world rewinds to.
 *
 *  Pure and shared. The server runs the plan; the confirm dialogs show its numbers — one rule, two
 *  consumers, no second implementation to drift. `planDeletion` / `describeDeletion` are the half a
 *  REVERT and a RETRY share (both delete forward and rewind to the same restore point);
 *  `retryAnchorMessageId` is the retry's own anchor rule, here rather than in the route so the
 *  dialog and the server cannot disagree about where a retry cuts.
 *
 *  The rule the whole feature stands on is the one `truncateChat` already states: the world
 *  returns to the snapshot of the FIRST assistant message in the deleted block, because a
 *  snapshot is taken before its turn and world state only ever changes on assistant turns. That
 *  makes the restore exact at any anchor, including "the world as the chapter ended" (there, the
 *  first assistant message in the deleted block is the next chapter's opening, whose snapshot is
 *  the state right after the close).
 *
 *  A corollary worth keeping in mind: when the deleted block holds NO assistant message, nothing
 *  after the truncation point changed state, so no snapshot is needed and the revert is still
 *  exact. A missing snapshot therefore only matters when an assistant message IS in the block —
 *  that is the `approximate` case, and it is a warning the dialog shows rather than a refusal.
 *
 *  Un-archiving needs no marker of its own: `chapterId` IS the archive marker. Only non-hidden
 *  messages are ever tagged (`closeChapterAction` filters `!m.hidden`), so a hidden message with a
 *  `chapterId` was hidden by the archive and becomes live again, while a hidden message without one
 *  is a synthetic instruction (the "Continue" flow, the chapter-opening instruction) and stays
 *  hidden.
 */
import type { Playthrough } from "../schemas";

export type RevertAnchor =
  | { kind: "chapter"; chapterId: string }
  | { kind: "message"; messageId: string };

/**
 * What deleting forward from one message does — the half a revert and a retry both stand on.
 *
 * A revert's anchor is an archived message or a chapter; a retry's is the user message that
 * produced the response being re-run. Both delete forward from an index and rewind the world to the
 * same restore point, so both read this plan — which is what lets their confirm dialogs promise
 * exactly what the server will do.
 */
export type DeletionPlan = {
  /** Index of the first message to delete; the kept region is `[0, truncationIndex)`. */
  truncationIndex: number;
  /** The first assistant message in the deleted block — whose snapshot is the restore point. */
  restorePointMessageId: string | null;
  /** An assistant message is in the deleted block but has no snapshot: the world cannot rewind. */
  approximate: boolean;
  /** Turn of the last surviving message, or 0 when nothing survives. */
  keptTailTurn: number;
};

export type RevertPlan = DeletionPlan & {
  anchor: RevertAnchor;
  /** Chapters whose surviving messages become live again (tag cleared, un-hidden). */
  unarchivedChapterIds: string[];
  /** Every chapter record the revert deletes — the anchor's chapter and everything after it. */
  droppedChapterIds: string[];
  /** The chapter the story resumes in, when a surviving message still belongs to one. */
  runningChapterId: string | null;
  /** `currentChapterStartedAtTurn` after the revert. */
  currentChapterStartedAtTurn: number;
};

/** Everything a confirm dialog says, in numbers. `chapters` is 0 for a plan with no chapter half —
 *  a retry, which never drops a chapter record because it only ever anchors a live message. */
export type DeletionFacts = {
  messages: number;
  turns: number;
  images: number;
  chapters: number;
  approximate: boolean;
  /**
   * Characters whose sheet exists at BOTH ends but is not the same sheet: the revert replaces it with
   * the restore point's. Empty when nothing changed, and empty when there is no snapshot to go back to
   * — `approximate` is what tells those two apart.
   */
  sheetsRewound: string[];
  /**
   * Characters whose sheet does NOT exist at the restore point — added to the cast after it, or their
   * first section written later. A revert does not "rewind" these; it takes them away, which is not
   * the same promise and must not be worded as one.
   */
  sheetsRemoved: string[];
  /** Characters the restore point HAD whose sheet is gone now: the revert brings them back. */
  sheetsRestored: string[];
};

/**
 * The deletion index, the restore point and the honesty flag — the rule, in one place.
 *
 * `index` is where the caller wants the cut; the dangling-instruction walk may move it one or more
 * messages earlier (see below), so callers read `truncationIndex` back off the result rather than
 * trusting the index they passed.
 */
function deletionFromIndex(playthrough: Playthrough, index: number): DeletionPlan {
  const messages = playthrough.messages;

  // A synthetic instruction left dangling at the cut — the hidden user message of a turn whose
  // response is going — has nothing left to instruct and would keep a turn number no message
  // claims. Fold it into the deleted block; a tagged message stops the walk, so a chapter's own
  // archived run is never eaten into.
  let truncationIndex = index;
  while (
    truncationIndex > 0 &&
    messages[truncationIndex - 1].hidden &&
    !messages[truncationIndex - 1].chapterId
  ) {
    truncationIndex -= 1;
  }

  const deletedBlock = messages.slice(truncationIndex);
  const restorePoint = deletedBlock.find((message) => message.role === "assistant");
  const keptTail = messages[truncationIndex - 1];

  return {
    truncationIndex,
    restorePointMessageId: restorePoint?.id ?? null,
    approximate: restorePoint !== undefined && !playthrough.snapshots?.[restorePoint.id],
    keptTailTurn: keptTail?.turn ?? 0
  };
}

/**
 * What deleting forward from `messageId` would do, or null when there is no such message.
 *
 * Deliberately has no eligibility rule of its own: a revert refuses a live message (that is the
 * live chat's own delete action), while a retry REQUIRES one, so the rule belongs to each caller
 * rather than here.
 */
export function planDeletion(playthrough: Playthrough, messageId: string): DeletionPlan | null {
  const index = playthrough.messages.findIndex((message) => message.id === messageId);
  if (index === -1) return null;
  return deletionFromIndex(playthrough, index);
}

/**
 * The user message that produced `assistantMessageId` — the retry's own anchor rule.
 *
 * Here rather than in the route so the confirmation dialog and the server cannot disagree about
 * where a retry cuts: they call the same function, so the count the dialog shows is the count the
 * server deletes. Returns null when there is no such message — an unknown id, an id that is not a
 * response, or a response whose log starts with an assistant turn.
 */
export function retryAnchorMessageId(
  playthrough: Playthrough,
  assistantMessageId: string
): string | null {
  const index = playthrough.messages.findIndex((message) => message.id === assistantMessageId);
  if (index === -1) return null;
  if (playthrough.messages[index].role !== "assistant") return null;
  for (let cursor = index - 1; cursor >= 0; cursor -= 1) {
    if (playthrough.messages[cursor].role === "user") return playthrough.messages[cursor].id;
  }
  return null;
}

/**
 * What a revert from `anchor` would do, or null when the anchor is not a revertible one.
 *
 * Reverting means: discard the anchor's chapter and every chapter after it (the anchor chapter's
 * surviving messages return to the running chapter, its summary record is discarded), discard
 * every message from the truncation point on, and rewind the world to the end of the kept region.
 */
export function planRevert(playthrough: Playthrough, anchor: RevertAnchor): RevertPlan | null {
  const chapters = playthrough.chapters ?? [];
  const messages = playthrough.messages;

  // The chapter the anchor belongs to, and the message index the deletion starts at.
  let chapterIndex: number;
  let truncationIndex: number;

  if (anchor.kind === "chapter") {
    chapterIndex = chapters.findIndex((chapter) => chapter.id === anchor.chapterId);
    if (chapterIndex === -1) return null;
    const chapter = chapters[chapterIndex];

    // The chapter's archived run is contiguous, so the last message carrying its id is its end.
    // `messageIds` is the fallback for a record whose messages were stored under older ids.
    let lastIndex = -1;
    for (let index = messages.length - 1; index >= 0; index -= 1) {
      if (messages[index].chapterId === chapter.id) {
        lastIndex = index;
        break;
      }
    }
    if (lastIndex === -1) {
      const owned = new Set(chapter.messageIds);
      for (let index = messages.length - 1; index >= 0; index -= 1) {
        if (owned.has(messages[index].id)) {
          lastIndex = index;
          break;
        }
      }
    }
    if (lastIndex === -1) return null;
    truncationIndex = lastIndex + 1;
  } else {
    truncationIndex = messages.findIndex((message) => message.id === anchor.messageId);
    if (truncationIndex === -1) return null;
    const chapterId = messages[truncationIndex].chapterId;
    // Only an archived message is a revert anchor. Truncating the running chapter is the live
    // chat's own delete action, and it must not be reachable through this path.
    if (!chapterId) return null;
    chapterIndex = chapters.findIndex((chapter) => chapter.id === chapterId);
    if (chapterIndex === -1) return null;
  }

  // The deletion half, shared with Retry: the cut (after the dangling-instruction walk), the restore
  // point, and whether the world can rewind at all.
  const deletion = deletionFromIndex(playthrough, truncationIndex);
  const cut = deletion.truncationIndex;

  const droppedChapterIds = chapters.slice(chapterIndex).map((chapter) => chapter.id);
  const dropped = new Set(droppedChapterIds);

  // A surviving message still tagged with a dropped chapter becomes live again. Read from the
  // SURVIVING messages, not from the chapter record: a message variant can cut a chapter in half,
  // and a chapter whose every message went un-archives nothing.
  const unarchivedChapterIds: string[] = [];
  let runningChapterId: string | null = null;
  for (let index = 0; index < cut; index += 1) {
    const chapterId = messages[index].chapterId;
    if (!chapterId || !dropped.has(chapterId)) continue;
    if (!unarchivedChapterIds.includes(chapterId)) unarchivedChapterIds.push(chapterId);
    runningChapterId = chapterId;
  }

  const runningChapter = runningChapterId
    ? chapters.find((chapter) => chapter.id === runningChapterId)
    : undefined;
  const currentChapterStartedAtTurn = runningChapter
    ? runningChapter.turnRange.start
    : deletion.keptTailTurn + 1;

  return {
    anchor,
    ...deletion,
    unarchivedChapterIds,
    droppedChapterIds,
    runningChapterId,
    currentChapterStartedAtTurn
  };
}

/**
 * The counts a confirm dialog renders. Derived from the same plan the server executes.
 *
 * `images` counts what the deletion will actually REMOVE: the store is content-addressed, so a file
 * the discarded turns share with a surviving message stays — and promising a deletion that does
 * not happen is the same class of lie as promising a smaller one than happens.
 *
 * `sheetsRewound` reads the restore point's snapshot (which captures `characterTemplates`, so a
 * revert rewinds a grown sheet) and names the characters whose sheet is not the one that snapshot
 * holds. A character is named by its instance when the cast still has one, because that is the name
 * the reader knows; a template with no instance left falls back to its own.
 *
 * `droppedChapterIds` is optional because a retry's plan has no chapter half: a retry only ever
 * anchors a live message, so it drops no chapter record and the count is 0.
 */
export function describeDeletion(
  plan: DeletionPlan & { droppedChapterIds?: string[] },
  playthrough: Playthrough
): DeletionFacts {
  const deleted = playthrough.messages.slice(plan.truncationIndex);
  const surviving = new Set<string>();
  for (const message of playthrough.messages.slice(0, plan.truncationIndex)) {
    for (const image of message.images ?? []) {
      if (image?.file) surviving.add(image.file);
    }
  }
  const doomed = new Set<string>();
  for (const message of deleted) {
    for (const image of message.images ?? []) {
      if (image?.file && !surviving.has(image.file)) doomed.add(image.file);
    }
  }
  return {
    messages: deleted.length,
    turns: Math.max(0, playthrough.turn - plan.keptTailTurn),
    images: doomed.size,
    chapters: plan.droppedChapterIds?.length ?? 0,
    approximate: plan.approximate,
    ...sheetReversion(plan, playthrough)
  };
}

/**
 * The three ways a revert touches a character's sheet, computed against the restore point's snapshot
 * (which captures `characterTemplates`, so a revert rewinds a grown sheet).
 *
 * They are deliberately three lists and not one: "this sheet goes back to how it was", "this sheet
 * did not exist here and goes", and "this sheet comes back" are different things to tell a reader,
 * and a single count would say the wrong one. Content and summary are what the sheet dialog and the
 * section patches write; the rest of the instance rides along in the same snapshot.
 *
 * No snapshot, no claim: all three come back empty and `approximate` does the talking.
 */
function sheetReversion(
  plan: DeletionPlan & { droppedChapterIds?: string[] },
  playthrough: Playthrough
): { sheetsRewound: string[]; sheetsRemoved: string[]; sheetsRestored: string[] } {
  const empty = { sheetsRewound: [], sheetsRemoved: [], sheetsRestored: [] };
  if (!plan.restorePointMessageId) return empty;
  const snapshot = playthrough.snapshots?.[plan.restorePointMessageId];
  if (!snapshot) return empty;

  const atRestorePoint = new Map(
    (snapshot.characterTemplates ?? []).map((template) => [template.id, template])
  );
  // The cast the restore point held, for the sheet that is gone now.
  const castAtRestorePoint = new Set((snapshot.characters ?? []).map((character) => character.templateId));
  const stillHere = new Set(playthrough.characterTemplates.map((template) => template.id));

  const sheetsRewound: string[] = [];
  const sheetsRemoved: string[] = [];
  const sheetsRestored: string[] = [];

  for (const template of playthrough.characterTemplates) {
    const before = atRestorePoint.get(template.id);
    const instance = playthrough.characters.find((character) => character.templateId === template.id);
    const name = instance?.name ?? template.name ?? template.id;

    if (!before) {
      if (!sheetsRemoved.includes(name)) sheetsRemoved.push(name);
      continue;
    }
    if (before.content !== template.content || before.summary !== template.summary) {
      if (!sheetsRewound.includes(name)) sheetsRewound.push(name);
    }
  }

  for (const template of snapshot.characterTemplates ?? []) {
    if (stillHere.has(template.id) || !castAtRestorePoint.has(template.id)) continue;
    const name = template.name ?? template.id;
    if (!sheetsRestored.includes(name)) sheetsRestored.push(name);
  }

  return { sheetsRewound, sheetsRemoved, sheetsRestored };
}

/** What the UI remembers while the confirm dialog is open: the anchor, plus what to call it.
 *  `label` is display only — it never travels to the server. */
export type RevertTarget = {
  kind: "chapter" | "message";
  id: string;
  label: string;
};

/** The one place the UI's target becomes the engine's anchor. */
export function toRevertAnchor(target: RevertTarget): RevertAnchor {
  return target.kind === "chapter"
    ? { kind: "chapter", chapterId: target.id }
    : { kind: "message", messageId: target.id };
}

/**
 * The WIRE shape of an anchor — what the route's body schema accepts, and deliberately not the
 * same thing as `RevertAnchor`: there the id is a named field (`chapterId` / `messageId`), here it
 * is one generic `id` chosen by the discriminator. Two shapes with one converter each is how the
 * first shipped version of this sent `{ chapterId }` and got back nothing but "Required".
 *
 * The route maps this to `RevertAnchor`, so the direction is: UI target → wire → engine.
 */
export type RevertRequestAnchor = { kind: "chapter" | "message"; id: string };

export function toRevertRequestAnchor(target: RevertTarget): RevertRequestAnchor {
  return { kind: target.kind, id: target.id };
}
