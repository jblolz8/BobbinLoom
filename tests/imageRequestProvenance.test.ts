/** Provenance + security proof for the request stored on an image ref.
 *
 *  The stored `request` must be the JSON BODY we sent to the image provider and
 *  nothing else — no headers, no API key. Both adapters build it from the body
 *  object alone; these tests fail loudly if that ever changes. They also cover
 *  the route that persists the ref and the backward-compatible schema field.
 */
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import type { ProviderConnection } from "../src/schemas";
import { ChatMessageSchema, MessageImageSchema } from "../src/schemas";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { OpenAIImagesProvider } from "../src/server/imageProvider/openaiImagesProvider";
import { VeniceImageProvider } from "../src/server/imageProvider/veniceImageProvider";
import { createConnection } from "../src/server/providerRegistry";
import { ProviderManager } from "../src/server/providerManager";
import { imageRoutes } from "../src/server/routes/images";
import { getPlaythroughRecord } from "../src/server/store";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

const API_KEY = "sk-provenance-sentinel-9f3a2b7c";
const PNG_A = pngBytes("request-provenance-a");
const PNG_B = pngBytes("request-provenance-b");
const TEXT_ANSWER = '{"prompt": "a woman in the rain", "negative_prompt": "blurry"}';

/** Any of these inside a stored request is a leak. The sentinel is the exact
 *  key the stub fetch sees in the Authorization header. */
const CREDENTIAL_MARKERS = ["authorization", "bearer", "apikey", "api_key", API_KEY];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** Fails unless `request` is JSON AND free of every credential marker. */
function expectBodyOnly(request: string): void {
  expect(typeof request).toBe("string");
  expect(() => JSON.parse(request)).not.toThrow();
  const lower = request.toLowerCase();
  for (const marker of CREDENTIAL_MARKERS) {
    expect(lower, `stored request leaked "${marker}"`).not.toContain(marker.toLowerCase());
  }
}

type Captured = { url: string; body: Record<string, unknown>; headers: Record<string, string> };

/** Records the URL, parsed body and headers of every outgoing call. */
function stubFetch(respond: (call: number) => Response): { fetchImpl: typeof fetch; calls: Captured[] } {
  const calls: Captured[] = [];
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body) : {},
      headers: { ...(init?.headers ?? {}) }
    });
    return respond(calls.length);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function testConfig(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    providerId: "venice_images",
    label: "Venice Images",
    baseUrl: "https://api.venice.ai/api/v1",
    apiKey: API_KEY,
    model: "test-image-model",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    maxRetries: 0,
    timeoutMs: 180_000,
    ...overrides
  };
}

function imageConn(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return {
    id: "venice_images",
    label: "Venice Images",
    baseUrl: "https://api.venice.ai/api/v1",
    model: "test-image-model",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    kind: "image",
    ...overrides
  };
}

describe("stored image request — the adapters", () => {
  it("stores the Venice body verbatim, style_preset included, and no credential", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ id: "gen", images: [PNG_A.toString("base64")], timing: { total: 5 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn({ stylePreset: "Anime", size: "1024x1024" }), fetchImpl);

    const result = await provider.generateImage({ prompt: "a scene", negativePrompt: "blurry" });

    // The call DID carry the key in its headers, so a header leak would show.
    expect(calls[0].headers.Authorization).toBe(`Bearer ${API_KEY}`);

    // Stored === sent, byte for byte.
    expect(result.rawRequest).toBe(JSON.stringify(calls[0].body));
    expect(JSON.parse(result.rawRequest)).toEqual(calls[0].body);
    expect((JSON.parse(result.rawRequest) as Record<string, unknown>).style_preset).toBe("Anime");
    expectBodyOnly(result.rawRequest);
  });

  it("stores the OpenAI-compatible body verbatim and no credential", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ created: 1, data: [{ b64_json: PNG_A.toString("base64") }] }));
    const provider = new OpenAIImagesProvider(testConfig(), imageConn({ apiStyle: "openai", stylePreset: "Anime", size: "1024x1024" }), fetchImpl);

    const result = await provider.generateImage({ prompt: "a scene" });

    expect(calls[0].headers.Authorization).toBe(`Bearer ${API_KEY}`);
    expect(result.rawRequest).toBe(JSON.stringify(calls[0].body));
    // This dialect has no style_preset field at all — the stored body says so.
    expect(JSON.parse(result.rawRequest)).not.toHaveProperty("style_preset");
    expectBodyOnly(result.rawRequest);
  });

  it("stores the body, never the response payload", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ id: "gen", images: [PNG_A.toString("base64")], timing: { total: 5 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn(), fetchImpl);
    const result = await provider.generateImage({ prompt: "a scene" });
    expect(result.rawRequest).not.toContain(PNG_A.toString("base64"));
  });
});

/** Route-level harness: temp dirs, a stub fetch, a real ProviderManager. */
function routeHarness() {
  const root = tempDir("bobbinloom-imgreq-");
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const calls: Captured[] = [];

  const fetchImpl = (async (url: any, init: any) => {
    calls.push({
      url: String(url),
      body: init?.body ? JSON.parse(init.body) : {},
      headers: { ...(init?.headers ?? {}) }
    });
    const href = String(url);
    if (href.includes("/chat/completions")) return jsonResponse({ choices: [{ message: { content: TEXT_ANSWER } }] });
    if (href.includes("/image/generate")) {
      return jsonResponse({ id: "gen_1", images: [PNG_A.toString("base64"), PNG_B.toString("base64")], timing: { total: 1234 } });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

  createConnection(settingsDir, { label: "Local Text", baseUrl: "http://localhost:1234/v1", model: "text-model", kind: "text" });
  createConnection(settingsDir, {
    label: "Venice Images",
    baseUrl: "https://api.venice.ai/api/v1",
    model: "image-model",
    kind: "image",
    apiStyle: "venice",
    stylePreset: "Anime",
    size: "1024x1024",
    apiKey: API_KEY
  });

  const manager = new ProviderManager(settingsDir, {}, fetchImpl);
  const app = Fastify();
  app.register(imageRoutes, { dataDir, imagesDir, manager, fetchImpl, loadPresets: () => [] });

  const playthrough = writePlaythroughWithImages(dataDir, "Run", [[], [], []]);
  return { app, dataDir, calls, playthroughId: playthrough.id, messageId: playthrough.messages[2].id };
}

describe("stored image request — the route", () => {
  it("puts the sent body on every variant's ref and persists it", async () => {
    const h = routeHarness();
    const res = await h.app.inject({
      method: "POST",
      url: `/api/playthroughs/${h.playthroughId}/messages/${h.messageId}/image`,
      payload: {}
    });
    expect(res.statusCode).toBe(200);

    const imageCall = h.calls.find((call) => call.url.includes("/image/generate"));
    expect(imageCall, "the image call must have happened").toBeDefined();
    expect(imageCall!.headers.Authorization).toBe(`Bearer ${API_KEY}`);

    const refs = res.json().playthrough.messages[2].images;
    expect(refs).toHaveLength(2);
    for (const ref of refs) {
      expectBodyOnly(ref.request);
      // The stored string IS what the adapter sent upstream.
      expect(JSON.parse(ref.request)).toEqual(imageCall!.body);
      expect(ref.request).toContain('"style_preset":"Anime"');
      expect(ref.request).not.toContain(PNG_A.toString("base64"));
    }
    // One call, one body: every variant carries the same request.
    expect(refs[0].request).toBe(refs[1].request);

    // It survives the round trip to disk, on both refs.
    const stored = getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images!;
    expect(stored.map((ref) => ref.request)).toEqual(refs.map((ref: { request?: string }) => ref.request));
  });
});

describe("stored image request — the schema", () => {
  const legacyRef = {
    file: `${"a".repeat(64)}.png`,
    prompt: "a prompt",
    providerId: "venice_images",
    model: "image-model",
    createdAt: "2026-01-01T00:00:00.000Z"
  };

  it("parses a ref stored before the field existed, and keeps it when present", () => {
    expect(MessageImageSchema.parse(legacyRef)).not.toHaveProperty("request");

    const withRequest = MessageImageSchema.parse({ ...legacyRef, request: '{"model":"image-model"}' });
    expect(withRequest.request).toBe('{"model":"image-model"}');

    // The message around it parses too — additive, not breaking.
    const message = ChatMessageSchema.parse({
      id: "msg_1",
      role: "assistant",
      content: "x",
      createdAt: "2026-01-01T00:00:00.000Z",
      images: [legacyRef, { ...legacyRef, request: '{"model":"image-model"}' }]
    });
    expect(message.images).toHaveLength(2);
    expect(message.images![0].request).toBeUndefined();
    expect(message.images![1].request).toBe('{"model":"image-model"}');
  });

  it("rejects a non-string request", () => {
    expect(() => MessageImageSchema.parse({ ...legacyRef, request: { model: "image-model" } })).toThrow();
  });
});
