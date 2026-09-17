/** The playthrough LIST is a projection, not a document dump.
 *
 *  These tests pin the WIRE shape of `GET /api/playthroughs`: a list response must never carry
 *  messages, snapshots, catalogs or cast sheets, and `total` is the pager's authority. The failure
 *  this guards is invisible in the UI — cards render exactly the same whether the route ships
 *  summaries or whole documents — and shows up only as bytes on the wire (measured: 748 KB for
 *  five playthroughs, of which 90% is messages and snapshots no card reads).
 *
 *  Everything runs in temp directories; the real `data/` is never read or written. */
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import { createPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import { LocationEntrySchema } from "../src/schemas";
import type { ChatMessage, Playthrough } from "../src/schemas";

let tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs) rmSync(dir, { recursive: true, force: true });
  tempDirs = [];
});

function harness(): { app: FastifyInstance; dataDir: string } {
  const root = mkdtempSync(join(tmpdir(), "bobbinloom-list-"));
  tempDirs.push(root);
  const dataDir = join(root, "playthroughs");
  const app = Fastify();
  // imagesDir is only reached by the delete route's sweep; pointed at a temp dir so no test can
  // ever touch the real image store.
  app.register(playthroughRoutes, { dataDir, imagesDir: join(root, "images") });
  return { app, dataDir };
}

function message(id: string, content: string, hidden = false): ChatMessage {
  return hidden
    ? { id, role: "user", content, createdAt: "2026-01-01T00:00:00.000Z", hidden: true }
    : { id, role: "assistant", content, createdAt: "2026-01-01T00:00:00.000Z" };
}

/** A catalog entry with its schema defaults filled in (x/y/icon/… are declared with .default(),
 *  so building the literal by hand fails the typecheck while a parse does not). */
function location(id: string, name: string) {
  return LocationEntrySchema.parse({ id, name });
}

/** The full key set a card may receive. Exact equality (not a subset check) is the point: a field
 *  smuggled in from the document — or a document field renamed into the summary — fails here. */
const SUMMARY_KEYS = [
  "castCount",
  "id",
  "isTimelineBranch",
  "lastMessagePreview",
  "locationName",
  "name",
  "turn",
  "updatedAt",
  "visibleMessageCount"
];

function list(app: FastifyInstance, query = "") {
  return app.inject({ method: "GET", url: `/api/playthroughs${query}` });
}

describe("GET /api/playthroughs ships summaries, not documents", () => {
  it("returns one projection per playthrough, carrying no document fields", async () => {
    const { app, dataDir } = harness();
    const first = createPlaythroughRecord(dataDir, "First Run");
    first.messages.push(message("m1", "The door creaks open."));
    first.locationCatalog = [location("loc_hall", "Great Hall")];
    first.locationId = "loc_hall";
    updatePlaythroughRecord(dataDir, first);
    createPlaythroughRecord(dataDir, "Second Run");

    const res = await list(app);
    const body = res.json() as { playthroughs: Record<string, unknown>[]; total: number; failures: unknown[] };

    expect(res.statusCode).toBe(200);
    expect(body.total).toBe(2);
    expect(body.playthroughs).toHaveLength(2);
    for (const item of body.playthroughs) {
      expect(Object.keys(item).sort()).toEqual(SUMMARY_KEYS);
    }
    // The three document blobs that made up ~90% of the old payload.
    for (const item of body.playthroughs) {
      expect(item).not.toHaveProperty("messages");
      expect(item).not.toHaveProperty("snapshots");
      expect(item).not.toHaveProperty("characters");
      expect(item).not.toHaveProperty("locationCatalog");
    }
  });

  it("resolves the location name, falling back to the location id", async () => {
    const { app, dataDir } = harness();
    const named = createPlaythroughRecord(dataDir, "Named");
    named.locationCatalog = [location("loc_hall", "Great Hall")];
    named.locationId = "loc_hall";
    updatePlaythroughRecord(dataDir, named);
    const unnamed = createPlaythroughRecord(dataDir, "Unnamed");
    unnamed.locationId = "loc_missing";
    updatePlaythroughRecord(dataDir, unnamed);

    const body = (await list(app)).json() as { playthroughs: { id: string; locationName: string }[] };

    expect(body.playthroughs.find((p) => p.id === named.id)?.locationName).toBe("Great Hall");
    expect(body.playthroughs.find((p) => p.id === unnamed.id)?.locationName).toBe("loc_missing");
  });

  it("counts visible messages only and previews the last one, truncated to 120 chars", async () => {
    const { app, dataDir } = harness();
    const long = "x".repeat(200);
    const record = createPlaythroughRecord(dataDir, "Chatty");
    record.messages.push(
      message("m1", "first"),
      message("m2", "hidden continuation", true),
      message("m3", long)
    );
    updatePlaythroughRecord(dataDir, record);
    const silent = createPlaythroughRecord(dataDir, "Silent");

    const body = (await list(app)).json() as {
      playthroughs: { id: string; visibleMessageCount: number; lastMessagePreview: string }[];
    };
    const chatty = body.playthroughs.find((p) => p.id === record.id);
    const quiet = body.playthroughs.find((p) => p.id === silent.id);

    expect(chatty?.visibleMessageCount).toBe(2);
    expect(chatty?.lastMessagePreview).toHaveLength(120);
    expect(chatty?.lastMessagePreview).toBe(long.slice(0, 120));
    expect(quiet?.visibleMessageCount).toBe(0);
    expect(quiet?.lastMessagePreview).toBe("");
  });

  it("orders newest-first and keeps total equal to the listed count", async () => {
    const { app, dataDir } = harness();
    const older = createPlaythroughRecord(dataDir, "Older");
    older.updatedAt = "2026-01-01T00:00:00.000Z";
    updatePlaythroughRecord(dataDir, older);
    const newer = createPlaythroughRecord(dataDir, "Newer");
    newer.updatedAt = "2026-06-01T00:00:00.000Z";
    updatePlaythroughRecord(dataDir, newer);

    const body = (await list(app)).json() as { playthroughs: { id: string }[]; total: number };

    expect(body.playthroughs.map((p) => p.id)).toEqual([newer.id, older.id]);
    expect(body.total).toBe(body.playthroughs.length);
  });

  it("hides timeline branches by default and includes them on request", async () => {
    const { app, dataDir } = harness();
    const parent = createPlaythroughRecord(dataDir, "Parent");
    const branch: Playthrough = {
      ...structuredClone(parent),
      id: "play_branch",
      name: "Branch",
      isTimelineBranch: true,
      rootPlaythroughId: parent.id
    };
    updatePlaythroughRecord(dataDir, branch);

    const defaults = (await list(app)).json() as { playthroughs: { id: string }[]; total: number };
    const withBranches = (await list(app, "?includeBranches=true")).json() as { playthroughs: { id: string }[]; total: number };

    expect(defaults.playthroughs.map((p) => p.id)).toEqual([parent.id]);
    expect(defaults.total).toBe(1);
    expect(withBranches.playthroughs.map((p) => p.id).sort()).toEqual([branch.id, parent.id].sort());
    expect(withBranches.total).toBe(2);
  });

  it("still reports an unreadable file in failures without losing the list", async () => {
    const { app, dataDir } = harness();
    createPlaythroughRecord(dataDir, "Healthy");
    writeFileSync(join(dataDir, "play_broken.json"), "{ not json", "utf8");

    const body = (await list(app)).json() as { playthroughs: { name: string }[]; total: number; failures: { id: string }[] };

    expect(body.playthroughs.map((p) => p.name)).toEqual(["Healthy"]);
    expect(body.total).toBe(1);
    expect(body.failures).toHaveLength(1);
    expect(body.failures[0].id).toBe("play_broken");
  });
});
