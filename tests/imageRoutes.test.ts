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
      return new Response(JSON.stringify({ data: [{ id: "lustify-v8" }, { id: "wai-nsfw" }] }), { status: 200 });
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
    size: "1024x1024"
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
    // Default promptCharacterLimit (900) is tighter than the dialect cap.
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
});
