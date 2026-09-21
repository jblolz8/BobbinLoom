import { useRef, type ReactNode, type RefObject } from "react";
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
  /**
   * Actions that belong beside the confirm rather than inside it, rendered between the confirm
   * button and Cancel. The row's order is the contract: `[confirm][secondary actions…][cancel]`.
   *
   * A secondary action is deliberately NOT part of the confirmation: it runs on its own click, it
   * never shows the confirm's loading state or takes its disabled state, and it leaves the dialog
   * open. The revert dialog's **Duplicate as backup** is the case this exists for — it must never
   * ride along with the destructive write.
   */
  secondaryActions?: ReactNode;
  children?: ReactNode;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
};

export type ConfirmActionsProps = Omit<
  ConfirmModalProps,
  "title" | "message" | "maxWidth" | "className" | "children"
> & {
  /** Handed to the Cancel button so the dialog can open with focus on the safe answer. */
  cancelRef?: RefObject<HTMLButtonElement>;
};

/**
 * The confirm dialog's action row, as its own unit.
 *
 * Split out for one reason: `ConfirmModal` renders through a portal and cannot be rendered outside a
 * browser, so the thing worth pinning — **the row's order** — would otherwise be untestable. The
 * order lives here, in one place, and `tests/confirmModalRow.test.ts` renders this to static markup.
 */
export function ConfirmActions({
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  isLoading = false,
  confirmDisabled = false,
  secondaryActions,
  onConfirm,
  onCancel,
  cancelRef
}: ConfirmActionsProps) {
  return (
    <div className="settings-actions">
      <Button
        variant={danger ? "danger" : "primary"}
        onClick={onConfirm}
        isLoading={isLoading}
        disabled={confirmDisabled || isLoading}
      >
        {confirmLabel}
      </Button>
      {secondaryActions}
      <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={isLoading}>
        {cancelLabel}
      </Button>
    </div>
  );
}

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
    secondaryActions,
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
        <ConfirmActions
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          danger={danger}
          isLoading={isLoading}
          confirmDisabled={confirmDisabled}
          secondaryActions={secondaryActions}
          onConfirm={onConfirm}
          onCancel={onCancel}
          cancelRef={cancelRef}
        />
      }
    >
      {children}
    </Dialog>
  );
}
