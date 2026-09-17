/** The docs renderer is deliberately separate from the chat parser: docs are
 *  heading/table/fence-heavy and the chat parser has none of those. These tests
 *  pin the two behaviours that make a shared docs tree safe to render:
 *  HTML in a page never becomes an element (and never eats a literal
 *  `<placeholder>`), and heading ids match the anchors the docs link to. */
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { CodeBlock } from "../src/client/components/base/CodeBlock";
import { renderDocMarkdown, slugifyHeading } from "../src/client/utils/docsMarkdown";

describe("slugifyHeading", () => {
  it("matches the anchors the documentation links to", () => {
    expect(slugifyHeading("Measuring: estimate vs measured")).toBe("measuring-estimate-vs-measured");
    expect(slugifyHeading("Instruction modes (POV / Scene)")).toBe("instruction-modes-pov--scene");
    expect(slugifyHeading("Multi-character regions (Forge Couple)")).toBe("multi-character-regions-forge-couple");
  });
});

describe("renderDocMarkdown", () => {
  it("gives headings ids so in-doc anchors resolve", () => {
    expect(renderDocMarkdown("## Measuring: estimate vs measured")).toContain('id="measuring-estimate-vs-measured"');
  });

  it("renders GFM tables", () => {
    const html = renderDocMarkdown("| a | b |\n|---|---|\n| 1 | 2 |");
    expect(html).toContain("<table>");
    expect(html).toContain("<td>1</td>");
  });

  it("renders a literal <placeholder> as visible text, not as HTML", () => {
    const html = renderDocMarkdown("GET <baseUrl>/models");
    expect(html).toContain("&lt;baseUrl&gt;");
    expect(html).not.toContain("<baseUrl>");
  });

  it("keeps the placeholder readable inside an inline code span (no double escaping)", () => {
    // The pages write `GET <baseUrl>/models` in backticks. Escaping the markdown
    // up front made marked re-escape the `&`, so the reader saw "&lt;baseUrl&gt;"
    // on screen — the bug this pins shut.
    const html = renderDocMarkdown("Run `GET <baseUrl>/models` first.");
    expect(html).toContain('<code class="inline-code">GET &lt;baseUrl&gt;/models</code>');
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("&amp;amp;");
  });

  it("keeps a fenced block's placeholders readable", () => {
    const html = renderDocMarkdown("```sh\ncurl <baseUrl>/v1/models\n```");
    expect(html).toContain("&lt;baseUrl&gt;");
    expect(html).not.toContain("&amp;lt;");
  });

  it("renders raw HTML in a page as text instead of markup", () => {
    const html = renderDocMarkdown('<script>alert("x")</script>\n\nand <img src=x onerror=alert(1)>');
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("&lt;img");
  });

  it("escapes a stray angle bracket that is not a tag", () => {
    expect(renderDocMarkdown("A count of a < b is fine.")).toContain("&lt; b");
  });

  it("marks internal doc links for the viewer to intercept", () => {
    const html = renderDocMarkdown("See [Timelines](timelines.md#branching).");
    expect(html).toContain('data-doc-link="timelines.md#branching"');
  });

  it("opens external links in a new tab", () => {
    const html = renderDocMarkdown("[Forge Couple](https://github.com/Haoming02/sd-forge-couple)");
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noreferrer"');
  });

  it("never emits a javascript: or data: href", () => {
    for (const bad of ["[x](javascript:alert(1))", "[x](data:text/html,<script>1</script>)", "[x](vbscript:msgbox)"]) {
      const html = renderDocMarkdown(bad);
      expect(html, bad).not.toContain('href="javascript:');
      expect(html, bad).not.toContain('href="data:');
      expect(html, bad).not.toContain('href="vbscript:');
      // the text survives as plain text
      expect(html, bad).toContain("x");
    }
  });
});

/**
 * The docs renderer and the React primitive must emit the SAME contract. They
 * are two implementations of one look (marked produces a string, React renders
 * elements) — the way they drifted apart last time was silently, with docs
 * inventing its own tokens. These tests are the tripwire.
 */
describe("code surfaces share one contract", () => {
  it("emits a fenced block with the same classes the React primitive renders", () => {
    const react = renderToStaticMarkup(createElement(CodeBlock, { code: "x = 1", language: "ts" }));
    const docs = renderDocMarkdown("```ts\nx = 1\n```");
    for (const cls of ["code-block", "code-block-header", "code-lang-label", "code-block-actions", "code-copy-btn", "code-block-pre"]) {
      expect(react, `react missing ${cls}`).toContain(cls);
      expect(docs, `docs missing ${cls}`).toContain(cls);
    }
    expect(react).toContain(">ts<");
    expect(docs).toContain(">ts<");
    expect(react).toContain("Copy");
    expect(docs).toContain("Copy");
  });

  it("uses the same copy glyph on both surfaces", () => {
    const react = renderToStaticMarkup(createElement(CodeBlock, { code: "x" }));
    const docs = renderDocMarkdown("```\nx\n```");
    const copyGlyph = "M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2";
    expect(react).toContain(copyGlyph);
    expect(docs).toContain(copyGlyph);
  });

  it("renders inline code with the app's canonical class", () => {
    expect(renderDocMarkdown("a `flag` here")).toContain('<code class="inline-code">flag</code>');
  });

  it("carries the state the viewer toggles on click", () => {
    const docs = renderDocMarkdown("```sh\nls\n```");
    expect(docs).toContain('data-copy-code="true"');
    expect(docs).toContain('data-state="copied"');
    expect(docs).toContain("Copied");
  });
});

/**
 * Highlighting is a RENDERER option, not a DOM pass: the mark is part of the
 * HTML the renderer emits, so it re-applies itself whenever the page changes and
 * nothing ever has to be undone. Code is highlighted deliberately (the code
 * paths are overridden separately), prose by the text path.
 */
const HL_PAGE = [
  "# Memory rotation",
  "",
  "The engine rotates **memory events** once the cap is reached, and `memoryEvents` names one.",
  "See [memory events](chapters-and-memory.md#memory-events) and a <baseUrl> placeholder.",
  "",
  "| Column | Note |",
  "|---|---|",
  "| memory | capped |",
  "",
  "```ts",
  "const memoryEvents = []; // fenced code",
  "```"
].join("\n");

const countMarks = (html: string) => (html.match(/<mark class="doc-search-hit">/g) ?? []).length;

describe("renderDocMarkdown highlight", () => {
  it("highlights prose, headings, emphasis, links and table cells", () => {
    const html = renderDocMarkdown(HL_PAGE, { highlight: "memory" });
    expect(html).toContain('<h1 id="memory-rotation"><mark class="doc-search-hit">Memory</mark> rotation</h1>');
    expect(html).toContain("<strong><mark class=\"doc-search-hit\">memory</mark> events</strong>");
    expect(html).toContain('<a href="#" data-doc-link="chapters-and-memory.md#memory-events"><mark class="doc-search-hit">memory</mark> events</a>');
    expect(html).toContain('<td><mark class="doc-search-hit">memory</mark></td>');
    expect(countMarks(html)).toBeGreaterThanOrEqual(6);
  });

  it("highlights inside inline code and fenced blocks too", () => {
    const html = renderDocMarkdown(HL_PAGE, { highlight: "memory" });
    expect(html).toContain('<code class="inline-code"><mark class="doc-search-hit">memory</mark>Events</code>');
    expect(html).toContain('<code>const <mark class="doc-search-hit">memory</mark>Events = []; // fenced code');
  });

  it("keeps the marked text inside code free of the prose colour, ready for the code's own", () => {
    const html = renderDocMarkdown("`memoryEvents`", { highlight: "memory" });
    expect(html).toContain('<code class="inline-code"><mark class="doc-search-hit">memory</mark>Events</code>');
  });

  it("does not mark anything for an empty or one-character needle", () => {
    expect(countMarks(renderDocMarkdown(HL_PAGE, { highlight: "" }))).toBe(0);
    expect(countMarks(renderDocMarkdown(HL_PAGE, { highlight: "m" }))).toBe(0);
    expect(countMarks(renderDocMarkdown(HL_PAGE))).toBe(0);
  });

  it("leaves the copying text and the escaping untouched", () => {
    const html = renderDocMarkdown(HL_PAGE, { highlight: "memory" });
    expect(html).toContain("&lt;baseUrl&gt;");
    expect(html).not.toContain("&amp;lt;");
    expect(html).not.toContain("<baseUrl>");
    // exactly one copy control per fenced block, still carrying its two states
    expect((html.match(/data-copy-code="true"/g) ?? []).length).toBe(1);
  });

  it("matches an HTML-shaped needle against the escaped text", () => {
    const html = renderDocMarkdown("A <baseUrl> placeholder.", { highlight: "<baseUrl>" });
    expect(html).toContain('<mark class="doc-search-hit">&lt;baseUrl&gt;</mark>');
  });

  it("treats a regex-shaped needle as literal text", () => {
    expect(renderDocMarkdown("Use a.b here.", { highlight: "a.b" })).toContain('<mark class="doc-search-hit">a.b</mark>');
    expect(renderDocMarkdown("Use axb here.", { highlight: "a.b" })).not.toContain("<mark");
  });

  it("marks every occurrence on the page, not just the first", () => {
    expect(countMarks(renderDocMarkdown("memory and memory and Memory", { highlight: "memory" }))).toBe(3);
  });
});

/**
 * Wide tables: the table itself keeps table layout, and the renderer wraps it in
 * the scroll container the stylesheet styles — the two must agree, or a wide
 * table silently pushes the whole pane sideways again (the bug this pins shut).
 */
describe("table wrapper", () => {
  const TABLE = "| Field | Meaning |\n|---|---|\n| `apiStyle` | the dialect |";

  it("wraps a rendered table in the scroll container", () => {
    const html = renderDocMarkdown(TABLE);
    expect(html).toContain('<div class="doc-table-wrap"><table>');
    expect(html).toContain("</table></div>");
  });

  it("wraps it once, not twice", () => {
    expect((renderDocMarkdown(TABLE).match(/doc-table-wrap/g) ?? []).length).toBe(1);
  });

  it("still wraps while highlighting", () => {
    const html = renderDocMarkdown(TABLE, { highlight: "field" });
    expect(html).toContain('<div class="doc-table-wrap"><table>');
    expect(html).toContain('<mark class="doc-search-hit">');
  });

  it("leaves a literal <table> displayed inside a fence alone", () => {
    const html = renderDocMarkdown("```html\n<table>\n```");
    expect(html).not.toContain("doc-table-wrap");
    expect(html).toContain("&lt;table&gt;");
  });

  it("emits the very class the stylesheet styles", () => {
    const css = readFileSync(new URL("../src/client/styles/docs.css", import.meta.url), "utf8");
    expect(css).toContain(".doc-table-wrap");
    expect(css).not.toMatch(/\.doc-markdown table \{[^}]*display: block/);
  });
});

/**
 * The docs viewer's width chain. Each link can be removed on its own and the
 * symptom only shows once it reaches a phone, so all four are pinned: the view
 * shrinks inside the overlay's flex sheet, the pane shrinks, the sheet clips
 * rather than growing a scrollbar of its own, and the code fence is left as the
 * thing that scrolls when a line is genuinely too long.
 *
 * Geometry itself can only be proven in a browser; the live check that the view's
 * right edge stays inside the viewport is in references/ui-verification-cdp.md.
 */
describe("docs width chain", () => {
  const docs = readFileSync(new URL("../src/client/styles/docs.css", import.meta.url), "utf8");
  const views = readFileSync(new URL("../src/client/styles/views.css", import.meta.url), "utf8");

  it("lets the viewer shrink inside the overlay's flex sheet", () => {
    expect(docs).toMatch(/\.docs-view \{[^}]*min-width: 0/);
  });

  it("keeps the content pane shrinkable as well", () => {
    expect(docs).toMatch(/\.docs-content \{[^}]*min-width: 0/);
  });

  it("keeps the overlay clipping instead of growing a scrollbar of its own", () => {
    expect(docs).toMatch(/\.docs-overlay \{[^}]*overflow: hidden/);
  });

  it("leaves the code fence as the thing that scrolls", () => {
    expect(views).toMatch(/\.code-block-pre \{[^}]*overflow-x: auto/);
  });
});
