import type { EntryTimingState, LorebookEntry, MemoryEvent, MemoryLayers, Playthrough } from "../schemas";

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

const MEMORY_RETRIEVAL_BUDGET = 800;
const GHOST_BATCH_SIZE = 10;
const GHOST_THRESHOLD = 25;

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || b.length === 0 || a.length !== b.length) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

interface ScoredEvent {
  event: MemoryEvent;
  score: number;
}

function scoreEventKeyword(event: MemoryEvent, state: Playthrough): number {
  const characterIds = new Set(state.characters.map((c) => c.id));
  const characterNames = new Set(state.characters.map((c) => c.name.toLowerCase()));
  const locationId = state.locationId;
  const questIds = new Set(state.quests.map((q) => q.id));
  const flagSet = new Set(state.flags);

  let score = event.importance * 3;

  if (event.characterInstanceId && characterIds.has(event.characterInstanceId)) score += 8;
  for (const tag of event.tags) {
    if (characterNames.has(tag.toLowerCase())) score += 6;
    if (tag === locationId) score += 5;
    if (questIds.has(tag)) score += 4;
    if (flagSet.has(tag)) score += 4;
  }

  score += Math.min(event.turn / 5, 5);

  return score;
}

export function retrieveMemoriesVector(
  state: Playthrough,
  queryEmbedding: number[]
): string {
  const eventMap = new Map<string, MemoryEvent>();
  for (const layer of [
    state.memoryEvents,
    state.memoryLayers?.recent ?? [],
    state.memoryLayers?.compressed ?? [],
  ]) {
    for (const e of layer) {
      eventMap.set(e.id, e);
    }
  }

  const allEvents = [...eventMap.values()];
  if (allEvents.length === 0) return "";

  const scored: ScoredEvent[] = [];

  for (const event of allEvents) {
    let score = scoreEventKeyword(event, state);

    if (event.embedding && event.embedding.length > 0 && queryEmbedding.length > 0) {
      const similarity = cosineSimilarity(queryEmbedding, event.embedding);
      score += similarity * 10;
    }

    scored.push({ event, score });
  }

  scored.sort((a, b) => b.score - a.score);

  let estimatedTokens = 0;
  const selected: string[] = [];

  for (const { event } of scored) {
    const wordCount = event.summary.split(/\s+/).length;
    const eventTokens = wordCount * 4 + 10;
    if (estimatedTokens + eventTokens > MEMORY_RETRIEVAL_BUDGET) break;
    selected.push(`[T${event.turn}] ${event.summary}`);
    estimatedTokens += eventTokens;
  }

  return selected.length > 0
    ? "RELEVANT MEMORIES:\n" + selected.map((s) => `- ${s}`).join("\n")
    : "";
}

/** @deprecated Use retrieveMemoriesVector with a query embedding. */
export function retrieveMemories(
  _layers: MemoryLayers | undefined,
  state: Playthrough,
  _budget?: number
): string {
  return retrieveMemoriesVector(state, []);
}

export function needsCompression(playthrough: Playthrough, threshold: number = GHOST_THRESHOLD): boolean {
  return playthrough.messages.filter((m) => !m.hidden).length > threshold;
}

export function ghostOldMessages(playthrough: Playthrough, batchSize: number = GHOST_BATCH_SIZE): Playthrough {
  const next = clone(playthrough);
  const visible = next.messages.filter((m) => !m.hidden);
  if (visible.length <= GHOST_THRESHOLD) return next;

  const toGhost = visible.slice(0, Math.min(batchSize, visible.length - GHOST_THRESHOLD));
  for (const msg of toGhost) {
    msg.hidden = true;
  }

  return next;
}

export function moveEventsToCompressed(playthrough: Playthrough): Playthrough {
  const next = clone(playthrough);
  if (!next.memoryLayers) {
    next.memoryLayers = { recent: next.memoryEvents, compressed: [] };
  }

  const recentEvents = next.memoryLayers.recent;
  if (recentEvents.length === 0) return next;

  const allCompressed = [...next.memoryLayers.compressed, ...recentEvents];
  next.memoryLayers.compressed = allCompressed.slice(-50);
  next.memoryLayers.recent = [];
  next.memoryEvents = [];

  next.updatedAt = nowIso();
  return next;
}

export interface ActivatedEntry {
  entry: LorebookEntry;
  matchedKeys: string[];
  activationSource: "keyword" | "constant" | "sticky";
}

export interface LorebookScanOptions {
  messages: Array<{ role: string; content: string }>;
  entries: LorebookEntry[];
  lorebookDefaults: { scanDepth: number; caseSensitive: boolean; matchWholeWords: boolean };
  timingStates?: Map<number, EntryTimingState>;
  currentMessageIndex?: number;
}

function buildScanText(messages: Array<{ role: string; content: string }>, scanDepth: number): string {
  if (scanDepth <= 0) return messages.map(m => m.content).join("\n");
  return messages.slice(-scanDepth).map(m => m.content).join("\n");
}

function checkTiming(entry: LorebookEntry, timing?: EntryTimingState): boolean {
  if (!timing) return !(entry.delay > 0);
  if (entry.delay > 0 && timing.delayRemaining > 0) return false;
  if (entry.cooldown > 0 && timing.cooldownRemaining > 0) return false;
  return true;
}

function passesProbability(entry: LorebookEntry): boolean {
  if (!entry.useProbability || entry.probability >= 100) return true;
  return Math.random() * 100 < entry.probability;
}

function matchSingleKey(
  key: string,
  text: string,
  options: { caseSensitive: boolean; matchWholeWords: boolean; useRegex: boolean }
): boolean {
  const trimmed = key.trim();
  if (!trimmed) return false;

  try {
    if (options.useRegex) {
      const flags = options.caseSensitive ? "g" : "gi";
      return new RegExp(trimmed, flags).test(text);
    }

    const needle = options.caseSensitive ? trimmed : trimmed.toLowerCase();
    const haystack = options.caseSensitive ? text : text.toLowerCase();

    if (options.matchWholeWords) {
      const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      const boundaryRegex = new RegExp(`(?<!\\p{L}|\\p{N}|_)${escaped}(?!\\p{L}|\\p{N}|_)`, "u");
      return boundaryRegex.test(haystack);
    }

    return haystack.includes(needle);
  } catch {
    return text.toLowerCase().includes(trimmed.toLowerCase());
  }
}

function matchPrimaryKeys(
  keys: string[],
  text: string,
  options: { caseSensitive: boolean; matchWholeWords: boolean; useRegex: boolean }
): { matched: boolean; matchedKeys: string[] } {
  const matchedKeys: string[] = [];
  for (const key of keys) {
    if (matchSingleKey(key, text, options)) {
      matchedKeys.push(key);
    }
  }
  return { matched: matchedKeys.length > 0, matchedKeys };
}

function matchSecondaryKeys(
  secondaryKeys: string[],
  text: string,
  logic: number,
  options: { caseSensitive: boolean; matchWholeWords: boolean; useRegex: boolean }
): boolean {
  if (secondaryKeys.length === 0) return true;

  const results = secondaryKeys.map(k => matchSingleKey(k, text, options));
  const hasAny = results.some(Boolean);
  const hasAll = results.every(Boolean);

  switch (logic) {
    case 0: return hasAny;
    case 1: return !hasAll;
    case 2: return !hasAny;
    case 3: return hasAll;
    default: return hasAny;
  }
}

export function scanLorebooks(options: LorebookScanOptions): ActivatedEntry[] {
  const { messages, entries, lorebookDefaults, timingStates } = options;
  const activated: ActivatedEntry[] = [];

  const sorted = [...entries]
    .filter(e => !e.disable)
    .sort((a, b) => a.order - b.order);

  for (const entry of sorted) {
    const timing = timingStates?.get(entry.uid);
    if (!checkTiming(entry, timing)) continue;

    if (timing && timing.stickyCount > 0) {
      activated.push({
        entry,
        matchedKeys: ["[sticky]"],
        activationSource: "sticky",
      });
      continue;
    }

    if (entry.constant) {
      if (!passesProbability(entry)) continue;
      activated.push({
        entry,
        matchedKeys: ["[constant]"],
        activationSource: "constant",
      });
      continue;
    }

    if (!entry.key || entry.key.length === 0) continue;

    const scanDepth = entry.scanDepth ?? lorebookDefaults.scanDepth;
    const scanText = buildScanText(messages, scanDepth);

    const matchOpts = {
      caseSensitive: entry.caseSensitive,
      matchWholeWords: entry.matchWholeWords,
      useRegex: entry.useRegex,
    };

    const { matched, matchedKeys } = matchPrimaryKeys(entry.key, scanText, matchOpts);
    if (!matched) continue;

    if (entry.selective && entry.keysecondary.length > 0) {
      if (!matchSecondaryKeys(entry.keysecondary, scanText, entry.selectiveLogic, matchOpts)) continue;
    }

    if (!passesProbability(entry)) continue;

    activated.push({
      entry,
      matchedKeys,
      activationSource: "keyword",
    });
  }

  return activated.sort((a, b) => a.entry.order - b.entry.order);
}

export function updateTimingStates(
  entries: LorebookEntry[],
  activatedEntries: ActivatedEntry[],
  previousStates: Map<number, EntryTimingState>,
  currentMessageIndex: number,
): Map<number, EntryTimingState> {
  const nextStates = new Map<number, EntryTimingState>();
  const activatedUids = new Set(activatedEntries.map(a => a.entry.uid));

  for (const entry of entries) {
    if (entry.sticky <= 0 && entry.cooldown <= 0 && entry.delay <= 0) continue;

    const prev = previousStates.get(entry.uid);
    const state: EntryTimingState = prev
      ? { ...prev }
      : {
          lastActivatedAt: null,
          stickyCount: 0,
          cooldownRemaining: 0,
          delayRemaining: entry.delay > 0 ? entry.delay : 0,
        };

    const wasActivated = activatedUids.has(entry.uid) &&
      !activatedEntries.find(a => a.entry.uid === entry.uid && a.activationSource === "sticky");

    if (wasActivated) {
      state.lastActivatedAt = currentMessageIndex;
      state.stickyCount = entry.sticky > 0 ? entry.sticky : 0;
      state.cooldownRemaining = entry.cooldown > 0 ? entry.cooldown : 0;
      state.delayRemaining = 0;
    } else {
      if (state.delayRemaining > 0) state.delayRemaining--;
      if (state.stickyCount > 0) {
        state.stickyCount--;
      } else if (state.cooldownRemaining > 0) {
        state.cooldownRemaining--;
      }
    }

    if (state.stickyCount > 0 || state.cooldownRemaining > 0 || state.delayRemaining > 0) {
      nextStates.set(entry.uid, state);
    }
  }

  return nextStates;
}
