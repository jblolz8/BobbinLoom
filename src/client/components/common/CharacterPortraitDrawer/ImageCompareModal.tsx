import { useState } from "react";
import {
  Badge,
  Button,
  Header,
  Icon,
  Modal,
  Stack,
  StatusMessage,
  Tabs,
} from "../../base";

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
  const [mobileTab, setMobileTab] = useState<
    "side-by-side" | "original" | "current"
  >("side-by-side");

  function handleRestoreClick() {
    setShowConfirmRestore(true);
  }

  function handleConfirmRestore() {
    setShowConfirmRestore(false);
    onRestore();
  }

  return (
    <Modal
      open={true}
      onClose={onClose}
      dismissDisabled={loading}
      size="lg"
      ariaLabelledBy="compare-modal-title"
      className="image-compare-modal"
    >
      <Header
        variant="modal"
        titleId="compare-modal-title"
        icon="Layers"
        title={`Compare Portrait: ${characterName}`}
        subtitle="Original CCv2 Artwork vs. Current Custom Portrait"
        actions={
          <Button
            type="button"
            variant="secondary"
            size="xs"
            leftIcon="X"
            onClick={onClose}
            disabled={loading}
          >
            Close
          </Button>
        }
      />

      <Modal.Body>
        <Modal.Content>
          {/* Mobile Tab Switcher */}
          <div className="image-compare-mobile-tabs">
            <Tabs<"side-by-side" | "original" | "current">
              variant="segmented"
              size="sm"
              fullWidth
              activeTab={mobileTab}
              onChange={setMobileTab}
              tabs={[
                { id: "side-by-side", label: "Side by Side" },
                { id: "original", label: "Original CCv2" },
                { id: "current", label: "Current Portrait" },
              ]}
            />
          </div>

          <div className={`image-compare-body mode-${mobileTab}`}>
            {/* Left Pane: Original CCv2 */}
            {(mobileTab === "side-by-side" || mobileTab === "original") && (
              <div className="image-compare-pane original-pane">
                <div className="compare-pane-header">
                  <Badge variant="info" size="xs">
                    Original CCv2 Artwork
                  </Badge>
                </div>
                <div className="compare-image-wrap">
                  <img
                    src={originalSrc}
                    alt="Original CCv2 artwork"
                    className="compare-image"
                  />
                </div>
              </div>
            )}

            {/* Right Pane: Custom Portrait */}
            {(mobileTab === "side-by-side" || mobileTab === "current") && (
              <div className="image-compare-pane current-pane">
                <div className="compare-pane-header">
                  <Badge variant="accent" size="xs">
                    Current Custom Portrait
                  </Badge>
                </div>
                <div className="compare-image-wrap">
                  <img
                    src={currentSrc}
                    alt="Current portrait artwork"
                    className="compare-image"
                  />
                </div>
              </div>
            )}
          </div>

          {showConfirmRestore ? (
            <StatusMessage variant="banner" tone="warn" icon="AlertTriangle">
              <Stack
                direction="row"
                justify="between"
                align="center"
                gap="sm"
                wrap
              >
                <span>
                  Are you sure? This will remove your custom portrait and revert
                  back to the original CCv2 card art.
                </span>
                <Stack direction="row" gap="xs" align="center">
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
                </Stack>
              </Stack>
            </StatusMessage>
          ) : null}
        </Modal.Content>
      </Modal.Body>

      <Modal.Footer>
        <Stack
          direction="row"
          justify="between"
          align="center"
          gap="sm"
          wrap
          fullWidth
        >
          <Button
            variant="warning"
            size="sm"
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
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
