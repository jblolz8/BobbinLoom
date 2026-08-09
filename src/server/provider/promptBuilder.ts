import { joinContentSections, splitContentSections, summaryFromContent } from "../../engine/characterSections";
import { ITEMS } from "../../engine/demoData";
import { retrieveMemoriesVector, scanLorebooks } from "../../engine/engine";
import type { EntryTimingState, LorebookEntry } from "../../schemas";
import type { ParsedUserInput, Playthrough, PromptPresetModule } from "../../schemas";
import type { PromptUsage, PromptUsageBreakdown } from "../provider";
import { VERBATIM_CHAPTER_LIMIT } from "../provider";
import { getLorebook } from "../store";

export function summarizePlaythrough(state: Playthrough): string {
  const present = state.characters.filter((c) => c.currentLocationId === state.locationId);
  const absent = state.characters.filter((c) => c.currentLocationId !== state.locationId);

  const catalog = state.locationCatalog ?? [];

  const characterLines = present.map((character) => {
    const tpl = state.characterTemplates.find((t) => t.id === character.templateId);
    let contentBlob = tpl?.content ?? "(no character data)";

    let clothingLine = "";
    if (character.clothing.length > 0) {
      const { preamble, sections } = splitContentSections(contentBlob);
      contentBlob = joinContentSections(
        sections.filter((s) => s.header.toLowerCase() !== "clothing"),
        preamble
      );
      clothingLine = `Clothing: ${character.clothing.map((c) => `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`).join("; ")}`;
    }

    const runtimeBlock = [
      "[RUNTIME STATE]",
      `Location: ${character.currentLocationId}`,
      `Mood: ${character.mood}`,
      `Toward Player: ${character.towardPlayer}`,
      clothingLine,
      character.conditions.length > 0 ? `Conditions: ${character.conditions.join(", ")}` : "",
      character.flags.length > 0 ? `Flags: ${character.flags.join(", ")}` : "",
      `Memory: ${character.memorySummary}`,
    ].filter(Boolean).join("\n");

    return [
      `CHARACTER: ${character.name} (${character.id})`,
      contentBlob,
      "",
      runtimeBlock,
    ].join("\n");
  });

  const absentLines = absent.map((character) => {
    const tpl = state.characterTemplates.find((t) => t.id === character.templateId);
    const summary = tpl?.summary || summaryFromContent(tpl?.content ?? "") || "no details";
    const locName = catalog.find((l) => l.id === character.currentLocationId)?.name ?? character.currentLocationId;
    return [
      `- ${character.name} (${character.id})`,
      character.towardPlayer !== "neutral" ? ` [${character.towardPlayer}]` : "",
      ` — ${summary}`,
      `; at ${locName} (${character.currentLocationId})`,
      character.conditions.length > 0 ? `, ${character.conditions.join(", ")}` : "",
    ].join("");
  });
  const absentBlock = absentLines.length > 0
    ? ["ABSENT CHARACTERS (full sheets withheld — not at the current location):", ...absentLines]
    : [];

  const questLines = state.quests
    .filter((q) => q.tracking || q.status === "active")
    .map((quest) => `- ${quest.id}: ${quest.name} [${quest.status}] — ${quest.summary}`);

  const inventoryLines = state.inventory.map((item) => {
    const def = (state.itemCatalog ?? ITEMS).find((i) => i.id === item.itemId);
    const displayName = def?.name ?? item.itemId;
    return `- ${displayName} x${item.quantity}`;
  });
  const allowedItems = (state.itemCatalog ?? ITEMS).map((item) => item.id).join(", ");
  const currentLoc = catalog.find(l => l.id === state.locationId);

  const currentLocationBlock = currentLoc ? [
    "CURRENT LOCATION:",
    `${currentLoc.name} (${currentLoc.id})`,
    currentLoc.description ? `  description: ${currentLoc.description}` : "",
    currentLoc.state ? `  state: ${currentLoc.state}` : "",
    currentLoc.connections.length > 0
      ? `  exits: ${currentLoc.connections.map(connId => {
          const neighbor = catalog.find(l => l.id === connId);
          return neighbor ? `${neighbor.name} (${neighbor.id})` : connId;
        }).join(", ")}`
      : "  exits: none",
  ].filter(Boolean).join("\n") : `Location: ${state.locationId}`;

  const neighborLines: string[] = [];
  if (currentLoc) {
    for (const connId of currentLoc.connections) {
      const neighbor = catalog.find(l => l.id === connId);
      if (neighbor) {
        neighborLines.push(`- ${neighbor.name} (${neighbor.id}): ${neighbor.description || "(no description)"}`);
      }
    }
  }
  const neighborBlock = neighborLines.length > 0
    ? ["ACCESSIBLE LOCATIONS (directly reachable from current location):", ...neighborLines, ""].join("\n")
    : "";

  const roster = catalog.map(l => `${l.id} (${l.name})`).join(", ");
  const rosterBlock = roster ? `Known locations: ${roster}` : "";

  let reachableBlock = "";
  if (currentLoc) {
    const depth1 = new Set(currentLoc.connections);
    const depth2: { name: string; id: string; via: string }[] = [];
    for (const n1 of currentLoc.connections) {
      const n1loc = catalog.find((l) => l.id === n1);
      if (!n1loc) continue;
      for (const n2 of n1loc.connections) {
        if (n2 === currentLoc.id || depth1.has(n2)) continue;
        const n2loc = catalog.find((l) => l.id === n2);
        if (n2loc && !depth2.some((d) => d.id === n2loc.id)) {
          depth2.push({ name: n2loc.name, id: n2loc.id, via: n1loc.name });
        }
      }
    }
    if (depth2.length > 0) {
      reachableBlock = "REACHABLE (2 hops from here): " +
        depth2.map((d) => `${d.name} (${d.id}) via ${d.via}`).join("; ");
    }
  }

  const npcLines = state.npcs.map((npc) => {
    const locName = catalog.find(l => l.id === npc.locationId)?.name ?? npc.locationId;
    return `- ${npc.name} (${npc.id})${npc.disposition ? ` [${npc.disposition}]` : ""}: ${npc.description} — at ${locName}`;
  });

  return [
    `Turn: ${state.turn}`,
    "LOCATION CONTEXT:",
    currentLocationBlock,
    "",
    neighborBlock,
    `Flags: ${state.flags.length ? state.flags.join(", ") : "none"}`,
    "",
    "PLAYER CHARACTER:",
    `${state.playerCharacter.name} — ${state.playerCharacter.description}`,
    `Body: ${state.playerCharacter.bodyType}`,
    `Appearance: ${state.playerCharacter.appearance}`,
    `Clothing: ${state.playerCharacter.clothing.length ? state.playerCharacter.clothing.map((c) => `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`).join("; ") : "none"}`,
    `Conditions: ${state.playerCharacter.conditions.length ? state.playerCharacter.conditions.join(", ") : "none"}`,
    `Player Flags: ${state.playerCharacter.flags.length ? state.playerCharacter.flags.join(", ") : "none"}`,
    "",
    "Characters:",
    ...characterLines,
    ...absentBlock,
    "",
    ...(npcLines.length > 0
      ? ["BACKGROUND CHARACTERS (simple NPCs — no stats or tracked state; promote if they become important):", ...npcLines, ""]
      : []),
    "Inventory:",
    ...(inventoryLines.length ? inventoryLines : ["- empty"]),
    "",
    "Quests:",
    ...questLines,
    "",
    "Allowed IDs:",
    `Items: ${allowedItems}`,
    rosterBlock,
    ...(reachableBlock ? [reachableBlock] : []),
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

export function buildSystemPrompt(choicesEnabled: boolean, modules: PromptPresetModule[], lorebookBefore: string, lorebookAfter: string): { text: string; segments: SystemPromptSegments } {
  const enabledModules = modules
    .filter((m) => m.enabled)
    .sort((a, b) => a.order - b.order);

  const moduleContents = enabledModules.map((m) => m.content).join("\n\n");
  const lorebookSection = [lorebookBefore, lorebookAfter].filter(Boolean).join("\n\n");

  const outputInstructions = [
    "",
    "---",
    "OUTPUT FORMAT",
    "Return ONLY a JSON object with this shape:",
    "{",
    '  "narrative": "story text shown to the user",',
    choicesEnabled ? '  "choices": ["optional suggested choice 1", "optional suggested choice 2"],' : "",
    '  "statePatch": {',
    '    "flagsAdd": ["flag_name"],',
    '    "flagsRemove": ["flag_name"],',
    '    "characterMood": [{ "characterId": "inst_id_or_name", "mood": "nervous" }],',
    '    "characterTowardPlayer": [{ "characterId": "inst_id_or_name", "towardPlayer": "wary" }],',
    '    "characterConditionsAdd": [{ "characterId": "inst_id_or_name", "conditions": ["🤕 wounded"] }],',
    '    "characterConditionsRemove": [{ "characterId": "inst_id_or_name", "conditions": ["😴 exhausted"] }],',
    '    "characterFlagsAdd": [{ "characterId": "inst_id_or_name", "flags": ["knows_secret"] }],',
    '    "characterFlagsRemove": [{ "characterId": "inst_id_or_name", "flags": ["old_flag"] }],',
    '    "characterMemory": [{ "characterId": "inst_id_or_name", "memorySummary": "Mira now trusts the player after they saved her." }],',
    '    "npcAdd": [{ "name": "Borg", "description": "Gruff blacksmith", "disposition": "gruff" }],',
    '    "npcRemove": ["npc_id_or_name"],',
    '    "npcPromote": { "npcId": "npc_id_or_name" },',
    '    "inventoryAdd": [{ "itemId": "item_id", "quantity": 1 }],',
    '    "inventoryRemove": [{ "itemId": "item_id", "quantity": 1 }],',
    '    "itemAdd": [{ "id": "item_revolver", "name": "🔫 Revolver", "type": "weapon", "description": "A standard-issue sidearm.", "quantity": 1 }],',
    '    "itemUpdate": [{ "itemId": "item_revolver", "name": "🔫 Rusted Revolver", "description": "Corroded from years in the rain." }],',
    '    "questAdd": [{ "name": "Quest Name", "summary": "Brief description of the goal." }],',
    '    "questUpdate": [{ "questId": "quest_id", "status": "completed" }],',
    '    "memoryEvents": [{ "type": "event_type", "summary": "brief summary", "importance": 1, "tags": ["character_name", "location_id", "quest_id"] }],',
    '    "locationId": "loc_id_or_name",',
    '    "travelVia": ["loc_road", "loc_forest"],',
    '    "locationAdd": [{ "id": "loc_tavern", "name": "Rusted Anchor", "description": "A dim waterfront tavern.", "state": "", "icon": "🍺", "connections": ["loc_docks"] }],',
    '    "locationUpdate": [{ "locationId": "loc_id_or_name", "state": "⚠️ on fire", "description": "Updated description" }],',
    '    "locationConnect": [{ "locationId": "loc_id_or_name", "targetId": "loc_id_or_name" }],',
    '    "locationDisconnect": [{ "locationId": "loc_id_or_name", "targetId": "loc_id_or_name" }],',
    '    "characterLocation": [{ "characterId": "inst_id_or_name", "locationId": "loc_id_or_name" }],',
    '    "characterSectionUpdate": [{ "characterId": "inst_id_or_name", "section": "Clothing", "content": "- Top: Torn silk blouse\\n- Bottom: Leather pants" }],',
    '    "playerClothingAdd": [{ "slot": "Top", "name": "Wool coat", "state": "damp" }],',
    '    "playerClothingRemove": [{ "slot": "Hands" }],',
    '    "playerClothingSetState": [{ "slot": "Top", "state": "torn" }],',
    '    "playerConditionsAdd": ["wounded"],',
    '    "playerConditionsRemove": ["exhausted"],',
    '    "playerFlagsAdd": ["player_knows_secret"],',
    '    "playerFlagsRemove": ["old_player_flag"]',
    "  }",
    "}",
    "",
    "statePatch is optional. All statePatch fields are optional. Never invent item, location, or character IDs — use only the allowed IDs from the state summary.",
    "- A character is present at the scene only when their location matches the current location. Present characters get their full sheet; absent characters appear as one-liners. Do not have absent characters act, speak, or be visible in the scene.",
    "- Absent characters can still be affected by statePatch: characterLocation moves them (they become present next turn), and mood/conditions/flags/clothing/memory patches apply to them normally.",
    "- While a character is absent they may evolve off-screen: when dramatically appropriate, update their mood, conditions, or flags via statePatch even though they are not present. Changes become visible when they return.",
    "",
    "FIELD GUIDANCE:",
    "- characterMood: set a detailed character's current mood (e.g. happy, nervous, angry).",
    "- characterTowardPlayer: set a detailed character's stance toward the player (e.g. friendly, wary, hostile).",
    "- characterConditionsAdd/Remove: add or remove conditions from a character (e.g. wounded, exhausted, inspired). Use emoji-prefixed human-readable names (\"🤕 wounded\").",
    "- characterFlagsAdd/Remove: set or clear flags on a character (e.g. knows_secret, met_player).",
    "- characterMemory: update what the character remembers about the player and recent events. Use this to track relationship development.",
    "- npcAdd: introduce a named background character when one appears in the scene. Give them a one-line description and optional one-word disposition. They persist — use their name instead of inventing generic strangers.",
    "- npcRemove: remove a background character who has permanently left the story.",
    "- npcPromote: promote a background NPC to the main cast when they become genuinely important (recurring presence, forming relationship). The promoted character starts with a basic sheet built from their description and disposition — the player can expand it later. Use this sparingly: for characters who merely appear in a scene, npcAdd is the right tool.",
    "- memoryEvents: ALWAYS include tags with the current character name and location ID. Include quest IDs and flag names when relevant. Tags power the memory retrieval system — untagged events won't be recalled in the right context.",
    "- inventoryAdd/inventoryRemove: change quantities of items that already exist in the item catalog. Use itemId (not name). Removing more than the player has will be rejected.",
    "- itemAdd: introduce a new item into the world (e.g. when the player finds or receives something). Provide a unique snake_case id (item_ prefix), an emoji-prefixed name, a descriptive type word, a one-line description, and quantity. The item is added to the catalog AND inventory automatically — no separate inventoryAdd needed.",
    "- itemUpdate: update an existing item's name, type, or description (e.g. a weapon rusts, a potion is identified, an item is examined). All fields optional — only send what changed.",
    "- playerClothingAdd/Remove/SetState: manage player clothing. Slots are freeform strings. Add overwrites the same slot. SetState updates an existing item state (e.g. wet, torn).",
    "- playerConditionsAdd/Remove: track player conditions with emoji prefixes (e.g. \"🤕 wounded\", \"😴 exhausted\").",
    "- playerFlagsAdd/Remove: player-specific flags separate from world flags. Use emoji-prefixed human-readable names (e.g. \"💢 Slime Encounter Started\" instead of \"slime_encounter_started\").",
    "- flagsAdd/flagsRemove: same format as player flags — emoji-prefixed, human-readable.",
    "- locationId: change the player's current location. Use a location ID or name from the Known locations roster. Direct neighbors need no extra fields. For multi-hop travel, send travelVia with the ordered intermediate stops (e.g. [\"loc_road\", \"loc_forest\"]); every consecutive hop (current → via[0] → … → target) must be a real connection. The engine validates the route and rejects invalid journeys. See REACHABLE in the state summary.",
    "- locationAdd: introduce a new location. Provide a unique loc_ prefix ID, a name, a stable description (what the place IS), a state (current dynamic status — empty string if nothing notable), an emoji icon, and connections (array of existing location IDs or names to connect to). The engine auto-maintains bidirectional edges and assigns render coordinates. Unresolvable connection targets are silently skipped with a warning, so double-check each connection name/ID. Check the Known locations roster first to avoid duplicates.",
    "- locationUpdate: update an existing location's name, description, state, or icon. Use locationId (ID or name). State tracks dynamic conditions (\"on fire\", \"closed for the night\") — keep description stable.",
    "- locationConnect: create a new edge between two existing locations. Both sides are updated automatically. Use IDs or names.",
    "- locationDisconnect: remove an edge between two locations. Both sides are updated automatically.",
    "- characterLocation: move a character to a location. Use characterId (instance ID or name) and locationId (location ID or name). Use this when a character travels, is escorted, or relocated by events.",
    "- characterSectionUpdate: replace the entire content of one section in a character's sheet. Use canonical section names: Species, Gender, Body, Appearance, Clothing, Personality, Communication - Public, Communication - Private, Likes, Dislikes, Sexual Capabilities. Send the COMPLETE new text for that section, not a delta. Use this to update clothing, appearance changes, or personality shifts. The \"Clothing\" section is managed via characterClothing* patches — a Clothing section update is applied as a full outfit replace.",
    "- characterClothingAdd/Remove/SetState/Set: manage a character's worn clothing. Add items by slot (one item per slot), remove by slot, set state (wet, torn, removed) on worn items, or Set to replace the whole outfit.",
    choicesEnabled
      ? "Include 2-4 concise, meaningfully different suggested choices."
      : "Do NOT include a choices field.",
    "Keep narrative under 350 words."
  ].join("\n");

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

type UserPromptSegments = { memoryEvents: number; storySoFar: number; stateSummary: number; lorebookDepth: number; recentMessages: number; userInput: number };

export function buildUserPrompt(input: ParsedUserInput, state: Playthrough, lorebookDepthContent: string, queryEmbedding: number[] = []): { text: string; segments: UserPromptSegments } {
  const visibleMessages = state.messages.filter((m) => !m.hidden);
  const recentMessages = visibleMessages
    .slice(-12)
    .map((message) => `${message.role.toUpperCase()}: ${message.content}`)
    .join("\n");

  const memories = retrieveMemoriesVector(state, queryEmbedding);
  const stateSummary = summarizePlaythrough(state);

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

  const depthSection = lorebookDepthContent ? `[Current context]\n${lorebookDepthContent}` : "";

  const actionLine = `Action: ${input.actionText || "none"}`;
  const spokenLine = `Spoken: ${input.spokenText.length ? input.spokenText.join(" | ") : "none"}`;

  return {
    text: [
      memories,
      storySoFarSection,
      "CURRENT STATE",
      stateSummary,
      "",
      depthSection,
      "RECENT MESSAGES",
      recentMessages || "none",
      "",
      "USER INPUT",
      input.raw,
      "",
      "PARSED INPUT",
      actionLine,
      spokenLine
    ].filter(Boolean).join("\n"),
    segments: {
      memoryEvents: memories.length,
      storySoFar: storySoFarSection.length,
      stateSummary: stateSummary.length,
      lorebookDepth: depthSection.length,
      recentMessages: (recentMessages || "none").length,
      userInput: input.raw.length + actionLine.length + spokenLine.length
    }
  };
}

export type AssembledTurnPrompt = {
  system: string;
  user: string;
  promptUsage: PromptUsage;
};

export function assembleTurnPrompt(input: ParsedUserInput, state: Playthrough, choicesEnabled: boolean, queryEmbedding: number[] = []): AssembledTurnPrompt {
  const modules = state.promptSettings?.modules.turn ?? [];

  let lorebookBefore = "";
  let lorebookAfter = "";
  let lorebookDepth = "";

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

      const pos0 = scanned.filter(a => a.entry.position === 0);
      const pos1 = scanned.filter(a => a.entry.position === 1);
      const pos2 = scanned.filter(a => a.entry.position >= 2);

      lorebookBefore = pos0.map(a => a.entry.content).join("\n\n");
      lorebookAfter = pos1.map(a => a.entry.content).join("\n\n");
      lorebookDepth = pos2
        .sort((a, b) => a.entry.depth - b.entry.depth || a.entry.order - b.entry.order)
        .map(a => a.entry.content).join("\n\n");
    }
  }

  const systemResult = buildSystemPrompt(choicesEnabled, modules, lorebookBefore, lorebookAfter);
  const userResult = buildUserPrompt(input, state, lorebookDepth, queryEmbedding);

  const est = (chars: number) => Math.ceil(chars / 4);
  const breakdown: PromptUsageBreakdown = {
    modules: est(systemResult.segments.modules),
    outputFormat: est(systemResult.segments.outputFormat),
    lorebook: est(systemResult.segments.lorebook),
    storySoFar: est(userResult.segments.storySoFar),
    stateSummary: est(userResult.segments.stateSummary),
    recentMessages: est(userResult.segments.recentMessages),
    memoryEvents: est(userResult.segments.memoryEvents),
    lorebookDepth: est(userResult.segments.lorebookDepth),
    userInput: est(userResult.segments.userInput)
  };
  const estimated = (Object.values(breakdown) as number[]).reduce((sum: number, n: number) => sum + n, 0);

  return {
    system: systemResult.text,
    user: userResult.text,
    promptUsage: { estimated, breakdown }
  };
}
