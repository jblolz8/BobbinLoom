import { CharacterLibrary } from "../library/CharacterLibrary";

export type CharacterManagerProps = {
  open: boolean;
  onClose: () => void;
  initialEditingId?: string;
};

export function CharacterManager({
  open,
  onClose,
  initialEditingId,
}: CharacterManagerProps) {
  if (!open) return null;

  return (
    <CharacterLibrary
      variant="dialog"
      onClose={onClose}
      initialEditingId={initialEditingId}
    />
  );
}
