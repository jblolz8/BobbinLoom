import { useMemo, useState } from "react";
import type { CharacterInstance } from "../../../schemas";
import type { CharacterEditPayload } from "../../api/characters";
import { Button, Icon, SwitchRow, TagInput, TextArea, TextInput } from "../base";
import { Dialog } from "../base/Dialog";
import { ConfirmModal } from "../common/ConfirmModal";

export type SimpleCharacterEditorProps = {
  character: CharacterInstance;
  inScene: boolean;
  onSave: (payload: CharacterEditPayload) => Promise<void>;
  onFleshOut?: () => void;
  onClose: () => void;
};

type FormState = {
  name: string;
  storyRole: string;
  description: string;
  mood: string;
  towardPlayer: string;
  memorySummary: string;
  conditions: string[];
  flags: string[];
  inScene: boolean;
};

export function SimpleCharacterEditor({
  character,
  inScene,
  onSave,
  onFleshOut,
  onClose
}: SimpleCharacterEditorProps) {
  const [form, setForm] = useState<FormState>(() => ({
    name: character.name || "",
    storyRole: character.storyRole || "",
    description: character.description || "",
    mood: character.mood || "",
    towardPlayer: character.towardPlayer || "",
    memorySummary: character.memorySummary || "",
    conditions: [...(character.conditions || [])],
    flags: [...(character.flags || [])],
    inScene
  }));

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const isDirty = useMemo(() => {
    return (
      form.name.trim() !== (character.name || "").trim() ||
      form.storyRole.trim() !== (character.storyRole || "").trim() ||
      form.description.trim() !== (character.description || "").trim() ||
      form.mood.trim() !== (character.mood || "").trim() ||
      form.towardPlayer.trim() !== (character.towardPlayer || "").trim() ||
      form.memorySummary.trim() !== (character.memorySummary || "").trim() ||
      form.inScene !== inScene ||
      JSON.stringify(form.conditions) !== JSON.stringify(character.conditions ?? []) ||
      JSON.stringify(form.flags) !== JSON.stringify(character.flags ?? [])
    );
  }, [form, character, inScene]);

  const handleRequestClose = () => {
    if (isDirty) {
      setConfirmDiscard(true);
    } else {
      onClose();
    }
  };

  const handleSave = async (andClose: boolean) => {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setError("Character name is required");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: trimmedName,
        storyRole: form.storyRole.trim() || undefined,
        description: form.description.trim() || undefined,
        mood: form.mood.trim() || undefined,
        towardPlayer: form.towardPlayer.trim() || undefined,
        memorySummary: form.memorySummary.trim() || undefined,
        conditions: form.conditions,
        flags: form.flags,
        inScene: form.inScene
      });
      if (andClose) {
        onClose();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save character");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dialog
        title={`Simple Character: ${form.name || character.name}`}
        description="Lightweight cast member without a full character sheet."
        className="simple-character-editor-modal"
        maxWidth={640}
        isBusy={saving}
        onClose={handleRequestClose}
        headerAction={
          <Button size="sm" variant="secondary" onClick={handleRequestClose}>
            Close
          </Button>
        }
        footer={
          <>
            <Button
              variant="primary"
              isLoading={saving}
              disabled={saving || !isDirty}
              onClick={() => { void handleSave(true); }}
            >
              Save & Close
            </Button>
            <Button
              variant="secondary"
              disabled={saving || !isDirty}
              onClick={() => { void handleSave(false); }}
            >
              Save
            </Button>
            <Button variant="secondary" disabled={saving} onClick={handleRequestClose}>
              Cancel
            </Button>
          </>
        }
      >
        <div className="simple-char-editor-body">
          {error ? <p className="status-error">{error}</p> : null}

          {onFleshOut ? (
            <div className="simple-char-flesh-out-callout">
              <div className="simple-char-flesh-out-info">
                <div className="simple-char-flesh-out-title">
                  <Icon name="Sparkles" size={16} />
                  <strong>Flesh Out into Full Sheet</strong>
                </div>
                <p>
                  Use the Character Manager to expand this character with a full sheet format, backstory, appearance, and dialogue style.
                </p>
              </div>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => {
                  onClose();
                  onFleshOut();
                }}
              >
                <Icon name="Sparkles" size={14} /> Flesh Out
              </Button>
            </div>
          ) : null}

          <section className="simple-char-editor-section">
            <h4 className="simple-char-editor-section-title">Identity & Story Role</h4>
            <div className="simple-char-editor-fields">
              <TextInput
                label="Name"
                value={form.name}
                required
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="Character name"
              />
              <TextInput
                label="Story Role"
                value={form.storyRole}
                onChange={(e) => setForm((f) => ({ ...f, storyRole: e.target.value }))}
                placeholder="e.g. Village Elder, Mercenary, Tavern Keeper"
                helperText="Their narrative role or occupation in the story"
              />
              <TextArea
                label="Description"
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={3}
                autoGrow
                autoGrowMax={180}
                placeholder="Key physical traits, personality notes, or quick background…"
                helperText="Core visual and personality reference for the narrator"
              />
            </div>
          </section>

          <section className="simple-char-editor-section">
            <h4 className="simple-char-editor-section-title">Presence & Scene State</h4>
            <div className="simple-char-editor-fields">
              <SwitchRow
                icon="Users"
                title="Present In Scene"
                description={
                  form.inScene
                    ? "In Scene: This character is in the current location and part of active story dialogue and events."
                    : "Off-Screen: This character is currently elsewhere or in the background."
                }
                checked={form.inScene}
                onChange={(e) => setForm((f) => ({ ...f, inScene: e.target.checked }))}
              />
              <div className="simple-char-editor-row">
                <TextInput
                  label="Mood"
                  value={form.mood}
                  onChange={(e) => setForm((f) => ({ ...f, mood: e.target.value }))}
                  placeholder="e.g. cautious, cheerful, brooding"
                  helperText="Current emotional demeanor"
                />
                <TextInput
                  label="Toward Player"
                  value={form.towardPlayer}
                  onChange={(e) => setForm((f) => ({ ...f, towardPlayer: e.target.value }))}
                  placeholder="e.g. friendly, skeptical, hostile"
                  helperText="Attitude toward the protagonist"
                />
              </div>
            </div>
          </section>

          <section className="simple-char-editor-section">
            <h4 className="simple-char-editor-section-title">Memory Summary</h4>
            <div className="simple-char-editor-fields">
              <TextArea
                label="Memory Summary"
                value={form.memorySummary}
                onChange={(e) => setForm((f) => ({ ...f, memorySummary: e.target.value }))}
                rows={3}
                autoGrow
                autoGrowMax={180}
                placeholder="What this character currently remembers about the player or recent events…"
                helperText="Passed to the prompt to maintain continuity without a full sheet"
              />
            </div>
          </section>

          <section className="simple-char-editor-section">
            <h4 className="simple-char-editor-section-title">Conditions & Flags</h4>
            <div className="simple-char-editor-fields">
              <label className="editor-field">
                <span className="editor-field-label">Conditions</span>
                <TagInput
                  value={form.conditions}
                  onChange={(v) => setForm((f) => ({ ...f, conditions: v }))}
                  placeholder="Add a condition (press Enter or comma)…"
                />
              </label>
              <label className="editor-field">
                <span className="editor-field-label">Flags</span>
                <TagInput
                  value={form.flags}
                  onChange={(v) => setForm((f) => ({ ...f, flags: v }))}
                  placeholder="Add a flag (press Enter or comma)…"
                />
              </label>
            </div>
          </section>
        </div>
      </Dialog>

      {confirmDiscard ? (
        <ConfirmModal
          title="Discard unsaved changes?"
          message="You have unsaved edits to this character. Closing will discard them."
          confirmLabel="Discard Changes"
          cancelLabel="Continue Editing"
          danger
          onConfirm={() => {
            setConfirmDiscard(false);
            onClose();
          }}
          onCancel={() => setConfirmDiscard(false)}
        />
      ) : null}
    </>
  );
}
