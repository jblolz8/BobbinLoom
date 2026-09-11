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
import { ProviderManager } from "../src/server/providerManager";
import { imageRoutes } from "../src/server/routes/images";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import { getPlaythroughRecord } from "../src/server/store";
import { truncateChat } from "../src/server/turnActions";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

/** Production layout: records in their own directory, images next to it,
 *  providers in a separate settings directory. Co-locating them would let the
 *  sweep's playthrough scan quarantine the registry file. Every store path is a
 *  temp dir — the real `data/` is never read or written. */
function harness() {
  const root = tempDir("bobbinloom-sweep-");
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const app = Fastify();
  app.register(playthroughRoutes, { dataDir, imagesDir });
  app.register(imageRoutes, {
    dataDir,
    imagesDir,
    manager: new ProviderManager(settingsDir),
    loadPresets: () => []
  });
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

describe("truncateChat sweeps the image store", () => {
  /** Records and images as siblings under one temp root, like every other test
   *  here — nothing points at the real `data/`. */
  function truncHarness() {
    const root = tempDir("bobbinloom-truncate-");
    return { root, dataDir: join(root, "playthroughs"), imagesDir: join(root, "images") };
  }

  it("removes an image only the truncated messages referenced and keeps a surviving message's image", () => {
    const h = truncHarness();
    const kept = saveImageBytes(pngBytes("kept"), "image/png", h.imagesDir).file;
    const truncated = saveImageBytes(pngBytes("truncated"), "image/png", h.imagesDir).file;
    const orphan = saveImageBytes(pngBytes("orphan-d"), "image/png", h.imagesDir).file;

    // msg0 (assistant, kept) · msg1 (user) · msg2 (assistant, truncated away).
    const pt = writePlaythroughWithImages(h.dataDir, "Trunc", [[kept], [], [truncated]]);
    const survivorId = pt.messages[0].id;
    const cutoffId = pt.messages[2].id;

    const result = truncateChat(h.dataDir, pt.id, cutoffId, h.imagesDir);

    expect(result.ok).toBe(true);
    // The surviving message keeps its file; the truncated block's file and the
    // unrelated orphan are both gone — proof the sweep scanned the store.
    expect(storedFiles(h.imagesDir)).toEqual([kept]);
    const stored = getPlaythroughRecord(h.dataDir, pt.id);
    expect(stored?.messages.map((m) => m.id)).toEqual([survivorId, pt.messages[1].id]);
    expect(stored?.messages[0].images?.[0].file).toBe(kept);
  });

  it("never collects a file another playthrough still references", () => {
    const h = truncHarness();
    // Same bytes → the SAME file on disk, referenced by both records.
    const shared = saveImageBytes(pngBytes("shared-trunc"), "image/png", h.imagesDir).file;
    const keeper = writePlaythroughWithImages(h.dataDir, "Keeper", [[shared]]);
    const pt = writePlaythroughWithImages(h.dataDir, "Trunc2", [[], [], [shared]]);

    const result = truncateChat(h.dataDir, pt.id, pt.messages[2].id, h.imagesDir);

    expect(result.ok).toBe(true);
    expect(storedFiles(h.imagesDir)).toEqual([shared]);
    expect(getPlaythroughRecord(h.dataDir, keeper.id)?.messages[0].images?.[0].file).toBe(shared);
  });

  it("defaults the sweep to the store beside the data dir, never the real one", () => {
    const h = truncHarness();
    const inStore = saveImageBytes(pngBytes("sibling"), "image/png", h.imagesDir).file;
    const pt = writePlaythroughWithImages(h.dataDir, "Sibling", [[], [], [inStore]]);

    // No imagesDir argument: the sweep must find `<root>/images` on its own.
    const result = truncateChat(h.dataDir, pt.id, pt.messages[2].id);

    expect(result.ok).toBe(true);
    expect(storedFiles(h.imagesDir)).toEqual([]);
  });

  it("does not fail the truncate when the sweep fails", () => {
    const h = truncHarness();
    const broken = brokenImagesDir(h.root);
    const pt = writePlaythroughWithImages(h.dataDir, "TruncFail", [[], [], []]);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const result = truncateChat(h.dataDir, pt.id, pt.messages[2].id, broken);

      expect(result.ok).toBe(true);
      if (!result.ok) return;
      expect(result.state.messages).toHaveLength(2);
      const stored = getPlaythroughRecord(h.dataDir, pt.id);
      expect(stored?.messages).toHaveLength(2);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});

describe("POST /api/settings/images/sweep", () => {
  function sweep(app: FastifyInstance) {
    return app.inject({ method: "POST", url: "/api/settings/images/sweep" });
  }

  it("returns the number of unreferenced files it removed, then no-ops", async () => {
    const h = harness();
    const referenced = saveImageBytes(pngBytes("referenced"), "image/png", h.imagesDir).file;
    const orphanA = saveImageBytes(pngBytes("orphan-e1"), "image/png", h.imagesDir).file;
    const orphanB = saveImageBytes(pngBytes("orphan-e2"), "image/png", h.imagesDir).file;
    writePlaythroughWithImages(h.dataDir, "Keeper", [[referenced]]);

    const first = await sweep(h.app);

    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual({ removed: 2 });
    expect(storedFiles(h.imagesDir)).toEqual([referenced]);
    expect(storedFiles(h.imagesDir)).not.toContain(orphanA);
    expect(storedFiles(h.imagesDir)).not.toContain(orphanB);

    // Nothing left to collect: a second ask is a counted no-op, not an error.
    const second = await sweep(h.app);

    expect(second.statusCode).toBe(200);
    expect(second.json()).toEqual({ removed: 0 });
    expect(storedFiles(h.imagesDir)).toEqual([referenced]);
  });

  it("is a no-op on an empty store", async () => {
    const h = harness();

    const res = await sweep(h.app);

    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ removed: 0 });
    expect(storedFiles(h.imagesDir)).toEqual([]);
  });

  it("surfaces a sweep failure as an error response instead of swallowing it", async () => {
    const h = harness();
    const app = Fastify();
    app.register(imageRoutes, {
      dataDir: h.dataDir,
      imagesDir: brokenImagesDir(h.root),
      manager: new ProviderManager(h.settingsDir),
      loadPresets: () => []
    });

    const res = await sweep(app);

    expect(res.statusCode).toBe(500);
    expect(typeof res.json().error).toBe("string");
    expect(res.json().error.length).toBeGreaterThan(0);
  });
});

describe("DELETE /api/playthroughs/:id/messages/:messageId/images/:file", () => {
  /** The ref is already gone from the persisted record by the time the sweep
   *  runs, so a sweep failure must not be reported as a failed removal. */
  it("keeps the shortened record and warns when the sweep fails", async () => {
    const root = tempDir("bobbinloom-per-image-");
    const settingsDir = join(root, "settings");
    const dataDir = join(root, "playthroughs");
    const stored = saveImageBytes(pngBytes("per-image"), "image/png", join(root, "images")).file;
    const pt = writePlaythroughWithImages(dataDir, "PerImage", [[stored]]);

    const app = Fastify();
    app.register(imageRoutes, {
      dataDir,
      imagesDir: brokenImagesDir(root),
      manager: new ProviderManager(settingsDir),
      loadPresets: () => []
    });
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    try {
      const res = await app.inject({
        method: "DELETE",
        url: `/api/playthroughs/${pt.id}/messages/${pt.messages[0].id}/images/${stored}`
      });

      expect(res.statusCode).toBe(200);
      const body = res.json() as { playthrough: { messages: { images?: unknown[] }[] } };
      expect(body.playthrough.messages[0].images ?? []).toHaveLength(0);
      // Persisted, not merely echoed back in the response.
      expect(getPlaythroughRecord(dataDir, pt.id)?.messages[0].images ?? []).toHaveLength(0);
      expect(warn).toHaveBeenCalled();
    } finally {
      warn.mockRestore();
    }
  });
});
