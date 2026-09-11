/** Orphan-sweep wiring: a playthrough delete, a chat truncate, and the manual
 *  endpoint all sweep the content-addressed image store. Because bytes are
 *  SHARED (a branch structuredClones its parent's messages), every case here
 *  proves the two halves of that contract: an image nothing references any more
 *  goes away, and an image something still references stays. Everything runs in
 *  temp directories — the real `data/` is never read or written. */
import { existsSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { saveImageBytes } from "../src/server/imageStore";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import { getPlaythroughRecord } from "../src/server/store";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

/** Production layout: records in their own directory, images next to it,
 *  providers in a separate settings directory. Co-locating them would let the
 *  sweep's playthrough scan quarantine the registry file. */
function harness() {
  const root = tempDir("bobbinloom-sweep-");
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const app = Fastify();
  app.register(playthroughRoutes, { dataDir, imagesDir });
  return { app, root, settingsDir, dataDir, imagesDir };
}

/** A regular file where the images directory should be — every store read throws
 *  ENOTDIR, which is how a real sweep failure reaches the two call sites. */
function brokenImagesDir(root: string): string {
  const path = join(root, "images-is-a-file");
  writeFileSync(path, "not a directory", "utf8");
  return path;
}

function storedFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

function deletePlaythrough(app: FastifyInstance, id: string) {
  return app.inject({ method: "DELETE", url: `/api/playthroughs/${id}` });
}

describe("DELETE /api/playthroughs/:id sweeps the image store", () => {
  it("removes an image that only the deleted playthrough referenced", async () => {
    const h = harness();
    const only = saveImageBytes(pngBytes("solo"), "image/png", h.imagesDir).file;
    const pt = writePlaythroughWithImages(h.dataDir, "Solo", [[only]]);
    expect(storedFiles(h.imagesDir)).toEqual([only]);

    const res = await deletePlaythrough(h.app, pt.id);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
    expect(storedFiles(h.imagesDir)).toEqual([]);
    expect(getPlaythroughRecord(h.dataDir, pt.id)).toBeNull();
  });

  it("keeps an image that another playthrough still references", async () => {
    const h = harness();
    // Identical bytes → one file on disk shared by both records.
    const shared = saveImageBytes(pngBytes("shared"), "image/png", h.imagesDir).file;
    const orphan = saveImageBytes(pngBytes("orphan-b"), "image/png", h.imagesDir).file;
    const doomed = writePlaythroughWithImages(h.dataDir, "Doomed", [[shared]]);
    const keeper = writePlaythroughWithImages(h.dataDir, "Keeper", [[shared]]);

    const res = await deletePlaythrough(h.app, doomed.id);

    expect(res.statusCode).toBe(200);
    // The unrelated orphan is gone, so the sweep really ran and really scanned
    // the whole store — not just the two obvious files.
    expect(storedFiles(h.imagesDir)).toEqual([shared]);
    // The surviving record keeps its reference (and its bytes).
    expect(getPlaythroughRecord(h.dataDir, keeper.id)?.messages[0].images?.[0].file).toBe(shared);
  });

  it("keeps an image that a surviving timeline branch still references", async () => {
    const h = harness();
    const branchFile = saveImageBytes(pngBytes("branch"), "image/png", h.imagesDir).file;
    const orphan = saveImageBytes(pngBytes("orphan-c"), "image/png", h.imagesDir).file;
    const parent = writePlaythroughWithImages(h.dataDir, "Parent", [[branchFile]]);
    // A timeline branch is EXCLUDED from the default playthrough list — the
    // sweep has to ask for branches explicitly or this file dies with the parent.
    const branch = writePlaythroughWithImages(h.dataDir, "Branch", [[branchFile]], { isTimelineBranch: true });

    const res = await deletePlaythrough(h.app, parent.id);

    expect(res.statusCode).toBe(200);
    expect(storedFiles(h.imagesDir)).toEqual([branchFile]);
    expect(storedFiles(h.imagesDir)).not.toContain(orphan);
    expect(getPlaythroughRecord(h.dataDir, branch.id)?.messages[0].images?.[0].file).toBe(branchFile);
  });

  it("still reports the delete as successful when the sweep fails", async () => {
    const h = harness();
    const broken = brokenImagesDir(h.root);
    const app = Fastify();
    app.register(playthroughRoutes, { dataDir: h.dataDir, imagesDir: broken });
    const pt = writePlaythroughWithImages(h.dataDir, "Survivor", [[]]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const res = await deletePlaythrough(app, pt.id);

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ ok: true });
      // The record really was deleted; only the cleanup was skipped.
      expect(getPlaythroughRecord(h.dataDir, pt.id)).toBeNull();
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
