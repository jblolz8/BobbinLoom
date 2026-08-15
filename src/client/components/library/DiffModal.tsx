import { useMemo, useState } from "react";
import { computeLineDiff } from "../../engine/diff";
import { Icon } from "../base";
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
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <section className="modal diff-modal">
        <header className="modal-header diff-modal-header">
          <div className="diff-modal-title-wrap">
            <div className="diff-modal-title-row">
              <span className="diff-modal-icon-badge">
                <Icon name="Sparkles" size={18} />
              </span>
              <h2>{title}</h2>
            </div>
            <div className="diff-stats-pills">
              <span className="diff-stat-pill added">
                <Icon name="Plus" size={12} /> {addedCount} added
              </span>
              <span className="diff-stat-pill removed">
                <Icon name="Minus" size={12} /> {removedCount} removed
              </span>
              {isReadOnly ? (
                <span className="diff-stat-pill readonly">Read-Only</span>
              ) : null}
            </div>
          </div>
          <button
            type="button"
            className="diff-close-btn"
            onClick={onClose}
            disabled={loading}
            title="Close modal"
          >
            <Icon name="X" size={16} />
          </button>
        </header>

        {/* Active AI Retry / Generation Status Banner */}
        {loading ? (
          <div className="diff-retry-status-banner">
            <span className="diff-retry-spinner">
              <Icon name="Sparkles" size={17} className="sparkle-pulse" />
            </span>
            <div className="diff-retry-status-text">
              <strong>Regenerating BL format with AI…</strong>
              {feedback.trim() ? (
                <span className="diff-retry-feedback-quote">
                  Applying guidance: &ldquo;{feedback.trim()}&rdquo;
                </span>
              ) : (
                <span className="diff-retry-feedback-quote">
                  Generating updated character sheet…
                </span>
              )}
            </div>
          </div>
        ) : null}

        {error ? (
          <div className="diff-error-banner">
            <Icon name="AlertCircle" size={16} />
            <span>{error}</span>
          </div>
        ) : null}

        <div className={`diff-viewer-wrapper ${loading ? "is-loading" : ""}`}>
          <TwoPaneDiff
            leftLabel={oldLabel}
            rightLabel={newLabel}
            leftContent={oldContent}
            rightContent={newContent}
          />
          {loading ? (
            <div className="diff-loading-overlay">
              <div className="diff-loading-card">
                <Icon name="Sparkles" size={24} className="sparkle-pulse" />
                <span>AI Generation in progress…</span>
              </div>
            </div>
          ) : null}
        </div>

        {isReadOnly ? (
          <footer className="diff-footer">
            <div className="diff-footer-left">
              <span className="diff-readonly-note">
                <Icon name="FileText" size={14} /> Comparing original CCv2 card with converted BobbinLoom sheet.
              </span>
            </div>
            <div className="diff-footer-right">
              <button className="primary" onClick={onClose}>Close</button>
            </div>
          </footer>
        ) : (
          <footer className="diff-footer">
            <div className="diff-footer-left">
              <label className="diff-feedback-label">
                <span className="diff-feedback-title">
                  <Icon name="MessageSquare" size={14} /> Guidance for AI retry (optional)
                </span>
                <textarea
                  rows={3}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Focus more on personality quirks, make appearance description more detailed, format inventory items as bullet points..."
                  disabled={loading}
                  className="diff-feedback-textarea"
                />
                <span className="diff-feedback-hint">
                  Tip: Provide specific instructions on what to change or improve before clicking Retry.
                </span>
              </label>
            </div>
            <div className="diff-footer-right">
              <button type="button" onClick={onClose} disabled={loading} className="diff-cancel-btn">
                Cancel
              </button>
              <button
                type="button"
                className="diff-retry-btn"
                onClick={() => onRetry?.(feedback)}
                disabled={loading}
              >
                {loading ? (
                  <>
                    <Icon name="Sparkles" size={14} className="sparkle-pulse" /> Retrying…
                  </>
                ) : (
                  <>
                    <Icon name="RotateCcw" size={14} /> Retry with Feedback
                  </>
                )}
              </button>
              <button
                type="button"
                className="diff-accept-btn"
                onClick={onAccept}
                disabled={loading}
              >
                <Icon name="Check" size={15} /> Accept & Apply
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}