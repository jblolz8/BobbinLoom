import { useMemo } from "react";
import { computeTwoPaneDiff, type DiffPaneRow } from "../../engine/diff";

export type TwoPaneDiffProps = {
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
  className?: string;
  viewMode?: "split" | "left" | "right";
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
}: TwoPaneDiffProps) {
  const rows = useMemo(
    () => computeTwoPaneDiff(leftContent, rightContent),
    [leftContent, rightContent]
  );

  return (
    <div className={`two-pane-diff-scroll diff-mode-${viewMode} ${className ?? ""}`}>
      <div className={`two-pane-diff diff-mode-${viewMode}`}>
        <div className={`two-pane-diff-header diff-mode-${viewMode}`}>
          {(viewMode === "split" || viewMode === "left") && (
            <span className="two-pane-diff-label">{leftLabel}</span>
          )}
          {(viewMode === "split" || viewMode === "right") && (
            <span className="two-pane-diff-label">{rightLabel}</span>
          )}
        </div>
        <div className="two-pane-diff-body">
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
}