import { describe, expect, it } from "vitest";
import {
  applyStatePatch,
  createInitialPlaythrough,
  createPlaythroughFromSeed,
  takeTurnSnapshot
} from "../src/engine/engine";
import { DEMO_TEMPLATE } from "../src/engine/demoData";
import type { CharacterTemplate, ScenarioSeed } from "../src/schemas";

const SECOND_TEMPLATE: CharacterTemplate = {
  ...structuredClone(DEMO_TEMPLATE),
  id: "char_test_borg",
  name: "Borg",
};

function twoCastPlaythrough() {
  return createInitialPlaythrough("Two Cast", undefined, "default", "Default", undefined, [
    structuredClone(DEMO_TEMPLATE),
    structuredClone(SECOND_TEMPLATE)
  ]);
}

function makeSeed(): ScenarioSeed {
  return {
    locations: [
      { id: "loc_test", name: "Test Town", description: "A quiet place.", state: "", icon: "🏘️", connections: [] },
      { id: "loc_guild", name: "Adventurer Guild", description: "A bustling hall.", state: "", icon: "🏰", connections: ["loc_test"] },
    ],
    character: {
      name: "Sera",
      content: "[Species]: Human\n[Gender]: Female\n\n[Body]\n- Build: Slender\n\n[Personality]\n- Curious, measured, and calm.\n\n[Communication - Public]\nMeasured and calm.\n\n[Likes]\n- Finding the archive\n\n[Dislikes]\n- (not established)",
    },
    quest: {
      id: "quest_test",
      name: "The Archive",
      summary: "Find the hidden archive."
    },
    items: [
      { id: "item_potion", name: "Potion", type: "consumable", description: "Heals.", quantity: 1 }
    ],
    npcs: [
      { name: "Guard", description: "Town guard.", disposition: "gruff" }
    ],
    startingFlags: []
  };
}

describe("basic NPC lifecycle", () => {
  it("instantiates Mira from the demo template", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    expect(pt.characters.length).toBe(1);
    const mira = pt.characters[0];
    expect(mira.name).toBe("Mira");
    expect(mira.mood).toBe("neutral");
    expect(mira.towardPlayer).toBe("neutral");
    expect(mira.conditions.length).toBe(0);
  });

  it("creates a playthrough with two cast members", () => {
    const pt = twoCastPlaythrough();
    expect(pt.characters.length).toBe(2);
    expect(pt.characters[0].name).toBe("Mira");
    expect(pt.characters[1].name).toBe("Borg");
  });

  it("creates a playthrough from a scenario seed", () => {
    const seed = makeSeed();
    const pt = createPlaythroughFromSeed("Test Seed", seed);
    const sera = pt.characters[0];
    expect(sera.name).toBe("Sera");
    expect(sera.mood).toBe("neutral");
    expect(pt.npcs.length).toBe(1);
    expect(pt.npcs[0].name).toBe("Guard");
  });

  it("applies characterMood patch", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const result = applyStatePatch(pt, {
      characterMood: [{ characterId: pt.characters[0].id, mood: "furious" }]
    });
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.state.characters[0].mood).toBe("furious");
  });

  it("applies characterTowardPlayer patch", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const result = applyStatePatch(pt, {
      characterTowardPlayer: [{ characterId: pt.characters[0].id, towardPlayer: "suspicious" }]
    });
    expect(result.state.characters[0].towardPlayer).toBe("suspicious");
  });

  it("applies characterSectionUpdate patch", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const charId = pt.characters[0].id;

    const result = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: charId, section: "Appearance", content: "- Hair: Jet black, singed at the tips\n- Eyes: Piercing green" }]
    });
    expect(result.applied.length).toBeGreaterThan(0);
    const tpl = result.state.characterTemplates.find(t => t.id === pt.characters[0].templateId)!;
    expect(tpl.content).toContain("[Appearance]\n- Hair: Jet black");
  });

  it("rejects characterSectionUpdate with unknown section", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const charId = pt.characters[0].id;

    const result = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: charId, section: "FavoriteFood", content: "Pizza" }]
    });
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("rejects characterSectionUpdate for unknown character", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);

    const result = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: "nonexistent", section: "Appearance", content: "Whatever" }]
    });
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("applies characterConditionsAdd/Remove patches", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const charId = pt.characters[0].id;
    
    const addResult = applyStatePatch(pt, {
      characterConditionsAdd: [{ characterId: charId, conditions: ["🤕 wounded"] }]
    });
    expect(addResult.state.characters[0].conditions).toContain("🤕 wounded");
    
    const removeResult = applyStatePatch(addResult.state, {
      characterConditionsRemove: [{ characterId: charId, conditions: ["🤕 wounded"] }]
    });
    expect(removeResult.state.characters[0].conditions).not.toContain("🤕 wounded");
  });

  it("applies characterFlagsAdd/Remove patches", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const charId = pt.characters[0].id;
    
    const addResult = applyStatePatch(pt, {
      characterFlagsAdd: [{ characterId: charId, flags: ["knows_secret"] }]
    });
    expect(addResult.state.characters[0].flags).toContain("knows_secret");
    
    const removeResult = applyStatePatch(addResult.state, {
      characterFlagsRemove: [{ characterId: charId, flags: ["knows_secret"] }]
    });
    expect(removeResult.state.characters[0].flags).not.toContain("knows_secret");
  });

  it("applies characterMemory patch", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "default", undefined, undefined);
    const charId = pt.characters[0].id;
    const result = applyStatePatch(pt, {
      characterMemory: [{ characterId: charId, memorySummary: "Mira now distrusts the player." }]
    });
    expect(result.state.characters[0].memorySummary).toBe("Mira now distrusts the player.");
  });

  it("resolves characterId by name (case-insensitive)", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const result = applyStatePatch(pt, {
      characterMood: [{ characterId: "mira", mood: "elated" }]
    });
    expect(result.state.characters[0].mood).toBe("elated");
  });

  it("promotes a background NPC to main cast", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    // First add an NPC
    const withNpc = applyStatePatch(pt, {
      npcAdd: [{ name: "Shopkeep", description: "A friendly shopkeeper.", disposition: "friendly" }]
    });
    const npcId = withNpc.state.npcs[0].id;
    
    // Then promote
    const result = applyStatePatch(withNpc.state, {
      npcPromote: { npcId }
    });
    
    expect(result.applied.some(a => a.includes("promoted"))).toBe(true);
    expect(result.state.npcs.length).toBe(0);
    expect(result.state.characters.length).toBe(2);
    const promoted = result.state.characters[1];
    expect(promoted.name).toBe("Shopkeep");
    expect(promoted.mood).toBe("neutral");
  });

  it("promotes with a custom memorySummary", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const withNpc = applyStatePatch(pt, { npcAdd: [{ name: "Shopkeep", description: "A friendly shopkeeper.", disposition: "friendly" }] });
    const npcId = withNpc.state.npcs[0].id;
    const result = applyStatePatch(withNpc.state, { npcPromote: { npcId, memorySummary: "Shopkeep — Cheerful" } });
    const promoted = result.state.characters[1];
    expect(promoted.memorySummary).toBe("Shopkeep — Cheerful");
  });

  it("promotes without content into a starter sheet preserving the NPC info", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const withNpc = applyStatePatch(pt, {
      npcAdd: [{ name: "Shopkeep", description: "A friendly shopkeeper.", disposition: "friendly" }]
    });
    const npcId = withNpc.state.npcs[0].id;
    const result = applyStatePatch(withNpc.state, { npcPromote: { npcId } });
    const promoted = result.state.characters[1];
    const template = result.state.characterTemplates.find((t) => t.id === promoted.templateId);
    // The starter sheet must not lose the NPC's recorded info.
    expect(template?.content).toContain("A friendly shopkeeper.");
    expect(template?.content).toContain("friendly");
    expect(template?.content).toContain("(unknown)");
  });

  it("promote with content stores the sheet verbatim on the promoted template", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const withNpc = applyStatePatch(pt, { npcAdd: [{ name: "Borg", description: "Gruff blacksmith" }] });
    const npcId = withNpc.state.npcs[0].id;
    const sheet = "[Species]: Dwarf\n\n[Body]\n- Height: short\n\n[Personality]\n- Sturdy and quiet";
    const result = applyStatePatch(withNpc.state, { npcPromote: { npcId, content: sheet, memorySummary: "Borg — Sturdy and quiet" } });
    const promoted = result.state.characters.find((c) => c.name === "Borg");
    const template = result.state.characterTemplates.find((t) => t.id === promoted?.templateId);
    expect(template?.content).toBe(sheet);
    expect(promoted?.memorySummary).toBe("Borg — Sturdy and quiet");
  });

  it("snapshot includes characters and characterTemplates", () => {
    const pt = createInitialPlaythrough("Test", undefined, "default", "Default", undefined, undefined);
    const snap = takeTurnSnapshot(pt);
    expect(snap.characters.length).toBe(1);
    expect(snap.characterTemplates.length).toBe(1);
  });
});
