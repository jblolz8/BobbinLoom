/** Which text connection closes a chapter.
 *
 *  `POST /api/playthroughs/:id/close-chapter` touches the connection four times — the summary
 *  call, the opening turn (provider AND budget), the memory embedding, and the post-close
 *  meter's budget — and resolves it ONCE. This file pins that: every request lands on the chosen
 *  connection's endpoint, and a request with no id follows the stored chapter preference, then
 *  the active connection.
 *
 *  Transport is a real local HTTP server because the provider uses the GLOBAL fetch; its paths
 *  stand in for the connections, so a recorded path says which one was used. No real provider, no
 *  network, temp directories only. */

import { createServer } from "node:http";
import type { Server } from "node:http";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderManager } from "../src/server/providerManager";
import { playthroughRoutes } from "../src/server/routes/playthroughs";
import { providerRoutes } from "../src/server/routes/providers";
import { createConnection, getRegistry, setActiveConnection, setChapterTextProvider } from "../src/server/providerRegistry";
import type { ProviderConnectionDraft, PublicProviderRegistry } from "../src/server/providerRegistry";
import { createBlankPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import { cleanupTempDirs, tempDir } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

/** One body answers both model calls: the chapter summary reads name/shortDescription/fullSummary,
 *  the opening turn reads narrative. Embedding requests are told apart by their payload. */
const MODEL_CONTENT = JSON.stringify({
  name: "The Closed Chapter",
  shortDescription: "A chapter that ended.",
  fullSummary: "Everything that happened in the chapter that ended.",
  narrative: "The next chapter opens.",
  choices: []
});

type Transport = { server: Server; urls: string[]; bodies: string[]; base: string };

function startTransport(): Promise<Transport> {
  const urls: string[] = [];
  const bodies: string[] = [];
  const server = createServer((req, res) => {
    urls.push(req.url ?? "");
    let body = "";
    req.on("data", (chunk) => { body += String(chunk); });
    req.on("end", () => {
      bodies.push(body);
      res.writeHead(200, { "Content-Type": "application/json" });
      const payload = body.includes("\"input\"")
        ? { data: [{ embedding: [0.1, 0.2, 0.3] }] }
        : { choices: [{ message: { content: MODEL_CONTENT } }] };
      res.end(JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      resolve({ server, urls, bodies, base: `http://127.0.0.1:${port}` });
    });
  });
}

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

/** Six visible messages, so closeChapterAction's own gate passes. */
function seedPlaythrough(dir: string): string {
  const playthrough = createBlankPlaythroughRecord(dir, "Chapter Closure");
  playthrough.messages = Array.from({ length: 8 }, (_, index) => ({
    id: `msg_${index}`,
    role: index % 2 === 0 ? ("user" as const) : ("assistant" as const),
    content: `message ${index}`,
    createdAt: `2026-01-0${index + 1}T00:00:00.000Z`,
    turn: Math.floor(index / 2) + 1
  }));
  playthrough.turn = 4;
  updatePlaythroughRecord(dir, playthrough);
  return playthrough.id;
}

async function harness() {
  const root = tempDir("bobbinloom-chapterprov-");
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const transport = await startTransport();

  const manager = new ProviderManager(settingsDir);
  const getProvider = vi.spyOn(manager, "getProvider");
  const getContextWindow = vi.spyOn(manager, "getContextWindow");
  const getMaxTokens = vi.spyOn(manager, "getMaxTokens");

  createConnection(settingsDir, conn("Alpha", `${transport.base}/alpha`, 32000, 800));
  createConnection(settingsDir, conn("Beta", `${transport.base}/beta`, 200000, 9000));
  setActiveConnection(settingsDir, "alpha");

  const playthroughId = seedPlaythrough(dataDir);

  const app = Fastify();
  app.register(playthroughRoutes, {
    dataDir,
    imagesDir: join(root, "images"),
    charactersDir: join(root, "characters"),
    manager
  });
  app.register(providerRoutes, { manager });
  await app.ready();

  return { app, manager, playthroughId, settingsDir, ...transport, getProvider, getContextWindow, getMaxTokens };
}

async function teardown(h: Awaited<ReturnType<typeof harness>>) {
  await h.app.close();
  await new Promise<void>((resolve) => h.server.close(() => resolve()));
}

function closeChapter(app: FastifyInstance, playthroughId: string, body: Record<string, unknown> = {}) {
  return app.inject({
    method: "POST",
    url: `/api/playthroughs/${playthroughId}/close-chapter`,
    payload: body
  });
}

describe("the text connection a chapter is closed with", () => {
  it("uses the connection the request names, resolved exactly once", async () => {
    const h = await harness();

    const res = await closeChapter(h.app, h.playthroughId, { providerId: "beta" });

    expect(res.statusCode).toBe(200);
    expect(h.urls.length).toBeGreaterThan(0);
    expect(h.urls.every((url) => url.startsWith("/beta"))).toBe(true);
    // ONE resolution for four call sites: a per-call-site resolve would show up as more calls.
    expect(h.getProvider).toHaveBeenCalledTimes(1);
    expect(h.getProvider).toHaveBeenCalledWith("beta");
    expect(h.getContextWindow).toHaveBeenCalledTimes(1);
    expect(h.getContextWindow).toHaveBeenCalledWith("beta");
    expect(h.getMaxTokens).toHaveBeenCalledTimes(1);
    expect(h.getMaxTokens).toHaveBeenCalledWith("beta");

    await teardown(h);
  });

  it("falls back to the stored chapter preference when the request carries no id", async () => {
    const h = await harness();
    setChapterTextProvider(h.settingsDir, "beta");

    const res = await closeChapter(h.app, h.playthroughId, {});

    expect(res.statusCode).toBe(200);
    expect(h.urls.every((url) => url.startsWith("/beta"))).toBe(true);
    expect(h.getProvider).toHaveBeenCalledWith("beta");

    await teardown(h);
  });

  it("falls back to the active connection when the named one no longer exists", async () => {
    const h = await harness();

    const res = await closeChapter(h.app, h.playthroughId, { providerId: "deleted-connection" });

    expect(res.statusCode).toBe(200);
    expect(h.urls.every((url) => url.startsWith("/alpha"))).toBe(true);

    await teardown(h);
  });
});

describe("PUT /api/settings/providers/chapter-provider", () => {
  it("round-trips the preference and reports it on the registry read", async () => {
    const h = await harness();

    const saved = await h.app.inject({
      method: "PUT",
      url: "/api/settings/providers/chapter-provider",
      payload: { providerId: "beta" }
    });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as PublicProviderRegistry).chapterTextProviderId).toBe("beta");

    // Read back through the registry, not the response: a field written by hand and forgotten in
    // one of the hand-built read paths comes back undefined here and nowhere else.
    const listed = await h.app.inject({ method: "GET", url: "/api/settings/providers" });
    expect((listed.json() as PublicProviderRegistry).chapterTextProviderId).toBe("beta");
    expect(getRegistry(h.settingsDir).chapterTextProviderId).toBe("beta");

    // `null` is a VALUE ("follow the active connection"), not "unset" — it must survive too.
    const cleared = await h.app.inject({
      method: "PUT",
      url: "/api/settings/providers/chapter-provider",
      payload: { providerId: null }
    });
    expect((cleared.json() as PublicProviderRegistry).chapterTextProviderId).toBeNull();

    await teardown(h);
  });

  it("refuses a body that is neither a string nor null", async () => {
    const h = await harness();

    const res = await h.app.inject({
      method: "PUT",
      url: "/api/settings/providers/chapter-provider",
      payload: { providerId: 7 }
    });
    expect(res.statusCode).toBe(400);

    await teardown(h);
  });
});
