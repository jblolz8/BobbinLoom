import { existsSync, mkdtempSync, rmSync, unlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { createCharacterTemplateRecord, getCharacterAvatarPath, importCharacterCard } from "../src/server/store";
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
