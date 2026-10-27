import { useMemo, type ReactNode } from "react";
import { computeTwoPaneDiff, type DiffPaneRow } from "../../../engine/diff";
import "./TwoPaneDiff.css";

export type TwoPaneDiffSize = "sm" | "md" | "lg" | "fill";

export type TwoPaneDiffProps = {
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
  className?: string;
  viewMode?: "split" | "left" | "right";
  size?: TwoPaneDiffSize;
  /**
   * When `size="fill"` inside a scrollable parent container, forces the diff viewer
   * to occupy 100% of the parent container's viewport height (`flex: 0 0 100%; height: 100%`)
   * so scrolling to the bottom of the parent shows the diff across the entire view.
   * When false (default), `size="fill"` uses `flex: 1 1 0` to take remaining space without overflowing.
   */
  fullViewportHeight?: boolean;
  loading?: boolean;
  loadingContent?: ReactNode;
};

function Cell({ cell }: { cell: DiffPaneRow["left"] }) {
  if (!cell) return <div className="diff-cell diff-cell-empty" />;
  const num = cell.lineNumber ?? "";
  return (
    <div className={`diff-cell diff-cell-${cell.type}`}>
      <span className="diff-cell-num">{num}</span>
      <span className="diff-cell-content">{cell.content || "\u00A0"}</span>
    </div>
  );
}

export function TwoPaneDiff({
  leftLabel,
  rightLabel,
  leftContent,
  rightContent,
  className,
  viewMode = "split",
  size = "lg",
  fullViewportHeight = false,
  loading = false,
  loadingContent,
}: TwoPaneDiffProps) {
  const rows = useMemo(
    () => computeTwoPaneDiff(leftContent, rightContent),
    [leftContent, rightContent],
  );

  const fillClass =
    size === "fill"
      ? fullViewportHeight
        ? "two-pane-diff--fill two-pane-diff--fill-viewport"
        : "two-pane-diff--fill"
      : "";

  const diffScroll = (
    <div
      className={`two-pane-diff-scroll diff-mode-${viewMode} ${!loading && !loadingContent ? fillClass : ""} ${className ?? ""}`.trim()}
    >
      <div className={`two-pane-diff diff-mode-${viewMode}`}>
        <div className={`two-pane-diff-header diff-mode-${viewMode}`}>
          {(viewMode === "split" || viewMode === "left") && (
            <span className="two-pane-diff-label">{leftLabel}</span>
          )}
          {(viewMode === "split" || viewMode === "right") && (
            <span className="two-pane-diff-label">{rightLabel}</span>
          )}
        </div>
        <div className={`two-pane-diff-body two-pane-diff-body--${size}`}>
          {rows.map((row, i) => {
            if (viewMode === "left") {
              if (!row.left && !row.right) return null;
              return (
                <div className="two-pane-diff-row single-pane" key={i}>
                  <Cell cell={row.left} />
                </div>
              );
            }
            if (viewMode === "right") {
              if (!row.left && !row.right) return null;
              return (
                <div className="two-pane-diff-row single-pane" key={i}>
                  <Cell cell={row.right} />
                </div>
              );
            }
            return (
              <div className="two-pane-diff-row" key={i}>
                <Cell cell={row.left} />
                <Cell cell={row.right} />
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );

  if (!loading && !loadingContent) {
    return diffScroll;
  }

  return (
    <div
      className={`two-pane-diff-wrapper ${fillClass} ${loading ? "is-loading" : ""}`.trim()}
    >
      {diffScroll}
      {loading && loadingContent ? (
        <div className="two-pane-diff-loading-overlay">{loadingContent}</div>
      ) : null}
    </div>
  );
}
