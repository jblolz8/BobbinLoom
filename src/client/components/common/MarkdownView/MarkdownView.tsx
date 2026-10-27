import React, { useMemo } from "react";
import {
  parseMarkdown,
  renderInlineNodes,
  type BlockNode,
} from "../../../utils/markdown";
import { CodeBlock } from "../../base";
import "./MarkdownView.css";

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
                {block.paragraphs && block.paragraphs.length > 1
                  ? block.paragraphs.map((para, pIdx) => (
                      <p key={`bq-p-${pIdx}`}>
                        {renderInlineNodes(para, `bq-${index}-${pIdx}`)}
                      </p>
                    ))
                  : renderInlineNodes(block.children, `bq-${index}`)}
              </blockquote>
            );

          case "hr":
            return <hr key={`block-${index}`} className="message-hr" />;

          case "heading": {
            // A reply's headings are a reader's signposts, not document structure: an h1 in a chat
            // bubble would outrank the panel title, so they render three steps down.
            const HeadingTag =
              block.level <= 2 ? "h3" : block.level <= 4 ? "h4" : "h5";
            return (
              <HeadingTag
                key={`block-${index}`}
                className={`message-heading message-heading--${block.level}`}
              >
                {renderInlineNodes(block.children, `h-${index}`)}
              </HeadingTag>
            );
          }

          case "list": {
            const ListTag = block.ordered ? "ol" : "ul";
            const listKindClass = block.ordered
              ? "message-ordered-list"
              : "message-unordered-list";
            const prefix = block.ordered ? "ol" : "ul";
            return (
              <ListTag
                key={`block-${index}`}
                className={`message-list ${listKindClass}`}
              >
                {block.items.map((item, itemIdx) => {
                  const nested = block.sublists?.[itemIdx];
                  return (
                    <li key={`li-${itemIdx}`}>
                      {renderInlineNodes(item, `${prefix}-${index}-${itemIdx}`)}
                      {nested && nested.length > 0
                        ? nested.map((sub, subIdx) => {
                            const SubTag = sub.ordered ? "ol" : "ul";
                            const subKindClass = sub.ordered
                              ? "message-ordered-list"
                              : "message-unordered-list";
                            return (
                              <SubTag
                                key={`sub-${itemIdx}-${subIdx}`}
                                className={`message-list message-sublist ${subKindClass}`}
                              >
                                {sub.items.map((subItem, sItemIdx) => (
                                  <li key={`sli-${sItemIdx}`}>
                                    {renderInlineNodes(
                                      subItem,
                                      `${prefix}-${index}-${itemIdx}-sub-${subIdx}-${sItemIdx}`,
                                    )}
                                  </li>
                                ))}
                              </SubTag>
                            );
                          })
                        : null}
                    </li>
                  );
                })}
              </ListTag>
            );
          }

          case "table":
            return (
              <div key={`block-${index}`} className="message-table-wrap">
                <table className="message-table">
                  <thead>
                    <tr>
                      {block.headers.map((headerCells, colIdx) => {
                        const align = block.alignments[colIdx] ?? undefined;
                        return (
                          <th
                            key={`th-${colIdx}`}
                            style={align ? { textAlign: align } : undefined}
                          >
                            {renderInlineNodes(
                              headerCells,
                              `th-${index}-${colIdx}`,
                            )}
                          </th>
                        );
                      })}
                    </tr>
                  </thead>
                  {block.rows.length > 0 ? (
                    <tbody>
                      {block.rows.map((row, rowIdx) => (
                        <tr key={`tr-${rowIdx}`}>
                          {row.map((cellNodes, colIdx) => {
                            const align = block.alignments[colIdx] ?? undefined;
                            return (
                              <td
                                key={`td-${colIdx}`}
                                style={align ? { textAlign: align } : undefined}
                              >
                                {renderInlineNodes(
                                  cellNodes,
                                  `td-${index}-${rowIdx}-${colIdx}`,
                                )}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  ) : null}
                </table>
              </div>
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
