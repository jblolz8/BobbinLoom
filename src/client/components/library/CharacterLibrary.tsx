import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate, ExportFormat } from "../../../schemas";
import type { CharacterFormat } from "../../../schemas";
import type { ViewPreferences } from "../../../schemas";
import {
  deleteCharacter,
  detachCharacterCcv2,
  downloadCharacterExport,
  duplicateCharacter,
  importCharacter,
  listCharacters,
  updateCharacter,
} from "../../api";
import {
  convertCharacterApply,
  convertCharacterGenerate,
  reformatCharacterApply,
  reformatCharacterGenerate,
  suggestCharacterTags,
  getPromptConfig,
  listPresets,
  getPreset,
} from "../../api";
import {
  LIBRARY_PREFERENCE_DEFAULTS,
  STORAGE_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  getViewPreferences,
  resolveLibraryPreferences,
  resolveStoragePreferences,
  updateViewPreferences,
} from "../../api";
import type { Preset, ResolvedLibraryPreferences } from "../../api";
import { resolveCharacterFormat } from "../../../engine/characterFormat";
import {
  buildCharacterFamilyTree,
  displayTitle,
  hasCcv2Source,
  hasDistinctTitle,
  entryKind,
  filterLibraryEntries,
  cardBadgeLabel,
  groupByLineage,
  getGroupCreatedAt,
  getGroupUpdatedAt,
  type CharacterSortOption,
  type SortDirection,
} from "../../../engine/characterCards";
import {
  CharacterExportModal,
  type CharacterExportModalSubmitOptions,
} from "./CharacterExportModal";
import {
  ActionsMenu,
  Badge,
  Button,
  Card,
  CharacterAvatar,
  Dialog,
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
  TagChip,
  TagRow,
  TagSidebar,
  Text,
  Tooltip,
  type ActionsMenuItem,
} from "../base";
export { CharacterAvatar } from "../base";
import { usePagination } from "../../hooks/usePagination";
import {
  CardFamilyModal,
  ConfirmModal,
  EditTagsModal,
  type EditTagsAiContextOption,
} from "../common";
import { TagTaxonomyModal } from "./TagTaxonomyModal";
import { CharacterEditor, ConvertToBLModal } from "./editor";
import { getTagTaxonomy } from "../../api";
import { sortTags, type TagTaxonomyConfig } from "../../../engine/tagTaxonomy";

export type CharacterLibraryProps = {
  variant?: "page" | "dialog";
  isModal?: boolean;
  onClose?: () => void;
  initialEditingId?: string;
};

export type ViewMode = "portrait" | "list" | "grid";

function formatLibraryDate(isoOrStr?: string): string {
  if (!isoOrStr) return "";
  try {
    const d = new Date(isoOrStr);
    if (isNaN(d.getTime())) return "";
    return d.toLocaleDateString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

export function CharacterLibrary({
  variant,
  isModal,
  onClose,
  initialEditingId,
}: CharacterLibraryProps) {
  const resolvedVariant: "page" | "dialog" =
    variant ?? (isModal ? "dialog" : "page");
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearchState] = useState(LIBRARY_PREFERENCE_DEFAULTS.search);

  const setSearch = (val: string) => {
    setSearchState(val);
    writeLibraryPreference({ search: val });
  };

  const [importing, setImporting] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>(
    LIBRARY_PREFERENCE_DEFAULTS.viewMode,
  );

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    writeLibraryPreference({ viewMode: mode });
  };

  const [sortBy, setSortByState] = useState<CharacterSortOption>(
    LIBRARY_PREFERENCE_DEFAULTS.sortBy,
  );

  const [sortDirection, setSortDirectionState] = useState<SortDirection>(
    LIBRARY_PREFERENCE_DEFAULTS.sortDir,
  );

  const setSortBy = (option: CharacterSortOption) => {
    const nextDir: SortDirection =
      option === "createdAt" || option === "updatedAt" ? "desc" : "asc";
    setSortByState(option);
    setSortDirectionState(nextDir);
    writeLibraryPreference({ sortBy: option, sortDir: nextDir });
  };

  const toggleSortDirection = () => {
    const nextDir: SortDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirectionState(nextDir);
    writeLibraryPreference({ sortDir: nextDir });
  };
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Conversion state ──
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const [convertProviderId, setConvertProviderIdState] = useState(
    LIBRARY_PREFERENCE_DEFAULTS.characterConvertProviderId,
  );
  const [characterConvertImmediately, setCharacterConvertImmediatelyState] =
    useState<boolean>(LIBRARY_PREFERENCE_DEFAULTS.characterConvertImmediately);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [diffData, setDiffData] = useState<{
    oldContent: string;
    newContent: string;
    recordId: string;
    characterName?: string;
    readOnly?: boolean;
    kind?: "convert" | "reformat";
  } | null>(null);

  // ── Target character format (drives Convert to BL and Update into Newer Format) ──
  const [presetOptions, setPresetOptions] = useState<Preset[]>([]);
  const [targetFormatId, setTargetFormatId] = useState<string | null>(null);
  const targetFormat: CharacterFormat = useMemo(() => {
    const preset = presetOptions.find((p) => p.id === targetFormatId);
    return resolveCharacterFormat(preset?.characterFormat);
  }, [presetOptions, targetFormatId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [summaries, def] = await Promise.all([
          listPresets(),
          getPromptConfig(),
        ]);
        const full = await Promise.all(summaries.map((s) => getPreset(s.id)));
        if (cancelled) return;
        setPresetOptions(full);
        // Default the picker to the active preset (the one backing the global config).
        setTargetFormatId((cur) => cur ?? def.activePresetId);
      } catch {
        // Ignore preset-load failures — the format falls back to Default.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Import notice state ──
  const [importNotice, setImportNotice] = useState<{
    message: string;
    existingRecord: CharacterTemplate;
  } | null>(null);

  // ── Conversion success banner state ──
  const [convertedSuccess, setConvertedSuccess] = useState<{
    recordId: string;
    recordName: string;
    template: CharacterTemplate;
    kind?: "convert" | "reformat";
  } | null>(null);

  // ── Import success banner state ──
  const [importSuccess, setImportSuccess] = useState<{
    recordId: string;
    recordName: string;
    template: CharacterTemplate;
    extraCount?: number;
  } | null>(null);

  // ── Export state ──
  const [exportFormat, setExportFormat] = useState<ExportFormat>(
    STORAGE_PREFERENCE_DEFAULTS.exportFormat,
  );
  const [alwaysAskExportFormat, setAlwaysAskExportFormat] = useState<boolean>(
    STORAGE_PREFERENCE_DEFAULTS.alwaysAskExportFormat,
  );
  const [exportTarget, setExportTarget] = useState<CharacterTemplate | null>(
    null,
  );
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  // ── Delete success banner state ──
  const [deleteSuccess, setDeleteSuccess] = useState<{
    recordName: string;
  } | null>(null);

  // ── Library error banner state ──
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // ── Tag Taxonomy & Categorization State ──
  const [taxonomyConfig, setTaxonomyConfig] =
    useState<TagTaxonomyConfig | null>(null);
  const [taxonomyModalOpen, setTaxonomyModalOpen] = useState(false);
  const [familyTargetId, setFamilyTargetId] = useState<string | null>(null);
  const [familyBusy, setFamilyBusy] = useState(false);
  const [familyError, setFamilyError] = useState<string | null>(null);
  const [tagsTargetId, setTagsTargetId] = useState<string | null>(null);
  const [tagsSaving, setTagsSaving] = useState(false);
  const [tagsError, setTagsError] = useState<string | null>(null);
  const tagsTarget = useMemo(
    () =>
      tagsTargetId
        ? (templates.find((t) => t.id === tagsTargetId) ?? null)
        : null,
    [tagsTargetId, templates],
  );

  function handleEditTagsRequest(template: CharacterTemplate) {
    setTagsError(null);
    setTagsTargetId(template.id);
  }

  function handleOpenCardFamily(template: CharacterTemplate) {
    setFamilyError(null);
    setFamilyTargetId(template.id);
  }

  async function handleSetCharacterParent(
    cardId: string,
    parentId: string | undefined,
    options?: { detachCcv2?: boolean },
  ) {
    setFamilyBusy(true);
    setFamilyError(null);
    try {
      await updateCharacter(cardId, { parentId: parentId ?? "" });
      if (options?.detachCcv2) {
        await detachCharacterCcv2(cardId);
      }
      setTemplates(await listCharacters());
    } catch (e) {
      setFamilyError(e instanceof Error ? e.message : String(e));
    } finally {
      setFamilyBusy(false);
    }
  }

  async function handleDetachCharacterCcv2(cardId: string) {
    setFamilyBusy(true);
    setFamilyError(null);
    try {
      await detachCharacterCcv2(cardId);
      const refreshed = await listCharacters();
      setTemplates(refreshed);
    } catch (e) {
      setFamilyError(e instanceof Error ? e.message : String(e));
    } finally {
      setFamilyBusy(false);
    }
  }

  async function submitCharacterTags(nextTags: string[]) {
    if (!tagsTarget) return;
    setTagsSaving(true);
    setTagsError(null);
    try {
      const normalized = sortTags(nextTags, taxonomyConfig);
      const updated = await updateCharacter(tagsTarget.id, {
        tags: normalized,
      });
      setTemplates((prev) =>
        prev.map((t) => (t.id === updated.id ? updated : t)),
      );
      setTagsTargetId(null);
    } catch (e) {
      setTagsError(e instanceof Error ? e.message : String(e));
    } finally {
      setTagsSaving(false);
    }
  }
  const [sidebarViewMode, setSidebarViewModeState] = useState<
    "grouped" | "flat"
  >(LIBRARY_PREFERENCE_DEFAULTS.sidebarViewMode);

  const setSidebarViewMode = (mode: "grouped" | "flat") => {
    setSidebarViewModeState(mode);
    writeLibraryPreference({ sidebarViewMode: mode });
  };

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(
    () => new Set(LIBRARY_PREFERENCE_DEFAULTS.collapsedCategories),
  );
  const [characterShowFullTitle, setCharacterShowFullTitle] = useState<boolean>(
    LIBRARY_PREFERENCE_DEFAULTS.characterShowFullTitle,
  );
  const [characterShowFullComments, setCharacterShowFullComments] =
    useState<boolean>(LIBRARY_PREFERENCE_DEFAULTS.characterShowFullComments);
  const [characterShowAllTags, setCharacterShowAllTags] = useState<boolean>(
    LIBRARY_PREFERENCE_DEFAULTS.characterShowAllTags,
  );

  /** Set the moment the reader changes any of these, so a read that lands later never overwrites what
   *  they just chose. */
  const libraryPrefsTouchedRef = useRef(false);

  /** One writer for every list preference: state first so the click feels instant, then the leaf that
   *  changed. The device keeps nothing. */
  const writeLibraryPreference = (patch: ViewPreferences["library"]) => {
    libraryPrefsTouchedRef.current = true;
    void updateViewPreferences({ library: patch }).catch(() => {
      /* The next read reconciles; a failed write must not break the control. */
    });
  };

  const setConvertProviderId = (providerId: string) => {
    setConvertProviderIdState(providerId);
    writeLibraryPreference({ characterConvertProviderId: providerId });
  };

  const handleToggleConvertImmediately = (checked: boolean) => {
    setCharacterConvertImmediatelyState(checked);
    writeLibraryPreference({ characterConvertImmediately: checked });
  };

  const applyLibraryPreferences = (prefs: ResolvedLibraryPreferences) => {
    setViewModeState(prefs.viewMode);
    setSortByState(prefs.sortBy);
    setSortDirectionState(prefs.sortDir);
    setSidebarViewModeState(prefs.sidebarViewMode);
    setCollapsedCategories(new Set(prefs.collapsedCategories));
    setSearchState(prefs.search);
    setCharacterShowFullTitle(prefs.characterShowFullTitle);
    setCharacterShowFullComments(prefs.characterShowFullComments);
    setCharacterShowAllTags(prefs.characterShowAllTags);
    setCharacterConvertImmediatelyState(prefs.characterConvertImmediately);
    setConvertProviderIdState(prefs.characterConvertProviderId);
  };

  // These preferences live on the server now (adopting whatever this device still holds first), so they
  // arrive after the first paint — while the list is still loading, which is what keeps the swap
  // invisible rather than a grid that rearranges itself.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled) return;
      const resolvedStorage = resolveStoragePreferences(preferences);
      setExportFormat(resolvedStorage.exportFormat);
      setAlwaysAskExportFormat(resolvedStorage.alwaysAskExportFormat);
      const resolved = resolveLibraryPreferences(preferences);
      if (!libraryPrefsTouchedRef.current) {
        applyLibraryPreferences(resolved);
      } else {
        setCharacterShowFullTitle(resolved.characterShowFullTitle);
        setCharacterShowFullComments(resolved.characterShowFullComments);
        setCharacterShowAllTags(resolved.characterShowAllTags);
        setCharacterConvertImmediatelyState(
          resolved.characterConvertImmediately,
        );
        setConvertProviderIdState(resolved.characterConvertProviderId);
      }
    })().catch(() => {
      /* A failed read leaves the defaults; the next load tries again. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    function handlePrefsUpdated(event: Event) {
      const detail = (
        event as CustomEvent<NonNullable<ViewPreferences["library"]>>
      ).detail;
      if (!detail) return;
      if (typeof detail.characterShowFullTitle === "boolean") {
        setCharacterShowFullTitle(detail.characterShowFullTitle);
      }
      if (typeof detail.characterShowFullComments === "boolean") {
        setCharacterShowFullComments(detail.characterShowFullComments);
      }
      if (typeof detail.characterShowAllTags === "boolean") {
        setCharacterShowAllTags(detail.characterShowAllTags);
      }
      if (typeof detail.characterConvertImmediately === "boolean") {
        setCharacterConvertImmediatelyState(detail.characterConvertImmediately);
      }
      if (typeof detail.characterConvertProviderId === "string") {
        setConvertProviderIdState(detail.characterConvertProviderId);
      }
    }
    window.addEventListener(
      "bobbinloom:library-prefs-updated",
      handlePrefsUpdated,
    );
    return () => {
      window.removeEventListener(
        "bobbinloom:library-prefs-updated",
        handlePrefsUpdated,
      );
    };
  }, []);

  // ── Deletion Confirmation Modal State ──
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  async function loadData() {
    try {
      const [chars, taxRes] = await Promise.all([
        listCharacters(),
        getTagTaxonomy().catch(() => ({
          tagTaxonomy: { customCategories: [], tagOverrides: {} },
        })),
      ]);
      setTemplates(chars);
      if (taxRes?.tagTaxonomy) {
        setTaxonomyConfig(taxRes.tagTaxonomy);
      }
    } catch {
      setTemplates([]);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

  // Automatically open specific template editor if initialEditingId is passed
  useEffect(() => {
    if (initialEditingId && templates.length > 0 && !editorOpen) {
      const match = templates.find((t) => t.id === initialEditingId);
      if (match) {
        openEdit(match);
      }
    }
  }, [initialEditingId, templates, editorOpen]);

  function openCreate() {
    setEditingId(null);
    setEditorOpen(true);
    setStatus(null);
    setConvertedSuccess(null);
  }

  function openEdit(t: CharacterTemplate) {
    setEditingId(t.id);
    setEditorOpen(true);
    setStatus(null);
    setConvertedSuccess(null);
  }

  function closeEditor() {
    setEditorOpen(false);
    setEditingId(null);
    setStatus(null);
  }

  function requestOpenEdit(template: CharacterTemplate) {
    openEdit(template);
  }

  async function handleDuplicateAsVariant(template: CharacterTemplate) {
    setLibraryError(null);
    setDeleteSuccess(null);
    setImportSuccess(null);
    setConvertedSuccess(null);
    try {
      const duplicated = await duplicateCharacter(template.id);
      const refreshed = await listCharacters();
      setTemplates(refreshed);
      const target =
        refreshed.find((t) => t.id === duplicated.id) ?? duplicated;
      openEdit(target);
      setStatus(
        `Created variant "${displayTitle(target)}" (in-story name: "${target.name}").`,
      );
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    }
  }

  function requestDelete(id: string, name: string) {
    setDeleteTarget({ id, name });
  }

  async function handleConfirmDelete() {
    if (!deleteTarget) return;
    const { id, name } = deleteTarget;
    setDeleteTarget(null);
    setLibraryError(null);
    setImportSuccess(null);
    setConvertedSuccess(null);
    try {
      await deleteCharacter(id);
      if (editingId === id) {
        closeEditor();
      }
      setTemplates(await listCharacters());
      setDeleteSuccess({ recordName: name });
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    }
  }

  async function performExportCharacter(
    card: CharacterTemplate,
    options: CharacterExportModalSubmitOptions,
  ) {
    setExporting(true);
    setExportError(null);
    setLibraryError(null);
    try {
      if (options.rememberFormat) {
        setExportFormat(options.format);
        setAlwaysAskExportFormat(false);
        void updateViewPreferences({
          storage: {
            exportFormat: options.format,
            alwaysAskExportFormat: false,
          },
        }).catch(() => {});
      }
      await downloadCharacterExport(card.id, displayTitle(card), {
        format: options.format,
        includeCcv2: options.includeCcv2,
        includeFamily: options.includeFamily,
      });
      setExportTarget(null);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      if (exportTarget) {
        setExportError(msg);
      } else {
        setLibraryError(msg);
      }
    } finally {
      setExporting(false);
    }
  }

  async function handleRequestExport(card: CharacterTemplate) {
    if (entryKind(card) === "ccv2") return;
    setExportError(null);

    let currentFormat = exportFormat;
    let currentAlwaysAsk = alwaysAskExportFormat;
    try {
      const prefs = await getViewPreferences();
      const resolved = resolveStoragePreferences(prefs);
      currentFormat = resolved.exportFormat;
      currentAlwaysAsk = resolved.alwaysAskExportFormat;
      setExportFormat(currentFormat);
      setAlwaysAskExportFormat(currentAlwaysAsk);
    } catch {
      /* fallback to state */
    }

    const family = buildCharacterFamilyTree(card.id, templates);
    const relatedBlFamily = family
      ? family.members.filter((m) => m.id !== card.id && m.format !== "ccv2")
      : [];
    const hasCcv2 = hasCcv2Source(card);
    const hasPortrait = Boolean(
      card.customPortrait ||
        card.cardRef?.kind === "png" ||
        card.avatarUpdatedAt,
    );
    const needsFallbackConfirm =
      (currentFormat === "webp" || currentFormat === "png") && !hasPortrait;

    if (
      !currentAlwaysAsk &&
      !hasCcv2 &&
      relatedBlFamily.length === 0 &&
      !needsFallbackConfirm
    ) {
      await performExportCharacter(card, {
        format: currentFormat,
        includeCcv2: false,
        includeFamily: false,
        rememberFormat: false,
      });
      return;
    }

    setExportTarget(card);
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    setLibraryError(null);
    setDeleteSuccess(null);
    setImportSuccess(null);
    setConvertedSuccess(null);
    try {
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result ?? ""));
        reader.onerror = () =>
          reject(reader.error ?? new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1); // strip data: prefix
      const result = await importCharacter(file.name, base64);
      // Check for already-converted notice
      if (
        "notice" in result &&
        (result as Record<string, unknown>).notice === "already_converted"
      ) {
        const existing = (result as Record<string, unknown>)
          .existingRecord as CharacterTemplate;
        setImportNotice({
          message:
            "This character already exists with its original content, importing will make no change.",
          existingRecord: existing,
        });
        return;
      }
      const refreshed = await listCharacters();
      setTemplates(refreshed);
      const extraCount =
        Array.isArray(result.records) && result.records.length > 1
          ? result.records.length - 1
          : 0;
      setImportSuccess({
        recordId: result.record.id,
        recordName: displayTitle(result.record),
        template: result.record,
        ...(extraCount > 0 ? { extraCount } : {}),
      });
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  // ── Conversion handlers ──

  async function handleConvert(template: CharacterTemplate) {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    setConvertError(null);
    setDiffData({
      oldContent: template.content,
      newContent: "",
      recordId: template.id,
      characterName: displayTitle(template),
      kind: "convert",
    });

    if (!characterConvertImmediately) {
      setConvertingId(null);
      setConvertLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setConvertingId(template.id);
    setConvertLoading(true);

    try {
      const result = await convertCharacterGenerate(template.id, {
        format: targetFormat,
        providerId: convertProviderId || undefined,
        signal: controller.signal,
      });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: template.id,
        characterName: displayTitle(template),
        kind: "convert",
      });
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("aborted") ||
            e.message.includes("cancelled")))
      ) {
        return;
      }
      const errMsg = e instanceof Error ? e.message : String(e);
      setConvertError(errMsg);
    } finally {
      if (abortControllerRef.current === controller) {
        setConvertingId(null);
        setConvertLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  async function handleConvertRetry(feedback: string) {
    if (!diffData) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setConvertingId(diffData.recordId);
    setConvertLoading(true);
    setConvertError(null);
    try {
      const result = await convertCharacterGenerate(diffData.recordId, {
        feedback: feedback.trim() || undefined,
        currentContent: diffData.newContent.trim()
          ? diffData.newContent
          : undefined,
        format: targetFormat,
        providerId: convertProviderId || undefined,
        signal: controller.signal,
      });
      setDiffData((prev) =>
        prev
          ? {
              ...prev,
              oldContent: result.originalContent,
              newContent: result.content,
              kind: "convert",
            }
          : null,
      );
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("aborted") ||
            e.message.includes("cancelled")))
      ) {
        return;
      }
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortControllerRef.current === controller) {
        setConvertingId(null);
        setConvertLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  async function handleConvertAccept() {
    if (!diffData || !diffData.newContent.trim()) return;
    setConvertLoading(true);
    setConvertError(null);
    try {
      const applyResult = await convertCharacterApply(
        diffData.recordId,
        diffData.newContent,
      );
      const convertedRecordId = diffData.recordId;
      setDiffData(null);
      setConvertingId(null);
      const refreshed = await listCharacters();
      setTemplates(refreshed);

      const targetTpl =
        refreshed.find((t) => t.id === convertedRecordId) ?? applyResult.record;
      setConvertedSuccess({
        recordId: convertedRecordId,
        recordName: displayTitle(targetTpl),
        template: targetTpl,
        kind: "convert",
      });
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConvertLoading(false);
    }
  }

  function handleStopConvertLoading() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setConvertLoading(false);
    setConvertingId(null);
  }

  function closeDiffModal() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }
    setConvertLoading(false);
    setConvertingId(null);
    setConvertError(null);
    setDiffData(null);
  }

  // ── Reformat an existing BL sheet into the target format (preview/accept) ──
  async function handleReformat(currentContent?: string) {
    if (!editingId) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
      abortControllerRef.current = null;
    }

    const activeTpl = templates.find((t) => t.id === editingId);
    setConvertError(null);
    setDiffData({
      oldContent: currentContent || activeTpl?.content || "",
      newContent: "",
      recordId: editingId,
      characterName: activeTpl ? displayTitle(activeTpl) : "",
      kind: "reformat",
    });

    if (!characterConvertImmediately) {
      setConvertLoading(false);
      return;
    }

    const controller = new AbortController();
    abortControllerRef.current = controller;
    setConvertLoading(true);

    try {
      const result = await reformatCharacterGenerate(editingId, {
        format: targetFormat,
        providerId: convertProviderId || undefined,
        signal: controller.signal,
      });
      setDiffData((prev) =>
        prev
          ? {
              ...prev,
              oldContent: result.originalContent,
              newContent: result.content,
              kind: "reformat",
            }
          : null,
      );
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("aborted") ||
            e.message.includes("cancelled")))
      ) {
        return;
      }
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortControllerRef.current === controller) {
        setConvertLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  async function handleReformatRetry(feedback: string) {
    if (!diffData) return;
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    const controller = new AbortController();
    abortControllerRef.current = controller;

    setConvertLoading(true);
    setConvertError(null);
    try {
      const result = await reformatCharacterGenerate(diffData.recordId, {
        format: targetFormat,
        providerId: convertProviderId || undefined,
        currentContent: diffData.newContent.trim()
          ? diffData.newContent
          : undefined,
        feedback: feedback.trim() || undefined,
        signal: controller.signal,
      });
      setDiffData((prev) =>
        prev
          ? {
              ...prev,
              oldContent: result.originalContent,
              newContent: result.content,
              kind: "reformat",
            }
          : null,
      );
    } catch (e) {
      if (
        controller.signal.aborted ||
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("aborted") ||
            e.message.includes("cancelled")))
      ) {
        return;
      }
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      if (abortControllerRef.current === controller) {
        setConvertLoading(false);
        abortControllerRef.current = null;
      }
    }
  }

  async function handleReformatAccept() {
    if (!diffData) return;
    setConvertLoading(true);
    setConvertError(null);
    try {
      const result = await reformatCharacterApply(
        diffData.recordId,
        diffData.newContent,
      );
      const reformattedRecordId = diffData.recordId;
      setDiffData(null);
      setConvertingId(null);
      const refreshed = await listCharacters();
      setTemplates(refreshed);

      const targetTpl =
        refreshed.find((t) => t.id === reformattedRecordId) ?? result.record;
      setConvertedSuccess({
        recordId: reformattedRecordId,
        recordName: displayTitle(targetTpl),
        template: targetTpl,
        kind: "reformat",
      });
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConvertLoading(false);
    }
  }

  // ── Tag calculations & Booru toggles ──
  const allTagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of templates) {
      for (const tag of t.tags ?? []) {
        const norm = tag.trim().toLowerCase();
        if (norm) {
          map.set(norm, (map.get(norm) ?? 0) + 1);
        }
      }
    }
    return [...map.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }, [templates]);

  function toggleCategoryCollapse(categoryId: string) {
    const next = new Set(collapsedCategories);
    if (next.has(categoryId)) next.delete(categoryId);
    else next.add(categoryId);
    setCollapsedCategories(next);
    writeLibraryPreference({ collapsedCategories: [...next] });
  }

  const activeFilterTags = useMemo(() => {
    return search
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.startsWith("tag:") && t.length > 4)
      .map((t) => t.slice(4));
  }, [search]);

  function isTagActive(tag: string): boolean {
    const raw = tag.toLowerCase();
    const norm = raw.replace(/\s+/g, "_");
    return activeFilterTags.some(
      (t) => t === norm || t === raw || t.replace(/_/g, " ") === raw,
    );
  }

  function toggleTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = search.split(/\s+/).filter(Boolean);
    const existingIdx = tokens.findIndex((t) => {
      const low = t.toLowerCase();
      return low === tagToken || low === `tag:${tag.toLowerCase()}`;
    });
    let next: string[];
    if (existingIdx >= 0) {
      next = tokens.filter((_, i) => i !== existingIdx);
    } else {
      next = [...tokens, tagToken];
    }
    setSearch(next.join(" "));
  }

  function removeFilterTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = search.split(/\s+/).filter(Boolean);
    const next = tokens.filter((t) => {
      const low = t.toLowerCase();
      return low !== tagToken && low !== `tag:${tag.toLowerCase()}`;
    });
    setSearch(next.join(" "));
  }

  // ── Filtering and Pagination ──
  const filteredTemplates = useMemo(
    () => filterLibraryEntries(templates, search),
    [templates, search],
  );
  const groups = useMemo(
    () => groupByLineage(filteredTemplates, sortBy, sortDirection),
    [filteredTemplates, sortBy, sortDirection],
  );

  // Pagination — shared maths + state (engine/pagination.ts + hooks/usePagination.ts).
  const pager = usePagination({
    items: groups,
    persistAs: "library",
    resetDeps: [search, sortBy, sortDirection],
  });
  const paginatedGroups = pager.pageItems;

  const paginationElement = (
    <Pagination
      page={pager.page}
      pageSize={pager.pageSize}
      total={pager.totalItems}
      onPageChange={pager.setPage}
      onPageSizeChange={pager.setPageSize}
      onCommitCustomPageSize={pager.commitCustomPageSize}
      itemLabel="characters"
    />
  );

  function buildCharacterMenuItems(
    latest: CharacterTemplate,
    isConverting: boolean,
  ): Array<ActionsMenuItem | null> {
    return [
      {
        label: "Edit",
        icon: "Pencil",
        onClick: () => requestOpenEdit(latest),
      },
      {
        label: "Edit Tags",
        icon: "Tag",
        onClick: () => handleEditTagsRequest(latest),
      },
      {
        label: "Card Family",
        icon: "GitBranch",
        onClick: () => handleOpenCardFamily(latest),
      },
      {
        label: "Duplicate as Variant",
        icon: "Copy",
        onClick: () => void handleDuplicateAsVariant(latest),
      },
      entryKind(latest) === "bl"
        ? {
            label: "Export",
            icon: "Download",
            onClick: () => void handleRequestExport(latest),
          }
        : null,
      entryKind(latest) === "ccv2"
        ? {
            label: isConverting ? "Converting…" : "Convert to BL",
            icon: "Sparkles",
            iconClassName: isConverting ? "sparkle-pulse" : undefined,
            disabled: isConverting,
            onClick: () => void handleConvert(latest),
          }
        : null,
      {
        label: "Delete",
        icon: "Trash2",
        danger: true,
        onClick: () => requestDelete(latest.id, displayTitle(latest)),
      },
    ];
  }

  function renderCharacterBadges(
    group: (typeof paginatedGroups)[number],
    latest: CharacterTemplate,
    badge: ReturnType<typeof cardBadgeLabel>,
  ) {
    const family = buildCharacterFamilyTree(latest.id, templates);
    const hasFamily = Boolean(family && family.members.length > 1);
    return (
      <>
        {hasDistinctTitle(latest) ? (
          <Badge
            variant="outline"
            size="xs"
            leftIcon="User"
            title={`In-story character name used by the AI: ${latest.name}`}
          >
            {latest.name}
          </Badge>
        ) : null}
        {hasFamily && family ? (
          <Card.Interactive>
            <Badge
              variant="outline"
              size="xs"
              leftIcon="GitBranch"
              role="button"
              tabIndex={0}
              title={
                family.parent
                  ? `Child variant of ${displayTitle(family.parent)} (${family.members.length} cards in family) — click to manage Card Family`
                  : `Root parent of ${family.members.length - 1} variant${family.members.length - 1 === 1 ? "" : "s"} — click to manage Card Family`
              }
              onClick={() => handleOpenCardFamily(latest)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  handleOpenCardFamily(latest);
                }
              }}
            >
              {family.parent
                ? `Parent: ${displayTitle(family.parent)}`
                : `Family (${family.members.length})`}
            </Badge>
          </Card.Interactive>
        ) : null}
        {badge === "ccv2" ? (
          <Badge variant="warning" size="xs">
            CCv2
          </Badge>
        ) : null}
        {badge === "ccv2bl" ? (
          <Badge variant="info" size="xs">
            CCv2 / BL
          </Badge>
        ) : null}
        {badge === null ? (
          <Badge variant="accent" size="xs">
            BL
          </Badge>
        ) : null}
        {latest.cardVersion?.trim() ? (
          <Badge variant="neutral" size="xs">
            {latest.cardVersion.trim()}
          </Badge>
        ) : null}
        {group.versions.length > 1 ? (
          <Badge variant="neutral" size="xs">
            {group.versions.length} versions
          </Badge>
        ) : null}
      </>
    );
  }

  function renderCharacterDate(group: (typeof paginatedGroups)[number]) {
    const isCreated = sortBy === "createdAt";
    const rawIso = isCreated
      ? getGroupCreatedAt(group)
      : getGroupUpdatedAt(group) || getGroupCreatedAt(group);
    const shortDate = formatLibraryDate(rawIso);
    if (!rawIso || !shortDate) return null;
    const fullTimestamp = `${isCreated ? "Created" : "Updated"}: ${new Date(rawIso).toLocaleString()}`;
    return (
      <Card.Interactive>
        <Tooltip content={fullTimestamp}>
          <Text as="span" size="xs" tone="muted" truncate>
            {shortDate}
          </Text>
        </Tooltip>
      </Card.Interactive>
    );
  }

  const contentBody = (
    <Stack
      direction="column"
      align="stretch"
      gap="md"
      fullWidth
      className={resolvedVariant === "dialog" ? "is-modal" : ""}
    >
      {resolvedVariant === "dialog" ? (
        <Stack direction="row" align="center">
          <Badge
            variant="outline"
            size="sm"
            title="Edits modify global templates used for new playthroughs"
          >
            🌐 Global Character Templates
          </Badge>
        </Stack>
      ) : null}

      {importing ? (
        <StatusMessage variant="banner" tone="neutral" icon="Upload" loading>
          Importing character card…
        </StatusMessage>
      ) : null}

      {convertedSuccess ? (
        <StatusMessage
          variant="banner"
          tone="ok"
          icon="CheckCircle2"
          onDismiss={() => setConvertedSuccess(null)}
        >
          <Stack direction="row" align="center" gap="sm" wrap>
            <span>
              {convertedSuccess.kind === "reformat" ? (
                <>
                  Successfully updated{" "}
                  <strong>&quot;{convertedSuccess.recordName}&quot;</strong>{" "}
                  into the newer format!
                </>
              ) : (
                <>
                  Successfully converted and saved{" "}
                  <strong>&quot;{convertedSuccess.recordName}&quot;</strong> to
                  BobbinLoom format!
                </>
              )}
            </span>
            {!editorOpen || editingId !== convertedSuccess.recordId ? (
              <Button
                type="button"
                variant="secondary"
                size="xs"
                rightIcon="ArrowRight"
                onClick={() => {
                  openEdit(convertedSuccess.template);
                  setConvertedSuccess(null);
                }}
              >
                Open in Editor
              </Button>
            ) : null}
          </Stack>
        </StatusMessage>
      ) : null}

      {importSuccess ? (
        <StatusMessage
          variant="banner"
          tone="ok"
          icon="CheckCircle2"
          onDismiss={() => setImportSuccess(null)}
        >
          <Stack direction="row" align="center" gap="sm" wrap>
            <span>
              Successfully imported{" "}
              <strong>&quot;{importSuccess.recordName}&quot;</strong>
              {importSuccess.extraCount && importSuccess.extraCount > 0 ? (
                <>
                  {" "}
                  and <strong>{importSuccess.extraCount}</strong> related family{" "}
                  {importSuccess.extraCount === 1 ? "card" : "cards"}
                </>
              ) : null}{" "}
              into the library!
            </span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              rightIcon="ArrowRight"
              onClick={() => {
                openEdit(importSuccess.template);
                setImportSuccess(null);
              }}
            >
              Open in Editor
            </Button>
          </Stack>
        </StatusMessage>
      ) : null}

      {deleteSuccess ? (
        <StatusMessage
          variant="banner"
          tone="neutral"
          icon="Trash2"
          onDismiss={() => setDeleteSuccess(null)}
        >
          Character card <strong>&quot;{deleteSuccess.recordName}&quot;</strong>{" "}
          was deleted from the library.
        </StatusMessage>
      ) : null}

      {libraryError ? (
        <StatusMessage
          variant="banner"
          tone="err"
          icon="AlertTriangle"
          autoCollapseDetail
          onDismiss={() => setLibraryError(null)}
        >
          {libraryError}
        </StatusMessage>
      ) : null}

      {editorOpen ? (
        <CharacterEditor
          template={
            editingId
              ? (templates.find((t) => t.id === editingId) ?? null)
              : null
          }
          initialStatus={status}
          allLibraryTags={allTagCounts.map((t) => t.tag)}
          taxonomyConfig={taxonomyConfig}
          presetOptions={presetOptions}
          targetFormatId={targetFormatId}
          onTargetFormatChange={(val) => setTargetFormatId(val)}
          targetFormat={targetFormat}
          convertLoading={convertLoading}
          onRequestConvert={(tpl) => void handleConvert(tpl)}
          onRequestReformat={(currentContent) =>
            void handleReformat(currentContent)
          }
          onRequestDelete={(id, name) => requestDelete(id, name)}
          onTemplateUpdated={(updated) => {
            setTemplates((prev) =>
              prev.map((t) => (t.id === updated.id ? updated : t)),
            );
          }}
          onSaved={async (savedId) => {
            setEditingId(savedId);
            setTemplates(await listCharacters());
          }}
          onClose={closeEditor}
        />
      ) : (
        <Stack direction="row" align="start" gap="lg" fullWidth stackBelow="md">
          {/* ── Left-side Booru Tag Sidebar (shared primitive) ── */}
          <TagSidebar
            taxonomy="character"
            userConfig={taxonomyConfig}
            tagCounts={allTagCounts}
            activeTags={activeFilterTags}
            onToggleTag={toggleTag}
            onClearTags={search.trim() ? () => setSearch("") : undefined}
            mode={sidebarViewMode}
            onModeChange={setSidebarViewMode}
            collapsedCategories={collapsedCategories}
            onToggleCategory={toggleCategoryCollapse}
          />

          {/* ── Main Gallery Area ── */}
          <Stack direction="column" align="stretch" gap="sm" flex1 fullWidth>
            {/* Top Toolbar (mirrors PlaythroughLibrary & PersonaLibrary) */}
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
                  value={search}
                  onChange={setSearch}
                  onClear={() => setSearch("")}
                  placeholder="Search characters by name, tags, creator:…"
                  size="sm"
                  flex1
                  aria-label="Search characters"
                />

                <SortSelect<CharacterSortOption>
                  value={sortBy}
                  onChange={setSortBy}
                  direction={sortDirection}
                  onToggleDirection={toggleSortDirection}
                  options={[
                    { value: "name", label: "Name" },
                    { value: "createdAt", label: "Created Date" },
                    { value: "updatedAt", label: "Updated Date" },
                  ]}
                  size="sm"
                  groupAriaLabel="Sort library"
                  aria-label="Sort characters by"
                />

                <Tabs<ViewMode>
                  variant="segmented"
                  size="sm"
                  activeTab={viewMode}
                  onChange={setViewMode}
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

            {/* Active Search Summary Filter Chips */}
            {activeFilterTags.length > 0 ? (
              <Card variant="panel" padding="xs" fullWidth>
                <Stack direction="row" align="center" gap="xs" wrap>
                  <Text variant="overline" size="2xs" tone="muted">
                    Active filters:
                  </Text>
                  {activeFilterTags.map((tag) => (
                    <TagChip
                      key={tag}
                      tag={tag}
                      userConfig={taxonomyConfig}
                      active
                      size="sm"
                      onRemove={() => removeFilterTag(tag)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => setSearch("")}
                  >
                    Clear all
                  </Button>
                </Stack>
              </Card>
            ) : null}

            {/* Results Gallery according to ViewMode */}
            {groups.length === 0 ? (
              <Card variant="panel" padding="lg">
                <Stack direction="column" align="center" gap="sm">
                  <Text size="md" weight="semibold">
                    {templates.length === 0
                      ? "No characters yet"
                      : "No characters match your search"}
                  </Text>
                  <Text size="sm" tone="secondary" align="center">
                    {templates.length === 0
                      ? "Create a new character sheet or import a CCv2 / BobbinLoom card to get started."
                      : "Try adjusting your search query or clearing active tag filters."}
                  </Text>
                  {search ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => setSearch("")}
                    >
                      Reset filters
                    </Button>
                  ) : null}
                </Stack>
              </Card>
            ) : (
              <Stack direction="column" align="stretch" gap="sm" fullWidth>
                {pager.totalPages > 1 ? paginationElement : null}

                {/* 1. Card Portrait View */}
                {viewMode === "portrait" && (
                  <FormGrid cols="portrait" gap="md">
                    {paginatedGroups.map((group) => {
                      const latest = group.versions[0];
                      const badge = cardBadgeLabel(latest);
                      const isConverting =
                        convertingId === latest.id && convertLoading;
                      const sortedTags = sortTags(
                        latest.tags ?? [],
                        taxonomyConfig,
                      );
                      return (
                        <Card
                          key={group.key}
                          as="article"
                          variant="panel"
                          padding="none"
                          layout="column"
                          hoverable
                          aiPulse={isConverting}
                        >
                          <Card.Cover position="top" aspect="portrait">
                            <CharacterAvatar
                              template={latest}
                              variant="portrait"
                            />
                          </Card.Cover>

                          <Card.Body padding="sm" gap="xs">
                            {/* Row 1: Name + Action Menu */}
                            <Stack
                              direction="row"
                              align="start"
                              justify="between"
                              gap="xs"
                              fullWidth
                            >
                              <Card.TitleButton
                                title={displayTitle(latest)}
                                onClick={() => requestOpenEdit(latest)}
                              >
                                <Text
                                  as="span"
                                  size="md"
                                  weight="semibold"
                                  lineClamp={
                                    characterShowFullTitle ? undefined : 2
                                  }
                                  preWrap={characterShowFullTitle}
                                >
                                  {displayTitle(latest)}
                                </Text>
                              </Card.TitleButton>
                              <Card.Interactive>
                                <ActionsMenu
                                  label={`Actions for ${displayTitle(latest)}`}
                                  items={buildCharacterMenuItems(
                                    latest,
                                    isConverting,
                                  )}
                                />
                              </Card.Interactive>
                            </Stack>

                            {/* Row 2: Format, Version, Date */}
                            <Stack
                              direction="row"
                              align="center"
                              justify="between"
                              gap="2xs"
                              wrap
                              fullWidth
                            >
                              <Stack
                                direction="row"
                                align="center"
                                gap="2xs"
                                wrap
                              >
                                {renderCharacterBadges(group, latest, badge)}
                              </Stack>
                              {renderCharacterDate(group)}
                            </Stack>

                            {/* Row 3: Author */}
                            {latest.creator?.trim() ? (
                              <Text as="span" size="xs" tone="muted" italic>
                                by {latest.creator.trim()}
                              </Text>
                            ) : null}

                            {/* Row 4: Comment */}
                            {latest.creatorNotes?.trim() ? (
                              <Card variant="elevated" padding="xs" fullWidth>
                                <Text
                                  as="p"
                                  size="xs"
                                  tone="secondary"
                                  lineClamp={
                                    characterShowFullComments ? undefined : 3
                                  }
                                  preWrap
                                >
                                  {latest.creatorNotes.trim()}
                                </Text>
                              </Card>
                            ) : null}

                            {/* Rows 5 & 6: Separator + Tags (top-anchored below card content) */}
                            <Separator spacing="none" />
                            <TagRow
                              taxonomy="character"
                              userConfig={taxonomyConfig}
                              tags={sortedTags}
                              activeTags={activeFilterTags}
                              maxRows={3}
                              onToggleTag={toggleTag}
                              onEditTags={() => handleEditTagsRequest(latest)}
                              wrapAll={characterShowAllTags}
                            />
                          </Card.Body>
                        </Card>
                      );
                    })}
                  </FormGrid>
                )}

                {/* 2. List View */}
                {viewMode === "list" && (
                  <Stack direction="column" align="stretch" gap="sm" fullWidth>
                    {paginatedGroups.map((group) => {
                      const latest = group.versions[0];
                      const badge = cardBadgeLabel(latest);
                      const isConverting =
                        convertingId === latest.id && convertLoading;
                      const sortedTags = sortTags(
                        latest.tags ?? [],
                        taxonomyConfig,
                      );
                      return (
                        <Card
                          key={group.key}
                          as="article"
                          variant="panel"
                          padding="sm"
                          layout="row"
                          hoverable
                          aiPulse={isConverting}
                        >
                          <CharacterAvatar template={latest} variant="list" />
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
                                title={displayTitle(latest)}
                                onClick={() => requestOpenEdit(latest)}
                              >
                                <Text
                                  as="span"
                                  size="md"
                                  weight="semibold"
                                  lineClamp={
                                    characterShowFullTitle ? undefined : 2
                                  }
                                  preWrap={characterShowFullTitle}
                                >
                                  {displayTitle(latest)}
                                </Text>
                              </Card.TitleButton>

                              <Card.Interactive>
                                <Stack inline gap="xs" hideBelow="md">
                                  {entryKind(latest) === "ccv2" ? (
                                    <Button
                                      variant="ai"
                                      size="xs"
                                      leftIcon="Sparkles"
                                      isLoading={isConverting}
                                      disabled={isConverting}
                                      onClick={() => void handleConvert(latest)}
                                    >
                                      {isConverting
                                        ? "Converting…"
                                        : "Convert to BL"}
                                    </Button>
                                  ) : null}
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    leftIcon="Tag"
                                    onClick={() =>
                                      handleEditTagsRequest(latest)
                                    }
                                  >
                                    Edit Tags
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    leftIcon="GitBranch"
                                    onClick={() => handleOpenCardFamily(latest)}
                                    title="Manage Parent, Child, and Sibling card relationships"
                                  >
                                    Family
                                  </Button>
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    leftIcon="Copy"
                                    onClick={() =>
                                      void handleDuplicateAsVariant(latest)
                                    }
                                    title="Duplicate this card as a new variant while keeping the same in-story Character Name"
                                  >
                                    Duplicate
                                  </Button>
                                  {entryKind(latest) === "bl" ? (
                                    <Button
                                      variant="secondary"
                                      size="xs"
                                      leftIcon="Download"
                                      onClick={() =>
                                        void handleRequestExport(latest)
                                      }
                                      title="Export this BobbinLoom character card"
                                    >
                                      Export
                                    </Button>
                                  ) : null}
                                  <Button
                                    variant="secondary"
                                    size="xs"
                                    leftIcon="Pencil"
                                    onClick={() => requestOpenEdit(latest)}
                                  >
                                    Edit
                                  </Button>
                                  <Button
                                    variant="danger"
                                    size="xs"
                                    leftIcon="Trash2"
                                    onClick={() =>
                                      requestDelete(
                                        latest.id,
                                        displayTitle(latest),
                                      )
                                    }
                                  >
                                    Delete
                                  </Button>
                                </Stack>
                                <Stack inline showBelow="md">
                                  <ActionsMenu
                                    label={`Actions for ${displayTitle(latest)}`}
                                    items={buildCharacterMenuItems(
                                      latest,
                                      isConverting,
                                    )}
                                  />
                                </Stack>
                              </Card.Interactive>
                            </Stack>

                            <Stack
                              direction="row"
                              align="center"
                              justify="between"
                              gap="xs"
                              wrap
                              fullWidth
                            >
                              <Stack
                                direction="row"
                                align="center"
                                gap="xs"
                                wrap
                              >
                                {renderCharacterBadges(group, latest, badge)}
                                {latest.creator?.trim() ? (
                                  <Text as="span" size="xs" tone="muted" italic>
                                    by {latest.creator.trim()}
                                  </Text>
                                ) : null}
                              </Stack>
                              {renderCharacterDate(group)}
                            </Stack>

                            {latest.creatorNotes?.trim() ? (
                              <Card variant="elevated" padding="xs" fullWidth>
                                <Text
                                  as="p"
                                  size="xs"
                                  tone="secondary"
                                  lineClamp={
                                    characterShowFullComments ? undefined : 3
                                  }
                                  preWrap
                                >
                                  {latest.creatorNotes.trim()}
                                </Text>
                              </Card>
                            ) : null}

                            <Separator spacing="none" />

                            <TagRow
                              taxonomy="character"
                              userConfig={taxonomyConfig}
                              tags={sortedTags}
                              activeTags={activeFilterTags}
                              maxRows={3}
                              onToggleTag={toggleTag}
                              onEditTags={() => handleEditTagsRequest(latest)}
                              wrapAll={characterShowAllTags}
                            />
                          </Stack>
                        </Card>
                      );
                    })}
                  </Stack>
                )}

                {/* 3. Grid View (Compact 1:1 square cards with 1-row interactive TagRow) */}
                {viewMode === "grid" && (
                  <FormGrid cols="compact" gap="sm">
                    {paginatedGroups.map((group) => {
                      const latest = group.versions[0];
                      const badge = cardBadgeLabel(latest);
                      const isConverting =
                        convertingId === latest.id && convertLoading;
                      const sortedTags = sortTags(
                        latest.tags ?? [],
                        taxonomyConfig,
                      );
                      return (
                        <Card
                          key={group.key}
                          as="article"
                          variant="panel"
                          padding="none"
                          layout="column"
                          hoverable
                          aiPulse={isConverting}
                        >
                          <Card.Cover position="top" aspect="square">
                            <CharacterAvatar template={latest} variant="grid" />
                          </Card.Cover>
                          <Card.Body padding="sm" gap="xs">
                            <Stack
                              direction="row"
                              align="start"
                              justify="between"
                              gap="2xs"
                              fullWidth
                            >
                              <Card.TitleButton
                                title={displayTitle(latest)}
                                onClick={() => requestOpenEdit(latest)}
                              >
                                <Text
                                  as="span"
                                  size="sm"
                                  weight="semibold"
                                  lineClamp={
                                    characterShowFullTitle ? undefined : 2
                                  }
                                  preWrap={characterShowFullTitle}
                                >
                                  {displayTitle(latest)}
                                </Text>
                              </Card.TitleButton>
                              <Card.Interactive>
                                <ActionsMenu
                                  label={`Actions for ${displayTitle(latest)}`}
                                  items={buildCharacterMenuItems(
                                    latest,
                                    isConverting,
                                  )}
                                />
                              </Card.Interactive>
                            </Stack>

                            <Stack
                              direction="row"
                              align="center"
                              justify="between"
                              gap="2xs"
                              wrap
                              fullWidth
                            >
                              <Stack
                                direction="row"
                                align="center"
                                gap="2xs"
                                wrap
                              >
                                {renderCharacterBadges(group, latest, badge)}
                              </Stack>
                              {renderCharacterDate(group)}
                            </Stack>

                            <Separator spacing="none" />
                            <TagRow
                              taxonomy="character"
                              userConfig={taxonomyConfig}
                              tags={sortedTags}
                              activeTags={activeFilterTags}
                              maxRows={3}
                              onToggleTag={toggleTag}
                              onEditTags={() => handleEditTagsRequest(latest)}
                              wrapAll={characterShowAllTags}
                            />
                          </Card.Body>
                        </Card>
                      );
                    })}
                  </FormGrid>
                )}

                {paginationElement}
              </Stack>
            )}
          </Stack>
        </Stack>
      )}

      {/* Diff / Convert to BL modal */}
      {diffData ? (
        diffData.readOnly ? (
          <ConvertToBLModal
            title="Compare: Original CCv2 vs Current BL"
            characterName={diffData.characterName}
            kind="compare"
            oldLabel="Original CCv2"
            newLabel="Current BL"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onClose={closeDiffModal}
            loading={false}
            error={null}
          />
        ) : diffData.kind === "reformat" ? (
          <ConvertToBLModal
            title="Update into Newer Format"
            characterName={diffData.characterName}
            kind="reformat"
            oldLabel="Current Sheet"
            newLabel="Updated Sheet"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onAccept={handleReformatAccept}
            onRetry={handleReformatRetry}
            onStopLoading={handleStopConvertLoading}
            onClose={closeDiffModal}
            loading={convertLoading}
            error={convertError}
            formatOptions={presetOptions}
            selectedFormatId={targetFormatId ?? (presetOptions[0]?.id || "")}
            onFormatChange={(val) => setTargetFormatId(val)}
            selectedProviderId={convertProviderId}
            onProviderChange={setConvertProviderId}
            alwaysConvertImmediately={characterConvertImmediately}
            onToggleAlwaysConvertImmediately={handleToggleConvertImmediately}
          />
        ) : (
          <ConvertToBLModal
            title="Convert to BL Format"
            characterName={diffData.characterName}
            kind="convert"
            oldLabel="Original CCv2"
            newLabel="Generated BL"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onAccept={handleConvertAccept}
            onRetry={handleConvertRetry}
            onStopLoading={handleStopConvertLoading}
            onClose={closeDiffModal}
            loading={convertLoading}
            error={convertError}
            formatOptions={presetOptions}
            selectedFormatId={targetFormatId ?? (presetOptions[0]?.id || "")}
            onFormatChange={(val) => setTargetFormatId(val)}
            selectedProviderId={convertProviderId}
            onProviderChange={setConvertProviderId}
            alwaysConvertImmediately={characterConvertImmediately}
            onToggleAlwaysConvertImmediately={handleToggleConvertImmediately}
          />
        )
      ) : null}

      {/* Import notice modal */}
      {importNotice ? (
        <Dialog
          title="Already Imported"
          maxWidth={480}
          onClose={() => setImportNotice(null)}
          footer={
            <>
              <Button
                variant="primary"
                onClick={() => {
                  const existing = importNotice.existingRecord;
                  setImportNotice(null);
                  openEdit(existing);
                }}
              >
                View / Edit
              </Button>
              <Button variant="secondary" onClick={() => setImportNotice(null)}>
                Dismiss
              </Button>
            </>
          }
        >
          <Stack gap="md">
            <Text size="sm" tone="secondary">
              {importNotice.message}
            </Text>
            <Card variant="elevated" padding="sm">
              <Stack direction="row" align="center" gap="md">
                <CharacterAvatar
                  template={importNotice.existingRecord}
                  variant="list"
                />
                <Text weight="bold">
                  {displayTitle(importNotice.existingRecord)}
                </Text>
              </Stack>
            </Card>
          </Stack>
        </Dialog>
      ) : null}

      {/* Tag Taxonomy & Color Settings Modal */}
      <TagTaxonomyModal
        open={taxonomyModalOpen}
        onClose={() => setTaxonomyModalOpen(false)}
        allLibraryTags={allTagCounts.map((t) => t.tag)}
        currentConfig={taxonomyConfig}
        onConfigUpdated={(newCfg) => setTaxonomyConfig(newCfg)}
      />

      {/* Card Family Hierarchy & CCv2 Detachment Modal */}
      {familyTargetId ? (
        <CardFamilyModal
          focusId={familyTargetId}
          allTemplates={templates}
          busy={familyBusy}
          error={familyError}
          onSelectFocus={(nextId) => {
            setFamilyError(null);
            setFamilyTargetId(nextId);
          }}
          onOpenEditor={(tpl) => requestOpenEdit(tpl)}
          onSetParent={handleSetCharacterParent}
          onDetachCcv2={handleDetachCharacterCcv2}
          onCreateVariant={async (parentId) => {
            const parentTpl = templates.find((t) => t.id === parentId);
            if (!parentTpl) return;
            setFamilyBusy(true);
            setFamilyError(null);
            try {
              const duplicated = await duplicateCharacter(parentTpl.id);
              const refreshed = await listCharacters();
              setTemplates(refreshed);
              setFamilyTargetId(duplicated.id);
            } catch (e) {
              setFamilyError(e instanceof Error ? e.message : String(e));
            } finally {
              setFamilyBusy(false);
            }
          }}
          onClose={() => {
            if (!familyBusy) {
              setFamilyTargetId(null);
              setFamilyError(null);
            }
          }}
        />
      ) : null}

      {/* Reusable Edit Tags Modal for Character Cards */}
      {tagsTarget
        ? (() => {
            const originalCcv2Tags =
              tagsTarget.ccv2Tags ??
              (tagsTarget.format === "ccv2" ? tagsTarget.tags : undefined) ??
              [];
            const hasOriginalSheetOrScenario = Boolean(
              (tagsTarget.ccv2Content?.trim() &&
                tagsTarget.ccv2Content.trim() !== tagsTarget.content?.trim()) ||
              tagsTarget.scenario?.trim(),
            );
            const contextOptions: EditTagsAiContextOption[] = [
              {
                id: "content",
                icon: "FileText",
                title: "Character Sheet / Description",
                description:
                  "Main character profile, appearance, personality, and traits.",
                defaultChecked: true,
              },
              {
                id: "creatorNotes",
                icon: "MessageSquare",
                title: "Creator's Notes / Comment",
                description:
                  "Author commentary, backstory notes, and usage context.",
                defaultChecked: Boolean(tagsTarget.creatorNotes?.trim()),
              },
              ...(hasOriginalSheetOrScenario
                ? [
                    {
                      id: "originalCard",
                      icon: "BookOpen" as const,
                      title: "Original CCv2 Sheet & Scenario",
                      description:
                        "Include the raw imported CCv2 description and scenario text.",
                      defaultChecked: true,
                    },
                  ]
                : []),
              ...(originalCcv2Tags.length > 0
                ? [
                    {
                      id: "originalTags",
                      icon: "Tag" as const,
                      title: "Original CCv2 Tags",
                      description:
                        "Include the card's original imported CCv2 tags on the Edit Tags with AI prompt.",
                      defaultChecked: true,
                    },
                  ]
                : []),
            ];

            return (
              <EditTagsModal
                key={tagsTarget.id}
                entityName={displayTitle(tagsTarget)}
                taxonomy="character"
                userConfig={taxonomyConfig}
                initialTags={tagsTarget.tags ?? []}
                originalTags={
                  originalCcv2Tags.length > 0 ? originalCcv2Tags : undefined
                }
                restoreOriginalLabel="Restore CCv2 Tags"
                libraryTags={allTagCounts.map((t) => t.tag)}
                busy={tagsSaving}
                error={tagsError}
                contextOptions={contextOptions}
                onSuggestAiTags={async ({
                  providerId,
                  currentTags,
                  guidance,
                  selectedContext,
                  signal,
                }) => {
                  const contentParts: string[] = [];
                  if (selectedContext.content ?? true) {
                    if (tagsTarget.content?.trim()) {
                      contentParts.push(tagsTarget.content.trim());
                    }
                  }
                  if (selectedContext.originalCard) {
                    if (
                      tagsTarget.ccv2Content?.trim() &&
                      tagsTarget.ccv2Content.trim() !==
                        tagsTarget.content?.trim()
                    ) {
                      contentParts.push(
                        `[Original CCv2 Description]\n${tagsTarget.ccv2Content.trim()}`,
                      );
                    }
                    if (tagsTarget.scenario?.trim()) {
                      contentParts.push(
                        `[Scenario]\n${tagsTarget.scenario.trim()}`,
                      );
                    }
                  }
                  const effectiveContent =
                    contentParts.length > 0
                      ? contentParts.join("\n\n")
                      : (tagsTarget.content ?? "");

                  const effectiveCreatorNotes = selectedContext.creatorNotes
                    ? [
                        tagsTarget.creatorNotes?.trim(),
                        tagsTarget.ccv2CreatorNotes?.trim() &&
                        tagsTarget.ccv2CreatorNotes.trim() !==
                          tagsTarget.creatorNotes?.trim()
                          ? `[Original CCv2 Creator Notes]\n${tagsTarget.ccv2CreatorNotes.trim()}`
                          : undefined,
                      ]
                        .filter(Boolean)
                        .join("\n\n") || undefined
                    : undefined;

                  const guidanceParts: string[] = [];
                  if (guidance?.trim()) {
                    guidanceParts.push(guidance.trim());
                  }
                  if (
                    selectedContext.originalTags &&
                    originalCcv2Tags.length > 0
                  ) {
                    guidanceParts.push(
                      `Original imported CCv2 tags on this card: ${originalCcv2Tags.join(", ")}. Evaluate which of these original tags (or standardized BobbinLoom equivalents) remain accurate and worth keeping.`,
                    );
                  }

                  const res = await suggestCharacterTags(
                    {
                      providerId,
                      name: displayTitle(tagsTarget),
                      content: effectiveContent,
                      creatorNotes: effectiveCreatorNotes,
                      currentTags,
                      guidance:
                        guidanceParts.length > 0
                          ? guidanceParts.join("\n\n")
                          : undefined,
                      libraryTags: allTagCounts.map((t) => t.tag),
                    },
                    { signal },
                  );
                  return res.tags;
                }}
                onSave={(nextTags) => {
                  void submitCharacterTags(nextTags);
                }}
                onClose={() => {
                  if (!tagsSaving) {
                    setTagsTargetId(null);
                    setTagsError(null);
                  }
                }}
              />
            );
          })()
        : null}

      {exportTarget ? (
        <CharacterExportModal
          character={exportTarget}
          allTemplates={templates}
          initialFormat={exportFormat}
          showFormatPicker={alwaysAskExportFormat}
          hasPortrait={Boolean(
            exportTarget.customPortrait ||
              exportTarget.cardRef?.kind === "png" ||
              exportTarget.avatarUpdatedAt,
          )}
          exporting={exporting}
          error={exportError}
          onExport={(options) =>
            void performExportCharacter(exportTarget, options)
          }
          onClose={() => {
            if (!exporting) {
              setExportTarget(null);
              setExportError(null);
            }
          }}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete Character?"
          message={
            <>
              Are you sure you want to permanently delete{" "}
              <strong>&ldquo;{deleteTarget.name}&rdquo;</strong> from the
              library? This action cannot be undone.
            </>
          }
          confirmLabel="Delete"
          danger
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".webp,.png,.json,image/webp,image/png,application/json"
        hidden
        onChange={handleImportFile}
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
        ariaLabel="Character Library"
      >
        <Header
          variant="section"
          icon="Users"
          title="Character Library"
          subtitle="Manage character templates for scenario generation and story casts."
          actions={
            <Stack direction="row" align="center" gap="sm">
              {!editorOpen ? (
                <>
                  <Button
                    variant="secondary"
                    size="sm"
                    leftIcon="Upload"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    isLoading={importing}
                  >
                    {importing ? "Importing…" : "Import Card"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon="Plus"
                    onClick={openCreate}
                    disabled={importing}
                  >
                    New Character
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
        title="Character Library"
        subtitle="Manage character templates for scenario generation and story casts."
        actions={
          !editorOpen ? (
            <Stack direction="row" align="center" gap="sm">
              <Button
                variant="secondary"
                size="md"
                leftIcon="Upload"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
                isLoading={importing}
              >
                {importing ? "Importing…" : "Import Card"}
              </Button>
              <Button
                variant="primary"
                size="md"
                leftIcon="Plus"
                onClick={openCreate}
                disabled={importing}
              >
                New Character
              </Button>
            </Stack>
          ) : undefined
        }
      />
      {contentBody}
    </Stack>
  );
}
