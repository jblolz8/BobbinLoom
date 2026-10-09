import type { CharacterInstance } from "../../../schemas";

export type FleshOutPreviewProps = {
  character: CharacterInstance;
  content: string;
  busy: boolean;
  onConfirm: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
};

export function FleshOutPreview({
  character,
  content,
  busy,
  onConfirm,
  onRegenerate,
  onCancel
}: FleshOutPreviewProps) {
  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget && !busy) onCancel();
      }}
    >
      <section className="modal promote-preview-modal">
        <header className="modal-header">
          <div>
            <h2>Flesh Out &quot;{character.name}&quot;?</h2>
            <p>Review the generated detailed character sheet before committing.</p>
          </div>
          <div className="modal-header-actions">
            <button type="button" onClick={onCancel} disabled={busy}>
              Close
            </button>
          </div>
        </header>
        <div className="promote-preview-body">
          <pre className="content-view">{content}</pre>
        </div>
        <footer className="character-editor-footer">
          <div className="footer-right">
            <button type="button" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="button" onClick={onRegenerate} disabled={busy}>
              {busy ? "Working…" : "Regenerate"}
            </button>
            <button
              type="button"
              className="primary"
              onClick={onConfirm}
              disabled={busy}
            >
              {busy ? "Fleshing out…" : "Approve & Flesh Out"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

/** @deprecated Use FleshOutPreview */
export const PromotePreview = FleshOutPreview;
/** @deprecated Use FleshOutPreviewProps */
export type PromotePreviewProps = FleshOutPreviewProps;
