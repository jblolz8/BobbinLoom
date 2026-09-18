/** Cover art on a playthrough card.
 *
 *  The chain under test is: manual pick → latest image → present-cast collage → nothing. Each
 *  step is a REFERENCE either into the content-addressed image store or into the character
 *  library, and the interesting cases are the ones where a reference points at bytes that are
 *  no longer there — a card must fall through, never render broken.
 *
 *  Also pinned here: the sweep counts cover references (a manual cover is a reference no message
 *  carries), deleting the image that IS the cover drops the pointer, and setting a cover never
 *  touches `updatedAt` (the library is sorted by it, and art is not story activity).
 *
 *  Everything runs in temp directories; the real `data/` is never read or written. */
import { existsSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { ParsedCard } from "../src/server/characterCards/parseCard";
import { createBlankPlaythrough } from "../src/engine/playthroughFactory";
import type { CharacterTemplate, Playthrough } from "../src/schemas";
import { COVER_COLLAGE_LIMIT, resolvePlaythroughCover } from "../src/server/coverResolver";
import { saveImageBytes, sweepOrphanImages } from "../src/server/imageStore";
import { ProviderManager } from "../src/server/providerManager";
import { imageRoutes } from "../src/server/routes/images";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import {
  createCharacterTemplateRecord,
  getPlaythroughRecord,
  importCharacterCard,
  listPlaythroughRecords,
  resolveCharacterPortraits,
  setPlaythroughCoverRecord,
  updatePlaythroughRecord
} from "../src/server/store";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

/** Production layout: records, images and the character library in separate temp directories. */
function harness(): {
  app: FastifyInstance;
  root: string;
  dataDir: string;
  imagesDir: string;
  charactersDir: string;
} {
  const root = tempDir("bobbinloom-cover-");
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const charactersDir = join(root, "characters");
  const app = Fastify();
  app.register(playthroughRoutes, { dataDir, imagesDir, charactersDir });
  app.register(imageRoutes, {
    dataDir,
    imagesDir,
    manager: new ProviderManager(settingsDir),
    settingsDir
  });
  return { app, root, dataDir, imagesDir, charactersDir };
}

/** Real PNG bytes under their content-addressed name — resolution checks existence on disk, so
 *  a fixture that only names a file would resolve as "no cover". */
function storeImage(imagesDir: string, seed: string): string {
  return saveImageBytes(pngBytes(seed), "image/png", imagesDir).file;
}

/** A plausible-but-absent file name: hash-shaped, so the traversal guard passes and the
 *  existence check is what rejects it (the "the file was deleted behind us" case). */
function missingFile(seed: string): string {
  return `${seed.repeat(64).slice(0, 64)}.png`;
}

function card(name: string): ParsedCard {
  return {
    name,
    description: "[Species]: Test",
    personality: "",
    scenario: "",
    creator: "test",
    creatorNotes: "",
    tags: [],
    characterVersion: "1"
  };
}

/** A character with art: an imported CCv2 card whose PNG is the portrait fallback. */
function characterWithArt(charactersDir: string, name: string): CharacterTemplate {
  return importCharacterCard(card(name), pngBytes(`card-${name}`), "png", charactersDir).record;
}

function coverOf(playthrough: Playthrough, opts: { imagesDir: string; charactersDir?: string }) {
  return resolvePlaythroughCover(playthrough, opts);
}

describe("resolvePlaythroughCover", () => {
  it("prefers a manual pick over the story's own images", () => {
    const { dataDir, imagesDir } = harness();
    const latest = storeImage(imagesDir, "latest");
    const manual = storeImage(imagesDir, "manual");
    const pt = writePlaythroughWithImages(dataDir, "Picked", [[latest]], {
      cover: { file: manual, updatedAt: "2026-02-01T00:00:00.000Z" }
    });

    expect(coverOf(pt, { imagesDir })).toEqual({ source: "manual", file: manual });
  });

  it("falls through when the manual pick's file is gone", () => {
    const { dataDir, imagesDir } = harness();
    const latest = storeImage(imagesDir, "latest");
    const pt = writePlaythroughWithImages(dataDir, "Stale", [[latest]], {
      cover: { file: missingFile("ab"), updatedAt: "2026-02-01T00:00:00.000Z" }
    });

    expect(coverOf(pt, { imagesDir })).toEqual({ source: "latest", file: latest });
  });

  it("takes the newest visible message's LAST image", () => {
    const { dataDir, imagesDir } = harness();
    const first = storeImage(imagesDir, "first");
    const older = storeImage(imagesDir, "older");
    const newest = storeImage(imagesDir, "newest");
    const pt = writePlaythroughWithImages(dataDir, "Newest", [[first], [older], [newest, first]]);

    expect(coverOf(pt, { imagesDir })).toEqual({ source: "latest", file: first });
  });

  it("ignores images on hidden messages", () => {
    const { dataDir, imagesDir } = harness();
    const visible = storeImage(imagesDir, "visible");
    const hidden = storeImage(imagesDir, "hidden");
    const pt = writePlaythroughWithImages(dataDir, "Hidden", [[visible], [], [hidden]]);
    pt.messages[2].hidden = true;
    updatePlaythroughRecord(dataDir, pt);

    expect(coverOf(pt, { imagesDir })).toEqual({ source: "latest", file: visible });
  });

  it("keeps walking back when a newer image's file is missing on disk", () => {
    const { dataDir, imagesDir } = harness();
    const present = storeImage(imagesDir, "present");
    const pt = writePlaythroughWithImages(dataDir, "Walk", [[present], [], [missingFile("cd")]]);

    expect(coverOf(pt, { imagesDir })).toEqual({ source: "latest", file: present });
  });

  it("builds a collage from the PRESENT cast, in cast order, skipping characters with no art", () => {
    const { dataDir, imagesDir, charactersDir } = harness();
    const aria = characterWithArt(charactersDir, "Aria");
    const bran = characterWithArt(charactersDir, "Bran");
    const cyn = createCharacterTemplateRecord("Cyn", charactersDir); // BL-native: no art
    const pt = createBlankPlaythrough("Cast Story", undefined, [aria, bran, cyn]);
    updatePlaythroughRecord(dataDir, pt);

    expect(coverOf(pt, { imagesDir, charactersDir })).toEqual({
      source: "cast",
      characterCount: 2,
      characters: [{ id: aria.id, name: "Aria" }, { id: bran.id, name: "Bran" }]
    });
  });

  it("leaves out cast who are somewhere else", () => {
    const { dataDir, imagesDir, charactersDir } = harness();
    const aria = characterWithArt(charactersDir, "Aria");
    const bran = characterWithArt(charactersDir, "Bran");
    const pt = createBlankPlaythrough("Apart", undefined, [aria, bran]);
    pt.characters[1].currentLocationId = "somewhere_else";
    updatePlaythroughRecord(dataDir, pt);

    expect(coverOf(pt, { imagesDir, charactersDir })).toEqual({
      source: "cast",
      characterCount: 1,
      characters: [{ id: aria.id, name: "Aria" }]
    });
  });

  it(`caps the collage at ${COVER_COLLAGE_LIMIT} characters`, () => {
    const { dataDir, imagesDir, charactersDir } = harness();
    const cast = ["One", "Two", "Three", "Four", "Five"].map((name) =>
      characterWithArt(charactersDir, name)
    );
    const pt = createBlankPlaythrough("Crowd", undefined, cast);
    updatePlaythroughRecord(dataDir, pt);

    const cover = coverOf(pt, { imagesDir, charactersDir });
    expect(cover?.characters?.map((c) => c.id)).toEqual(cast.slice(0, COVER_COLLAGE_LIMIT).map((t) => t.id));
    // The card says "+N" for the rest, so the count travels BEFORE the cap.
    expect(cover?.characterCount).toBe(cast.length);
  });

  it("reports no cover when there is nothing to show", () => {
    const { dataDir, imagesDir, charactersDir } = harness();
    const pt = writePlaythroughWithImages(dataDir, "Bare");

    expect(coverOf(pt, { imagesDir, charactersDir })).toBeNull();
  });
});

describe("resolveCharacterPortraits", () => {
  it("returns only the ids with art, in the order given", () => {
    const charactersDir = tempDir("bobbinloom-cover-lib-");
    const aria = characterWithArt(charactersDir, "Aria");
    const cyn = createCharacterTemplateRecord("Cyn", charactersDir);
    const bran = characterWithArt(charactersDir, "Bran");

    expect(resolveCharacterPortraits([aria.id, cyn.id, bran.id, "char_missing"], charactersDir)).toEqual([
      { id: aria.id },
      { id: bran.id }
    ]);
  });
});

describe("setPlaythroughCoverRecord", () => {
  it("sets a cover without touching updatedAt, and clears it again", () => {
    const { dataDir, imagesDir } = harness();
    const file = storeImage(imagesDir, "manual");
    const pt = writePlaythroughWithImages(dataDir, "Keep", []);
    const before = pt.updatedAt;

    const set = setPlaythroughCoverRecord(dataDir, pt.id, { file });
    expect(set?.cover?.file).toBe(file);
    // Art is not story activity: the library is sorted by updatedAt desc, so bumping it here
    // would reorder the shelf every time a cover was changed.
    expect(set?.updatedAt).toBe(before);

    const cleared = setPlaythroughCoverRecord(dataDir, pt.id, null);
    expect(cleared?.cover).toBeUndefined();
    expect(getPlaythroughRecord(dataDir, pt.id)?.cover).toBeUndefined();
  });

  it("returns null for an unknown playthrough", () => {
    const { dataDir } = harness();
    expect(setPlaythroughCoverRecord(dataDir, "play_nope", null)).toBeNull();
  });
});

describe("the cover routes", () => {
  it("sets a manual cover, keeps it out of updatedAt, and reports it in the list", async () => {
    const h = harness();
    const file = storeImage(h.imagesDir, "manual");
    const pt = writePlaythroughWithImages(h.dataDir, "Routed", []);
    const before = pt.updatedAt;

    const res = await h.app.inject({
      method: "POST",
      url: `/api/playthroughs/${pt.id}/cover`,
      payload: { file }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Playthrough;
    expect(body.cover?.file).toBe(file);
    expect(body.updatedAt).toBe(before);

    const list = await h.app.inject({ method: "GET", url: "/api/playthroughs" });
    const listed = (list.json() as { playthroughs: { id: string; cover: unknown }[] }).playthroughs.find(
      (p) => p.id === pt.id
    );
    expect(listed?.cover).toEqual({ source: "manual", file });
  });

  it("refuses a file that is not in the store, and leaves the record alone", async () => {
    const h = harness();
    const pt = writePlaythroughWithImages(h.dataDir, "Refused", []);

    const res = await h.app.inject({
      method: "POST",
      url: `/api/playthroughs/${pt.id}/cover`,
      payload: { file: missingFile("ef") }
    });

    expect(res.statusCode).toBe(400);
    expect(getPlaythroughRecord(h.dataDir, pt.id)?.cover).toBeUndefined();
  });

  it("refuses a name that could not be a stored file at all", async () => {
    const h = harness();
    const pt = writePlaythroughWithImages(h.dataDir, "Traversal", []);

    const res = await h.app.inject({
      method: "POST",
      url: `/api/playthroughs/${pt.id}/cover`,
      payload: { file: "../data/images/secret.png" }
    });

    expect(res.statusCode).toBe(400);
  });

  it("answers 404 for an unknown playthrough", async () => {
    const h = harness();
    const file = storeImage(h.imagesDir, "manual");

    const res = await h.app.inject({
      method: "POST",
      url: "/api/playthroughs/play_nope/cover",
      payload: { file }
    });

    expect(res.statusCode).toBe(404);
  });

  it("clears the choice, handing the card back to the automatic chain", async () => {
    const h = harness();
    const latest = storeImage(h.imagesDir, "latest");
    const manual = storeImage(h.imagesDir, "manual");
    const pt = writePlaythroughWithImages(h.dataDir, "Cleared", [[latest]], {
      cover: { file: manual, updatedAt: "2026-02-01T00:00:00.000Z" }
    });

    const res = await h.app.inject({ method: "DELETE", url: `/api/playthroughs/${pt.id}/cover` });
    expect(res.statusCode).toBe(200);
    expect((res.json() as Playthrough).cover).toBeUndefined();

    const list = await h.app.inject({ method: "GET", url: "/api/playthroughs" });
    const listed = (list.json() as { playthroughs: { id: string; cover: unknown }[] }).playthroughs.find(
      (p) => p.id === pt.id
    );
    expect(listed?.cover).toEqual({ source: "latest", file: latest });
  });
});

describe("the sweep counts cover references", () => {
  it("keeps a manual cover's bytes alive even though no message references them", () => {
    const { dataDir, imagesDir } = harness();
    const file = storeImage(imagesDir, "cover-only");
    const pt = writePlaythroughWithImages(dataDir, "CoverOnly", [], {
      cover: { file, updatedAt: "2026-02-01T00:00:00.000Z" }
    });

    sweepOrphanImages(listPlaythroughRecords(dataDir).playthroughs, imagesDir);
    expect(existsSync(join(imagesDir, file))).toBe(true);

    // …and once the choice is cleared, the file is genuinely unreferenced and goes.
    setPlaythroughCoverRecord(dataDir, pt.id, null);
    sweepOrphanImages(listPlaythroughRecords(dataDir).playthroughs, imagesDir);
    expect(existsSync(join(imagesDir, file))).toBe(false);
  });
});

describe("removing the image that IS the cover", () => {
  it("drops the cover pointer in the same write, then sweeps the bytes", async () => {
    const h = harness();
    const file = storeImage(h.imagesDir, "worn");
    const pt = writePlaythroughWithImages(h.dataDir, "Worn", [[file]], {
      cover: { file, updatedAt: "2026-02-01T00:00:00.000Z" }
    });
    const messageId = pt.messages[0].id;

    const res = await h.app.inject({
      method: "DELETE",
      url: `/api/playthroughs/${pt.id}/messages/${messageId}/images/${file}`
    });

    expect(res.statusCode).toBe(200);
    const after = getPlaythroughRecord(h.dataDir, pt.id);
    expect(after?.cover).toBeUndefined();
    expect(after?.messages[0].images).toBeUndefined();
    expect(existsSync(join(h.imagesDir, file))).toBe(false);
  });

  it("leaves an unrelated cover alone", async () => {
    const h = harness();
    const worn = storeImage(h.imagesDir, "worn");
    const kept = storeImage(h.imagesDir, "kept");
    const pt = writePlaythroughWithImages(h.dataDir, "Unrelated", [[worn]], {
      cover: { file: kept, updatedAt: "2026-02-01T00:00:00.000Z" }
    });

    await h.app.inject({
      method: "DELETE",
      url: `/api/playthroughs/${pt.id}/messages/${pt.messages[0].id}/images/${worn}`
    });

    expect(getPlaythroughRecord(h.dataDir, pt.id)?.cover?.file).toBe(kept);
  });
});
