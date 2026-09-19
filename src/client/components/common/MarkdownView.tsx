import React, { useMemo } from "react";
import { parseMarkdown, renderInlineNodes, type BlockNode } from "../../utils/markdown";
import { CodeBlock } from "../base";

export interface MarkdownViewProps {
  content: string;
  className?: string;
}

export const MarkdownView = React.memo(function MarkdownView({
  content,
  className = "",
}: MarkdownViewProps) {
  const blocks = useMemo(() => parseMarkdown(content), [content]);

  if (blocks.length === 0) {
    return null;
  }

  return (
    <div className={`message-markdown ${className}`.trim()}>
      {blocks.map((block: BlockNode, index: number) => {
        switch (block.type) {
          case "paragraph":
            return (
              <p key={`block-${index}`} className="message-paragraph">
                {renderInlineNodes(block.children, `p-${index}`)}
              </p>
            );

          case "blockquote":
            return (
              <blockquote key={`block-${index}`} className="message-blockquote">
                {renderInlineNodes(block.children, `bq-${index}`)}
              </blockquote>
            );

          case "heading": {
            // A reply's headings are a reader's signposts, not document structure: an h1 in a chat
            // bubble would outrank the panel title, so they render three steps down.
            const HeadingTag = block.level <= 2 ? "h3" : block.level <= 4 ? "h4" : "h5";
            return (
              <HeadingTag
                key={`block-${index}`}
                className={`message-heading message-heading--${block.level}`}
              >
                {renderInlineNodes(block.children, `h-${index}`)}
              </HeadingTag>
            );
          }

          case "list":
            if (block.ordered) {
              return (
                <ol key={`block-${index}`} className="message-list message-ordered-list">
                  {block.items.map((item, itemIdx) => (
                    <li key={`li-${itemIdx}`}>
                      {renderInlineNodes(item, `ol-${index}-${itemIdx}`)}
                    </li>
                  ))}
                </ol>
              );
            }
            return (
              <ul key={`block-${index}`} className="message-list message-unordered-list">
                {block.items.map((item, itemIdx) => (
                  <li key={`li-${itemIdx}`}>
                    {renderInlineNodes(item, `ul-${index}-${itemIdx}`)}
                  </li>
                ))}
              </ul>
            );

          case "codeBlock":
            return (
              <CodeBlock
                key={`block-${index}`}
                code={block.code}
                language={block.language}
              />
            );

          default:
            return null;
        }
      })}
    </div>
  );
});

export default MarkdownView;
