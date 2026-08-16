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

const GUIDANCE_PRESETS = [
  { label: "🎭 Personality Focus", text: "Focus more on personality traits, demeanor, and behavioral quirks" },
  { label: "👗 Detailed Appearance", text: "Make appearance, outfit, and physical descriptions more detailed" },
  { label: "📋 Bulleted Stats", text: "Format inventory, weapons, and abilities clearly with bullet points" },
  { label: "📖 Expand Lore", text: "Expand on background lore, origin, and relationship notes" },
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

  const addedCount = diffLines.filter((l) => l.type === "added").length;
  const removedCount = diffLines.filter((l) => l.type === "removed").length;
  const isReadOnly = !onAccept && !onRetry;

  function handleApplyPreset(presetText: string) {
    setFeedback((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return presetText;
      if (trimmed.includes(presetText)) return prev;
      return `${trimmed}; ${presetText}`;
    });
  }

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

            <button
              type="button"
              className="diff-close-btn"
              onClick={onClose}
              disabled={loading}
              title="Close modal"
              aria-label="Close modal"
            >
              <Icon name="X" size={16} />
            </button>
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
              <button className="primary" onClick={onClose}>Close</button>
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

                {/* Quick Guidance Presets */}
                <div className="diff-presets-row">
                  <span className="diff-presets-label">Quick Ideas:</span>
                  <div className="diff-presets-list">
                    {GUIDANCE_PRESETS.map((preset) => (
                      <button
                        key={preset.label}
                        type="button"
                        className="diff-preset-chip-btn"
                        onClick={() => handleApplyPreset(preset.text)}
                        disabled={loading}
                        title={`Add "${preset.text}" to guidance`}
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="diff-footer-right">
              <button
                type="button"
                onClick={onClose}
                disabled={loading}
                className="diff-cancel-btn"
              >
                Cancel
              </button>
              <button
                type="button"
                className="diff-retry-btn"
                onClick={() => onRetry?.(feedback)}
                disabled={loading}
                title="Regenerate BL character sheet with optional feedback"
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
                <Icon name="Check" size={15} /> Accept &amp; Apply
              </button>
            </div>
          </footer>
        )}
      </section>
    </div>
  );
}