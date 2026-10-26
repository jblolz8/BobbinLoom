import type { CharacterInstance } from "../../../../schemas";
import { Button, CodeBlock, Header, Modal, Stack } from "../../base";

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
  onCancel,
}: FleshOutPreviewProps) {
  return (
    <Modal open onClose={onCancel} dismissDisabled={busy} size="md">
      <Header
        variant="modal"
        title={`Flesh Out "${character.name}"?`}
        subtitle="Review the generated detailed character sheet before committing."
        bordered
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            leftIcon="X"
            onClick={onCancel}
            disabled={busy}
            aria-label="Close"
            title="Close"
          />
        }
      />
      <Modal.Body>
        <Modal.Content>
          <CodeBlock code={content} wrap />
        </Modal.Content>
      </Modal.Body>
      <Modal.Footer>
        <Stack direction="row" justify="end" gap="sm" wrap fullWidth>
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={onRegenerate}
            disabled={busy}
            isLoading={busy}
          >
            {busy ? "Working…" : "Regenerate"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onConfirm}
            disabled={busy}
            isLoading={busy}
          >
            {busy ? "Fleshing out…" : "Approve & Flesh Out"}
          </Button>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}

/** @deprecated Use FleshOutPreview */
export const PromotePreview = FleshOutPreview;
/** @deprecated Use FleshOutPreviewProps */
export type PromotePreviewProps = FleshOutPreviewProps;
