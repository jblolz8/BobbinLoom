import { useState } from "react";
import { Button, Icon } from "../base";

export type ImageCompareModalProps = {
  originalSrc: string;
  currentSrc: string;
  characterName: string;
  onRestore: () => void;
  onClose: () => void;
  loading?: boolean;
};

export function ImageCompareModal({
  originalSrc,
  currentSrc,
  characterName,
  onRestore,
  onClose,
  loading = false,
}: ImageCompareModalProps) {
  const [showConfirmRestore, setShowConfirmRestore] = useState(false);
  const [mobileTab, setMobileTab] = useState<"side-by-side" | "original" | "current">("side-by-side");

  function handleRestoreClick() {
    setShowConfirmRestore(true);
  }

  function handleConfirmRestore() {
    setShowConfirmRestore(false);
    onRestore();
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !loading) onClose();
      }}
    >
      <section className="modal image-compare-modal" aria-labelledby="compare-modal-title">
        <header className="modal-header">
          <div className="compare-modal-title-wrap">
            <span className="compare-modal-icon-badge">
              <Icon name="Layers" size={18} />
            </span>
            <div>
              <h3 id="compare-modal-title">Compare Artwork: {characterName}</h3>
              <p className="modal-subtitle">Original CCv2 Artwork vs. Current Custom Portrait</p>
            </div>
          </div>
          <button
            type="button"
            className="diff-close-btn"
            onClick={onClose}
            disabled={loading}
            title="Close dialog"
            aria-label="Close dialog"
          >
            <Icon name="X" size={16} />
          </button>
        </header>

        {/* Mobile Tab Switcher */}
        <div className="image-compare-mobile-tabs" role="tablist">
          <button
            type="button"
            className={`compare-tab-btn ${mobileTab === "side-by-side" ? "active" : ""}`}
            onClick={() => setMobileTab("side-by-side")}
          >
            Side by Side
          </button>
          <button
            type="button"
            className={`compare-tab-btn ${mobileTab === "original" ? "active" : ""}`}
            onClick={() => setMobileTab("original")}
          >
            Original CCv2
          </button>
          <button
            type="button"
            className={`compare-tab-btn ${mobileTab === "current" ? "active" : ""}`}
            onClick={() => setMobileTab("current")}
          >
            Current Portrait
          </button>
        </div>

        <div className={`image-compare-body mode-${mobileTab}`}>
          {/* Left Pane: Original CCv2 */}
          {(mobileTab === "side-by-side" || mobileTab === "original") && (
            <div className="image-compare-pane original-pane">
              <div className="compare-pane-header">
                <span className="pane-badge ccv2-badge">Original CCv2 Artwork</span>
              </div>
              <div className="compare-image-wrap">
                <img src={originalSrc} alt="Original CCv2 artwork" className="compare-image" />
              </div>
            </div>
          )}

          {/* Right Pane: Custom Portrait */}
          {(mobileTab === "side-by-side" || mobileTab === "current") && (
            <div className="image-compare-pane current-pane">
              <div className="compare-pane-header">
                <span className="pane-badge current-badge">Current Custom Portrait</span>
              </div>
              <div className="compare-image-wrap">
                <img src={currentSrc} alt="Current portrait artwork" className="compare-image" />
              </div>
            </div>
          )}
        </div>

        {showConfirmRestore ? (
          <div className="compare-restore-warning">
            <div className="restore-warning-text">
              <Icon name="AlertTriangle" size={15} />
              <span>Are you sure? This will remove your custom portrait and revert back to the original CCv2 card art.</span>
            </div>
            <div className="restore-warning-actions">
              <Button
                variant="secondary"
                size="xs"
                onClick={() => setShowConfirmRestore(false)}
                disabled={loading}
              >
                Cancel
              </Button>
              <Button
                variant="danger"
                size="xs"
                onClick={handleConfirmRestore}
                disabled={loading}
              >
                Confirm Restore
              </Button>
            </div>
          </div>
        ) : null}

        <footer className="modal-actions compare-modal-footer">
          <Button
            variant="secondary"
            className="restore-original-btn"
            onClick={handleRestoreClick}
            disabled={loading || showConfirmRestore}
            title="Revert back to the original CCv2 card artwork"
            leftIcon={<Icon name="RotateCcw" size={14} />}
          >
            Restore Original Artwork
          </Button>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Close
          </Button>
        </footer>
      </section>
    </div>
  );
}
