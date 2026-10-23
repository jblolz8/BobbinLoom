import { useEffect, useState, type MouseEvent, type ReactNode } from "react";
import { Button, Icon } from "../../base";

export type EditorFooterStatus = {
  kind: "ok" | "err" | "warn";
  text: string;
  detail?: string;
} | null;

export type EditorActionBarProps = {
  mode: "create" | "edit";
  busy: boolean;
  dirty: boolean;
  testingConnection?: boolean;
  testingResponse?: boolean;
  testDrawerOpen?: boolean;
  drawerContent?: ReactNode;
  status?: EditorFooterStatus;
  onDismissStatus?: () => void;
  onTest: (e: MouseEvent) => void;
  onTestResponse?: (e: MouseEvent) => void;
  onToggleTestDrawer?: () => void;
  onCancel: () => void;
  onDelete: () => void;
};

function splitStatusSummary(status: NonNullable<EditorFooterStatus>): {
  summary: string;
  detail?: string;
} {
  if (status.detail) {
    return { summary: status.text, detail: status.detail };
  }
  const trimmed = status.text.trim();
  if (trimmed.length <= 96 && !trimmed.includes("\n")) {
    return { summary: trimmed };
  }
  const firstLine = trimmed.split("\n")[0].trim();
  const summary = firstLine.length > 96 ? `${firstLine.slice(0, 93)}…` : firstLine;
  return { summary, detail: trimmed };
}

export function EditorActionBar({
  mode,
  busy,
  dirty,
  testingConnection = false,
  testingResponse = false,
  testDrawerOpen = false,
  drawerContent,
  status = null,
  onDismissStatus,
  onTest,
  onTestResponse,
  onToggleTestDrawer,
  onCancel,
  onDelete,
}: EditorActionBarProps) {
  const [expandedDetail, setExpandedDetail] = useState(false);

  useEffect(() => {
    setExpandedDetail(false);
  }, [status?.text, status?.detail, status?.kind]);

  const anyBusy = busy || testingConnection || testingResponse;
  const parsedStatus = status ? splitStatusSummary(status) : null;

  return (
    <div className="conn-actions-bar">
      {drawerContent}
      {status && parsedStatus && (
        <div className={`conn-footer-status ${status.kind}`} role="status" aria-live="polite">
          <div className="conn-footer-status__main">
            <Icon
              name={
                status.kind === "ok"
                  ? "CheckCircle2"
                  : status.kind === "warn"
                    ? "AlertTriangle"
                    : "AlertCircle"
              }
              size={13}
              className="conn-footer-status__icon"
            />
            <span className="conn-footer-status__text">{parsedStatus.summary}</span>
            {parsedStatus.detail && (
              <button
                type="button"
                className="conn-footer-status__toggle"
                onClick={() => setExpandedDetail((v) => !v)}
              >
                {expandedDetail ? "Hide" : "Details"}
              </button>
            )}
            {onDismissStatus && (
              <button
                type="button"
                className="conn-footer-status__dismiss"
                onClick={onDismissStatus}
                aria-label="Dismiss status"
                title="Dismiss"
              >
                <Icon name="X" size={12} />
              </button>
            )}
          </div>
          {parsedStatus.detail && expandedDetail && (
            <pre className="conn-footer-status__detail">{parsedStatus.detail}</pre>
          )}
        </div>
      )}

      <div className="conn-actions-row">
        <div className="actions-left">
          <Button
            type="submit"
            variant="primary"
            size="sm"
            disabled={anyBusy || (mode === "edit" && !dirty)}
            isLoading={busy}
            leftIcon="Save"
          >
            Save
          </Button>
          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={onTest}
            disabled={anyBusy}
            isLoading={testingConnection}
            leftIcon="Activity"
          >
            Test connection
          </Button>
          {onTestResponse && (
            <div className="conn-test-response-group">
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={onTestResponse}
                disabled={anyBusy}
                isLoading={testingResponse}
                leftIcon="MessageSquare"
              >
                Test response
              </Button>
              {onToggleTestDrawer && (
                <Button
                  type="button"
                  variant={testDrawerOpen ? "primary" : "secondary"}
                  size="sm"
                  iconOnly
                  onClick={onToggleTestDrawer}
                  aria-label="Configure global test prompt"
                  title="Configure global test prompt"
                  leftIcon={testDrawerOpen ? "ChevronDown" : "SlidersHorizontal"}
                />
              )}
            </div>
          )}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onCancel}
            leftIcon="X"
          >
            Cancel
          </Button>
        </div>
        {mode === "edit" && (
          <Button
            type="button"
            variant="danger"
            size="sm"
            onClick={onDelete}
            leftIcon="Trash2"
          >
            Delete
          </Button>
        )}
      </div>
    </div>
  );
}
