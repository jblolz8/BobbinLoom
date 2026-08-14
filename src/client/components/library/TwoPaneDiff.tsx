import { useMemo } from "react";
import { computeTwoPaneDiff, type DiffPaneRow } from "../../engine/diff";

export type TwoPaneDiffProps = {
  leftLabel: string;
  rightLabel: string;
  leftContent: string;
  rightContent: string;
  className?: string;
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
}: TwoPaneDiffProps) {
  const rows = useMemo(
    () => computeTwoPaneDiff(leftContent, rightContent),
    [leftContent, rightContent]
  );
  return (
    <div className={`two-pane-diff ${className ?? ""}`}>
      <div className="two-pane-diff-header">
        <span className="two-pane-diff-label">{leftLabel}</span>
        <span className="two-pane-diff-label">{rightLabel}</span>
      </div>
      <div className="two-pane-diff-body">
        {rows.map((row, i) => (
          <div className="two-pane-diff-row" key={i}>
            <Cell cell={row.left} />
            <Cell cell={row.right} />
          </div>
        ))}
      </div>
    </div>
  );
}