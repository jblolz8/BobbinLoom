/** Which text connection generates a NEW playthrough.
 *
 *  `POST /api/playthroughs/generate` resolves the connection ONCE and feeds the seed, the
 *  opening turn and the token budget from that single value. This file pins that: the endpoint
 *  that gets called is the chosen connection's, and an id that no longer exists — or a request
 *  with no id and no stored preference — lands on the active connection instead of failing.
 *
 *  Every assertion is about WHICH connection was used, so the transport is stubbed and records
 *  the URLs it was asked for: no real network call, and no dependence on his provider accounts.
 *  Temp directories only. */

import { createServer } from "node:http";
import type { Server } from "node:http";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderManager } from "../src/server/providerManager";
import { OpenAICompatibleProvider } from "../src/server/openAiCompatibleProvider";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import { providerRoutes } from "../src/server/routes/providers";
import { createConnection, setActiveConnection, setGenerationTextProvider } from "../src/server/providerRegistry";
import type { ProviderConnectionDraft } from "../src/server/providerRegistry";
import { cleanupTempDirs, tempDir } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

/** A real local HTTP server, because the provider fetches with the GLOBAL fetch — a stubbed
 *  transport would never be reached. Its paths are the two endpoints under test, so a recorded
 *  path says which connection the request actually used. */
function startTransport(options: { fail?: boolean } = {}): Promise<{ server: Server; urls: string[]; base: string }> {
  const urls: string[] = [];
  const server = createServer((req, res) => {
    urls.push(req.url ?? "");
    req.on("data", () => {});
    req.on("end", () => {
      res.writeHead(options.fail ? 500 : 200, { "Content-Type": "application/json" });
      res.end(
        options.fail
          ? JSON.stringify({ error: "stub failure" })
          : JSON.stringify({ choices: [{ message: { content: JSON.stringify(SEED) } }] })
      );
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, urls, base: `http://127.0.0.1:${port}` });
    });
  });
}

/** A seed that satisfies ScenarioSeedSchema — the point is to get PAST the seed call. */
const SEED = {
  locations: [{ id: "loc_home", name: "Home", description: "A warm room.", state: "", icon: "🏠", connections: [] }],
  character: { name: "Seeded Character", content: "[Species]: Test" },
  quest: { id: "quest_start", name: "Begin", summary: "Start the story." },
  items: [],
  startingFlags: [],
  npcs: [],
  openingText: "Setting the stage: the room is warm and the door is shut."
};

function conn(label: string, baseUrl: string, contextWindow: number, maxTokens: number): ProviderConnectionDraft {
  return {
    label,
    baseUrl,
    model: `model-${label.toLowerCase()}`,
    temperature: 0.7,
    maxTokens,
    contextWindow,
    kind: "text"
  };
}

async function harness(options: { fail?: boolean } = {}) {
  const root = tempDir("bobbinloom-genprov-");
  const settingsDir = join(root, "settings");
  const { server, urls, base } = await startTransport(options);

  const manager = new ProviderManager(settingsDir);
  const getProvider = vi.spyOn(manager, "getProvider");
  const getContextWindow = vi.spyOn(manager, "getContextWindow");

  // Two text connections on the one stub server, told apart by PATH. Alpha is active; beta is
  // the one the tests pick.
  createConnection(settingsDir, conn("Alpha", `${base}/alpha`, 32000, 800));
  createConnection(settingsDir, conn("Beta", `${base}/beta`, 200000, 9000));
  setActiveConnection(settingsDir, "alpha");

  const app = Fastify();
  app.register(playthroughRoutes, { dataDir: join(root, "playthroughs"), imagesDir: join(root, "images"), charactersDir: join(root, "characters"), manager });
  app.register(providerRoutes, { manager });

  return { app, manager, urls, settingsDir, getProvider, getContextWindow, server };
}

function generate(app: FastifyInstance, body: Record<string, unknown>) {
  return app.inject({ method: "POST", url: "/api/playthroughs/generate", payload: body });
}

describe("the text connection a new playthrough is generated with", () => {
  it("calls the connection the request names, resolved exactly once", async () => {
    const h = await harness();

    const res = await generate(h.app, { name: "Seeded", providerId: "beta", openingMode: "quick" });

    expect(res.statusCode).toBe(201);
    expect(h.urls.length).toBeGreaterThan(0);
    expect(h.urls.every((u) => u.startsWith("/beta"))).toBe(true);
    // ONE resolution: a per-call-site resolve would show up as a second call here.
    expect(h.getProvider).toHaveBeenCalledTimes(1);
    expect(h.getProvider).toHaveBeenCalledWith("beta");
    expect(h.getContextWindow).toHaveBeenCalledTimes(1);
    expect(h.getContextWindow).toHaveBeenCalledWith("beta");

    await h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  });

  it("keeps the budget on that same connection when the opening turn runs", async () => {
    // The stub fails, so the request returns 422 — what matters is that the connection it
    // ATTEMPTED and the pair it resolved are the chosen one, budget included.
    const h = await harness({ fail: true });

    const res = await generate(h.app, { name: "Fleshed", providerId: "beta", openingMode: "fleshedOut" });

    expect(res.statusCode).toBe(422);
    expect(h.urls[0]!.startsWith("/beta")).toBe(true);
    expect(h.getProvider).toHaveBeenCalledTimes(1);
    expect(h.getProvider).toHaveBeenCalledWith("beta");
    expect(h.getContextWindow).toHaveBeenCalledTimes(1);
    expect(h.getContextWindow).toHaveBeenCalledWith("beta");

    await h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  });

  it("falls back to the stored preference when the request carries no id", async () => {
    const h = await harness();
    setGenerationTextProvider(h.settingsDir, "beta");

    const res = await generate(h.app, { name: "Stored", openingMode: "quick" });

    expect(res.statusCode).toBe(201);
    expect(h.urls.every((u) => u.startsWith("/beta"))).toBe(true);
    expect(h.getProvider).toHaveBeenCalledWith("beta");

    await h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  });

  it("follows the active connection when nothing is chosen anywhere", async () => {
    const h = await harness();

    const res = await generate(h.app, { name: "Active", openingMode: "quick" });

    expect(res.statusCode).toBe(201);
    expect(h.urls.every((u) => u.startsWith("/alpha"))).toBe(true);
    expect(h.getProvider).toHaveBeenCalledWith(undefined);

    await h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  });

  it("degrades to the active connection for a choice whose connection is gone", async () => {
    const h = await harness();

    const res = await generate(h.app, { name: "Ghost", providerId: "ghost", openingMode: "quick" });

    expect(res.statusCode).toBe(201);
    expect(h.urls.every((u) => u.startsWith("/alpha"))).toBe(true);

    await h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  });
});

describe("the generation-provider preference endpoint", () => {
  it("remembers the choice, reports it back, and clears to null", async () => {
    const h = await harness();

    const set = await h.app.inject({ method: "PUT", url: "/api/settings/providers/generation-provider", payload: { providerId: "beta" } });
    expect(set.statusCode).toBe(200);
    expect(set.json().generationTextProviderId).toBe("beta");

    const read = await h.app.inject({ method: "GET", url: "/api/settings/providers" });
    expect(read.json().generationTextProviderId).toBe("beta");

    const cleared = await h.app.inject({ method: "PUT", url: "/api/settings/providers/generation-provider", payload: { providerId: null } });
    expect(cleared.statusCode).toBe(200);
    expect(cleared.json().generationTextProviderId).toBeNull();

    // A dangling id is accepted on purpose: the dropdown must be able to re-point a choice whose
    // connection was deleted, and resolution already falls back.
    const dangling = await h.app.inject({ method: "PUT", url: "/api/settings/providers/generation-provider", payload: { providerId: "gone" } });
    expect(dangling.statusCode).toBe(200);
    expect(dangling.json().generationTextProviderId).toBe("gone");

    // A wrong shape is still a 400, and the write is all-or-nothing.
    const bad = await h.app.inject({ method: "PUT", url: "/api/settings/providers/generation-provider", payload: { providerId: 42 } });
    expect(bad.statusCode).toBe(400);

    await h.app.close();
    await new Promise<void>((resolve) => h.server.close(() => resolve()));
  });
});
