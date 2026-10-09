import {
  CharacterFormat,
  CharacterInstance,
  CharacterTemplate,
  EMPTY_MODULE_SET,
  Item,
  ParsedUserInput,
  PlayerPersona,
  Playthrough,
  PromptModuleSet,
  ScenarioSeed,
  ImageGenerationSettings,
  TurnSnapshot,
  AssistantTurn,
  ChatMessage
} from "../schemas";
import { parseClothingFromContent } from "./characterSections";
import { DEMO_TEMPLATE, ITEMS, STARTER_INVENTORY, STARTER_WORLD_STATE } from "./demoData";

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
  memorySummary = `${template.name} has not formed a strong opinion of the player yet.`
): CharacterInstance {
  const createdAt = nowIso();
  return {
    id: newId("inst"),
    templateId: template.id,
    playthroughId,
    branchId,
    name: template.name,
    storyRole: "Stranger",
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
  persona?: PlayerPersona,
  cast?: CharacterTemplate[]
): Playthrough {
  const createdAt = nowIso();
  const playthroughId = newId("play");
  const branchId = newId("branch");

  const castTemplates = cast ?? [DEMO_TEMPLATE];
  const characters = castTemplates.map((t) => instantiateTemplate(t, playthroughId, branchId));

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
    schemaVersion: 2,
    id: playthroughId,
    name,
    branchId,
    turn: 0,
    worldState: [],
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
    activeCharacters: characters.map((c) => c.id),
    characterTemplates: clone(castTemplates),
    inventory: clone(STARTER_INVENTORY),
    memoryLayers: { recent: [], compressed: [] },
    memoryEvents: [],
    messages: [],
    snapshots: {},
    lorebookIds: [],
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
  persona?: PlayerPersona,
  cast?: CharacterTemplate[],
  includeOpening = true
): Playthrough {
  const createdAt = nowIso();
  const playthroughId = newId("play");
  const branchId = newId("branch");

  const castTemplates = cast ?? [];
  const castNames = new Set(castTemplates.map((t) => t.name.trim().toLowerCase()));

  let characters: CharacterInstance[];
  let characterTemplates: CharacterTemplate[];

  if (castTemplates.length === 0) {
    const template: CharacterTemplate = {
      id: newId("tmpl"), name: seed.character.name, version: 1,
      content: seed.character.content, summary: "", startingClothing: [],
    };
    characters = [instantiateTemplate(template, playthroughId, branchId)];
    characterTemplates = [template];
  } else {
    const lead = castTemplates.find((t) => t.name.trim().toLowerCase() === seed.character.name.trim().toLowerCase())
      ?? castTemplates[0];
    const ordered = [lead, ...castTemplates.filter((t) => t.id !== lead.id)];
    characters = ordered.map((t) => instantiateTemplate(t, playthroughId, branchId));
    characterTemplates = clone(ordered);
  }

  // Map seed.additionalCharacters into simple instances
  for (const ac of seed.additionalCharacters) {
    if (!castNames.has(ac.name.trim().toLowerCase())) {
      const createdAt = nowIso();
      const inst: CharacterInstance = {
        id: newId("inst"),
        playthroughId,
        branchId,
        name: ac.name,
        storyRole: ac.storyRole || "Stranger",
        description: ac.description,
        mood: "neutral",
        towardPlayer: "neutral",
        memorySummary: `${ac.name} has not formed a strong opinion of the player yet.`,
        conditions: [],
        flags: [],
        clothing: [],
        createdAt,
        updatedAt: createdAt
      };
      characters.push(inst);
    }
  }

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

  return {
    schemaVersion: 2,
    id: playthroughId,
    name,
    branchId,
    turn: 0,
    worldState: seed.startingWorldState.map((ws, i) => ({ id: `ws_${i}`, name: ws.name, description: ws.description })),
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
    characters,
    activeCharacters: characters.map((c) => c.id),
    characterTemplates,
    inventory,
    itemCatalog: items,
    memoryEvents: [],
    messages: includeOpening && seed.openingText?.trim()
      ? [{ id: newId("msg"), role: "assistant", content: seed.openingText.trim(), createdAt, turn: 0 }]
      : [],
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
  persona?: PlayerPersona,
  cast: CharacterTemplate[] = []
): Playthrough {
  const createdAt = nowIso();
  const playthroughId = newId("play");
  const branchId = newId("branch");

  const characters = cast.map((t) => instantiateTemplate(t, playthroughId, branchId));

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
    schemaVersion: 2,
    id: playthroughId,
    name,
    branchId,
    turn: 0,
    worldState: [],
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
    activeCharacters: characters.map((c) => c.id),
    characterTemplates: clone(cast),
    inventory: [],
    memoryLayers: { recent: [], compressed: [] },
    memoryEvents: [],
    messages: [],
    snapshots: {},
    lorebookIds: [],
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
    worldState: playthrough.worldState,
    playerCharacter: playthrough.playerCharacter,
    characters: playthrough.characters,
    activeCharacters: playthrough.activeCharacters,
    characterTemplates: playthrough.characterTemplates,
    inventory: playthrough.inventory,
    itemCatalog: playthrough.itemCatalog,
    memoryEvents: playthrough.memoryEvents,
    memoryLayers: playthrough.memoryLayers,
    lorebookIds: playthrough.lorebookIds,
    lorebookTimingStates: playthrough.lorebookTimingStates,
    chapters: playthrough.chapters ?? [],
    storyMetaSummaries: playthrough.storyMetaSummaries ?? [],
    currentChapterStartedAtTurn: playthrough.currentChapterStartedAtTurn ?? 1,
  });
}

/**
 * Restores a playthrough's world state from a pre-turn snapshot, in place.
 * Snapshots hold no message content, so restoring never touches the message list.
 */
export function restoreSnapshotState(target: Playthrough, snapshot: TurnSnapshot | undefined): void {
  if (!snapshot) return;
  target.turn = snapshot.turn;
  target.worldState = clone(snapshot.worldState);
  target.playerCharacter = clone(snapshot.playerCharacter);
  target.characters = clone(snapshot.characters);
  target.activeCharacters = clone(snapshot.activeCharacters);
  target.characterTemplates = clone(snapshot.characterTemplates);
  target.inventory = clone(snapshot.inventory);
  target.memoryEvents = clone(snapshot.memoryEvents);
  // memoryLayers were being captured by takeTurnSnapshot but never restored,
  // so a reverted branch kept the latest layers in its Journal. Restore them
  // so the branch's memory view matches its branch point.
  target.memoryLayers = snapshot.memoryLayers ? clone(snapshot.memoryLayers) : target.memoryLayers;
  target.lorebookIds = snapshot.lorebookIds ?? [];
  target.lorebookTimingStates = snapshot.lorebookTimingStates
    ? clone(snapshot.lorebookTimingStates)
    : undefined;
  target.itemCatalog = snapshot.itemCatalog
    ? clone(snapshot.itemCatalog)
    : undefined;
  target.chapters = clone(snapshot.chapters ?? []);
  target.storyMetaSummaries = clone(snapshot.storyMetaSummaries ?? []);
  target.currentChapterStartedAtTurn = snapshot.currentChapterStartedAtTurn ?? 1;
}

/**
 * Ensures all chat messages have a valid `turn` field, backfilling based on sequence
 * if missing on legacy records.
 */
export function ensureMessageTurns(messages: ChatMessage[]): void {
  let currentTurn = 0;
  for (let i = 0; i < messages.length; i++) {
    const msg = messages[i];
    if (typeof msg.turn === "number") {
      currentTurn = msg.turn;
    } else {
      if (msg.role === "user") {
        currentTurn += 1;
        msg.turn = currentTurn;
      } else if (msg.role === "assistant") {
        msg.turn = (i === 0 && currentTurn === 0) ? 0 : currentTurn;
      } else {
        msg.turn = currentTurn;
      }
    }
  }
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
