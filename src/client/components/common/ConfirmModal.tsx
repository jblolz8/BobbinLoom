import { useRef, type ReactNode } from "react";
import { Button } from "../base";
import { Dialog } from "../base/Dialog";

export type ConfirmModalProps = {
  title: string;
  message?: ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
  isLoading?: boolean;
  confirmDisabled?: boolean;
  maxWidth?: number | string;
  className?: string;
  children?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

/**
 * The app's confirm dialog: a question, a destructive or primary action, and a way out.
 *
 * The markup, the Escape handling and the focus rules live in `Dialog` — this keeps only what makes
 * it a confirmation: the wording, the accent of the action, and the fact that **Cancel holds the
 * focus when it opens**, so the safe answer is the one a stray Enter takes and the trigger behind
 * the dialog stops being the focused element (which is what used to keep its tooltip on screen).
 */
export function ConfirmModal(props: ConfirmModalProps) {
  const {
    title,
    message,
    confirmLabel = "Confirm",
    cancelLabel = "Cancel",
    danger = false,
    isLoading = false,
    confirmDisabled = false,
    maxWidth,
    className = "",
    children,
    onConfirm,
    onCancel,
  } = props;
  const cancelRef = useRef<HTMLButtonElement | null>(null);

  return (
    <Dialog
      title={title}
      description={message}
      className={`confirm-modal${className ? ` ${className}` : ""}`.trim()}
      maxWidth={maxWidth}
      onClose={onCancel}
      isBusy={isLoading}
      initialFocusRef={cancelRef}
      footer={
        <>
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={confirmDisabled || isLoading}
          >
            {confirmLabel}
          </Button>
          <Button
            ref={cancelRef}
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
        </>
      }
    >
      {children}
    </Dialog>
  );
}
