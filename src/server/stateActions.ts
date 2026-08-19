import { randomUUID } from "node:crypto";
import { applyStatePatch } from "../engine/engine";
import { ensureAllSections, seedMemorySummary, summaryFromContent } from "../engine/characterSections";
import type { Chapter, ChapterMetaSummary, CharacterTemplate, Playthrough, SimpleNPC } from "../schemas";
import { getCharacterTemplate, getPlaythroughRecord, listCharacterTemplates, saveCharacterTemplateRecord, updatePlaythroughRecord } from "./store";
import { buildLorebookContext, lorebookBudgetChars } from "./lorebookContext";
import { executeTurn } from "./turnActions";
import type { TurnProvider } from "./provider";
import { COMPACT_TRIGGER_COUNT, IMPORTANCE_FLOOR, VERBATIM_CHAPTER_LIMIT } from "./provider";

type ActionFailure = {
  ok: false;
  status: number;
  error: string;
};

export type StateActionOutcome = { ok: true; state: Playthrough; applied: string[]; rejected: string[]; warnings: string[] } | ActionFailure;
export type SaveToLibraryOutcome = { ok: true; template: CharacterTemplate; created: boolean } | ActionFailure;

function load(dataDir: string, playthroughId: string): Playthrough | ActionFailure {
  const playthrough = getPlaythroughRecord(dataDir, playthroughId);
  if (!playthrough) {
    return { ok: false, status: 404, error: "Playthrough not found" };
  }
  return playthrough;
}

function isFailure(value: Playthrough | ActionFailure): value is ActionFailure {
  return "ok" in value && !value.ok;
}

export function questAction(
  dataDir: string,
  playthroughId: string,
  questId: string,
  action: "toggleTracking" | "delete" | "edit",
  name?: string,
  summary?: string
): StateActionOutcome {
  const loaded = load(dataDir, playthroughId);
  if (isFailure(loaded)) return loaded;

  const quest = loaded.quests.find((q) => q.id === questId);
  if (!quest) return { ok: false, status: 404, error: "Quest not found" };

  if (action === "toggleTracking") {
    quest.tracking = !quest.tracking;
    // Auto-remove completed/failed quests when untracked
    if (!quest.tracking && (quest.status === "completed" || quest.status === "failed")) {
      loaded.quests = loaded.quests.filter((q) => q.id !== questId);
    }
  } else if (action === "delete") {
    loaded.quests = loaded.quests.filter((q) => q.id !== questId);
  } else if (action === "edit") {
    if (name !== undefined) quest.name = name;
    if (summary !== undefined) quest.summary = summary;
  }

  loaded.updatedAt = new Date().toISOString();
  updatePlaythroughRecord(dataDir, loaded);
  return { ok: true, state: loaded, applied: [`quest ${action}: ${quest.name}`], rejected: [], warnings: [] };
}

function buildPromoteStoryContext(loaded: Playthrough, npc: SimpleNPC, maxTokens: number): string {
  const parts: string[] = [];
  if (loaded.scenarioDescription) parts.push(`Setting: ${loaded.scenarioDescription}`);

  // NPC's own location (was: player's location — a bug)
  const npcLoc = (loaded.locationCatalog ?? []).find((l) => l.id === npc.locationId);
  if (npcLoc) parts.push(`NPC Location: ${npcLoc.name} — ${npcLoc.description}`);
  const playerLoc = (loaded.locationCatalog ?? []).find((l) => l.id === loaded.locationId);
  if (playerLoc) parts.push(`Player Location: ${playerLoc.name} — ${playerLoc.description}`);

  const pc = loaded.playerCharacter;
  parts.push(`Player Character: ${pc.name} (${pc.bodyType}) — ${pc.description}`);

  if (loaded.characters.length > 0) {
    const cast = loaded.characters.map((c) => {
      const tpl = loaded.characterTemplates.find((t) => t.id === c.templateId);
      const species = tpl?.content.match(/\[Species\]:\s*(.+)/)?.[1] ?? "unknown";
      return `- ${c.name} (${species}): ${c.memorySummary || "no details yet"}`;
    });
    parts.push(`Other Main Cast:\n${cast.join("\n")}`);
  }

  if (loaded.chapters?.length) {
    const recent = loaded.chapters.slice(-3).map((ch) =>
      `- ${ch.name}: ${ch.shortDescription || ch.fullSummary?.slice(0, 200) || ""}`);
    parts.push(`Recent Story:\n${recent.join("\n")}`);
  }

  const haystack = [npc.description, npc.disposition ?? "", loaded.scenarioDescription ?? ""].join(" ");
  const lore = buildLorebookContext(loaded.lorebookIds, haystack, lorebookBudgetChars(maxTokens));
  if (lore) parts.push(lore);

  return parts.join("\n\n");
}

export async function promoteNpcAction(
  dataDir: string,
  playthroughId: string,
  npcId: string,
  provider: TurnProvider,
  acceptedContent?: string,
  maxTokens = 4000,
  signal?: AbortSignal
): Promise<StateActionOutcome> {
  const loaded = load(dataDir, playthroughId);
  if (isFailure(loaded)) return loaded;

  const npc = loaded.npcs.find((n) => n.id === npcId);
  if (!npc) return { ok: false, status: 404, error: "NPC not found" };

  const storyContext = buildPromoteStoryContext(loaded, npc, maxTokens);

  // 1) Generate (only when no approved draft content was supplied)
  let content = acceptedContent;
  if (content === undefined) {
    try {
      content = await provider.generateCharacterSheet(
        { name: npc.name, description: npc.description, disposition: npc.disposition },
        storyContext,
        loaded.promptSettings?.modules.sheet,
        signal
      );
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      return { ok: false, status: 502, error: `Failed to generate character sheet: ${message}` };
    }
  }

  // Client cancelled — don't commit the promotion.
  if (signal?.aborted) {
    return { ok: false, status: 499, error: "Request aborted by the client" };
  }

  // 2) Post-process: fill missing canonical sections, seed memory
  content = ensureAllSections(content);
  const memorySummary = seedMemorySummary(npc.name, content);

  // 3) Apply (single commit — no partial state)
  const result = applyStatePatch(loaded, { npcPromote: { npcId, content, memorySummary } });
  result.state.updatedAt = new Date().toISOString();
  updatePlaythroughRecord(dataDir, result.state);
  return { ok: true, state: result.state, applied: result.applied, rejected: result.rejected, warnings: result.warnings };
}

export type PromoteDraftOutcome =
  | { ok: true; npc: SimpleNPC; content: string; storyContext: string }
  | { ok: false; status: number; error: string };

export async function promoteNpcDraftAction(
  dataDir: string,
  playthroughId: string,
  npcId: string,
  provider: TurnProvider,
  maxTokens = 4000,
  signal?: AbortSignal
): Promise<PromoteDraftOutcome> {
  const loaded = load(dataDir, playthroughId);
  if (isFailure(loaded)) return loaded;
  const npc = loaded.npcs.find((n) => n.id === npcId);
  if (!npc) return { ok: false, status: 404, error: "NPC not found" };

  const storyContext = buildPromoteStoryContext(loaded, npc, maxTokens);
  let content: string;
  try {
    content = await provider.generateCharacterSheet(
      { name: npc.name, description: npc.description, disposition: npc.disposition },
      storyContext,
      loaded.promptSettings?.modules.sheet,
      signal
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, status: 502, error: `Failed to generate character sheet: ${message}` };
  }
  content = ensureAllSections(content);
  return { ok: true, npc, content, storyContext };
}

/**
 * Save a playthrough character's local template into the global library.
 * Name and startingStats sync from the instance's CURRENT state.
 *
 * mode "update": upsert by local template id. First save roots a version
 *   family (lineageId = the template's own id); re-saves overwrite.
 * mode "newVersion": mint a new id in the same family with version = max + 1.
 *   Requires an existing library copy (409 otherwise).
 */
export function saveToLibraryAction(
  dataDir: string,
  playthroughId: string,
  characterId: string,
  mode: "update" | "newVersion" = "update",
  charactersDir?: string
): SaveToLibraryOutcome {
  const loaded = load(dataDir, playthroughId);
  if (isFailure(loaded)) return loaded;

  const character = loaded.characters.find((c) => c.id === characterId);
  if (!character) return { ok: false, status: 404, error: "Character not found in playthrough" };

  const local = loaded.characterTemplates.find((t) => t.id === character.templateId);
  if (!local) return { ok: false, status: 404, error: "No template data for this character" };

  if (mode === "newVersion") {
    const existing = getCharacterTemplate(local.id, charactersDir);
    if (!existing) {
      return { ok: false, status: 409, error: "No library copy exists — save to the library first" };
    }
    const lineageId = existing.lineageId ?? existing.id;
    const family = listCharacterTemplates(charactersDir).filter((t) => (t.lineageId ?? t.id) === lineageId);
    const nextVersion = Math.max(...family.map((t) => t.version)) + 1;
    const template: CharacterTemplate = {
      ...structuredClone(local),
      id: `char_${randomUUID()}`,
      lineageId,
      version: nextVersion,
      name: character.name,
      summary: local.summary || summaryFromContent(local.content),
      startingClothing: (character.clothing ?? []).map((c) => ({ slot: c.slot, name: c.name })),
    };
    saveCharacterTemplateRecord(template, charactersDir);
    return { ok: true, template, created: true };
  }

  const existing = getCharacterTemplate(local.id, charactersDir);
  const template: CharacterTemplate = {
    ...structuredClone(local),
    lineageId: existing ? (existing.lineageId ?? existing.id) : local.id,
    name: character.name,
    summary: local.summary || summaryFromContent(local.content),
    startingClothing: (character.clothing ?? []).map((c) => ({ slot: c.slot, name: c.name })),
  };
  saveCharacterTemplateRecord(template, charactersDir);
  return { ok: true, template, created: !existing };
}

export type CloseChapterResult = { ok: true; state: Playthrough } | ActionFailure;
export type ResummarizeChapterResult = { ok: true; state: Playthrough } | ActionFailure;

/**
 * Hardcoded instruction used to open a new chapter after the previous one is
 * archived. Story-so-far (chapter summaries) and current world state are
 * injected separately by buildUserPrompt, so this only needs to frame the
 * transition.
 *
 * TODO: make this editable via a preset module, alongside the
 * scenario-generation opening prompt (seed modules).
 */
const CHAPTER_OPENING_INSTRUCTION =
  "A new chapter begins. The previous chapter has been archived and summarized — read the STORY SO FAR and CURRENT STATE to pick up exactly where things left off. " +
  "Write an opening that resumes the story seamlessly: ground the player in their current location and situation, acknowledge what just happened where relevant, and end by presenting the current moment as an invitation for the player to act. " +
  "Do not take actions on behalf of the player. Write in second person.";

/**
 * Roll older chapters into the single rolling meta-summary so the injected
 * `STORY SO FAR` section stays bounded. Mutates `loaded` in place.
 *
 * Mechanics (Summaryception-style single consolidation tier):
 * - Only `VERBATIM_CHAPTER_LIMIT` most-recent uncompacted chapters stay verbatim.
 * - When uncompacted chapters exceed that, the oldest overflow folds into the meta.
 * - First fold = SEED: promotes the oldest chapter's fullSummary directly, NO
 *   provider call (preserves maximum information as the foundation).
 * - Later folds = delta: the provider compacts against the existing meta-summary,
 *   with high-importance memory events passed in verbatim (deterministic floor).
 * - Non-destructive: chapters are never deleted; only which ones are injected
 *   changes. On provider failure we still fold the ids (chapterIds + turnRange)
 *   but keep the prior summary text — still a coherent state; next fold recovers.
 */
async function foldOldestChaptersIntoMetaSummaries(
  loaded: Playthrough,
  provider: TurnProvider,
  signal?: AbortSignal
): Promise<void> {
  loaded.storyMetaSummaries = loaded.storyMetaSummaries ?? [];
  const foldedIds = new Set(loaded.storyMetaSummaries.flatMap((m) => m.chapterIds));
  const uncompacted = (loaded.chapters ?? [])
    .filter((ch) => !foldedIds.has(ch.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt)); // oldest first

  if (uncompacted.length <= VERBATIM_CHAPTER_LIMIT) return;

  const overflowCount = uncompacted.length - VERBATIM_CHAPTER_LIMIT;
  const oldestOverflow = uncompacted.slice(0, overflowCount);

  let target: ChapterMetaSummary;
  let remainingToFold: Chapter[];

  if (loaded.storyMetaSummaries.length === 0) {
    // ── SEED ── promote the oldest chapter directly, no LLM call ──
    const seedChapter = oldestOverflow[0];
    target = {
      id: `mch_${randomUUID()}`,
      chapterIds: [seedChapter.id],
      turnRange: { start: seedChapter.turnRange.start, end: seedChapter.turnRange.end },
      summary: seedChapter.fullSummary,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };
    loaded.storyMetaSummaries.push(target);
    remainingToFold = oldestOverflow.slice(1);
  } else {
    target = loaded.storyMetaSummaries[loaded.storyMetaSummaries.length - 1];
    remainingToFold = oldestOverflow;
  }

  if (remainingToFold.length === 0) return;

  // Collect high-importance memory events across all layers for the folded chapters.
  const targetChapterIds = new Set(remainingToFold.map((ch) => ch.id));
  const eventMap = new Map<string, Playthrough["memoryEvents"][number]>();
  for (const layer of [
    loaded.memoryEvents,
    loaded.memoryLayers?.recent ?? [],
    loaded.memoryLayers?.compressed ?? []
  ]) {
    for (const e of layer) {
      if (e.chapterId && targetChapterIds.has(e.chapterId) && e.importance >= IMPORTANCE_FLOOR) {
        eventMap.set(e.id, e);
      }
    }
  }
  const importantEvents = [...eventMap.values()].map((e) => ({
    type: e.type,
    summary: e.summary,
    importance: e.importance,
    turn: e.turn
  }));

  try {
    const result = await provider.compactStorySoFar({
      priorSummary: target.summary,
      chapterTranscriptions: remainingToFold.map((ch) => ({ name: ch.name, fullSummary: ch.fullSummary })),
      importantEvents
    }, loaded.promptSettings?.modules.summary, signal);
    target.summary = result.summary;
  } catch (error) {
    // Degrade-and-warn: still fold the ids so the verbatim window shrinks, but
    // keep the prior summary text. The folded chapters are still whole in the
    // Journal; the next successful fold merges their content in.
    console.error(`foldOldestChaptersIntoMetaSummaries: compaction failed for ${loaded.id}: ${error instanceof Error ? error.message : String(error)}`);
  }

  // Fold ids into the target meta and extend its turn range, regardless of
  // whether the summary call succeeded. oldestOverflow covers everything to fold
  // in this pass (in the seed case the seed chapter is already in target).
  for (const ch of oldestOverflow) {
    if (target.chapterIds.includes(ch.id)) continue;
    target.chapterIds.push(ch.id);
  }
  const allFolded = (loaded.chapters ?? []).filter((ch) => target.chapterIds.includes(ch.id));
  const starts = allFolded.map((ch) => ch.turnRange.start);
  const ends = allFolded.map((ch) => ch.turnRange.end);
  // Merge the target's EXISTING span: it may cover chapters archived in earlier
  // passes (e.g. a seeded meta whose chapters are no longer in loaded.chapters).
  // Without this, a subsequent fold collapses the range to only the newly folded
  // chapters (e.g. {2,2} instead of {1,2}).
  starts.push(target.turnRange.start);
  ends.push(target.turnRange.end);
  if (starts.length > 0) {
    target.turnRange.start = Math.min(...starts);
    target.turnRange.end = Math.max(...ends);
  }
  target.updatedAt = new Date().toISOString();
}

/**
 * Archives the current chat into a Chapter record, then generates an opening
 * assistant message for the new chapter (so the chat is never empty and the
 * opening can be edited / retried like any other assistant turn).
 *
 * The caller obtains { name, shortDescription, fullSummary } from the provider
 * before calling this function. This function then makes a second provider
 * call (via executeTurn) to produce the opening narrative.
 */
export async function closeChapterAction(
  dataDir: string,
  playthroughId: string,
  summary: { name: string; shortDescription: string; fullSummary: string },
  provider: TurnProvider,
  suggestedChoicesEnabled: boolean,
  contextWindow: number = 65536,
  signal?: AbortSignal,
  summaryDurationMs?: number
): Promise<CloseChapterResult> {
  const loaded = load(dataDir, playthroughId);
  if (isFailure(loaded)) return loaded;

  const chapterStartTurn = loaded.currentChapterStartedAtTurn ?? 1;
  loaded.chapters = loaded.chapters ?? [];

  // Collect non-hidden messages that don't have a chapterId yet (current session)
  const msgsToArchive = loaded.messages.filter(m => !m.hidden && !m.chapterId);

  if (msgsToArchive.length < 6) {
    return { ok: false, status: 400, error: "Need at least 6 messages before closing a chapter. Play a bit longer!" };
  }

  // Collect memory events across all layers in the chapter's turn range.
  // Dedup by id — an event might appear in multiple layers (memoryEvents +
  // a memory layer that hasn't been fully synced).
  const eventsMap = new Map<string, (typeof loaded.memoryEvents)[number]>();
  for (const layer of [
    loaded.memoryEvents,
    loaded.memoryLayers?.recent ?? [],
    loaded.memoryLayers?.compressed ?? [],
  ]) {
    for (const e of layer) {
      if (e.turn >= chapterStartTurn) eventsMap.set(e.id, e);
    }
  }
  const eventsToTag = [...eventsMap.values()];

  // Create the chapter
  const chapter: Chapter = {
    id: `ch_${randomUUID()}`,
    name: summary.name,
    shortDescription: summary.shortDescription,
    fullSummary: summary.fullSummary,
    turnRange: { start: chapterStartTurn, end: loaded.turn },
    messageIds: msgsToArchive.map(m => m.id),
    memoryEventIds: eventsToTag.map(e => e.id),
    createdAt: new Date().toISOString(),
    summaryDurationMs
  };

  // Tag messages with chapterId and hide them
  for (const msg of msgsToArchive) {
    msg.chapterId = chapter.id;
    msg.hidden = true;
  }

  // Tag memory events with chapterId — but only events that aren't already
  // attributed to a chapter. An event with an existing chapterId belongs to an
  // older chapter (e.g. one being folded into a meta-summary); overwriting it
  // here would break that chapter's event attribution.
  for (const evt of eventsToTag) {
    if (evt.chapterId) continue;
    evt.chapterId = chapter.id;
  }

  // Append chapter and reset counter
  loaded.chapters.push(chapter);
  loaded.currentChapterStartedAtTurn = loaded.turn + 1;
  loaded.updatedAt = new Date().toISOString();

  // Roll older chapters into the single rolling meta-summary (auto-compact).
  // Runs after events are tagged so the compaction can pick up their chapterId.
  // Safe to be standalone — it mutates `loaded` in place and degrades on failure.
  await foldOldestChaptersIntoMetaSummaries(loaded, provider, signal);

  // ── Stale background-NPC pruning (Phase E) ──
  // An NPC is stale when, across the closing chapter, it was never named in a
  // message, never referenced by a memory event, and never at a location the
  // player visited. Background cast only — main cast (characters[]) is never a
  // candidate.
  const visitedLocations = new Set<string>();
  for (let t = chapterStartTurn; t <= loaded.turn; t++) {
    const snap = loaded.snapshots?.[String(t)];
    if (snap) visitedLocations.add(snap.locationId);
  }
  // Runtime snapshots are keyed by assistant message id (each records the turn
  // it was taken on) — also honor those whose turn falls inside the chapter.
  for (const snap of Object.values(loaded.snapshots ?? {})) {
    if (snap.turn >= chapterStartTurn && snap.turn <= loaded.turn) {
      visitedLocations.add(snap.locationId);
    }
  }
  if (visitedLocations.size === 0) visitedLocations.add(loaded.locationId); // snapshot-less fallback

  const chapterText = msgsToArchive.map((m) => m.content).join("\n").toLowerCase();
  const eventText = eventsToTag
    .map((e) => `${e.summary} ${e.tags.join(" ")}`)
    .join("\n")
    .toLowerCase();

  const staleNpcs = loaded.npcs.filter((npc) => {
    const name = npc.name.toLowerCase();
    return !chapterText.includes(name)
        && !eventText.includes(name)
        && !visitedLocations.has(npc.locationId);
  });

  if (staleNpcs.length > 0) {
    const names = staleNpcs.map((n) => n.name);
    loaded.npcs = loaded.npcs.filter((n) => !staleNpcs.includes(n));
    loaded.messages.push({
      id: `msg_${randomUUID()}`,
      role: "system",
      content: `Some background characters faded from the story: ${names.join(", ")}.`,
      createdAt: new Date().toISOString()
    });
  }

  updatePlaythroughRecord(dataDir, loaded);

  // ── Generate the opening assistant message for the new chapter ──
  // The synthetic user instruction is hidden (not deleted) so retryAssistantTurn
  // can still find a preceding user message and a snapshot to restore. The
  // assistant message is flagged chapterOpening so the chat UI can show the
  // "Re-summarize previous chapter" action on it.
  try {
    const openingResult = await executeTurn(
      loaded,
      CHAPTER_OPENING_INSTRUCTION,
      provider,
      suggestedChoicesEnabled,
      contextWindow,
      { hideUserMessage: true, chapterOpening: true, ...(signal ? { signal } : {}) }
    );
    updatePlaythroughRecord(dataDir, openingResult.state);
    return { ok: true, state: openingResult.state };
  } catch (error) {
    // The chapter was archived successfully even if the opening failed — the
    // caller still gets the archived state back so progress isn't lost. The
    // chat will just be empty until the player sends the next message.
    const message = error instanceof Error ? error.message : "Chapter opening generation failed";
    console.error(`closeChapterAction: opening generation failed for ${playthroughId}: ${message}`);
    return { ok: true, state: loaded };
  }
}

/**
 * Re-runs the provider's chapter summarizer on an already-archived chapter and
 * updates the chapter record's name/shortDescription/fullSummary. Does NOT
 * touch messages — if the player wants the opening to reflect the new summary,
 * they can hit Retry on the chapter-opening message.
 */
export async function resummarizeChapterAction(
  dataDir: string,
  playthroughId: string,
  chapterId: string,
  provider: TurnProvider,
  signal?: AbortSignal
): Promise<ResummarizeChapterResult> {
  const loaded = load(dataDir, playthroughId);
  if (isFailure(loaded)) return loaded;

  const chapter = (loaded.chapters ?? []).find(ch => ch.id === chapterId);
  if (!chapter) {
    return { ok: false, status: 404, error: "Chapter not found" };
  }

  // Rebuild the transcript from the archived message ids.
  const idSet = new Set(chapter.messageIds);
  const transcript = loaded.messages
    .filter(m => idSet.has(m.id))
    .map(m => m.role.toUpperCase() + ": " + m.content)
    .join("\n");

  if (!transcript.trim()) {
    return { ok: false, status: 400, error: "Chapter has no message transcript to summarize" };
  }

  let summary: { name: string; shortDescription: string; fullSummary: string };
  let summaryDurationMs: number | undefined;
  try {
    const summaryStartTime = performance.now();
    summary = await provider.summarizeChapter(transcript, loaded.promptSettings?.modules.summary, signal);
    summaryDurationMs = Math.round(performance.now() - summaryStartTime);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Chapter re-summarization failed";
    return { ok: false, status: 502, error: message };
  }

  // Client cancelled — don't persist the rewritten summary.
  if (signal?.aborted) {
    return { ok: false, status: 499, error: "Request aborted by the client" };
  }

  const now = new Date().toISOString();
  chapter.name = summary.name;
  chapter.shortDescription = summary.shortDescription;
  chapter.fullSummary = summary.fullSummary;
  chapter.updatedAt = now;
  chapter.summaryDurationMs = summaryDurationMs;
  loaded.updatedAt = now;
  updatePlaythroughRecord(dataDir, loaded);

  return { ok: true, state: loaded };
}
