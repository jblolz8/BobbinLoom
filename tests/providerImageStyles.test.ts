/**
 * The image style list — `GET <baseUrl>/image/styles`.
 *
 * This is the list the image connection editor's Style Preset select is built
 * from, and it exists because a free-text style preset produced a real 400:
 * Venice rejects `anime` (its values are title-cased) AFTER the text model has
 * already written — and been paid for — the prompt.
 *
 * Two layers are pinned here: the probe's parsing (stub fetch, like
 * `tests/providerRegistry.test.ts`) and the route (`POST
 * /api/settings/providers/image-styles`), against a temp settings dir so no
 * test touches the real `data/` directory.
 */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderManager } from "../src/server/providerManager";
import { createConnection, fetchProviderImageStyles } from "../src/server/providerRegistry";
import { providerRoutes } from "../src/server/routes/providers";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-image-styles-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) rmSync(tempDirs.pop()!, { recursive: true, force: true });
});

/** The provider's own order, with a duplicate to prove the dedupe. */
const PROVIDER_STYLES = ["Cinematic", "3D Model", "Anime", "Cinematic"];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

describe("fetchProviderImageStyles", () => {
  it("parses a data array, deduping but NOT sorting — the order is the provider's", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ data: PROVIDER_STYLES, object: "list" })
    );

    const result = await fetchProviderImageStyles({ baseUrl: "https://api.venice.ai/api/v1" }, fetchImpl);

    expect(result.ok).toBe(true);
    expect(result.status).toBe(200);
    // Alphabetical would be ["3D Model", "Anime", "Cinematic"] — deliberately not that.
    expect(result.styles).toEqual(["Cinematic", "3D Model", "Anime"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.venice.ai/api/v1/image/styles",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("normalizes the base URL and uses the styles path, not the models path", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: ["Anime"] }));
    await fetchProviderImageStyles({ baseUrl: "https://api.venice.ai/" }, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.venice.ai/v1/image/styles",
      expect.objectContaining({ method: "GET" })
    );
  });

  it("tolerates the alternate shapes: a styles array and a bare array", async () => {
    const stylesShape = vi.fn(async () => jsonResponse({ styles: ["Watercolor", "Anime"] }));
    const stylesResult = await fetchProviderImageStyles({ baseUrl: "http://styles.local" }, stylesShape);
    expect(stylesResult.styles).toEqual(["Watercolor", "Anime"]);

    const bareShape = vi.fn(async () => jsonResponse(["Origami", "Origami", "HDR"]));
    const bareResult = await fetchProviderImageStyles({ baseUrl: "http://bare.local" }, bareShape);
    expect(bareResult.styles).toEqual(["Origami", "HDR"]);
  });

  it("reports ok with an empty list for a 200 whose body is not parseable", async () => {
    const fetchImpl = vi.fn(async () => new Response("<html>not json</html>", { status: 200 }));
    const result = await fetchProviderImageStyles({ baseUrl: "http://gateway.local" }, fetchImpl);
    // The connection succeeded; the listing did not. The editor says so instead
    // of claiming a broken connection.
    expect(result.ok).toBe(true);
    expect(result.styles).toEqual([]);
  });

  it("returns ok false with the status and body when the response is not OK", async () => {
    const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
    const result = await fetchProviderImageStyles({ baseUrl: "http://test.local" }, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.status).toBe(401);
    expect(result.message).toBe("unauthorized");
    expect(result.styles).toEqual([]);
  });

  it("returns ok false with the error message when the request rejects", async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error("boom");
    });
    const result = await fetchProviderImageStyles({ baseUrl: "http://test.local" }, fetchImpl);
    expect(result.ok).toBe(false);
    expect(result.status).toBeUndefined();
    expect(result.message).toBe("boom");
    expect(result.styles).toEqual([]);
  });

  it("falls back to the documented Venice host when the caller has no base URL", async () => {
    const fetchImpl = vi.fn(async () => jsonResponse({ data: ["Anime"] }));
    const result = await fetchProviderImageStyles({}, fetchImpl);
    // The endpoint is keyless and Venice is its only known implementation, so a
    // probe with no base URL still has somewhere to go.
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.venice.ai/api/v1/image/styles",
      expect.objectContaining({ method: "GET" })
    );
    expect(result.ok).toBe(true);
    expect(result.styles).toEqual(["Anime"]);
  });

  it("sends Authorization only when a key is available (the endpoint is public)", async () => {
    const withKey = vi.fn(async (_url: unknown, _init?: RequestInit) => jsonResponse({ data: ["Anime"] }));
    await fetchProviderImageStyles({ baseUrl: "http://test.local", apiKey: "secret" }, withKey);
    expect((withKey.mock.calls[0][1] as RequestInit).headers).toEqual({ Authorization: "Bearer secret" });

    const keyless = vi.fn(async (_url: unknown, _init?: RequestInit) => jsonResponse({ data: ["Anime"] }));
    await fetchProviderImageStyles({ baseUrl: "http://test.local" }, keyless);
    expect((keyless.mock.calls[0][1] as RequestInit).headers).toEqual({});
  });
});

/** Route harness: a temp settings dir, a stub fetch that records every call,
 *  and a real ProviderManager behind the real routes. */
function harness(respond: (url: string) => Response, options: { withConnection?: boolean } = {}) {
  const settingsDir = join(tempDir(), "settings");
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];

  const fetchImpl = (async (url: unknown, init?: RequestInit) => {
    calls.push({ url: String(url), headers: (init?.headers ?? {}) as Record<string, string> });
    return respond(String(url));
  }) as unknown as typeof fetch;

  if (options.withConnection !== false) {
    createConnection(settingsDir, {
      label: "Venice Images",
      baseUrl: "https://api.venice.ai/api/v1",
      model: "flux-dev",
      kind: "image",
      apiStyle: "venice",
      apiKey: "stored-key"
    });
  }

  const manager = new ProviderManager(settingsDir, {}, fetchImpl);
  const app = Fastify();
  app.register(providerRoutes, { manager });
  return { app, settingsDir, calls };
}

describe("POST /api/settings/providers/image-styles", () => {
  it("probes the draft's base URL and returns the styles in provider order", async () => {
    const h = harness(() => jsonResponse({ data: PROVIDER_STYLES, object: "list" }));

    const res = await h.app.inject({
      method: "POST",
      url: "/api/settings/providers/image-styles",
      payload: { baseUrl: "https://api.venice.ai/api/v1" }
    });

    expect(res.statusCode).toBe(200);
    expect(h.calls[0].url).toBe("https://api.venice.ai/api/v1/image/styles");
    const body = res.json();
    expect(body.ok).toBe(true);
    expect(body.styles).toEqual(["Cinematic", "3D Model", "Anime"]);
  });

  it("resolves a saved connection id and signs the call with its STORED key", async () => {
    const h = harness(() => jsonResponse({ data: ["Anime", "Cinematic"] }));

    const res = await h.app.inject({
      method: "POST",
      url: "/api/settings/providers/image-styles",
      payload: { id: "venice_images" }
    });

    expect(res.statusCode).toBe(200);
    expect(h.calls[0].url).toBe("https://api.venice.ai/api/v1/image/styles");
    expect(h.calls[0].headers.Authorization).toBe("Bearer stored-key");
    expect(res.json().styles).toEqual(["Anime", "Cinematic"]);
  });

  it("falls back to the Venice host when the body carries neither id nor baseUrl", async () => {
    const h = harness(() => jsonResponse({ data: ["Anime"] }));

    const res = await h.app.inject({ method: "POST", url: "/api/settings/providers/image-styles", payload: {} });

    expect(res.statusCode).toBe(200);
    expect(h.calls[0].url).toBe("https://api.venice.ai/api/v1/image/styles");
  });

  it("reports an upstream failure instead of throwing", async () => {
    const h = harness(() => new Response("upstream is down", { status: 503 }));

    const res = await h.app.inject({
      method: "POST",
      url: "/api/settings/providers/image-styles",
      payload: { baseUrl: "http://localhost:1234/v1" }
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.ok).toBe(false);
    expect(body.status).toBe(503);
    expect(body.message).toBe("upstream is down");
    expect(body.styles).toEqual([]);
  });

  it("accepts an unsaved draft with no connection id at all", async () => {
    const h = harness(() => jsonResponse({ data: ["Anime"] }), { withConnection: false });

    const res = await h.app.inject({
      method: "POST",
      url: "/api/settings/providers/image-styles",
      payload: { baseUrl: "http://selfhosted.local:8000/v1", apiKey: "draft-key" }
    });

    expect(res.statusCode).toBe(200);
    expect(h.calls[0].url).toBe("http://selfhosted.local:8000/v1/image/styles");
    expect(h.calls[0].headers.Authorization).toBe("Bearer draft-key");
  });
});
