import type { SimpleNPC } from "../../../schemas";

export type PromotePreviewProps = {
  npc: SimpleNPC;
  content: string;
  busy: boolean;
  onConfirm: () => void;
  onRegenerate: () => void;
  onCancel: () => void;
};

export function PromotePreview({ npc, content, busy, onConfirm, onRegenerate, onCancel }: PromotePreviewProps) {
  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) onCancel(); }}>
      <section className="modal promote-preview-modal">
        <header className="modal-header">
          <div>
            <h2>Promote "{npc.name}" to Main Cast?</h2>
            <p>Review the generated detailed sheet before committing.</p>
          </div>
          <div className="modal-header-actions">
            <button onClick={onCancel} disabled={busy}>Close</button>
          </div>
        </header>
        <div className="promote-preview-body">
          <pre className="content-view">{content}</pre>
        </div>
        <footer className="character-editor-footer">
          <div className="footer-right">
            <button onClick={onCancel} disabled={busy}>Cancel</button>
            <button onClick={onRegenerate} disabled={busy}>{busy ? "Working…" : "Regenerate"}</button>
            <button className="primary" onClick={onConfirm} disabled={busy}>{busy ? "Promoting…" : "Approve & Promote"}</button>
          </div>
        </footer>
      </section>
    </div>
  );
}
