import { type MouseEvent, type ReactNode } from "react";
import { Button, Separator, Stack, StatusMessage } from "../../base";

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
  const anyBusy = busy || testingConnection || testingResponse;

  return (
    <Stack direction="column" align="stretch" gap="xs">
      <Separator spacing="xs" />
      {drawerContent}
      {status && (
        <StatusMessage
          variant="banner"
          tone={status.kind}
          detail={status.detail}
          autoCollapseDetail
          onDismiss={onDismissStatus}
        >
          {status.text}
        </StatusMessage>
      )}

      <Stack direction="row" align="center" justify="between" gap="sm" wrap>
        <Stack direction="row" align="center" gap="xs" wrap>
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
            <Stack direction="row" align="center" gap="2xs" inline>
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
                  leftIcon={
                    testDrawerOpen ? "ChevronDown" : "SlidersHorizontal"
                  }
                />
              )}
            </Stack>
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
        </Stack>
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
      </Stack>
    </Stack>
  );
}
