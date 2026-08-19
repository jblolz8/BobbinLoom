import React from "react";

export type InlineNode =
  | { type: "text"; value: string }
  | { type: "quote"; rawOpen: string; rawClose: string; children: InlineNode[] }
  | { type: "boldItalic"; children: InlineNode[] }
  | { type: "bold"; children: InlineNode[] }
  | { type: "italic"; children: InlineNode[] }
  | { type: "strikethrough"; children: InlineNode[] }
  | { type: "inlineCode"; code: string }
  | { type: "linebreak" };

export type BlockNode =
  | { type: "paragraph"; children: InlineNode[] }
  | { type: "codeBlock"; code: string; language?: string }
  | { type: "blockquote"; children: InlineNode[] }
  | { type: "list"; ordered: boolean; items: InlineNode[][] };

interface MatchCandidate {
  startIndex: number;
  endIndex: number;
  type: "inlineCode" | "quote" | "boldItalic" | "bold" | "italic" | "strikethrough";
  rawOpen?: string;
  rawClose?: string;
  content: string;
}

/**
 * Parse inline text into a tree of InlineNodes.
 * Handles dialogue quotes ("..." and “...”), bold/italic/strikethrough, inline code, and line breaks.
 */
export function parseInline(text: string): InlineNode[] {
  if (!text) return [];

  const nodes: InlineNode[] = [];
  let remaining = text.replace(/\r\n|\r/g, "\n");

  while (remaining.length > 0) {
    const candidates: MatchCandidate[] = [];

    // 1. Inline Code: `code`
    const codeMatch = /`([^`\n]+)`/.exec(remaining);
    if (codeMatch && codeMatch.index !== undefined) {
      candidates.push({
        startIndex: codeMatch.index,
        endIndex: codeMatch.index + codeMatch[0].length,
        type: "inlineCode",
        content: codeMatch[1],
      });
    }

    // 2. Straight Double Quotes: "dialogue"
    const straightQuoteMatch = /"([^"\n]+)"/.exec(remaining);
    if (straightQuoteMatch && straightQuoteMatch.index !== undefined) {
      candidates.push({
        startIndex: straightQuoteMatch.index,
        endIndex: straightQuoteMatch.index + straightQuoteMatch[0].length,
        type: "quote",
        rawOpen: '"',
        rawClose: '"',
        content: straightQuoteMatch[1],
      });
    }

    // 3. Smart/Curly Double Quotes: “dialogue”
    const curlyQuoteMatch = /“([^”\n]+)”/.exec(remaining);
    if (curlyQuoteMatch && curlyQuoteMatch.index !== undefined) {
      candidates.push({
        startIndex: curlyQuoteMatch.index,
        endIndex: curlyQuoteMatch.index + curlyQuoteMatch[0].length,
        type: "quote",
        rawOpen: "“",
        rawClose: "”",
        content: curlyQuoteMatch[1],
      });
    }

    // 4. Bold-Italic: ***text*** or ___text___
    const boldItalicMatch = /(\*\*\*|___)(?!\s)([^\n]+?)(?<!\s)\1/.exec(remaining);
    if (boldItalicMatch && boldItalicMatch.index !== undefined) {
      candidates.push({
        startIndex: boldItalicMatch.index,
        endIndex: boldItalicMatch.index + boldItalicMatch[0].length,
        type: "boldItalic",
        content: boldItalicMatch[2],
      });
    }

    // 5. Bold: **text** or __text__
    const boldMatch = /(\*\*|__)(?!\s)([^\n]+?)(?<!\s)\1/.exec(remaining);
    if (boldMatch && boldMatch.index !== undefined) {
      candidates.push({
        startIndex: boldMatch.index,
        endIndex: boldMatch.index + boldMatch[0].length,
        type: "bold",
        content: boldMatch[2],
      });
    }

    // 6. Strikethrough: ~~text~~
    const strikeMatch = /~~(?!\s)([^\n]+?)(?<!\s)~~/.exec(remaining);
    if (strikeMatch && strikeMatch.index !== undefined) {
      candidates.push({
        startIndex: strikeMatch.index,
        endIndex: strikeMatch.index + strikeMatch[0].length,
        type: "strikethrough",
        content: strikeMatch[1],
      });
    }

    // 7. Italic: *text* (avoid matching within words for single underscore _word_)
    const starItalicMatch = /\*(?!\s)([^*\n]+?)(?<!\s)\*/.exec(remaining);
    if (starItalicMatch && starItalicMatch.index !== undefined) {
      candidates.push({
        startIndex: starItalicMatch.index,
        endIndex: starItalicMatch.index + starItalicMatch[0].length,
        type: "italic",
        content: starItalicMatch[1],
      });
    }

    const underscoreItalicMatch = /(?:^|[\s(])_([^\s_\n]|(?:[^\s_\n][^\n]*?[^\s_\n]))_(?=[\s),.!?:;]|$)/.exec(remaining);
    if (underscoreItalicMatch && underscoreItalicMatch.index !== undefined) {
      // account for leading character if matched via group
      const offset = underscoreItalicMatch[0].startsWith("_") ? 0 : 1;
      const start = underscoreItalicMatch.index + offset;
      const rawLen = underscoreItalicMatch[1].length + 2; // + 2 for enclosing '_'
      candidates.push({
        startIndex: start,
        endIndex: start + rawLen,
        type: "italic",
        content: underscoreItalicMatch[1],
      });
    }

    if (candidates.length === 0) {
      // No more formatting tags found, process plain text with newlines
      appendPlainTextWithLinebreaks(nodes, remaining);
      break;
    }

    // Pick candidate with earliest startIndex. If tie, pick longer length (e.g. boldItalic before bold before italic)
    candidates.sort((a, b) => {
      if (a.startIndex !== b.startIndex) return a.startIndex - b.startIndex;
      return (b.endIndex - b.startIndex) - (a.endIndex - a.startIndex);
    });

    const best = candidates[0];

    // Push any preceding text
    if (best.startIndex > 0) {
      const before = remaining.slice(0, best.startIndex);
      appendPlainTextWithLinebreaks(nodes, before);
    }

    // Push token
    switch (best.type) {
      case "inlineCode":
        nodes.push({ type: "inlineCode", code: best.content });
        break;
      case "quote":
        nodes.push({
          type: "quote",
          rawOpen: best.rawOpen ?? '"',
          rawClose: best.rawClose ?? '"',
          children: parseInline(best.content),
        });
        break;
      case "boldItalic":
        nodes.push({
          type: "boldItalic",
          children: parseInline(best.content),
        });
        break;
      case "bold":
        nodes.push({
          type: "bold",
          children: parseInline(best.content),
        });
        break;
      case "italic":
        nodes.push({
          type: "italic",
          children: parseInline(best.content),
        });
        break;
      case "strikethrough":
        nodes.push({
          type: "strikethrough",
          children: parseInline(best.content),
        });
        break;
    }

    remaining = remaining.slice(best.endIndex);
  }

  return nodes;
}

function appendPlainTextWithLinebreaks(nodes: InlineNode[], text: string) {
  if (!text) return;
  const lines = text.split("\n");
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].length > 0) {
      nodes.push({ type: "text", value: lines[i] });
    }
    if (i < lines.length - 1) {
      nodes.push({ type: "linebreak" });
    }
  }
}

/**
 * Parse full markdown document/message string into BlockNodes.
 */
export function parseMarkdown(raw: string): BlockNode[] {
  if (!raw) return [];

  const blocks: BlockNode[] = [];
  const lines = raw.replace(/\r\n|\r/g, "\n").split("\n");
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // 1. Fenced Code Block: ```[lang]
    const codeFenceMatch = line.match(/^```(\w*)/);
    if (codeFenceMatch) {
      const language = codeFenceMatch[1] || undefined;
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      // Skip closing fence if present
      if (i < lines.length && lines[i].startsWith("```")) {
        i++;
      }
      blocks.push({
        type: "codeBlock",
        code: codeLines.join("\n"),
        language,
      });
      continue;
    }

    // 2. Empty line: skip
    if (line.trim().length === 0) {
      i++;
      continue;
    }

    // 3. Blockquote: > text
    if (line.startsWith(">")) {
      const quoteLines: string[] = [];
      while (i < lines.length && lines[i].startsWith(">")) {
        quoteLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      blocks.push({
        type: "blockquote",
        children: parseInline(quoteLines.join("\n")),
      });
      continue;
    }

    // 4. Unordered List: - item, * item, + item
    const ulMatch = line.match(/^([*\-+])\s+(.+)$/);
    if (ulMatch) {
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^([*\-+])\s+(.+)$/);
        if (!itemMatch) break;
        items.push(parseInline(itemMatch[2]));
        i++;
      }
      blocks.push({
        type: "list",
        ordered: false,
        items,
      });
      continue;
    }

    // 5. Ordered List: 1. item, 2. item
    const olMatch = line.match(/^(\d+)\.\s+(.+)$/);
    if (olMatch) {
      const items: InlineNode[][] = [];
      while (i < lines.length) {
        const itemMatch = lines[i].match(/^(\d+)\.\s+(.+)$/);
        if (!itemMatch) break;
        items.push(parseInline(itemMatch[2]));
        i++;
      }
      blocks.push({
        type: "list",
        ordered: true,
        items,
      });
      continue;
    }

    // 6. Regular Paragraph: gather lines until empty line or block marker
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim().length > 0 &&
      !lines[i].startsWith("```") &&
      !lines[i].startsWith(">") &&
      !lines[i].match(/^[*\-+]\s+/) &&
      !lines[i].match(/^\d+\.\s+/)
    ) {
      paraLines.push(lines[i]);
      i++;
    }

    if (paraLines.length > 0) {
      blocks.push({
        type: "paragraph",
        children: parseInline(paraLines.join("\n")),
      });
    }
  }

  return blocks;
}

/**
 * Render inline AST nodes into React nodes.
 */
export function renderInlineNodes(nodes: InlineNode[], keyPrefix = "inl"): React.ReactNode[] {
  return nodes.map((node, index) => {
    const key = `${keyPrefix}-${index}`;
    switch (node.type) {
      case "text":
        return <span key={key}>{node.value}</span>;
      case "linebreak":
        return <br key={key} />;
      case "inlineCode":
        return (
          <code key={key} className="inline-code">
            {node.code}
          </code>
        );
      case "quote":
        return (
          <span key={key} className="quote-text">
            {node.rawOpen}
            {renderInlineNodes(node.children, `${key}-q`)}
            {node.rawClose}
          </span>
        );
      case "boldItalic":
        return (
          <strong key={key}>
            <em>{renderInlineNodes(node.children, `${key}-bi`)}</em>
          </strong>
        );
      case "bold":
        return <strong key={key}>{renderInlineNodes(node.children, `${key}-b`)}</strong>;
      case "italic":
        return <em key={key}>{renderInlineNodes(node.children, `${key}-i`)}</em>;
      case "strikethrough":
        return <del key={key}>{renderInlineNodes(node.children, `${key}-s`)}</del>;
      default:
        return null;
    }
  });
}
