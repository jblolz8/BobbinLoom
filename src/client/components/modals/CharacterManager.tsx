import { Button, Header, Icon, Modal } from "../base";
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
    <Modal open={open} onClose={onClose} size="wide" className="character-manager-modal">
      <Header
        variant="modal"
        title="Character Library"
        bordered
        actions={
          <Button
            variant="secondary"
            size="sm"
            onClick={onClose}
            leftIcon={<Icon name="X" size={14} />}
          >
            Close
          </Button>
        }
      />
      <Modal.Body>
        <Modal.Content>
          <CharacterLibrary isModal={true} initialEditingId={initialEditingId} />
        </Modal.Content>
      </Modal.Body>
    </Modal>
  );
}
