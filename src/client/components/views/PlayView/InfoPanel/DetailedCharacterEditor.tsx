import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  CharacterInstance,
  ClothingItem,
  Playthrough,
} from "../../../../../schemas";
import type { CharacterEditPayload } from "../../../../api/characters";
import {
  Badge,
  Button,
  Card,
  CharacterAvatar,
  CheckboxRow,
  CodeBlock,
  Dialog,
  FormGrid,
  Icon,
  SimpleSelect,
  Stack,
  StatusMessage,
  SwitchRow,
  Tabs,
  TagInput,
  Text,
  TextArea,
  TextInput,
} from "../../../base";
import { ConfirmModal, TwoPaneDiff } from "../../../common";
import {
  applySectionChanges,
  parseClothingFromContent,
  splitContentSections,
  type ContentSection,
} from "../../../../../engine/characterSections";
import { CharacterPortraitModal } from "./CharacterPortraitModal";
import { CharacterSheetSections } from "./CharacterSheetSections";
import { sectionProvenance } from "../../../../engine/sheetProvenance";

export type DetailedCharacterEditorProps = {
  character: CharacterInstance;
  playthrough: Playthrough;
  inLibrary: boolean;
  /** The library card's sheet, when one exists — the original this playthrough's copy is measured
   *  against, and the only place a "restore" can come from. */
  originalSheet?: string | null;
  initialMode?: "view" | "edit";
  inScene?: boolean;
  imagePromptPreview?: boolean;
  onPlaythroughChange?: (updated: Playthrough) => void;
  onSave: (payload: CharacterEditPayload) => Promise<void>;
  onSaveToLibrary?: (
    mode: "update" | "newVersion",
    overwritePortrait?: boolean,
  ) => Promise<{ version: number; created: boolean }>;
  onClose: () => void;
};

type EditorForm = {
  name: string;
  storyRole: string;
  summary: string;
  inScene: boolean;
  content: string;
  clothing: ClothingItem[];
  mood: string;
  towardPlayer: string;
  memorySummary: string;
  conditions: string[];
  flags: string[];
};

function instanceToForm(
  char: CharacterInstance,
  playthrough: Playthrough,
  inSceneOverride?: boolean,
): EditorForm {
  const tpl = playthrough.characterTemplates.find(
    (t) => t.id === char.templateId,
  );
  const activeInScene =
    inSceneOverride ?? (playthrough.activeCharacters ?? []).includes(char.id);
  return {
    name: char.name,
    storyRole: char.storyRole || "Stranger",
    summary: tpl?.summary ?? char.description ?? "",
    inScene: activeInScene,
    content: tpl?.content ?? "",
    clothing: [...(char.clothing ?? [])],
    mood: char.mood ?? "",
    towardPlayer: char.towardPlayer ?? "",
    memorySummary: char.memorySummary ?? "",
    conditions: [...(char.conditions ?? [])],
    flags: [...(char.flags ?? [])],
  };
}

function formToPayload(form: EditorForm): CharacterEditPayload {
  const trimmedName = form.name.trim();
  const trimmedRole = form.storyRole.trim();
  const trimmedSummary = form.summary.trim();
  const trimmedMood = form.mood.trim();
  const trimmedToward = form.towardPlayer.trim();
  const trimmedMemory = form.memorySummary.trim();

  return {
    name: trimmedName || undefined,
    storyRole: trimmedRole || undefined,
    summary: trimmedSummary || undefined,
    description: trimmedSummary || undefined,
    inScene: form.inScene,
    content: form.content || undefined,
    mood: trimmedMood || undefined,
    towardPlayer: trimmedToward || undefined,
    memorySummary: trimmedMemory || undefined,
    conditions: form.conditions,
    flags: form.flags,
  };
}

/**
 * A main-cast character's full sheet: the sheet as the story has grown it, and the editor for it.
 *
 * Everything sits on the app's own parts — `Dialog` for the shell (Escape, focus, the backdrop, the
 * action row and the phone sheet all come from one place), `Tabs` for the mode, `TextInput` /
 * `TextArea` / `TagInput` for the fields, `CodeBlock` for the raw text, `TwoPaneDiff` for the
 * comparison against the library card, and `ConfirmModal` for the discard guard.
 *
 * The sheet GROWS from the story: the engine's `characterSection*` patches rewrite sections and bullets
 * as turns happen. So this dialog also SHOWS that — a mark per section read back out of the turn log,
 * and how far the sheet has drifted from the library card it was taken from.
 */
export function DetailedCharacterEditor({
  character,
  playthrough,
  inLibrary,
  originalSheet = null,
  initialMode = "edit",
  inScene,
  imagePromptPreview = true,
  onPlaythroughChange,
  onSave,
  onSaveToLibrary,
  onClose,
}: DetailedCharacterEditorProps) {
  const liveCharacter =
    playthrough.characters.find((c) => c.id === character.id) ?? character;
  const template = playthrough.characterTemplates.find(
    (t) => t.id === liveCharacter.templateId,
  );
  // CCv2-backed sheets are read-only in play (D9): content + clothing are locked.
  const isReadOnlySheet = template?.format === "ccv2";
  const initialForm = useRef<EditorForm>(
    instanceToForm(character, playthrough, inScene),
  );
  const [form, setForm] = useState<EditorForm>(initialForm.current);

  const [mode, setMode] = useState<"view" | "edit">(initialMode);
  const [sheetVariant, setSheetVariant] = useState<"prose" | "badges">("prose");
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [saveToLib, setSaveToLib] = useState(false);
  const [libMode, setLibMode] = useState<"update" | "newVersion">("update");
  const [overwriteLibPortrait, setOverwriteLibPortrait] = useState(false);
  const [portraitModalOpen, setPortraitModalOpen] = useState(false);
  const [pendingDiscard, setPendingDiscard] = useState<"close" | "view" | null>(
    null,
  );
  const [showRaw, setShowRaw] = useState(false);
  const [showDiff, setShowDiff] = useState(false);

  const isDirty = JSON.stringify(form) !== JSON.stringify(initialForm.current);

  useEffect(() => {
    initialForm.current = instanceToForm(character, playthrough, inScene);
    setForm(initialForm.current);
    setMode(initialMode);
    setStatus(null);
    setSaveToLib(false);
    setLibMode("update");
    setOverwriteLibPortrait(false);
    setPendingDiscard(null);
    setShowRaw(false);
    setShowDiff(false);
  }, [character.id, character.updatedAt, initialMode, inScene, playthrough.id]);

  // ── The sheet's own history ────────────────────────────────────────────────────────────────
  /** What the story changed, per section — read from the turn log, never stored a second time. */
  const marks = useMemo(
    () => sectionProvenance(playthrough.messages, character.name),
    [playthrough.messages, character.name],
  );

  const sheetSections = useMemo(
    () => splitContentSections(form.content).sections,
    [form.content],
  );
  const sectionHeaders = useMemo(
    () => sheetSections.map((s) => s.header),
    [sheetSections],
  );

  /** The library card's sections by header: the drift check and the per-section restore both need it. */
  const originSections = useMemo(() => {
    if (!originalSheet) return null;
    const map = new Map<string, string>();
    for (const section of splitContentSections(originalSheet).sections) {
      map.set(section.header.trim().toLowerCase(), section.body.trim());
    }
    return map;
  }, [originalSheet]);

  const divergedFromLibrary =
    originalSheet !== null &&
    (template?.content ?? "").trim() !== originalSheet.trim();

  const driftOf = useCallback(
    (section: ContentSection): "added" | "changed" | "same" | null => {
      if (!originSections) return null;
      const original = originSections.get(section.header.trim().toLowerCase());
      if (original === undefined) return "added";
      return original === section.body.trim() ? "same" : "changed";
    },
    [originSections],
  );

  function restoreSection(header: string) {
    if (!originalSheet) return;
    const original = splitContentSections(originalSheet).sections.find(
      (section) =>
        section.header.trim().toLowerCase() === header.trim().toLowerCase(),
    );
    if (!original) return;
    setForm((f) => ({
      ...f,
      content: applySectionChanges(f.content, [
        { header, body: original.body },
      ]),
    }));
  }

  // ── Leaving, and switching mode, with a draft in hand ───────────────────────────────────────
  // Every exit routes through here — Escape, the backdrop, Close and the mode switch — because four
  // entry points is how a guard gets bypassed.
  const requestClose = useCallback(() => {
    if (mode === "edit" && isDirty) {
      setPendingDiscard("close");
      return;
    }
    onClose();
  }, [mode, isDirty, onClose]);

  const requestMode = useCallback(
    (next: "view" | "edit") => {
      if (next === mode) return;
      if (mode === "edit" && isDirty) {
        setPendingDiscard("view");
        return;
      }
      setMode(next);
    },
    [mode, isDirty],
  );

  function confirmDiscard() {
    const action = pendingDiscard;
    setPendingDiscard(null);
    if (action === "close") {
      onClose();
      return;
    }
    setForm(initialForm.current);
    setMode("view");
  }

  async function handleSave(closeAfter: boolean) {
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setStatus({ text: "Character name is required.", isError: true });
      return;
    }
    setSaving(true);
    setStatus(null);
    try {
      const payload = formToPayload(form);
      if (isReadOnlySheet) {
        // CCv2 sheets are read-only (D9): never submit the sheet blob or clothing.
        delete payload.content;
        delete payload.clothing;
      } else {
        // The content field is authoritative: the [Clothing] section IS the
        // current outfit. Re-derive structured clothing from it on save so the
        // prompt's derived Clothing line stays honest.
        payload.clothing = parseClothingFromContent(form.content);
      }
      await onSave(payload);

      let libMsg = "";
      if (saveToLib && onSaveToLibrary) {
        // The reader chooses: overwrite the card, or mint a version beside it. The choice only means
        // anything once the card exists and this sheet has moved on from it.
        const result = await onSaveToLibrary(libMode, overwriteLibPortrait);
        libMsg = result.created
          ? ` + saved to the library as v${result.version}`
          : " + library card updated";
      }

      initialForm.current = {
        ...form,
        clothing: [...form.clothing],
        conditions: [...form.conditions],
        flags: [...form.flags],
      };
      setStatus({ text: `"${trimmedName}" updated${libMsg}.`, isError: false });

      if (closeAfter) {
        setTimeout(onClose, 1000);
      }
    } catch (e) {
      setStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setSaving(false);
    }
  }

  // ══════════════════════════════════════════════════════════════════════════════════════════
  const modeTabs = useMemo(
    () => [
      { id: "view" as const, label: "View" },
      { id: "edit" as const, label: "Edit" },
    ],
    [],
  );

  const variantTabs = useMemo(
    () => [
      { id: "prose" as const, label: "Prose" },
      { id: "badges" as const, label: "Badges" },
    ],
    [],
  );

  const renderSectionExtra = (section: ContentSection) => {
    const drift = driftOf(section);
    if (!drift || drift === "same") return null;
    return (
      <Stack direction="row" align="center" gap="xs" wrap>
        <Badge variant={drift === "added" ? "info" : "warning"} size="xs">
          {drift === "added"
            ? "new since the library"
            : "changed since the library"}
        </Badge>
        {/* Read-only CCv2 sheets never submit their blob, so restoring one would look like it worked
            and quietly not persist. The marker still shows; only the action is withheld. */}
        {isReadOnlySheet ? null : (
          <Button
            size="xs"
            variant="ghost"
            leftIcon={<Icon name="RotateCcw" size={11} />}
            onClick={() => restoreSection(section.header)}
          >
            Restore the original
          </Button>
        )}
      </Stack>
    );
  };

  const driftBlock =
    originalSheet !== null ? (
      <Card variant="panel" padding="md" layout="column" fullWidth>
        <Stack direction="column" align="stretch" gap="xs" fullWidth>
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="xs"
            wrap
            fullWidth
          >
            <Stack direction="row" align="center" gap="xs" wrap>
              <Text
                as="h4"
                variant="label"
                size="xs"
                weight="semibold"
                tone="muted"
                uppercase
              >
                Against the library card
              </Text>
              <Badge
                variant={divergedFromLibrary ? "warning" : "neutral"}
                size="xs"
              >
                {divergedFromLibrary ? "changed" : "identical"}
              </Badge>
            </Stack>
            {divergedFromLibrary ? (
              <Button
                size="xs"
                variant="ghost"
                leftIcon={showDiff ? "EyeOff" : "GitCompare"}
                onClick={() => setShowDiff((v) => !v)}
              >
                {showDiff ? "Hide the comparison" : "Compare with the original"}
              </Button>
            ) : null}
          </Stack>
          <Text as="p" size="xs" tone="secondary" leading="snug">
            {divergedFromLibrary
              ? "This playthrough's sheet has grown since the character was taken from the library. The card is the original; this copy is the story's."
              : "This playthrough's sheet is still the library card's."}
          </Text>
          {divergedFromLibrary && showDiff ? (
            <TwoPaneDiff
              leftLabel="Library original"
              rightLabel="This playthrough"
              leftContent={originalSheet}
              rightContent={form.content}
            />
          ) : null}
        </Stack>
      </Card>
    ) : null;

  const runtimeState = (
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
          Runtime state
        </Text>

        <FormGrid cols={2} gap="sm">
          <Stack direction="column" gap="2xs">
            <Text size="xs" tone="muted" weight="medium">
              Story role
            </Text>
            <div>
              {form.storyRole ? (
                <Badge variant="accent" size="xs">
                  {form.storyRole}
                </Badge>
              ) : (
                <Text as="span" size="xs" tone="muted" italic>
                  —
                </Text>
              )}
            </div>
          </Stack>

          <Stack direction="column" gap="2xs">
            <Text size="xs" tone="muted" weight="medium">
              Presence
            </Text>
            <div>
              {form.inScene ? (
                <Badge variant="success" size="xs">
                  ● In Scene (Active)
                </Badge>
              ) : (
                <Badge variant="neutral" size="xs">
                  ○ Off-Screen (Inactive)
                </Badge>
              )}
            </div>
          </Stack>

          <Stack direction="column" gap="2xs">
            <Text size="xs" tone="muted" weight="medium">
              Mood
            </Text>
            <Text size="xs" tone={form.mood ? "primary" : "muted"}>
              {form.mood || "—"}
            </Text>
          </Stack>

          <Stack direction="column" gap="2xs">
            <Text size="xs" tone="muted" weight="medium">
              Toward player
            </Text>
            <Text size="xs" tone={form.towardPlayer ? "primary" : "muted"}>
              {form.towardPlayer || "—"}
            </Text>
          </Stack>
        </FormGrid>

        <Stack direction="column" gap="2xs" fullWidth>
          <Text size="xs" tone="muted" weight="medium">
            Off-screen summary
          </Text>
          <Text
            size="xs"
            tone={form.summary ? "primary" : "muted"}
            leading="snug"
            preWrap
          >
            {form.summary || "—"}
          </Text>
        </Stack>

        <Stack direction="column" gap="2xs" fullWidth>
          <Text size="xs" tone="muted" weight="medium">
            Memory
          </Text>
          <Text
            size="xs"
            tone={form.memorySummary ? "primary" : "muted"}
            leading="snug"
            preWrap
          >
            {form.memorySummary || "—"}
          </Text>
        </Stack>

        <Stack direction="column" gap="2xs" fullWidth>
          <Text size="xs" tone="muted" weight="medium">
            Conditions
          </Text>
          {form.conditions.length > 0 ? (
            <Stack direction="row" align="center" gap="xs" wrap>
              {form.conditions.map((cond, idx) => (
                <Badge key={`${cond}-${idx}`} variant="warning" size="xs" pill>
                  {cond}
                </Badge>
              ))}
            </Stack>
          ) : (
            <Text size="xs" tone="muted">
              —
            </Text>
          )}
        </Stack>

        <Stack direction="column" gap="2xs" fullWidth>
          <Text size="xs" tone="muted" weight="medium">
            Flags
          </Text>
          {form.flags.length > 0 ? (
            <Stack direction="row" align="center" gap="xs" wrap>
              {form.flags.map((flag, idx) => (
                <Badge key={`${flag}-${idx}`} variant="outline" size="xs" pill>
                  {flag}
                </Badge>
              ))}
            </Stack>
          ) : (
            <Text size="xs" tone="muted">
              —
            </Text>
          )}
        </Stack>

        <Stack direction="column" gap="2xs" fullWidth>
          <Text size="xs" tone="muted" weight="medium">
            Clothing
          </Text>
          {form.clothing.length > 0 ? (
            <Stack direction="row" align="center" gap="xs" wrap>
              {form.clothing.map((c, idx) => (
                <Badge key={`${c.slot}-${idx}`} variant="outline" size="sm">
                  <Text as="span" size="xs" tone="muted" weight="medium">
                    {c.slot}:
                  </Text>
                  <Text as="span" size="xs" weight="medium">
                    {c.name}
                    {c.state ? ` (${c.state})` : ""}
                  </Text>
                </Badge>
              ))}
            </Stack>
          ) : (
            <Text size="xs" tone="muted">
              —
            </Text>
          )}
        </Stack>
      </Stack>
    </Card>
  );

  const readOnlyBadge = isReadOnlySheet ? (
    <Badge
      variant="info"
      size="xs"
      title="CCv2 sheets are read-only in play — conversion coming later"
    >
      read-only CCv2 sheet
    </Badge>
  ) : null;

  return (
    <>
      <Dialog
        title={form.name || character.name}
        description={
          <Stack direction="row" align="center" gap="xs" wrap>
            <Text as="span" size="xs" tone="muted">
              {mode === "view" ? "Read-only view" : "Edit mode"}
            </Text>
            {form.storyRole ? (
              <Badge variant="accent" size="xs">
                {form.storyRole}
              </Badge>
            ) : null}
            <Badge variant={form.inScene ? "success" : "neutral"} size="xs">
              {form.inScene ? "● In Scene" : "○ Off-Screen"}
            </Badge>
            {isDirty ? (
              <Badge variant="warning" size="xs" pill>
                Unsaved changes
              </Badge>
            ) : null}
          </Stack>
        }
        maxWidth={820}
        scrollable
        fullScreenMobile
        isBusy={saving}
        onClose={requestClose}
        headerAction={
          <Stack direction="row" align="center" gap="xs" wrap>
            {onPlaythroughChange ? (
              <Button
                size="sm"
                variant="secondary"
                leftIcon="IdCard"
                onClick={() => setPortraitModalOpen(true)}
                title="Generate or manage playthrough portraits for this character"
              >
                Portrait Media
                {(liveCharacter.avatars?.length ?? 0) > 0
                  ? ` (${liveCharacter.avatars!.length})`
                  : ""}
              </Button>
            ) : null}
            <Tabs
              tabs={modeTabs}
              activeTab={mode}
              onChange={requestMode}
              variant="pill"
              size="sm"
              ariaLabel="Sheet mode"
            />
            <Button size="sm" variant="secondary" onClick={requestClose}>
              Close
            </Button>
          </Stack>
        }
        footer={
          mode === "edit" ? (
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
                onClick={requestClose}
              >
                Cancel
              </Button>
            </>
          ) : (
            <>
              {/* A restore from the library card edits the draft in view mode, so view mode needs a
                  way to land it — otherwise the one mode where the sections (and their drift markers)
                  are visible would be the one mode that cannot save. */}
              {isDirty && !isReadOnlySheet ? (
                <Button
                  variant="primary"
                  isLoading={saving}
                  disabled={saving}
                  onClick={() => {
                    void handleSave(false);
                  }}
                >
                  Save
                </Button>
              ) : null}
              <Button
                variant="secondary"
                leftIcon="Pencil"
                onClick={() => requestMode("edit")}
              >
                Edit
              </Button>
              <Button variant="secondary" onClick={requestClose}>
                Close
              </Button>
            </>
          )
        }
      >
        <Stack direction="column" align="stretch" gap="md" fullWidth>
          {status ? (
            <StatusMessage
              variant="banner"
              tone={status.isError ? "err" : "ok"}
            >
              {status.text}
            </StatusMessage>
          ) : null}

          <Card variant="panel" padding="sm" layout="row" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="md"
              wrap
              fullWidth
            >
              <Stack direction="row" align="center" gap="sm">
                <CharacterAvatar
                  template={
                    template ?? {
                      id: liveCharacter.templateId ?? "",
                      name: liveCharacter.name,
                    }
                  }
                  avatarFile={liveCharacter.avatarFile}
                  playthroughId={playthrough.id}
                  variant="grid"
                  size={56}
                  alt={liveCharacter.name}
                />
                <Stack direction="column" gap="2xs">
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Text size="xs" weight="semibold">
                      Playthrough Portrait
                    </Text>
                    {liveCharacter.avatarFile ? (
                      <Badge variant="accent" size="xs">
                        Playthrough portrait active
                      </Badge>
                    ) : (
                      <Badge variant="neutral" size="xs">
                        Library default
                      </Badge>
                    )}
                    {(liveCharacter.avatars?.length ?? 0) > 0 ? (
                      <Badge variant="outline" size="xs">
                        {liveCharacter.avatars!.length} in history
                      </Badge>
                    ) : null}
                  </Stack>
                  <Text size="xs" tone="secondary">
                    Generate a solo chest-to-head portrait from this sheet or
                    switch between turn-by-turn portraits.
                  </Text>
                </Stack>
              </Stack>

              {onPlaythroughChange ? (
                <Button
                  size="sm"
                  variant="ai"
                  leftIcon="Sparkles"
                  onClick={() => setPortraitModalOpen(true)}
                >
                  Generate / Manage Portrait
                </Button>
              ) : null}
            </Stack>
          </Card>

          {mode === "view" ? (
            <>
              <Card variant="panel" padding="md" layout="column" fullWidth>
                <Stack direction="column" align="stretch" gap="sm" fullWidth>
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    wrap
                    fullWidth
                  >
                    <Stack direction="row" align="center" gap="xs" wrap>
                      <Text
                        as="h4"
                        variant="label"
                        size="xs"
                        weight="semibold"
                        tone="muted"
                        uppercase
                      >
                        Character sheet
                      </Text>
                      {readOnlyBadge}
                    </Stack>
                    {sheetSections.length > 0 ? (
                      <Stack direction="row" align="center" gap="xs" wrap>
                        <Tabs
                          tabs={variantTabs}
                          activeTab={sheetVariant}
                          onChange={setSheetVariant}
                          variant="pill"
                          size="sm"
                          ariaLabel="Sheet display style"
                        />
                        <Button
                          size="xs"
                          variant="ghost"
                          leftIcon={showRaw ? "EyeOff" : "Code"}
                          onClick={() => setShowRaw((v) => !v)}
                        >
                          {showRaw
                            ? "Hide the raw sheet"
                            : "Show the raw sheet"}
                        </Button>
                      </Stack>
                    ) : null}
                  </Stack>

                  {sheetSections.length > 0 ? (
                    <CharacterSheetSections
                      content={form.content}
                      headers={sectionHeaders}
                      variant={sheetVariant}
                      marks={marks}
                      renderSectionExtra={renderSectionExtra}
                    />
                  ) : (
                    <Text as="p" size="xs" tone="muted" italic>
                      No character data. This character has no sheet yet.
                    </Text>
                  )}

                  {showRaw ? (
                    <CodeBlock
                      code={form.content || "(empty)"}
                      label="Raw sheet"
                      wrap
                      maxHeight={320}
                      showCopy
                    />
                  ) : null}
                </Stack>
              </Card>

              {runtimeState}
            </>
          ) : (
            <>
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
                    Identity &amp; Presence
                  </Text>
                  <FormGrid cols={2} gap="sm">
                    <TextInput
                      label="Name"
                      value={form.name}
                      required
                      onChange={(e) =>
                        setForm((f) => ({ ...f, name: e.target.value }))
                      }
                    />
                    <TextInput
                      label="Story Role"
                      placeholder="e.g. Companion, Mentor, Rival, Local Blacksmith"
                      helperText="Their narrative role or occupation in the story"
                      value={form.storyRole}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, storyRole: e.target.value }))
                      }
                    />
                  </FormGrid>

                  <TextInput
                    label="Summary"
                    helperText="One-line description used when the character is away from the scene"
                    value={form.summary}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, summary: e.target.value }))
                    }
                  />

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
                </Stack>
              </Card>

              <Card variant="panel" padding="md" layout="column" fullWidth>
                <Stack direction="column" align="stretch" gap="sm" fullWidth>
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <Text
                      as="h4"
                      variant="label"
                      size="xs"
                      weight="semibold"
                      tone="muted"
                      uppercase
                    >
                      Character sheet
                    </Text>
                    {readOnlyBadge}
                  </Stack>
                  <TextArea
                    label="Content"
                    helperText="Full character sheet text — [Section] headers, in the order your current preset's Character Sheet format defines. [Clothing] slot bullets here are the character's current outfit."
                    rows={18}
                    value={form.content}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, content: e.target.value }))
                    }
                    placeholder={"[Species]: ..."}
                    disabled={isReadOnlySheet}
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
                    Runtime state
                  </Text>
                  <FormGrid cols={2} gap="sm">
                    <TextInput
                      label="Mood"
                      helperText="Current emotional state"
                      value={form.mood}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, mood: e.target.value }))
                      }
                      placeholder="e.g. curious, wary, hostile"
                    />
                    <TextInput
                      label="Toward player"
                      helperText="How the character feels about the player"
                      value={form.towardPlayer}
                      onChange={(e) =>
                        setForm((f) => ({ ...f, towardPlayer: e.target.value }))
                      }
                      placeholder="e.g. friendly but guarded"
                    />
                  </FormGrid>

                  <TextArea
                    label="Memory summary"
                    helperText="What the character remembers about the player and recent events"
                    rows={3}
                    autoGrow
                    autoGrowMax={180}
                    value={form.memorySummary}
                    onChange={(e) =>
                      setForm((f) => ({ ...f, memorySummary: e.target.value }))
                    }
                  />

                  <Stack direction="column" gap="2xs" fullWidth>
                    <Text as="label" size="xs" weight="medium" tone="secondary">
                      Conditions
                    </Text>
                    <TagInput
                      value={form.conditions}
                      onChange={(v) =>
                        setForm((f) => ({ ...f, conditions: v }))
                      }
                      placeholder="Add a condition…"
                    />
                  </Stack>

                  <Stack direction="column" gap="2xs" fullWidth>
                    <Text as="label" size="xs" weight="medium" tone="secondary">
                      Flags
                    </Text>
                    <TagInput
                      value={form.flags}
                      onChange={(v) => setForm((f) => ({ ...f, flags: v }))}
                      placeholder="Add a flag…"
                    />
                  </Stack>
                </Stack>
              </Card>

              {onSaveToLibrary ? (
                <Card variant="panel" padding="md" layout="column" fullWidth>
                  <Stack direction="column" align="stretch" gap="sm" fullWidth>
                    <SwitchRow
                      title="Also update the library copy"
                      description={
                        inLibrary
                          ? "Write this sheet back to the library card it came from"
                          : "There is no library card with this id yet — saving adds one"
                      }
                      checked={saveToLib}
                      onChange={(e) => setSaveToLib(e.target.checked)}
                    />
                    <Stack direction="row" align="center" gap="xs" wrap>
                      {inLibrary ? (
                        <Badge variant="success" size="xs">
                          in the library
                        </Badge>
                      ) : (
                        <Badge variant="neutral" size="xs">
                          not in the library
                        </Badge>
                      )}
                      {inLibrary && divergedFromLibrary ? (
                        <Badge variant="warning" size="xs">
                          this copy has changed since
                        </Badge>
                      ) : null}
                    </Stack>
                    {saveToLib && inLibrary && divergedFromLibrary ? (
                      <Stack
                        direction="column"
                        align="stretch"
                        gap="xs"
                        fullWidth
                      >
                        <SimpleSelect
                          value={libMode}
                          onChange={setLibMode}
                          size="sm"
                          fullWidth
                          aria-label="How to save this sheet to the library"
                          options={[
                            {
                              value: "update",
                              label: "Overwrite the library card",
                              description: "The card becomes this sheet",
                            },
                            {
                              value: "newVersion",
                              label: "Save as a new version",
                              description: "The original card is kept",
                            },
                          ]}
                        />
                        <Text as="p" size="xs" tone="secondary" leading="snug">
                          Overwriting replaces the card every future playthrough
                          starts from — the comparison below shows exactly what
                          would change.
                        </Text>
                      </Stack>
                    ) : null}
                    {saveToLib &&
                    inLibrary &&
                    libMode === "update" &&
                    Boolean(liveCharacter.avatarFile) ? (
                      <CheckboxRow
                        checked={overwriteLibPortrait}
                        onChange={(e) =>
                          setOverwriteLibPortrait(e.target.checked)
                        }
                        title="Also overwrite library portrait"
                        description="Replace the global Character Library card's portrait with this playthrough's current portrait."
                      />
                    ) : null}
                  </Stack>
                </Card>
              ) : null}
            </>
          )}

          {driftBlock}
        </Stack>
      </Dialog>

      {portraitModalOpen && onPlaythroughChange ? (
        <CharacterPortraitModal
          character={liveCharacter}
          localTemplate={template}
          playthrough={playthrough}
          imagePromptPreview={imagePromptPreview}
          onPlaythroughChange={onPlaythroughChange}
          onClose={() => setPortraitModalOpen(false)}
        />
      ) : null}

      {/* The dirty guard. It STACKS on the sheet, which is what the dialog stack is for: Escape closes
          this one and only this one, and focus stays here. */}
      {pendingDiscard ? (
        <ConfirmModal
          title="Discard unsaved changes?"
          message={`Your edits to ${character.name}'s sheet have not been saved.`}
          confirmLabel="Discard changes"
          cancelLabel="Keep editing"
          danger
          onConfirm={confirmDiscard}
          onCancel={() => setPendingDiscard(null)}
        />
      ) : null}
    </>
  );
}
