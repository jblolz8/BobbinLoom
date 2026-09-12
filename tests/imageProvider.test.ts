import { describe, expect, it, vi } from "vitest";
import type { ProviderConnection } from "../src/schemas";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { createImageProvider, UnconfiguredImageProvider } from "../src/server/imageProvider";
import type {
  ImageGenerationRequest,
  ImageGenerationResult,
  ImageProgress,
  ImageProvider
} from "../src/server/imageProvider";
import { A1111_IMAGE_PROMPT_CAP, A1111Provider } from "../src/server/imageProvider/a1111Provider";
import { OPENAI_IMAGE_PROMPT_CAP, OpenAIImagesProvider } from "../src/server/imageProvider/openaiImagesProvider";
import { VENICE_IMAGE_PROMPT_CAP, VeniceImageProvider } from "../src/server/imageProvider/veniceImageProvider";
import { clampChars, dataUrlPayload, parseSize, sniffMime } from "../src/server/imageProvider/shared";
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
