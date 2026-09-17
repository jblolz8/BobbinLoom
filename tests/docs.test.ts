/** The docs viewer's source of truth: `docs/*.md` served read-only over
 *  `/api/docs`. Every test writes its own temp docs dir — no test may read or
 *  write the real repo `docs/` tree except through the explicit-seam tests. */
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { docsRoutes } from "../src/server/routes/docs";
import { slugifyHeading } from "../src/engine/docsHeadings";
import { renderDocMarkdown } from "../src/client/utils/docsMarkdown";
import { cleanupTempDirs, tempDir } from "./helpers/imageFixtures";

afterAll(cleanupTempDirs);

let app: FastifyInstance;
let docsDir: string;
let emptyDir: string;

const SECRET_MARKER = "SECRET-CONTENT-MARKER-9c1f";

const PLAYTHROUGHS = `---
title: Playthroughs
section: Playing
order: 10
---

# Playthroughs

A playthrough is one story.

See [Timelines](timelines.md#branching).
`;

const INDEX = `---
title: BobbinLoom
section: Overview
order: 1
---

# BobbinLoom

Landing page.
`;

const GENERATED = `---
title: Image generation
section: Providers
order: 120
---

# Image generation

\`\`\`json
{"model":"x","max_tokens":12000}
\`\`\`
`;

/** No front-matter: the list still has to describe it, using its H1. */
const NO_FRONT_MATTER = `# Orphan page

Body text.
`;

beforeAll(async () => {
  docsDir = tempDir("bl-docs-");
  emptyDir = tempDir("bl-docs-empty-");
  writeFileSync(join(docsDir, "playthroughs.md"), PLAYTHROUGHS);
  writeFileSync(join(docsDir, "index.md"), INDEX);
  writeFileSync(join(docsDir, "image-generation.md"), GENERATED);
  writeFileSync(join(docsDir, "orphan.md"), NO_FRONT_MATTER);
  // The traversal bait: a file the reader must never reach. Its CONTENT marker
  // deliberately differs from its filename — a 404 echoes the requested URL, so
  // grepping for the name alone would "pass" without proving anything.
  writeFileSync(join(docsDir, "..", "bl-docs-secret.txt"), SECRET_MARKER);

  app = Fastify();
  await app.register(docsRoutes, { docsDir });
  await app.ready();
});

describe("GET /api/docs", () => {
  it("lists every page ordered by front-matter `order`, not by filename", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { pages: Array<{ slug: string; title: string; section: string; order: number }> };
    expect(body.pages.map((p) => p.slug)).toEqual(["index", "playthroughs", "image-generation", "orphan"]);
    expect(body.pages[0]).toMatchObject({ title: "BobbinLoom", section: "Overview", order: 1 });
  });

  it("does not ship page bodies in the list", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs" });
    const raw = res.body;
    expect(raw).not.toContain("A playthrough is one story");
  });

  it("falls back to the page's H1 when there is no front-matter", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs" });
    const body = res.json() as { pages: Array<{ slug: string; title: string; section: string; order: number | null }> };
    const orphan = body.pages.find((p) => p.slug === "orphan");
    expect(orphan).toMatchObject({ title: "Orphan page", section: "" });
    expect(orphan?.order).toBeNull();
  });

  it("answers an empty list (never an error) when the docs directory is missing", async () => {
    const lonely = Fastify();
    await lonely.register(docsRoutes, { docsDir: join(emptyDir, "does-not-exist") });
    await lonely.ready();
    const res = await lonely.inject({ method: "GET", url: "/api/docs" });
    expect(res.statusCode).toBe(200);
    expect((res.json() as { pages: unknown[] }).pages).toEqual([]);
    await lonely.close();
  });
});

describe("GET /api/docs/:slug", () => {
  it("returns the page body with the front-matter stripped", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs/playthroughs" });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { slug: string; title: string; markdown: string };
    expect(body.title).toBe("Playthroughs");
    expect(body.markdown.startsWith("# Playthroughs")).toBe(true);
    expect(body.markdown).not.toContain("section: Playing");
    expect(body.markdown).toContain("A playthrough is one story.");
  });

  it("keeps fenced content byte-for-byte", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs/image-generation" });
    const body = res.json() as { markdown: string };
    expect(body.markdown).toContain('{"model":"x","max_tokens":12000}');
  });

  it("404s an unknown slug", async () => {
    const res = await app.inject({ method: "GET", url: "/api/docs/nope" });
    expect(res.statusCode).toBe(404);
    expect((res.json() as { error: string }).error).toBeTruthy();
  });

  it("refuses traversal instead of reading outside the docs directory", async () => {
    for (const url of ["/api/docs/..%2Fbl-docs-secret", "/api/docs/../bl-docs-secret", "/api/docs/..%2f..%2fpackage", "/api/docs/%2e%2e%2fpackage"]) {
      const res = await app.inject({ method: "GET", url });
      expect(res.statusCode, url).toBeGreaterThanOrEqual(400);
      expect(res.body, url).not.toContain(SECRET_MARKER);
    }
  });
});

/** The search endpoint: a thin shell over `engine/docsSearch`, reading the same
 *  injectable `docsDir` as the list and page routes. */
describe("GET /api/docs/search", () => {
  let searchApp: FastifyInstance;
  let searchDir: string;

  const MEMORY_PAGE = [
    "---",
    "title: Chapters & memory",
    "section: Playing",
    "order: 30",
    "---",
    "",
    "# Memory rotation",
    "",
    "The engine rotates memory events once the cap is reached.",
    "",
    "## Rotation rules",
    "",
    "memory events are capped at fifty.",
    "",
    "```ts",
    "const memoryEvents = [];",
    "```",
    ""
  ].join("\n");

  /** Matches on title only: the word never appears in the body. */
  const TITLE_ONLY_PAGE = [
    "---",
    "title: Lorebook vault",
    "section: World",
    "order: 55",
    "---",
    "",
    "# Vaults",
    "",
    "Nothing relevant here.",
    ""
  ].join("\n");

  beforeAll(async () => {
    searchDir = tempDir("bl-docs-search-");
    writeFileSync(join(searchDir, "chapters-and-memory.md"), MEMORY_PAGE);
    writeFileSync(join(searchDir, "lorebooks.md"), TITLE_ONLY_PAGE);
    searchApp = Fastify();
    await searchApp.register(docsRoutes, { docsDir: searchDir });
    await searchApp.ready();
  });

  const search = async (query: string) => (await searchApp.inject({ url: `/api/docs/search?q=${encodeURIComponent(query)}` })).json();

  it("returns per-page counts, capped hits and a total", async () => {
    const body = await search("memory");
    expect(body.query).toBe("memory");
    expect(body.total).toBe(4);
    expect(body.pages.length).toBe(1);
    expect(body.pages[0].slug).toBe("chapters-and-memory");
    expect(body.pages[0].title).toBe("Chapters & memory");
    expect(body.pages[0].count).toBe(4);
    expect(body.pages[0].hits).toHaveLength(3);
  });

  it("attaches anchors that are the ids the renderer writes", async () => {
    const body = await search("memory");
    expect(body.pages[0].hits[0].anchor).toBe(slugifyHeading("Memory rotation"));
    // cross-layer guard: the anchor must exist as an id in the rendered page
    expect(renderDocMarkdown(MEMORY_PAGE).includes(`id="${body.pages[0].hits[0].anchor}"`)).toBe(true);
    expect(body.pages[0].hits[2].anchor).toBe(slugifyHeading("Rotation rules"));
  });

  it("is case-insensitive and exact-phrase", async () => {
    expect((await search("MEMORY")).total).toBe(4);
    expect((await search("memory zzz")).total).toBe(0);
    expect((await search("memory")).total).toBe((await search("Memory")).total);
  });

  it("keeps a title-only match in the results with a zero count", async () => {
    const body = await search("lorebook");
    expect(body.total).toBe(0);
    expect(body.pages).toHaveLength(1);
    expect(body.pages[0]).toMatchObject({ slug: "lorebooks", count: 0, titleMatch: true, hits: [] });
  });

  it("treats a query shorter than two characters as empty", async () => {
    expect(await search("m")).toEqual({ query: "m", total: 0, pages: [] });
    expect(await search("")).toEqual({ query: "", total: 0, pages: [] });
  });

  it("treats a regex-shaped query literally, and finds matches inside code", async () => {
    expect((await search("a.b")).total).toBe(0);
    expect((await search("memoryEvents")).total).toBe(1);
  });

  it("never reads outside docsDir", async () => {
    expect((await search(SECRET_MARKER)).total).toBe(0);
  });

  it("caps a very long query instead of scanning with it", async () => {
    const body = await search("memory".repeat(200));
    expect(body.total).toBe(0);
    expect(body.query.length).toBe(120);
  });
});
