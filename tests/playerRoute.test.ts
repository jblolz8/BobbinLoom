import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import { createPlaythroughRecord, getPlaythroughRecord } from "../src/server/store";
import type { Playthrough } from "../src/schemas";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function harness(): { app: FastifyInstance; dataDir: string } {
  const root = mkdtempSync(join(tmpdir(), "bobbinloom-player-"));
  tempDirs.push(root);
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const app = Fastify();
  app.register(playthroughRoutes, { dataDir, imagesDir, charactersDir: join(root, "characters") });
  return { app, dataDir };
}

describe("PUT /api/playthroughs/:id/player", () => {
  it("updates player conditions and flags and persists to storage", async () => {
    const h = harness();
    const pt = createPlaythroughRecord(h.dataDir, "Player Test");

    const res = await h.app.inject({
      method: "PUT",
      url: `/api/playthroughs/${pt.id}/player`,
      payload: {
        conditions: ["🤕 Sprained Ankle", "😴 Exhausted"],
        flags: ["🗝️ Knows the Password"]
      }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json() as Playthrough;
    expect(body.playerCharacter.conditions).toEqual(["🤕 Sprained Ankle", "😴 Exhausted"]);
    expect(body.playerCharacter.flags).toEqual(["🗝️ Knows the Password"]);

    // Reload from store
    const reloaded = getPlaythroughRecord(h.dataDir, pt.id);
    expect(reloaded?.playerCharacter.conditions).toEqual(["🤕 Sprained Ankle", "😴 Exhausted"]);
    expect(reloaded?.playerCharacter.flags).toEqual(["🗝️ Knows the Password"]);
  });

  it("returns 404 when playthrough does not exist", async () => {
    const h = harness();
    const res = await h.app.inject({
      method: "PUT",
      url: `/api/playthroughs/nonexistent/player`,
      payload: { conditions: ["🤕 Hurt"] }
    });

    expect(res.statusCode).toBe(404);
  });
});
