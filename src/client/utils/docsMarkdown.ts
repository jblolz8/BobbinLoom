/** Markdown rendering for the docs viewer.
 *
 *  Deliberately separate from `utils/markdown.tsx` (the chat parser): chat needs
 *  dialogue-quote styling and dependency-freeness, docs need headings, tables,
 *  fences and cross-page links. Neither replaces the other — but BOTH render code
 *  through the same contract (`.code-block`, `.inline-code`), so a theme's
 *  `--code-*` tokens reach every code surface in the app at once.
 *
 *  Three rules keep a page safe to render with `dangerouslySetInnerHTML`:
 *  HTML in a page is rendered as text rather than as elements, link hrefs are
 *  restricted to http(s) and in-tree `.md` targets, and code is escaped once.
 *
 *  Search highlighting is a RENDERER option, not a DOM pass: the mark is part of
 *  the HTML this function returns, so it re-applies itself whenever the page
 *  changes and nothing has to be found and undone afterwards.
 */
import { Marked, Renderer } from "marked";
import { slugifyHeading } from "../../engine/docsHeadings";
import { MIN_QUERY_LENGTH } from "../../engine/docsSearch";

/** Re-exported for the viewer and its tests. The mapping itself lives in
 *  `engine/docsHeadings` because the server-side search needs the identical
 *  string to point a hit at its heading — its ids must keep matching the anchors
 *  the documentation links to (`"(POV / Scene)"` → `pov--scene`). */
export { slugifyHeading };

function escapeHtml(text: string): string {
  return text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

const SAFE_PROTOCOL = /^(https?:|mailto:)/i;
const DOC_LINK = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md(#.*)?$/;

/**
 * The copy control's two states, both present in the markup and swapped by CSS
 * (`[data-copied="true"]`). Same classes, text and icons as the React
 * `CodeBlock` — these are lucide's own paths at the same size, so a docs code
 * block and a chat code block are indistinguishable.
 */
const COPY_ICON =
  '<rect width="14" height="14" x="8" y="8" rx="2" ry="2"></rect><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"></path>';
const CHECK_ICON = '<path d="M20 6 9 17l-5-5"></path>';

function stateIcon(inner: string, state: "idle" | "copied"): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" data-state="${state}" aria-hidden="true">${inner}</svg>`;
}

function copyButton(title: string): string {
  return [
    `<button type="button" class="code-copy-btn" data-copy-code="true" title="${title}" aria-label="${title}">`,
    stateIcon(COPY_ICON, "idle"),
    stateIcon(CHECK_ICON, "copied"),
    '<span class="code-copy-label" data-state="idle">Copy</span>',
    '<span class="code-copy-label" data-state="copied">Copied</span>',
    "</button>"
  ].join("");
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * The highlight pattern, or null when there is nothing to highlight. The needle
 * is HTML-escaped the same way the text is, because matching happens on escaped
 * output: a term like `<baseUrl>` only exists there as `&lt;baseUrl&gt;`. A
 * regex-shaped term like `a.b` must stay literal text.
 */
function hitPattern(needle: string | undefined): RegExp | null {
  const trimmed = (needle ?? "").trim();
  if (trimmed.length < MIN_QUERY_LENGTH) return null;
  return new RegExp(`(${escapeRegExp(escapeHtml(trimmed))})`, "gi");
}

/** Wraps every occurrence in a mark. The mark carries theme tokens of its own
 *  (`--doc-hit-*`), so this function never decides a colour. */
function mark(escaped: string, pattern: RegExp | null): string {
  return pattern ? escaped.replace(pattern, '<mark class="doc-search-hit">$1</mark>') : escaped;
}

function renderer(pattern: RegExp | null): Renderer {
  const renderer = new Renderer();

  renderer.heading = function ({ tokens, depth }) {
    const raw = tokens.map((token) => token.raw ?? "").join("");
    return `<h${depth} id="${slugifyHeading(raw)}">${this.parser.parseInline(tokens)}</h${depth}>`;
  };

  /**
   * Prose. Overriding `text` means escaping it ourselves — marked does not do it
   * for an override — and it is what makes a matched word highlight inside
   * emphasis, links, headings, table cells and blockquotes.
   */
  renderer.text = function ({ text }) {
    return mark(escapeHtml(text), pattern);
  };

  /**
   * Pages are prose about software, so they are full of literal placeholders —
   * `<baseUrl>`, `<slug>`, `<id>`. Tokenised as HTML those would either vanish
   * from the page or become real elements, so every HTML token is emitted as
   * its escaped source text instead. Escaping the markdown up front is NOT an
   * option: inside a code span marked escapes `&` again, which would show the
   * reader `&lt;baseUrl&gt;` instead of `<baseUrl>`.
   */
  renderer.html = function ({ text }) {
    return mark(escapeHtml(text), pattern);
  };

  /** Fenced blocks render the shared `.code-block` contract, copy button included.
   *  A search term is marked here too — a `<mark>` contributes no text, so the
   *  copy button still copies the code exactly as written. */
  renderer.code = function ({ text, lang }) {
    const label = escapeHtml((lang ?? "").trim() || "text");
    return [
      '<div class="code-block tone-default">',
      '<div class="code-block-header">',
      `<span class="code-lang-label">${label}</span>`,
      '<div class="code-block-actions">',
      copyButton("Copy code to clipboard"),
      "</div>",
      "</div>",
      `<pre class="code-block-pre"><code>${mark(escapeHtml(text), pattern)}</code></pre>`,
      "</div>"
    ].join("");
  };

  /** Inline code uses the app's canonical inline-code class. */
  renderer.codespan = function ({ text }) {
    return `<code class="inline-code">${mark(escapeHtml(text), pattern)}</code>`;
  };

  renderer.link = function ({ href, title, tokens }) {
    const text = this.parser.parseInline(tokens);
    const label = title ? ` title="${title}"` : "";

    if (DOC_LINK.test(href)) {
      return `<a href="#" data-doc-link="${href}"${label}>${text}</a>`;
    }
    if (SAFE_PROTOCOL.test(href)) {
      return `<a href="${href}" target="_blank" rel="noreferrer"${label}>${text}</a>`;
    }
    // Anything else (javascript:, data:, vbscript:, a bare relative path we do
    // not serve) renders as text: a page must not be able to hand the viewer a
    // URL it would never run.
    return `<span class="doc-link-inert">${text}</span>`;
  };

  return renderer;
}

/** The plain parser, plus a one-entry cache for the highlighted one: typing a
 *  query must not rebuild a parser on every keystroke. */
const plainMarked = new Marked({ gfm: true, renderer: renderer(null) });
let cachedKey: string | null = null;
let cachedMarked: Marked | null = null;

function markedFor(pattern: RegExp | null): Marked {
  if (!pattern) return plainMarked;
  const key = `${pattern.source}${pattern.flags}`;
  if (cachedKey !== key || !cachedMarked) {
    cachedMarked = new Marked({ gfm: true, renderer: renderer(pattern) });
    cachedKey = key;
  }
  return cachedMarked;
}

export type RenderDocOptions = {
  /** Exact phrase to mark in the rendered page. Shorter than two characters is
   *  ignored, so a single keystroke never floods a page with marks. */
  highlight?: string;
};

/**
 * Wraps every table in the scroll container `docs.css` styles. A GFM table
 * cannot nest, so replacing the two tags is safe — and a page that SHOWS
 * `<table>` inside a fence has it escaped to `&lt;table&gt;` by the code
 * renderer, so it can never be mistaken for markup here. The wrapper is what
 * keeps a wide table from pushing the whole reading pane sideways: the table
 * keeps real table layout and distributes its columns, and only the wrapper
 * scrolls when the content genuinely cannot fit.
 */
function wrapTables(html: string): string {
  return html
    .replace(/<table>/g, '<div class="doc-table-wrap"><table>')
    .replace(/<\/table>/g, "</table></div>");
}

/** Markdown → HTML for a documentation page. */
export function renderDocMarkdown(markdown: string, options: RenderDocOptions = {}): string {
  return wrapTables(markedFor(hitPattern(options.highlight)).parse(markdown) as string);
}
