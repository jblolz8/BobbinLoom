import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ProviderConnection } from "../src/schemas";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { createImageProvider, UnconfiguredImageProvider } from "../src/server/imageProvider";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProgress,
  ImageProvider
} from "../src/server/imageProvider";
import { A1111_IMAGE_PROMPT_CAP, A1111Provider, forgeCoupleMapping } from "../src/server/imageProvider/a1111Provider";
import { OPENAI_IMAGE_PROMPT_CAP, OpenAIImagesProvider } from "../src/server/imageProvider/openaiImagesProvider";
import { VENICE_IMAGE_PROMPT_CAP, VeniceImageProvider } from "../src/server/imageProvider/veniceImageProvider";
import {
  clampChars,
  clearForgeCoupleCache,
  dataUrlPayload,
  detectForgeCouple,
  FORGE_COUPLE_TTL_MS,
  parseSize,
  sniffMime
} from "../src/server/imageProvider/shared";
import { makePng, PNG_SIGNATURE } from "./helpers/pngBuilder";

const PNG_BYTES = makePng("image-provider-fixture");
const PNG_B64 = PNG_BYTES.toString("base64");

function testConfig(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    providerId: "venice_images",
    label: "Venice Images",
    baseUrl: "https://api.venice.ai/api/v1",
    apiKey: "test-key",
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

/** Records the parsed request body of every call and answers with `respond`. */
function stubFetch(respond: (call: number) => Response): { fetchImpl: typeof fetch; calls: Array<{ url: string; body: Record<string, unknown> }> } {
  const calls: Array<{ url: string; body: Record<string, unknown> }> = [];
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return respond(calls.length);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("imageProvider/shared", () => {
  it("clamps to the endpoint cap without leaving a trailing space", () => {
    expect(clampChars("abc", 10)).toBe("abc");
    expect(clampChars("abcdefghij ", 10)).toBe("abcdefghij");
    expect(clampChars("x".repeat(20), 5)).toBe("xxxxx");
  });

  it("parses a WxH size and rejects auto/invalid", () => {
    expect(parseSize("1024x1024")).toEqual({ width: 1024, height: 1024 });
    expect(parseSize("auto")).toBeNull();
    expect(parseSize(undefined)).toBeNull();
    expect(parseSize("huge")).toBeNull();
  });

  it("sniffs png/jpeg/webp magic bytes and falls back to png", () => {
    expect(sniffMime(PNG_BYTES)).toBe("image/png");
    expect(sniffMime(Buffer.from([0xff, 0xd8, 0xff, 0xe0]))).toBe("image/jpeg");
    expect(sniffMime(Buffer.concat([Buffer.from("RIFF"), Buffer.alloc(8)]))).toBe("image/webp");
    expect(sniffMime(Buffer.from([0x00, 0x01]))).toBe("image/png");
  });

  it("extracts a data-URL payload and refuses plain http URLs", () => {
    expect(dataUrlPayload(`data:image/png;base64,${PNG_B64}`)).toBe(PNG_B64);
    expect(dataUrlPayload("https://example.com/a.png")).toBeNull();
    expect(dataUrlPayload(undefined)).toBeNull();
  });
});

describe("imageProvider/shared — Forge Couple detection", () => {
  const BASE = "http://127.0.0.1:7860";

  /** Records every URL and answers from a table. */
  function stubRoutes(
    respond: (url: string) => Response
  ): { fetchImpl: typeof fetch; calls: Array<{ url: string; headers: Record<string, string> }> } {
    const calls: Array<{ url: string; headers: Record<string, string> }> = [];
    const fetchImpl = (async (url: any, init: any = {}) => {
      calls.push({ url: String(url), headers: init.headers ?? {} });
      return respond(String(url));
    }) as unknown as typeof fetch;
    return { fetchImpl, calls };
  }

  /** A Forge/ReForge build with (or without) the extension installed. The
   *  real route also lists the built-in scripts; only `name` + `is_alwayson`
   *  matter here. */
  const scriptInfo = (...names: Array<string | { name: string; is_alwayson: boolean }>) => names;
  const INSTALLED = scriptInfo(
    { name: "sampler", is_alwayson: false },
    { name: "Forge Couple", is_alwayson: true },
    { name: "forge couple inpaint", is_alwayson: true }
  );

  beforeEach(() => clearForgeCoupleCache());

  it("reads /sdapi/v1/script-info at the WebUI root and keeps the server's own title", async () => {
    const { fetchImpl, calls } = stubRoutes(() => jsonResponse(INSTALLED));
    const found = await detectForgeCouple(BASE, { fetchImpl, headers: { Authorization: "Basic abc" } });

    // The exact URL: the a1111 base URL is verbatim, so no /v1 may appear.
    expect(calls.map((c) => c.url)).toEqual([`${BASE}/sdapi/v1/script-info`]);
    expect(calls[0].url).not.toContain("/v1/sdapi");
    // The same auth rule as every other a1111 call.
    expect(calls[0].headers.Authorization).toBe("Basic abc");

    // Matched case-INSENSITIVELY, but the TITLE the server reported is what
    // comes back: that string is the alwayson_scripts key, and A1111 looks it
    // up by exact name. ("forge couple inpaint" is a DIFFERENT script and must
    // not win: the name match is exact apart from case.)
    expect(found).toEqual({ detected: true, title: "Forge Couple" });

    // A lowercase-only build is matched just the same, and its own spelling
    // comes back.
    const lower = stubRoutes(() => jsonResponse(scriptInfo({ name: "forge couple", is_alwayson: true })));
    expect(await detectForgeCouple("http://127.0.0.1:7862", { fetchImpl: lower.fetchImpl })).toEqual({
      detected: true,
      title: "forge couple"
    });
  });

  it("prefers the alwayson entry when the name appears more than once", async () => {
    const { fetchImpl } = stubRoutes(() =>
      jsonResponse(scriptInfo({ name: "Forge Couple", is_alwayson: false }, { name: "forge couple", is_alwayson: true }))
    );
    expect(await detectForgeCouple(BASE, { fetchImpl })).toEqual({ detected: true, title: "forge couple" });
  });

  it("answers 'not detected' — never an error — for a missing route, a bad body or a transport failure", async () => {
    clearForgeCoupleCache();
    const missing = stubRoutes(() => new Response("Not Found", { status: 404 }));
    expect(await detectForgeCouple(BASE, { fetchImpl: missing.fetchImpl })).toEqual({ detected: false });

    clearForgeCoupleCache();
    const html = stubRoutes(() => new Response("<html>nope</html>", { status: 200 }));
    expect(await detectForgeCouple(BASE, { fetchImpl: html.fetchImpl })).toEqual({ detected: false });

    clearForgeCoupleCache();
    const object = stubRoutes(() => jsonResponse({ detail: "expected a list" }));
    expect(await detectForgeCouple(BASE, { fetchImpl: object.fetchImpl })).toEqual({ detected: false });

    clearForgeCoupleCache();
    const noMatch = stubRoutes(() => jsonResponse(scriptInfo({ name: "sampler", is_alwayson: false })));
    expect(await detectForgeCouple(BASE, { fetchImpl: noMatch.fetchImpl })).toEqual({ detected: false });

    clearForgeCoupleCache();
    const boom = stubRoutes(() => {
      throw new Error("ECONNREFUSED");
    });
    await expect(detectForgeCouple(BASE, { fetchImpl: boom.fetchImpl })).resolves.toEqual({ detected: false });
  });

  it("caches per base URL for a short TTL, and forgets the answer once it lapses", async () => {
    clearForgeCoupleCache();
    let clock = 1_000_000;
    const now = () => clock;
    const { fetchImpl, calls } = stubRoutes(() => jsonResponse(INSTALLED));

    // Two reads inside the TTL = ONE request. The answer, including a negative
    // one, is otherwise paid for by every single generation.
    expect(await detectForgeCouple(BASE, { fetchImpl, now })).toEqual({ detected: true, title: "Forge Couple" });
    expect(await detectForgeCouple(BASE, { fetchImpl, now })).toEqual({ detected: true, title: "Forge Couple" });
    expect(calls).toHaveLength(1);

    // A different WebUI has its own entry, and does not inherit this one's.
    const other = stubRoutes(() => new Response("nope", { status: 500 }));
    expect(await detectForgeCouple("http://127.0.0.1:7861", { fetchImpl: other.fetchImpl, now })).toEqual({
      detected: false
    });
    expect(other.calls).toHaveLength(1);

    // A trailing slash is the same WebUI, not a second one.
    expect(await detectForgeCouple(`${BASE}///`, { fetchImpl, now })).toEqual({ detected: true, title: "Forge Couple" });
    expect(calls).toHaveLength(1);

    // Past the TTL the WebUI is asked again — that is how a restart that adds
    // (or removes) the extension is noticed without a server restart.
    clock += FORGE_COUPLE_TTL_MS + 1;
    expect(await detectForgeCouple(BASE, { fetchImpl, now })).toEqual({ detected: true, title: "Forge Couple" });
    expect(calls).toHaveLength(2);
  });
});

describe("OpenAIImagesProvider", () => {
  it("posts the OpenAI-compatible body and decodes b64_json", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ created: 1, data: [{ b64_json: PNG_B64 }] }));
    const provider = new OpenAIImagesProvider(testConfig(), imageConn({ size: "1024x1024" }), fetchImpl);

    const result = await provider.generateImage({ prompt: "a scene", size: "1024x1024" });

    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("https://api.venice.ai/api/v1/images/generations");
    expect(calls[0].body.model).toBe("test-image-model");
    expect(calls[0].body.prompt).toBe("a scene");
    expect(calls[0].body.size).toBe("1024x1024");
    expect(calls[0].body.response_format).toBe("b64_json");
    expect(calls[0].body.output_format).toBe("png");
    expect(calls[0].body.n).toBe(1);
    // safeMode off (the app's default) → moderation "low" = no adult-content blur
    expect(calls[0].body.moderation).toBe("low");

    expect(result.images).toHaveLength(1);
    expect(result.images[0].mime).toBe("image/png");
    expect(result.images[0].bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(result.model).toBe("test-image-model");
    expect(result.providerId).toBe("venice_images");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.rawRequest).toContain("b64_json");
    expect(result.rawOutput).toContain(PNG_B64);
  });

  it("asks for moderation auto when safe mode is on", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ data: [{ b64_json: PNG_B64 }] }));
    const provider = new OpenAIImagesProvider(testConfig(), imageConn(), fetchImpl);
    await provider.generateImage({ prompt: "a scene", safeMode: true });
    expect(calls[0].body.moderation).toBe("auto");
  });

  it("clamps the prompt to the 1500-char compat cap", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ data: [{ b64_json: PNG_B64 }] }));
    const provider = new OpenAIImagesProvider(testConfig(), imageConn(), fetchImpl);
    await provider.generateImage({ prompt: "x".repeat(OPENAI_IMAGE_PROMPT_CAP + 300) });
    expect(OPENAI_IMAGE_PROMPT_CAP).toBe(1500);
    expect((calls[0].body.prompt as string).length).toBe(OPENAI_IMAGE_PROMPT_CAP);
  });

  it("accepts a data URL in the url field and rejects a plain http url", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ data: [{ url: `data:image/png;base64,${PNG_B64}` }] }));
    const provider = new OpenAIImagesProvider(testConfig(), imageConn(), fetchImpl);
    const result = await provider.generateImage({ prompt: "a scene" });
    expect(result.images[0].bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);

    const remote = stubFetch(() => jsonResponse({ data: [{ url: "https://cdn.example.com/a.png" }] }));
    const remoteProvider = new OpenAIImagesProvider(testConfig(), imageConn(), remote.fetchImpl);
    await expect(remoteProvider.generateImage({ prompt: "a scene" })).rejects.toThrow(/no image data/);
  });

  it("surfaces an upstream error status and body", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ error: "prompt too long" }, 400));
    const provider = new OpenAIImagesProvider(testConfig(), imageConn(), fetchImpl);
    await expect(provider.generateImage({ prompt: "a scene" })).rejects.toThrow(/400/);
    await expect(provider.generateImage({ prompt: "a scene" })).rejects.toThrow(/prompt too long/);
  });
});

describe("VeniceImageProvider", () => {
  it("sends negative_prompt, safe_mode false, width/height from size and seed 0", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ id: "x", images: [PNG_B64], timing: { total: 8420 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn({ size: "1024x1024" }), fetchImpl);

    const result = await provider.generateImage({ prompt: "a scene", negativePrompt: "blurry" });

    expect(calls[0].url).toBe("https://api.venice.ai/api/v1/image/generate");
    expect(calls[0].body.model).toBe("test-image-model");
    expect(calls[0].body.negative_prompt).toBe("blurry");
    expect(calls[0].body.safe_mode).toBe(false);
    expect(calls[0].body.width).toBe(1024);
    expect(calls[0].body.height).toBe(1024);
    expect(calls[0].body.variants).toBe(1);
    expect(calls[0].body.seed).toBe(0);
    expect(calls[0].body.format).toBe("png");
    expect(calls[0].body.return_binary).toBe(false);

    expect(result.images[0].bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(result.durationMs).toBe(8420);
  });

  it("omits negative_prompt when there is none and honours connection defaults", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ images: [PNG_B64], timing: { total: 100 } }));
    const provider = new VeniceImageProvider(
      testConfig(),
      imageConn({ variants: 3, stylePreset: "cinematic", hideWatermark: true }),
      fetchImpl
    );
    await provider.generateImage({ prompt: "a scene" });
    expect(calls[0].body).not.toHaveProperty("negative_prompt");
    expect(calls[0].body.variants).toBe(3);
    expect(calls[0].body.style_preset).toBe("cinematic");
    expect(calls[0].body.hide_watermark).toBe(true);
  });

  it("sends aspect_ratio and NO width/height when the connection sets one", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ images: [PNG_B64], timing: { total: 100 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn({ size: "1024x1024", aspectRatio: "16:9" }), fetchImpl);
    await provider.generateImage({ prompt: "a scene" });
    expect(calls[0].body.aspect_ratio).toBe("16:9");
    expect(calls[0].body).not.toHaveProperty("width");
    expect(calls[0].body).not.toHaveProperty("height");
  });

  it("clamps the prompt to the 7500-char native cap", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ images: [PNG_B64], timing: { total: 1 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn(), fetchImpl);
    await provider.generateImage({ prompt: "y".repeat(VENICE_IMAGE_PROMPT_CAP + 500) });
    expect(VENICE_IMAGE_PROMPT_CAP).toBe(7500);
    expect((calls[0].body.prompt as string).length).toBe(VENICE_IMAGE_PROMPT_CAP);
  });

  it("maps every image in the response and rejects an empty one", async () => {
    const { fetchImpl } = stubFetch(() => jsonResponse({ id: "x", images: [PNG_B64, PNG_B64], timing: { total: 5 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn(), fetchImpl);
    const result = await provider.generateImage({ prompt: "a scene" });
    expect(result.images).toHaveLength(2);

    const empty = stubFetch(() => jsonResponse({ id: "x", images: [] }));
    const emptyProvider = new VeniceImageProvider(testConfig(), imageConn(), empty.fetchImpl);
    await expect(emptyProvider.generateImage({ prompt: "a scene" })).rejects.toThrow(/no image data/);
  });

  it("passes an explicit seed through", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ images: [PNG_B64], timing: { total: 1 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn(), fetchImpl);
    const result = await provider.generateImage({ prompt: "a scene", seed: 4242 });
    expect(calls[0].body.seed).toBe(4242);
    expect(result.seed).toBe(4242);
  });

  it("reports the seed it actually sent, and no seed at all when the provider picks one", async () => {
    const { fetchImpl, calls } = stubFetch(() => jsonResponse({ images: [PNG_B64], timing: { total: 1 } }));
    const provider = new VeniceImageProvider(testConfig(), imageConn(), fetchImpl);

    // The body carries Venice's documented `0` = random, so the RESULT must not
    // report 0 as a seed: a stored ref has to say "the provider chose".
    const random = await provider.generateImage({ prompt: "a scene" });
    expect(calls[0].body.seed).toBe(0);
    expect(random.seed).toBeUndefined();

    const seeded = await provider.generateImage({ prompt: "a scene", seed: 4242 });
    expect(calls[1].body.seed).toBe(4242);
    expect(seeded.seed).toBe(4242);
  });
});

describe("createImageProvider", () => {
  it("selects the dialect from the connection's apiStyle", () => {
    expect(createImageProvider(imageConn({ apiStyle: "venice" }))).toBeInstanceOf(VeniceImageProvider);
    expect(createImageProvider(imageConn({ apiStyle: "openai" }))).toBeInstanceOf(OpenAIImagesProvider);
    expect(createImageProvider(imageConn())).toBeInstanceOf(OpenAIImagesProvider);
  });

  it("gives image requests their own longer timeout and a low retry count", () => {
    const provider = createImageProvider(imageConn(), {});
    const config = (provider as unknown as { config: ResolvedProviderConfig }).config;
    expect(config.timeoutMs).toBe(180_000);
    expect(config.maxRetries).toBe(1);
  });

  it("UnconfiguredImageProvider throws the actionable message", async () => {
    await expect(new UnconfiguredImageProvider().generateImage()).rejects.toThrow(/No image provider configured/);
  });
});

describe("createImageProvider — the a1111 dialect", () => {
  it("selects A1111Provider from the connection's apiStyle", () => {
    expect(createImageProvider(a1111Conn())).toBeInstanceOf(A1111Provider);
    // The other two dialects keep their own adapters.
    expect(createImageProvider(imageConn({ apiStyle: "venice" }))).toBeInstanceOf(VeniceImageProvider);
    expect(createImageProvider(imageConn({ apiStyle: "openai" }))).toBeInstanceOf(OpenAIImagesProvider);
  });

  it("keeps the WebUI root as the base URL and gives it the 10-minute default", () => {
    const provider = createImageProvider(a1111Conn(), {});
    const config = (provider as unknown as { config: ResolvedProviderConfig }).config;
    // No /v1 prefix: every path would become /v1/sdapi/v1/... and 404.
    expect(config.baseUrl).toBe("http://127.0.0.1:7860");
    expect(config.timeoutMs).toBe(600_000);
    expect(config.maxRetries).toBe(1);
  });

  it("takes the prompt cap from the a1111 dialect, not the OpenAI one", () => {
    expect(A1111_IMAGE_PROMPT_CAP).toBe(10_000);
    expect(A1111_IMAGE_PROMPT_CAP).toBeGreaterThan(OPENAI_IMAGE_PROMPT_CAP);
  });

  it("posts A1111 credentials as Basic for user:pass and Bearer for a token", async () => {
    const basic = stubA1111(a1111Happy());
    await createImageProvider(a1111Conn({ apiKey: "bob:secret" }), {}, basic.fetchImpl).generateImage({
      prompt: "a scene"
    });
    expect(basic.calls[0].authorization).toBe(`Basic ${Buffer.from("bob:secret").toString("base64")}`);

    const bearer = stubA1111(a1111Happy());
    await createImageProvider(a1111Conn({ apiKey: "abc123" }), {}, bearer.fetchImpl).generateImage({
      prompt: "a scene"
    });
    expect(bearer.calls[0].authorization).toBe("Bearer abc123");
  });
});

describe("ImageProgress", () => {
  it("is carried on the request and read by a provider that can report it", async () => {
    // Type-level contract: `onProgress` is OPTIONAL (a dialect that cannot
    // report progress simply never calls it) and takes an `ImageProgress`.
    const seen: ImageProgress[] = [];
    const provider: ImageProvider = {
      async generateImage(request: ImageGenerationRequest): Promise<ImageGenerationResult> {
        request.onProgress?.({ progress: 0.5, step: 7, steps: 28, etaSeconds: 4.5 });
        request.onProgress?.({ progress: 0.75 });
        return { images: [], model: "stub", providerId: "stub", durationMs: 1, rawRequest: "{}", rawOutput: "{}" };
      }
    };

    await provider.generateImage({ prompt: "a scene", onProgress: (progress) => seen.push(progress) });

    expect(seen).toEqual([
      { progress: 0.5, step: 7, steps: 28, etaSeconds: 4.5 },
      { progress: 0.75 }
    ]);
  });
});

// ── A1111 (native /sdapi/v1 dialect) ────────────────────────────────────────

const A1111_BASE = "http://127.0.0.1:7860";
const A1111_TXT2IMG_URL = `${A1111_BASE}/sdapi/v1/txt2img`;
const A1111_PROGRESS_URL = `${A1111_BASE}/sdapi/v1/progress?skip_current_image=true`;
const A1111_INTERRUPT_URL = `${A1111_BASE}/sdapi/v1/interrupt`;
const JPEG_B64 = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00]).toString("base64");

type A1111Call = {
  method: string;
  url: string;
  body?: Record<string, unknown>;
  authorization?: string;
  signal?: AbortSignal | null;
};

/** Records method/url/body/headers of every call. The A1111 adapter is the
 *  first one that talks to more than one route, so a call is dispatched by URL
 *  rather than assumed to be the POST. */
function stubA1111(
  handler: (call: A1111Call) => Response | Promise<Response>
): { fetchImpl: typeof fetch; calls: A1111Call[] } {
  const calls: A1111Call[] = [];
  const fetchImpl = (async (url: any, init: any = {}) => {
    const call: A1111Call = {
      method: String(init.method ?? "GET"),
      url: String(url),
      authorization: init.headers?.Authorization,
      signal: init.signal ?? null
    };
    if (typeof init.body === "string") call.body = JSON.parse(init.body) as Record<string, unknown>;
    calls.push(call);
    return handler(call);
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

/** The happy path: txt2img answers, every other route 404s. */
function a1111Happy(
  images: string[] = [PNG_B64],
  info: string | undefined = JSON.stringify({ seed: 12345 })
): (call: A1111Call) => Response {
  return (call) => {
    if (call.url === A1111_TXT2IMG_URL) return jsonResponse(info === undefined ? { images } : { images, info });
    return jsonResponse({ detail: "Not Found" }, 404);
  };
}

function a1111Conn(overrides: Partial<ProviderConnection> = {}): ProviderConnection {
  return imageConn({
    id: "a1111_local",
    label: "Local WebUI",
    baseUrl: A1111_BASE,
    model: "sd_xl_base_1.0.safetensors",
    apiStyle: "a1111",
    ...overrides
  });
}

function a1111Config(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return testConfig({
    providerId: "a1111_local",
    label: "Local WebUI",
    baseUrl: A1111_BASE,
    model: "sd_xl_base_1.0.safetensors",
    timeoutMs: 600_000,
    ...overrides
  });
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("A1111Provider — the request body", () => {
  it("posts the native txt2img body, with the URL and JSON on the record", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const conn = a1111Conn({
      steps: 28,
      cfgScale: 6.5,
      sampler: "DPM++ 2M Karras",
      scheduler: "Karras",
      variants: 3
    });
    const provider = new A1111Provider(a1111Config(), conn, fetchImpl);

    await provider.generateImage({
      prompt: "a scene",
      negativePrompt: "blurry, extra fingers",
      size: "1024x1024",
      seed: 4242,
      variants: 3
    });

    // On the record, exactly as the WebUI would see it.
    console.log(`[a1111] POST ${calls[0].url}`);
    console.log(`[a1111] body ${JSON.stringify(calls[0].body)}`);

    expect(calls[0].url).toBe("http://127.0.0.1:7860/sdapi/v1/txt2img");
    expect(calls[0].method).toBe("POST");
    expect(calls[0].body).toEqual({
      prompt: "a scene",
      negative_prompt: "blurry, extra fingers",
      seed: 4242,
      n_iter: 1,
      batch_size: 3,
      width: 1024,
      height: 1024,
      steps: 28,
      cfg_scale: 6.5,
      sampler_name: "DPM++ 2M Karras",
      scheduler: "Karras",
      override_settings: { sd_model_checkpoint: "sd_xl_base_1.0.safetensors" },
      override_settings_restore_afterwards: true
    });
  });

  it("never sends the Venice-only concepts", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const provider = new A1111Provider(
      a1111Config(),
      a1111Conn({ safeMode: true, stylePreset: "cinematic", hideWatermark: true, aspectRatio: "16:9" }),
      fetchImpl
    );

    await provider.generateImage({
      prompt: "a scene",
      safeMode: true,
      stylePreset: "cinematic",
      hideWatermark: true,
      aspectRatio: "16:9"
    });

    const body = calls[0].body ?? {};
    expect(body).not.toHaveProperty("safeMode");
    expect(body).not.toHaveProperty("safe_mode");
    expect(body).not.toHaveProperty("stylePreset");
    expect(body).not.toHaveProperty("style_preset");
    expect(body).not.toHaveProperty("hideWatermark");
    expect(body).not.toHaveProperty("hide_watermark");
    expect(body).not.toHaveProperty("aspectRatio");
    expect(body).not.toHaveProperty("aspect_ratio");
  });

  it("omits every key the connection does not set, so the WebUI's own defaults win", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const provider = new A1111Provider(a1111Config(), a1111Conn({ model: "" }), fetchImpl);

    await provider.generateImage({ prompt: "a scene" });

    // Only the four keys A1111 needs are there. An absent field means "the
    // WebUI decides" — which is what a user who tuned their WebUI expects.
    expect(calls[0].body).toEqual({ prompt: "a scene", seed: -1, n_iter: 1, batch_size: 1 });
  });

  it("sends -1 for a random seed and 0 as a real seed", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    await provider.generateImage({ prompt: "a scene" });
    expect(calls[0].body?.seed).toBe(-1);

    // 0 is a legitimate, reproducible seed here — the opposite of Venice, where
    // 0 is the "pick one" sentinel and a stored 0 would be a lie.
    await provider.generateImage({ prompt: "a scene", seed: 0 });
    expect(calls[1].body?.seed).toBe(0);
  });

  it("maps size to width/height and omits them for auto or an unparseable value", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const provider = new A1111Provider(a1111Config(), a1111Conn({ model: "" }), fetchImpl);

    await provider.generateImage({ prompt: "a scene", size: "832x1216" });
    expect(calls[0].body?.width).toBe(832);
    expect(calls[0].body?.height).toBe(1216);

    await provider.generateImage({ prompt: "a scene", size: "auto" });
    expect(calls[1].body).not.toHaveProperty("width");
    expect(calls[1].body).not.toHaveProperty("height");

    await provider.generateImage({ prompt: "a scene", size: "huge" });
    expect(calls[2].body).not.toHaveProperty("width");
    expect(calls[2].body).not.toHaveProperty("height");
  });

  it("clamps batch_size to 1..4", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const provider = new A1111Provider(a1111Config(), a1111Conn({ model: "" }), fetchImpl);

    await provider.generateImage({ prompt: "a scene", variants: 0 });
    expect(calls[0].body?.batch_size).toBe(1);

    await provider.generateImage({ prompt: "a scene", variants: 9 });
    expect(calls[1].body?.batch_size).toBe(4);
  });

  it("sends override_settings only when the connection names a checkpoint", async () => {
    const named = stubA1111(a1111Happy());
    await new A1111Provider(a1111Config(), a1111Conn({ model: "sdxl.safetensors" }), named.fetchImpl).generateImage({
      prompt: "a scene"
    });
    expect(named.calls[0].body?.override_settings).toEqual({ sd_model_checkpoint: "sdxl.safetensors" });
    // The swap must last exactly one request: a fork whose default is "keep"
    // would otherwise silently rewrite the user's WebUI checkpoint.
    expect(named.calls[0].body?.override_settings_restore_afterwards).toBe(true);

    const unnamed = stubA1111(a1111Happy());
    await new A1111Provider(a1111Config(), a1111Conn({ model: "" }), unnamed.fetchImpl).generateImage({ prompt: "a scene" });
    expect(unnamed.calls[0].body).not.toHaveProperty("override_settings");
    expect(unnamed.calls[0].body).not.toHaveProperty("override_settings_restore_afterwards");
  });

  it("keeps a long prompt, clamping only at the 10 000-char sanity ceiling", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    const provider = new A1111Provider(a1111Config(), a1111Conn({ model: "" }), fetchImpl);
    const long = "tag, ".repeat(340); // ~1700 chars — past the Venice/OpenAI caps

    await provider.generateImage({ prompt: long });

    expect(A1111_IMAGE_PROMPT_CAP).toBe(10_000);
    expect(calls[0].body?.prompt).toBe(long);

    await provider.generateImage({ prompt: "z".repeat(A1111_IMAGE_PROMPT_CAP + 500) });
    expect((calls[1].body?.prompt as string).length).toBe(A1111_IMAGE_PROMPT_CAP);
  });
});

describe("A1111Provider — the response", () => {
  const a1111 = (fetchImpl: typeof fetch, conn: ProviderConnection = a1111Conn()) =>
    new A1111Provider(a1111Config(), conn, fetchImpl);

  it("decodes every base64 image, sniffing each mime from its own bytes", async () => {
    const { fetchImpl } = stubA1111(a1111Happy([PNG_B64, JPEG_B64]));
    const result = await a1111(fetchImpl).generateImage({ prompt: "a scene" });

    // batch_size > 1 answers with several payloads; a bare base64 blob carries
    // no filename and no format, so the magic bytes are the only honest source.
    expect(result.images).toHaveLength(2);
    expect(result.images[0].mime).toBe("image/png");
    expect(result.images[0].bytes.subarray(0, 8)).toEqual(PNG_SIGNATURE);
    expect(result.images[1].mime).toBe("image/jpeg");
    expect(result.images[1].bytes[0]).toBe(0xff);
    expect(result.images[1].bytes[1]).toBe(0xd8);
    expect(result.model).toBe("sd_xl_base_1.0.safetensors");
    expect(result.providerId).toBe("a1111_local");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.rawRequest).toContain('"n_iter":1');
    expect(result.rawOutput).toContain(PNG_B64.slice(0, 32));
  });

  it("reports the seed the WebUI actually used, out of the info JSON string", async () => {
    const seeded = stubA1111(a1111Happy([PNG_B64], JSON.stringify({ seed: 12345, all_seeds: [12345] })));
    const result = await a1111(seeded.fetchImpl).generateImage({ prompt: "a scene", seed: 0 });
    expect(result.seed).toBe(12345);

    // A request with no seed sends -1 (random) — `-1` is not the seed that was
    // used, so what comes back is the info's real one, never the sentinel.
    const random = stubA1111(a1111Happy([PNG_B64], JSON.stringify({ seed: 987654 })));
    const rolled = await a1111(random.fetchImpl).generateImage({ prompt: "a scene" });
    expect(rolled.seed).toBe(987654);

    // `all_seeds` is the documented fallback when `seed` is absent.
    const fallback = stubA1111(a1111Happy([PNG_B64], JSON.stringify({ all_seeds: [777, 778] })));
    const fromAll = await a1111(fallback.fetchImpl).generateImage({ prompt: "a scene" });
    expect(fromAll.seed).toBe(777);
  });

  it("tolerates a missing, empty or garbled info without throwing", async () => {
    const cases: Array<Record<string, unknown>> = [
      { images: [PNG_B64] },
      { images: [PNG_B64], info: "" },
      { images: [PNG_B64], info: "{not json" },
      { images: [PNG_B64], info: "42" },
      { images: [PNG_B64], info: JSON.stringify({ seed: "nope" }) },
      { images: [PNG_B64], info: JSON.stringify({ all_seeds: [] }) }
    ];
    for (const payload of cases) {
      const { fetchImpl } = stubA1111((call) =>
        call.url === A1111_TXT2IMG_URL ? jsonResponse(payload) : jsonResponse({}, 404)
      );
      const result = await a1111(fetchImpl).generateImage({ prompt: "a scene" });
      // The image is still usable; only the provenance is unknown.
      expect(result.images).toHaveLength(1);
      expect(result.seed).toBeUndefined();
    }
  });

  it("rejects an empty image list", async () => {
    const { fetchImpl } = stubA1111(a1111Happy([]));
    await expect(a1111(fetchImpl).generateImage({ prompt: "a scene" })).rejects.toThrow(/no image data/);
  });

  it("names the status and an excerpt of the body when the call fails", async () => {
    const { fetchImpl } = stubA1111((call) =>
      call.url === A1111_TXT2IMG_URL ? jsonResponse({ detail: "prompt too long" }, 500) : jsonResponse({}, 404)
    );
    const provider = a1111(fetchImpl);
    const thrown = await provider.generateImage({ prompt: "a scene" }).catch((error: unknown) => error);
    expect(thrown).toBeInstanceOf(Error);
    const message = thrown instanceof Error ? thrown.message : "";
    expect(message).toMatch(/500/);
    expect(message).toMatch(/prompt too long/);
  });

  it("tells the user that a 404 usually means the WebUI lacks --api", async () => {
    const { fetchImpl } = stubA1111(() => new Response("Not Found", { status: 404 }));
    const provider = a1111(fetchImpl);
    await expect(provider.generateImage({ prompt: "a scene" })).rejects.toThrow(/404/);
    await expect(provider.generateImage({ prompt: "a scene" })).rejects.toThrow(/--api/);
  });
});

describe("A1111Provider — progress", () => {
  const progressBody = { progress: 0.43, eta_relative: 12.5, state: { sampling_step: 12, sampling_steps: 28 } };

  it("polls the WebUI's progress route while the POST is in flight", async () => {
    let release!: () => void;
    const held = new Promise<Response>((resolve) => {
      release = () => resolve(jsonResponse({ images: [PNG_B64], info: JSON.stringify({ seed: 1 }) }));
    });
    const { fetchImpl, calls } = stubA1111((call) => {
      if (call.url === A1111_TXT2IMG_URL) return held;
      if (call.url === A1111_PROGRESS_URL) return jsonResponse(progressBody);
      return jsonResponse({}, 404);
    });

    const seen: ImageProgress[] = [];
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);
    const inFlight = provider.generateImage({ prompt: "a scene", onProgress: (progress) => seen.push(progress) });

    await vi.waitFor(() => expect(seen.length).toBeGreaterThan(0));
    expect(seen[0]).toEqual({ progress: 0.43, step: 12, steps: 28, etaSeconds: 12.5 });
    // A read, against the WebUI's own route, with the current image skipped.
    const progressCalls = calls.filter((call) => call.url === A1111_PROGRESS_URL);
    expect(progressCalls[0].method).toBe("GET");
    expect(progressCalls[0].url).toBe("http://127.0.0.1:7860/sdapi/v1/progress?skip_current_image=true");

    release();
    const result = await inFlight;
    expect(result.images).toHaveLength(1);
  });

  it("does not poll at all when the request passes no onProgress", async () => {
    const { fetchImpl, calls } = stubA1111(a1111Happy());
    await new A1111Provider(a1111Config(), a1111Conn(), fetchImpl).generateImage({ prompt: "a scene" });
    // No callback, no polling: this is a local WebUI's own /progress route, not
    // something to hammer on behalf of a caller that is not listening.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe(A1111_TXT2IMG_URL);
  });

  it("keeps sampling on its interval and stops the moment the POST settles", async () => {
    const { fetchImpl, calls } = stubA1111(async (call) => {
      if (call.url === A1111_TXT2IMG_URL) {
        await sleep(700);
        return jsonResponse({ images: [PNG_B64], info: JSON.stringify({ seed: 1 }) });
      }
      return jsonResponse({ progress: 0.1, state: {} });
    });

    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);
    await provider.generateImage({ prompt: "a scene", onProgress: () => {} });

    const polls = calls.filter((call) => call.url === A1111_PROGRESS_URL).length;
    expect(polls).toBeGreaterThanOrEqual(2); // t≈0 and t≈600, not one lone sample

    await sleep(700);
    expect(calls.filter((call) => call.url === A1111_PROGRESS_URL).length).toBe(polls);
  });

  it("never fails the generation when the progress route is broken", async () => {
    const broken = stubA1111((call) => {
      if (call.url === A1111_TXT2IMG_URL) return jsonResponse({ images: [PNG_B64], info: JSON.stringify({ seed: 1 }) });
      throw new Error("progress route unreachable");
    });
    const seen: ImageProgress[] = [];
    const result = await new A1111Provider(a1111Config(), a1111Conn(), broken.fetchImpl).generateImage({
      prompt: "a scene",
      onProgress: (progress) => seen.push(progress)
    });
    expect(result.images).toHaveLength(1);

    // A 200 that is not even JSON is equally not the generation's problem.
    const garbage = stubA1111((call) => {
      if (call.url === A1111_TXT2IMG_URL) return jsonResponse({ images: [PNG_B64], info: JSON.stringify({ seed: 1 }) });
      return new Response("not json at all", { status: 200 });
    });
    const second = await new A1111Provider(a1111Config(), a1111Conn(), garbage.fetchImpl).generateImage({
      prompt: "a scene",
      onProgress: () => {}
    });
    expect(second.images).toHaveLength(1);
  });

  it("ignores a progress response that lands after the POST settled", async () => {
    const { fetchImpl } = stubA1111(async (call) => {
      if (call.url === A1111_TXT2IMG_URL) return jsonResponse({ images: [PNG_B64], info: JSON.stringify({ seed: 1 }) });
      // Slower than the generation itself: this sample describes a job that is
      // already over, and publishing it would move the bar backwards.
      await sleep(40);
      return jsonResponse(progressBody);
    });

    const seen: ImageProgress[] = [];
    await new A1111Provider(a1111Config(), a1111Conn(), fetchImpl).generateImage({
      prompt: "a scene",
      onProgress: (progress) => seen.push(progress)
    });
    await sleep(80);
    expect(seen).toEqual([]);
  });
});

describe("A1111Provider — interrupt", () => {
  it("posts /sdapi/v1/interrupt exactly once on abort, and never on a clean run", async () => {
    // A generation that completes normally must not touch the interrupt route:
    // stopping a WebUI job nobody cancelled would be a nasty surprise.
    const clean = stubA1111(a1111Happy());
    const cleanProvider = new A1111Provider(a1111Config(), a1111Conn(), clean.fetchImpl);
    await cleanProvider.generateImage({ prompt: "a scene" });
    expect(clean.calls).toHaveLength(1);
    expect(clean.calls[0].url).toBe(A1111_TXT2IMG_URL);
    expect(clean.calls.some((call) => call.url === A1111_INTERRUPT_URL)).toBe(false);

    // …and a cancel really cancels: the WebUI keeps sampling until told to stop.
    const controller = new AbortController();
    const aborted = stubA1111((call) => {
      if (call.url === A1111_TXT2IMG_URL) {
        return new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted")), { once: true });
        });
      }
      return jsonResponse({});
    });
    const provider = new A1111Provider(a1111Config(), a1111Conn(), aborted.fetchImpl);

    const inFlight = provider.generateImage({ prompt: "a scene", signal: controller.signal });
    await vi.waitFor(() => expect(aborted.calls.some((call) => call.url === A1111_TXT2IMG_URL)).toBe(true));
    controller.abort();

    await expect(inFlight).rejects.toThrow(/abort/i);
    await vi.waitFor(() => expect(aborted.calls.filter((call) => call.url === A1111_INTERRUPT_URL)).toHaveLength(1));
    expect(aborted.calls.find((call) => call.url === A1111_INTERRUPT_URL)?.method).toBe("POST");

    // Aborting is idempotent: one cancel, one interrupt.
    controller.abort();
    await sleep(20);
    expect(aborted.calls.filter((call) => call.url === A1111_INTERRUPT_URL)).toHaveLength(1);
  });

  it("swallows a failing interrupt so a cancel is never an error", async () => {
    const controller = new AbortController();
    const failing = stubA1111((call) => {
      if (call.url === A1111_TXT2IMG_URL) {
        return new Promise<Response>((_resolve, reject) => {
          call.signal?.addEventListener("abort", () => reject(new Error("The operation was aborted")), { once: true });
        });
      }
      throw new Error("interrupt endpoint exploded");
    });
    const provider = new A1111Provider(a1111Config(), a1111Conn(), failing.fetchImpl);

    const inFlight = provider.generateImage({ prompt: "a scene", signal: controller.signal });
    await vi.waitFor(() => expect(failing.calls.some((call) => call.url === A1111_TXT2IMG_URL)).toBe(true));
    controller.abort();

    // The abort reason reaches the caller; the interrupt's own failure does not.
    await expect(inFlight).rejects.toThrow(/abort/i);
    await vi.waitFor(() => expect(failing.calls.some((call) => call.url === A1111_INTERRUPT_URL)).toBe(true));
    await sleep(20);
  });
});

// ── Forge Couple regions (a1111 only) ───────────────────────────────────────

describe("A1111Provider — Forge Couple regions", () => {
  const SCRIPT_INFO_URL = `${A1111_BASE}/sdapi/v1/script-info`;

  /** A WebUI where txt2img always answers and the extension is installed (or
   *  not, or its route explodes). */
  function stubWebUI(extension: "installed" | "absent" | "boom") {
    return stubA1111((call) => {
      if (call.url === A1111_TXT2IMG_URL) {
        return jsonResponse({ images: [PNG_B64], info: JSON.stringify({ seed: 12345 }) });
      }
      if (call.url === SCRIPT_INFO_URL) {
        if (extension === "boom") throw new Error("ECONNREFUSED");
        return extension === "installed"
          ? jsonResponse([{ name: "Forge Couple", is_alwayson: true }])
          : jsonResponse({ detail: "Not Found" }, 404);
      }
      return jsonResponse({ detail: "Not Found" }, 404);
    });
  }

  beforeEach(() => clearForgeCoupleCache());

  it("sends the extension's 17 documented arguments when it is installed and the prompt has two characters", async () => {
    const { fetchImpl, calls } = stubWebUI("installed");
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    const result = await provider.generateImage({
      prompt: "a rainy street at night | 1girl, red hair | 1boy, dark coat"
    });

    // Detection is a GET at the WebUI root, BEFORE the render it informs.
    expect(calls.map((call) => call.url)).toEqual([SCRIPT_INFO_URL, A1111_TXT2IMG_URL]);
    expect(calls[0].method).toBe("GET");

    const body = calls[1].body!;
    // On the record, exactly as the extension would receive it.
    console.log(`[a1111] forge couple body ${JSON.stringify(body.alwayson_scripts)}`);

    // The KEY is the server's own title, and the args are the documented 17,
    // in the documented order — the upstream payload, entry for entry.
    expect(body.alwayson_scripts).toEqual({
      "Forge Couple": {
        args: [
          true, // enable
          true, // disable_hr
          "Advanced", // mode — Basic needs 3+ lines and the WebUI's own state
          " | ", // separator
          null, // direction: Advanced geometry is the mapping
          null, // background: the shared group is the full-frame box below
          null, // background_weight
          // one box per group: the shared scene fills the frame at the
          // background weight, then one column per character
          [
            [0, 1, 0, 1, 0.5],
            [0, 0.5, 0, 1, 1],
            [0.5, 1, 0, 1, 1]
          ],
          "off", // common_parser
          false, // common_debug
          true, // def_in_prompt
          null, // Tile mode …
          null,
          null,
          null,
          null,
          null
        ]
      }
    });
    expect((body.alwayson_scripts as { "Forge Couple": { args: unknown[] } })["Forge Couple"].args).toHaveLength(17);

    // The prompt stays one line and is regenerated from the groups, so the
    // separator we advertise is exactly the one the prompt is split on.
    expect(body.prompt).toBe("a rainy street at night | 1girl, red hair | 1boy, dark coat");
    expect(result.images).toHaveLength(1);
  });

  it("normalizes the separator: the string we split on is the string we pass", async () => {
    const { fetchImpl, calls } = stubWebUI("installed");
    const provider = new A1111Provider(a1111Config(), a1111Conn({ regionDirection: "Vertical" }), fetchImpl);

    await provider.generateImage({ prompt: "  scene  |1girl, red hair|   1boy, dark coat   " });

    const body = calls[1].body!;
    expect(body.prompt).toBe("scene | 1girl, red hair | 1boy, dark coat");
    const args = (body.alwayson_scripts as { "Forge Couple": { args: unknown[] } })["Forge Couple"].args;
    // The passed separator is the one the normalized prompt carries.
    expect(args[3]).toBe(" | ");
    expect((body.prompt as string).split(args[3] as string)).toHaveLength(3);
    // …and the connection's direction arrives as ROWS in the mapping, which is
    // where Advanced mode reads its geometry from.
    expect(args[7]).toEqual([
      [0, 1, 0, 1, 0.5],
      [0, 1, 0, 0.5, 1],
      [0, 1, 0.5, 1, 1]
    ]);
  });

  it("keys the payload with the spelling the SERVER reported, not the one we match on", async () => {
    const { fetchImpl, calls } = stubA1111((call) =>
      call.url === A1111_TXT2IMG_URL
        ? jsonResponse({ images: [PNG_B64] })
        : jsonResponse([{ name: "forge couple", is_alwayson: true }])
    );
    await new A1111Provider(a1111Config(), a1111Conn(), fetchImpl).generateImage({ prompt: "a|b|c" });

    // A1111 resolves the key by exact name and 422s otherwise, so a title we
    // invented would poison every render.
    expect(Object.keys(calls[1].body!.alwayson_scripts as object)).toEqual(["forge couple"]);
  });

  it("sends NO payload for a two-group prompt — one character, nothing to separate", async () => {
    // The live bug: a shared scene plus ONE character (a POV scene where the
    // viewer is never named) reached the extension's Basic mode, which
    // hard-requires three prompt lines and answered
    // "[Forge Couple] ERROR - Not Enough Lines in Prompt... [2 / 3]".
    // One character needs no regions, so this render is exactly what it was
    // before regions existed — no detection call, no alwayson key.
    const { fetchImpl, calls } = stubWebUI("installed");
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    await provider.generateImage({ prompt: "a rainy street at night | 1girl, red hair" });

    expect(calls.map((call) => call.url)).toEqual([A1111_TXT2IMG_URL]);
    expect("alwayson_scripts" in calls[0].body!).toBe(false);
    expect(calls[0].body!.prompt).toBe("a rainy street at night | 1girl, red hair");
  });

  it("boxes one region per group, inside the extension's own validator", () => {
    // validate_mapping (lib_couple/ui_funcs.py) demands numbers in 0..1 with
    // x2 >= x1 and y2 >= y1; Advanced mode asserts len(couples) == len(mapping).
    const horizontal = forgeCoupleMapping("Horizontal", 3);
    expect(horizontal).toEqual([
      [0, 1, 0, 1, 0.5],
      [0, 0.5, 0, 1, 1],
      [0.5, 1, 0, 1, 1]
    ]);
    expect(forgeCoupleMapping("Vertical", 3)).toEqual([
      [0, 1, 0, 1, 0.5],
      [0, 1, 0, 0.5, 1],
      [0, 1, 0.5, 1, 1]
    ]);
    // four groups -> thirds; a lone character keeps the whole frame
    expect(forgeCoupleMapping("Horizontal", 4)).toEqual([
      [0, 1, 0, 1, 0.5],
      [0, 1 / 3, 0, 1, 1],
      [1 / 3, 2 / 3, 0, 1, 1],
      [2 / 3, 1, 0, 1, 1]
    ]);
    expect(forgeCoupleMapping("Horizontal", 2)).toHaveLength(2);

    for (const count of [2, 3, 4, 5]) {
      const boxes = forgeCoupleMapping("Horizontal", count);
      // exactly one box per group, whichever way the canvas splits
      expect(boxes).toHaveLength(count);
      expect(forgeCoupleMapping("Vertical", count)).toHaveLength(count);
      for (const [x1, x2, y1, y2, weight] of boxes) {
        for (const value of [x1, x2, y1, y2]) {
          expect(typeof value).toBe("number");
          expect(value).toBeGreaterThanOrEqual(0);
          expect(value).toBeLessThanOrEqual(1);
        }
        expect(x2).toBeGreaterThanOrEqual(x1);
        expect(y2).toBeGreaterThanOrEqual(y1);
        expect(weight).toBeGreaterThan(0);
      }
    }
  });

  it("renders normally with NO alwayson_scripts key when the extension is absent (the 422 trap)", async () => {
    const { fetchImpl, calls } = stubWebUI("absent");
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    const result = await provider.generateImage({ prompt: "scene|1girl|1boy" });

    // A 200 render, with the prompt exactly as composed: an alwayson key for a
    // script that is not installed is an HTTP 422 on EVERY local render.
    expect(result.images).toHaveLength(1);
    const body = calls[1].body!;
    expect("alwayson_scripts" in body).toBe(false);
    expect(body.prompt).toBe("scene|1girl|1boy");
  });

  it("treats a failed script-info as 'not installed' rather than failing the generation", async () => {
    const { fetchImpl, calls } = stubWebUI("boom");
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    const result = await provider.generateImage({ prompt: "scene|1girl|1boy" });

    expect(result.images).toHaveLength(1);
    expect("alwayson_scripts" in calls[1].body!).toBe(false);
  });

  it("sends nothing — and asks nothing — for a single group", async () => {
    const { fetchImpl, calls } = stubWebUI("installed");
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    await provider.generateImage({ prompt: "1girl, red hair, rainy street" });

    // One character in frame: not even the (free, cached) detection is worth a
    // round trip, and the body is byte-identical to a render without regions.
    expect(calls.map((call) => call.url)).toEqual([A1111_TXT2IMG_URL]);
    expect("alwayson_scripts" in calls[0].body!).toBe(false);
  });

  it("sends nothing — and asks nothing — when the connection turned regions off", async () => {
    const { fetchImpl, calls } = stubWebUI("installed");
    const provider = new A1111Provider(a1111Config(), a1111Conn({ regionsEnabled: false }), fetchImpl);

    await provider.generateImage({ prompt: "scene|1girl|1boy" });

    expect(calls.map((call) => call.url)).toEqual([A1111_TXT2IMG_URL]);
    expect("alwayson_scripts" in calls[0].body!).toBe(false);
  });

  it("asks the WebUI once per TTL, not once per generation", async () => {
    const { fetchImpl, calls } = stubWebUI("installed");
    const provider = new A1111Provider(a1111Config(), a1111Conn(), fetchImpl);

    await provider.generateImage({ prompt: "scene | 1girl | 1boy" });
    await provider.generateImage({ prompt: "another scene | 2girls" });

    expect(calls.filter((call) => call.url === SCRIPT_INFO_URL)).toHaveLength(1);
    expect(calls.filter((call) => call.url === A1111_TXT2IMG_URL)).toHaveLength(2);
  });
});

