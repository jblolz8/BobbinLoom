import { useState, type ReactNode } from "react";
import { Icon } from "./Icon";

/** Visual variants of a code surface. The tone only changes colour and type
 *  scale — the block's structure and tokens are identical everywhere. */
export type CodeBlockTone =
  | "default" // prose / docs / chat message
  | "panel" // inside a diagnostic panel (the chat's Debug box)
  | "error" // a failed response's raw payload
  | "muted"; // provenance dumps (the image request/response disclosures)

export interface CodeBlockProps {
  code: string;
  /** Header label. Use this when the content is not a language (e.g. "Request body"). */
  label?: string;
  /** Fenced-code language, used as the header label when `label` is absent. */
  language?: string;
  /** Extra header controls, placed before the copy button (e.g. tab buttons). */
  headerExtra?: ReactNode;
  showCopy?: boolean;
  /** Wrap long lines instead of scrolling sideways. */
  wrap?: boolean;
  /** Cap the height in px; content scrolls inside. */
  maxHeight?: number;
  tone?: CodeBlockTone;
  className?: string;
  copyTitle?: string;
}

/**
 * The ONE code surface. Every place this app shows code or a raw payload renders
 * through here, so a theme's `--code-*` tokens reach all of them at once and a
 * new surface cannot quietly invent its own look.
 *
 * Styling contract: `.code-block` (+ `tone-*`) > `.code-block-header` >
 * `.code-lang-label` / `.code-block-actions` / `.code-copy-btn`, then
 * `.code-block-pre` > `code`. The documentation renderer emits the same classes
 * from an HTML string — keep the two in step (tests/codeBlock.test.ts pins it).
 */
export function CodeBlock({
  code,
  label,
  language,
  headerExtra,
  showCopy = true,
  wrap = false,
  maxHeight,
  tone = "default",
  className = "",
  copyTitle = "Copy code to clipboard"
}: CodeBlockProps) {
  const [copied, setCopied] = useState(false);
  const headerText = label ?? language ?? "";
  const showHeader = Boolean(headerText || headerExtra || showCopy);

  function handleCopy() {
    void navigator.clipboard.writeText(code);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className={`code-block tone-${tone}${className ? ` ${className}` : ""}`}>
      {showHeader ? (
        <div className="code-block-header">
          {headerText ? <span className="code-lang-label">{headerText}</span> : <span />}
          <div className="code-block-actions">
            {headerExtra}
            {showCopy ? (
              <button
                type="button"
                className="code-copy-btn"
                onClick={handleCopy}
                title={copyTitle}
                aria-label={copyTitle}
              >
                <Icon name={copied ? "Check" : "Copy"} size={13} />
                <span>{copied ? "Copied" : "Copy"}</span>
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
      <pre
        className={`code-block-pre${wrap ? " wrap" : ""}`}
        style={maxHeight ? { maxHeight } : undefined}
      >
        <code>{code}</code>
      </pre>
    </div>
  );
}
