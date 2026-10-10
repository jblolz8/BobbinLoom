import { joinContentSections, splitContentSections, summaryFromContent } from "../../engine/characterSections";
import { formatSectionHeaders, formatSections } from "../../engine/characterFormat";
import { ITEMS } from "../../engine/demoData";
import { retrieveMemoriesVector, scanLorebooks, type ActivatedEntry } from "../../engine/engine";
import { expandMacros, expandUserMacro } from "../../engine/macros";
import type { EntryTimingState, LorebookEntry } from "../../schemas";
import type { CharacterFormat, CharacterInstance, CharacterTemplate, ParsedUserInput, Playthrough, PromptConfig, PromptPresetModule } from "../../schemas";
import type { PromptUsage, PromptUsageBreakdown } from "../provider";
import { VERBATIM_CHAPTER_LIMIT } from "../provider";
import { getLorebook } from "../store";

/**
 * Render one character's sheet blob for the prompt (D6/D9/D10).
 * Every BL sheet's [Clothing] section is dropped (the outfit is rendered as a
 * derived line outside this helper); CCv2 sheets are verbatim raw blobs (no
 * structured clothing). Macros are expanded at prompt-build time only — source
 * and stored data are never modified.
 */
function renderCharacterSheet(tpl: CharacterTemplate | undefined, instance: CharacterInstance, playerName: string): string {
  if (!tpl) return "(no character data)";
  let blob = tpl.content ?? "(no character data)";
  // Structured clothing is the single source of truth, so the [Clothing] section
  // is ALWAYS a generation scaffold and never reaches the prompt. The condition
  // deliberately does not test `instance.clothing.length`: a character wearing
  // nothing is a legitimate state, and gating on it leaked the raw section (and
  // its "(not established)" stub) into the context exactly when the outfit was
  // empty — the case that made a slime girl's own body read as garments.
  if (tpl.format !== "ccv2") {
    const { preamble, sections } = splitContentSections(blob);
    blob = joinContentSections(
      sections.filter((s) => s.header.toLowerCase() !== "clothing"),
      preamble
    );
  }
  return expandMacros(blob, instance.name, playerName); // D10: runtime-only
}

export function summarizePlaythrough(state: Playthrough): string {
  const activeSet = new Set(state.activeCharacters ?? []);
  const activeChars = state.characters.filter((c) => activeSet.has(c.id));
  const inactiveChars = state.characters.filter((c) => !activeSet.has(c.id));

  // Player-owned text can carry {{user}} — a persona description is the usual place —
  // and has no {{char}} owner, so that macro stays literal. The derived Clothing /
  // Conditions / Flags lines below are engine state rather than prose, and are
  // deliberately NOT expanded: a literal "{{" there is user data being displayed.
  const playerName = state.playerCharacter.name;
  const expandPlayer = (text: string) => expandUserMacro(text, playerName);

  const activeCharacterLines = activeChars.map((character) => {
    let clothingLine = "";
    if (character.clothing && character.clothing.length > 0) {
      // The [Clothing] section was already dropped (BL only) inside
      // renderCharacterSheet; only the derived line is built here.
      clothingLine = `Clothing: ${character.clothing.map((c) => `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`).join("; ")}`;
    }

    if (character.templateId) {
      const tpl = state.characterTemplates.find((t) => t.id === character.templateId);
      const contentBlob = renderCharacterSheet(tpl, character, state.playerCharacter.name);

      const runtimeBlock = [
        "[RUNTIME STATE]",
        `Role: ${character.storyRole}`,
        `Mood: ${character.mood}`,
        `Toward Player: ${character.towardPlayer}`,
        clothingLine,
        character.conditions.length > 0 ? `Conditions: ${character.conditions.join(", ")}` : "",
        character.flags.length > 0 ? `Flags: ${character.flags.join(", ")}` : "",
        // The memory anchor is model-written, so it is the one runtime field that can
        // plausibly carry a macro, and it belongs to THIS character — so both macros
        // resolve. mood / towardPlayer / conditions / flags are engine labels, and are
        // deliberately left alone.
        `Memory: ${expandMacros(character.memorySummary, character.name, state.playerCharacter.name)}`,
      ].filter(Boolean).join("\n");

      return [
        `ACTIVE CHARACTER [Detailed Character]: ${character.name} (${character.id})`,
        contentBlob,
        "",
        runtimeBlock,
      ].join("\n");
    } else {
      const runtimeBlock = [
        "[RUNTIME STATE]",
        `Role: ${character.storyRole}`,
        `Mood: ${character.mood}`,
        `Toward Player: ${character.towardPlayer}`,
        clothingLine,
        character.conditions.length > 0 ? `Conditions: ${character.conditions.join(", ")}` : "",
        character.flags.length > 0 ? `Flags: ${character.flags.join(", ")}` : "",
        `Memory: ${expandMacros(character.memorySummary, character.name, state.playerCharacter.name)}`,
      ].filter(Boolean).join("\n");

      return [
        `ACTIVE CHARACTER [Simple Character]: ${character.name} (${character.id})`,
        `Role: ${character.storyRole}`,
        `Description: ${character.description || "(no description)"}`,
        "",
        runtimeBlock,
      ].join("\n");
    }
  });

  const inactiveLines = inactiveChars.map((character) => {
    if (character.templateId) {
      const tpl = state.characterTemplates.find((t) => t.id === character.templateId);
      const summary = expandMacros(tpl?.summary || summaryFromContent(tpl?.content ?? "") || "no details", character.name, state.playerCharacter.name);
      return [
        `- [Detailed Character] ${character.name} (${character.id}) [Role: ${character.storyRole}]`,
        character.towardPlayer !== "neutral" ? ` [${character.towardPlayer}]` : "",
        ` — ${summary}`,
        character.conditions.length > 0 ? `, ${character.conditions.join(", ")}` : "",
        character.flags.length > 0 ? ` [Flags: ${character.flags.join(", ")}]` : "",
      ].join("");
    } else {
      return [
        `- [Simple Character] ${character.name} (${character.id}) [Role: ${character.storyRole}]`,
        character.towardPlayer !== "neutral" ? ` [${character.towardPlayer}]` : "",
        ` — ${character.description || "no details"}`,
        character.conditions.length > 0 ? `, ${character.conditions.join(", ")}` : "",
        character.flags.length > 0 ? ` [Flags: ${character.flags.join(", ")}]` : "",
      ].join("");
    }
  });
  const inactiveBlock = inactiveLines.length > 0
    ? ["INACTIVE CHARACTERS (off-screen — full details withheld):", ...inactiveLines]
    : [];

  const worldStateLines = state.worldState.map((ws) => `- ${ws.id}: ${ws.name} — ${ws.description}`);

  const inventoryLines = state.inventory.map((item) => {
    const def = (state.itemCatalog ?? ITEMS).find((i) => i.id === item.itemId);
    const displayName = def?.name ?? item.itemId;
    return `- ${displayName} x${item.quantity}`;
  });
  const allowedItems = (state.itemCatalog ?? ITEMS).map((item) => item.id).join(", ");

  return [
    `Turn: ${state.turn}`,
    "",
    "PLAYER CHARACTER:",
    `${state.playerCharacter.name} — ${expandPlayer(state.playerCharacter.description)}`,
    `Body: ${expandPlayer(state.playerCharacter.bodyType)}`,
    `Appearance: ${expandPlayer(state.playerCharacter.appearance)}`,
    `Clothing: ${state.playerCharacter.clothing.length ? state.playerCharacter.clothing.map((c) => `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`).join("; ") : "none"}`,
    `Conditions: ${state.playerCharacter.conditions.length ? state.playerCharacter.conditions.join(", ") : "none"}`,
    `Player Flags: ${state.playerCharacter.flags.length ? state.playerCharacter.flags.join(", ") : "none"}`,
    "",
    "ACTIVE CHARACTERS (in the scene):",
    ...(activeCharacterLines.length ? activeCharacterLines : ["(none currently in the scene)"]),
    "",
    ...inactiveBlock,
    ...(inactiveBlock.length > 0 ? [""] : []),
    "Inventory:",
    ...(inventoryLines.length ? inventoryLines : ["- empty"]),
    "",
    "World State:",
    ...(worldStateLines.length ? worldStateLines : ["- none"]),
    "",
    "Allowed IDs:",
    `Items: ${allowedItems}`,
    `Characters: ${state.characters.map((character) => character.id).join(", ")}`
  ].join("\n");
}

type SystemPromptSegments = { modules: number; outputFormat: number; lorebook: number };

export function renderModules(modules: PromptPresetModule[] | undefined): string {
  return (modules ?? [])
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order)
    .map((m) => m.content)
    .join("\n\n");
}

/** Stable, cache-friendly prefix: preset modules then lorebook "before" entries. */
export function buildStableSystemBlock(modules: PromptPresetModule[], lorebookBefore: string): string {
  return [renderModules(modules), lorebookBefore].filter(Boolean).join("\n\n");
}

export function buildSystemPrompt(choicesEnabled: boolean, modules: PromptPresetModule[], lorebookBefore: string, lorebookAfter: string, format?: CharacterFormat): { text: string; segments: SystemPromptSegments } {
  const enabledModules = modules
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order);

  const moduleContents = enabledModules.map((m) => m.content).join("\n\n");
  const lorebookSection = [lorebookBefore, lorebookAfter].filter(Boolean).join("\n\n");
  const outputInstructions = buildOutputContract(choicesEnabled, format);

  const parts = [lorebookSection, moduleContents, outputInstructions].filter(Boolean);
  return {
    text: parts.join("\n\n"),
    segments: {
      modules: moduleContents.length,
      outputFormat: outputInstructions.length,
      lorebook: lorebookSection.length
    }
  };
}

/** Volatile output contract: JSON shape, per-field guidance, choice rules. */
export function buildOutputContract(choicesEnabled: boolean, format?: CharacterFormat): string {
  const sectionHeaders = formatSectionHeaders(format);
  const sectionNamesList = sectionHeaders.join(", ");
  const bulletedSections = formatSections(format)
    .filter((s) => !s.inline)
    .map((s) => s.name)
    .filter((n) => n.toLowerCase() !== "clothing")
    .join(", ");

  const outputInstructions = [
    "",
    "---",
    "OUTPUT FORMAT",
    "Return ONLY a JSON object with this shape:",
    "{",
    '  "narrative": "story text shown to the user",',
    choicesEnabled ? '  "choices": ["optional suggested choice 1", "optional suggested choice 2"],' : "",
    '  "statePatch": {',
    '    "worldStateAdd": [{ "name": "🌧️ Heavy Rain", "description": "A torrential downpour affects visibility." }],',
    '    "worldStateRemove": ["ws_id_or_name"],',
    '    "worldStateUpdate": [{ "id": "ws_id", "name": "🌦️ Light Rain", "description": "The storm has passed, drizzling." }],',
    '    "characterMood": [{ "characterId": "inst_id_or_name", "mood": "nervous" }],',
    '    "characterTowardPlayer": [{ "characterId": "inst_id_or_name", "towardPlayer": "wary" }],',
    '    "characterConditionsAdd": [{ "characterId": "inst_id_or_name", "conditions": ["🤕 Wounded"] }],',
    '    "characterConditionsRemove": [{ "characterId": "inst_id_or_name", "conditions": ["😴 Exhausted"] }],',
    '    "characterConditionsReplace": [{ "characterId": "inst_id_or_name", "from": "🤕 Bleeding", "to": "🩹 Bandaged" }],',
    '    "characterFlagsAdd": [{ "characterId": "inst_id_or_name", "flags": ["knows_secret"] }],',
    '    "characterFlagsRemove": [{ "characterId": "inst_id_or_name", "flags": ["old_flag"] }],',
    '    "characterMemory": [{ "characterId": "inst_id_or_name", "memorySummary": "Mira now trusts the player after they saved her." }],',
    '    "characterEnterScene": ["inst_id_or_name"],',
    '    "characterExitScene": ["inst_id_or_name"],',
    '    "characterUpdateRole": [{ "characterId": "inst_id_or_name", "storyRole": "Companion" }],',
    '    "characterAddSimple": [{ "name": "Borg", "description": "Gruff blacksmith", "storyRole": "Local Blacksmith" }],',
    '    "characterFleshOut": { "characterId": "inst_id_or_name" },',
    '    "inventoryAdd": [{ "itemId": "item_id", "quantity": 1 }],',
    '    "inventoryRemove": [{ "itemId": "item_id", "quantity": 1 }],',
    '    "itemAdd": [{ "id": "item_revolver", "name": "🔫 Revolver", "type": "weapon", "description": "A standard-issue sidearm.", "quantity": 1 }],',
    '    "itemUpdate": [{ "itemId": "item_revolver", "name": "🔫 Rusted Revolver", "description": "Corroded from years in the rain." }],',
    '    "memoryEvents": [{ "type": "event_type", "summary": "brief summary", "importance": 1, "tags": ["character_name", "world_state_id"] }],',
    '    "characterSectionUpdate": [{ "characterId": "inst_id_or_name", "section": "Clothing", "content": "- Top: Torn silk blouse\\n- Bottom: Leather pants" }],',
    '    "playerClothingAdd": [{ "slot": "Top", "name": "Wool coat", "state": "damp" }],',
    '    "playerClothingRemove": [{ "slot": "Hands" }],',
    '    "playerClothingSetState": [{ "slot": "Top", "state": "torn" }],',
    '    "playerConditionsAdd": ["🤕 Wounded"],',
    '    "playerConditionsRemove": ["😴 Exhausted"],',
    '    "playerConditionsReplace": [{ "from": "🤕 Bleeding", "to": "🩹 Bandaged" }],',
    '    "playerFlagsAdd": ["🗝️ Knows the Password"],',
    '    "playerFlagsRemove": ["old_player_flag"]',
    "  }",
    "}",
    "",
    "statePatch is optional. All statePatch fields are optional. Never invent item or character IDs — use only the allowed IDs from the state summary (except when introducing a new item or simple character).",
    "- Active characters are present in the scene. Inactive characters are off-screen. Do not have inactive characters speak, act, or be physically present in the scene unless brought in via characterEnterScene.",
    "- Inactive characters can still be affected by statePatch: mood, conditions, flags, clothing, and memory patches apply to them normally.",
    "- While a character is off-screen they may evolve: when dramatically appropriate, update their mood, conditions, or flags via statePatch even though they are not present. Changes become visible when they return.",
    "",
    "FIELD GUIDANCE:",
    "- characterMood: set a character's current mood (e.g. happy, nervous, angry).",
    "- characterTowardPlayer: set a character's stance toward the player (e.g. friendly, wary, hostile).",
    '- characterConditionsAdd/Remove/Replace: add, remove, or evolve conditions for characters (e.g. "🤕 Wounded", "😴 Exhausted", "✨ Inspired"). You MUST remove temporary conditions using characterConditionsRemove when healed, rested, cured, or no longer active to prevent clutter. Use characterConditionsReplace ({ "characterId": "...", "from": "...", "to": "..." }) to evolve a condition (e.g. Bleeding to Bandaged).',
    "- characterFlagsAdd/Remove: set or clear narrative flags on a character (e.g. knows_secret, met_player). Clear flags using characterFlagsRemove when the event or situation has concluded.",
    "- characterMemory: update what the character remembers about the player and recent events. Use this to track relationship development.",
    "- characterEnterScene: add characters to the active scene when they arrive or appear. Use character IDs or names from the known characters roster.",
    "- characterExitScene: remove characters from the active scene when they leave, depart, or move off-screen.",
    "- characterUpdateRole: update a character's dynamic storyRole (e.g. 'Companion', 'Captive', 'Rival', 'Ally').",
    "- characterAddSimple: introduce a new named simple character when one appears in the story. Provide name, a brief description, and their initial storyRole. They enter the active scene immediately and persist in the world.",
    "- characterFleshOut: flesh out a simple character into a full detailed character when they become central to the story. Use sparingly.",
    "- memoryEvents: ALWAYS include tags with the current character name. Include world state names/IDs when relevant. Tags power the memory retrieval system — untagged events won't be recalled in the right context.",
    "- inventoryAdd/inventoryRemove: change quantities of items that already exist in the item catalog. Use itemId (not name). Removing more than the player has will be rejected.",
    "- itemAdd: introduce a new item into the world (e.g. when the player finds or receives something). Provide a unique snake_case id (item_ prefix), an emoji-prefixed name, a descriptive type word, a one-line description, and quantity. The item is added to the catalog AND inventory automatically — no separate inventoryAdd needed.",
    "- itemUpdate: update an existing item's name, type, or description (e.g. a weapon rusts, a potion is identified, an item is examined). All fields optional — only send what changed.",
    "- playerClothingAdd/Remove/SetState: manage player clothing. Slots are freeform strings. Add overwrites the same slot. SetState updates an existing item state (e.g. wet, torn).",
    '- playerConditionsAdd/Remove/Replace: track player status conditions with emoji prefixes (e.g. "🤕 Wounded", "😴 Exhausted"). You MUST remove conditions using playerConditionsRemove when healed, rested, or treated. Use playerConditionsReplace ({ "from": "...", "to": "..." }) to transition a condition (e.g. "🤕 Bleeding" to "🩹 Bandaged").',
    '- playerFlagsAdd/Remove: player-specific flags separate from world flags. Use emoji-prefixed human-readable names (e.g. "🗝️ Knows the Password"). Remove flags when a temporary state or milestone is passed.',
    "- worldStateAdd/Remove/Update: ACTIVE, ONGOING conditions of the world (e.g. 🌧️ Raining, 🚨 Town on Alert). DO NOT use this as an event log or timeline for past events. You MUST rigorously remove states using worldStateRemove when they are no longer active to prevent clutter.",
    `- characterSectionUpdate: replace the entire content of one section in a character's sheet. Use canonical section names: ${sectionNamesList}. Send the COMPLETE new text for that section, not a delta. Use this to update clothing, appearance changes, or personality shifts. The "Clothing" section is managed via characterClothing* patches — a Clothing section update is applied as a full outfit replace. Prefer the characterSectionItem* actions for incremental changes to bulleted sections of ACTIVE characters; use this whole-section replace for full rewrites, freeform Communication sections, and INACTIVE characters.`,
    "- characterClothingAdd/Remove/SetState/Set: manage a character's worn clothing. Add items by slot (one item per slot), remove by slot, set state (wet, torn, removed) on worn items, or Set to replace the whole outfit.",
    `- characterSectionItemAdd: add ONE item to a bulleted section (${bulletedSections}). Send the new item text without a leading dash. The engine appends it as a bullet; exact duplicates are ignored. Use this for newly-discovered traits (e.g. a Like the character realizes mid-story). Requires the character to be ACTIVE in the scene.`,
    "- characterSectionItemRemove: remove ONE item from a bulleted section by its exact current text. Use this when a trait no longer holds (e.g. a Like removed after a traumatic outdoors event). Rejected if no exact match exists. Requires the character to be ACTIVE in the scene.",
    "- characterSectionItemReplace: replace ONE bullet's text in a section. Send 'from' (exact current text) and 'to' (new text). Use for evolving traits (personality shifts). Rejected if 'from' has no exact match. Requires the character to be ACTIVE in the scene.",
    choicesEnabled
      ? "Include 2-4 concise, meaningfully different suggested choices."
      : "Do NOT include a choices field.",
    "Keep narrative under 350 words."
  ].join("\n");

  return outputInstructions;
}

export type PromptRole = "system" | "user" | "assistant";

/** One outgoing chat message. Distinct from the persisted `ChatMessage` schema
 *  type in src/schemas — this one exists only for the duration of one request. */
export type PromptMessage = { role: PromptRole; content: string };

export type PromptBudget = {
  contextWindow: number;
  /** Output tokens reserved for the completion — must mirror the request's `max_tokens`. */
  reserveOutputTokens: number;
  /** Last turn's measured/estimated prompt-token ratio. Scales ONLY the budget
   *  maths (fixedCost + per-message history cost) — never the reported estimate. */
  calibration?: number;
};

/** Estimation is chars/4 everywhere until real usage is available (Phase 3). */
export const CONTEXT_SAFETY_RESERVE = 512;
export const MIN_HISTORY_MESSAGES = 2;
export const PROMPT_MESSAGE_OVERHEAD_TOKENS = 4;
/** Bounds for the self-calibration ratio fed back into the budget. */
export const MIN_TOKEN_CALIBRATION = 1;
export const MAX_TOKEN_CALIBRATION = 4;

/**
 * Clamps a measured/estimated token ratio into [MIN_TOKEN_CALIBRATION,
 * MAX_TOKEN_CALIBRATION], returning 1 for a missing or non-finite value.
 *
 * The floor of 1 is deliberate: chars/4 is treated as a lower bound on the true
 * size. A tokenizer that looks more efficient than chars/4 must never be used to
 * pack MORE history in — over-admitting risks a provider error or silent
 * truncation, while under-admitting only costs a little context.
 */
export function clampCalibration(value?: number): number {
  if (value === undefined || !Number.isFinite(value)) return MIN_TOKEN_CALIBRATION;
  return Math.min(MAX_TOKEN_CALIBRATION, Math.max(MIN_TOKEN_CALIBRATION, value));
}

/** `scale` is the self-calibration ratio: it adjusts budget maths only, never
 *  the reported `breakdown`/`estimated`, which stay on the unscaled basis. */
export function estimateTokens(chars: number, scale = 1): number {
  return Math.ceil((chars / 4) * scale);
}

/**
 * Walks visible history from the newest message backwards, keeping whole
 * messages while they fit `budgetTokens`. The newest exchange is always kept
 * (MIN_HISTORY_MESSAGES) even if it alone exceeds the budget — dropping it
 * would leave the model with no immediate context at all.
 */
export function selectHistory(
  state: Playthrough,
  budgetTokens: number,
  scale = 1
): { history: PromptMessage[]; droppedChars: number } {
  const visible = state.messages.filter((m) => !m.hidden);
  const kept: PromptMessage[] = [];
  let used = 0;
  let droppedChars = 0;

  for (let i = visible.length - 1; i >= 0; i -= 1) {
    const message = visible[i];
    const cost = estimateTokens(message.content.length, scale) + PROMPT_MESSAGE_OVERHEAD_TOKENS;
    if (kept.length >= MIN_HISTORY_MESSAGES && used + cost > budgetTokens) {
      droppedChars = visible.slice(0, i + 1).reduce((n, m) => n + m.content.length, 0);
      break;
    }
    kept.push({ role: message.role, content: message.content });
    used += cost;
  }

  return { history: kept.reverse(), droppedChars };
}

/** STORY SO FAR block: the latest meta-summary plus the newest verbatim chapters. */
function buildStorySoFarSection(state: Playthrough): string {
  let storySoFarSection = "";
  const chapters = state.chapters ?? [];
  const metas = state.storyMetaSummaries ?? [];
  if (chapters.length > 0 || metas.length > 0) {
    const parts: string[] = [];
    if (metas.length) {
      const latest = metas[metas.length - 1];
      parts.push(`EARLIER STORY:\n${latest.summary}`);
    }
    const foldedIds = new Set(metas.flatMap((m) => m.chapterIds));
    const uncompacted = chapters.filter((ch) => !foldedIds.has(ch.id));
    const recent = uncompacted.slice(-VERBATIM_CHAPTER_LIMIT);
    if (recent.length) {
      parts.push(
        "RECENT CHAPTERS:\n" +
          recent.map((ch) => `Chapter: ${ch.name} — ${ch.fullSummary}`).join("\n\n")
      );
    }
    storySoFarSection = "STORY SO FAR:\n" + parts.join("\n\n");
  }
  return storySoFarSection;
}

export type AssembledTurnPrompt = {
  messages: PromptMessage[];
  promptUsage: PromptUsage;
  /** Chars of visible history excluded by the budget. Not surfaced yet — the
   *  hook for a future "not sent / close a chapter" meter segment. */
  droppedHistoryChars: number;
};

type LorebookSegments = { before: string; after: string; depth: string };

/**
 * Scans this playthrough's lorebooks and splits activated entries by their
 * configured position: 0 = before the transcript, 1 = immediately before the
 * user turn ("after"), >= 2 = at depth from the bottom. Position semantics are
 * SillyTavern-compatible; where each segment is *placed* in the outgoing
 * message array is assembleTurnPrompt's decision, not this helper's.
 */
/** Split scanned entries into the three prompt positions and join them, resolving
 *  {{user}} per entry and deliberately leaving {{char}} literal: an entry belongs to
 *  no single character, so there is no owner to name.
 *
 *  Exported for tests — the collector around it reads lorebooks from the real data
 *  dir, which is not a seam a test may use. */
export function renderLorebookSegments(
  activated: Array<{ entry: Pick<LorebookEntry, "content" | "position" | "depth" | "order"> }>,
  playerName: string
): LorebookSegments {
  const expand = (a: (typeof activated)[number]) => expandUserMacro(a.entry.content, playerName);
  return {
    before: activated.filter((a) => a.entry.position === 0).map(expand).join("\n\n"),
    after: activated.filter((a) => a.entry.position === 1).map(expand).join("\n\n"),
    depth: activated
      .filter((a) => a.entry.position >= 2)
      .sort((a, b) => a.entry.depth - b.entry.depth || a.entry.order - b.entry.order)
      .map(expand)
      .join("\n\n"),
  };
}

function collectLorebookSegments(state: Playthrough): LorebookSegments {
  if (state.lorebookIds && state.lorebookIds.length > 0) {
    const allEntries: LorebookEntry[] = [];
    const lorebookDefaults = { scanDepth: 2, caseSensitive: false, matchWholeWords: false };

    for (const lbId of state.lorebookIds) {
      const lb = getLorebook(lbId);
      if (!lb) continue;
      if (lb.scanDepth !== undefined) lorebookDefaults.scanDepth = lb.scanDepth;
      if (lb.caseSensitive !== undefined) lorebookDefaults.caseSensitive = lb.caseSensitive;
      if (lb.matchWholeWords !== undefined) lorebookDefaults.matchWholeWords = lb.matchWholeWords;
      for (const entry of Object.values(lb.entries)) {
        allEntries.push(entry);
      }
    }

    if (allEntries.length > 0) {
      const scanMessages = state.messages
        .filter(m => !m.hidden)
        .map(m => ({ role: m.role, content: m.content }));

      const timingStates = new Map<number, EntryTimingState>();
      if (state.lorebookTimingStates) {
        for (const [key, ts] of Object.entries(state.lorebookTimingStates)) {
          timingStates.set(Number(key), ts);
        }
      }

      const scanned = scanLorebooks({
        messages: scanMessages,
        entries: allEntries,
        lorebookDefaults,
        timingStates,
        currentMessageIndex: scanMessages.length,
      });

      return renderLorebookSegments(scanned, state.playerCharacter.name);
    }
  }
  return { before: "", after: "", depth: "" };
}

export function assembleTurnPrompt(
  input: ParsedUserInput,
  state: Playthrough,
  choicesEnabled: boolean,
  queryEmbedding: number[] = [],
  budget: PromptBudget = { contextWindow: 65536, reserveOutputTokens: 1200 },
  promptConfig: PromptConfig
): AssembledTurnPrompt {
  const modules = promptConfig.modules.turn ?? [];
  const format = promptConfig.characterFormat;

  const { before: lorebookBefore, after: lorebookAfter, depth: lorebookDepth } = collectLorebookSegments(state);

  const stableBlock = buildStableSystemBlock(modules, lorebookBefore);
  const outputContract = buildOutputContract(choicesEnabled, format);

  const memories = retrieveMemoriesVector(state, queryEmbedding);
  const storySoFarSection = buildStorySoFarSection(state);
  const stateSummary = summarizePlaythrough(state);

  const actionLine = `Action: ${input.actionText || "none"}`;
  const spokenLine = `Spoken: ${input.spokenText.length ? input.spokenText.join(" | ") : "none"}`;
  const depthSection = lorebookDepth ? `[Current context]\n${lorebookDepth}` : "";

  // Volatile tail: everything that changes every turn, ordered most-stable-first.
  const tailBlock = [
    memories,
    storySoFarSection,
    "CURRENT STATE",
    stateSummary,
    depthSection,
    lorebookAfter,
    "PARSED INPUT",
    actionLine,
    spokenLine,
    outputContract
  ].filter(Boolean).join("\n\n");

  const usable = Math.max(
    0,
    budget.contextWindow - budget.reserveOutputTokens - CONTEXT_SAFETY_RESERVE
  );
  // Self-calibration: only the budget maths below is scaled. The reported
  // `breakdown`/`estimated` stay on the unscaled basis (the ratio stored back is
  // measured/estimated), otherwise estimated would converge on measured and the
  // correction would silently disable itself.
  const tokenScale = clampCalibration(budget.calibration);
  const fixedCost =
    estimateTokens(stableBlock.length, tokenScale) +
    estimateTokens(tailBlock.length, tokenScale) +
    estimateTokens(input.raw.length, tokenScale);
  const { history, droppedChars } = selectHistory(state, Math.max(0, usable - fixedCost), tokenScale);

  const messages: PromptMessage[] = history.length > 0
    ? [
        { role: "system", content: stableBlock },
        ...history,
        { role: "system", content: tailBlock },
        { role: "user", content: input.raw }
      ]
    : [
        // No transcript to send (fresh playthrough, or right after a chapter
        // close): merge the tail into the leading system message so the array
        // never opens with two consecutive system messages.
        { role: "system", content: [stableBlock, tailBlock].filter(Boolean).join("\n\n") },
        { role: "user", content: input.raw }
      ];

  const est = estimateTokens;
  const breakdown: PromptUsageBreakdown = {
    modules: est(renderModules(modules).length),
    outputFormat: est(outputContract.length),
    lorebook: est([lorebookBefore, lorebookAfter].filter(Boolean).join("\n\n").length),
    storySoFar: est(storySoFarSection.length),
    stateSummary: est(stateSummary.length),
    chatHistory: est(history.reduce((n, m) => n + m.content.length, 0)),
    memoryEvents: est(memories.length),
    lorebookDepth: est(depthSection.length),
    userInput: est(input.raw.length + actionLine.length + spokenLine.length)
  };
  // Meter tiling: sum-of-segments remains `estimated` so the bar's segments add
  // up exactly, as they do today. Budget math above used its own char total.
  const estimated = (Object.values(breakdown) as number[]).reduce((sum, n) => sum + n, 0);

  return {
    messages,
    promptUsage: { estimated, breakdown },
    droppedHistoryChars: droppedChars
  };
}
