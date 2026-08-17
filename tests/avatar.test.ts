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

describe("Character Visuals & 1:1 Profile Avatar Management", () => {
  it("supports uploading custom portrait, 1:1 profile, comparing original, and restoring", async () => {
    const { removeCharacterProfileAvatar, restoreCharacterOriginalAvatar, saveCharacterAvatar } = await import("../src/server/store");
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-avatar-visuals-"));
    tempDirs.push(dir);

    // 1. Import a CCv2 card with an original PNG
    const { record: originalRecord } = importCharacterCard(
      makeCard("Aria the Wind Mage"),
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x01]),
      "png",
      dir
    );

    // Default portrait & profile path should point to the CCv2 original PNG
    const initialPortrait = getCharacterAvatarPath(originalRecord.id, "portrait", dir);
    const initialProfile = getCharacterAvatarPath(originalRecord.id, "profile", dir);
    const originalPath = getCharacterAvatarPath(originalRecord.id, "original", dir);

    expect(initialPortrait).toMatch(/aria-the-wind-mage\.png$/);
    expect(initialProfile).toBe(initialPortrait); // falls back to portrait
    expect(originalPath).toBe(initialPortrait);

    // 2. Upload a custom portrait
    const customPortraitBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x02]);
    const updatedWithPortrait = saveCharacterAvatar(originalRecord.id, "portrait", customPortraitBytes, "png", dir);
    expect(updatedWithPortrait?.customPortrait).toBe("portrait.png");

    const customPortraitPath = getCharacterAvatarPath(originalRecord.id, "portrait", dir);
    expect(customPortraitPath).toMatch(/portrait\.png$/);
    // Original path still points to the pristine CCv2 card
    expect(getCharacterAvatarPath(originalRecord.id, "original", dir)).toBe(originalPath);
    // Profile now falls back to custom portrait
    expect(getCharacterAvatarPath(originalRecord.id, "profile", dir)).toBe(customPortraitPath);

    // 3. Upload a 1:1 square profile avatar (e.g. from cropper)
    const profileBytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x03]);
    const updatedWithProfile = saveCharacterAvatar(originalRecord.id, "profile", profileBytes, "png", dir);
    expect(updatedWithProfile?.profileImage).toBe("profile.png");

    const profilePath = getCharacterAvatarPath(originalRecord.id, "profile", dir);
    expect(profilePath).toMatch(/profile\.png$/);
    expect(profilePath).not.toBe(customPortraitPath);

    // 4. Remove custom profile avatar -> falls back to custom portrait
    const afterProfileDelete = removeCharacterProfileAvatar(originalRecord.id, dir);
    expect(afterProfileDelete?.profileImage).toBeUndefined();
    expect(getCharacterAvatarPath(originalRecord.id, "profile", dir)).toBe(customPortraitPath);

    // 5. Restore original CCv2 card artwork -> reverts custom portrait to original card art
    const restored = restoreCharacterOriginalAvatar(originalRecord.id, dir);
    expect(restored?.customPortrait).toBeUndefined();
    expect(getCharacterAvatarPath(originalRecord.id, "portrait", dir)).toBe(originalPath);
    expect(getCharacterAvatarPath(originalRecord.id, "profile", dir)).toBe(originalPath);
  });
});
