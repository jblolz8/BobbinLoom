import { LorebookLibrary } from "../library/LorebookLibrary";

export type LorebookManagerProps = {
  open: boolean;
  onClose: () => void;
  onLorebooksChanged?: () => void;
};

export function LorebookManager({
  open,
  onClose,
  onLorebooksChanged,
}: LorebookManagerProps) {
  if (!open) return null;

  return (
    <LorebookLibrary
      variant="dialog"
      onClose={onClose}
      onLorebooksChanged={onLorebooksChanged}
    />
  );
}
