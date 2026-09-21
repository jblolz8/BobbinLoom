import { randomUUID } from "node:crypto";
import { dirname, join } from "node:path";
import {
  applyStatePatch,
  parseUserInput,
  rotateMemoryEvents,
  scanLorebooks,
  takeTurnSnapshot,
  restoreSnapshotState,
  updateTimingStates
} from "../engine/engine";
import { planDeletion, planRevert, retryAnchorMessageId, type RevertAnchor } from "../engine/chapterRevert";
import type { Playthrough, PromptConfig, ScenarioSeed } from "../schemas";
import type { EntryTimingState, LorebookEntry, TurnSnapshot } from "../schemas";
import type { TurnProvider } from "./provider";
import type { PromptUsageBreakdown } from "./provider";
import type { MeasuredUsage } from "./provider";
import { getLorebook, getPlaythroughRecord, updatePlaythroughRecord } from "./store";
import { sweepOrphansInDataDir } from "./imageStore";
import { clampCalibration } from "./provider/promptBuilder";

export type TokenBreakdown = PromptUsageBreakdown;

export type TokenUsage = {
  estimated: number;
  contextWindow: number;
  breakdown: TokenBreakdown;
  /** Provider-reported token counts for the prompt just sent, when the
   *  provider returns a usage block. Absent before the first turn and on
   *  providers that report none (the estimate is then the only number). */
  measured?: MeasuredUsage;
  /** How many cast members are present vs absent at the current location
   *  when this usage was measured — makes presence gating observable. */
  castPresence?: { present: number; absent: number };
};

export type TurnExecution = {
  state: Playthrough;
  narrative: string;
  choices?: string[];
  applied: string[];
  rejected: string[];
  warnings: string[];
  tokenUsage: TokenUsage;
  durationMs?: number;
  model?: string;
  /** Raw request body sent to the provider — for the Debug → Input tab. */
  rawInput?: string;
  /** Raw response body from the provider — for the Debug → Output tab. */
  rawOutput?: string;
  /** OpenAI finish_reason ("stop", "length", …) — surfaces truncation diagnostics. */
  finishReason?: string | null;
};

export type ActionFailure = {
  ok: false;
  status: number;
  error: string;
};

export type RetryOutcome = (TurnExecution & { ok: true }) | ActionFailure;
export type EditOutcome = { ok: true; state: Playthrough } | ActionFailure;

/** Optional flags that change how executeTurn appends messages. */
export type TurnOptions = {
  /** Hide the synthetic user message (used by chapter-opening turns, where
   *  the "instruction" should not appear in the chat). The hidden message is
   *  still recorded so retryAssistantTurn can find a preceding user message
   *  and its snapshot. */
  hideUserMessage?: boolean;
  /** Mark the assistant message as the opening of a new chapter. Drives the
   *  "Re-summarize previous chapter" action in the chat UI. */
  chapterOpening?: boolean;
  /** External abort signal (e.g. client disconnect) — forwarded to the
   *  provider so in-flight model calls stop and nothing is persisted. */
  signal?: AbortSignal;
};

/**
 * Runs one full turn against an in-memory playthrough: provider call,
 * state patch, message append, and pre-turn snapshot storage.
 * Does not persist — callers decide when to save.
 */
export async function executeTurn(
  playthrough: Playthrough,
  input: string,
  provider: TurnProvider,
  suggestedChoicesEnabled: boolean,
  contextWindow: number = 65536,
  options?: TurnOptions,
  promptConfig?: PromptConfig
): Promise<TurnExecution> {
  const snapshot = takeTurnSnapshot(playthrough);
  const parsedInput = parseUserInput(input);
  const startTime = performance.now();
  const { turn: assistantTurn, promptUsage, measuredUsage, model, rawInput, rawOutput, finishReason } = await provider.generateTurn(parsedInput, playthrough, suggestedChoicesEnabled, promptConfig ?? { modules: { turn: [] } }, options?.signal);
  const durationMs = Math.round(performance.now() - startTime);

  const patchResult = assistantTurn.statePatch
    ? applyStatePatch(playthrough, assistantTurn.statePatch, promptConfig?.characterFormat)
    : { state: playthrough, applied: [], rejected: [], warnings: [] };

  const next = patchResult.state;
  const now = new Date().toISOString();
  const assistantMessageId = `msg_${randomUUID()}`;

  // ── Compute embeddings for new memory events ──
  const eventsNeedingEmbedding = next.memoryEvents.filter(
    e => !e.embedding || e.embedding.length === 0
  );
  if (eventsNeedingEmbedding.length > 0) {
    try {
      const summaries = eventsNeedingEmbedding.map(e => e.summary);
      const embeddings = await provider.embedTexts(summaries);
      for (let i = 0; i < eventsNeedingEmbedding.length; i++) {
        if (embeddings[i] && embeddings[i].length > 0) {
          eventsNeedingEmbedding[i].embedding = embeddings[i];
        }
      }
    } catch (error) {
      // Embedding failed — events stay unembedded, keyword fallback handles them
      console.error(`executeTurn: embedding computation failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  next.turn += 1;
  const currentTurn = next.turn;
  // Guard against blank narratives from any provider path — an empty string
  // (or whitespace) must never become an invisible chat message.
  const narrative = assistantTurn.narrative.trim() ? assistantTurn.narrative : "The provider returned an empty response.";
  next.messages.push(
    {
      id: `msg_${randomUUID()}`,
      role: "user",
      content: input,
      createdAt: now,
      turn: currentTurn,
      ...(options?.hideUserMessage ? { hidden: true } : {})
    },
    {
      id: assistantMessageId,
      role: "assistant",
      content: narrative,
      createdAt: now,
      durationMs,
      turn: currentTurn,
      // What the patch actually did. Recorded whenever the model sent one, even when
      // nothing was refused — "a patch was sent and none of it was rejected" is the
      // fact a drift investigation needs. Patch feedback is never re-injected into the
      // prompt (stateless by design), so without this the only view of it is the
      // transient Debug panel.
      ...(assistantTurn.statePatch
        ? { patchInfo: { applied: patchResult.applied, rejected: patchResult.rejected, warnings: patchResult.warnings } }
        : {}),
      ...(model ? { model } : {}),
      ...(options?.chapterOpening ? { chapterOpening: true } : {})
    }
  );
  next.snapshots = { ...(next.snapshots ?? {}), [assistantMessageId]: snapshot };
  next.updatedAt = now;

  // ── Update lorebook timing states ──
  if (next.lorebookIds && next.lorebookIds.length > 0) {
    const allEntries: LorebookEntry[] = [];
    for (const lbId of next.lorebookIds) {
      const lb = getLorebook(lbId);
      if (!lb) continue;
      for (const entry of Object.values(lb.entries)) {
        allEntries.push(entry);
      }
    }
    if (allEntries.length > 0) {
      const scanMessages = next.messages
        .filter(m => !m.hidden)
        .map(m => ({ role: m.role, content: m.content }));
      const previousStates = new Map<number, EntryTimingState>();
      if (next.lorebookTimingStates) {
        for (const [key, ts] of Object.entries(next.lorebookTimingStates)) {
          previousStates.set(Number(key), ts);
        }
      }
      const scanned = scanLorebooks({
        messages: scanMessages,
        entries: allEntries,
        lorebookDefaults: { scanDepth: 2, caseSensitive: false, matchWholeWords: false },
        timingStates: previousStates,
        currentMessageIndex: scanMessages.length,
      });
      const newTiming = updateTimingStates(allEntries, scanned, previousStates, scanMessages.length);
      // Convert Map back to record for JSON serialization
      const timingRecord: Record<string, EntryTimingState> = {};
      for (const [uid, ts] of newTiming) {
        timingRecord[String(uid)] = ts;
      }
      next.lorebookTimingStates = timingRecord;
    }
  }

  // Memory retention: rotate live events into the compressed layer once the live
  // set grows past the threshold. Purely a memory-layer concern — messages are
  // never hidden to make room; the prompt budget (Phase 1) decides what is sent.
  const rotated = rotateMemoryEvents(next);
  Object.assign(next, {
    memoryEvents: rotated.memoryEvents,
    memoryLayers: rotated.memoryLayers,
    updatedAt: rotated.updatedAt
  });

  // ── Token usage: real measurement from the provider, or fixed fallback estimate ──
  const castPresence = {
    present: next.characters.filter((c) => c.currentLocationId === next.locationId).length,
    absent: next.characters.filter((c) => c.currentLocationId !== next.locationId).length,
  };
  const tokenUsage: TokenUsage = promptUsage
    ? {
        estimated: promptUsage.estimated,
        contextWindow,
        breakdown: promptUsage.breakdown,
        castPresence,
        ...(measuredUsage ? { measured: measuredUsage } : {})
      }
    : estimateTokenUsageFallback(next, input, contextWindow, promptConfig);

  // Self-calibrate: remember this turn's measured/estimated ratio so the NEXT
  // turn's budget maths self-corrects. Only a real measurement updates it —
  // a MockProvider turn leaves any existing ratio untouched.
  if (measuredUsage && promptUsage && promptUsage.estimated > 0) {
    next.tokenCalibration = clampCalibration(measuredUsage.promptTokens / promptUsage.estimated);
  }

  return {
    state: next,
    narrative,
    choices: assistantTurn.choices,
    applied: patchResult.applied,
    rejected: patchResult.rejected,
    warnings: patchResult.warnings,
    tokenUsage,
    durationMs,
    model,
    rawInput,
    rawOutput,
    finishReason,
  };
}

/**
 * Rough chars/4 estimate used only when the provider doesn't supply a real
 * measurement (e.g. MockProvider, which assembles no prompt).
 */
function estimateTokenUsageFallback(state: Playthrough, input: string, contextWindow: number, promptConfig?: PromptConfig): TokenUsage {
  const est = (text: string) => Math.ceil(text.length / 4);

  const moduleContent = Object.values(promptConfig?.modules ?? {})
    .flat()
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((m) => m.content).join("\n\n");

  // Output format instructions are ~1800 chars of JSON guidance
  const outputFormatChars = 1800;

  const stateChars = state.characters.reduce((sum, c) => {
    const tpl = state.characterTemplates.find((t) => t.id === c.templateId);
    const present = c.currentLocationId === state.locationId;
    return sum + (present
      ? c.name.length + (tpl?.content.length ?? 300) + 80      // full sheet + runtime state
      : Math.min(c.name.length + c.memorySummary.length + 160, 260)); // one-liner, capped
  }, 0)
    + state.inventory.reduce((sum, i) => sum + i.itemId.length + 20, 0)
    + state.quests.reduce((sum, q) => sum + q.name.length + q.summary.length + 40, 0)
    + state.npcs.reduce((sum, n) => sum + n.name.length + n.description.length + 30, 0)
    + 200; // player + location + flags overhead

  const chatHistory = state.messages
    .filter(m => !m.hidden)
    .slice(-12)
    .map(m => m.content).join("\n");

  const memoryText = state.memoryEvents.map(e => e.summary).join("\n");
  const memoryLayersText = [
    ...(state.memoryLayers?.recent ?? []),
    ...(state.memoryLayers?.compressed ?? []),
  ].map(e => e.summary).join("\n");

  const storySoFarText = (state.chapters ?? []).map(ch => ch.fullSummary).join("\n\n");

  const breakdown: TokenBreakdown = {
    modules: est(moduleContent),
    outputFormat: Math.ceil(outputFormatChars / 4),
    lorebook: 0, // unknown outside the provider
    storySoFar: est(storySoFarText),
    stateSummary: Math.ceil(stateChars / 4),
    chatHistory: est(chatHistory),
    memoryEvents: est(memoryText + memoryLayersText),
    lorebookDepth: 0, // unknown outside the provider
    userInput: est(input),
  };

  return {
    estimated: Object.values(breakdown).reduce((a, b) => a + b, 0),
    contextWindow,
    breakdown,
    castPresence: {
      present: state.characters.filter((c) => c.currentLocationId === state.locationId).length,
      absent: state.characters.filter((c) => c.currentLocationId !== state.locationId).length,
    },
  };
}

/**
 * Retries an assistant response: deletes forward from the user message of that turn (the shared
 * delete-and-rewind rule, so the world returns to the snapshot of the response being replaced),
 * discards everything after it, then re-runs the turn.
 *
 * Two properties callers rely on:
 *
 *  - **Nothing is written until the model answers.** The deletion happens on a COPY; the failure and
 *    aborted paths return before `updatePlaythroughRecord`, so a retry that does not land leaves the
 *    record byte-identical. That is what lets the chat keep the old response on screen until the new
 *    one arrives.
 *  - **The record first, the images second**, exactly as `truncateChat` and `revertAction` order it.
 */
export async function retryAssistantTurn(
  dataDir: string,
  playthroughId: string,
  assistantMessageId: string,
  provider: TurnProvider,
  suggestedChoicesEnabled: boolean,
  contextWindow: number = 65536,
  signal?: AbortSignal,
  promptConfig?: PromptConfig,
  imagesDir: string = defaultImagesDir(dataDir)
): Promise<RetryOutcome> {
  const playthrough = getPlaythroughRecord(dataDir, playthroughId);
  if (!playthrough) {
    return { ok: false, status: 404, error: "Playthrough not found" };
  }

  const assistantIndex = playthrough.messages.findIndex((message) => message.id === assistantMessageId);
  if (assistantIndex === -1) {
    return { ok: false, status: 404, error: "Message not found" };
  }
  if (playthrough.messages[assistantIndex].role !== "assistant") {
    return { ok: false, status: 400, error: "Only assistant responses can be retried" };
  }

  // The anchor and the plan come from the ENGINE rather than from a walk of this function's own: the
  // confirmation dialog computes the same two things from the same record, and that is the only
  // reason the count it shows can be trusted to be the count that goes.
  const anchorId = retryAnchorMessageId(playthrough, assistantMessageId);
  const anchor = anchorId ? playthrough.messages.find((message) => message.id === anchorId) : undefined;
  const plan = anchorId ? planDeletion(playthrough, anchorId) : null;
  if (!anchor || !plan) {
    return { ok: false, status: 400, error: "No user message exists before this response" };
  }

  const userInput = anchor.content;

  // Preserve chapter-opening flags on retry: if the original assistant message
  // was a chapter opening, the regenerated one must be too; likewise the
  // synthetic user instruction stays hidden.
  const originalAssistant = playthrough.messages[assistantIndex];
  const originalUser = anchor;
  const retryOptions: TurnOptions | undefined =
    originalAssistant.chapterOpening || originalUser.hidden
      ? {
          chapterOpening: originalAssistant.chapterOpening ?? false,
          hideUserMessage: originalUser.hidden ?? false
        }
      : undefined;

  // The SAME delete-and-rewind `truncateChat` and `revertAction` use: inclusive from the plan's cut,
  // restoring the snapshot of the first assistant message in the deleted block — which, for a retry,
  // is the response being replaced — and pruning the snapshots of everything that goes with it.
  //
  // On a copy, deliberately: persisting here would throw the tail away before the model has
  // answered, and a retry that never landed would have destroyed a story.
  const base = deleteFrom(playthrough, plan.truncationIndex);

  const result = await executeTurn(
    base,
    userInput,
    provider,
    suggestedChoicesEnabled,
    contextWindow,
    retryOptions ? { ...retryOptions, ...(signal ? { signal } : {}) } : signal ? { signal } : undefined,
    promptConfig
  );

  // Client cancelled — drop the regenerated turn without persisting it.
  if (signal?.aborted) {
    return { ok: false, status: 499, error: "Request aborted by the client" };
  }

  // No snapshot pruning here any more: `deleteFrom` already dropped the snapshots of the messages it
  // deleted, and the regenerated turn brings its own.
  updatePlaythroughRecord(dataDir, result.state);

  // Same ordering rule as truncateChat and revertAction: record first, images second — and only on
  // the success path, because a retry that never landed has deleted nothing to sweep.
  sweepAfterDeleteForward(dataDir, playthroughId, imagesDir);
  return { ok: true, ...result };
}

/**
 * Rewrites a chat bubble in place. Editing never changes world state and
 * never invalidates snapshots — snapshots hold no message content.
 */
export function editChatMessage(
  dataDir: string,
  playthroughId: string,
  messageId: string,
  content: string
): EditOutcome {
  const playthrough = getPlaythroughRecord(dataDir, playthroughId);
  if (!playthrough) {
    return { ok: false, status: 404, error: "Playthrough not found" };
  }

  const message = playthrough.messages.find((candidate) => candidate.id === messageId);
  if (!message) {
    return { ok: false, status: 404, error: "Message not found" };
  }

  message.content = content;
  message.editedAt = new Date().toISOString();
  playthrough.updatedAt = message.editedAt;

  updatePlaythroughRecord(dataDir, playthrough);
  return { ok: true, state: playthrough };
}

/** The images store that belongs to `dataDir`. Production keeps the two as
 *  siblings (`data/playthroughs` ↔ `data/images`, the store's own `IMAGES_DIR`),
 *  so a caller handed a custom data dir sweeps its OWN store — which is what
 *  keeps a temp data dir in a test from sweeping the real `data/images` when a
 *  suite calls truncateChat directly. */
function defaultImagesDir(dataDir: string): string {
  return join(dirname(dataDir), "images");
}

/**
 * The one delete-and-rewind rule both truncation and revert stand on.
 *
 * Deletes the given message and everything after it (inclusive), restoring the
 * world state to the snapshot of the first assistant message in the deleted
 * block — that snapshot is the pre-turn state right after the new last message.
 * When the deleted block holds no assistant message (nothing happened after the
 * new last message), the live state already reflects the truncation. Permanently
 * Permanently discards the deleted messages and their snapshots; no regeneration.
 * The caller owns persistence, and chapter bookkeeping happens outside this helper:
 * a revert restores a snapshot that legitimately still contains the chapter it is
 * un-closing, so the caller filters it out afterwards.
 */
function deleteFrom(playthrough: Playthrough, index: number): Playthrough {
  const deletedBlock = playthrough.messages.slice(index);
  const targetAssistant = deletedBlock.find((message) => message.role === "assistant");
  const snapshot = targetAssistant ? playthrough.snapshots?.[targetAssistant.id] : undefined;

  // Inclusive delete: keep messages[0..index-1]; drop the message and everything after.
  const next: Playthrough = {
    ...playthrough,
    messages: playthrough.messages.slice(0, index)
  };
  restoreSnapshotState(next, snapshot);

  // Permanently drop snapshots belonging to messages that no longer exist.
  const liveMessageIds = new Set(next.messages.map((message) => message.id));
  next.snapshots = Object.fromEntries(
    Object.entries(next.snapshots ?? {}).filter(([messageId]) => liveMessageIds.has(messageId))
  );
  next.updatedAt = new Date().toISOString();
  return next;
}

/**
 * Deletes the given message and everything after it (inclusive). The live
 * chat's own "delete from here".
 */
export function truncateChat(
  dataDir: string,
  playthroughId: string,
  messageId: string,
  imagesDir: string = defaultImagesDir(dataDir)
): EditOutcome {
  const playthrough = getPlaythroughRecord(dataDir, playthroughId);
  if (!playthrough) {
    return { ok: false, status: 404, error: "Playthrough not found" };
  }

  const index = playthrough.messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return { ok: false, status: 404, error: "Message not found" };
  }

  const next = deleteFrom(playthrough, index);
  updatePlaythroughRecord(dataDir, next);

  // Persist FIRST, then collect. The truncated messages took their image refs
  // with them, so any file they alone referenced is now unreferenced and goes;
  // a file a surviving message still references stays. Sweeping before the
  // write would delete files the on-disk record still points at. Best-effort:
  // a failed sweep must never fail the truncate that already happened.
  sweepAfterDeleteForward(dataDir, playthroughId, imagesDir);

  return { ok: true, state: next };
}

/**
 * Reverts to a chapter or to an archived response: the plan (`planRevert`) says
 * what goes, `deleteFrom` performs the delete-and-rewind, and this function
 * finishes the chapter bookkeeping the restore cannot do on its own.
 *
 * Nothing regenerates — no provider is involved, so the revert is instant and
 * cannot fail halfway through a model call. Re-rolling is the live chat's own
 * Retry, one click away on the message that is now live.
 */
export function revertAction(
  dataDir: string,
  playthroughId: string,
  anchor: RevertAnchor,
  imagesDir: string = defaultImagesDir(dataDir)
): EditOutcome {
  const playthrough = getPlaythroughRecord(dataDir, playthroughId);
  if (!playthrough) {
    return { ok: false, status: 404, error: "Playthrough not found" };
  }

  const plan = planRevert(playthrough, anchor);
  if (!plan) {
    return {
      ok: false,
      status: 400,
      error: "That is not an archived chapter or response, so there is nothing to revert to"
    };
  }

  const next = deleteFrom(playthrough, plan.truncationIndex);

  // The turn counter must never end up BELOW a message that survived: reverting a response leaves
  // the player's own message of that turn in place (their input is theirs), and the restored state
  // predates it. The counter acknowledges the surviving message so the next turn cannot reuse its
  // number.
  next.turn = Math.max(next.turn, plan.keptTailTurn);

  // ── Un-archive the chapter the story resumes in ──
  // The tag IS the archive marker: a message still carrying a dropped chapter's id
  // becomes live again, while a hidden message WITHOUT one is a synthetic
  // instruction ("Continue", a chapter opening) and stays hidden.
  const dropped = new Set(plan.droppedChapterIds);
  for (const message of next.messages) {
    if (!message.chapterId || !dropped.has(message.chapterId)) continue;
    delete message.chapterId;
    message.hidden = false;
  }

  // ── Chapter records and the rolling meta-summary ──
  // Runs AFTER the restore on purpose: a chapter-level revert restores the state as
  // the chapter ENDED, which still contains the chapter record this revert is
  // un-closing — so the record has to be filtered out here, not assumed absent.
  next.chapters = (next.chapters ?? []).filter((chapter) => !dropped.has(chapter.id));
  next.storyMetaSummaries = (next.storyMetaSummaries ?? [])
    .map((meta) => ({ ...meta, chapterIds: meta.chapterIds.filter((id) => !dropped.has(id)) }))
    // A meta left with nothing folded into it is only dead weight in the prompt.
    .filter((meta) => meta.chapterIds.length > 0);
  next.currentChapterStartedAtTurn = plan.currentChapterStartedAtTurn;

  // ── The approximate path: no snapshot, so the restore rewound nothing ──
  // State only changes on assistant turns, so a deleted block WITHOUT an assistant
  // message needs no rewinding at all (that case is exact, not approximate). When
  // there IS one and it has no snapshot, the history reverts and the world does
  // not — so the events the deleted turns recorded are pruned by turn instead.
  if (plan.approximate) {
    next.turn = plan.keptTailTurn;
    const survive = <T extends { turn: number }>(event: T) => event.turn <= plan.keptTailTurn;
    next.memoryEvents = next.memoryEvents.filter(survive);
    if (next.memoryLayers) {
      next.memoryLayers = {
        recent: next.memoryLayers.recent.filter(survive),
        compressed: next.memoryLayers.compressed.filter(survive)
      };
    }
  }

  // A surviving event tagged with a dropped chapter belongs to the running chapter
  // now. A no-op on the restored path, where those tags were never set yet.
  const untag = <T extends { chapterId?: string }>(event: T) => {
    if (event.chapterId && dropped.has(event.chapterId)) delete event.chapterId;
    return event;
  };
  next.memoryEvents.forEach(untag);
  next.memoryLayers?.recent.forEach(untag);
  next.memoryLayers?.compressed.forEach(untag);

  updatePlaythroughRecord(dataDir, next);

  // Same ordering rule as truncateChat: record first, images second.
  sweepAfterDeleteForward(dataDir, playthroughId, imagesDir);

  return { ok: true, state: next };
}

/** Persist has already happened for both callers — this is the best-effort half. */
function sweepAfterDeleteForward(dataDir: string, playthroughId: string, imagesDir: string): void {
  try {
    sweepOrphansInDataDir(dataDir, imagesDir);
  } catch (error) {
    console.warn(`[images] orphan sweep after deleting forward in playthrough ${playthroughId} failed:`, error);
  }
}

export function buildOpeningPrompt(scenarioDescription: string | undefined, seed: ScenarioSeed): string {
  const parts: string[] = [];
  if (scenarioDescription?.trim()) parts.push(`World context: ${scenarioDescription.trim()}`);
  const start = seed.locations[0];
  if (start) parts.push(`You are opening at "${start.name}" — ${start.description}`);
  parts.push(
    "Introduce the scene to the player character. Establish the atmosphere and immediate surroundings. " +
    "Write in second person. Do not take actions on behalf of the player. " +
    "End by presenting the current moment as an invitation for the player to act."
  );
  return parts.join("\n\n");
}
