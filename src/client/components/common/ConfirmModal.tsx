import { useEffect, type ReactNode } from "react";
import { Button } from "../base";

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

  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape" && !isLoading) {
        onCancel();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, isLoading]);

  function handleBackdropMouseDown(e: React.MouseEvent) {
    if (e.target === e.currentTarget && !isLoading) {
      onCancel();
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={handleBackdropMouseDown}>
      <section
        className={`modal confirm-modal${className ? ` ${className}` : ""}`.trim()}
        style={maxWidth !== undefined ? { maxWidth } : undefined}
      >
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            {message ? (typeof message === "string" ? <p>{message}</p> : message) : null}
          </div>
        </header>
        {children}
        <div className="settings-actions">
          <Button
            variant={danger ? "danger" : "primary"}
            onClick={onConfirm}
            isLoading={isLoading}
            disabled={confirmDisabled || isLoading}
          >
            {confirmLabel}
          </Button>
          <Button
            variant="secondary"
            onClick={onCancel}
            disabled={isLoading}
          >
            {cancelLabel}
          </Button>
        </div>
      </section>
    </div>
  );
}
