import type { MouseEvent } from "react";
import { Button, Icon } from "../../base";

export type EditorActionBarProps = {
  mode: "create" | "edit";
  busy: boolean;
  dirty: boolean;
  onTest: (e: MouseEvent) => void;
  onCancel: () => void;
  onDelete: () => void;
};

export function EditorActionBar({
  mode,
  busy,
  dirty,
  onTest,
  onCancel,
  onDelete,
}: EditorActionBarProps) {
  return (
    <div className="conn-actions-bar">
      <div className="actions-left">
        <Button
          type="submit"
          variant="primary"
          size="sm"
          disabled={busy || (mode === "edit" && !dirty)}
          isLoading={busy}
          leftIcon={<Icon name="Save" size={13} />}
        >
          Save
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          onClick={onTest}
          disabled={busy}
          leftIcon={<Icon name="Activity" size={13} />}
        >
          Test connection
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onCancel}
          leftIcon={<Icon name="X" size={13} />}
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
          leftIcon={<Icon name="Trash2" size={13} />}
        >
          Delete
        </Button>
      )}
    </div>
  );
}
