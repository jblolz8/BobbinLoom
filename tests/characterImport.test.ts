import { describe, expect, it } from "vitest";
import { parseCard } from "../src/server/characterCards/parseCard";
import { makePng } from "./helpers/pngBuilder";

describe("parseCard (CCv2 card parsing + validation)", () => {
  const v2Card = {
    spec: "chara_card_v2",
    data: {
      name: "Mira",
      description: "A curious fox girl. {{char}} loves exploring.",
      personality: "Friendly and warm.",
      scenario: "A misty forest at dawn.",
      creator: "PPLong",
      creator_notes: "My first card.",
      tags: ["fox girl", "adventure"],
      character_version: "1.2",
    },
  };

  it("parses a valid tEXt PNG card (v2)", () => {
    const bytes = makePng(JSON.stringify(v2Card));
    const card = parseCard("mira.png", bytes);

    expect(card.name).toBe("Mira");
    expect(card.description).toBe("A curious fox girl. {{char}} loves exploring.");
    expect(card.personality).toBe("Friendly and warm.");
    expect(card.scenario).toBe("A misty forest at dawn.");
    expect(card.creator).toBe("PPLong");
    expect(card.creatorNotes).toBe("My first card.");
    expect(card.tags).toEqual(["fox girl", "adventure"]);
    expect(card.characterVersion).toBe("1.2");
  });

  it("parses a base64-encoded tEXt PNG card (real SillyTavern format)", () => {
    // Real CCv2 cards base64-encode the card JSON inside the `chara` chunk.
    const bytes = makePng(Buffer.from(JSON.stringify(v2Card), "utf8").toString("base64"));
    const card = parseCard("mira.png", bytes);

    expect(card.name).toBe("Mira");
    expect(card.description).toBe("A curious fox girl. {{char}} loves exploring.");
    expect(card.creatorNotes).toBe("My first card.");
    expect(card.scenario).toBe("A misty forest at dawn.");
  });

  it("parses a raw JSON buffer (non-PNG)", () => {
    const bytes = Buffer.from(JSON.stringify(v2Card), "utf8");
    const card = parseCard("mira.json", bytes);

    expect(card.name).toBe("Mira");
    expect(card.description).toBe("A curious fox girl. {{char}} loves exploring.");
  });

  const v1Card = {
    name: "Old Pygmalion Bot",
    description: "A grumpy tavern keeper. {{char}} hates rain.",
    personality: "Grumpy, secretly soft-hearted.",
    scenario: "A rainy night at the tavern.",
    first_mes: "What'll it be?",
    creatorcomment: "Made back in 2023.",
    tags: "fantasy, tavern, grumpy",
    creator: "PPLong",
    character_version: "1.0",
  };

  it("parses a flat V1 card (no spec / no data wrapper)", () => {
    const bytes = Buffer.from(JSON.stringify(v1Card), "utf8");
    const card = parseCard("old.json", bytes);

    expect(card.name).toBe("Old Pygmalion Bot");
    expect(card.description).toBe("A grumpy tavern keeper. {{char}} hates rain.");
    expect(card.personality).toBe("Grumpy, secretly soft-hearted.");
    expect(card.scenario).toBe("A rainy night at the tavern.");
    expect(card.creator).toBe("PPLong");
    expect(card.characterVersion).toBe("1.0");
  });

  it("splits a V1 comma-separated tags string into an array", () => {
    const bytes = Buffer.from(JSON.stringify(v1Card), "utf8");
    const card = parseCard("old.json", bytes);
    expect(card.tags).toEqual(["fantasy", "tavern", "grumpy"]);
  });

  it("maps the legacy creatorcomment field to creatorNotes", () => {
    const bytes = Buffer.from(JSON.stringify(v1Card), "utf8");
    const card = parseCard("old.json", bytes);
    expect(card.creatorNotes).toBe("Made back in 2023.");
  });

  it("prefers creator_notes over creatorcomment when both are present", () => {
    const bytes = Buffer.from(
      JSON.stringify({ ...v1Card, creator_notes: "modern notes" }),
      "utf8"
    );
    const card = parseCard("old.json", bytes);
    expect(card.creatorNotes).toBe("modern notes");
  });

  it("parses a flat V1 card from a base64 PNG chara chunk", () => {
    const bytes = makePng(Buffer.from(JSON.stringify(v1Card), "utf8").toString("base64"));
    const card = parseCard("old.png", bytes);
    expect(card.name).toBe("Old Pygmalion Bot");
    expect(card.tags).toEqual(["fantasy", "tavern", "grumpy"]);
  });

  it("accepts chara_card_v3 cards (v2 fields parsed, v3 assets ignored)", () => {
    const bytes = Buffer.from(
      JSON.stringify({ spec: "chara_card_v3", data: { name: "Flora", description: "Leafy." } }),
      "utf8"
    );
    const card = parseCard("flora.json", bytes);

    expect(card.name).toBe("Flora");
    expect(card.description).toBe("Leafy.");
  });

  it("throws a readable error when the JSON has no `data` object", () => {
    const bytes = Buffer.from(JSON.stringify({ spec: "chara_card_v2" }), "utf8");
    expect(() => parseCard("broken.json", bytes)).toThrow(/no `data` object/);
  });

  it("rejects an unknown spec", () => {
    const bytes = Buffer.from(
      JSON.stringify({ spec: "chara_card_v9", data: { name: "Future", description: "x" } }),
      "utf8"
    );
    expect(() => parseCard("future.json", bytes)).toThrow(/Unsupported card spec "chara_card_v9"/);
  });

  it("throws a readable error when the card has no name", () => {
    const bytes = Buffer.from(
      JSON.stringify({ spec: "chara_card_v2", data: { description: "no name here" } }),
      "utf8"
    );
    expect(() => parseCard("noname.json", bytes)).toThrow(/Card has no name/);
  });

  it("throws a readable error when a PNG has no embedded chara card", () => {
    // Text chunk present but under a different keyword → no card data.
    const bytes = makePng("not a card at all", "tEXt", "description");
    expect(() => parseCard("mira.png", bytes)).toThrow(/no embedded `chara` card data/);
  });

  it("throws 'Card data is not valid JSON.' when the payload is not JSON", () => {
    const bytes = makePng("{ this is not json");
    expect(() => parseCard("mira.png", bytes)).toThrow("Card data is not valid JSON.");
  });

  it("throws 'Card data is not valid JSON.' for an unparseable raw JSON buffer", () => {
    expect(() => parseCard("mira.json", Buffer.from("{ nope", "utf8"))).toThrow(
      "Card data is not valid JSON."
    );
  });

  it("coerces non-string fields to empty strings and drops non-string tags", () => {
    const bytes = Buffer.from(
      JSON.stringify({
        spec: "chara_card_v2",
        data: { name: "Mira", description: "x", creator: 42, tags: ["ok", 7, null] },
      }),
      "utf8"
    );
    const card = parseCard("mira.json", bytes);

    expect(card.creator).toBe("");
    expect(card.tags).toEqual(["ok"]);
  });
});
