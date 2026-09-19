import { useId, useRef, useState, type FormEvent } from "react";
import { isRenameable } from "../../engine/dialogFocus";
import { Button } from "../base";
import { Dialog } from "../base/Dialog";

export type RenameModalProps = {
  /** The dialog's heading, e.g. "Rename Playthrough". */
  title: string;
  /** The field's label. */
  label?: string;
  initialValue: string;
  isSaving?: boolean;
  /** A failed save stays in the dialog that caused it, rather than only in a page-level banner. */
  errorMessage?: string | null;
  onSave: (name: string) => void;
  onCancel: () => void;
};

/**
 * Renaming something, as a dialog on the shared shell.
 *
 * The field used to live inside the shelf's card, which is a navigation target: a space in it
 * bubbled to the card's key handler and opened the playthrough, and a click-drag that left the field
 * fired its click on the card for the same reason. Neither can happen to a field that is not inside
 * the card, and a real `<form>` gives Enter-to-save, Escape-to-cancel and a labelled input for free.
 *
 * There is deliberately no `maxLength`: the server's rule is `min(1)` with no upper bound, and a
 * dialog must not invent a limit the API does not have.
 */
export function RenameModal({
  title,
  label = "Name",
  initialValue,
  isSaving = false,
  errorMessage,
  onSave,
  onCancel
}: RenameModalProps) {
  const [draft, setDraft] = useState(initialValue);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const cancelRef = useRef<HTMLButtonElement | null>(null);
  const formId = useId();
  const canSave = isRenameable(draft) && !isSaving;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!canSave) return;
    onSave(draft.trim());
  }

  return (
    <Dialog
      title={title}
      className="rename-modal"
      maxWidth={420}
      onClose={onCancel}
      isBusy={isSaving}
      // Unlike a destructive dialog this one opens on the field: the reason the dialog is open at all
      // is that the name is about to be edited.
      initialFocusRef={inputRef}
      footer={
        <>
          <Button type="submit" form={formId} variant="primary" disabled={!canSave} isLoading={isSaving}>
            {isSaving ? "Saving…" : "Save"}
          </Button>
          <Button ref={cancelRef} variant="secondary" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
        </>
      }
    >
      <form id={formId} className="rename-form" onSubmit={submit}>
        <div className="form-field">
          <label className="field-label-text" htmlFor="rename-modal-input">
            {label}
          </label>
          <input
            id="rename-modal-input"
            ref={inputRef}
            className="rename-modal-input"
            value={draft}
            autoComplete="off"
            onChange={(event) => setDraft(event.target.value)}
            // The whole name selected on focus: typing replaces it, which is what a rename usually is.
            onFocus={(event) => event.currentTarget.select()}
          />
          {errorMessage ? <span className="field-hint error">{errorMessage}</span> : null}
        </div>
        {/* A submit button is associated from the footer, so Enter in the field submits the form. */}
      </form>
    </Dialog>
  );
}
