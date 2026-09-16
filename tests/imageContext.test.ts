import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_PROMPT_INSTRUCTION } from "../src/engine/imageDefaults";
import type { ImageGenerationSettings } from "../src/schemas";
import { buildImageCastBlock, buildImageStateBlock } from "../src/server/provider/imageContext";

/** A playthrough carrying exactly what the two builders read, plus the material
 *  they must NOT emit: the player's wardrobe and appearance, an absent
 *  character, and a sheet whose [Clothing] section is the character's starting
 *  outfit rather than her current state. */
function fixture() {
  return {
    locationId: "loc_bedroom",
    locationCatalog: [
      {
        id: "loc_bedroom",
        name: "Cramped apartment",
        description: "A dim studio with a sagging mattress.",
        state: "messy",
        connections: ["loc_hall"]
      }
    ],
    playerCharacter: {
      name: "Anon",
      description: "A male human. Wears glasses since he is short-sighted. Prefers a long sleeve shirt, slacks and a necktie.",
      bodyType: "average",
      appearance: "Fair skin. Black hair. Black eye color.",
      clothing: [
        { slot: "Torso", name: "White Long Sleeve Shirt" },
        { slot: "Neck", name: "Necktie" },
        { slot: "Legs", name: "Black Slacks" }
      ],
      conditions: ["handcuffed"],
      flags: ["tied_up"]
    },
    inventory: [{ itemId: "item_rope", quantity: 1 }],
    quests: [{ id: "q1", name: "Escape", summary: "Get out of the apartment.", status: "active", tracking: true }],
    flags: ["tied_up"],
    turn: 4,
    characters: [
      {
        id: "char_j",
        name: "Jeneine",
        templateId: "tpl_j",
        currentLocationId: "loc_bedroom",
        clothing: [{ slot: "Torso", name: "Faded gray hoodie" }],
        mood: "overwhelmed_content",
        conditions: ["flushed"],
        flags: []
      },
      {
        id: "char_ghost",
        name: "Ghost",
        templateId: "tpl_g",
        currentLocationId: "loc_attic",
        clothing: [],
        mood: "wary",
        conditions: [],
        flags: []
      }
    ],
    characterTemplates: [
      {
        id: "tpl_j",
        name: "Jeneine",
        content:
          "[Species]: Human\n\n[Gender]: Female\n\n[Body]\n- Build: slim, athletic\n\n" +
          "[Appearance]\n- Eyes: tired blue eyes\n- Hair: light brown, loose ponytail\n\n" +
          "[Clothing]\n- Top: black training top\n- Bottom: loose cotton shorts\n\n[Personality]\n- Guarded"
      },
      { id: "tpl_g", name: "Ghost", content: "[Species]: Human" }
    ]
  } as unknown as Parameters<typeof buildImageStateBlock>[0];
}

const settings = (overrides: Partial<ImageGenerationSettings> = {}): ImageGenerationSettings =>
  ({ includeState: true, includeCast: true, ...overrides } as ImageGenerationSettings);

describe("buildImageStateBlock", () => {
  const block = buildImageStateBlock(fixture());

  it("carries the place and the player's visible physical state", () => {
    expect(block).toContain("Location: Cramped apartment — A dim studio with a sagging mattress.");
    expect(block).toContain("Location state: messy");
    expect(block).toContain("Player visible state: handcuffed");
  });

  it("withholds the player's wardrobe and appearance at the source", () => {
    // These were the exact items that came back as tags on the character.
    for (const leak of ["White Long Sleeve Shirt", "Necktie", "Black Slacks", "Fair skin", "Black hair", "average"]) {
      expect(block, leak).not.toContain(leak);
    }
  });

  it("withholds every turn-only category a frame cannot show", () => {
    for (const gone of ["Turn:", "Inventory", "Quests", "Allowed IDs", "REACHABLE", "Memory", "ABSENT CHARACTERS", "exits"]) {
      expect(block, gone).not.toContain(gone);
    }
    // No character sheet text either: the cast block owns that.
    expect(block).not.toContain("Jeneine");
  });
});

describe("buildImageCastBlock", () => {
  const block = buildImageCastBlock(fixture());

  it("frames the player as the camera, in the first sentence only", () => {
    expect(block).toContain("THE CAMERA");
    expect(block).toContain("never tag their stored appearance or clothing");
    expect(block).toContain("Anon — A male human");
    // Pronoun/gender context stays; the wardrobe sentence does not.
    expect(block).not.toContain("glasses");
    expect(block).not.toContain("long sleeve");
  });

  it("describes in-frame characters with clothing, a readable mood, and their identity", () => {
    expect(block).toContain("Jeneine — wearing Faded gray hoodie, overwhelmed content, flushed");
    // The raw slug never reaches the writer.
    expect(block).not.toContain("overwhelmed_content");
    expect(block).toContain("Jeneine's sheet — Species: Human | Gender: Female | Body:");
    // Read through the engine's own parser: the wanted headers in order, the
    // sheet's [Clothing] and [Personality] left out entirely.
    expect(block).toContain("Build: slim, athletic");
    expect(block).toContain("tired blue eyes");
  });

  it("never injects the sheet's starting outfit over the instance's current clothing", () => {
    expect(block).not.toContain("black training top");
    expect(block).not.toContain("loose cotton shorts");
  });

  it("leaves out characters who are not at the current location", () => {
    expect(block).not.toContain("Ghost");
  });
});

describe("the shipped instruction's player rules", () => {
  it("scopes the player explicitly, and keeps the rules that make it bite", () => {
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("THE PLAYER IS NOT A CHARACTER");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("NEVER tag the player's stored or visible appearance and wardrobe");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain('The player NEVER opens a " | " group');
    // The rule must arrive BEFORE the section that licenses copying character
    // data, and before the player section it constrains.
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION.indexOf("THE PLAYER IS NOT A CHARACTER"))
      .toBeLessThan(DEFAULT_IMAGE_PROMPT_INSTRUCTION.indexOf("CHARACTER REFERENCE"));
    // The group-1 line may no longer read as "the player's tags go in group 1".
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).not.toContain("the player's visible body tags (male pov, viewer's hands) go in the first group");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("that is ALL the player contributes");
    // The good shapes survive: interaction tags referencing the edge of the
    // player's clothing are still allowed.
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("viewer's waistband gripped");
  });
});
