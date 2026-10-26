import { Button, Header, Icon, Modal } from "../base";
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
    <Modal open={open} onClose={onClose} size="wide" className="lorebook-manager-modal">
      <Header
        variant="modal"
        title="Lorebook Manager"
        subtitle="Manage World Info lorebooks. Import .json files exported from SillyTavern, or create new ones here."
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
          <LorebookLibrary
            isModal={true}
            onClose={onClose}
            onLorebooksChanged={onLorebooksChanged}
          />
        </Modal.Content>
      </Modal.Body>
    </Modal>
  );
}
