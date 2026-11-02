import { useMemo, useState } from "react";
import type { CharacterInstance } from "../../../../../schemas";
import type { CharacterEditPayload } from "../../../../api/characters";
import {
  Badge,
  Button,
  Card,
  Dialog,
  FormGrid,
  Icon,
  Stack,
  StatusMessage,
  SwitchRow,
  TagInput,
  Text,
  TextArea,
  TextInput,
} from "../../../base";
import { ConfirmModal } from "../../../common";

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
  onClose,
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
    inScene,
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
      JSON.stringify(form.conditions) !==
        JSON.stringify(character.conditions ?? []) ||
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
        inScene: form.inScene,
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
        description={
          <Stack direction="row" align="center" gap="xs" wrap>
            <Badge variant="neutral" size="xs">
              Side character
            </Badge>
            <Text as="span" size="xs" tone="muted">
              Lightweight cast member without a full character sheet.
            </Text>
            {isDirty ? (
              <Badge variant="warning" size="xs" pill>
                Unsaved changes
              </Badge>
            ) : null}
          </Stack>
        }
        maxWidth={640}
        scrollable
        fullScreenMobile
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
              onClick={() => {
                void handleSave(true);
              }}
            >
              Save &amp; Close
            </Button>
            <Button
              variant="secondary"
              disabled={saving || !isDirty}
              onClick={() => {
                void handleSave(false);
              }}
            >
              Save
            </Button>
            <Button
              variant="secondary"
              disabled={saving}
              onClick={handleRequestClose}
            >
              Cancel
            </Button>
          </>
        }
      >
        <Stack direction="column" align="stretch" gap="md" fullWidth>
          {error ? (
            <StatusMessage variant="banner" tone="err">
              {error}
            </StatusMessage>
          ) : null}

          {onFleshOut ? (
            <Card variant="active" padding="sm" layout="row" fullWidth>
              <Stack
                direction="row"
                align="center"
                justify="between"
                gap="sm"
                wrap
                fullWidth
              >
                <Stack direction="column" gap="2xs" flex1>
                  <Stack direction="row" align="center" gap="xs">
                    <Icon name="Sparkles" size={16} />
                    <Text as="strong" size="sm" weight="semibold">
                      Flesh Out into Full Sheet
                    </Text>
                  </Stack>
                  <Text as="p" size="xs" tone="secondary" leading="snug">
                    Use the Character Manager to expand this character with a
                    full sheet format, backstory, appearance, and dialogue
                    style.
                  </Text>
                </Stack>
                <Button
                  size="sm"
                  variant="secondary"
                  leftIcon={<Icon name="Sparkles" size={14} />}
                  onClick={() => {
                    onClose();
                    onFleshOut();
                  }}
                >
                  Flesh Out
                </Button>
              </Stack>
            </Card>
          ) : null}

          <Card variant="panel" padding="md" layout="column" fullWidth>
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              <Text
                as="h4"
                variant="label"
                size="xs"
                weight="semibold"
                tone="muted"
                uppercase
              >
                Identity &amp; Story Role
              </Text>
              <FormGrid cols={2} gap="sm">
                <TextInput
                  label="Name"
                  value={form.name}
                  required
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                  placeholder="Character name"
                />
                <TextInput
                  label="Story Role"
                  value={form.storyRole}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, storyRole: e.target.value }))
                  }
                  placeholder="e.g. Village Elder, Mercenary, Tavern Keeper"
                  helperText="Their narrative role or occupation in the story"
                />
              </FormGrid>
              <TextArea
                label="Description"
                value={form.description}
                onChange={(e) =>
                  setForm((f) => ({ ...f, description: e.target.value }))
                }
                rows={3}
                autoGrow
                autoGrowMax={180}
                placeholder="Key physical traits, personality notes, or quick background…"
                helperText="Core visual and personality reference for the narrator"
              />
            </Stack>
          </Card>

          <Card variant="panel" padding="md" layout="column" fullWidth>
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              <Text
                as="h4"
                variant="label"
                size="xs"
                weight="semibold"
                tone="muted"
                uppercase
              >
                Presence &amp; Scene State
              </Text>
              <SwitchRow
                icon="Users"
                title="Present In Scene"
                description={
                  form.inScene
                    ? "In Scene: This character is in the current location and part of active story dialogue and events."
                    : "Off-Screen: This character is currently elsewhere or in the background."
                }
                checked={form.inScene}
                onChange={(e) =>
                  setForm((f) => ({ ...f, inScene: e.target.checked }))
                }
              />
              <FormGrid cols={2} gap="sm">
                <TextInput
                  label="Mood"
                  value={form.mood}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, mood: e.target.value }))
                  }
                  placeholder="e.g. cautious, cheerful, brooding"
                  helperText="Current emotional demeanor"
                />
                <TextInput
                  label="Toward Player"
                  value={form.towardPlayer}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, towardPlayer: e.target.value }))
                  }
                  placeholder="e.g. friendly, skeptical, hostile"
                  helperText="Attitude toward the protagonist"
                />
              </FormGrid>
            </Stack>
          </Card>

          <Card variant="panel" padding="md" layout="column" fullWidth>
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              <Text
                as="h4"
                variant="label"
                size="xs"
                weight="semibold"
                tone="muted"
                uppercase
              >
                Memory Summary
              </Text>
              <TextArea
                label="Memory Summary"
                value={form.memorySummary}
                onChange={(e) =>
                  setForm((f) => ({ ...f, memorySummary: e.target.value }))
                }
                rows={3}
                autoGrow
                autoGrowMax={180}
                placeholder="What this character currently remembers about the player or recent events…"
                helperText="Passed to the prompt to maintain continuity without a full sheet"
              />
            </Stack>
          </Card>

          <Card variant="panel" padding="md" layout="column" fullWidth>
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              <Text
                as="h4"
                variant="label"
                size="xs"
                weight="semibold"
                tone="muted"
                uppercase
              >
                Conditions &amp; Flags
              </Text>
              <Stack direction="column" gap="2xs" fullWidth>
                <Text as="label" size="xs" weight="medium" tone="secondary">
                  Conditions
                </Text>
                <TagInput
                  value={form.conditions}
                  onChange={(v) => setForm((f) => ({ ...f, conditions: v }))}
                  placeholder="Add a condition (press Enter or comma)…"
                />
              </Stack>
              <Stack direction="column" gap="2xs" fullWidth>
                <Text as="label" size="xs" weight="medium" tone="secondary">
                  Flags
                </Text>
                <TagInput
                  value={form.flags}
                  onChange={(v) => setForm((f) => ({ ...f, flags: v }))}
                  placeholder="Add a flag (press Enter or comma)…"
                />
              </Stack>
            </Stack>
          </Card>
        </Stack>
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

