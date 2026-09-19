/** The chapter lifecycle's pure rules: how the next chapter opens, and whether a chapter's summary
 *  still describes what its messages say.
 *
 *  Sibling of `chapterRevert.ts`, and shared the same way: the server builds the opening instruction
 *  from this table, the close dialog renders its options from it, and the Chapters list derives
 *  freshness from the predicate. ONE table, so a mode the route would reject, or a blurb that
 *  promises something the prompt does not ask for, is a compile error rather than a runtime
 *  surprise.
 */
import type { Chapter, ChapterOpeningMode, ChatMessage } from "../schemas";

export type ChapterOpeningModeInfo = {
  id: ChapterOpeningMode;
  /** What the choice is called in the close dialog. */
  label: string;
  /** What it does, in the player's words — shown under the control, and never restated anywhere
   *  else. */
  blurb: string;
  /** The prompt clause that carries it. Not exported for display: it is the machine's copy of the
   *  same promise the blurb makes. */
  instruction: string;
};

const HAND_BACK =
  "Do not take actions on behalf of the player. Write in second person. End by presenting the current moment as an invitation for the player to act.";

export const CHAPTER_OPENING_MODES: readonly ChapterOpeningModeInfo[] = [
  {
    id: "continuation",
    label: "Continuation",
    blurb: "Resumes the scene in place, from the last thing that happened.",
    instruction:
      "Write an opening that resumes the story seamlessly: ground the player in their current location and situation, acknowledge what just happened where relevant, and pick up from the last thing that happened."
  },
  {
    id: "shortJump",
    label: "Short time jump",
    blurb: "Opens moments later, close by, in a new situation.",
    instruction:
      "Write an opening set MOMENTS LATER. The immediate moment has passed: the player is still near where they were, and you may put them into a new but nearby situation."
  },
  {
    id: "longJump",
    label: "Long time jump",
    blurb: "Opens after days, weeks or months, with the situation moved on.",
    instruction:
      "Write an opening set AFTER A LONG STRETCH OF TIME — days, weeks or months, whichever the story supports. The situation has moved on: say how much time has passed and what changed, and let the player arrive into a world that carried on without them."
  },
  {
    id: "custom",
    label: "Custom — my message decides",
    blurb: "Opens exactly as the message you write describes.",
    instruction:
      "The player wrote the opening message below themselves: follow it exactly. It says when, where and how this chapter begins."
  }
];

export function chapterOpeningModeInfo(mode: ChapterOpeningMode): ChapterOpeningModeInfo {
  return CHAPTER_OPENING_MODES.find((entry) => entry.id === mode) ?? CHAPTER_OPENING_MODES[0];
}

/** `custom` is the one mode that cannot work without the player's own words. */
export function chapterOpeningModeNeedsMessage(mode: ChapterOpeningMode): boolean {
  return mode === "custom";
}

/**
 * The hidden user message that opens a chapter — the input of the opening turn.
 *
 * It is a USER message on purpose (the machinery needs a preceding user message for Retry to find,
 * and the turn contract parses user input), but it is recorded hidden so the chat shows only the
 * opening the model writes. The player's own opening message, when there is one, is a SEPARATE
 * visible message appended BEFORE this one: it stays in history, so a Retry re-opens with it
 * without this instruction being confused for it.
 */
export function buildChapterOpeningInstruction(mode: ChapterOpeningMode, message?: string): string {
  const info = chapterOpeningModeInfo(mode);
  const note = message?.trim() ?? "";
  const parts = [
    "A new chapter begins. The previous chapter has been archived and summarized — read the STORY SO FAR and CURRENT STATE before you write.",
    info.instruction
  ];
  if (note) {
    parts.push(
      "The player opened this chapter with this message; treat it as their own contribution and honour it:\n<<<\n" +
        note +
        "\n>>>"
    );
  }
  parts.push(HAND_BACK);
  return parts.join(" ");
}

/** The moment a chapter's summary was last written. */
export function chapterSummaryStamp(chapter: Chapter): string {
  return chapter.updatedAt ?? chapter.createdAt;
}

/**
 * Whether the chapter's messages have been edited since its summary was written.
 *
 * Derived, never stored: `editChatMessage` is not the only writer of a message, and a stored flag
 * would rot on the first path that forgets it. Deriving it also means re-summarizing — which stamps
 * `chapter.updatedAt` — clears it with no second write to keep in sync.
 */
export function chapterSummaryIsStale(chapter: Chapter, messages: ChatMessage[]): boolean {
  const stamp = chapterSummaryStamp(chapter);
  return messages.some(
    (message) =>
      message.chapterId === chapter.id &&
      typeof message.editedAt === "string" &&
      message.editedAt > stamp
  );
}

/**
 * What a dismissal records: the chapter plus the latest edit it was dismissed FOR. Keying on the
 * chapter alone would silence the warning after the NEXT edit, which is the opposite of what
 * dismissing "I know about this edit" means.
 */
export function chapterStaleSignature(chapter: Chapter, messages: ChatMessage[]): string {
  let latest = "";
  for (const message of messages) {
    if (message.chapterId !== chapter.id || typeof message.editedAt !== "string") continue;
    if (message.editedAt > latest) latest = message.editedAt;
  }
  return `${chapter.id}:${latest}`;
}
