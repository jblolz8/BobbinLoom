import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import type { Playthrough } from "../../../schemas";
import { deletePlaythrough, duplicatePlaythrough } from "../../api";
import { ConfirmModal } from "./ConfirmModal";

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
  const [open, setOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    }
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    document.addEventListener("keydown", handleKey);
    return () => {
      document.removeEventListener("mousedown", handleClick);
      document.removeEventListener("keydown", handleKey);
    };
  }, [open]);

  async function handleDuplicate() {
    setOpen(false);
    try {
      const clone = await duplicatePlaythrough(playthroughId);
      onDuplicated(clone);
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    }
  }

  function handleDeleteClick() {
    setOpen(false);
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
    setOpen(false);
    onRenameRequest(playthroughId, playthroughName);
  }

  return (
    <div className="playthrough-actions-menu" ref={menuRef}>
      <span
        role="button"
        tabIndex={0}
        className="playthrough-actions-trigger"
        onClick={(e) => { e.stopPropagation(); setOpen((prev) => !prev); }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            e.stopPropagation();
            setOpen((prev) => !prev);
          }
        }}
        aria-label="More options"
        aria-haspopup="true"
        aria-expanded={open}
      >
        ⋮
      </span>
      {open ? (
        <div className="playthrough-actions-dropdown" role="menu" onClick={(e) => e.stopPropagation()}>
          <button role="menuitem" onClick={handleRename}>✎ Rename</button>
          <button role="menuitem" onClick={handleDuplicate}>⧉ Duplicate</button>
          <button role="menuitem" className="danger" onClick={handleDeleteClick}>✕ Delete</button>
        </div>
      ) : null}
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
