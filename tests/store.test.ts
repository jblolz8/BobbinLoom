import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { CharacterTemplateSchema } from "../src/schemas";
import type { Playthrough } from "../src/schemas";
import {
  createCharacterTemplateRecord,
  createPersonaRecord,
  createPlaythroughFromSeedRecord,
  createPlaythroughRecord,
  deleteCharacterTemplateRecord,
  deletePersonaRecord,
  getCharacterTemplate,
  getPersona,
  getPlaythroughRecord,
  importCharacterCard,
  listCharacterTemplates,
  listPersonas,
  listPlaythroughRecords,
  removeCharacterImportRecord,
  resolveCast,
  resolvePresetForGeneration,
  setDefaultPersonaRecord,
  updateCharacterTemplateRecord,
  updatePersonaRecord,
  updatePlaythroughRecord
} from "../src/server/store";
import type { ParsedCard } from "../src/server/characterCards/parseCard";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

describe("playthrough store", () => {
  it("creates, loads, and updates a playthrough record on disk", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-store-"));
    tempDirs.push(dir);

    const created = createPlaythroughRecord(dir, "Stored Run");
    const loaded = getPlaythroughRecord(dir, created.id);

    expect(loaded?.name).toBe("Stored Run");

    loaded!.flags.push("stored_flag");
    updatePlaythroughRecord(dir, loaded!);

    const reloaded = getPlaythroughRecord(dir, created.id);
    expect(reloaded?.flags).toContain("stored_flag");
  });
});

describe("createPlaythroughFromSeedRecord (scenario generation)", () => {
  const seed = {
    locations: [
      { id: "loc_start", name: "Start", description: "A spot.", state: "", icon: "🏠", connections: [] }
    ],
    character: { name: "Mira", content: "[Species]: Human" },
    quest: { id: "quest_1", name: "First Quest", summary: "Do a thing." },
    items: [],
    startingFlags: [],
    npcs: []
  };

  it("does not persist — the route commits only after the opening turn succeeds", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-seed-"));
    tempDirs.push(dir);

    const created = createPlaythroughFromSeedRecord(dir, "Atomic Run", seed);

    // Seed is in memory (usable by the route), but nothing on disk yet.
    expect(created.name).toBe("Atomic Run");
    expect(created.locationCatalog?.[0]?.name).toBe("Start");
    expect(existsSync(join(dir, `${created.id}.json`))).toBe(false);
  });
});

describe("resolvePresetForGeneration (Generate Scenario preset resolution)", () => {
  it("falls back to the default preset so its seed modules reach the generator", () => {
    const resolved = resolvePresetForGeneration(undefined);

    expect(resolved).not.toBeNull();
    expect(resolved!.modules.seed.length).toBeGreaterThan(0);
    // Seed modules must be enabled to render into the Generate Scenario prompt.
    expect(resolved!.modules.seed.some((m) => m.enabled)).toBe(true);
  });

  it("resolves an explicit presetId", () => {
    const resolved = resolvePresetForGeneration("default-nsfw");

    expect(resolved?.id).toBe("default-nsfw");
    expect(resolved!.modules.seed.length).toBeGreaterThan(0);
  });

  it("returns null for an unknown presetId so the route 404s", () => {
    expect(resolvePresetForGeneration("no-such-preset")).toBeNull();
  });
});

describe("playthrough store — load hardening", () => {
  it("listPlaythroughRecords quarantines a corrupt file and still loads the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-corrupt-"));
    tempDirs.push(dir);

    createPlaythroughRecord(dir, "Good Run");
    writeFileSync(join(dir, "broken.json"), "{ this is not json", "utf8");

    const { playthroughs, failures } = listPlaythroughRecords(dir);

    // The good playthrough still loads — one corrupt file must not brick the list.
    expect(playthroughs.map((p) => p.name)).toContain("Good Run");
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe("broken");
    // Unparseable JSON → name falls back to the filename
    expect(failures[0].name).toBe("broken");
    expect(failures[0].reason).toMatch(/unparseable/);
    expect(failures[0].backupPath).toBe(join(dir, "broken.json.bak"));
    // Quarantined: renamed to .bak, never deleted
    expect(existsSync(join(dir, "broken.json"))).toBe(false);
    expect(existsSync(join(dir, "broken.json.bak"))).toBe(true);
  });

  it("listPlaythroughRecords reports a best-effort name for valid JSON that fails migration", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-invalid-json-"));
    tempDirs.push(dir);

    createPlaythroughRecord(dir, "Good Run");
    // Valid JSON, but not a playthrough — migration fails, name is salvaged pre-quarantine.
    writeFileSync(join(dir, "junk.json"), JSON.stringify({ name: "Junk File", notAPlaythrough: true }), "utf8");

    const { playthroughs, failures } = listPlaythroughRecords(dir);

    expect(playthroughs.map((p) => p.name)).toEqual(["Good Run"]);
    expect(failures).toHaveLength(1);
    expect(failures[0].id).toBe("junk");
    expect(failures[0].name).toBe("Junk File");
    expect(failures[0].reason).toMatch(/invalid playthrough/);
    expect(failures[0].backupPath).toBe(join(dir, "junk.json.bak"));
  });
});

describe("character library — folder-per-entity", () => {
  it("lists templates across folders, including version-suffixed files", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-folders-"));
    tempDirs.push(dir);
    const miraDir = join(dir, "mira");
    mkdirSync(miraDir, { recursive: true });
    writeFileSync(join(miraDir, "mira.json"), JSON.stringify({ id: "char_mira", name: "Mira", version: 2, content: "latest" }), "utf8");
    writeFileSync(join(miraDir, "mira.v1.json"), JSON.stringify({ id: "char_mira_v1", name: "Mira", version: 1, content: "old" }), "utf8");
    const floraDir = join(dir, "flora");
    mkdirSync(floraDir, { recursive: true });
    writeFileSync(join(floraDir, "flora.json"), JSON.stringify({ id: "char_flora", name: "Flora", version: 1, content: "x" }), "utf8");

    const list = listCharacterTemplates(dir);

    expect(list.map((t) => t.id).sort()).toEqual(["char_flora", "char_mira", "char_mira_v1"]);
  });

  it("quarantines a corrupt file inside a folder and still loads the rest", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-corrupt-"));
    tempDirs.push(dir);
    const folder = join(dir, "mira");
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, "mira.json"), JSON.stringify({ id: "char_mira", name: "Mira", version: 1, content: "ok" }), "utf8");
    writeFileSync(join(folder, "broken.json"), "{ nope", "utf8");

    const list = listCharacterTemplates(dir);

    expect(list.map((t) => t.id)).toEqual(["char_mira"]);
    expect(existsSync(join(folder, "broken.json"))).toBe(false);
    expect(existsSync(join(folder, "broken.json.bak"))).toBe(true);
  });

  it("missing dir → demo fallback; present-but-empty dir → empty library", () => {
    const missing = mkdtempSync(join(tmpdir(), "bobbinloom-chars-missing-"));
    tempDirs.push(missing);
    // A non-existent library dir → demo-template fallback (preserved behavior)
    expect(listCharacterTemplates(join(missing, "nope"))).toHaveLength(1);

    const empty = mkdtempSync(join(tmpdir(), "bobbinloom-chars-empty-"));
    tempDirs.push(empty);
    mkdirSync(empty, { recursive: true });
    expect(listCharacterTemplates(empty)).toEqual([]);
  });

  it("create writes <slug>/<slug>.json and suffix-collides on duplicate names", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-create-"));
    tempDirs.push(dir);

    const a = createCharacterTemplateRecord("Mira", dir);
    const b = createCharacterTemplateRecord("Mira", dir);

    expect(existsSync(join(dir, "mira", "mira.json"))).toBe(true);
    expect(existsSync(join(dir, "mira-2", "mira-2.json"))).toBe(true);
    expect(a.id).not.toBe(b.id);
    expect(listCharacterTemplates(dir)).toHaveLength(2);
  });

  it("rename moves the folder and files; id stays stable", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-rename-"));
    tempDirs.push(dir);
    const created = createCharacterTemplateRecord("Mira", dir);

    const renamed = updateCharacterTemplateRecord(created.id, { name: "Mira II" }, dir);

    expect(renamed?.name).toBe("Mira II");
    expect(existsSync(join(dir, "mira"))).toBe(false);
    expect(existsSync(join(dir, "mira-ii", "mira-ii.json"))).toBe(true);
    expect(getCharacterTemplate(created.id, dir)?.name).toBe("Mira II");
  });

  it("updates creatorNotes on an existing character template", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-notes-"));
    tempDirs.push(dir);
    const created = createCharacterTemplateRecord("Mira", dir);

    const updated = updateCharacterTemplateRecord(created.id, { creatorNotes: "Author comments and lore notes." }, dir);

    expect(updated?.creatorNotes).toBe("Author comments and lore notes.");
    expect(getCharacterTemplate(created.id, dir)?.creatorNotes).toBe("Author comments and lore notes.");
  });

  it("delete quarantines the folder to .bak", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-delete-"));
    tempDirs.push(dir);
    const created = createCharacterTemplateRecord("Mira", dir);

    expect(deleteCharacterTemplateRecord(created.id, dir)).toBe(true);

    expect(existsSync(join(dir, "mira"))).toBe(false);
    expect(existsSync(join(dir, "mira.bak"))).toBe(true);
    expect(listCharacterTemplates(dir)).toEqual([]);
  });
});

describe("persona store — folder-per-entity", () => {
  it("create/update/delete round-trips through <slug>/<slug>.json", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-personas-"));
    tempDirs.push(dir);

    const a = createPersonaRecord("Alice", undefined, dir);
    const b = createPersonaRecord("Bob", undefined, dir);
    expect(existsSync(join(dir, "alice", "alice.json"))).toBe(true);
    expect(existsSync(join(dir, "bob", "bob.json"))).toBe(true);

    const renamed = updatePersonaRecord(a.id, { name: "Alice A" }, dir);
    expect(renamed?.name).toBe("Alice A");
    expect(existsSync(join(dir, "alice"))).toBe(false);
    expect(existsSync(join(dir, "alice-a", "alice-a.json"))).toBe(true);

    expect(deletePersonaRecord(a.id, dir)).toBe(true);
    expect(existsSync(join(dir, "alice-a.bak"))).toBe(true);
    expect(listPersonas(dir).map((p) => p.id)).toEqual([b.id]);
  });

  it("setDefaultPersonaRecord flips flags across files", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-personas-default-"));
    tempDirs.push(dir);

    const a = createPersonaRecord("Alice", undefined, dir);
    const b = createPersonaRecord("Bob", undefined, dir);

    setDefaultPersonaRecord(a.id, dir);
    expect(getPersona(a.id, dir)?.isDefault).toBe(true);
    expect(getPersona(b.id, dir)?.isDefault).toBe(false);

    setDefaultPersonaRecord(b.id, dir);
    expect(getPersona(a.id, dir)?.isDefault).toBe(false);
    expect(getPersona(b.id, dir)?.isDefault).toBe(true);
  });
});

describe("playthrough store — validate on write", () => {
  it("updatePlaythroughRecord throws on an invalid playthrough and never persists it", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-validate-"));
    tempDirs.push(dir);
    const created = createPlaythroughRecord(dir, "Valid Run");

    const invalid = { ...created, name: 123 } as unknown as Playthrough;
    expect(() => updatePlaythroughRecord(dir, invalid)).toThrow(/refusing to persist invalid playthrough/);

    // The original good file is untouched — the invalid object was never written.
    const onDisk = JSON.parse(readFileSync(join(dir, `${created.id}.json`), "utf8"));
    expect(onDisk.name).toBe("Valid Run");
  });
});

describe("character library — CCv2 metadata stamping (A1)", () => {
  it("createCharacterTemplateRecord stamps spec/specVersion/tags/extensions and round-trips", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-chars-stamp-"));
    tempDirs.push(dir);

    const t = createCharacterTemplateRecord("Mira", dir);

    expect(t.spec).toBe("bobbinloom_chara");
    expect(t.specVersion).toBe("1.0");
    expect(t.tags).toEqual([]);
    expect(t.extensions).toEqual({});

    const loaded = getCharacterTemplate(t.id, dir);
    expect(loaded?.spec).toBe("bobbinloom_chara");
    expect(loaded?.specVersion).toBe("1.0");
    expect(loaded?.tags).toEqual([]);
    expect(loaded?.extensions).toEqual({});
  });
});

describe("character library — CCv2 import (A5)", () => {
  const card: ParsedCard = {
    name: "Mira",
    description: "A curious fox girl.\n{{char}} loves exploring.",
    personality: "Friendly",
    scenario: "A misty forest.",
    creator: "PPLong",
    creatorNotes: "My first card.",
    tags: ["Fox Girl", "Adventure", "fox girl"],
    characterVersion: "1.2",
  };

  it("import writes the untouched original + .bl.json and lists the record", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-ccv2-import-"));
    tempDirs.push(dir);
    const bytes = Buffer.from("fake-png-bytes");
    const result = importCharacterCard(card, bytes, "png", dir);

    expect(result.created).toBe(true);
    expect(existsSync(join(dir, "mira", "mira.png"))).toBe(true);
    expect(existsSync(join(dir, "mira", "mira.bl.json"))).toBe(true);
    // Original bytes are preserved verbatim (D5).
    expect(readFileSync(join(dir, "mira", "mira.png"))).toEqual(bytes);

    const record = result.record;
    expect(record.format).toBe("ccv2");
    expect(record.spec).toBe("bobbinloom_chara");
    expect(record.specVersion).toBe("1.0");
    expect(record.title).toBe("Mira"); // D16
    expect(record.content).toBe(card.description); // D6: raw description blob
    expect(record.creator).toBe("pplong"); // D4
    expect(record.tags).toEqual(["fox_girl", "adventure"]); // D4: normalize + dedupe
    expect(record.cardRef).toEqual({ file: "mira.png", kind: "png" });
    expect(record.cardVersion).toBe("1.2");
    expect(record.scenario).toBe("A misty forest."); // D7

    // The .bl.json record round-trips through the schema and the scanner.
    const listed = listCharacterTemplates(dir);
    expect(listed.map((t) => t.id)).toEqual([record.id]);
    const raw = JSON.parse(readFileSync(join(dir, "mira", "mira.bl.json"), "utf8"));
    expect(CharacterTemplateSchema.safeParse(raw).success).toBe(true);
  });

  it("json cards land in <slug>.card.json — skipped by the scanner, never quarantined", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-ccv2-json-"));
    tempDirs.push(dir);
    const rawCard = Buffer.from(
      JSON.stringify({ spec: "chara_card_v2", data: { name: "Flora", description: "hi" } }),
      "utf8"
    );
    const result = importCharacterCard({ ...card, name: "Flora", creator: "" }, rawCard, "json", dir);

    const sidecar = join(dir, "flora", "flora.card.json");
    expect(existsSync(sidecar)).toBe(true);
    expect(existsSync(join(dir, "flora", "flora.bl.json"))).toBe(true);

    // The raw CCv2 JSON is NOT a valid template — without the *.card.json skip
    // rule it would fail validation and get quarantined (D17).
    const listed = listCharacterTemplates(dir);
    expect(listed.map((t) => t.id)).toEqual([result.record.id]);
    expect(existsSync(sidecar)).toBe(true); // not quarantined
    expect(existsSync(sidecar + ".bak")).toBe(false);
  });

  it("re-importing the same name+creator upserts in place (same id, created:false)", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-ccv2-upsert-"));
    tempDirs.push(dir);
    const first = importCharacterCard(card, Buffer.from("png-v1"), "png", dir);
    const second = importCharacterCard({ ...card, description: "updated" }, Buffer.from("png-v2"), "png", dir);

    expect(second.created).toBe(false); // D11
    expect(second.record.id).toBe(first.record.id);
    expect(second.record.content).toBe("updated");
    expect(listCharacterTemplates(dir)).toHaveLength(1);
    expect(readdirSync(join(dir, "mira"))).toEqual(expect.arrayContaining(["mira.png", "mira.bl.json"]));
  });

  it("a different creator gets a new unique slug", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-ccv2-slug-"));
    tempDirs.push(dir);
    const a = importCharacterCard(card, Buffer.from("a"), "png", dir);
    const b = importCharacterCard({ ...card, creator: "Someone Else" }, Buffer.from("b"), "png", dir);

    expect(existsSync(join(dir, "mira"))).toBe(true);
    expect(existsSync(join(dir, "mira-2"))).toBe(true);
    expect(b.record.id).not.toBe(a.record.id);
    expect(b.record.creator).toBe("someone else");
  });

  it("renaming an imported character keeps .bl.json and .v<N>.json suffixes", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-ccv2-rename-"));
    tempDirs.push(dir);
    const imported = importCharacterCard(card, Buffer.from("png"), "png", dir);
    // Simulate an older BL version file inside the imported folder.
    writeFileSync(
      join(dir, "mira", "mira.v2.json"),
      JSON.stringify({ id: "char_old_v2", name: "Mira", version: 2, content: "old" }),
      "utf8"
    );

    const renamed = updateCharacterTemplateRecord(imported.record.id, { name: "Mira II" }, dir);

    expect(renamed?.name).toBe("Mira II");
    expect(existsSync(join(dir, "mira"))).toBe(false);
    // Suffixes survive the rename — .bl.json must NOT become plain .json.
    expect(existsSync(join(dir, "mira-ii", "mira-ii.bl.json"))).toBe(true);
    expect(existsSync(join(dir, "mira-ii", "mira-ii.v2.json"))).toBe(true);
    expect(existsSync(join(dir, "mira-ii", "mira.bl.json"))).toBe(false);
    expect(existsSync(join(dir, "mira-ii", "mira.v2.json"))).toBe(false);
    // The raw PNG sidecar keeps its name; cardRef still resolves.
    expect(existsSync(join(dir, "mira-ii", "mira.png"))).toBe(true);
  });

  it("conversion apply removes the stale .bl.json import record so the card reads as one BL record", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-ccv2-convert-cleanup-"));
    tempDirs.push(dir);
    const imported = importCharacterCard(card, Buffer.from("png"), "png", dir);

    // Simulate the conversion apply: write the BL record to <slug>.json while
    // the original <slug>.bl.json (format "ccv2", same id) is still on disk.
    updateCharacterTemplateRecord(imported.record.id, {
      content: "[Species]: Fox Girl\n[Personality]\nFriendly",
      format: undefined,
      ccv2Content: card.description,
    }, dir);

    // Before cleanup: the scanner reads both records (the duplicate bug).
    expect(readdirSync(join(dir, "mira")).filter((f) => f.endsWith(".json"))).toContain("mira.bl.json");
    expect(listCharacterTemplates(dir)).toHaveLength(2);

    removeCharacterImportRecord(imported.record.id, dir);

    // After cleanup: only the converted <slug>.json remains, one record total.
    expect(existsSync(join(dir, "mira", "mira.bl.json"))).toBe(false);
    expect(existsSync(join(dir, "mira", "mira.json"))).toBe(true);
    // The raw original PNG (avatar source) is untouched.
    expect(existsSync(join(dir, "mira", "mira.png"))).toBe(true);
    const list = listCharacterTemplates(dir);
    expect(list).toHaveLength(1);
    expect(list[0].format).toBeUndefined();
    expect(list[0].ccv2Content).toBe(card.description);
  });
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

describe("resolveCast — CCv2 guard", () => {
  it("skips CCv2 format records when resolving castIds (hermetic, explicit chars dir)", () => {
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-cast-guard-"));
    tempDirs.push(dir);
    const normal = createCharacterTemplateRecord("Normal Gal", dir);
    const ccv2 = importCharacterCard(makeCard("CCv2 Gal"), Buffer.from("{}"), "json", dir).record;
    const result = resolveCast([ccv2.id, normal.id], dir);
    const names = (result ?? []).map((t) => t.name);
    expect(names).toContain("Normal Gal");
    expect(names).not.toContain("CCv2 Gal");
  });

  it("reads the library (CHARACTERS_DIR) when no dir is passed, not the caller's playthroughs dir", () => {
    // Regression guard: createPlaythroughRecord's `dir` is the playthroughs folder;
    // resolveCast must still resolve cast against the library, not that folder.
    // (Hermetic: use a temp playthroughs dir and assert no throw + empty-safe result.)
    const dir = mkdtempSync(join(tmpdir(), "bobbinloom-cast-default-"));
    tempDirs.push(dir);
    const pt = createPlaythroughRecord(dir, "Cast Default", undefined, ["char_nonexistent_xyz"]);
    expect(Array.isArray(pt.characters)).toBe(true);
  });
});
