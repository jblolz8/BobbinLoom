import { useEffect, useState } from "react";
import type { ImageApiStyle } from "../../../../schemas";
import {
  Button,
  Header,
  Icon,
  IconButton,
  Modal,
  Stack,
  StatusMessage,
  Text,
  TextArea,
} from "../../base";
import { ConfirmModal } from "../../common";

/** What the editor knows about the connection the image was made with. Null when
 *  that connection no longer exists — the body can still be SAVED (a save renders
 *  nothing and needs no provider at all), but the re-send it is preparing for
 *  cannot be aimed anywhere, so the editor says so. */
export type ImageRequestBodyConnection = {
  label: string;
  model: string;
  apiStyle: ImageApiStyle;
} | null;

export type ImageRequestBodyModalProps = {
  /** The stored body, pretty-printed — what the field is seeded with, and what
   *  Reset restores. */
  body: string;
  connection: ImageRequestBodyConnection;
  /** A save is in flight. */
  saving: boolean;
  /** Save the body. Returns the reason when it could not be saved, so the editor
   *  KEEPS the typed text and shows why — never a silent no-op. */
  onSave: (body: string) => Promise<string | null>;
  onClose: () => void;
};

const DIALECT_NOTES: Record<ImageApiStyle, string> = {
  a1111:
    "When it is re-sent it goes to the WebUI's /sdapi/v1/txt2img. steps, cfg_scale, sampler_name, scheduler, width/height and the checkpoint are whatever this body says — the connection's own values are not re-applied.",
  venice:
    "When it is re-sent it goes to /image/generate. variants, seed, style_preset, aspect_ratio and safe_mode are whatever this body says — an empty field is omitted rather than sent as an empty value.",
  openai:
    "When it is re-sent it goes to /images/generations. This dialect has no negative prompt, and the endpoint rejects a prompt over 1500 characters with its own error — the text is not clamped here, so that error is what you would see.",
};

/**
 * The request-body editor: the one image surface that EDITS a stored request
 * body. Saving renders nothing — the image, its bytes and the message are all
 * left alone, and the body becomes what the next Retry sends. That is why the
 * button is not "Send": there is no provider call behind it.
 *
 * This component owns only the text (the hook owns the request and the write), so
 * the draft, the validation and the discard guard all live here, beside the text
 * they protect.
 */
export function ImageRequestBodyModal(props: ImageRequestBodyModalProps) {
  const { body, connection, saving, onSave, onClose } = props;

  const [draft, setDraft] = useState(body);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);

  // Adopt a fresh seed (a different image's body, or the saved one) without
  // clobbering keystrokes in between.
  useEffect(() => {
    setDraft(body);
    setSaveError(null);
  }, [body]);

  const dirty = draft !== body;

  /** Every close path goes through here, so none of them can drop a hand-edit
   *  without asking. Saving does not come through here — its edits are kept. */
  function attemptClose() {
    if (saving) return;
    if (dirty) {
      setConfirmingDiscard(true);
      return;
    }
    onClose();
  }

  async function handleSave() {
    const error = await onSave(draft);
    setSaveError(error);
  }

  return (
    <>
      <Modal
        open
        size="md"
        ariaLabel="Edit image request"
        dismissDisabled={saving || confirmingDiscard}
        onClose={attemptClose}
      >
        <Header
          variant="modal"
          title="Edit Image Request"
          subtitle="The JSON body that went to the image provider. Saving it renders nothing — the image stays as it is, and this body becomes what Retry sends."
          actions={
            <IconButton
              variant="ghost"
              size="sm"
              icon="X"
              label="Close the editor"
              title="Close the editor"
              onClick={attemptClose}
            />
          }
        />

        <Modal.Body>
          <Modal.Content>
            <Stack gap="md">
              <TextArea
                label="Request body (JSON)"
                value={draft}
                onChange={(e) => {
                  setDraft(e.target.value);
                  // The error belonged to the text that failed, not to this one.
                  setSaveError(null);
                }}
                rows={16}
                disabled={saving}
                mono
                error={saveError ?? undefined}
                helperText={
                  saveError
                    ? undefined
                    : "Saved as one line of JSON. No image is generated, nothing is clamped, and no field is added or removed."
                }
              />

              {connection ? (
                <Text size="xs" tone="muted">
                  Image provider: {connection.label} · {connection.model}
                </Text>
              ) : (
                <StatusMessage variant="banner" tone="warn">
                  The connection this image was made with no longer exists. The
                  body can still be saved, but a re-send has nowhere to go until
                  it is restored.
                </StatusMessage>
              )}

              {connection ? (
                <Text size="xs" tone="muted">
                  {DIALECT_NOTES[connection.apiStyle]}
                </Text>
              ) : null}
            </Stack>
          </Modal.Content>
        </Modal.Body>

        <Modal.Footer>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            wrap
            fullWidth
          >
            <Stack direction="row" align="center" gap="sm" wrap>
              <Button
                size="sm"
                variant="primary"
                onClick={() => void handleSave()}
                disabled={saving || !draft.trim() || !dirty}
                isLoading={saving}
                leftIcon={<Icon name="Save" size={13} />}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDraft(body);
                  setSaveError(null);
                }}
                disabled={saving || !dirty}
                leftIcon={<Icon name="RotateCcw" size={12} />}
                title="Restore the stored body, discarding your edits"
              >
                Reset
              </Button>
            </Stack>

            <Stack direction="row" align="center" gap="sm" wrap>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => void navigator.clipboard.writeText(draft)}
                disabled={saving}
                leftIcon={<Icon name="Copy" size={12} />}
                title="Copy this body"
              >
                Copy
              </Button>
              {/* Cancel last: the row's order is a contract — the confirming action, then the
                  secondary actions beside it, then the way out. */}
              <Button
                size="sm"
                variant="secondary"
                onClick={attemptClose}
                disabled={saving}
              >
                Cancel
              </Button>
            </Stack>
          </Stack>
        </Modal.Footer>
      </Modal>

      {/* The discard guard, over the editor it belongs to. The question names what
          is NOT lost, because "discard" otherwise reads like it might throw the
          stored body away too. */}
      {confirmingDiscard ? (
        <ConfirmModal
          title="Discard your edits?"
          message="The stored request body stays as it is, and the image is untouched. Save instead to keep what you typed."
          confirmLabel="Discard edits"
          cancelLabel="Keep editing"
          danger
          maxWidth={420}
          onConfirm={onClose}
          onCancel={() => setConfirmingDiscard(false)}
        />
      ) : null}
    </>
  );
}
