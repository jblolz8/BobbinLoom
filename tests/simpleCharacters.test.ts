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
  return createInitialPlaythrough("Two Cast", undefined, [
    structuredClone(DEMO_TEMPLATE),
    structuredClone(SECOND_TEMPLATE)
  ]);
}

function makeSeed(): ScenarioSeed {
  return {
    character: {
      name: "Sera",
      content: "[Species]: Human\n[Gender]: Female\n\n[Body]\n- Build: Slender\n\n[Personality]\n- Curious, measured, and calm.\n\n[Communication - Public]\nMeasured and calm.\n\n[Likes]\n- Finding the archive\n\n[Dislikes]\n- (not established)",
    },
    startingWorldState: [],
    items: [
      { id: "item_potion", name: "Potion", type: "consumable", description: "Heals.", quantity: 1 }
    ],
    additionalCharacters: [
      { name: "Guard", description: "Town guard.", storyRole: "gruff" }
    ],

  };
}

describe("simple characters and character lifecycle", () => {
  it("instantiates Mira from the demo template", () => {
    const pt = createInitialPlaythrough("Test");
    expect(pt.characters.length).toBe(1);
    const mira = pt.characters[0];
    expect(mira.name).toBe("Mira");
    expect(mira.mood).toBe("neutral");
    expect(mira.towardPlayer).toBe("neutral");
    expect(mira.conditions.length).toBe(0);
    expect(pt.activeCharacters).toContain(mira.id);
  });

  it("creates a playthrough with two cast members", () => {
    const pt = twoCastPlaythrough();
    expect(pt.characters.length).toBe(2);
    expect(pt.characters[0].name).toBe("Mira");
    expect(pt.characters[1].name).toBe("Borg");
    expect(pt.activeCharacters).toHaveLength(2);
  });

  it("creates a playthrough from a scenario seed with additional simple characters", () => {
    const seed = makeSeed();
    const pt = createPlaythroughFromSeed("Test Seed", seed);
    const sera = pt.characters[0];
    expect(sera.name).toBe("Sera");
    expect(sera.mood).toBe("neutral");
    expect(sera.templateId).toBeDefined();
    expect(pt.characters.length).toBe(2);
    const guard = pt.characters[1];
    expect(guard.name).toBe("Guard");
    expect(guard.templateId).toBeDefined();
    expect(guard.storyRole).toBe("gruff");
  });

  it("applies characterMood patch", () => {
    const pt = createInitialPlaythrough("Test");
    const result = applyStatePatch(pt, {
      characterMood: [{ characterId: pt.characters[0].id, mood: "furious" }]
    });
    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.state.characters[0].mood).toBe("furious");
  });

  it("applies characterTowardPlayer patch", () => {
    const pt = createInitialPlaythrough("Test");
    const result = applyStatePatch(pt, {
      characterTowardPlayer: [{ characterId: pt.characters[0].id, towardPlayer: "suspicious" }]
    });
    expect(result.state.characters[0].towardPlayer).toBe("suspicious");
  });

  it("applies characterSectionUpdate patch", () => {
    const pt = createInitialPlaythrough("Test");
    const charId = pt.characters[0].id;

    const result = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: charId, section: "Appearance", content: "- Hair: Jet black, singed at the tips\n- Eyes: Piercing green" }]
    });
    expect(result.applied.length).toBeGreaterThan(0);
    const tpl = result.state.characterTemplates.find(t => t.id === pt.characters[0].templateId)!;
    expect(tpl.content).toContain("[Appearance]\n- Hair: Jet black");
  });

  it("characterSectionUpdate accepts any header and inserts a missing section", () => {
    const pt = createInitialPlaythrough("Test");
    const charId = pt.characters[0].id;

    const result = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: charId, section: "FavoriteFood", content: "Pizza" }]
    });
    expect(result.rejected.length).toBe(0);
    const tpl = result.state.characterTemplates.find(t => t.id === pt.characters[0].templateId)!;
    expect(tpl.content).toContain("[FavoriteFood]\nPizza");
  });

  it("characterSectionRemove deletes a whole section (and clears structured clothing)", () => {
    const pt = createInitialPlaythrough("Test");
    const charId = pt.characters[0].id;
    const tplId = pt.characters[0].templateId;

    const result = applyStatePatch(pt, {
      characterSectionRemove: [{ characterId: charId, section: "Dislikes" }]
    });
    expect(result.rejected.length).toBe(0);
    expect(result.state.characterTemplates.find(t => t.id === tplId)!.content).not.toContain("[Dislikes]");
    // Removing an absent section rejects.
    const again = applyStatePatch(result.state, {
      characterSectionRemove: [{ characterId: charId, section: "Dislikes" }]
    });
    expect(again.rejected.length).toBeGreaterThan(0);
  });

  it("characterSectionRename renames a header and preserves its body", () => {
    const pt = createInitialPlaythrough("Test");
    const charId = pt.characters[0].id;
    const tplId = pt.characters[0].templateId;

    const result = applyStatePatch(pt, {
      characterSectionRename: [{ characterId: charId, from: "Personality", to: "Temperament" }]
    });
    expect(result.rejected.length).toBe(0);
    const tpl = result.state.characterTemplates.find(t => t.id === tplId)!;
    expect(tpl.content).toContain("[Temperament]");
    expect(tpl.content).not.toContain("[Personality]");
  });

  it("rejects characterSectionUpdate for unknown character", () => {
    const pt = createInitialPlaythrough("Test");

    const result = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: "nonexistent", section: "Appearance", content: "Whatever" }]
    });
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("applies characterConditionsAdd/Remove patches", () => {
    const pt = createInitialPlaythrough("Test");
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
    const pt = createInitialPlaythrough("Test");
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
    const pt = createInitialPlaythrough("Test");
    const charId = pt.characters[0].id;
    const result = applyStatePatch(pt, {
      characterMemory: [{ characterId: charId, memorySummary: "Mira now distrusts the player." }]
    });
    expect(result.state.characters[0].memorySummary).toBe("Mira now distrusts the player.");
  });

  it("resolves characterId by name (case-insensitive)", () => {
    const pt = createInitialPlaythrough("Test");
    const result = applyStatePatch(pt, {
      characterMood: [{ characterId: "mira", mood: "elated" }]
    });
    expect(result.state.characters[0].mood).toBe("elated");
  });

  it("adds a simple character and manages scene presence", () => {
    const pt = createInitialPlaythrough("Test");
    const withSimple = applyStatePatch(pt, {
      characterAddSimple: [{ name: "Shopkeep", description: "A friendly shopkeeper.", storyRole: "Merchant" }]
    });
    expect(withSimple.applied.some(a => a.includes("simple character added"))).toBe(true);
    expect(withSimple.state.characters.length).toBe(2);
    const shopkeep = withSimple.state.characters[1];
    expect(shopkeep.name).toBe("Shopkeep");
    expect(shopkeep.templateId).toBeUndefined();
    expect(shopkeep.storyRole).toBe("Merchant");
    expect(withSimple.state.activeCharacters).toContain(shopkeep.id);

    // Character exits scene
    const exitResult = applyStatePatch(withSimple.state, {
      characterExitScene: [shopkeep.id]
    });
    expect(exitResult.state.activeCharacters).not.toContain(shopkeep.id);

    // Character enters scene
    const enterResult = applyStatePatch(exitResult.state, {
      characterEnterScene: [shopkeep.id]
    });
    expect(enterResult.state.activeCharacters).toContain(shopkeep.id);

    // Update role
    const roleResult = applyStatePatch(enterResult.state, {
      characterUpdateRole: [{ characterId: shopkeep.id, storyRole: "Allied Merchant" }]
    });
    expect(roleResult.state.characters.find(c => c.id === shopkeep.id)?.storyRole).toBe("Allied Merchant");
  });

  it("fleshes out a simple character into a detailed character", () => {
    const pt = createInitialPlaythrough("Test");
    const withSimple = applyStatePatch(pt, {
      characterAddSimple: [{ name: "Shopkeep", description: "A friendly shopkeeper.", storyRole: "Merchant" }]
    });
    const shopkeepId = withSimple.state.characters[1].id;

    const result = applyStatePatch(withSimple.state, {
      characterFleshOut: { characterId: shopkeepId }
    });

    expect(result.applied.some(a => a.includes("character fleshed out"))).toBe(true);
    const fleshed = result.state.characters.find(c => c.id === shopkeepId)!;
    expect(fleshed.templateId).toBeDefined();
    const template = result.state.characterTemplates.find(t => t.id === fleshed.templateId);
    expect(template).toBeDefined();
    expect(template?.content).toContain("A friendly shopkeeper.");
  });

  it("fleshes out with custom memorySummary", () => {
    const pt = createInitialPlaythrough("Test");
    const withSimple = applyStatePatch(pt, {
      characterAddSimple: [{ name: "Shopkeep", description: "A friendly shopkeeper.", storyRole: "Merchant" }]
    });
    const shopkeepId = withSimple.state.characters[1].id;
    const result = applyStatePatch(withSimple.state, {
      characterFleshOut: { characterId: shopkeepId, memorySummary: "Shopkeep — Cheerful" }
    });
    const fleshed = result.state.characters.find(c => c.id === shopkeepId)!;
    expect(fleshed.memorySummary).toBe("Shopkeep — Cheerful");
  });

  it("flesh out with content stores the sheet verbatim on the template", () => {
    const pt = createInitialPlaythrough("Test");
    const withSimple = applyStatePatch(pt, {
      characterAddSimple: [{ name: "Borg", description: "Gruff blacksmith", storyRole: "Blacksmith" }]
    });
    const borgId = withSimple.state.characters[1].id;
    const sheet = "[Species]: Dwarf\n\n[Body]\n- Height: short\n\n[Personality]\n- Sturdy and quiet";
    const result = applyStatePatch(withSimple.state, {
      characterFleshOut: { characterId: borgId, content: sheet, memorySummary: "Borg — Sturdy and quiet" }
    });
    const fleshed = result.state.characters.find((c) => c.id === borgId)!;
    const template = result.state.characterTemplates.find((t) => t.id === fleshed.templateId);
    expect(template?.content).toBe(sheet);
    expect(fleshed.memorySummary).toBe("Borg — Sturdy and quiet");
  });

  it("rejects fleshing out an already detailed character", () => {
    const pt = createInitialPlaythrough("Test");
    const result = applyStatePatch(pt, {
      characterFleshOut: { characterId: pt.characters[0].id }
    });
    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0]).toContain("already detailed");
  });

  it("snapshot includes activeCharacters, characters and characterTemplates", () => {
    const pt = createInitialPlaythrough("Test");
    const snap = takeTurnSnapshot(pt);
    expect(snap.characters.length).toBe(1);
    expect(snap.activeCharacters).toEqual([pt.characters[0].id]);
    expect(snap.characterTemplates.length).toBe(1);
  });
});
