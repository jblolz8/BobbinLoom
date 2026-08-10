import { describe, expect, it } from "vitest";
import {
  applyStatePatch,
  buildMockAssistantTurn,
  createInitialPlaythrough,
  instantiateTemplate,
  parseUserInput
} from "../src/engine/engine";
import type { CharacterTemplate, Playthrough } from "../src/schemas";
import { DEMO_TEMPLATE } from "../src/engine/demoData";

describe("parseUserInput", () => {
  it("separates plain text actions from quoted dialogue", () => {
    const parsed = parseUserInput('I look around the room and say, "Anyone here?"');

    expect(parsed.raw).toContain("Anyone here?");
    expect(parsed.actionText).toContain("I look around the room");
    expect(parsed.spokenText).toEqual(["Anyone here?"]);
  });
});

describe("createInitialPlaythrough", () => {
  it("creates a playthrough with a dynamic character instance and starter RPG state", () => {
    const playthrough = createInitialPlaythrough("Test Run");

    expect(playthrough.name).toBe("Test Run");
    expect(playthrough.characters.length).toBeGreaterThan(0);
    expect(playthrough.characters[0].templateId).toBeTruthy();
    expect(playthrough.inventory.length).toBeGreaterThan(0);
    expect(playthrough.quests.length).toBeGreaterThan(0);
  });

  it("includes a player character with default values", () => {
    const playthrough = createInitialPlaythrough("Player Test");

    expect(playthrough.playerCharacter).toBeDefined();
    expect(playthrough.playerCharacter.name).toBe("Player");
    expect(playthrough.playerCharacter.clothing).toEqual([]);
    expect(playthrough.playerCharacter.conditions).toEqual([]);
  });
});

describe("applyStatePatch", () => {
  it("applies valid inventory, flag, and quest updates", () => {
    const playthrough = createInitialPlaythrough("Patch Test");

    const result = applyStatePatch(playthrough, {
      flagsAdd: ["met_mira"],
      inventoryAdd: [{ itemId: "potion", quantity: 2 }],
      questUpdate: [{ questId: "first_steps", status: "active" }]
    });

    expect(result.rejected).toEqual([]);
    expect(result.state.flags).toContain("met_mira");
    expect(result.state.inventory.find((item) => item.itemId === "potion")?.quantity).toBeGreaterThanOrEqual(2);
    expect(result.state.quests.find((quest) => quest.id === "first_steps")?.status).toBe("active");
  });

  it("rejects unknown quest updates", () => {
    const playthrough = createInitialPlaythrough("Reject Test");

    const result = applyStatePatch(playthrough, {
      questUpdate: [{ questId: "missing_quest", status: "completed" }]
    });

    expect(result.state.quests.every((quest) => quest.id !== "missing_quest")).toBe(true);
    expect(result.rejected.length).toBeGreaterThan(0);
  });

  it("manages player clothing add/remove/setState", () => {
    const playthrough = createInitialPlaythrough("Clothing Test");
    const result = applyStatePatch(playthrough, {
      playerClothingAdd: [{ slot: "Top", name: "Leather Jacket", state: "pristine" }]
    });
    expect(result.state.playerCharacter.clothing.length).toBe(1);
    expect(result.state.playerCharacter.clothing[0].slot).toBe("Top");

    const result2 = applyStatePatch(result.state, {
      playerClothingSetState: [{ slot: "Top", state: "torn" }]
    });
    expect(result2.state.playerCharacter.clothing[0].state).toBe("torn");

    const result3 = applyStatePatch(result2.state, {
      playerClothingRemove: [{ slot: "Top" }]
    });
    expect(result3.state.playerCharacter.clothing.length).toBe(0);
  });

  it("manages player conditions and flags", () => {
    const playthrough = createInitialPlaythrough("Conditions Test");
    const result = applyStatePatch(playthrough, {
      playerConditionsAdd: ["wounded"],
      playerFlagsAdd: ["found_secret"]
    });
    expect(result.state.playerCharacter.conditions).toContain("wounded");
    expect(result.state.playerCharacter.flags).toContain("found_secret");

    const result2 = applyStatePatch(result.state, {
      playerConditionsRemove: ["wounded"],
      playerFlagsRemove: ["found_secret"]
    });
    expect(result2.state.playerCharacter.conditions).not.toContain("wounded");
    expect(result2.state.playerCharacter.flags).not.toContain("found_secret");
  });
});

describe("buildMockAssistantTurn", () => {
  it("returns narrative and optional choices with a memory patch", () => {
    const playthrough = createInitialPlaythrough("Mock Turn Test");
    const parsed = parseUserInput('I wave and say, "Hello."');

    const turn = buildMockAssistantTurn(parsed, playthrough, true);

    expect(turn.narrative.length).toBeGreaterThan(0);
    expect(turn.choices?.length).toBeGreaterThan(0);
    expect(turn.statePatch?.memoryEvents?.length).toBe(1);
  });
});

describe("structured clothing", () => {
  it("instantiateTemplate seeds clothing from template.startingClothing", () => {
    const template: CharacterTemplate = {
      id: "t_cloth",
      name: "Raya",
      version: 1,
      content: "[Clothing]\n- Top: Old tunic",
      summary: "",
      startingClothing: [{ slot: "Top", name: "Silk blouse" }],
    };
    const instance = instantiateTemplate(template, "p", "b", "loc");
    expect(instance.clothing).toEqual([{ slot: "Top", name: "Silk blouse" }]);
  });

  it("instantiateTemplate falls back to parsing the [Clothing] section when startingClothing is empty", () => {
    const template: CharacterTemplate = {
      id: "t_cloth2",
      name: "Raya",
      version: 1,
      content: "[Clothing]\n- Top: Linen tunic\n- Feet: Sandals",
      summary: "",
      startingClothing: [],
    };
    const instance = instantiateTemplate(template, "p", "b", "loc");
    expect(instance.clothing).toEqual([
      { slot: "Top", name: "Linen tunic" },
      { slot: "Feet", name: "Sandals" },
    ]);
  });

  it("instantiateTemplate does not mutate the template's startingClothing", () => {
    const startingClothing: CharacterTemplate["startingClothing"] = [{ slot: "Top", name: "Vest" }];
    const template: CharacterTemplate = { id: "t_cloth3", name: "Raya", version: 1, content: "", summary: "", startingClothing };
    const instance = instantiateTemplate(template, "p", "b", "loc");
    instance.clothing[0].state = "torn";
    expect(startingClothing[0].state).toBeUndefined();
  });

  it("createInitialPlaythrough seeds clothing from the demo template's startingClothing (no [Clothing] section in content)", () => {
    const playthrough = createInitialPlaythrough("Clothing Seed Test");
    expect(playthrough.characters[0].clothing.map((c) => c.slot).sort()).toEqual(
      DEMO_TEMPLATE.startingClothing.map((c) => c.slot).sort()
    );
  });
});

describe("applyStatePatch — character clothing", () => {
  function withClothing(): Playthrough {
    return createInitialPlaythrough("Char Clothing Test");
  }

  it("characterClothingAdd appends items and does not re-add an occupied slot", () => {
    const pt = withClothing();
    const initial = pt.characters[0].clothing.length;
    const r = applyStatePatch(pt, {
      characterClothingAdd: [{ characterId: pt.characters[0].id, items: [
        { slot: "Head", name: "Hood" },
        { slot: "Neck", name: "Scarf" },
      ] }],
    });
    expect(r.rejected).toEqual([]);
    expect(r.state.characters[0].clothing).toHaveLength(initial + 2);

    const again = applyStatePatch(r.state, {
      characterClothingAdd: [{ characterId: r.state.characters[0].id, items: [{ slot: "Head", name: "Second hood" }] }],
    });
    expect(again.state.characters[0].clothing).toHaveLength(initial + 2); // occupied slot not re-added
  });

  it("resolves characters by case-insensitive name for clothing patches", () => {
    const pt = withClothing();
    const r = applyStatePatch(pt, {
      characterClothingAdd: [{ characterId: pt.characters[0].name.toUpperCase(), items: [{ slot: "Head", name: "Cloak" }] }],
    });
    expect(r.rejected).toEqual([]);
    expect(r.state.characters[0].clothing.find((c) => c.slot === "Head")?.name).toBe("Cloak");
  });

  it("characterClothingSetState sets state on a worn slot and rejects unknown slots", () => {
    const pt = withClothing();
    const r = applyStatePatch(pt, {
      characterClothingAdd: [{ characterId: pt.characters[0].id, items: [{ slot: "Top", name: "Blouse" }] }],
    });
    const s = applyStatePatch(r.state, {
      characterClothingSetState: [{ characterId: r.state.characters[0].id, items: [{ slot: "Top", state: "torn" }] }],
    });
    expect(s.state.characters[0].clothing[0].state).toBe("torn");

    const bad = applyStatePatch(s.state, {
      characterClothingSetState: [{ characterId: s.state.characters[0].id, items: [{ slot: "Gloves", state: "wet" }] }],
    });
    expect(bad.rejected.length).toBeGreaterThan(0);
  });

  it("characterClothingRemove removes by slot and rejects unknown slots", () => {
    const pt = withClothing();
    const r = applyStatePatch(pt, {
      characterClothingAdd: [{ characterId: pt.characters[0].id, items: [{ slot: "Head", name: "Hood" }] }],
    });
    const before = r.state.characters[0].clothing;
    const s = applyStatePatch(r.state, {
      characterClothingRemove: [{ characterId: r.state.characters[0].id, slots: ["Head"] }],
    });
    expect(s.state.characters[0].clothing.map((c) => c.slot)).not.toContain("Head");
    expect(s.state.characters[0].clothing).toHaveLength(before.length - 1);

    const bad = applyStatePatch(s.state, {
      characterClothingRemove: [{ characterId: s.state.characters[0].id, slots: ["Hat"] }],
    });
    expect(bad.rejected.length).toBeGreaterThan(0);
  });

  it("characterClothingSet replaces the outfit wholesale", () => {
    const pt = withClothing();
    const r = applyStatePatch(pt, {
      characterClothingAdd: [{ characterId: pt.characters[0].id, items: [{ slot: "Top", name: "Blouse" }] }],
    });
    const s = applyStatePatch(r.state, {
      characterClothingSet: [{ characterId: r.state.characters[0].id, items: [{ slot: "Dress", name: "Evening gown", state: "pristine" }] }],
    });
    expect(s.state.characters[0].clothing).toEqual([{ slot: "Dress", name: "Evening gown", state: "pristine" }]);
  });

  it("rejects clothing patches for unknown characters", () => {
    const pt = withClothing();
    const r = applyStatePatch(pt, {
      characterClothingAdd: [{ characterId: "no_such_char", items: [{ slot: "Top", name: "X" }] }],
    });
    expect(r.rejected.length).toBeGreaterThan(0);
  });

  it("characterSectionUpdate with section \"Clothing\" redirects into structured clothing", () => {
    const pt = withClothing();
    const r = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: pt.characters[0].id, section: "Clothing", content: "[Clothing]\n- Top: New vest\n- Feet: Boots" }],
    });
    expect(r.rejected).toEqual([]);
    expect(r.state.characters[0].clothing).toEqual([
      { slot: "Top", name: "New vest" },
      { slot: "Feet", name: "Boots" },
    ]);
    expect(r.applied.some((m) => m.includes("clothing updated") && m.includes("via section redirect"))).toBe(true);
    // the content blob is untouched by the redirect (structured data wins)
    expect(r.state.characterTemplates[0].content).not.toContain("New vest");
  });
});

describe("applyStatePatch — CCv2 read-only sheets (D9)", () => {
  const CCV2_TEMPLATE: CharacterTemplate = {
    id: "tmpl_ccv2_readonly",
    name: "Kira",
    version: 1,
    summary: "",
    startingClothing: [],
    content: "{{char}} is a mysterious wanderer.",
    format: "ccv2"
  };

  function withCcV2Cast(): Playthrough {
    const pt = createInitialPlaythrough("CCv2 Read-Only Test");
    pt.characterTemplates.push(CCV2_TEMPLATE);
    pt.characters.push(instantiateTemplate(CCV2_TEMPLATE, pt.id, pt.branchId, pt.locationId));
    return pt;
  }

  it("rejects characterSectionUpdate and characterClothingAdd for CCv2-backed characters", () => {
    const pt = withCcV2Cast();
    const ccv2 = pt.characters[1];
    const contentBefore = pt.characterTemplates[1].content;
    const clothingBefore = ccv2.clothing.map((c) => ({ ...c }));

    const r = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: ccv2.id, section: "Appearance", content: "- Tall" }],
      characterClothingAdd: [{ characterId: ccv2.id, items: [{ slot: "Top", name: "Cloak" }] }]
    });

    expect(r.applied).toEqual([]);
    expect(r.rejected).toHaveLength(2);
    expect(r.rejected[0]).toContain("read-only CCv2 sheet");
    expect(r.rejected[1]).toContain("read-only CCv2 sheet");
    // State unchanged: sheet content and clothing untouched.
    expect(r.state.characterTemplates[1].content).toBe(contentBefore);
    expect(r.state.characters[1].clothing).toEqual(clothingBefore);
  });

  it("rejects characterClothingRemove/SetState/Set for CCv2-backed characters", () => {
    const pt = withCcV2Cast();
    const ccv2 = pt.characters[1];
    const r = applyStatePatch(pt, {
      characterClothingRemove: [{ characterId: ccv2.id, slots: ["Top"] }],
      characterClothingSetState: [{ characterId: ccv2.id, items: [{ slot: "Top", state: "torn" }] }],
      characterClothingSet: [{ characterId: ccv2.id, items: [{ slot: "Dress", name: "Gown" }] }]
    });
    expect(r.applied).toEqual([]);
    expect(r.rejected).toHaveLength(3);
    expect(r.rejected.every((m) => m.includes("read-only CCv2 sheet"))).toBe(true);
    expect(r.state.characters[1].clothing).toEqual([]);
  });

  it("still applies the same patches to BL-backed characters", () => {
    const pt = withCcV2Cast();
    const bl = pt.characters[0]; // Mira (DEMO_TEMPLATE, BL)
    const r = applyStatePatch(pt, {
      characterSectionUpdate: [{ characterId: bl.id, section: "Appearance", content: "- Tall and weathered" }],
      characterClothingAdd: [{ characterId: bl.id, items: [{ slot: "Head", name: "Hood" }] }]
    });
    expect(r.rejected).toEqual([]);
    expect(r.state.characterTemplates[0].content).toContain("- Tall and weathered");
    expect(r.state.characters[0].clothing.find((c) => c.slot === "Head")?.name).toBe("Hood");
  });
});
