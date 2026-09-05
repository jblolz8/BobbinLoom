import { Button } from "../base";

type ConfirmModalProps = {
  title: string;
  message: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmModal(props: ConfirmModalProps) {
  const { title, message, confirmLabel = "Confirm", danger = false, onConfirm, onCancel } = props;

  function handleBackdropClick(e: React.MouseEvent) {
    e.stopPropagation();
    if (e.target === e.currentTarget) onCancel();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") onCancel();
  }

  return (
    <div className="modal-backdrop" onClick={handleBackdropClick} onKeyDown={handleKeyDown}>
      <section className="modal confirm-modal">
        <header className="modal-header">
          <div>
            <h2>{title}</h2>
            <p>{message}</p>
          </div>
        </header>
        <div className="settings-actions">
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirmLabel}
          </Button>
          <Button variant="secondary" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </section>
    </div>
  );
}
