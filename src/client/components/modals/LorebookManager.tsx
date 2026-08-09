import { LorebookLibrary } from "../library/LorebookLibrary";

export type LorebookManagerProps = {
  open: boolean;
  onClose: () => void;
  onLorebooksChanged?: () => void;
};

export function LorebookManager({ open, onClose, onLorebooksChanged }: LorebookManagerProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal lorebook-manager-modal">
        <header className="modal-header">
          <div>
            <h2>Lorebook Manager</h2>
            <p>Manage World Info lorebooks. Import .json files exported from SillyTavern, or create new ones here.</p>
          </div>
          <button onClick={onClose}>Close</button>
        </header>

        <LorebookLibrary isModal={true} onLorebooksChanged={onLorebooksChanged} />
      </section>
    </div>
  );
}
