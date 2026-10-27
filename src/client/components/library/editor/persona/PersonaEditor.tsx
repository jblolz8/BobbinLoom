import { useEffect, useMemo, useState } from "react";
import type { CharacterFormat } from "../../../../../schemas";
import {
  createPersona,
  deletePersonaPortraitAvatar,
  deletePersonaProfileAvatar,
  getPersonaAvatarUrl,
  setDefaultPersona,
  updatePersona,
  uploadPersonaAvatar,
  type Persona,
} from "../../../../api";
import {
  formatClothingToText,
  parseClothingFromText,
} from "../../../../../engine/guidedSectionHelpers";
import {
  Badge,
  Button,
  Card,
  CheckboxRow,
  Header,
  Separator,
  Stack,
  TextArea,
  TextInput,
} from "../../../base";
import { CharacterPortraitDrawer, GuidedTextArea } from "../../../common";

export type PersonaEditorProps = {
  /** Existing persona to edit, or `null` when creating a new persona. */
  persona: Persona | null;
  characterFormat?: CharacterFormat;
  /** Called after a persona is created or saved so the parent library can refresh and show status. */
  onSaved: (statusText: string) => Promise<void> | void;
  /** Called when an avatar or default status is updated in-place so the parent list stays in sync. */
  onRefreshList?: () => Promise<void> | void;
  /** Called when the user sets an existing persona as default from inside the editor. */
  onSetDefault?: (id: string) => Promise<void>;
  onCancel: () => void;
  onError: (errorText: string) => void;
};

function emptyPersonaForm(): Persona {
  return {
    id: "",
    name: "",
    description: "",
    bodyType: "",
    appearance: "",
    initialClothing: [],
    isDefault: false,
  };
}

export function PersonaEditor({
  persona,
  characterFormat,
  onSaved,
  onRefreshList,
  onSetDefault,
  onCancel,
  onError,
}: PersonaEditorProps) {
  const editingPersonaId = persona?.id || null;
  const [editingWasDefault, setEditingWasDefault] = useState(
    persona?.isDefault ?? false,
  );
  const [personaForm, setPersonaForm] = useState<Persona>(() =>
    persona ?? emptyPersonaForm(),
  );
  const [initialPersonaForm, setInitialPersonaForm] = useState<Persona>(() =>
    persona ?? emptyPersonaForm(),
  );
  const [clothingText, setClothingText] = useState(() =>
    persona ? formatClothingToText(persona.initialClothing) : "",
  );
  const [initialClothingText, setInitialClothingText] = useState(() =>
    persona ? formatClothingToText(persona.initialClothing) : "",
  );
  const [personaSaving, setPersonaSaving] = useState(false);

  useEffect(() => {
    const nextForm = persona ?? emptyPersonaForm();
    const formattedClothing = persona
      ? formatClothingToText(persona.initialClothing)
      : "";
    setPersonaForm(nextForm);
    setInitialPersonaForm(nextForm);
    setClothingText(formattedClothing);
    setInitialClothingText(formattedClothing);
    setEditingWasDefault(persona?.isDefault ?? false);
  }, [persona]);

  const isPersonaDirty = useMemo(() => {
    if (!editingPersonaId) {
      return Boolean(personaForm.name.trim());
    }
    return (
      personaForm.name.trim() !== initialPersonaForm.name.trim() ||
      personaForm.description !== initialPersonaForm.description ||
      personaForm.bodyType !== initialPersonaForm.bodyType ||
      personaForm.appearance !== initialPersonaForm.appearance ||
      clothingText.trim() !== initialClothingText.trim()
    );
  }, [
    editingPersonaId,
    personaForm.name,
    personaForm.description,
    personaForm.bodyType,
    personaForm.appearance,
    initialPersonaForm,
    clothingText,
    initialClothingText,
  ]);

  async function savePersona() {
    if (!personaForm.name.trim() || personaSaving) return;
    setPersonaSaving(true);
    try {
      const parsedClothing = parseClothingFromText(clothingText);
      const updates = {
        name: personaForm.name.trim(),
        description: personaForm.description,
        bodyType: personaForm.bodyType,
        appearance: personaForm.appearance,
        initialClothing: parsedClothing,
      };
      const wantDefault = personaForm.isDefault;

      if (editingPersonaId) {
        const updated = await updatePersona(editingPersonaId, updates);
        await onSaved(`"${updated.name}" saved.`);
      } else {
        const created = await createPersona(personaForm.name.trim());
        const updated = await updatePersona(created.id, updates);
        if (wantDefault) {
          await setDefaultPersona(updated.id);
        }
        await onSaved(`"${updated.name}" created.`);
      }
    } catch (e) {
      onError(e instanceof Error ? e.message : String(e));
    } finally {
      setPersonaSaving(false);
    }
  }

  return (
    <Card variant="elevated" padding="lg" fullWidth>
      <Stack direction="column" align="stretch" gap="md" fullWidth>
        <Header
          variant="panel"
          leading={
            <Button
              variant="ghost"
              size="sm"
              leftIcon="ArrowLeft"
              onClick={onCancel}
              disabled={personaSaving}
            >
              Back to List
            </Button>
          }
          title={
            editingPersonaId
              ? `Edit Persona: ${personaForm.name || "Untitled"}`
              : "Create New Persona"
          }
          subtitle="Define the player character's narrative introduction, physical build, appearance, and starting clothing."
        />

        <Separator />

        <Stack direction="column" align="stretch" gap="md" fullWidth>
          <CharacterPortraitDrawer
            entityId={editingPersonaId}
            entityName={personaForm.name}
            entityLabel="persona"
            portraitUrl={
              editingPersonaId
                ? getPersonaAvatarUrl(
                    editingPersonaId,
                    "portrait",
                    personaForm.avatarUpdatedAt,
                  )
                : null
            }
            profileUrl={
              editingPersonaId
                ? getPersonaAvatarUrl(
                    editingPersonaId,
                    "profile",
                    personaForm.avatarUpdatedAt,
                  )
                : null
            }
            hasCustomPortrait={!!personaForm.customPortrait}
            hasProfileImage={!!personaForm.profileImage}
            onUploadPortrait={async (dataBase64, fileName) => {
              if (!editingPersonaId) return;
              const res = await uploadPersonaAvatar(
                editingPersonaId,
                "portrait",
                dataBase64,
                fileName,
              );
              setPersonaForm((f) => ({
                ...f,
                customPortrait: res.record.customPortrait,
                profileImage: res.record.profileImage,
                avatarUpdatedAt: res.record.avatarUpdatedAt,
              }));
              await onRefreshList?.();
            }}
            onUploadProfile={async (dataBase64, fileName) => {
              if (!editingPersonaId) return;
              const res = await uploadPersonaAvatar(
                editingPersonaId,
                "profile",
                dataBase64,
                fileName,
              );
              setPersonaForm((f) => ({
                ...f,
                customPortrait: res.record.customPortrait,
                profileImage: res.record.profileImage,
                avatarUpdatedAt: res.record.avatarUpdatedAt,
              }));
              await onRefreshList?.();
            }}
            onDeletePortrait={async () => {
              if (!editingPersonaId) return;
              const res = await deletePersonaPortraitAvatar(editingPersonaId);
              setPersonaForm((f) => ({
                ...f,
                customPortrait: res.record.customPortrait,
                profileImage: res.record.profileImage,
                avatarUpdatedAt: res.record.avatarUpdatedAt,
              }));
              await onRefreshList?.();
            }}
            onDeleteProfile={async () => {
              if (!editingPersonaId) return;
              const res = await deletePersonaProfileAvatar(editingPersonaId);
              setPersonaForm((f) => ({
                ...f,
                customPortrait: res.record.customPortrait,
                profileImage: res.record.profileImage,
                avatarUpdatedAt: res.record.avatarUpdatedAt,
              }));
              await onRefreshList?.();
            }}
            disabled={personaSaving}
          />

          <TextInput
            label="Name"
            value={personaForm.name}
            onChange={(e) =>
              setPersonaForm((f) => ({ ...f, name: e.target.value }))
            }
            placeholder="e.g. John Bobbin"
          />

          <TextArea
            label="Description"
            tooltip="Quick narrative introduction, background, personality, or role in the story. Supports {{user}}."
            rows={3}
            autoGrow
            autoGrowMax={200}
            value={personaForm.description}
            onChange={(e) =>
              setPersonaForm((f) => ({ ...f, description: e.target.value }))
            }
            placeholder="Who is this character? Personality, background, quirks…"
          />

          <GuidedTextArea
            sectionKind="body"
            label="Body"
            tooltip="Physical build attributes written as '- Key: Value' bullets (e.g. Height, Build). Used in turn prompts and Scene-mode image generation."
            helperText="Type '-' or press Ctrl+Space for attribute suggestions, or click a chip below."
            rows={3}
            value={personaForm.bodyType}
            onChange={(next) =>
              setPersonaForm((f) => ({ ...f, bodyType: next }))
            }
            characterFormat={characterFormat}
            placeholder={"- Height: 5'10\"\n- Build: Average, travel-hardened"}
          />

          <GuidedTextArea
            sectionKind="appearance"
            label="Appearance"
            tooltip="Facial and surface details written as '- Key: Value' bullets (e.g. Skin, Eyes, Hair, Features)."
            helperText="Type '-' or press Ctrl+Space for appearance attributes, or click a chip below."
            rows={3}
            value={personaForm.appearance}
            onChange={(next) =>
              setPersonaForm((f) => ({ ...f, appearance: next }))
            }
            characterFormat={characterFormat}
            placeholder={
              "- Eyes: Alert and observant\n- Features: Easy, unhurried posture"
            }
          />

          <GuidedTextArea
            sectionKind="clothing"
            label="Initial Clothing"
            tooltip="Starting outfit written as '- Slot: Garment' (with optional '(state)' at the end). Parsed into structured clothing slots for the playthrough."
            helperText="One garment per line as '- Slot: Garment'. Starting clothing may be overridden by scenario generation."
            rows={4}
            value={clothingText}
            onChange={setClothingText}
            characterFormat={characterFormat}
            placeholder={
              "- Top: Simple linen shirt\n- Bottom: Durable travel trousers\n- Feet: Sturdy walking boots"
            }
          />

          <CheckboxRow
            icon="Star"
            title={
              editingWasDefault
                ? "Active as default persona"
                : "Set as default persona"
            }
            description={
              editingWasDefault
                ? "This persona is currently active as your default persona for new playthroughs."
                : "Pre-select this persona automatically when starting a new playthrough."
            }
            checked={personaForm.isDefault}
            statusBadge={
              editingWasDefault ? (
                <Badge variant="warning" size="sm" leftIcon="Check">
                  Active
                </Badge>
              ) : undefined
            }
            onChange={(e) => {
              const checked = e.target.checked;
              if (editingPersonaId) {
                if (checked && onSetDefault) {
                  setEditingWasDefault(true);
                  setPersonaForm((f) => ({ ...f, isDefault: true }));
                  void onSetDefault(editingPersonaId);
                }
              } else {
                setPersonaForm((f) => ({
                  ...f,
                  isDefault: checked,
                }));
              }
            }}
          />

          <Separator />

          <Stack direction="row" align="center" gap="sm">
            <Button
              variant="primary"
              leftIcon="Check"
              onClick={() => void savePersona()}
              disabled={
                personaSaving || !personaForm.name.trim() || !isPersonaDirty
              }
            >
              {personaSaving ? "Saving…" : "Save Persona"}
            </Button>
            <Button
              variant="secondary"
              onClick={onCancel}
              disabled={personaSaving}
            >
              Cancel
            </Button>
          </Stack>
        </Stack>
      </Stack>
    </Card>
  );
}
