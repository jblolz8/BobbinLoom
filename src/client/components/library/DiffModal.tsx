import { useMemo, useState } from "react";
import { computeLineDiff } from "../../engine/diff";
import {
  Badge,
  Button,
  Card,
  Header,
  Icon,
  Modal,
  Spinner,
  Stack,
  StatusMessage,
  Tabs,
  Text,
  TextArea,
} from "../base";
import { TwoPaneDiff } from "./TwoPaneDiff";
import "./DiffModal.css";

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
    [oldContent, newContent],
  );

  const [feedback, setFeedback] = useState("");
  const [paneViewMode, setPaneViewMode] = useState<"split" | "left" | "right">(
    "split",
  );

  const addedCount = diffLines.filter((l) => l.type === "added").length;
  const removedCount = diffLines.filter((l) => l.type === "removed").length;
  const isReadOnly = !onAccept && !onRetry;

  return (
    <Modal
      open={true}
      onClose={onClose}
      dismissDisabled={loading}
      size="wide"
      ariaLabelledBy="diff-modal-title"
    >
      <Header
        variant="modal"
        titleId="diff-modal-title"
        icon="Sparkles"
        title={title}
        subtitle={
          <Stack direction="row" gap="xs" align="center" wrap>
            <Badge variant="success" size="xs" pill leftIcon="Plus">
              {addedCount} added
            </Badge>
            <Badge variant="danger" size="xs" pill leftIcon="Minus">
              {removedCount} removed
            </Badge>
            {isReadOnly ? (
              <Badge variant="neutral" size="xs" pill>
                Read-Only
              </Badge>
            ) : null}
          </Stack>
        }
        actions={
          <Stack direction="row" gap="sm" align="center">
            <Tabs<"split" | "left" | "right">
              variant="segmented"
              size="sm"
              ariaLabel="Diff View Mode"
              activeTab={paneViewMode}
              onChange={setPaneViewMode}
              tabs={[
                {
                  id: "split",
                  label: "Split",
                  icon: "Columns",
                },
                {
                  id: "right",
                  label: newLabel,
                },
                {
                  id: "left",
                  label: oldLabel,
                },
              ]}
            />
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
          </Stack>
        }
      />

      <Modal.Body>
        <Modal.Content>
          <Stack
            direction="column"
            gap="sm"
            flex1
            style={{ minHeight: 0 }}
          >
            {loading ? (
              <StatusMessage variant="banner" tone="neutral" icon="Sparkles">
                <strong>Regenerating BL format with AI…</strong>{" "}
                {feedback.trim()
                  ? `Applying guidance: "${feedback.trim()}"`
                  : "Generating updated character sheet…"}
              </StatusMessage>
            ) : null}

            {error ? (
              <StatusMessage variant="banner" tone="err">
                {error}
              </StatusMessage>
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
                  <Card variant="elevated" padding="md">
                    <Stack direction="row" gap="sm" align="center">
                      <Spinner size={18} />
                      <Text as="span" size="sm" weight="medium">
                        AI Generation in progress…
                      </Text>
                    </Stack>
                  </Card>
                </div>
              ) : null}
            </div>
          </Stack>
        </Modal.Content>
      </Modal.Body>

      <Modal.Footer>
        {isReadOnly ? (
          <Stack
            direction="row"
            justify="between"
            align="center"
            gap="md"
            wrap
            fullWidth
          >
            <Stack direction="row" gap="xs" align="center">
              <Icon name="FileText" size={14} />
              <Text as="span" size="xs" tone="secondary">
                Comparing original CCv2 card with converted BobbinLoom sheet.
              </Text>
            </Stack>
            <Button variant="primary" onClick={onClose}>
              Close
            </Button>
          </Stack>
        ) : (
          <Stack direction="column" gap="sm" fullWidth>
            <Stack direction="column" gap="xs">
              <TextArea
                rows={2}
                size="sm"
                label={
                  <Stack
                    direction="row"
                    justify="between"
                    align="center"
                    gap="sm"
                    fullWidth
                  >
                    <span>Guidance for AI retry (optional)</span>
                    {feedback.trim() && !loading ? (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setFeedback("")}
                        title="Clear guidance input"
                      >
                        Clear
                      </Button>
                    ) : null}
                  </Stack>
                }
                value={feedback}
                onChange={(e) => setFeedback(e.target.value)}
                placeholder="e.g. Focus more on personality quirks, make appearance description more detailed, format inventory items as bullet points..."
                disabled={loading}
              />
              <Stack direction="row" gap="xs" align="center" wrap>
                <Text as="span" size="xs" tone="muted" weight="medium">
                  Suggestions:
                </Text>
                {QUICK_SUGGESTIONS.map((suggestion) => (
                  <Button
                    key={suggestion}
                    type="button"
                    variant="secondary"
                    size="xs"
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
                  </Button>
                ))}
              </Stack>
            </Stack>

            <Stack
              direction="row"
              justify="end"
              align="center"
              gap="sm"
              wrap
              fullWidth
            >
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
                isLoading={loading}
                leftIcon={
                  !loading ? <Icon name="RotateCcw" size={14} /> : undefined
                }
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
            </Stack>
          </Stack>
        )}
      </Modal.Footer>
    </Modal>
  );
}
