/** Reverting to an earlier chapter: what goes, what comes back, and where the world rewinds to.
 *
 *  Pure and shared. The server runs the plan; the confirm dialog shows its numbers — one rule,
 *  two consumers, no second implementation to drift.
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

export type RevertPlan = {
  anchor: RevertAnchor;
  /** Index of the first message to delete; the kept region is `[0, truncationIndex)`. */
  truncationIndex: number;
  /** The first assistant message in the deleted block — whose snapshot is the restore point. */
  restorePointMessageId: string | null;
  /** An assistant message is in the deleted block but has no snapshot: the world cannot rewind. */
  approximate: boolean;
  /** Chapters whose surviving messages become live again (tag cleared, un-hidden). */
  unarchivedChapterIds: string[];
  /** Every chapter record the revert deletes — the anchor's chapter and everything after it. */
  droppedChapterIds: string[];
  /** The chapter the story resumes in, when a surviving message still belongs to one. */
  runningChapterId: string | null;
  /** `currentChapterStartedAtTurn` after the revert. */
  currentChapterStartedAtTurn: number;
  /** Turn of the last surviving message, or 0 when nothing survives. */
  keptTailTurn: number;
};

/** Everything the confirm dialog says, in numbers. */
export type RevertFacts = {
  messages: number;
  turns: number;
  images: number;
  chapters: number;
  approximate: boolean;
};

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

  // A synthetic instruction left dangling at the cut — the hidden user message of a turn whose
  // response is going — has nothing left to instruct and would keep a turn number no message
  // claims. Fold it into the deleted block; a tagged message stops the walk, so a chapter's own
  // archived run is never eaten into.
  while (
    truncationIndex > 0 &&
    messages[truncationIndex - 1].hidden &&
    !messages[truncationIndex - 1].chapterId
  ) {
    truncationIndex -= 1;
  }

  const droppedChapterIds = chapters.slice(chapterIndex).map((chapter) => chapter.id);
  const dropped = new Set(droppedChapterIds);

  const deletedBlock = messages.slice(truncationIndex);
  const restorePoint = deletedBlock.find((message) => message.role === "assistant");
  const keptTail = messages[truncationIndex - 1];
  const keptTailTurn = keptTail?.turn ?? 0;

  // A surviving message still tagged with a dropped chapter becomes live again. Read from the
  // SURVIVING messages, not from the chapter record: a message variant can cut a chapter in half,
  // and a chapter whose every message went un-archives nothing.
  const unarchivedChapterIds: string[] = [];
  let runningChapterId: string | null = null;
  for (let index = 0; index < truncationIndex; index += 1) {
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
    : keptTailTurn + 1;

  return {
    anchor,
    truncationIndex,
    restorePointMessageId: restorePoint?.id ?? null,
    approximate: restorePoint !== undefined && !playthrough.snapshots?.[restorePoint.id],
    unarchivedChapterIds,
    droppedChapterIds,
    runningChapterId,
    currentChapterStartedAtTurn,
    keptTailTurn
  };
}

/**
 * The counts the confirm dialog renders. Derived from the same plan the server executes.
 *
 * `images` counts what the revert will actually REMOVE: the store is content-addressed, so a file
 * the discarded turns share with a surviving message stays — and promising a deletion that does
 * not happen is the same class of lie as promising a smaller one than happens.
 */
export function describeRevert(plan: RevertPlan, playthrough: Playthrough): RevertFacts {
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
    chapters: plan.droppedChapterIds.length,
    approximate: plan.approximate
  };
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
