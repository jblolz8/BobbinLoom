import { useEffect, useMemo, useState } from "react";
import { computeLineDiff } from "../../engine/diff";
import { Button, Icon } from "../base";
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

const QUICK_SUGGESTIONS = [
  "Make personality more detailed",
  "Keep original dialogue examples",
  "Format inventory as bullets",
  "Preserve key backstory points",
];

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
  const [paneViewMode, setPaneViewMode] = useState<"split" | "left" | "right">("split");

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !loading) {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [loading, onClose]);

  const addedCount = diffLines.filter((l) => l.type === "added").length;
  const removedCount = diffLines.filter((l) => l.type === "removed").length;
  const isReadOnly = !onAccept && !onRetry;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !loading) onClose(); }}>
      <section className="modal diff-modal" aria-labelledby="diff-modal-title">
        <header className="modal-header diff-modal-header">
          <div className="diff-modal-title-wrap">
            <div className="diff-modal-title-row">
              <span className="diff-modal-icon-badge">
                <Icon name="Sparkles" size={18} />
              </span>
              <h2 id="diff-modal-title">{title}</h2>
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

          <div className="diff-header-right-actions">
            {/* View Mode Toggle */}
            <div className="diff-pane-toggle-group" role="tablist" aria-label="Diff View Mode">
              <button
                type="button"
                className={`diff-pane-toggle-btn ${paneViewMode === "split" ? "active" : ""}`}
                onClick={() => setPaneViewMode("split")}
                title="View side-by-side comparison"
              >
                <Icon name="Columns" size={12} />
                <span>Split</span>
              </button>
              <button
                type="button"
                className={`diff-pane-toggle-btn ${paneViewMode === "right" ? "active" : ""}`}
                onClick={() => setPaneViewMode("right")}
                title={`View only ${newLabel}`}
              >
                <span>{newLabel}</span>
              </button>
              <button
                type="button"
                className={`diff-pane-toggle-btn ${paneViewMode === "left" ? "active" : ""}`}
                onClick={() => setPaneViewMode("left")}
                title={`View only ${oldLabel}`}
              >
                <span>{oldLabel}</span>
              </button>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              iconOnly
              className="diff-close-btn"
              onClick={onClose}
              disabled={loading}
              aria-label="Close modal"
              title="Close modal"
            >
              <Icon name="X" size={16} />
            </Button>
          </div>
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
            viewMode={paneViewMode}
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
              <Button variant="primary" onClick={onClose}>Close</Button>
            </div>
          </footer>
        ) : (
          <footer className="diff-footer">
            <div className="diff-footer-left">
              <div className="diff-feedback-label">
                <div className="diff-feedback-header-row">
                  <span className="diff-feedback-title">
                    <Icon name="MessageSquare" size={13} /> Guidance for AI retry (optional)
                  </span>
                  {feedback.trim() && !loading && (
                    <button
                      type="button"
                      className="diff-feedback-clear-btn"
                      onClick={() => setFeedback("")}
                      title="Clear guidance input"
                    >
                      Clear
                    </button>
                  )}
                </div>
                <textarea
                  rows={2}
                  value={feedback}
                  onChange={(e) => setFeedback(e.target.value)}
                  placeholder="e.g. Focus more on personality quirks, make appearance description more detailed, format inventory items as bullet points..."
                  disabled={loading}
                  className="diff-feedback-textarea"
                />
                <div className="diff-presets-row">
                  <span className="diff-presets-label">Suggestions:</span>
                  <div className="diff-presets-list">
                    {QUICK_SUGGESTIONS.map((suggestion) => (
                      <button
                        key={suggestion}
                        type="button"
                        className="diff-preset-chip-btn"
                        disabled={loading}
                        onClick={() => {
                          setFeedback((prev) => {
                            const trimmed = prev.trim();
                            if (!trimmed) return suggestion;
                            if (trimmed.includes(suggestion)) return prev;
                            return `${trimmed}, ${suggestion.toLowerCase()}`;
                          });
                        }}
                      >
                        + {suggestion}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="diff-footer-right">
              <Button
                type="button"
                variant="secondary"
                onClick={onClose}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => onRetry?.(feedback)}
                disabled={loading}
                leftIcon={<Icon name={loading ? "Sparkles" : "RotateCcw"} size={14} className={loading ? "sparkle-pulse" : ""} />}
                title="Regenerate BL character sheet with optional feedback"
              >
                {loading ? "Retrying…" : "Retry with Feedback"}
              </Button>
              <Button
                type="button"
                variant="primary"
                onClick={onAccept}
                disabled={loading}
                leftIcon={<Icon name="Check" size={15} />}
              >
                Accept &amp; Apply
              </Button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}