import { CharacterLibrary } from "../library/CharacterLibrary";

export type CharacterManagerProps = {
  open: boolean;
  onClose: () => void;
  initialEditingId?: string;
};

export function CharacterManager({ open, onClose, initialEditingId }: CharacterManagerProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <section className="modal character-manager-modal">
        <header className="modal-header">
          <h2>Character Library</h2>
          <button onClick={onClose}>Close</button>
        </header>

        <CharacterLibrary isModal={true} initialEditingId={initialEditingId} />
      </section>
    </div>
  );
}
