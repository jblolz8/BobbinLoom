import {
  CharacterInstance,
  CharacterTemplate,
  EMPTY_MODULE_SET,
  Item,
  LocationEntry,
  ParsedUserInput,
  PlayerPersona,
  Playthrough,
  PromptModuleSet,
  ScenarioSeed,
  SimpleNPC,
  TurnSnapshot,
  AssistantTurn
} from "../schemas";
import { parseClothingFromContent } from "./characterSections";
import { DEMO_TEMPLATE, ITEMS, LOCATIONS, STARTER_INVENTORY, STARTER_QUESTS } from "./demoData";

function newId(prefix: string): string {
  const cryptoObj = globalThis.crypto as Crypto | undefined;
  if (cryptoObj?.randomUUID) return `${prefix}_${cryptoObj.randomUUID()}`;
  return `${prefix}_${Math.random().toString(36).slice(2)}`;
}

function nowIso(): string {
  return new Date().toISOString();
}

function clone<T>(value: T): T {
  return structuredClone(value);
}

export function parseUserInput(raw: string): ParsedUserInput {
  const spokenText: string[] = [];
  const quotePattern = /"([^"]*)"/g;
  let match: RegExpExecArray | null;

  while ((match = quotePattern.exec(raw)) !== null) {
    if (match[1].trim()) spokenText.push(match[1].trim());
  }

  const actionText = raw
    .replace(quotePattern, " ")
    .replace(/\s+/g, " ")
    .trim();

  return {
    raw,
    actionText,
    spokenText
  };
}

export function instantiateTemplate(
  template: CharacterTemplate,
  playthroughId: string,
  branchId: string,
  locationId: string,
  memorySummary = `${template.name} has not formed a strong opinion of the player yet.`
): CharacterInstance {
  const createdAt = nowIso();
  return {
    id: newId("inst"),
    templateId: template.id,
    playthroughId,
    branchId,
    name: template.name,
    currentLocationId: locationId,
    mood: "neutral",
    towardPlayer: "neutral",
    memorySummary,
    conditions: [],
    flags: [],
    clothing: template.startingClothing.length > 0 ? clone(template.startingClothing) : parseClothingFromContent(template.content),
    createdAt,
    updatedAt: createdAt
  };
}

export function createInitialPlaythrough(
  name: string,
  modules: PromptModuleSet = EMPTY_MODULE_SET,
  presetId = "default",
  presetName = "Default",
  persona?: PlayerPersona,
  cast?: CharacterTemplate[]
): Playthrough {
  const createdAt = nowIso();
  const playthroughId = newId("play");
  const branchId = newId("branch");

  const castTemplates = cast ?? [DEMO_TEMPLATE];
  const characters = castTemplates.map((t) => instantiateTemplate(t, playthroughId, branchId, LOCATIONS[0].id));

  const p = persona ?? {
    id: "persona_default",
    name: "Player",
    description: "A newcomer, ready for anything.",
    bodyType: "average",
    appearance: "Travel-worn clothes, alert posture.",
    initialClothing: [],
    isDefault: true,
  };

  return {
    schemaVersion: 1,
    id: playthroughId,
    name,
    branchId,
    turn: 0,
    locationId: LOCATIONS[0].id,
    flags: [],
    playerCharacter: {
      name: p.name,
      description: p.description,
      bodyType: p.bodyType,
      appearance: p.appearance,
      clothing: clone(p.initialClothing),
      conditions: [],
      flags: [],
    },
    characters,
    characterTemplates: clone(castTemplates),
    npcs: [],
    inventory: clone(STARTER_INVENTORY),
    quests: clone(STARTER_QUESTS),
    memoryLayers: { recent: [], compressed: [] },
    promptSettings: { presetId, presetName, modules },
    memoryEvents: [],
    messages: [],
    snapshots: {},
    lorebookIds: [],
    locationCatalog: LOCATIONS,
    itemCatalog: ITEMS,
    chapters: [],
    storyMetaSummaries: [],
    currentChapterStartedAtTurn: 1,
    createdAt,
    updatedAt: createdAt
  };
}

export function createPlaythroughFromSeed(
  name: string,
  seed: ScenarioSeed,
  modules: PromptModuleSet = EMPTY_MODULE_SET,
  presetId = "default",
  presetName = "Default",
  persona?: PlayerPersona,
  cast?: CharacterTemplate[]
): Playthrough {
  const createdAt = nowIso();
  const playthroughId = newId("play");
  const branchId = newId("branch");

  const template: CharacterTemplate = {
    id: newId("tmpl"),
    name: seed.character.name,
    version: 1,
    content: seed.character.content,
    summary: "",
    startingClothing: [],
  };

  const startLocationId = seed.locations[0].id;

  const seedCharacter = instantiateTemplate(template, playthroughId, branchId, startLocationId);
  const castTemplates = cast ?? [];
  const castCharacters = castTemplates.map((t) => instantiateTemplate(t, playthroughId, branchId, startLocationId));

  const npcs: SimpleNPC[] = seed.npcs.map((n) => ({
    id: newId("npc"),
    name: n.name,
    description: n.description,
    disposition: n.disposition,
    locationId: startLocationId,
    createdAt
  }));

  const items: Item[] = seed.items.map((si) => ({
    id: si.id,
    name: si.name,
    type: si.type,
    description: si.description,
    stackable: si.type === "consumable" || si.type === "misc" || si.quantity > 1
  }));

  const inventory = seed.items.map((si) => ({
    itemId: si.id,
    quantity: si.quantity
  }));

  const locationCatalog: LocationEntry[] = seed.locations.map((loc, i) => ({
    id: loc.id,
    name: loc.name,
    description: loc.description,
    state: loc.state,
    icon: loc.icon,
    connections: loc.connections,
    x: i === 0 ? 0 : (Math.cos((i - 1) * 2.4) * 100),
    y: i === 0 ? 0 : (Math.sin((i - 1) * 2.4) * 100),
  }));

  return {
    schemaVersion: 1,
    id: playthroughId,
    name,
    branchId,
    turn: 0,
    locationId: startLocationId,
    flags: seed.startingFlags,
    playerCharacter: (() => {
      const p = persona ?? {
        id: "persona_default",
        name: "Player",
        description: "A newcomer, ready for anything.",
        bodyType: "average",
        appearance: "Travel-worn clothes, alert posture.",
        initialClothing: [],
        isDefault: true,
      };
      return {
        name: p.name,
        description: p.description,
        bodyType: p.bodyType,
        appearance: p.appearance,
        clothing: clone(p.initialClothing),
        conditions: [],
        flags: [],
      };
    })(),
    characters: [seedCharacter, ...castCharacters],
    characterTemplates: clone([template, ...castTemplates]),
    npcs,
    inventory,
    quests: [
      {
        id: seed.quest.id,
        name: seed.quest.name,
        summary: seed.quest.summary,
        tracking: false,
        status: "active"
      }
    ],
    locationCatalog,
    itemCatalog: items,
    promptSettings: { presetId, presetName, modules },
    memoryEvents: [],
    messages: [],
    snapshots: {},
    lorebookIds: [],
    chapters: [],
    storyMetaSummaries: [],
    currentChapterStartedAtTurn: 1,
    createdAt,
    updatedAt: createdAt
  };
}

export function createBlankPlaythrough(
  name: string,
  modules: PromptModuleSet = EMPTY_MODULE_SET,
  presetId = "default",
  presetName = "Default",
  persona?: PlayerPersona,
  cast: CharacterTemplate[] = []
): Playthrough {
  const createdAt = nowIso();
  const playthroughId = newId("play");
  const branchId = newId("branch");

  const characters = cast.map((t) => instantiateTemplate(t, playthroughId, branchId, "unknown"));

  const p = persona ?? {
    id: "persona_default",
    name: "Player",
    description: "A newcomer, ready for anything.",
    bodyType: "average",
    appearance: "Travel-worn clothes, alert posture.",
    initialClothing: [],
    isDefault: true,
  };

  return {
    schemaVersion: 1,
    id: playthroughId,
    name,
    branchId,
    turn: 0,
    locationId: "unknown",
    flags: [],
    playerCharacter: {
      name: p.name,
      description: p.description,
      bodyType: p.bodyType,
      appearance: p.appearance,
      clothing: clone(p.initialClothing),
      conditions: [],
      flags: [],
    },
    characters,
    characterTemplates: clone(cast),
    npcs: [],
    inventory: [],
    quests: [],
    memoryLayers: { recent: [], compressed: [] },
    promptSettings: { presetId, presetName, modules },
    memoryEvents: [],
    messages: [],
    snapshots: {},
    lorebookIds: [],
    locationCatalog: [{ id: "unknown", name: "Unknown", description: "An unwritten world.", state: "", icon: "📍", connections: [], x: 0, y: 0 }],
    itemCatalog: [],
    chapters: [],
    storyMetaSummaries: [],
    currentChapterStartedAtTurn: 1,
    createdAt,
    updatedAt: createdAt
  };
}

export function takeTurnSnapshot(playthrough: Playthrough): TurnSnapshot {
  return clone({
    turn: playthrough.turn,
    locationId: playthrough.locationId,
    flags: playthrough.flags,
    playerCharacter: playthrough.playerCharacter,
    characters: playthrough.characters,
    characterTemplates: playthrough.characterTemplates,
    npcs: playthrough.npcs,
    inventory: playthrough.inventory,
    quests: playthrough.quests,
    memoryEvents: playthrough.memoryEvents,
    lorebookIds: playthrough.lorebookIds,
    locationCatalog: playthrough.locationCatalog,
    memoryLayers: playthrough.memoryLayers,
    chapters: playthrough.chapters ?? [],
    storyMetaSummaries: playthrough.storyMetaSummaries ?? [],
    currentChapterStartedAtTurn: playthrough.currentChapterStartedAtTurn ?? 1,
  });
}

export function buildMockAssistantTurn(
  input: ParsedUserInput,
  state: Playthrough,
  choicesEnabled: boolean
): AssistantTurn {
  const spoken = input.spokenText.length > 0 ? ` You said, "${input.spokenText[0]}"` : "";
  const narrative = `The room settles around your decision.${spoken} Mira watches you carefully, weighing whether your action was impulse or intent.`;

  return {
    narrative,
    choices: choicesEnabled
      ? ["Ask Mira what she wants", "Check your inventory", "Look around the room"]
      : undefined,
    statePatch: {
      memoryEvents: [
        {
          type: "conversation",
          summary: `Player acted: ${input.raw.slice(0, 80)}`,
          importance: 1,
          tags: ["turn"]
        }
      ]
    }
  };
}
