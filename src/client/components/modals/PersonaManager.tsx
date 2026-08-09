import { PersonaLibrary } from "../library/PersonaLibrary";
import type { Persona } from "../../api";

export type PersonaManagerProps = {
  open: boolean;
  onClose: () => void;
  onPersonasChanged: (personas: Persona[]) => void;
};

export function PersonaManager({ open, onClose, onPersonasChanged }: PersonaManagerProps) {
  if (!open) return null;

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section className="modal persona-manager" onClick={(e) => e.stopPropagation()}>
        <header className="modal-header">
          <h2>Persona Manager</h2>
          <button onClick={onClose}>Close</button>
        </header>

        <PersonaLibrary isModal={true} onPersonasChanged={onPersonasChanged} />
      </section>
    </div>
  );
}
