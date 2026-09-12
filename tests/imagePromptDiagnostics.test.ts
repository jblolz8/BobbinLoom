/**
 * The image-prompt side call's contract, diagnostics and advisory warnings.
 *
 * Three things are proven here, all of them things the "the text provider
 * returned no image prompt" bug hid for a round trip:
 *
 *  1. the outgoing body carries the CONNECTION's own maxTokens (no artificial
 *     ceiling) and enforces the JSON contract with `response_format`;
 *  2. empty content fails IMMEDIATELY with the finish reason, the reasoning
 *     signal and a truncated quote of the raw response — no retry, no fallback;
 *  3. a suspected refusal and key-less JSON are FLAGGED (never blocked) and
 *     reach the review modal through the dry-run route, and the prompt call's
 *     request/response are stored on the image ref.
 */
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../src/engine/imageDefaults";
import type { ImageGenerationSettings } from "../src/schemas";
import { generateImagePrompt } from "../src/server/provider/imagePrompt";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { ProviderManager } from "../src/server/providerManager";
import { createConnection } from "../src/server/providerRegistry";
import { imageRoutes } from "../src/server/routes/images";
import { getPlaythroughRecord } from "../src/server/store";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

const CLEAN_JSON = '{"prompt": "a woman in the rain", "negative_prompt": "blurry"}';

const INPUT = {
  messageContent: "She stepped into the rain-slick alley.",
  previousUserContent: "I follow her outside.",
  stateSummary: "Location: The Alley. Turn 4.",
  castSummary: "Mira — soaked coat, wary"
};

function testConfig(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    providerId: "local_lm_studio",
    label: "Local LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "test-key",
    model: "local-model",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    maxRetries: 0,
    timeoutMs: 180_000,
    ...overrides
  };
}

function settings(overrides: Partial<ImageGenerationSettings> = {}): ImageGenerationSettings {
  return { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...overrides };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

/** A chat-completion envelope, the shape the provider actually answers with. */
function textEnvelope(message: unknown, finishReason: string | null = "stop", extra: Record<string, unknown> = {}): Response {
  return jsonResponse({ choices: [{ finish_reason: finishReason, message, ...extra }] });
}

/** Records every outgoing body and answers with `respond()`. */
function stubFetch(respond: () => Response): { fetchImpl: typeof fetch; calls: Array<{ body: any }> } {
  const calls: Array<{ body: any }> = [];
  const fetchImpl = (async (_url: any, init: any) => {
    calls.push({ body: JSON.parse(init.body) });
    return respond();
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

describe("the outgoing prompt-call body", () => {
  it("sends the connection's own maxTokens — the old 600-token ceiling is gone", async () => {
    const { fetchImpl, calls } = stubFetch(() => textEnvelope({ content: CLEAN_JSON }));
    await generateImagePrompt(testConfig({ maxTokens: 12_000 }), settings(), INPUT, fetchImpl);

    expect(calls[0].body.max_tokens).toBe(12_000);
    // Not clamped down, not raised up: the connection governs the budget.
    expect(calls[0].body.max_tokens).not.toBe(600);
  });

  it("does not raise a small connection's budget either", async () => {
    const { fetchImpl, calls } = stubFetch(() => textEnvelope({ content: CLEAN_JSON }));
    await generateImagePrompt(testConfig({ maxTokens: 300 }), settings(), INPUT, fetchImpl);
    expect(calls[0].body.max_tokens).toBe(300);
  });

  it("forces the JSON contract with response_format", async () => {
    const { fetchImpl, calls } = stubFetch(() => textEnvelope({ content: CLEAN_JSON }));
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    expect(calls[0].body.response_format).toEqual({ type: "json_object" });
    // The stored request is the body that was sent, response_format included.
    expect(JSON.parse(result.rawInput).response_format).toEqual({ type: "json_object" });
  });

  it("still answers when the endpoint rejects response_format (the client's own fallback)", async () => {
    // 400 on the structured-output body, 200 once the field is dropped: exactly
    // what `requestWithRetry` covers, so nothing here may depend on the field.
    let seen = 0;
    const fetchImpl = (async (_url: any, init: any) => {
      seen += 1;
      const body = JSON.parse(init.body);
      if ("response_format" in body) return new Response("no structured output", { status: 400 });
      return textEnvelope({ content: CLEAN_JSON });
    }) as unknown as typeof fetch;

    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(seen).toBe(2);
    expect(result.prompt).toBe("anime style a woman in the rain");
  });
});

describe("the empty-content failure", () => {
  it("names the finish reason and the reasoning case when reasoning_content came with empty content", async () => {
    const { fetchImpl } = stubFetch(() => textEnvelope({ content: "", reasoning_content: "…thinking about it…" }, "length"));

    const error = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl).catch((e: Error) => e);

    expect(error).toBeInstanceOf(Error);
    const message = (error as Error).message;
    expect(message).toMatch(/finish_reason: length/);
    expect(message).toMatch(/reasoning_content/);
    expect(message).toMatch(/spent its output budget/i);
    // The old, useless message is not what the user sees any more.
    expect(message).toMatch(/no image prompt/i);
  });

  it("names a reasoning BLOCK the same way", async () => {
    const content = [{ type: "reasoning", text: "…" }];
    const { fetchImpl } = stubFetch(() => textEnvelope({ content }, "length"));
    await expect(generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl))
      .rejects.toThrow(/a reasoning block/);
  });

  it("says no reasoning field was present when the model simply answered nothing", async () => {
    const { fetchImpl } = stubFetch(() => textEnvelope({ content: "   " }, "length"));

    const error = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl).catch((e: Error) => e);
    const message = (error as Error).message;

    expect(message).toMatch(/finish_reason: length/);
    expect(message).toMatch(/no reasoning field/);
    expect(message).not.toMatch(/reasoning_content/);
  });

  it("fails immediately — one request, no retry, no fallback prompt", async () => {
    const { fetchImpl, calls } = stubFetch(() => textEnvelope({ content: "" }, "length"));
    await expect(generateImagePrompt(testConfig({ maxRetries: 3 }), settings(), INPUT, fetchImpl)).rejects.toThrow();
    expect(calls).toHaveLength(1);
  });

  it("quotes the raw response, truncated, and never the whole body", async () => {
    const long = "x".repeat(5_000);
    const { fetchImpl } = stubFetch(() => jsonResponse({ id: "cmpl_1", note: long, choices: [{ finish_reason: "stop", message: { content: "" } }] }));

    const error = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl).catch((e: Error) => e);
    const message = (error as Error).message;

    expect(message).toMatch(/Raw response \(truncated\): /);
    expect(message).toContain('{"id":"cmpl_1"'); // the head of the body is there
    expect(message).not.toContain(long); // the tail is not
    expect(message.length).toBeLessThan(900);
  });

  it("reports an absent finish reason when the response carried no choices", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ id: "cmpl_1", choices: [] }));
    await expect(generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl))
      .rejects.toThrow(/finish_reason: absent — the response carried no choices/);
  });
});

describe("advisory warnings", () => {
  it("flags a refusal taken verbatim by the prose fallback and still returns it", async () => {
    const refusal = "I can't help with describing that scene.";
    const { fetchImpl } = stubFetch(() => textEnvelope({ content: refusal }));

    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    // Flagged, never blocked: the text is still what was asked for.
    expect(result.prompt).toBe(`anime style ${refusal}`);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/refus/i);
    expect(result.warnings[0]).toContain("i can't");
  });

  it("recognises a typographic apostrophe and the other refusal shapes near the start", async () => {
    const { fetchImpl } = stubFetch(() => textEnvelope({ content: "I’m unable to describe this." }));
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("i'm unable");
  });

  it("does not flag refusal-shaped words that fall outside the start of the text", async () => {
    // The pattern sits past the bounded window (first 200 chars) — "cannot help
    // with" inside a prompt is a description, not a refusal.
    const prose = "a wide shot of a neon-lit rooftop at night, rain".padEnd(260, " ") + ' and a sign reading "cannot help with" in flickering letters';
    const { fetchImpl } = stubFetch(() => textEnvelope({ content: prose }));
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(result.warnings).toEqual([]);
  });

  it("flags JSON that parsed but carried no prompt string, naming the keys", async () => {
    const content = JSON.stringify({ description: "a bridge at dusk", style: "anime" });
    const { fetchImpl } = stubFetch(() => textEnvelope({ content }));

    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/no "prompt" field/);
    expect(result.warnings[0]).toContain('"description"');
    expect(result.warnings[0]).toContain('"style"');
    // Unchanged behaviour: the raw JSON is what the prompt would carry.
    expect(result.prompt).toContain("a bridge at dusk");
  });

  it("flags a volunteer negative with no prompt as the same wrong shape", async () => {
    // The one-field contract: a negative alone is still not a prompt.
    const { fetchImpl } = stubFetch(() => textEnvelope({ content: '{"negative_prompt": "blurry"}' }));

    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/no "prompt" field/);
    expect(result.warnings[0]).toContain('"negative_prompt"');
  });

  it("stays silent for clean JSON, a fenced block and plain prose", async () => {
    const clean = await generateImagePrompt(testConfig(), settings(), INPUT, stubFetch(() => textEnvelope({ content: CLEAN_JSON })).fetchImpl);
    expect(clean.warnings).toEqual([]);

    const fenced = await generateImagePrompt(
      testConfig(), settings(), INPUT,
      stubFetch(() => textEnvelope({ content: `\`\`\`json\n${CLEAN_JSON}\n\`\`\`` })).fetchImpl
    );
    expect(fenced.warnings).toEqual([]);
    expect(fenced.prompt).toBe("anime style a woman in the rain");

    const prose = await generateImagePrompt(testConfig(), settings(), INPUT, stubFetch(() => textEnvelope({ content: "a lone figure in the rain" })).fetchImpl);
    expect(prose.warnings).toEqual([]);
    expect(prose.prompt).toBe("anime style a lone figure in the rain");
  });
});

/** Route-level harness: temp dirs, a stub fetch, a real ProviderManager. */
type RouteOptions = {
  /** The text provider's answer for the prompt call. Called per text call. */
  textResponse?: () => Response;
};

function routeHarness(options: RouteOptions = {}) {
  const root = tempDir("bobbinloom-prompt-diag-");
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const calls: Array<{ url: string; body: any }> = [];
  const png = pngBytes("prompt-diagnostics");

  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: init?.body ? JSON.parse(init.body) : {} });
    const href = String(url);
    if (href.includes("/chat/completions")) {
      return options.textResponse
        ? options.textResponse()
        : textEnvelope({ content: CLEAN_JSON });
    }
    if (href.includes("/image/generate")) {
      return jsonResponse({ id: "gen_1", images: [png.toString("base64")], timing: { total: 42 } });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

  createConnection(settingsDir, {
    label: "Local Text",
    baseUrl: "http://localhost:1234/v1",
    model: "text-model",
    kind: "text",
    maxTokens: 9000
  });
  createConnection(settingsDir, {
    label: "Venice Images",
    baseUrl: "https://api.venice.ai/api/v1",
    model: "image-model",
    kind: "image",
    apiStyle: "venice",
    size: "1024x1024",
    apiKey: "test-key"
  });

  const manager = new ProviderManager(settingsDir, {}, fetchImpl);
  const app = Fastify();
  app.register(imageRoutes, { dataDir, imagesDir, manager, fetchImpl, loadPresets: () => [] });

  const playthrough = writePlaythroughWithImages(dataDir, "Run", [[], [], []]);
  return { app, dataDir, calls, playthroughId: playthrough.id, messageId: playthrough.messages[2].id };
}

function promptUrl(h: ReturnType<typeof routeHarness>, suffix = ""): string {
  return `/api/playthroughs/${h.playthroughId}/messages/${h.messageId}/image${suffix}`;
}

describe("the dry run and the stored prompt-call provenance", () => {
  it("returns the warnings from the dry run and generates nothing", async () => {
    const h = routeHarness({ textResponse: () => textEnvelope({ content: "Sorry, but I can't describe that." }) });

    const res = await h.app.inject({ method: "POST", url: promptUrl(h, "/prompt"), payload: {} });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]).toMatch(/refus/i);
    expect(body.prompt).toContain("Sorry, but I can't describe that.");
    // Text call only: no image call, no bytes, no state change.
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toContain("/chat/completions");
    expect(h.calls[0].body.max_tokens).toBe(9000);
    expect(getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images).toBeUndefined();
  });

  it("returns an empty warning list when the model answered exactly what was asked", async () => {
    const h = routeHarness();
    const res = await h.app.inject({ method: "POST", url: promptUrl(h, "/prompt"), payload: {} });
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
  });

  it("stores the prompt call's request and response on the ref", async () => {
    const h = routeHarness();
    const res = await h.app.inject({ method: "POST", url: promptUrl(h), payload: {} });
    expect(res.statusCode).toBe(200);

    const textCall = h.calls.find((call) => call.url.includes("/chat/completions"));
    expect(textCall, "the prompt call must have happened").toBeDefined();

    const ref = res.json().playthrough.messages[2].images[0];
    // The stored request IS the prompt-call body we sent upstream…
    expect(JSON.parse(ref.promptRequest)).toEqual(textCall!.body);
    expect(JSON.parse(ref.promptRequest).response_format).toEqual({ type: "json_object" });
    expect(JSON.parse(ref.promptRequest).max_tokens).toBe(9000);
    // …and the stored response is the provider's own body.
    expect(JSON.parse(ref.promptResponse).choices[0].message.content).toBe(CLEAN_JSON);

    // It survives the round trip to disk.
    const stored = getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images![0];
    expect(stored.promptRequest).toBe(ref.promptRequest);
    expect(stored.promptResponse).toBe(ref.promptResponse);
  });

  it("caps the stored response so a verbose reasoning model cannot bloat the record", async () => {
    const content = "y".repeat(20_000);
    const h = routeHarness({ textResponse: () => textEnvelope({ content }, "stop", { usage: {} }) });

    const res = await h.app.inject({ method: "POST", url: promptUrl(h), payload: {} });
    expect(res.statusCode).toBe(200);

    const ref = res.json().playthrough.messages[2].images[0];
    expect(ref.promptResponse.endsWith("\n…[truncated]")).toBe(true);
    expect(ref.promptResponse.length).toBeLessThan(4_100);
    // The cap is on the RESPONSE only — the request stays the exact sent body.
    const textCall = h.calls.find((call) => call.url.includes("/chat/completions"));
    expect(JSON.parse(ref.promptRequest)).toEqual(textCall!.body);

    const stored = getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images![0];
    expect(stored.promptResponse).toBe(ref.promptResponse);
  });

  it("stores neither field when both overrides came from the modal (no text call at all)", async () => {
    const h = routeHarness();
    const res = await h.app.inject({
      method: "POST",
      url: promptUrl(h),
      payload: { promptOverride: "anime style a reviewed prompt", negativeOverride: "blurry" }
    });
    expect(res.statusCode).toBe(200);

    // Only the image call ran, so there is no prompt call to record.
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toContain("/image/generate");

    const ref = res.json().playthrough.messages[2].images[0];
    expect(ref).not.toHaveProperty("promptRequest");
    expect(ref).not.toHaveProperty("promptResponse");
  });
});
