import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCharacterTemplateRecord, getCharacterAvatarPath, importCharacterCard } from "../src/server/store";
import { parseCard } from "../src/server/characterCards/parseCard";
import type { ParsedCard } from "../src/server/characterCards/parseCard";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function makeCard(name: string): ParsedCard {
  return {
    name,
    description: "[Species]: Test",
    personality: "",
    scenario: "",
    creator: "pplong",
    creatorNotes: "A test card.",
    tags: ["wizard", "test"],
    characterVersion: "1.2",
  };
}

describe("getCharacterAvatarPath", () => {
  it("returns the absolute path of an imported PNG card's avatar file", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-avatar-"));
    tempDirs.push(dir);

    const { record } = importCharacterCard(makeCard("Test Mage"), Buffer.from([0x89, 0x50, 0x4e, 0x47]), "png", dir);

    const path = getCharacterAvatarPath(record.id, dir);
    expect(path).not.toBeNull();
    expect(path).toMatch(/test-mage\.png$/);
    expect(existsSync(path!)).toBe(true);
  });

  it("returns null for a BL-native record (no avatar support in this scope)", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-avatar-"));
    tempDirs.push(dir);

    const record = createCharacterTemplateRecord("Native Hero", dir);

    expect(getCharacterAvatarPath(record.id, dir)).toBeNull();
  });

  it("returns null when the cardRef kind is json", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-avatar-"));
    tempDirs.push(dir);

    const { record } = importCharacterCard(makeCard("Json Card"), Buffer.from("{}"), "json", dir);

    expect(getCharacterAvatarPath(record.id, dir)).toBeNull();
  });

  it("returns null when the png file is missing from disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-avatar-"));
    tempDirs.push(dir);

    const { record } = importCharacterCard(makeCard("Vanishing"), Buffer.from([0x89, 0x50, 0x4e, 0x47]), "png", dir);

    const path = getCharacterAvatarPath(record.id, dir);
    expect(path).not.toBeNull();
    unlinkSync(path!);
    expect(getCharacterAvatarPath(record.id, dir)).toBeNull();
  });

  it("returns null for an unknown id", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-avatar-"));
    tempDirs.push(dir);

    expect(getCharacterAvatarPath("char_nope", dir)).toBeNull();
  });
});

describe("V1 card import (regression)", () => {
  it("parses a flat V1 card and imports it as a read-only ccv2 record", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-v1-"));
    tempDirs.push(dir);

    const v1Json = JSON.stringify({
      name: "Old Bot",
      description: "A grumpy bot. {{char}} hates rain.",
      personality: "Grumpy",
      scenario: "Rainy night",
      creator: "PPLong",
      creatorcomment: "legacy notes",
      tags: "fantasy, tavern",
    });

    const card = parseCard("old.json", Buffer.from(v1Json, "utf8"));
    const { record } = importCharacterCard(card, Buffer.from(v1Json, "utf8"), "json", dir);

    expect(record.format).toBe("ccv2");
    expect(record.spec).toBe("bobbinloom_chara");
    expect(record.content).toBe("A grumpy bot. {{char}} hates rain.");
    expect(record.scenario).toBe("Rainy night");
    expect(record.creatorNotes).toBe("legacy notes");
    expect(record.creator).toBe("pplong");
    expect(record.tags).toEqual(["fantasy", "tavern"]);
  });
});
