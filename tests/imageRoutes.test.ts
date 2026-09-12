import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../src/engine/imageDefaults";
import type { ImageGenerationSettings } from "../src/schemas";
import type { ProviderConnectionDraft } from "../src/server/providerRegistry";
import { createConnection } from "../src/server/providerRegistry";
import { OPENAI_IMAGE_PROMPT_CAP } from "../src/server/imageProvider/openaiImagesProvider";
import { VENICE_IMAGE_PROMPT_CAP } from "../src/server/imageProvider/veniceImageProvider";
import { saveImageBytes } from "../src/server/imageStore";
import { ProviderManager } from "../src/server/providerManager";
import { imageRoutes } from "../src/server/routes/images";
import { providerRoutes } from "../src/server/routes/providers";
import { getPlaythroughRecord, updatePlaythroughRecord } from "../src/server/store";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

const PNG_B64 = pngBytes("routes").toString("base64");
const TEXT_ANSWER = '{"prompt": "a woman in the rain", "negative_prompt": "blurry"}';

type Call = { url: string; body: any };

type HarnessOptions = {
  withText?: boolean;
  withImage?: boolean;
  imageApiStyle?: "venice" | "openai";
  textContent?: string;
  imagePayload?: Record<string, unknown>;
  /** Snapshot overrides on the playthrough (e.g. promptCharacterLimit: 0). */
  imageSettings?: Partial<ImageGenerationSettings>;
  /** Stored on the image CONNECTION, so the route's seed resolution has a
   *  connection-level fallback to fall back to. */
  imageSeed?: number;
  /** The `/models` body, when the default (two bare ids) is not enough. */
  modelsPayload?: unknown;
};

function harness(options: HarnessOptions = {}) {
  const root = tempDir("bobbinloom-routes-");
  // Mirror production: providers.json lives in the SETTINGS dir, playthrough
  // records in their own dir. Co-locating them would let the orphan sweep's
  // playthrough scan quarantine the registry file.
  const settingsDir = join(root, "settings");
  const dataDir = join(root, "playthroughs");
  const imagesDir = join(root, "images");
  const calls: Call[] = [];

  const fetchImpl = (async (url: any, init: any) => {
    const href = String(url);
    calls.push({ url: href, body: init?.body ? JSON.parse(init.body) : undefined });
    if (href.includes("/chat/completions")) {
      return new Response(JSON.stringify({ choices: [{ message: { content: options.textContent ?? TEXT_ANSWER } }] }), {
        status: 200,
        headers: { "Content-Type": "application/json" }
      });
    }
    if (href.includes("/image/generate")) {
      return new Response(JSON.stringify(options.imagePayload ?? { id: "gen_1", images: [PNG_B64], timing: { total: 1234 } }), { status: 200 });
    }
    if (href.includes("/images/generations")) {
      return new Response(JSON.stringify({ created: 1, data: [{ b64_json: PNG_B64 }] }), { status: 200 });
    }
    if (href.includes("/models")) {
      return new Response(JSON.stringify(options.modelsPayload ?? { data: [{ id: "lustify-v8" }, { id: "wai-nsfw" }] }), { status: 200 });
    }
    return new Response("not found", { status: 404 });
  }) as unknown as typeof fetch;

  const textConn: ProviderConnectionDraft = {
    label: "Local Text",
    baseUrl: "http://localhost:1234/v1",
    model: "text-model",
    kind: "text"
  };
  const imageConn: ProviderConnectionDraft = {
    label: "Venice Images",
    baseUrl: "https://api.venice.ai/api/v1",
    model: "image-model",
    kind: "image",
    apiStyle: options.imageApiStyle ?? "venice",
    size: "1024x1024",
    ...(options.imageSeed === undefined ? {} : { seed: options.imageSeed })
  };
  if (options.withText !== false) createConnection(settingsDir, textConn);
  if (options.withImage !== false) createConnection(settingsDir, imageConn);

  const manager = new ProviderManager(settingsDir, {}, fetchImpl);
  const app = Fastify();
  app.register(imageRoutes, { dataDir, imagesDir, manager, fetchImpl, loadPresets: () => [] });
  app.register(providerRoutes, { manager });

  const playthrough = writePlaythroughWithImages(dataDir, "Run", [[], [], []]);
  const assistantMessageId = playthrough.messages[2].id;
  const userMessageId = playthrough.messages[1].id;

  if (options.imageSettings) {
    const record = getPlaythroughRecord(dataDir, playthrough.id)!;
    record.promptSettings = {
      presetId: record.promptSettings?.presetId ?? "default",
      presetName: record.promptSettings?.presetName ?? "Default",
      modules: record.promptSettings?.modules ?? { turn: [] },
      imageGeneration: { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...options.imageSettings }
    };
    updatePlaythroughRecord(dataDir, record);
  }

  return { app, dataDir, settingsDir, imagesDir, calls, manager, playthroughId: playthrough.id, assistantMessageId, userMessageId };
}

function imageUrl(h: ReturnType<typeof harness>, messageId = h.assistantMessageId, suffix = "") {
  return `/api/playthroughs/${h.playthroughId}/messages/${messageId}/image${suffix}`;
}

function deleteUrl(h: ReturnType<typeof harness>, file: string, messageId = h.assistantMessageId) {
  return `/api/playthroughs/${h.playthroughId}/messages/${messageId}/images/${file}`;
}

function storedFiles(dir: string): string[] {
  return existsSync(dir) ? readdirSync(dir).sort() : [];
}

async function post(app: FastifyInstance, url: string, payload: unknown) {
  return app.inject({ method: "POST", url, payload: payload as Record<string, unknown> });
}

describe("GET /api/images/:file", () => {
  it("streams the bytes with an immutable cache header", async () => {
    const h = harness();
    const bytes = pngBytes("served");
    const file = `${createHash("sha256").update(bytes).digest("hex")}.png`;
    saveImageBytes(bytes, "image/png", h.imagesDir);

    const res = await h.app.inject({ method: "GET", url: `/api/images/${file}` });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toBe("image/png");
    expect(res.headers["cache-control"]).toBe("public, max-age=31536000, immutable");
    expect(Buffer.compare(res.rawPayload, bytes)).toBe(0);
  });

  it("404s a malformed, traversal, or missing name instead of throwing", async () => {
    const h = harness();
    for (const name of ["notahash.png", "..%2F..%2Fdata%2Fsettings.json", `${"a".repeat(64)}.png`, `${"a".repeat(64)}.gif`]) {
      const res = await h.app.inject({ method: "GET", url: `/api/images/${name}` });
      expect(res.statusCode, name).toBe(404);
      expect(res.json().error).toBe("Image not found");
    }
  });
});

describe("POST /api/playthroughs/:id/messages/:messageId/image", () => {
  it("404s an unknown playthrough and an unknown message", async () => {
    const h = harness();
    const missing = await post(h.app, "/api/playthroughs/nope/messages/x/image", {});
    expect(missing.statusCode).toBe(404);
    expect(missing.json().error).toBe("Playthrough not found");

    const noMessage = await post(h.app, imageUrl(h, "msg_missing"), {});
    expect(noMessage.statusCode).toBe(404);
    expect(noMessage.json().error).toBe("Message not found");
  });

  it("400s a non-assistant message", async () => {
    const h = harness();
    const res = await post(h.app, imageUrl(h, h.userMessageId), {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("Images attach to assistant messages only");
  });

  it("400s when no image connection is configured", async () => {
    const h = harness({ withImage: false });
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("No image provider configured");
    expect(h.calls).toHaveLength(0);
  });

  it("400s when no text connection can write the prompt", async () => {
    const h = harness({ withText: false });
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toContain("No text provider available");
    expect(h.calls).toHaveLength(0);
  });

  it("runs the text call, generates, stores the bytes and stamps the ref", async () => {
    const h = harness();
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(200);

    // One text call + one image call, in that order.
    expect(h.calls.map((c) => c.url)).toEqual([
      "http://localhost:1234/v1/chat/completions",
      "https://api.venice.ai/api/v1/image/generate"
    ]);
    expect(h.calls[1].body.negative_prompt).toBe(`${DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix} blurry`);
    expect(h.calls[1].body.width).toBe(1024);

    const body = res.json();
    const expectedPrompt = "anime style a woman in the rain";
    expect(body.promptUsed).toBe(expectedPrompt);
    // What is reported is exactly what reached the provider.
    expect(h.calls[1].body.prompt).toBe(expectedPrompt);

    expect(body.image.file).toMatch(/^[a-f0-9]{64}\.png$/);
    expect(body.image.providerId).toBe("venice_images");
    expect(body.image.model).toBe("image-model");
    expect(body.image.durationMs).toBe(1234);
    expect(body.image.prompt).toBe(expectedPrompt);
    expect(body.image.createdAt).toEqual(expect.any(String));

    // Bytes on disk under the content-addressed name, and the ref lives on the
    // message in the returned (and persisted) record.
    expect(storedFiles(h.imagesDir)).toEqual([body.image.file]);
    expect(body.playthrough.messages[2].images).toHaveLength(1);
    expect(getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images).toHaveLength(1);
  });

  it("uses the connection's seed, sends it, and stamps it on the ref", async () => {
    const h = harness({ imageSeed: 4242 });
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(200);

    // It reached the provider…
    expect(h.calls[1].body.seed).toBe(4242);
    // …and the stored ref records it, so this image can be reproduced or
    // compared with a later re-roll.
    expect(res.json().image.seed).toBe(4242);
    expect(res.json().playthrough.messages[2].images[0].seed).toBe(4242);
    expect(getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images![0].seed).toBe(4242);
  });

  it("lets a per-request seed beat the connection's", async () => {
    const h = harness({ imageSeed: 4242 });
    const res = await post(h.app, imageUrl(h), { seed: 7 });
    expect(res.statusCode).toBe(200);
    expect(h.calls[1].body.seed).toBe(7);
    expect(res.json().image.seed).toBe(7);
  });

  it("leaves the seed unset (random) when neither the request nor the connection has one", async () => {
    const h = harness();
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(200);

    // The body carries Venice's documented 0 = random…
    expect(h.calls[1].body.seed).toBe(0);
    // …and the ref carries NOTHING: a random image has no seed to compare, and
    // a stored 0 would read as one.
    const image = res.json().image;
    expect(image.seed).toBeUndefined();
    expect("seed" in image).toBe(false);
  });

  it("appends on a second click instead of replacing", async () => {
    const h = harness();
    await post(h.app, imageUrl(h), {});
    const second = await post(h.app, imageUrl(h), {});
    expect(second.statusCode).toBe(200);
    const images = second.json().playthrough.messages[2].images;
    expect(images).toHaveLength(2);
    expect(images[0].file).toBe(images[1].file); // identical bytes dedupe to one file
    expect(storedFiles(h.imagesDir)).toHaveLength(1);
  });

  it("skips the text call when BOTH overrides are present", async () => {
    const h = harness();
    const res = await post(h.app, imageUrl(h), {
      promptOverride: "edited prompt",
      negativeOverride: "edited negative"
    });
    expect(res.statusCode).toBe(200);
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe("https://api.venice.ai/api/v1/image/generate");
    // The override is the FINAL composed text: the preset prefix is not re-applied.
    expect(h.calls[0].body.prompt).toBe("edited prompt");
    expect(h.calls[0].body.negative_prompt).toBe("edited negative");
    expect(res.json().promptUsed).toBe("edited prompt");
    expect(res.json().negativeUsed).toBe("edited negative");
  });

  it("still runs the text call when only one override is present, replacing just that side", async () => {
    const h = harness();
    const res = await post(h.app, imageUrl(h), { promptOverride: "only the positive was edited" });
    expect(res.statusCode).toBe(200);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].body.prompt).toBe("only the positive was edited");
    expect(h.calls[1].body.negative_prompt).toBe(`${DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix} blurry`);

    const negativeOnly = await post(h.app, imageUrl(h), { negativeOverride: "only the negative" });
    expect(negativeOnly.statusCode).toBe(200);
    expect(negativeOnly.json().promptUsed).toBe("anime style a woman in the rain");
    expect(negativeOnly.json().negativeUsed).toBe("only the negative");
  });

  it("clamps a long override to the preset limit, and to the dialect cap when the limit is off", async () => {
    const h = harness({ imageApiStyle: "openai" });
    const res = await post(h.app, imageUrl(h), {
      promptOverride: "x".repeat(OPENAI_IMAGE_PROMPT_CAP + 400),
      negativeOverride: ""
    });
    expect(res.statusCode).toBe(200);
    expect(h.calls[0].url).toBe("https://api.venice.ai/api/v1/images/generations");
    // The shipped promptCharacterLimit (1200) is tighter than the dialect cap.
    expect((h.calls[0].body.prompt as string).length).toBe(DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit);
    expect(res.json().promptUsed.length).toBe(DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit);

    const unlimited = harness({ imageApiStyle: "openai", imageSettings: { promptCharacterLimit: 0 } });
    const second = await post(unlimited.app, imageUrl(unlimited), {
      promptOverride: "x".repeat(OPENAI_IMAGE_PROMPT_CAP + 400),
      negativeOverride: ""
    });
    expect(second.statusCode).toBe(200);
    expect((unlimited.calls[0].body.prompt as string).length).toBe(OPENAI_IMAGE_PROMPT_CAP);
  });

  it("clamps the composed prompt to the preset limit but NOT the composed negative", async () => {
    // The negative is a fixed list BobbinLoom ships, so it answers to its own
    // ceiling — the dialect's hard cap — and the preset's `promptCharacterLimit`
    // (the budget for the model-written tag list) must never cut it. Both sides go
    // in at the same length, so the asymmetry is the whole assertion.
    const limit = DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit;
    const longNegative = "n".repeat(limit + 200);
    const h = harness();
    const res = await post(h.app, imageUrl(h), {
      promptOverride: "p".repeat(limit + 200),
      negativeOverride: longNegative
    });
    expect(res.statusCode).toBe(200);
    // The prompt is still cut to the preset's soft limit…
    expect((h.calls[0].body.prompt as string).length).toBe(limit);
    expect(res.json().promptUsed.length).toBe(limit);
    // …and the negative is not: 1400 characters, comfortably inside the 7500 cap.
    expect(h.calls[0].body.negative_prompt).toBe(longNegative);
    expect(res.json().negativeUsed).toBe(longNegative);
  });

  it("does not clamp a lone negative override to the preset limit either", async () => {
    // One override only, so the text call still runs — and the override replaces
    // just the negative side, uncut. (This is the compose path's negative clamp.)
    const limit = DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit;
    const longNegative = "n".repeat(limit + 200);
    const h = harness();
    const res = await post(h.app, imageUrl(h), { negativeOverride: longNegative });
    expect(res.statusCode).toBe(200);
    expect(h.calls).toHaveLength(2);
    expect(h.calls[1].body.negative_prompt).toBe(longNegative);
    expect(res.json().negativeUsed).toBe(longNegative);
  });

  it("keeps the dialect cap as the negative's only ceiling", async () => {
    // Unclampable by the preset limit, not unclampable at all: a negative past the
    // dialect's hard cap is still cut there. The Venice-native dialect is the only
    // one that sends a negative prompt at all, and its cap is 7500.
    const h = harness();
    const res = await post(h.app, imageUrl(h), {
      promptOverride: "p",
      negativeOverride: "n".repeat(VENICE_IMAGE_PROMPT_CAP + 100)
    });
    expect(res.statusCode).toBe(200);
    expect((h.calls[0].body.negative_prompt as string).length).toBe(VENICE_IMAGE_PROMPT_CAP);
    expect(res.json().negativeUsed.length).toBe(VENICE_IMAGE_PROMPT_CAP);
  });

  it("keeps every returned variant", async () => {
    const h = harness({
      imagePayload: { images: [PNG_B64, pngBytes("variant-2").toString("base64"), pngBytes("variant-3").toString("base64")], timing: { total: 99 } }
    });
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(200);
    expect(res.json().playthrough.messages[2].images).toHaveLength(3);
    expect(storedFiles(h.imagesDir)).toHaveLength(3);
    expect(res.json().image.file).toBe(res.json().playthrough.messages[2].images[0].file);
  });

  it("502s a provider failure instead of attaching a broken ref", async () => {
    const h = harness({ textContent: "" });
    const res = await post(h.app, imageUrl(h), {});
    expect(res.statusCode).toBe(502);
    expect(res.json().error).toMatch(/no image prompt/i);
    expect(storedFiles(h.imagesDir)).toHaveLength(0);
    expect(getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images).toBeUndefined();
  });
});

/** A sheet with a real identity block, ONE stub section, and a `[Clothing]`
 *  section whose contents must never ride along: the character INSTANCE's
 *  clothing is the authoritative current state. */
const SHEET = [
  "[Species]: Human",
  "[Gender]: (not established)",
  "",
  "[Body]",
  "- Height: 168 cm",
  "- Build: slim, athletic",
  "",
  "[Appearance]",
  "- Hair: long brown hair, ponytail",
  "- Eyes: blue eyes",
  "",
  "[Clothing]",
  "- Top: blue silk gown",
  ""
].join("\n");

/** Put one character, at the current location, behind a resolvable template. */
function withPresentCast(h: ReturnType<typeof harness>, templateContent = SHEET) {
  const record = getPlaythroughRecord(h.dataDir, h.playthroughId)!;
  record.characterTemplates = [
    {
      id: "tmpl_mira",
      name: "Mira",
      version: 1,
      content: templateContent,
      summary: "",
      startingClothing: []
    }
  ];
  record.characters = [
    {
      id: "char_mira",
      templateId: "tmpl_mira",
      playthroughId: record.id,
      branchId: record.branchId,
      name: "Mira",
      currentLocationId: record.locationId,
      mood: "wary",
      towardPlayer: "guarded",
      memorySummary: "",
      conditions: ["wet"],
      flags: [],
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
      clothing: [{ slot: "top", name: "white shirt" }]
    }
  ];
  updatePlaythroughRecord(h.dataDir, record);
}

describe("POST /api/playthroughs/:id/messages/:messageId/image/prompt", () => {
  it("returns the composed prompt and generates nothing", async () => {
    const h = harness();
    const res = await post(h.app, imageUrl(h, h.assistantMessageId, "/prompt"), {});
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({
      prompt: "anime style a woman in the rain",
      negativePrompt: `${DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix} blurry`,
      // Advisory notes travel with the dry run; none for a clean answer.
      warnings: []
    });
    // Text call only — no image call, no bytes, no state change.
    expect(h.calls).toHaveLength(1);
    expect(h.calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
    expect(storedFiles(h.imagesDir)).toHaveLength(0);
    expect(getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images).toBeUndefined();
  });

  it("validates the target and the two providers", async () => {
    const h = harness();
    expect((await post(h.app, imageUrl(h, "msg_missing", "/prompt"), {})).statusCode).toBe(404);
    expect((await post(h.app, imageUrl(h, h.userMessageId, "/prompt"), {})).statusCode).toBe(400);
    expect((await post(h.app, "/api/playthroughs/nope/messages/m/image/prompt", {})).statusCode).toBe(404);

    const noImage = harness({ withImage: false });
    expect((await post(noImage.app, imageUrl(noImage, noImage.assistantMessageId, "/prompt"), {})).statusCode).toBe(400);

    const noText = harness({ withText: false });
    expect((await post(noText.app, imageUrl(noText, noText.assistantMessageId, "/prompt"), {})).statusCode).toBe(400);
  });

  it("injects each present character's stable sheet identity into the cast block", async () => {
    const h = harness();
    withPresentCast(h);
    const res = await post(h.app, imageUrl(h, h.assistantMessageId, "/prompt"), {});
    expect(res.statusCode).toBe(200);

    const block = h.calls[0].body.messages[1].content as string;
    expect(block).toContain("PRESENT CHARACTERS:");
    // The instance line is unchanged: clothing, mood, conditions.
    expect(block).toContain("Mira — wearing white shirt, wary, wet");
    // …and the STABLE identity from the sheet rides beside it.
    expect(block).toContain("Species: Human");
    expect(block).toContain("Build: slim, athletic");
    expect(block).toContain("Hair: long brown hair, ponytail");
    expect(block).toContain("Eyes: blue eyes");
    // A stub section is skipped…
    expect(block).not.toContain("Gender:");
    // …and the sheet's Clothing section never leaks: the instance's clothing is
    // the authoritative current state.
    expect(block).not.toContain("blue silk gown");
  });

  it("caps the injected identity so one long sheet cannot dominate the prompt", async () => {
    const h = harness();
    withPresentCast(h, `[Species]: Human\n\n[Body]\n- Build: ${"x".repeat(600)}\n`);
    await post(h.app, imageUrl(h, h.assistantMessageId, "/prompt"), {});
    const block = h.calls[0].body.messages[1].content as string;
    expect(block).toContain("Species: Human");
    const identity = block.split("\n").find((line) => line.includes("'s sheet"))!;
    expect(identity).toBeDefined();
    expect(identity.length).toBeLessThan(400);
    expect(identity.length).toBeGreaterThan(100);
  });

  it("warns when the composed prompt is cut at the character limit", async () => {
    const h = harness({
      imageSettings: { promptCharacterLimit: 60 },
      textContent: `{"prompt": "${"tag, ".repeat(40)}done"}`
    });
    const res = await post(h.app, imageUrl(h, h.assistantMessageId, "/prompt"), {});
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // The preview still shows the clamped text — the warning is advisory only.
    expect(body.prompt.length).toBe(60);
    expect(body.warnings).toHaveLength(1);
    expect(body.warnings[0]).toContain("60-character limit");
    expect(body.warnings[0]).toMatch(/cut at the end/);
    expect(body.warnings[0]).toMatch(/Move the essential tags earlier/);
    expect(body.warnings[0]).toMatch(/raise the character limit/);
  });

  it("does not warn when the composed prompt fits", async () => {
    const h = harness({ imageSettings: { promptCharacterLimit: 200 } });
    const res = await post(h.app, imageUrl(h, h.assistantMessageId, "/prompt"), {});
    expect(res.statusCode).toBe(200);
    expect(res.json().warnings).toEqual([]);
  });
});

describe("DELETE /api/playthroughs/:id/messages/:messageId/images/:file", () => {
  it("drops the ref, returns the record, and sweeps the now-unreferenced file", async () => {
    const h = harness();
    const created = (await post(h.app, imageUrl(h), {})).json();
    const file = created.image.file;
    expect(storedFiles(h.imagesDir)).toEqual([file]);

    const res = await h.app.inject({ method: "DELETE", url: deleteUrl(h, file) });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.playthrough.messages[2].images).toBeUndefined();
    expect(storedFiles(h.imagesDir)).toHaveLength(0);
    expect(getPlaythroughRecord(h.dataDir, h.playthroughId)!.messages[2].images).toBeUndefined();
  });

  it("is idempotent for a ref that is already gone", async () => {
    const h = harness();
    const created = (await post(h.app, imageUrl(h), {})).json();
    const url = deleteUrl(h, created.image.file);
    await h.app.inject({ method: "DELETE", url });
    const again = await h.app.inject({ method: "DELETE", url });
    expect(again.statusCode).toBe(200);
    expect(again.json().playthrough.messages[2].images).toBeUndefined();
  });

  it("keeps the file while another message still references it", async () => {
    const h = harness();
    const created = (await post(h.app, imageUrl(h), {})).json();
    const file = created.image.file;

    // A second message in the same record takes the same content-addressed file.
    const record = getPlaythroughRecord(h.dataDir, h.playthroughId)!;
    record.messages[0] = { ...record.messages[0], images: [{ ...created.image, file }] };
    updatePlaythroughRecord(h.dataDir, record);

    const res = await h.app.inject({ method: "DELETE", url: deleteUrl(h, file) });
    expect(res.statusCode).toBe(200);
    expect(storedFiles(h.imagesDir)).toEqual([file]);
    expect(saveImageBytes(pngBytes("routes"), "image/png", h.imagesDir).created).toBe(false);
  });

  it("spares a file a surviving timeline branch still references", async () => {
    const h = harness();
    const created = (await post(h.app, imageUrl(h), {})).json();
    const file = created.image.file;

    // The branch holds the same content-addressed name (branching clones the
    // message by value). It is EXCLUDED from the default playthrough list, so a
    // sweep that did not ask for branches would eat this file.
    writePlaythroughWithImages(h.dataDir, "Branch", [[file]], { isTimelineBranch: true });

    const res = await h.app.inject({ method: "DELETE", url: deleteUrl(h, file) });
    expect(res.statusCode).toBe(200);
    expect(storedFiles(h.imagesDir)).toEqual([file]);
  });

  it("404s an unknown playthrough", async () => {
    const h = harness();
    const res = await h.app.inject({ method: "DELETE", url: "/api/playthroughs/nope/messages/m/images/x.png" });
    expect(res.statusCode).toBe(404);
  });
});

describe("POST /api/settings/providers/models", () => {
  it("forwards an optional type as the upstream query parameter", async () => {
    const h = harness();
    const res = await post(h.app, "/api/settings/providers/models", { baseUrl: "https://api.venice.ai/api/v1", type: "image" });
    expect(res.statusCode).toBe(200);
    expect(h.calls[0].url).toBe("https://api.venice.ai/api/v1/models?type=image");
    expect(res.json().models).toEqual(["lustify-v8", "wai-nsfw"]);
  });

  it("omits the query parameter when no type is given", async () => {
    const h = harness();
    await post(h.app, "/api/settings/providers/models", { baseUrl: "http://localhost:1234/v1" });
    expect(h.calls[0].url).toBe("http://localhost:1234/v1/models");
  });

  it("returns the capability map read from the same listing, and nothing for a model that publishes none", async () => {
    const h = harness({
      modelsPayload: {
        data: [
          {
            id: "lustify-v8",
            model_spec: { constraints: { promptCharacterLimit: 7500, widthHeightDivisor: 8 } }
          },
          { id: "wai-nsfw" }
        ]
      }
    });
    const res = await post(h.app, "/api/settings/providers/models", {
      baseUrl: "https://api.venice.ai/api/v1",
      type: "image"
    });
    expect(res.statusCode).toBe(200);
    // The id list is unchanged…
    expect(res.json().models).toEqual(["lustify-v8", "wai-nsfw"]);
    // …and the per-model constraints ride along, with no entry for the model
    // that published no `model_spec`.
    expect(res.json().modelSpecs).toEqual({
      "lustify-v8": { promptCharacterLimit: 7500, widthHeightDivisor: 8 }
    });
  });

  it("preserves the kind and image fields when an image connection is created", async () => {
    const h = harness({ withImage: false });
    const res = await post(h.app, "/api/settings/providers", {
      label: "Venice Images",
      baseUrl: "https://api.venice.ai/api/v1",
      model: "lustify-v8",
      kind: "image",
      apiStyle: "venice",
      safeMode: false,
      size: "1024x1024",
      variants: 2
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.kind).toBe("image");
    expect(body.apiStyle).toBe("venice");
    expect(body.variants).toBe(2);

    // The harness already has a text connection, so the new row is second.
    const onDisk = JSON.parse(readFileSync(join(h.settingsDir, "providers.json"), "utf8"));
    const created = onDisk.connections.find((c: { id: string }) => c.id === "venice_images");
    expect(created.kind).toBe("image");
    expect(created.apiStyle).toBe("venice");
    expect(created.variants).toBe(2);
  });

  it("keeps the seed an image connection is created with, and clears it on an explicit null", async () => {
    const h = harness({ withImage: false });
    const base = {
      label: "Venice Images",
      baseUrl: "https://api.venice.ai/api/v1",
      model: "lustify-v8",
      kind: "image",
      apiStyle: "venice"
    } as const;

    // On the body schema or zod strips the field silently.
    const created = await post(h.app, "/api/settings/providers", { ...base, seed: 4242 });
    expect(created.statusCode).toBe(200);
    expect(created.json().seed).toBe(4242);
    const onDisk = () => JSON.parse(readFileSync(join(h.settingsDir, "providers.json"), "utf8"));
    const row = (raw: { connections: Array<{ id: string; seed?: number }> }) =>
      raw.connections.find((c) => c.id === "venice_images")!;
    expect(row(onDisk()).seed).toBe(4242);

    // Emptied Seed box: null CLEARS it, and an absent field would not.
    const cleared = await h.app.inject({
      method: "PUT",
      url: "/api/settings/providers/venice_images",
      payload: { ...base, seed: null }
    });
    expect(cleared.statusCode).toBe(200);
    expect("seed" in cleared.json()).toBe(false);
    expect(row(onDisk()).seed).toBeUndefined();
    expect("seed" in row(onDisk())).toBe(false);
  });
});
