import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_PROMPT_INSTRUCTION } from "../src/engine/imageDefaults";
import type { ImageGenerationSettings, Playthrough } from "../src/schemas";
import { IMAGE_HISTORY_HEADER, buildImageCastBlock, buildImageHistoryBlock, buildImageStateBlock, previousWriterAnswer } from "../src/server/provider/imageContext";

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

/** A bare message list for the history-block tests: roles, prose, and the two
 *  shapes the window must skip (a hidden state-only user message, a system one).
 *  `images` seeds refs for the previous-answer tests, where only `writerPrompt` /
 *  `writerNegative` matter. */
function conversation(
  entries: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    hidden?: boolean;
    images?: Array<{ writerPrompt?: string; writerNegative?: string }>;
  }>
): Playthrough {
  return {
    messages: entries.map((entry, i) => ({
      id: `m${i}`,
      role: entry.role,
      content: entry.content,
      createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
      ...(entry.hidden ? { hidden: true } : {}),
      ...(entry.images
        ? {
            images: entry.images.map((image) => ({
              file: `${"a".repeat(64)}.png`,
              prompt: "a composed prompt",
              providerId: "p",
              model: "m",
              createdAt: "2026-01-01T00:00:00.000Z",
              ...image
            }))
          }
        : {})
    }))
  } as unknown as Playthrough;
}

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

describe("previousWriterAnswer", () => {
  const target = (pt: Playthrough) => pt.messages[pt.messages.length - 1];

  it("takes the newest answer stored before this frame", () => {
    const pt = conversation([
      { role: "assistant", content: "a", images: [{ writerPrompt: "OLD ANSWER" }] },
      { role: "user", content: "b" },
      { role: "assistant", content: "c", images: [{ writerPrompt: "NEW ANSWER", writerNegative: "bad hands" }] },
      { role: "assistant", content: "the frame" }
    ]);
    expect(previousWriterAnswer(pt, target(pt))).toEqual({ prompt: "NEW ANSWER", negative: "bad hands" });
  });

  it("counts an earlier variant on the SAME message — a re-roll's closest reference", () => {
    const pt = conversation([
      { role: "assistant", content: "a", images: [{ writerPrompt: "EARLIER MESSAGE ANSWER" }] },
      { role: "assistant", content: "the frame", images: [{ writerPrompt: "SAME FRAME VARIANT" }] }
    ]);
    expect(previousWriterAnswer(pt, target(pt))).toEqual({ prompt: "SAME FRAME VARIANT" });
  });

  it("skips refs that stored no answer, and answers nothing when none exists", () => {
    const pt = conversation([
      { role: "assistant", content: "a", images: [{}, { writerPrompt: "   " }] },
      { role: "assistant", content: "b", images: [{}] },
      { role: "assistant", content: "the frame" }
    ]);
    expect(previousWriterAnswer(pt, target(pt))).toBeUndefined();
  });

  it("never looks FORWARD: a later message's answer is not this frame's reference", () => {
    const pt = conversation([
      { role: "assistant", content: "the frame" },
      { role: "assistant", content: "later", images: [{ writerPrompt: "LATER ANSWER" }] }
    ]);
    expect(previousWriterAnswer(pt, pt.messages[0])).toBeUndefined();
  });
});

describe("buildImageHistoryBlock", () => {
  /** The target frame is the LAST message, so everything ahead of it is history. */
  const target = (pt: Playthrough) => pt.messages[pt.messages.length - 1];

  it("renders the nearest messages oldest-first, skipping hidden and system ones", () => {
    const pt = conversation([
      { role: "assistant", content: "first beat" },
      { role: "user", content: "state-only narration", hidden: true },
      { role: "user", content: "second beat" },
      { role: "system", content: "a system note" },
      { role: "assistant", content: "third beat" },
      { role: "assistant", content: "the frame to render" }
    ]);

    const block = buildImageHistoryBlock(pt, target(pt), 6);
    expect(block.text.startsWith(IMAGE_HISTORY_HEADER)).toBe(true);
    expect(block.text).toContain("Assistant: first beat");
    expect(block.text).toContain("User: second beat");
    expect(block.text).toContain("Assistant: third beat");
    // The mechanical state and the frame itself never enter the window. (The
    // header says "NOT the frame to render", so assert on the LABELLED form.)
    expect(block.text).not.toContain("state-only narration");
    expect(block.text).not.toContain("a system note");
    expect(block.text).not.toContain("Assistant: the frame to render");
    expect(block.messageIds).toHaveLength(3);
    // Chronological: the oldest picked message comes first.
    expect(block.text.indexOf("first beat")).toBeLessThan(block.text.indexOf("third beat"));
  });

  it("honours the count, and gives the first message in a chat no history at all", () => {
    const pt = conversation([
      { role: "user", content: "a" },
      { role: "assistant", content: "b" },
      { role: "assistant", content: "c" },
      { role: "assistant", content: "frame" }
    ]);
    expect(buildImageHistoryBlock(pt, target(pt), 2).messageIds).toHaveLength(2);
    expect(buildImageHistoryBlock(pt, target(pt), 0).text).toBe("");
    expect(buildImageHistoryBlock(pt, pt.messages[0], 6).text).toBe("");
  });

  it("drops whole older messages before cutting the nearest one", () => {
    const long = (label: string) => `${label} ${"x".repeat(2500)}`;
    const pt = conversation([
      { role: "assistant", content: long("oldest beat") },
      { role: "assistant", content: long("middle beat") },
      { role: "assistant", content: long("newest beat") },
      { role: "assistant", content: "frame" }
    ]);
    // 3 x 2500 = 7500 > the 6000 budget: the oldest goes WHOLE, and what is left
    // is under the budget, so nothing is cut mid-sentence.
    const block = buildImageHistoryBlock(pt, target(pt), 6);
    expect(block.text).toContain("newest beat");
    expect(block.text).toContain("middle beat");
    expect(block.text).not.toContain("oldest beat");
    expect(block.text).not.toContain("…[earlier text omitted]");
  });

  it("keeps the TAIL of one message bigger than the whole budget", () => {
    const pt = conversation([
      { role: "assistant", content: `${"y".repeat(7000)} the end of the beat` },
      { role: "assistant", content: "frame" }
    ]);
    const block = buildImageHistoryBlock(pt, target(pt), 6);
    // The end of an earlier message is the state it left the scene in — that is
    // the part worth keeping, so the marker goes at the FRONT.
    expect(block.text).toContain("…[earlier text omitted]");
    expect(block.text).toContain("the end of the beat");
  });
});

describe("buildImageCastBlock — the scene mode", () => {
  it("drops the player entirely when the frame is not seen through their eyes", () => {
    const block = buildImageCastBlock(fixture(), "scene");
    expect(block).not.toContain("THE CAMERA");
    expect(block).not.toContain("Anon");
    // The characters stay: they are who the frame shows.
    expect(block).toContain("Jeneine");
  });

  it("keeps the camera block by default and in pov mode", () => {
    expect(buildImageCastBlock(fixture())).toContain("THE CAMERA");
    expect(buildImageCastBlock(fixture(), "pov")).toContain("THE CAMERA");
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

/** A sheet whose `[Body]` is long and whose `Hair` bullet sits LAST in
 *  `[Appearance]` — the shape that rendered a character with no hair at all
 *  while the identity line was clamped to 320 characters. */
function bodyHeavyFixture() {
  const pt = fixture() as any;
  // Sized on purpose: the sheet line lands above the old 320-character cap and
  // below the 600 one, so the test proves the difference rather than the cap.
  const body = "[Body]\n" + Array.from({ length: 5 }, (_, i) => `- Measurement ${i}: ${"x".repeat(22)}`).join("\n");
  const details = Array.from({ length: 4 }, (_, i) => `- Detail ${i}: ${"y".repeat(18)}`).join("\n");
  pt.characterTemplates[0].content =
    `[Species]: Human\n\n[Gender]: Female\n\n${body}\n\n[Appearance]\n- Skin: pale\n${details}\n- Hair: black, twin tails`;
  return pt;
}

describe("hair survives the identity budget", () => {
  it("headlines the character's hair before the sheet line", () => {
    const block = buildImageCastBlock(fixture());
    expect(block).toContain("Jeneine's hair — light brown, loose ponytail");
    expect(block.indexOf("Jeneine's hair")).toBeLessThan(block.indexOf("Jeneine's sheet"));
  });

  it("keeps hair in the sheet line past the old 320-character cut", () => {
    const block = buildImageCastBlock(bodyHeavyFixture());
    const sheetLine = block.split("\n").find((line) => line.includes("'s sheet"))!;
    // The proof this is a regression guard and not a tautology: hair sits past
    // the point where the old cap stopped reading.
    expect(sheetLine.length).toBeGreaterThan(320);
    expect(sheetLine.length).toBeLessThan(600);
    expect(sheetLine.indexOf("twin tails")).toBeGreaterThan(320);
    expect(block).toContain("Jeneine's hair — black, twin tails");
  });

  it("claims nothing about hair when the sheet has none", () => {
    const pt = fixture() as any;
    pt.characterTemplates[0].content = "[Species]: Human\n\n[Gender]: Female\n\n[Appearance]\n- Eyes: green eyes";
    const block = buildImageCastBlock(pt);
    expect(block).not.toContain("'s hair —");
    expect(block).toContain("green eyes");
  });
});

describe("the shipped rating bullet", () => {
  it("allows exactly one word and forbids a blend", () => {
    // A live generation answered `nsensitive` — not a booru rating tag, and the
    // bullet that asked for the rating was the only place it could have come from.
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("exactly one word from safe, sensitive, nsfw, explicit");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("Never a blend of two, never a new word");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("1. Rating: one word from safe, sensitive, nsfw, explicit");
  });
});
