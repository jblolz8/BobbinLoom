import { useMemo, useState } from "react";
import { computeLineDiff } from "../../engine/diff";
import { TwoPaneDiff } from "./TwoPaneDiff";

export type DiffModalProps = {
  title: string;
  oldLabel: string;
  newLabel: string;
  oldContent: string;
  newContent: string;
  onAccept?: () => void;
  onRetry?: (feedback: string) => void;
  onClose: () => void;
  loading?: boolean;
  error?: string | null;
};

export function DiffModal({
  title,
  oldLabel,
  newLabel,
  oldContent,
  newContent,
  onAccept,
  onRetry,
  onClose,
  loading = false,
  error = null,
}: DiffModalProps) {
  const diffLines = useMemo(
    () => computeLineDiff(oldContent, newContent),
    [oldContent, newContent]
  );

  const [feedback, setFeedback] = useState("");

  const addedCount = diffLines.filter((l) => l.type === "added").length;
  const removedCount = diffLines.filter((l) => l.type === "removed").length;
  const isReadOnly = !onAccept && !onRetry;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal diff-modal">
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>
              <span className="diff-stat added">+{addedCount} added</span>
              {" "}
              <span className="diff-stat removed">{removedCount} removed</span>
            </p>
          </div>
          <button onClick={onClose} disabled={loading}>Close</button>
        </header>

        {error ? <p className="status-error">{error}</p> : null}

        <TwoPaneDiff
          leftLabel={oldLabel}
          rightLabel={newLabel}
          leftContent={oldContent}
          rightContent={newContent}
        />

        {isReadOnly ? (
          <footer className="diff-footer">
            <div className="diff-footer-left">
              <span className="diff-readonly-note">Read-only comparison</span>
            </div>
            <div className="diff-footer-right">
              <button onClick={onClose}>Close</button>
            </div>
          </footer>
        ) : (
          <footer className="diff-footer">
            <div className="diff-footer-left">
              <label className="editor-field">
                <span className="editor-field-label">Feedback for retry (optional)</span>
                <textarea
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Make the character more shy, add more detail to the Appearance section..."
                  disabled={loading}
                />
              </label>
            </div>
            <div className="diff-footer-right">
              <button onClick={onClose} disabled={loading}>Cancel</button>
              <button onClick={() => onRetry?.(feedback)} disabled={loading}>
                {loading ? "Generating…" : "Retry"}
              </button>
              <button className="primary" onClick={onAccept} disabled={loading}>
                {loading ? "Saving…" : "Accept & Apply"}
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}