/** The in-app docs viewer's backend: `docs/*.md` served read-only.
 *
 *  Docs are read from disk on every request rather than bundled, so editing a
 *  page and refreshing is the whole loop — no rebuild, no copy to keep in sync.
 *  The directory is an injectable seam (`docsDir`) so tests never touch the real
 *  tree, exactly like `dataDir` on the other route plugins.
 */
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { basename, dirname, join, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import { MAX_QUERY_LENGTH, MIN_QUERY_LENGTH, searchPage } from "../../engine/docsSearch";

export type DocsRoutesOptions = FastifyPluginOptions & { docsDir?: string };

/** Repo-root `docs/`. The server runs from `src/server/` in dev and in prod
 *  alike, so this relative walk lands in the same place (mirrors `distPath` in
 *  `src/server/index.ts`). */
const DEFAULT_DOCS_DIR = resolve(dirname(fileURLToPath(import.meta.url)), "../../../docs");

/** A page slug is a filename stem: no separators, no dots-only, no traversal. */
const SLUG_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*$/;

export type DocPageMeta = {
  slug: string;
  title: string;
  section: string;
  /** `null` for a page with no front-matter order — the list sorts those last. */
  order: number | null;
};

export type DocPage = DocPageMeta & { markdown: string };

type FrontMatter = { title?: string; section?: string; order?: number };

/**
 * Split a page into its front-matter and its body. Tolerates CRLF, and a page
 * with no front-matter at all (the body is the whole file). Only the three keys
 * the viewer needs are read; anything else in the block is ignored, so the
 * format stays a line or two rather than a schema.
 */
export function splitFrontMatter(raw: string): { meta: FrontMatter; body: string } {
  const normalized = raw.replace(/^\uFEFF/, "");
  const lines = normalized.split(/\r?\n/);
  if (lines[0]?.trim() !== "---") return { meta: {}, body: normalized };

  const closing = lines.findIndex((line, index) => index > 0 && line.trim() === "---");
  if (closing < 0) return { meta: {}, body: normalized };

  const meta: FrontMatter = {};
  for (const line of lines.slice(1, closing)) {
    const match = /^([A-Za-z][A-Za-z0-9_]*)\s*:\s*(.*)$/.exec(line.trim());
    if (!match) continue;
    const [, key, value] = match;
    if (key === "title") meta.title = value.trim();
    else if (key === "section") meta.section = value.trim();
    else if (key === "order") {
      const parsed = Number(value.trim());
      if (Number.isFinite(parsed)) meta.order = parsed;
    }
  }

  return { meta, body: lines.slice(closing + 1).join("\n").replace(/^\n+/, "") };
}

/** First H1 in the body — the title fallback for a page without front-matter. */
function titleFromBody(body: string): string {
  for (const line of body.split(/\r?\n/)) {
    const match = /^#\s+(.+?)\s*$/.exec(line);
    if (match) return match[1];
  }
  return "";
}

function metaFor(raw: string, slug: string): { meta: DocPageMeta; body: string } {
  const { meta, body } = splitFrontMatter(raw);
  return {
    meta: {
      slug,
      title: meta.title || titleFromBody(body) || slug,
      section: meta.section ?? "",
      order: meta.order ?? null
    },
    body
  };
}

/** Ordered for the nav: explicit `order` first (ascending), then the pages that
 *  carry no order, alphabetically. Ties break on the slug so the list is stable
 *  between reads. */
export function sortPages(pages: DocPageMeta[]): DocPageMeta[] {
  return [...pages].sort((a, b) => {
    if (a.order === null && b.order === null) return a.slug.localeCompare(b.slug);
    if (a.order === null) return 1;
    if (b.order === null) return -1;
    return a.order - b.order || a.slug.localeCompare(b.slug);
  });
}

function markdownFiles(dir: string): string[] {
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".md"))
    .map((entry) => basename(entry.name, ".md"))
    .filter((slug) => SLUG_RE.test(slug));
}

/** Resolve a slug inside `docsDir`, or `null` when it escapes it. */
function pagePath(docsDir: string, slug: string): string | null {
  if (!SLUG_RE.test(slug) || slug.includes("..")) return null;
  const candidate = resolve(join(docsDir, `${slug}.md`));
  const root = resolve(docsDir);
  if (candidate !== join(root, `${slug}.md`) && !candidate.startsWith(root + sep)) return null;
  return candidate;
}


/** Every page on disk with its front-matter split off, in nav order. Shared by
 *  the list and the search so both describe the same set in the same order. */
function readPages(docsDir: string): Array<{ slug: string; meta: DocPageMeta; body: string }> {
  const loaded: Array<{ slug: string; meta: DocPageMeta; body: string }> = [];
  for (const slug of markdownFiles(docsDir)) {
    try {
      const { meta, body } = metaFor(readFileSync(join(docsDir, `${slug}.md`), "utf8"), slug);
      loaded.push({ slug, meta, body });
    } catch {
      // An unreadable page is listed nowhere and searched nowhere.
    }
  }
  return sortPages(loaded.map((page) => page.meta)).map(
    (meta) => loaded.find((page) => page.slug === meta.slug) as { slug: string; meta: DocPageMeta; body: string }
  );
}
export const docsRoutes: FastifyPluginAsync<DocsRoutesOptions> = async (app, options) => {
  const docsDir = options.docsDir ?? DEFAULT_DOCS_DIR;

  app.get("/api/docs", async () => {
    return { pages: readPages(docsDir).map((page) => page.meta) };
  });

  /** Keyword search over the page bodies, exact phrase and case-insensitive.
   *  `total` counts body hits; a page that only matches by title or section is
   *  still returned, with a zero count, so searching a page's name lists it. */
  app.get("/api/docs/search", async (request) => {
    const raw = String((request.query as { q?: string }).q ?? "").trim();
    const query = raw.slice(0, MAX_QUERY_LENGTH);
    if (query.length < MIN_QUERY_LENGTH) return { query, total: 0, pages: [] };

    const pages = readPages(docsDir)
      .map(({ slug, meta, body }) =>
        searchPage({ slug, title: meta.title, section: meta.section, body }, query)
      )
      .filter((page) => page.count > 0 || page.titleMatch);

    return { query, total: pages.reduce((sum, page) => sum + page.count, 0), pages };
  });

  app.get("/api/docs/:slug", async (request, reply) => {
    const { slug } = request.params as { slug: string };
    const path = pagePath(docsDir, slug);
    if (!path) return reply.code(400).send({ error: "Invalid docs page name" });
    if (!existsSync(path)) return reply.code(404).send({ error: "Docs page not found" });
    try {
      const { meta, body } = metaFor(readFileSync(path, "utf8"), slug);
      return { ...meta, markdown: body };
    } catch {
      return reply.code(404).send({ error: "Docs page not found" });
    }
  });
};
