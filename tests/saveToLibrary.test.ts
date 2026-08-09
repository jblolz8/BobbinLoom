import { mkdirSync, mkdtempSync, readdirSync, rmSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { saveToLibraryAction } from "../src/server/stateActions";
import { createPlaythroughRecord, getPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import type { CharacterTemplate } from "../src/schemas";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-library-"));
  tempDirs.push(dir);
  return dir;
}

/** Empty library dir — a valid empty library is legal (no Mira fallback). */
function emptyLibrary(dir: string): string {
  const libDir = join(dir, "characters");
  mkdirSync(libDir, { recursive: true });
  return libDir;
}

/** Scan a folder-per-entity library dir and flatten every template. */
function readLibrary(libDir: string): CharacterTemplate[] {
  const out: CharacterTemplate[] = [];
  const folders = readdirSync(libDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.endsWith(".bak"))
    .map((e) => e.name);
  for (const folder of folders) {
    const files = readdirSync(join(libDir, folder)).filter((f) => f.endsWith(".json"));
    for (const file of files) {
      out.push(JSON.parse(readFileSync(join(libDir, folder, file), "utf8")) as CharacterTemplate);
    }
  }
  return out;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("saveToLibraryAction — update mode", () => {
  it("first save roots a version family: lineageId = template id, created = true", () => {
    const dir = tempDir();
    const libDir = emptyLibrary(dir);
    const playthrough = createPlaythroughRecord(dir, "Lib First Save");
    const mira = playthrough.characters[0];

    const result = saveToLibraryAction(dir, playthrough.id, mira.id, "update", libDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.created).toBe(true);
    expect(result.template.id).toBe("char_mira");
    expect(result.template.lineageId).toBe("char_mira");
    expect(result.template.version).toBe(1);
    expect(readLibrary(libDir)).toHaveLength(1);
  });

  it("re-save syncs name from the instance's CURRENT state", () => {
    const dir = tempDir();
    const libDir = emptyLibrary(dir);
    const playthrough = createPlaythroughRecord(dir, "Lib Resave");
    const mira = playthrough.characters[0];

    saveToLibraryAction(dir, playthrough.id, mira.id, "update", libDir);

    // Character gets renamed
    const stored = getPlaythroughRecord(dir, playthrough.id)!;
    stored.characters[0].name = "Mira the Bold";
    updatePlaythroughRecord(dir, stored);

    const result = saveToLibraryAction(dir, playthrough.id, mira.id, "update", libDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.created).toBe(false);
    expect(result.template.name).toBe("Mira the Bold");
    expect(readLibrary(libDir)).toHaveLength(1); // overwrite, not duplicate
  });
});

describe("saveToLibraryAction — newVersion mode", () => {
  it("mints a new id in the same family with version = max + 1", () => {
    const dir = tempDir();
    const libDir = emptyLibrary(dir);
    const playthrough = createPlaythroughRecord(dir, "Lib Versioning");
    const mira = playthrough.characters[0];

    saveToLibraryAction(dir, playthrough.id, mira.id, "update", libDir);

    // Rename the character, then save as a new version
    const stored = getPlaythroughRecord(dir, playthrough.id)!;
    stored.characters[0].name = "Mira v2";
    updatePlaythroughRecord(dir, stored);

    const v2 = saveToLibraryAction(dir, playthrough.id, mira.id, "newVersion", libDir);
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;

    expect(v2.template.id).not.toBe("char_mira");
    expect(v2.template.version).toBe(2);
    expect(v2.template.lineageId).toBe("char_mira");
    expect(v2.template.name).toBe("Mira v2");

    const v3 = saveToLibraryAction(dir, playthrough.id, mira.id, "newVersion", libDir);
    expect(v3.ok).toBe(true);
    if (!v3.ok) return;
    expect(v3.template.version).toBe(3);
    expect(v3.template.lineageId).toBe("char_mira");
    expect(v3.template.id).not.toBe(v2.template.id);

    const library = readLibrary(libDir);
    expect(library).toHaveLength(3);
    // Whole family shares the lineage
    expect(library.every((t) => (t.lineageId ?? t.id) === "char_mira")).toBe(true);
  });

  it("409s when no library copy exists yet", () => {
    const dir = tempDir();
    const libDir = emptyLibrary(dir);
    const playthrough = createPlaythroughRecord(dir, "Lib No Copy");
    const mira = playthrough.characters[0];

    const result = saveToLibraryAction(dir, playthrough.id, mira.id, "newVersion", libDir);
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.status).toBe(409);
    expect(readLibrary(libDir)).toHaveLength(0);
  });
});

describe("saveToLibraryAction — clothing & summary persistence", () => {
  it("persists summary and startingClothing with transient states cleared", () => {
    const dir = tempDir();
    const libDir = emptyLibrary(dir);
    const playthrough = createPlaythroughRecord(dir, "Lib Clothing Persist");
    const mira = playthrough.characters[0];

    const stored = getPlaythroughRecord(dir, playthrough.id)!;
    stored.characters[0].clothing = [
      { slot: "Top", name: "Silk blouse", state: "torn" },
      { slot: "Feet", name: "Travel boots", state: "wet" },
    ];
    const tpl = stored.characterTemplates.find((t) => t.id === mira.templateId)!;
    tpl.summary = "A guarded swordswoman";
    updatePlaythroughRecord(dir, stored);

    const result = saveToLibraryAction(dir, playthrough.id, mira.id, "update", libDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.template.summary).toBe("A guarded swordswoman");
    expect(result.template.startingClothing).toEqual([
      { slot: "Top", name: "Silk blouse" },
      { slot: "Feet", name: "Travel boots" },
    ]);
    expect(result.template.startingClothing.every((c) => c.state === undefined)).toBe(true);
  });

  it("derives summary from content when the local template summary is empty", () => {
    const dir = tempDir();
    const libDir = emptyLibrary(dir);
    const playthrough = createPlaythroughRecord(dir, "Lib Summary Fallback");
    const mira = playthrough.characters[0];

    const stored = getPlaythroughRecord(dir, playthrough.id)!;
    const tpl = stored.characterTemplates.find((t) => t.id === mira.templateId)!;
    tpl.summary = "";
    updatePlaythroughRecord(dir, stored);

    const result = saveToLibraryAction(dir, playthrough.id, mira.id, "update", libDir);
    expect(result.ok).toBe(true);
    if (!result.ok) return;

    expect(result.template.summary).toBe("Disciplined, guarded, fair, and direct.");
  });
});
