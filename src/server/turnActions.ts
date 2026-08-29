import { randomUUID } from "node:crypto";
import {
  applyStatePatch,
  ghostOldMessages,
  moveEventsToCompressed,
  needsCompression,
  parseUserInput,
  scanLorebooks,
  takeTurnSnapshot,
  updateTimingStates
} from "../engine/engine";
import type { Playthrough, ScenarioSeed } from "../schemas";
import type { EntryTimingState, LorebookEntry, TurnSnapshot } from "../schemas";
import type { TurnProvider } from "./provider";
import type { PromptUsageBreakdown } from "./provider";
import { getLorebook, getPlaythroughRecord, updatePlaythroughRecord } from "./store";

export type TokenBreakdown = PromptUsageBreakdown;

export type TokenUsage = {
  estimated: number;
  contextWindow: number;
  breakdown: TokenBreakdown;
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
  options?: TurnOptions
): Promise<TurnExecution> {
  const snapshot = takeTurnSnapshot(playthrough);
  const parsedInput = parseUserInput(input);
  const startTime = performance.now();
  const { turn: assistantTurn, promptUsage, model, rawInput, rawOutput, finishReason } = await provider.generateTurn(parsedInput, playthrough, suggestedChoicesEnabled, options?.signal);
  const durationMs = Math.round(performance.now() - startTime);

  const patchResult = assistantTurn.statePatch
    ? applyStatePatch(playthrough, assistantTurn.statePatch)
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
  // Guard against blank narratives from any provider path — an empty string
  // (or whitespace) must never become an invisible chat message.
  const narrative = assistantTurn.narrative.trim() ? assistantTurn.narrative : "The provider returned an empty response.";
  next.messages.push(
    {
      id: `msg_${randomUUID()}`,
      role: "user",
      content: input,
      createdAt: now,
      ...(options?.hideUserMessage ? { hidden: true } : {})
    },
    {
      id: assistantMessageId,
      role: "assistant",
      content: narrative,
      createdAt: now,
      durationMs,
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

  // Auto-compression: when context nears threshold, ghost old messages and compress their events
  if (needsCompression(next)) {
    const ghosted = ghostOldMessages(next);
    const compressed = moveEventsToCompressed(ghosted);
    Object.assign(next, {
      messages: compressed.messages,
      memoryLayers: compressed.memoryLayers,
      memoryEvents: compressed.memoryEvents,
      updatedAt: compressed.updatedAt
    });
  }

  // ── Token usage: real measurement from the provider, or fixed fallback estimate ──
  const castPresence = {
    present: next.characters.filter((c) => c.currentLocationId === next.locationId).length,
    absent: next.characters.filter((c) => c.currentLocationId !== next.locationId).length,
  };
  const tokenUsage: TokenUsage = promptUsage
    ? { estimated: promptUsage.estimated, contextWindow, breakdown: promptUsage.breakdown, castPresence }
    : estimateTokenUsageFallback(next, input, contextWindow);

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
function estimateTokenUsageFallback(state: Playthrough, input: string, contextWindow: number): TokenUsage {
  const est = (text: string) => Math.ceil(text.length / 4);

  const moduleContent = Object.values(state.promptSettings?.modules ?? {})
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

  const recentMessages = state.messages
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
    recentMessages: est(recentMessages),
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
 * Restores a playthrough's world state from a pre-turn snapshot, in place.
 * Shared by retryAssistantTurn (regenerate after truncation) and truncateChat
 * (truncate only). Snapshots hold no message content, so restoring never
 * touches the message list. No-op when the snapshot is absent — the caller's
 * live state stands (graceful degradation for legacy records).
 */
function restoreSnapshotState(target: Playthrough, snapshot: TurnSnapshot | undefined): void {
  if (!snapshot) return;
  target.turn = snapshot.turn;
  target.locationId = snapshot.locationId;
  target.flags = structuredClone(snapshot.flags);
  target.playerCharacter = structuredClone(snapshot.playerCharacter);
  target.characters = structuredClone(snapshot.characters);
  target.characterTemplates = structuredClone(snapshot.characterTemplates);
  target.npcs = structuredClone(snapshot.npcs);
  target.inventory = structuredClone(snapshot.inventory);
  target.quests = structuredClone(snapshot.quests);
  target.memoryEvents = structuredClone(snapshot.memoryEvents);
  target.lorebookIds = snapshot.lorebookIds ?? [];
  target.lorebookTimingStates = snapshot.lorebookTimingStates
    ? structuredClone(snapshot.lorebookTimingStates)
    : undefined;
  target.locationCatalog = structuredClone(snapshot.locationCatalog ?? []);
  target.itemCatalog = snapshot.itemCatalog
    ? structuredClone(snapshot.itemCatalog)
    : undefined;
  target.chapters = structuredClone(snapshot.chapters ?? []);
  target.storyMetaSummaries = structuredClone(snapshot.storyMetaSummaries ?? []);
  target.currentChapterStartedAtTurn = snapshot.currentChapterStartedAtTurn ?? 1;
}

/**
 * Retries an assistant response: truncates the chat back to just before the
 * user message of that turn, restores the snapshotted world state (when one
 * exists), permanently discards everything after, then re-runs the turn.
 */
export async function retryAssistantTurn(
  dataDir: string,
  playthroughId: string,
  assistantMessageId: string,
  provider: TurnProvider,
  suggestedChoicesEnabled: boolean,
  contextWindow: number = 65536,
  signal?: AbortSignal
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

  let userIndex = -1;
  for (let index = assistantIndex - 1; index >= 0; index -= 1) {
    if (playthrough.messages[index].role === "user") {
      userIndex = index;
      break;
    }
  }
  if (userIndex === -1) {
    return { ok: false, status: 400, error: "No user message exists before this response" };
  }

  const userInput = playthrough.messages[userIndex].content;
  const snapshot = playthrough.snapshots?.[assistantMessageId];

  // Preserve chapter-opening flags on retry: if the original assistant message
  // was a chapter opening, the regenerated one must be too; likewise the
  // synthetic user instruction stays hidden.
  const originalAssistant = playthrough.messages[assistantIndex];
  const originalUser = playthrough.messages[userIndex];
  const retryOptions: TurnOptions | undefined =
    originalAssistant.chapterOpening || originalUser.hidden
      ? {
          chapterOpening: originalAssistant.chapterOpening ?? false,
          hideUserMessage: originalUser.hidden ?? false
        }
      : undefined;

  const base: Playthrough = {
    ...playthrough,
    messages: playthrough.messages.slice(0, userIndex)
  };

  restoreSnapshotState(base, snapshot);

  const result = await executeTurn(
    base,
    userInput,
    provider,
    suggestedChoicesEnabled,
    contextWindow,
    retryOptions ? { ...retryOptions, ...(signal ? { signal } : {}) } : signal ? { signal } : undefined
  );

  // Client cancelled — drop the regenerated turn without persisting it.
  if (signal?.aborted) {
    return { ok: false, status: 499, error: "Request aborted by the client" };
  }

  // Permanently drop snapshots belonging to messages that no longer exist.
  const liveMessageIds = new Set(result.state.messages.map((message) => message.id));
  result.state.snapshots = Object.fromEntries(
    Object.entries(result.state.snapshots ?? {}).filter(([messageId]) => liveMessageIds.has(messageId))
  );

  updatePlaythroughRecord(dataDir, result.state);
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

/**
 * Deletes the given message and everything after it (inclusive), restoring the
 * world state to the snapshot of the first assistant message in the deleted
 * block — that snapshot is the pre-turn state right after the new last message.
 * When the deleted block holds no assistant message (nothing happened after the
 * new last message), the live state already reflects the truncation. Permanently
 * discards the deleted messages and their snapshots; no regeneration.
 */
export function truncateChat(
  dataDir: string,
  playthroughId: string,
  messageId: string
): EditOutcome {
  const playthrough = getPlaythroughRecord(dataDir, playthroughId);
  if (!playthrough) {
    return { ok: false, status: 404, error: "Playthrough not found" };
  }

  const index = playthrough.messages.findIndex((message) => message.id === messageId);
  if (index === -1) {
    return { ok: false, status: 404, error: "Message not found" };
  }

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

  updatePlaythroughRecord(dataDir, next);
  return { ok: true, state: next };
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
