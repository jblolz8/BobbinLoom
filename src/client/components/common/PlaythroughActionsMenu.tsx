import { useState } from "react";
import { createPortal } from "react-dom";
import type { Playthrough } from "../../../schemas";
import { deletePlaythrough, duplicatePlaythrough } from "../../api";
import { ConfirmModal } from "./ConfirmModal";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  Button,
  Icon,
  Tooltip,
} from "../base";

export type PlaythroughActionsMenuProps = {
  playthroughId: string;
  playthroughName: string;
  onRenameRequest: (id: string, name: string) => void;
  onDuplicated: (clone: Playthrough) => void;
  onDeleted: () => void;
  onError: (message: string) => void;
};

export function PlaythroughActionsMenu(props: PlaythroughActionsMenuProps) {
  const { playthroughId, playthroughName, onRenameRequest, onDuplicated, onDeleted, onError } = props;
  const [deleteConfirm, setDeleteConfirm] = useState(false);

  async function handleDuplicate() {
    try {
      const clone = await duplicatePlaythrough(playthroughId);
      onDuplicated(clone);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDeleteClick() {
    setDeleteConfirm(true);
  }

  async function confirmDelete() {
    setDeleteConfirm(false);
    try {
      await deletePlaythrough(playthroughId);
      onDeleted();
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleRename() {
    onRenameRequest(playthroughId, playthroughName);
  }

  return (
    <div className="playthrough-actions-menu" onClick={(e) => e.stopPropagation()}>
      <DropdownMenu>
        <Tooltip content="More options">
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="sm"
              iconOnly
              aria-label="More options"
              className="playthrough-actions-trigger"
            >
              <Icon name="MoreVertical" size={16} />
            </Button>
          </DropdownMenuTrigger>
        </Tooltip>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            icon={<Icon name="Pencil" size={14} />}
            onClick={handleRename}
          >
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            icon={<Icon name="Copy" size={14} />}
            onClick={() => void handleDuplicate()}
          >
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            danger
            icon={<Icon name="Trash2" size={14} />}
            onClick={handleDeleteClick}
          >
            Delete
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {deleteConfirm
        ? createPortal(
            <ConfirmModal
              title="Delete Playthrough"
              message={`Delete "${playthroughName}"? This cannot be undone.`}
              confirmLabel="Delete"
              danger
              onConfirm={() => { void confirmDelete(); }}
              onCancel={() => setDeleteConfirm(false)}
            />,
            document.body
          )
        : null}
    </div>
  );
}

