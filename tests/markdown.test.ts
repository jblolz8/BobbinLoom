import { describe, it, expect } from "vitest";
import { parseInline, parseMarkdown, type InlineNode } from "../src/client/utils/markdown";

describe("parseInline", () => {
  it("returns empty array for empty input", () => {
    expect(parseInline("")).toEqual([]);
  });

  it("parses plain text", () => {
    const nodes = parseInline("Hello, world!");
    expect(nodes).toEqual([{ type: "text", value: "Hello, world!" }]);
  });

  it("parses straight double quotes as dialogue quote tokens", () => {
    const nodes = parseInline('He said, "Hello there!" quietly.');
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: "text", value: "He said, " });
    expect(nodes[1]).toEqual({
      type: "quote",
      rawOpen: '"',
      rawClose: '"',
      children: [{ type: "text", value: "Hello there!" }],
    });
    expect(nodes[2]).toEqual({ type: "text", value: " quietly." });
  });

  it("parses curly/smart double quotes as dialogue quote tokens", () => {
    const nodes = parseInline("She whispered, “Be careful!” and looked away.");
    expect(nodes).toHaveLength(3);
    expect(nodes[0]).toEqual({ type: "text", value: "She whispered, " });
    expect(nodes[1]).toEqual({
      type: "quote",
      rawOpen: "“",
      rawClose: "”",
      children: [{ type: "text", value: "Be careful!" }],
    });
    expect(nodes[2]).toEqual({ type: "text", value: " and looked away." });
  });

  it("parses bold text", () => {
    const nodes = parseInline("This is **bold** text and __also bold__.");
    expect(nodes).toEqual([
      { type: "text", value: "This is " },
      { type: "bold", children: [{ type: "text", value: "bold" }] },
      { type: "text", value: " text and " },
      { type: "bold", children: [{ type: "text", value: "also bold" }] },
      { type: "text", value: "." },
    ]);
  });

  it("parses italic text", () => {
    const nodes = parseInline("This is *italic* and _also italic_.");
    expect(nodes).toEqual([
      { type: "text", value: "This is " },
      { type: "italic", children: [{ type: "text", value: "italic" }] },
      { type: "text", value: " and " },
      { type: "italic", children: [{ type: "text", value: "also italic" }] },
      { type: "text", value: "." },
    ]);
  });

  it("parses bold-italic text", () => {
    const nodes = parseInline("This is ***super important*** text.");
    expect(nodes).toEqual([
      { type: "text", value: "This is " },
      { type: "boldItalic", children: [{ type: "text", value: "super important" }] },
      { type: "text", value: " text." },
    ]);
  });

  it("parses inline code", () => {
    const nodes = parseInline("Use the `const x = 10;` syntax.");
    expect(nodes).toEqual([
      { type: "text", value: "Use the " },
      { type: "inlineCode", code: "const x = 10;" },
      { type: "text", value: " syntax." },
    ]);
  });

  it("parses strikethrough", () => {
    const nodes = parseInline("This is ~~wrong~~ right.");
    expect(nodes).toEqual([
      { type: "text", value: "This is " },
      { type: "strikethrough", children: [{ type: "text", value: "wrong" }] },
      { type: "text", value: " right." },
    ]);
  });

  it("parses dialogue nested inside italics (action + quote)", () => {
    const nodes = parseInline('*She gasped, "Are you sure?"*');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      type: "italic",
      children: [
        { type: "text", value: "She gasped, " },
        {
          type: "quote",
          rawOpen: '"',
          rawClose: '"',
          children: [{ type: "text", value: "Are you sure?" }],
        },
      ],
    });
  });

  it("parses bold formatting nested inside dialogue quote", () => {
    const nodes = parseInline('"I said **now**!"');
    expect(nodes).toHaveLength(1);
    expect(nodes[0]).toEqual({
      type: "quote",
      rawOpen: '"',
      rawClose: '"',
      children: [
        { type: "text", value: "I said " },
        { type: "bold", children: [{ type: "text", value: "now" }] },
        { type: "text", value: "!" },
      ],
    });
  });

  it("parses soft linebreaks within inline text", () => {
    const nodes = parseInline("Line one\nLine two");
    expect(nodes).toEqual([
      { type: "text", value: "Line one" },
      { type: "linebreak" },
      { type: "text", value: "Line two" },
    ]);
  });
});

describe("parseMarkdown", () => {
  it("returns empty array for empty input", () => {
    expect(parseMarkdown("")).toEqual([]);
  });

  it("parses simple paragraph", () => {
    const blocks = parseMarkdown("A single paragraph.");
    expect(blocks).toEqual([
      {
        type: "paragraph",
        children: [{ type: "text", value: "A single paragraph." }],
      },
    ]);
  });

  it("parses multiple paragraphs separated by blank lines", () => {
    const blocks = parseMarkdown("Paragraph 1.\n\nParagraph 2.");
    expect(blocks).toHaveLength(2);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[1].type).toBe("paragraph");
  });

  it("parses multiple paragraphs separated by CRLF and CR blank lines", () => {
    const blocksCrlf = parseMarkdown("Paragraph 1.\r\n\r\nParagraph 2.");
    expect(blocksCrlf).toHaveLength(2);
    expect(blocksCrlf[0].type).toBe("paragraph");
    expect(blocksCrlf[1].type).toBe("paragraph");

    const blocksCr = parseMarkdown("Paragraph 1.\r\rParagraph 2.");
    expect(blocksCr).toHaveLength(2);
    expect(blocksCr[0].type).toBe("paragraph");
    expect(blocksCr[1].type).toBe("paragraph");
  });

  it("parses fenced code blocks with language", () => {
    const raw = "```typescript\nconst a = 1;\nconst b = 2;\n```";
    const blocks = parseMarkdown(raw);
    expect(blocks).toEqual([
      {
        type: "codeBlock",
        code: "const a = 1;\nconst b = 2;",
        language: "typescript",
      },
    ]);
  });

  it("parses code blocks without language specifier", () => {
    const raw = "```\nhello world\n```";
    const blocks = parseMarkdown(raw);
    expect(blocks).toEqual([
      {
        type: "codeBlock",
        code: "hello world",
        language: undefined,
      },
    ]);
  });

  it("parses blockquotes", () => {
    const raw = "> This is a quote\n> with multiple lines";
    const blocks = parseMarkdown(raw);
    expect(blocks).toEqual([
      {
        type: "blockquote",
        children: [
          { type: "text", value: "This is a quote" },
          { type: "linebreak" },
          { type: "text", value: "with multiple lines" },
        ],
      },
    ]);
  });

  it("parses unordered lists", () => {
    const raw = "- Item 1\n- Item 2\n* Item 3";
    const blocks = parseMarkdown(raw);
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: false,
        items: [
          [{ type: "text", value: "Item 1" }],
          [{ type: "text", value: "Item 2" }],
          [{ type: "text", value: "Item 3" }],
        ],
      },
    ]);
  });

  it("parses ordered lists", () => {
    const raw = "1. First\n2. Second\n3. Third";
    const blocks = parseMarkdown(raw);
    expect(blocks).toEqual([
      {
        type: "list",
        ordered: true,
        items: [
          [{ type: "text", value: "First" }],
          [{ type: "text", value: "Second" }],
          [{ type: "text", value: "Third" }],
        ],
      },
    ]);
  });

  it("parses complex document mixing paragraphs, dialogue, code block, and list", () => {
    const raw = `He stepped into the tavern. "Anyone here?"

*The room remained dead silent.*

\`\`\`json
{ "status": "empty" }
\`\`\`

- Sword
- Shield`;

    const blocks = parseMarkdown(raw);
    expect(blocks).toHaveLength(4);
    expect(blocks[0].type).toBe("paragraph");
    expect(blocks[1].type).toBe("paragraph");
    expect(blocks[2].type).toBe("codeBlock");
    expect(blocks[3].type).toBe("list");
  });
});
