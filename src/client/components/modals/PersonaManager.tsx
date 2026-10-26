import { PersonaLibrary } from "../library/PersonaLibrary";
import type { Persona } from "../../api";

export type PersonaManagerProps = {
  open: boolean;
  onClose: () => void;
  onPersonasChanged: (personas: Persona[]) => void;
};

export function PersonaManager({
  open,
  onClose,
  onPersonasChanged,
}: PersonaManagerProps) {
  if (!open) return null;

  return (
    <PersonaLibrary
      variant="dialog"
      onClose={onClose}
      onPersonasChanged={onPersonasChanged}
    />
  );
}
