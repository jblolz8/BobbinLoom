export type DiffLineType = "same" | "added" | "removed";

export interface DiffLine {
  type: DiffLineType;
  content: string;
  oldLineNumber?: number;
  newLineNumber?: number;
}

/**
 * Compute a line-by-line diff using Longest Common Subsequence (LCS).
 * Returns an array of DiffLine with type annotations for rendering.
 */
export function computeLineDiff(oldText: string, newText: string): DiffLine[] {
  // An empty string means "no lines", not one empty line — otherwise an empty
  // source yields a spurious leading removed "" (and empty target an added "").
  const oldLines = oldText === "" ? [] : oldText.split("\n");
  const newLines = newText === "" ? [] : newText.split("\n");

  // Compute LCS indices into oldLines
  const lcsIndices = computeLCS(oldLines, newLines);

  const result: DiffLine[] = [];
  let oi = 0;
  let ni = 0;
  let li = 0;

  while (oi < oldLines.length || ni < newLines.length) {
    if (li < lcsIndices.length && oi === lcsIndices[li]) {
      // This old line is in LCS → find matching new line
      const oldLine = oldLines[oi];
      while (ni < newLines.length && newLines[ni] !== oldLine) {
        result.push({ type: "added", content: newLines[ni], newLineNumber: ni + 1 });
        ni++;
      }
      if (ni < newLines.length) {
        result.push({
          type: "same",
          content: oldLine,
          oldLineNumber: oi + 1,
          newLineNumber: ni + 1,
        });
        ni++;
      }
      oi++;
      li++;
    } else {
      if (oi < oldLines.length) {
        result.push({ type: "removed", content: oldLines[oi], oldLineNumber: oi + 1 });
        oi++;
      } else {
        break; // no more old lines — trailing loop handles remaining new lines
      }
    }
  }

  // Remaining new lines
  while (ni < newLines.length) {
    result.push({ type: "added", content: newLines[ni], newLineNumber: ni + 1 });
    ni++;
  }

  return result;
}

/** Compute indices into `a` that form an LCS with `b`. Simple O(n*m) DP. */
function computeLCS(a: string[], b: string[]): number[] {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));

  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      if (a[i - 1] === b[j - 1]) {
        dp[i][j] = dp[i - 1][j - 1] + 1;
      } else {
        dp[i][j] = Math.max(dp[i - 1][j], dp[i][j - 1]);
      }
    }
  }

  // Backtrack to find indices in `a` that are in the LCS
  const result: number[] = [];
  let i = m;
  let j = n;
  while (i > 0 && j > 0) {
    if (a[i - 1] === b[j - 1]) {
      result.unshift(i - 1);
      i--;
      j--;
    } else if (dp[i - 1][j] >= dp[i][j - 1]) {
      i--;
    } else {
      j--;
    }
  }
  return result;
}

export type DiffPaneCell = {
  content: string;
  type: "same" | "added" | "removed";
  lineNumber?: number;
} | null;

export type DiffPaneRow = {
  left: DiffPaneCell;
  right: DiffPaneCell;
};

/** Convert unified LCS diff lines into aligned two-pane rows. Consecutive
 *  removed→added runs are paired so a "modified" line shows old (left) against
 *  new (right) on the same row; pure deletions and insertions occupy one side. */
export function computeTwoPaneDiff(oldText: string, newText: string): DiffPaneRow[] {
  const lines = computeLineDiff(oldText, newText);
  const rows: DiffPaneRow[] = [];
  let i = 0;
  while (i < lines.length) {
    const l = lines[i];
    if (l.type === "same") {
      rows.push({
        left: { content: l.content, type: "same", lineNumber: l.oldLineNumber },
        right: { content: l.content, type: "same", lineNumber: l.newLineNumber },
      });
      i++;
      continue;
    }
    if (l.type === "removed") {
      // Collect the removed run and any immediately-following added run.
      const removed: DiffPaneCell[] = [];
      while (i < lines.length && lines[i].type === "removed") {
        removed.push({ content: lines[i].content, type: "removed", lineNumber: lines[i].oldLineNumber });
        i++;
      }
      const added: DiffPaneCell[] = [];
      while (i < lines.length && lines[i].type === "added") {
        added.push({ content: lines[i].content, type: "added", lineNumber: lines[i].newLineNumber });
        i++;
      }
      const max = Math.max(removed.length, added.length);
      for (let k = 0; k < max; k++) {
        rows.push({ left: removed[k] ?? null, right: added[k] ?? null });
      }
      continue;
    }
    // added with no preceding removed
    while (i < lines.length && lines[i].type === "added") {
      rows.push({
        left: null,
        right: { content: lines[i].content, type: "added", lineNumber: lines[i].newLineNumber },
      });
      i++;
    }
  }
  return rows;
}