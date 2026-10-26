import { useEffect, useMemo, useRef, useState } from "react";
import type {
  CharacterFormat,
  ClothingItem,
  ExportFormat,
} from "../../../schemas";
import {
  STORAGE_PREFERENCE_DEFAULTS,
  createPersona,
  deletePersona,
  deletePersonaPortraitAvatar,
  deletePersonaProfileAvatar,
  downloadPersonaExport,
  getPersona,
  getPersonaAvatarUrl,
  getPromptConfig,
  getViewPreferences,
  importPersonaData,
  listPersonas,
  resolveStoragePreferences,
  setDefaultPersona,
  updatePersona,
  uploadPersonaAvatar,
  type Persona,
} from "../../api";
import {
  formatClothingToText,
  parseClothingFromText,
} from "../../../engine/guidedSectionHelpers";
import {
  ActionsMenu,
  Badge,
  Button,
  Card,
  CharacterAvatar,
  CheckboxRow,
  FormGrid,
  Header,
  Modal,
  Pagination,
  SearchBar,
  Separator,
  SortSelect,
  Stack,
  StatusMessage,
  Tabs,
  TagRow,
  Text,
  TextArea,
  TextInput,
  type ActionsMenuItem,
  type SortSelectOption,
} from "../base";
import { usePagination } from "../../hooks/usePagination";
import {
  CharacterPortraitDrawer,
  ConfirmModal,
  GuidedTextArea,
} from "../common";

export type PersonaLibraryVariant = "page" | "dialog";
export type PersonaViewMode = "portrait" | "list" | "grid";
export type PersonaSortBy = "default" | "name";
export type PersonaSortDir = "asc" | "desc";

export type PersonaLibraryProps = {
  /** `page` renders inline in the Home workspace; `dialog` renders inside a Modal shell. */
  variant?: PersonaLibraryVariant;
  /** Legacy alias for `variant="dialog"`. */
  isModal?: boolean;
  onClose?: () => void;
  onPersonasChanged?: (personas: Persona[]) => void;
};

const PERSONA_SORT_OPTIONS: SortSelectOption<PersonaSortBy>[] = [
  {
    value: "default",
    label: "Default First",
    ascLabel: "First",
    descLabel: "Last",
    ascTooltip: "Default persona first",
    descTooltip: "Default persona last",
  },
  { value: "name", label: "Name" },
];

function formatClothingBadgeLabel(c: ClothingItem): string {
  return `${c.slot}: ${c.name}${c.state ? ` (${c.state})` : ""}`;
}

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

export function PersonaLibrary({
  variant,
  isModal,
  onClose,
  onPersonasChanged,
}: PersonaLibraryProps) {
  const resolvedVariant: PersonaLibraryVariant =
    variant ?? (isModal ? "dialog" : "page");

  const [personas, setPersonas] = useState<Persona[]>([]);
  const [characterFormat, setCharacterFormat] = useState<
    CharacterFormat | undefined
  >(undefined);
  const [personaEditorOpen, setPersonaEditorOpen] = useState(false);
  const [editingPersonaId, setEditingPersonaId] = useState<string | null>(null);
  const [editingWasDefault, setEditingWasDefault] = useState(false);
  const [personaForm, setPersonaForm] = useState<Persona>(emptyPersonaForm());
  const [initialPersonaForm, setInitialPersonaForm] =
    useState<Persona>(emptyPersonaForm());
  const [clothingText, setClothingText] = useState("");
  const [initialClothingText, setInitialClothingText] = useState("");
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaStatus, setPersonaStatus] = useState<{
    text: string;
    isError: boolean;
  } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<{
    id: string;
    name: string;
  } | null>(null);
  const [confirmJsonFallback, setConfirmJsonFallback] = useState<{
    id: string;
    name: string;
    requestedFormat: ExportFormat;
  } | null>(null);
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    STORAGE_PREFERENCE_DEFAULTS.exportFormat,
  );
  const [importing, setImporting] = useState(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);

  const [searchQuery, setSearchQuery] = useState("");
  const [sortBy, setSortBy] = useState<PersonaSortBy>("default");
  const [sortDir, setSortDir] = useState<PersonaSortDir>("asc");
  const [viewMode, setViewMode] = useState<PersonaViewMode>(() => {
    try {
      const saved = localStorage.getItem("persona_library_view_mode");
      if (saved === "portrait" || saved === "list" || saved === "grid") {
        return saved;
      }
    } catch {
      /* ignore */
    }
    return "list";
  });

  function handleChangeViewMode(mode: PersonaViewMode) {
    setViewMode(mode);
    try {
      localStorage.setItem("persona_library_view_mode", mode);
    } catch {
      /* ignore */
    }
  }

  const filteredAndSortedPersonas = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const filtered = q
      ? personas.filter((p) => {
          const clothingStr = p.initialClothing
            .map((c) => `${c.slot} ${c.name} ${c.state ?? ""}`)
            .join(" ");
          const hay =
            `${p.name} ${p.description} ${p.bodyType} ${p.appearance} ${clothingStr}`.toLowerCase();
          return hay.includes(q);
        })
      : personas;

    const dir = sortDir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      if (sortBy === "default") {
        if (a.isDefault !== b.isDefault) {
          return (a.isDefault ? -1 : 1) * dir;
        }
      }
      return a.name.localeCompare(b.name) * dir;
    });
  }, [personas, searchQuery, sortBy, sortDir]);

  const personaPager = usePagination({
    items: filteredAndSortedPersonas,
    persistAs: "persona",
    resetDeps: [searchQuery, sortBy, sortDir],
  });

  const paginationElement = (
    <Pagination
      page={personaPager.page}
      pageSize={personaPager.pageSize}
      total={personaPager.totalItems}
      onPageChange={personaPager.setPage}
      onPageSizeChange={personaPager.setPageSize}
      onCommitCustomPageSize={personaPager.commitCustomPageSize}
      itemLabel="personas"
    />
  );

  useEffect(() => {
    setPersonaStatus(null);
    setPersonaEditorOpen(false);
    setEditingPersonaId(null);
    listPersonas()
      .then(setPersonas)
      .catch((e) =>
        setPersonaStatus({
          text: e instanceof Error ? e.message : String(e),
          isError: true,
        }),
      );
    getPromptConfig()
      .then((state) => {
        if (state.promptConfig?.characterFormat) {
          setCharacterFormat(state.promptConfig.characterFormat);
        }
      })
      .catch(() => {
        /* falls back to DEFAULT_CHARACTER_FORMAT inside GuidedTextArea */
      });
    getViewPreferences()
      .then((prefs) => {
        const resolved = resolveStoragePreferences(prefs);
        setExportFormat(resolved.exportFormat);
      })
      .catch(() => {
        /* falls back to default export format */
      });

    const onStoragePrefsUpdated = (e: Event) => {
      const detail = (e as CustomEvent<{ exportFormat?: ExportFormat }>).detail;
      if (detail?.exportFormat) {
        setExportFormat(detail.exportFormat);
      }
    };
    window.addEventListener(
      "bobbinloom:storage-prefs-updated",
      onStoragePrefsUpdated,
    );
    return () => {
      window.removeEventListener(
        "bobbinloom:storage-prefs-updated",
        onStoragePrefsUpdated,
      );
    };
  }, []);

  function startCreatePersona() {
    const empty = emptyPersonaForm();
    setEditingPersonaId(null);
    setEditingWasDefault(false);
    setPersonaForm(empty);
    setInitialPersonaForm(empty);
    setClothingText("");
    setInitialClothingText("");
    setPersonaEditorOpen(true);
    setPersonaStatus(null);
  }

  async function startEditPersona(id: string) {
    try {
      const p = await getPersona(id);
      const formattedClothing = formatClothingToText(p.initialClothing);
      setPersonaForm(p);
      setInitialPersonaForm(p);
      setClothingText(formattedClothing);
      setInitialClothingText(formattedClothing);
      setEditingPersonaId(id);
      setEditingWasDefault(p.isDefault);
      setPersonaEditorOpen(true);
      setPersonaStatus(null);
    } catch (e) {
      setPersonaStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    }
  }

  function closePersonaEditor() {
    const empty = emptyPersonaForm();
    setPersonaEditorOpen(false);
    setEditingPersonaId(null);
    setEditingWasDefault(false);
    setPersonaForm(empty);
    setInitialPersonaForm(empty);
    setClothingText("");
    setInitialClothingText("");
  }

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
    setPersonaStatus(null);
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
      let savedId: string;
      let savedName: string;

      if (editingPersonaId) {
        const updated = await updatePersona(editingPersonaId, updates);
        savedId = updated.id;
        savedName = updated.name;
        setPersonaStatus({ text: `"${savedName}" saved.`, isError: false });
      } else {
        const created = await createPersona(personaForm.name.trim());
        const updated = await updatePersona(created.id, updates);
        savedId = updated.id;
        savedName = updated.name;
        setPersonaStatus({ text: `"${savedName}" created.`, isError: false });
        if (wantDefault) {
          await setDefaultPersona(savedId);
        }
      }

      const refreshed = await listPersonas();
      setPersonas(refreshed);
      onPersonasChanged?.(refreshed);
      closePersonaEditor();
    } catch (e) {
      setPersonaStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setPersonaSaving(false);
    }
  }

  async function performDeletePersona(id: string) {
    try {
      await deletePersona(id);
      const refreshed = await listPersonas();
      setPersonas(refreshed);
      onPersonasChanged?.(refreshed);
      setPersonaStatus({ text: "Persona deleted.", isError: false });
    } catch (e) {
      setPersonaStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setConfirmDelete(null);
    }
  }

  async function handleSetDefault(id: string) {
    try {
      const updated = await setDefaultPersona(id);
      const refreshed = await listPersonas();
      setPersonas(refreshed);
      onPersonasChanged?.(refreshed);
      if (editingPersonaId === id) {
        setEditingWasDefault(true);
        setPersonaForm((f) => ({ ...f, isDefault: true }));
      }
      setPersonaStatus({
        text: `"${updated.name}" is now your default persona.`,
        isError: false,
      });
    } catch (e) {
      setPersonaStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    }
  }

  async function performExportPersona(
    id: string,
    name: string,
    format: ExportFormat,
  ) {
    try {
      await downloadPersonaExport(id, name, format);
      setPersonaStatus({
        text: `Exported "${name}" as .${format}.`,
        isError: false,
      });
    } catch (e) {
      setPersonaStatus({
        text: e instanceof Error ? e.message : String(e),
        isError: true,
      });
    } finally {
      setConfirmJsonFallback(null);
    }
  }

  function handleRequestExport(p: Persona) {
    if (
      (exportFormat === "webp" || exportFormat === "png") &&
      !p.customPortrait
    ) {
      setConfirmJsonFallback({
        id: p.id,
        name: p.name,
        requestedFormat: exportFormat,
      });
      return;
    }
    void performExportPersona(p.id, p.name, exportFormat);
  }

  async function handleImportFileChange(
    e: React.ChangeEvent<HTMLInputElement>,
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setImporting(true);
    setPersonaStatus(null);
    try {
      const dataBase64 = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => {
          const result = String(reader.result ?? "");
          const commaIndex = result.indexOf(",");
          resolve(commaIndex >= 0 ? result.slice(commaIndex + 1) : result);
        };
        reader.onerror = () =>
          reject(new Error("Failed to read selected file."));
        reader.readAsDataURL(file);
      });
      const { record } = await importPersonaData(dataBase64, file.name);
      const refreshed = await listPersonas();
      setPersonas(refreshed);
      onPersonasChanged?.(refreshed);
      setPersonaStatus({
        text: `Imported persona "${record.name}".`,
        isError: false,
      });
    } catch (err) {
      setPersonaStatus({
        text: err instanceof Error ? err.message : String(err),
        isError: true,
      });
    } finally {
      setImporting(false);
    }
  }

  function renderDefaultButton(p: Persona) {
    if (p.isDefault) {
      return (
        <Button
          variant="primary"
          size="xs"
          leftIcon="Check"
          disabled
          title="Currently active default persona"
        >
          Active
        </Button>
      );
    }
    return (
      <Button
        variant="secondary"
        size="xs"
        leftIcon="Star"
        onClick={() => void handleSetDefault(p.id)}
        disabled={personaSaving}
        title="Set as default persona for new playthroughs"
      >
        Set Default
      </Button>
    );
  }

  function buildPersonaMenuItems(p: Persona): ActionsMenuItem[] {
    return [
      {
        label: "Edit",
        icon: "Pencil",
        disabled: personaSaving,
        onClick: () => void startEditPersona(p.id),
      },
      {
        label: "Export",
        icon: "Download",
        disabled: personaSaving,
        onClick: () => handleRequestExport(p),
      },
      {
        label: "Delete",
        icon: "Trash2",
        danger: true,
        disabled: personaSaving || personas.length <= 1,
        onClick: () => setConfirmDelete({ id: p.id, name: p.name }),
      },
    ];
  }

  const contentBody = (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      {personaStatus ? (
        <StatusMessage
          variant="banner"
          tone={personaStatus.isError ? "err" : "ok"}
          onDismiss={() => setPersonaStatus(null)}
        >
          {personaStatus.text}
        </StatusMessage>
      ) : null}

      {!personaEditorOpen ? (
        <Stack direction="column" align="stretch" gap="sm" fullWidth>
          {/* Toolbar: Search, Sort, View Mode (mirrors PlaythroughLibrary) */}
          <Card variant="elevated" padding="xs" fullWidth>
            <Stack
              direction="row"
              align="center"
              justify="between"
              gap="xs"
              wrap
              fullWidth
            >
              <SearchBar
                value={searchQuery}
                onChange={setSearchQuery}
                onClear={() => setSearchQuery("")}
                placeholder="Search personas by name, description, traits, or clothing…"
                size="sm"
                flex1
                aria-label="Search personas"
              />

              <SortSelect<PersonaSortBy>
                value={sortBy}
                onChange={setSortBy}
                direction={sortDir}
                onDirectionChange={setSortDir}
                options={PERSONA_SORT_OPTIONS}
                size="sm"
                groupAriaLabel="Sort personas"
                aria-label="Sort personas by"
              />

              <Tabs<PersonaViewMode>
                variant="segmented"
                size="sm"
                activeTab={viewMode}
                onChange={handleChangeViewMode}
                ariaLabel="View mode"
                tabs={[
                  {
                    id: "portrait",
                    label: "Portrait",
                    icon: "IdCard",
                  },
                  {
                    id: "list",
                    label: "List",
                    icon: "List",
                  },
                  {
                    id: "grid",
                    label: "Grid",
                    icon: "LayoutGrid",
                  },
                ]}
              />
            </Stack>
          </Card>

          {filteredAndSortedPersonas.length === 0 ? (
            <Card variant="panel" padding="lg">
              <Stack direction="column" align="center" gap="sm">
                <Text size="md" weight="semibold">
                  {personas.length === 0
                    ? "No personas yet"
                    : "No personas match your search"}
                </Text>
                <Text size="sm" tone="secondary" align="center">
                  {personas.length === 0
                    ? "Create a player persona to define your character's narrative introduction, appearance, and starting clothing."
                    : "Try adjusting your search query."}
                </Text>
                {searchQuery ? (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => setSearchQuery("")}
                  >
                    Clear Search
                  </Button>
                ) : null}
              </Stack>
            </Card>
          ) : (
            <Stack direction="column" align="stretch" gap="sm" fullWidth>
              {/* Top pagination only appears when there is more than 1 page */}
              {personaPager.totalPages > 1 ? paginationElement : null}

              {/* VIEW MODE 1: PORTRAIT (2:3 vertical cards) */}
              {viewMode === "portrait" && (
                <FormGrid cols="portrait" gap="md">
                  {personaPager.pageItems.map((p) => (
                    <Card
                      key={p.id}
                      as="article"
                      variant="panel"
                      padding="none"
                      layout="column"
                      hoverable
                      active={p.isDefault}
                    >
                      <Card.Cover position="top" aspect="portrait">
                        <CharacterAvatar persona={p} variant="portrait" />
                      </Card.Cover>
                      <Card.Body padding="sm" gap="xs">
                        <Stack
                          direction="row"
                          align="start"
                          justify="between"
                          gap="xs"
                          fullWidth
                        >
                          <Card.TitleButton
                            title={p.name}
                            onClick={() => void startEditPersona(p.id)}
                          >
                            <Text
                              as="span"
                              size="md"
                              weight="semibold"
                              truncate
                            >
                              {p.name}
                            </Text>
                          </Card.TitleButton>
                          <Card.Interactive>
                            {renderDefaultButton(p)}
                            <ActionsMenu
                              label={`Actions for ${p.name}`}
                              items={buildPersonaMenuItems(p)}
                            />
                          </Card.Interactive>
                        </Stack>

                        <Text
                          as="p"
                          size="xs"
                          tone={p.description ? "secondary" : "muted"}
                          lineClamp={2}
                          reserveLines
                          title={p.description || undefined}
                        >
                          {p.description || "No description provided."}
                        </Text>

                        <TagRow
                          variant="badge"
                          emptyLabel="No clothing"
                          tags={p.initialClothing.map(formatClothingBadgeLabel)}
                        />
                      </Card.Body>
                    </Card>
                  ))}
                </FormGrid>
              )}

              {/* VIEW MODE 2: LIST (Detailed rows with 2:3 framed 1:1 crop & top-right buttons) */}
              {viewMode === "list" && (
                <Stack direction="column" align="stretch" gap="sm" fullWidth>
                  {personaPager.pageItems.map((p) => (
                    <Card
                      key={p.id}
                      as="article"
                      variant="panel"
                      padding="sm"
                      layout="row"
                      hoverable
                      active={p.isDefault}
                    >
                      <CharacterAvatar persona={p} variant="list" />
                      <Stack
                        direction="column"
                        align="stretch"
                        gap="xs"
                        flex1
                        fullWidth
                      >
                        <Stack
                          direction="row"
                          align="start"
                          justify="between"
                          gap="sm"
                          fullWidth
                        >
                          <Card.TitleButton
                            title={p.name}
                            onClick={() => void startEditPersona(p.id)}
                          >
                            <Text
                              as="span"
                              size="md"
                              weight="semibold"
                              truncate
                            >
                              {p.name}
                            </Text>
                          </Card.TitleButton>

                          <Card.Interactive>
                            {renderDefaultButton(p)}
                            <Stack inline gap="xs" hideBelow="sm">
                              <Button
                                variant="secondary"
                                size="xs"
                                leftIcon="Pencil"
                                onClick={() => void startEditPersona(p.id)}
                                disabled={personaSaving}
                              >
                                Edit
                              </Button>
                              <Button
                                variant="secondary"
                                size="xs"
                                leftIcon="Download"
                                onClick={() => handleRequestExport(p)}
                                disabled={personaSaving}
                              >
                                Export
                              </Button>
                              <Button
                                variant="danger"
                                size="xs"
                                leftIcon="Trash2"
                                onClick={() =>
                                  setConfirmDelete({ id: p.id, name: p.name })
                                }
                                disabled={personaSaving || personas.length <= 1}
                              >
                                Delete
                              </Button>
                            </Stack>
                            <Stack inline showBelow="sm">
                              <ActionsMenu
                                label={`Actions for ${p.name}`}
                                items={buildPersonaMenuItems(p)}
                              />
                            </Stack>
                          </Card.Interactive>
                        </Stack>

                        <Text
                          as="p"
                          size="xs"
                          tone={p.description ? "secondary" : "muted"}
                          lineClamp={2}
                          title={p.description || undefined}
                        >
                          {p.description || "No description provided."}
                        </Text>

                        <TagRow
                          variant="badge"
                          emptyLabel="No clothing"
                          tags={p.initialClothing.map(formatClothingBadgeLabel)}
                        />
                      </Stack>
                    </Card>
                  ))}
                </Stack>
              )}

              {/* VIEW MODE 3: GRID (Compact 1:1 square cards) */}
              {viewMode === "grid" && (
                <FormGrid cols="compact" gap="sm">
                  {personaPager.pageItems.map((p) => (
                    <Card
                      key={p.id}
                      as="article"
                      variant="panel"
                      padding="none"
                      layout="column"
                      hoverable
                      active={p.isDefault}
                    >
                      <Card.Cover position="top" aspect="square">
                        <CharacterAvatar persona={p} variant="grid" />
                      </Card.Cover>
                      <Card.Body padding="sm" gap="xs">
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="2xs"
                          fullWidth
                        >
                          <Card.TitleButton
                            title={p.name}
                            onClick={() => void startEditPersona(p.id)}
                          >
                            <Text
                              as="span"
                              size="sm"
                              weight="semibold"
                              truncate
                            >
                              {p.name}
                            </Text>
                          </Card.TitleButton>
                          <Card.Interactive>
                            <ActionsMenu
                              label={`Actions for ${p.name}`}
                              items={buildPersonaMenuItems(p)}
                            />
                          </Card.Interactive>
                        </Stack>

                        <Text
                          as="p"
                          size="xs"
                          tone={p.description ? "secondary" : "muted"}
                          lineClamp={2}
                          reserveLines
                          title={p.description || undefined}
                        >
                          {p.description || "No description provided."}
                        </Text>

                        <TagRow
                          variant="badge"
                          emptyLabel="No clothing"
                          tags={p.initialClothing.map(formatClothingBadgeLabel)}
                        />

                        <Stack
                          direction="row"
                          align="center"
                          justify="center"
                          fullWidth
                        >
                          <Card.Interactive>
                            {renderDefaultButton(p)}
                          </Card.Interactive>
                        </Stack>
                      </Card.Body>
                    </Card>
                  ))}
                </FormGrid>
              )}

              {/* Bottom pagination always appears when items exist */}
              {paginationElement}
            </Stack>
          )}
        </Stack>
      ) : (
        <Card variant="elevated" padding="lg" fullWidth>
          <Stack direction="column" align="stretch" gap="md" fullWidth>
            <Header
              variant="panel"
              leading={
                <Button
                  variant="ghost"
                  size="sm"
                  leftIcon="ArrowLeft"
                  onClick={closePersonaEditor}
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
                  const refreshed = await listPersonas();
                  setPersonas(refreshed);
                  onPersonasChanged?.(refreshed);
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
                  const refreshed = await listPersonas();
                  setPersonas(refreshed);
                  onPersonasChanged?.(refreshed);
                }}
                onDeletePortrait={async () => {
                  if (!editingPersonaId) return;
                  const res =
                    await deletePersonaPortraitAvatar(editingPersonaId);
                  setPersonaForm((f) => ({
                    ...f,
                    customPortrait: res.record.customPortrait,
                    profileImage: res.record.profileImage,
                    avatarUpdatedAt: res.record.avatarUpdatedAt,
                  }));
                  const refreshed = await listPersonas();
                  setPersonas(refreshed);
                  onPersonasChanged?.(refreshed);
                }}
                onDeleteProfile={async () => {
                  if (!editingPersonaId) return;
                  const res =
                    await deletePersonaProfileAvatar(editingPersonaId);
                  setPersonaForm((f) => ({
                    ...f,
                    customPortrait: res.record.customPortrait,
                    profileImage: res.record.profileImage,
                    avatarUpdatedAt: res.record.avatarUpdatedAt,
                  }));
                  const refreshed = await listPersonas();
                  setPersonas(refreshed);
                  onPersonasChanged?.(refreshed);
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
                placeholder={
                  "- Height: 5'10\"\n- Build: Average, travel-hardened"
                }
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
                    if (checked) {
                      void handleSetDefault(editingPersonaId);
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
                  onClick={closePersonaEditor}
                  disabled={personaSaving}
                >
                  Cancel
                </Button>
              </Stack>
            </Stack>
          </Stack>
        </Card>
      )}

      {confirmDelete ? (
        <ConfirmModal
          title={`Delete persona "${confirmDelete.name}"?`}
          message="This removes the persona from the library. Playthroughs created from it keep their own copy."
          confirmLabel="Delete"
          danger
          onConfirm={() => performDeletePersona(confirmDelete.id)}
          onCancel={() => setConfirmDelete(null)}
        />
      ) : null}

      {confirmJsonFallback ? (
        <ConfirmModal
          title={`No portrait — export "${confirmJsonFallback.name}" as .json?`}
          message={`"${confirmJsonFallback.name}" has no portrait image, so it cannot be exported as a .${confirmJsonFallback.requestedFormat} image card. It will be exported as a .json file instead.`}
          confirmLabel="Export as .json"
          cancelLabel="Cancel"
          onConfirm={() =>
            void performExportPersona(
              confirmJsonFallback.id,
              confirmJsonFallback.name,
              "json",
            )
          }
          onCancel={() => setConfirmJsonFallback(null)}
        />
      ) : null}

      <input
        ref={importInputRef}
        type="file"
        accept=".json,.png,.webp,application/json,image/png,image/webp"
        hidden
        onChange={(e) => void handleImportFileChange(e)}
      />
    </Stack>
  );

  if (resolvedVariant === "dialog") {
    return (
      <Modal
        open
        onClose={() => onClose?.()}
        size="wide"
        fullScreenMobile
        ariaLabel="Persona Library"
      >
        <Header
          variant="section"
          icon="User"
          title="Persona Library"
          subtitle="Manage player character personas, physical traits, and starting clothing."
          actions={
            <Stack direction="row" align="center" gap="sm">
              {!personaEditorOpen ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon="Upload"
                    onClick={() => importInputRef.current?.click()}
                    disabled={personaSaving || importing}
                  >
                    {importing ? "Importing…" : "Import"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon="Plus"
                    onClick={startCreatePersona}
                    disabled={personaSaving || importing}
                  >
                    New Persona
                  </Button>
                </>
              ) : null}
              {onClose ? (
                <Button variant="secondary" size="sm" onClick={onClose}>
                  Close
                </Button>
              ) : null}
            </Stack>
          }
        />
        <Modal.Body>
          <Modal.Content>{contentBody}</Modal.Content>
        </Modal.Body>
      </Modal>
    );
  }

  return (
    <Stack direction="column" align="stretch" gap="md" fullWidth>
      <Header
        variant="page"
        title="Persona Library"
        subtitle="Manage player character personas, physical traits, and starting clothing."
        actions={
          !personaEditorOpen ? (
            <Stack direction="row" align="center" gap="sm">
              <Button
                variant="secondary"
                size="md"
                leftIcon="Upload"
                onClick={() => importInputRef.current?.click()}
                disabled={personaSaving || importing}
              >
                {importing ? "Importing…" : "Import Persona"}
              </Button>
              <Button
                variant="primary"
                size="md"
                leftIcon="Plus"
                onClick={startCreatePersona}
                disabled={personaSaving || importing}
              >
                New Persona
              </Button>
            </Stack>
          ) : undefined
        }
      />
      {contentBody}
    </Stack>
  );
}
