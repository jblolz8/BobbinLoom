import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate } from "../../../schemas";
import type { CharacterFormat } from "../../../schemas";
import type { ViewPreferences } from "../../../schemas";
import {
  createCharacter,
  deleteCharacter,
  detachCharacterCcv2,
  duplicateCharacter,
  importCharacter,
  listCharacters,
  updateCharacter,
  uploadCharacterAvatar,
  restoreOriginalCharacterAvatar,
  deleteCharacterProfileAvatar,
  getCharacterAvatarUrl,
} from "../../api";
import {
  convertCharacterApply,
  convertCharacterGenerate,
  reformatCharacterApply,
  reformatCharacterGenerate,
  suggestCharacterTags,
  brainstormCharacter,
  getPromptConfig,
  listPresets,
  getPreset,
} from "../../api";
import {
  LIBRARY_PREFERENCE_DEFAULTS,
  adoptLocalPreferences,
  resolveLibraryPreferences,
  updateViewPreferences,
  getBrainstormSession,
  saveBrainstormSession,
  clearBrainstormSession,
} from "../../api";
import type {
  CharacterTemplateUpdate,
  ProposedSectionChange,
  CharacterBrainstormResult,
  Preset,
  ResolvedLibraryPreferences,
} from "../../api";
import {
  CHARACTER_SHEET_EXAMPLE,
  applySectionChanges,
} from "../../../engine/characterSections";
import {
  isFormatAligned,
  resolveCharacterFormat,
} from "../../../engine/characterFormat";
import {
  buildCharacterFamilyTree,
  displayTitle,
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
  ActionsMenu,
  Badge,
  Button,
  Card,
  CharacterAvatar,
  Dialog,
  FormGrid,
  Header,
  Icon,
  Modal,
  Pagination,
  SearchBar,
  Separator,
  SimpleSelect,
  SortSelect,
  Stack,
  StatusMessage,
  Tabs,
  TagChip,
  TagRow,
  TagSidebar,
  Text,
  TextArea,
  TextInput,
  Tooltip,
  type ActionsMenuItem,
} from "../base";
export { CharacterAvatar } from "../base";
import { usePagination } from "../../hooks/usePagination";
import {
  CardFamilyModal,
  CharacterPortraitDrawer,
  ConfirmModal,
  EditTagsModal,
  type EditTagsAiContextOption,
} from "../common";
import { DiffModal } from "./DiffModal";
import { TwoPaneDiff } from "./TwoPaneDiff";
import { TagSuggestionModal } from "./TagSuggestionModal";
import { TagTaxonomyModal } from "./TagTaxonomyModal";
import {
  CharacterBrainstormPanel,
  type BrainstormChatMessage,
} from "./CharacterBrainstormPanel";
import { BrainstormSettingsModal } from "./BrainstormSettingsModal";
import {
  brainstormHistoryContent,
  brainstormStorageKey,
  decodeLegacyBrainstormSession,
  isBrainstormMessage,
  trimBrainstormMessages,
} from "../../../engine/brainstorm";
import {
  getBrainstormSettings,
  getTagTaxonomy,
  setBrainstormSettings,
} from "../../api";
import {
  sortTags,
  type TagTaxonomyConfig,
} from "../../../engine/tagTaxonomy";
import "./CharacterLibrary.css";

export type CharacterLibraryProps = {
  variant?: "page" | "dialog";
  isModal?: boolean;
  onClose?: () => void;
  initialEditingId?: string;
};

export type ViewMode = "portrait" | "list" | "grid";

type CharacterForm = {
  name: string;
  title: string;
  creatorNotes: string;
  tags: string[];
  content: string;
};

function blankForm(): CharacterForm {
  return { name: "", title: "", creatorNotes: "", tags: [], content: "" };
}

function templateToForm(t: CharacterTemplate): CharacterForm {
  const distinctTitle =
    t.title && t.title.trim().toLowerCase() !== t.name.trim().toLowerCase()
      ? t.title.trim()
      : "";
  return {
    name: t.name,
    title: distinctTitle,
    creatorNotes: t.creatorNotes ?? "",
    tags: t.tags ?? [],
    content: t.content,
  };
}

function formToUpdate(form: CharacterForm): CharacterTemplateUpdate {
  const trimmedTitle = form.title.trim();
  const trimmedName = form.name.trim();
  return {
    name: form.name,
    title:
      trimmedTitle && trimmedTitle.toLowerCase() !== trimmedName.toLowerCase()
        ? trimmedTitle
        : "",
    creatorNotes: form.creatorNotes,
    tags: form.tags,
    content: form.content,
  };
}

/** Interactive Tag Editor with chips, typeahead suggestions, and AI suggestion trigger */
function TagChipEditor({
  tags,
  onChange,
  allLibraryTags,
  disabled,
  onSuggestAI,
  suggestingAI,
  taxonomyConfig,
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  allLibraryTags: string[];
  disabled?: boolean;
  onSuggestAI?: () => void;
  suggestingAI?: boolean;
  taxonomyConfig?: TagTaxonomyConfig | null;
}) {
  const [inputVal, setInputVal] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [focusedSuggestionIdx, setFocusedSuggestionIdx] = useState(-1);

  const availableSuggestions = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    if (!q) return allLibraryTags.filter((t) => !tags.includes(t)).slice(0, 8);
    return allLibraryTags
      .filter((t) => t.includes(q) && !tags.includes(t))
      .slice(0, 10);
  }, [allLibraryTags, tags, inputVal]);

  // Reset focus index when suggestions change
  useEffect(() => {
    setFocusedSuggestionIdx(-1);
  }, [availableSuggestions]);

  function addTag(raw: string) {
    const norm = raw.trim().toLowerCase();
    if (!norm) return;
    if (!tags.includes(norm)) {
      onChange(sortTags([...tags, norm], taxonomyConfig));
    }
    setInputVal("");
    setShowSuggestions(false);
    setFocusedSuggestionIdx(-1);
  }

  function removeTag(tagToRemove: string) {
    onChange(
      sortTags(
        tags.filter((t) => t !== tagToRemove),
        taxonomyConfig,
      ),
    );
  }

  return (
    <div className="editor-field tag-editor-field">
      <div className="editor-field-header-row">
        <span className="editor-field-label">Tags</span>
        {onSuggestAI ? (
          <Button
            type="button"
            variant="ai"
            size="xs"
            onClick={() => onSuggestAI()}
            disabled={disabled || suggestingAI}
            leftIcon={
              <Icon
                name="Sparkles"
                size={13}
                className={suggestingAI ? "sparkle-pulse" : ""}
              />
            }
            title="Use AI to analyze character content and suggest tags based on library taxonomy"
          >
            {suggestingAI ? "Analyzing Tags…" : "Edit Tags by AI"}
          </Button>
        ) : null}
      </div>

      <div className="tag-chip-editor-box">
        <div className="tag-chip-list">
          {tags.map((tag) => (
            <TagChip
              key={tag}
              tag={tag}
              userConfig={taxonomyConfig}
              disabled={disabled}
              size="md"
              onRemove={!disabled ? () => removeTag(tag) : undefined}
            />
          ))}

          {!disabled ? (
            <div className="tag-input-wrap">
              <input
                type="text"
                placeholder={
                  tags.length === 0
                    ? "Add tags (e.g. species:elf, rating:sfw)…"
                    : "Add tag…"
                }
                value={inputVal}
                onChange={(e) => {
                  const val = e.target.value;
                  if (val.includes(",")) {
                    const parts = val.split(",");
                    for (const p of parts) {
                      if (p.trim()) addTag(p);
                    }
                    setInputVal("");
                  } else {
                    setInputVal(val);
                    setShowSuggestions(true);
                  }
                }}
                onFocus={() => setShowSuggestions(true)}
                onBlur={() => {
                  setTimeout(() => {
                    setShowSuggestions(false);
                    setFocusedSuggestionIdx(-1);
                  }, 200);
                }}
                onKeyDown={(e) => {
                  if (showSuggestions && availableSuggestions.length > 0) {
                    if (e.key === "Tab") {
                      e.preventDefault();
                      if (e.shiftKey) {
                        setFocusedSuggestionIdx((prev) =>
                          prev <= 0
                            ? availableSuggestions.length - 1
                            : prev - 1,
                        );
                      } else {
                        setFocusedSuggestionIdx((prev) =>
                          prev >= availableSuggestions.length - 1
                            ? 0
                            : prev + 1,
                        );
                      }
                      return;
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFocusedSuggestionIdx((prev) =>
                        prev >= availableSuggestions.length - 1 ? 0 : prev + 1,
                      );
                      return;
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFocusedSuggestionIdx((prev) =>
                        prev <= 0 ? availableSuggestions.length - 1 : prev - 1,
                      );
                      return;
                    } else if (e.key === "Escape") {
                      e.preventDefault();
                      setShowSuggestions(false);
                      setFocusedSuggestionIdx(-1);
                      return;
                    }
                  }

                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (
                      showSuggestions &&
                      focusedSuggestionIdx >= 0 &&
                      focusedSuggestionIdx < availableSuggestions.length
                    ) {
                      addTag(availableSuggestions[focusedSuggestionIdx]);
                    } else if (inputVal.trim()) {
                      addTag(inputVal);
                    }
                  } else if (
                    e.key === "Backspace" &&
                    !inputVal &&
                    tags.length > 0
                  ) {
                    removeTag(tags[tags.length - 1]);
                  }
                }}
                className="tag-inline-input"
              />

              {showSuggestions && availableSuggestions.length > 0 ? (
                <div className="tag-autocomplete-dropdown" role="listbox">
                  <span className="autocomplete-header">
                    Library Suggestions:
                  </span>
                  {availableSuggestions.map((sug, idx) => (
                    <button
                      key={sug}
                      type="button"
                      role="option"
                      aria-selected={idx === focusedSuggestionIdx}
                      className={`autocomplete-item ${idx === focusedSuggestionIdx ? "selected focused" : ""}`}
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(sug);
                      }}
                      onMouseEnter={() => setFocusedSuggestionIdx(idx)}
                    >
                      <TagChip
                        tag={sug}
                        userConfig={taxonomyConfig}
                        size="xs"
                      />
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/** Side-by-side tag diff viewer for the "Both" tab with restore button */
function TagDiffViewer({
  originalTags,
  currentTags,
  onRestore,
  taxonomyConfig,
}: {
  originalTags: string[];
  currentTags: string[];
  onRestore: () => void;
  taxonomyConfig?: TagTaxonomyConfig | null;
}) {
  const normOriginal = useMemo(
    () => originalTags.map((t) => t.toLowerCase()),
    [originalTags],
  );
  const normCurrent = useMemo(
    () => currentTags.map((t) => t.toLowerCase()),
    [currentTags],
  );

  const added = normCurrent.filter((t) => !normOriginal.includes(t));
  const removed = normOriginal.filter((t) => !normCurrent.includes(t));

  return (
    <div className="editor-field tag-diff-field">
      <div className="editor-field-header-row">
        <span className="editor-field-label">Tags Comparison</span>
        {originalTags.length > 0 ? (
          <Button
            type="button"
            variant="secondary"
            size="xs"
            leftIcon={<Icon name="RotateCcw" size={13} />}
            onClick={onRestore}
            title="Restore original CCv2 tags"
          >
            Restore Original Tags
          </Button>
        ) : null}
      </div>

      <div className="tag-diff-container">
        <div className="tag-diff-pane">
          <span className="tag-diff-pane-header">
            Original CCv2 Tags ({originalTags.length})
          </span>
          <div className="tag-diff-pane-chips">
            {originalTags.length === 0 ? (
              <span className="empty-tags-hint">(no original tags)</span>
            ) : (
              originalTags.map((tag) => (
                <span
                  key={tag}
                  className={`diff-tag-chip-wrap ${removed.includes(tag.toLowerCase()) ? "removed" : "same"}`}
                >
                  <TagChip tag={tag} userConfig={taxonomyConfig} size="sm" />
                </span>
              ))
            )}
          </div>
        </div>

        <div className="tag-diff-pane">
          <span className="tag-diff-pane-header">
            BL Format Tags ({currentTags.length})
          </span>
          <div className="tag-diff-pane-chips">
            {currentTags.length === 0 ? (
              <span className="empty-tags-hint">(none)</span>
            ) : (
              currentTags.map((tag) => (
                <span
                  key={tag}
                  className={`diff-tag-chip-wrap ${added.includes(tag.toLowerCase()) ? "added" : "same"}`}
                >
                  <TagChip tag={tag} userConfig={taxonomyConfig} size="sm" />
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

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
  const [form, setForm] = useState<CharacterForm>(blankForm());
  const [initialForm, setInitialForm] = useState<CharacterForm>(blankForm());
  /** The action to run once the reader accepts losing their unsaved work — closing the editor or
   *  opening a different character. Null means the confirmation is not up. */
  const [discardConfirm, setDiscardConfirm] = useState<{
    after: () => void;
  } | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsCcv2, setEditingIsCcv2] = useState(false);
  const [saving, setSaving] = useState(false);
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
  const [conversionFailed, setConversionFailed] = useState<{
    template: CharacterTemplate;
    error: string;
  } | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Conversion state ──
  const [convertingId, setConvertingId] = useState<string | null>(null);
  const [convertLoading, setConvertLoading] = useState(false);
  const [convertError, setConvertError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);
  const [diffData, setDiffData] = useState<{
    oldContent: string;
    newContent: string;
    recordId: string;
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

  // ── Edit-form tab (converted cards): BL Format (default) / Original / Both ──
  const [viewTab, setViewTab] = useState<"bl" | "original" | "both">("bl");

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
  } | null>(null);

  // ── Delete success banner state ──
  const [deleteSuccess, setDeleteSuccess] = useState<{
    recordName: string;
  } | null>(null);

  // ── Library error banner state ──
  const [libraryError, setLibraryError] = useState<string | null>(null);

  // ── AI Tag Suggestion state (Option B) ──
  const [tagSuggestModalOpen, setTagSuggestModalOpen] = useState(false);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [tagSuggestError, setTagSuggestError] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const tagSuggestAbortControllerRef = useRef<AbortController | null>(null);

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
      if (editingId === cardId) {
        const updated = refreshed.find((t) => t.id === cardId);
        if (updated) {
          const nextForm = templateToForm(updated);
          setForm(nextForm);
          setInitialForm(nextForm);
        }
      }
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
      if (editingId === updated.id) {
        setForm((f) => ({ ...f, tags: updated.tags ?? normalized }));
        setInitialForm((f) =>
          f ? { ...f, tags: updated.tags ?? normalized } : f,
        );
      }
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

  const applyLibraryPreferences = (prefs: ResolvedLibraryPreferences) => {
    setViewModeState(prefs.viewMode);
    setSortByState(prefs.sortBy);
    setSortDirectionState(prefs.sortDir);
    setSidebarViewModeState(prefs.sidebarViewMode);
    setCollapsedCategories(new Set(prefs.collapsedCategories));
    setSearchState(prefs.search);
  };

  // These preferences live on the server now (adopting whatever this device still holds first), so they
  // arrive after the first paint — while the list is still loading, which is what keeps the swap
  // invisible rather than a grid that rearranges itself.
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const { preferences } = await adoptLocalPreferences();
      if (cancelled || libraryPrefsTouchedRef.current) return;
      applyLibraryPreferences(resolveLibraryPreferences(preferences));
    })().catch(() => {
      /* A failed read leaves the defaults; the next load tries again. */
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── AI Brainstorming State ──
  const [aiBrainstormOpen, setAiBrainstormOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<BrainstormChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [includeOriginalCcv2, setIncludeOriginalCcv2] = useState(false);
  const [brainstormProviderId, setBrainstormProviderId] = useState<
    string | null
  >(null);
  const [brainstormAllowNewSections, setBrainstormAllowNewSections] =
    useState(true);
  const [brainstormSettingsOpen, setBrainstormSettingsOpen] = useState(false);
  const [brainstormSettingsError, setBrainstormSettingsError] = useState<
    string | null
  >(null);
  const [revertRetryTarget, setRevertRetryTarget] = useState<{
    id: string;
    drops: number;
  } | null>(null);
  const aiAbortControllerRef = useRef<AbortController | null>(null);

  // The assistant's settings are global, so they are read once and written as they change.
  useEffect(() => {
    let cancelled = false;
    getBrainstormSettings()
      .then((settings) => {
        if (cancelled) return;
        setIncludeOriginalCcv2(settings.includeOriginalCard);
        setBrainstormProviderId(settings.textProviderId);
        setBrainstormAllowNewSections(settings.allowNewSections);
      })
      .catch(() => {
        /* Nothing to read is not a failure: the defaults change nothing. */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // A saved character's session lives on the server, so closing the editor no longer throws a
  // long brainstorm away. A brand-new character has no id to key one to, and keeps the discard
  // warning.
  useEffect(() => {
    if (!editorOpen || !editingId) return;
    let cancelled = false;
    const key = brainstormStorageKey(editingId);
    // The device's old localStorage copy is handed to the server once. The server always wins, so a
    // session that already exists there is not overwritten by whatever this browser still holds.
    const legacy = (
      decodeLegacyBrainstormSession(window.localStorage.getItem(key)) ?? []
    ).filter(isBrainstormMessage) as BrainstormChatMessage[];
    void (async () => {
      const fromServer = await getBrainstormSession(editingId);
      if (cancelled) return;
      if (fromServer && fromServer.messages.length > 0) {
        setAiMessages(fromServer.messages as BrainstormChatMessage[]);
      } else if (legacy.length > 0) {
        setAiMessages(legacy);
        persistBrainstormSession(legacy, editingId);
      } else {
        setAiMessages([]);
      }
      // The server now owns the session, so keeping the local copy would let a stale one win later.
      try {
        window.localStorage.removeItem(key);
      } catch {
        /* A blocked storage is not a reason to lose the panel. */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [editorOpen, editingId]);

  function persistBrainstormSession(
    messages: BrainstormChatMessage[],
    id = editingId,
  ) {
    // The id is a parameter because the first save of a new character sets state that this closure
    // will not see until the next render, and those messages are exactly the ones at risk.
    if (!id) return;
    void saveBrainstormSession(id, trimBrainstormMessages(messages)).catch(
      () => {
        /* A failed write must not break the conversation. */
      },
    );
  }

  // ── Deletion Confirmation Modal State ──
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    name: string;
  } | null>(null);

  const isFormDirty = useMemo(() => {
    if (!editorOpen) return false;
    if (form.name !== initialForm.name) return true;
    if (form.title !== initialForm.title) return true;
    if (form.creatorNotes !== initialForm.creatorNotes) return true;
    if (form.content !== initialForm.content) return true;
    if (form.tags.length !== initialForm.tags.length) return true;
    for (let i = 0; i < form.tags.length; i++) {
      if (form.tags[i] !== initialForm.tags[i]) return true;
    }
    return false;
  }, [form, initialForm, editorOpen]);

  // A saved character's session is restored from browser storage, so having one is not a loss and
  // should not warn. A brand-new character has no id to key a session to, and only unsaved form
  // edits are lost for anyone else.
  const hasUnsavedWork = isFormDirty || (!editingId && aiMessages.length > 0);

  const convertingCharacter = useMemo(() => {
    if (!convertingId) return null;
    return templates.find((t) => t.id === convertingId) ?? null;
  }, [templates, convertingId]);

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

  function handleCancelTagSuggest() {
    if (tagSuggestAbortControllerRef.current) {
      tagSuggestAbortControllerRef.current.abort();
      tagSuggestAbortControllerRef.current = null;
    }
    setTagSuggestModalOpen(false);
    setTagSuggestLoading(false);
    setTagSuggestError(null);
    setSuggestedTags([]);
  }

  function handleCancelBrainstorm() {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
      aiAbortControllerRef.current = null;
    }
    setAiLoading(false);
  }

  function openCreate() {
    handleCancelTagSuggest();
    handleCancelBrainstorm();
    const blank = blankForm();
    setForm(blank);
    setInitialForm(blank);
    setEditingId(null);
    setEditingIsCcv2(false);
    setAiBrainstormOpen(false);
    setAiMessages([]);
    setAiError(null);
    setIncludeOriginalCcv2(false);
    setEditorOpen(true);
    setStatus(null);
    setConvertedSuccess(null);
    setDiscardConfirm(null);
  }

  function openEdit(t: CharacterTemplate) {
    handleCancelTagSuggest();
    handleCancelBrainstorm();
    const initial = templateToForm(t);
    setForm(initial);
    setInitialForm(initial);
    setEditingId(t.id);
    setEditingIsCcv2(t.format === "ccv2");
    setViewTab("bl");
    setAiBrainstormOpen(false);
    setAiMessages([]);
    setAiError(null);
    setIncludeOriginalCcv2(false);
    setEditorOpen(true);
    setStatus(null);
    setConvertedSuccess(null);
    setDiscardConfirm(null);
  }

  function closeEditor() {
    handleCancelTagSuggest();
    handleCancelBrainstorm();
    setEditorOpen(false);
    setEditingId(null);
    setEditingIsCcv2(false);
    setViewTab("bl");
    setStatus(null);
    setDiscardConfirm(null);
    setAiBrainstormOpen(false);
    setAiMessages([]);
    setAiError(null);
    setIncludeOriginalCcv2(false);
  }

  function handleCancelClick() {
    if (hasUnsavedWork) {
      setDiscardConfirm({ after: closeEditor });
    } else {
      closeEditor();
    }
  }

  /** Opening another character discards the open draft exactly the way closing does. */
  function requestOpenEdit(template: CharacterTemplate) {
    if (hasUnsavedWork) {
      setDiscardConfirm({ after: () => openEdit(template) });
    } else {
      openEdit(template);
    }
  }

  function handleConfirmDiscard() {
    const after = discardConfirm?.after;
    setDiscardConfirm(null);
    after?.();
  }

  /**
   * One turn: the history as the model should see it, and the question being asked.
   *
   * Every way of asking again — sending, editing a question, reverting a reply, regenerating one —
   * goes through here, so the history is built in exactly one place.
   */
  async function runBrainstormTurn(
    history: BrainstormChatMessage[],
    userMessage: BrainstormChatMessage,
  ) {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortControllerRef.current = controller;

    const nextHistory = [...history, userMessage];
    setAiMessages(nextHistory);
    persistBrainstormSession(nextHistory);
    setAiLoading(true);
    setAiError(null);

    try {
      const activeTpl = editingId
        ? templates.find((t) => t.id === editingId)
        : undefined;
      const res = await brainstormCharacter(
        {
          character: {
            name: form.name,
            content: form.content,
            creatorNotes: form.creatorNotes,
            tags: form.tags,
            ccv2Content: activeTpl?.ccv2Content,
          },
          // The proposals go back with the reply: without them a follow-up like "make the second one
          // shorter" has nothing to refer to.
          chatHistory: history.map((m) => ({
            role: m.role,
            content: brainstormHistoryContent(m),
          })),
          userMessage: userMessage.content,
          includeOriginalCard: includeOriginalCcv2,
          allowNewSections: brainstormAllowNewSections,
          ...(brainstormProviderId ? { providerId: brainstormProviderId } : {}),
          format: targetFormat,
        },
        { signal: controller.signal },
      );

      const assistantMsg: BrainstormChatMessage = {
        id: crypto.randomUUID(),
        role: "assistant",
        content: res.reply,
        proposedChanges: res.proposedChanges,
        unmappedHeaders: res.unmappedHeaders,
        newSections: res.newSections,
        model: res.model,
        appliedChanges: {},
      };

      const settled = [...nextHistory, assistantMsg];
      setAiMessages(settled);
      persistBrainstormSession(settled);
    } catch (e) {
      if (
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("abort") ||
            e.message.includes("cancelled"))) ||
        controller.signal.aborted
      ) {
        return;
      }
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      if (aiAbortControllerRef.current === controller) {
        setAiLoading(false);
        aiAbortControllerRef.current = null;
      }
    }
  }

  function handleSendBrainstormMessage(userText: string) {
    return runBrainstormTurn(aiMessages, {
      id: crypto.randomUUID(),
      role: "user",
      content: userText,
    });
  }

  /** The question an assistant reply was answering, and the history before it. */
  function questionBefore(messageId: string) {
    const index = aiMessages.findIndex((m) => m.id === messageId);
    if (index <= 0) return null;
    for (let i = index - 1; i >= 0; i -= 1) {
      const candidate = aiMessages[i];
      if (candidate?.role === "user") {
        return { history: aiMessages.slice(0, i), question: candidate };
      }
    }
    return null;
  }

  function performRevertRetry(messageId: string) {
    const found = questionBefore(messageId);
    if (!found) return;
    void runBrainstormTurn(found.history, found.question);
  }

  function handleRegenerateBrainstorm(messageId: string) {
    performRevertRetry(messageId);
  }

  function handleRevertAndRetryBrainstorm(messageId: string) {
    const index = aiMessages.findIndex((m) => m.id === messageId);
    const drops = index === -1 ? 0 : aiMessages.length - (index + 1);
    // Dropping turns silently is the surprising part of reverting; re-asking the last question is not.
    if (drops > 0) {
      setRevertRetryTarget({ id: messageId, drops });
      return;
    }
    performRevertRetry(messageId);
  }

  function handleEditBrainstormMessage(messageId: string, text: string) {
    const index = aiMessages.findIndex((m) => m.id === messageId);
    if (index === -1) return;
    const edited: BrainstormChatMessage = {
      ...aiMessages[index]!,
      content: text,
    };
    // Whatever followed the edited question no longer follows from it.
    const kept = [...aiMessages.slice(0, index), edited];
    setAiMessages(kept);
    persistBrainstormSession(kept);
    if (index === aiMessages.length - 1) {
      void runBrainstormTurn(aiMessages.slice(0, index), edited);
    }
  }

  function handleToggleIncludeOriginalCard(include: boolean) {
    setIncludeOriginalCcv2(include);
    setBrainstormSettingsError(null);
    setBrainstormSettings({ includeOriginalCard: include }).catch(
      (error: unknown) => {
        // The switch does not claim a preference that could not be stored.
        setIncludeOriginalCcv2(!include);
        setBrainstormSettingsError(
          error instanceof Error
            ? error.message
            : "Could not save that preference",
        );
      },
    );
  }

  function handleToggleAllowNewSections(allow: boolean) {
    setBrainstormAllowNewSections(allow);
    setBrainstormSettingsError(null);
    setBrainstormSettings({ allowNewSections: allow }).catch(
      (error: unknown) => {
        // The switch does not claim a preference that could not be stored.
        setBrainstormAllowNewSections(!allow);
        setBrainstormSettingsError(
          error instanceof Error
            ? error.message
            : "Could not save that preference",
        );
      },
    );
  }

  function handleBrainstormProviderChange(id: string | null) {
    const previous = brainstormProviderId;
    setBrainstormProviderId(id);
    setBrainstormSettingsError(null);
    setBrainstormSettings({ textProviderId: id }).catch((error: unknown) => {
      setBrainstormProviderId(previous);
      setBrainstormSettingsError(
        error instanceof Error
          ? error.message
          : "Could not save that connection",
      );
    });
  }

  function handleApplySection(
    section: ProposedSectionChange,
    messageId: string,
  ) {
    const updatedContent = applySectionChanges(form.content, [section]);
    setForm((f) => ({ ...f, content: updatedContent }));

    const next = aiMessages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            appliedChanges: {
              ...msg.appliedChanges,
              [`section:${section.header.toLowerCase()}`]: true,
            },
          }
        : msg,
    );
    setAiMessages(next);
    persistBrainstormSession(next);
  }

  function handleApplyAllProposed(
    proposed: CharacterBrainstormResult["proposedChanges"],
    messageId: string,
  ) {
    if (!proposed) return;

    setForm((f) => {
      let content = f.content;
      if (proposed.fullContent) {
        content = proposed.fullContent;
      } else if (proposed.sections && proposed.sections.length > 0) {
        content = applySectionChanges(content, proposed.sections);
      }

      let tags = f.tags;
      if (proposed.tags && proposed.tags.length > 0) {
        const tagSet = new Set(f.tags.map((t) => t.toLowerCase()));
        const merged = [...f.tags];
        for (const t of proposed.tags) {
          if (!tagSet.has(t.toLowerCase())) {
            tagSet.add(t.toLowerCase());
            merged.push(t);
          }
        }
        tags = sortTags(merged, taxonomyConfig);
      }

      return {
        ...f,
        content,
        tags,
        ...(proposed.creatorNotes
          ? { creatorNotes: proposed.creatorNotes }
          : {}),
        ...(proposed.name ? { name: proposed.name } : {}),
      };
    });

    const next = aiMessages.map((msg) =>
      msg.id === messageId
        ? {
            ...msg,
            appliedChanges: {
              ...msg.appliedChanges,
              all: true,
              ...(proposed.sections
                ? Object.fromEntries(
                    proposed.sections.map((s) => [
                      `section:${s.header.toLowerCase()}`,
                      true,
                    ]),
                  )
                : {}),
            },
          }
        : msg,
    );
    setAiMessages(next);
    persistBrainstormSession(next);
  }

  function handleClearBrainstormChat() {
    setAiMessages([]);
    setAiError(null);
    if (!editingId) return;
    void clearBrainstormSession(editingId).catch(() => {
      /* Nothing to clear. */
    });
  }

  async function handleOpenAiTagSuggestions(guidance?: unknown) {
    if (tagSuggestAbortControllerRef.current) {
      tagSuggestAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    tagSuggestAbortControllerRef.current = controller;

    const cleanGuidance =
      typeof guidance === "string" ? guidance.trim() || undefined : undefined;
    setSuggestedTags([]);
    setTagSuggestLoading(true);
    setTagSuggestError(null);
    setTagSuggestModalOpen(true);
    try {
      const allTagsList = allTagCounts.map((t) => t.tag);
      const res = await suggestCharacterTags(
        {
          name: form.name,
          content: form.content,
          creatorNotes: form.creatorNotes,
          currentTags: form.tags,
          guidance: cleanGuidance,
          libraryTags: allTagsList,
        },
        { signal: controller.signal },
      );
      setSuggestedTags(res.tags);
    } catch (e) {
      if (
        (e instanceof Error &&
          (e.name === "AbortError" ||
            e.message.includes("abort") ||
            e.message.includes("cancelled"))) ||
        controller.signal.aborted
      ) {
        return;
      }
      setTagSuggestError(e instanceof Error ? e.message : String(e));
    } finally {
      if (tagSuggestAbortControllerRef.current === controller) {
        setTagSuggestLoading(false);
        tagSuggestAbortControllerRef.current = null;
      }
    }
  }

  async function handleSave() {
    if (!form.name.trim()) return;
    setSaving(true);
    setStatus(null);
    try {
      const canonicalTags = sortTags(form.tags, taxonomyConfig);
      const update = formToUpdate({ ...form, tags: canonicalTags });
      const effectiveLabel = update.title || form.name.trim();
      if (editingId) {
        await updateCharacter(
          editingId,
          editingIsCcv2
            ? { name: update.name, title: update.title }
            : update,
        );
        setStatus(`"${effectiveLabel}" saved successfully.`);
      } else {
        const created = await createCharacter(form.name, update.title);
        await updateCharacter(created.id, {
          title: update.title,
          content: form.content,
          creatorNotes: form.creatorNotes,
          tags: canonicalTags,
        });
        setEditingId(created.id);
        // Now that the character has an id, the conversation it already has can be kept.
        persistBrainstormSession(aiMessages, created.id);
        setStatus(`"${effectiveLabel}" created and saved successfully.`);
      }
      const nextForm = {
        ...form,
        title: update.title ?? "",
        tags: canonicalTags,
      };
      setForm(nextForm);
      setInitialForm(nextForm);
      setTemplates(await listCharacters());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
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
      setImportSuccess({
        recordId: result.record.id,
        recordName: displayTitle(result.record),
        template: result.record,
      });
    } catch (e) {
      setLibraryError(e instanceof Error ? e.message : String(e));
    } finally {
      setImporting(false);
    }
  }

  // ── Conversion handlers ──

  async function handleConvert(template: CharacterTemplate) {
    setConvertingId(template.id);
    setConvertLoading(true);
    setConvertError(null);
    setConversionFailed(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await convertCharacterGenerate(template.id, {
        format: targetFormat,
        signal: controller.signal,
      });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: template.id,
        kind: "convert",
      });
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === "AbortError" ||
          e.message.includes("aborted") ||
          e.message.includes("cancelled"))
      ) {
        setStatus("Conversion cancelled.");
      } else {
        const errMsg = e instanceof Error ? e.message : String(e);
        setConversionFailed({ template, error: errMsg });
      }
    } finally {
      setConvertingId(null);
      setConvertLoading(false);
      abortControllerRef.current = null;
    }
  }

  async function handleConvertRetry(feedback: string) {
    if (!diffData) return;
    setConvertLoading(true);
    setConvertError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await convertCharacterGenerate(diffData.recordId, {
        feedback: feedback || undefined,
        currentContent: diffData.newContent,
        format: targetFormat,
        signal: controller.signal,
      });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: diffData.recordId,
        kind: "convert",
      });
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === "AbortError" ||
          e.message.includes("aborted") ||
          e.message.includes("cancelled"))
      ) {
        setStatus("Conversion retry cancelled.");
      } else {
        setConvertError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setConvertLoading(false);
      abortControllerRef.current = null;
    }
  }

  function handleCancelConvert() {
    if (abortControllerRef.current) {
      abortControllerRef.current.abort();
    }
    setConvertLoading(false);
    setConvertingId(null);
    setStatus("Conversion cancelled.");
  }

  async function handleConvertAccept() {
    if (!diffData) return;
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

      // If the editor was open for this card, refresh the form
      if (editingId === convertedRecordId) {
        setEditingIsCcv2(false);
        setViewTab("bl");
        const updated = templateToForm(targetTpl);
        setForm(updated);
        setInitialForm(updated);
      }
    } catch (e) {
      setConvertError(e instanceof Error ? e.message : String(e));
    } finally {
      setConvertLoading(false);
    }
  }

  function closeDiffModal() {
    setDiffData(null);
    setConvertingId(null);
    setConvertError(null);
  }

  // ── Reformat an existing BL sheet into the target format (preview/accept) ──
  async function handleReformat() {
    if (!editingId) return;
    setConvertLoading(true);
    setConvertError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await reformatCharacterGenerate(editingId, {
        format: targetFormat,
        signal: controller.signal,
      });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: editingId,
        kind: "reformat",
      });
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === "AbortError" ||
          e.message.includes("aborted") ||
          e.message.includes("cancelled"))
      ) {
        setStatus("Reformat cancelled.");
      } else {
        setConvertError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setConvertLoading(false);
      abortControllerRef.current = null;
    }
  }

  async function handleReformatRetry(feedback: string) {
    if (!diffData) return;
    setConvertLoading(true);
    setConvertError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await reformatCharacterGenerate(diffData.recordId, {
        format: targetFormat,
        currentContent: diffData.newContent,
        feedback: feedback || undefined,
        signal: controller.signal,
      });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: diffData.recordId,
        kind: "reformat",
      });
    } catch (e) {
      if (
        e instanceof Error &&
        (e.name === "AbortError" ||
          e.message.includes("aborted") ||
          e.message.includes("cancelled"))
      ) {
        setStatus("Reformat retry cancelled.");
      } else {
        setConvertError(e instanceof Error ? e.message : String(e));
      }
    } finally {
      setConvertLoading(false);
      abortControllerRef.current = null;
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

      // If the editor was open for this card, refresh the form
      if (editingId === reformattedRecordId) {
        const updated = templateToForm(targetTpl);
        setForm(updated);
        setInitialForm(updated);
      }
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
        <Badge variant="neutral" size="xs">
          v{latest.cardVersion ?? String(latest.version)}
        </Badge>
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

      {convertLoading && convertingCharacter ? (
        <StatusMessage variant="banner" tone="neutral" icon="Sparkles" sticky>
          <Stack
            direction="row"
            justify="between"
            align="center"
            gap="sm"
            wrap
          >
            <span>
              Converting{" "}
              <strong>&quot;{displayTitle(convertingCharacter)}&quot;</strong>{" "}
              to BobbinLoom format with AI…
            </span>
            <Button
              type="button"
              variant="danger"
              size="xs"
              leftIcon="X"
              onClick={handleCancelConvert}
              title="Cancel ongoing conversion"
            >
              Cancel
            </Button>
          </Stack>
        </StatusMessage>
      ) : null}

      {importing ? (
        <StatusMessage variant="banner" tone="neutral" icon="Upload" sticky>
          Importing character card…
        </StatusMessage>
      ) : null}

      {convertedSuccess ? (
        <StatusMessage
          variant="banner"
          tone="ok"
          icon="CheckCircle2"
          sticky
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
                  <strong>&quot;{convertedSuccess.recordName}&quot;</strong>{" "}
                  to BobbinLoom format!
                </>
              )}
            </span>
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
          </Stack>
        </StatusMessage>
      ) : null}

      {importSuccess ? (
        <StatusMessage
          variant="banner"
          tone="ok"
          icon="CheckCircle2"
          sticky
          onDismiss={() => setImportSuccess(null)}
        >
          <Stack direction="row" align="center" gap="sm" wrap>
            <span>
              Successfully imported{" "}
              <strong>&quot;{importSuccess.recordName}&quot;</strong> into the
              library!
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
          tone="err"
          icon="Trash2"
          sticky
          onDismiss={() => setDeleteSuccess(null)}
        >
          Character card{" "}
          <strong>&quot;{deleteSuccess.recordName}&quot;</strong> was deleted
          from the library.
        </StatusMessage>
      ) : null}

      {libraryError ? (
        <StatusMessage
          variant="banner"
          tone="err"
          icon="AlertTriangle"
          sticky
          onDismiss={() => setLibraryError(null)}
        >
          {libraryError}
        </StatusMessage>
      ) : null}

      {conversionFailed ? (
        <StatusMessage
          variant="banner"
          tone="err"
          icon="AlertCircle"
          sticky
          onDismiss={() => setConversionFailed(null)}
        >
          <Stack direction="row" align="center" gap="sm" wrap>
            <span>
              Failed to convert{" "}
              <strong>
                &quot;{displayTitle(conversionFailed.template)}&quot;
              </strong>{" "}
              to BobbinLoom format: {conversionFailed.error}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="xs"
              onClick={() => {
                const tpl = conversionFailed.template;
                setConversionFailed(null);
                void handleConvert(tpl);
              }}
              leftIcon="RefreshCw"
            >
              Retry
            </Button>
          </Stack>
        </StatusMessage>
      ) : null}

        {editorOpen ? (
          <div
            className={`character-editor-inline ${aiBrainstormOpen ? "split-layout" : ""}`}
          >
            <div className="editor-top-bar">
              <div className="editor-title-wrap">
                  <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleCancelClick}
                  leftIcon={<Icon name="ArrowLeft" size={15} />}
                  title="Return to Character Library"
                >
                  Back
                </Button>
                <h3>
                  {editingId
                    ? `Edit: ${form.title.trim() || form.name}`
                    : "New Character"}
                </h3>
                {status ? (
                  <Badge
                    variant={
                      status.toLowerCase().includes("error") ||
                      status.toLowerCase().includes("fail")
                        ? "danger"
                        : "success"
                    }
                    pill
                    leftIcon={
                      <Icon
                        name={
                          status.toLowerCase().includes("error") ||
                          status.toLowerCase().includes("fail")
                            ? "AlertCircle"
                            : "Check"
                        }
                        size={13}
                      />
                    }
                  >
                    {status}
                  </Badge>
                ) : null}
              </div>

              <div className="editor-header-actions">
                <div
                  className="format-picker-label"
                  title="Target character format used by Convert to BL and Update into Newer Format"
                >
                  <span>Format</span>
                  <SimpleSelect<string>
                    value={targetFormatId ?? (presetOptions[0]?.id || "")}
                    onChange={(val) => setTargetFormatId(val)}
                    options={presetOptions.map((p) => ({
                      value: p.id,
                      label: p.name,
                    }))}
                    size="xs"
                  />
                </div>

                {!editingIsCcv2 ? (
                  <Button
                    type="button"
                    variant="ai"
                    size="sm"
                    onClick={() => setAiBrainstormOpen(!aiBrainstormOpen)}
                    leftIcon={
                      <Icon
                        name="Sparkles"
                        size={14}
                        className={aiLoading ? "sparkle-pulse" : ""}
                      />
                    }
                    title={
                      aiBrainstormOpen
                        ? "Hide AI Assistant"
                        : "Open AI Brainstorm Assistant"
                    }
                  >
                    <span>AI Assistant</span>
                    {aiMessages.length > 0 && (
                      <span className="ai-msg-count-badge">
                        {aiMessages.length}
                      </span>
                    )}
                  </Button>
                ) : null}

                {!editingIsCcv2 &&
                editingId &&
                !isFormatAligned(form.content, targetFormat) ? (
                  <Button
                    type="button"
                    variant="ai"
                    size="xs"
                    onClick={() => void handleReformat()}
                    disabled={convertLoading}
                    title="Restructure this sheet to match the selected format, with a preview before applying"
                    leftIcon={
                      <Icon
                        name="Sparkles"
                        size={14}
                        className={convertLoading ? "sparkle-pulse" : ""}
                      />
                    }
                  >
                    {convertLoading
                      ? "Updating…"
                      : "Update into Newer Format with AI"}
                  </Button>
                ) : null}

                {editingIsCcv2 ? (
                  <Button
                    type="button"
                    size="xs"
                    variant="primary"
                    onClick={() => {
                      const tpl = templates.find((t) => t.id === editingId);
                      if (tpl) handleConvert(tpl);
                    }}
                    disabled={convertLoading}
                  >
                    {convertLoading ? "Converting…" : "Convert to BL Format"}
                  </Button>
                ) : null}
              </div>
            </div>

            <div className="editor-split-container">
              <div className="editor-main-pane">
                {(() => {
                  const editingTemplate = editingId
                    ? templates.find((t) => t.id === editingId)
                    : null;
                  const hasOriginalCcv2 =
                    editingTemplate?.cardRef?.kind === "png";
                  const updatedAt = editingTemplate?.avatarUpdatedAt;
                  return (
                    <CharacterPortraitDrawer
                      entityId={editingTemplate?.id}
                      entityName={form.name}
                      entityLabel="character card"
                      portraitUrl={
                        editingTemplate
                          ? getCharacterAvatarUrl(
                              editingTemplate.id,
                              "portrait",
                              updatedAt,
                            )
                          : null
                      }
                      profileUrl={
                        editingTemplate
                          ? getCharacterAvatarUrl(
                              editingTemplate.id,
                              "profile",
                              updatedAt,
                            )
                          : null
                      }
                      originalUrl={
                        editingTemplate && hasOriginalCcv2
                          ? getCharacterAvatarUrl(
                              editingTemplate.id,
                              "original",
                              updatedAt,
                            )
                          : null
                      }
                      hasOriginalCcv2={hasOriginalCcv2}
                      hasCustomPortrait={!!editingTemplate?.customPortrait}
                      hasProfileImage={!!editingTemplate?.profileImage}
                      onUploadPortrait={async (dataBase64, fileName) => {
                        if (!editingId) return;
                        const res = await uploadCharacterAvatar(
                          editingId,
                          "portrait",
                          dataBase64,
                          fileName,
                        );
                        setTemplates((prev) =>
                          prev.map((t) =>
                            t.id === editingId ? res.record : t,
                          ),
                        );
                      }}
                      onUploadProfile={async (dataBase64, fileName) => {
                        if (!editingId) return;
                        const res = await uploadCharacterAvatar(
                          editingId,
                          "profile",
                          dataBase64,
                          fileName,
                        );
                        setTemplates((prev) =>
                          prev.map((t) =>
                            t.id === editingId ? res.record : t,
                          ),
                        );
                      }}
                      onRestoreOriginalPortrait={async () => {
                        if (!editingId) return;
                        const res =
                          await restoreOriginalCharacterAvatar(editingId);
                        setTemplates((prev) =>
                          prev.map((t) =>
                            t.id === editingId ? res.record : t,
                          ),
                        );
                      }}
                      onDeletePortrait={async () => {
                        if (!editingId) return;
                        const res =
                          await restoreOriginalCharacterAvatar(editingId);
                        setTemplates((prev) =>
                          prev.map((t) =>
                            t.id === editingId ? res.record : t,
                          ),
                        );
                      }}
                      onDeleteProfile={async () => {
                        if (!editingId) return;
                        const res =
                          await deleteCharacterProfileAvatar(editingId);
                        setTemplates((prev) =>
                          prev.map((t) =>
                            t.id === editingId ? res.record : t,
                          ),
                        );
                      }}
                      disabled={saving}
                    />
                  );
                })()}

                <FormGrid cols={2} gap="sm">
                  <TextInput
                    label="Character Name (In-Story / AI)"
                    value={form.name}
                    placeholder="e.g. Miku"
                    helperText="The name used inside stories and seen by the AI."
                    onChange={(e) =>
                      setForm((f) => ({ ...f, name: e.target.value }))
                    }
                  />
                  <TextInput
                    label="Card Title / Variant (Optional)"
                    value={form.title}
                    placeholder={
                      form.name.trim()
                        ? `e.g. ${form.name.trim()} — Anthro Fox`
                        : "e.g. Miku — Anthro Fox"
                    }
                    helperText="Displayed in the library only (hidden from the AI). Defaults to Character Name if blank."
                    onChange={(e) =>
                      setForm((f) => ({ ...f, title: e.target.value }))
                    }
                    rightElement={
                      !form.title.trim() && form.name.trim() ? (
                        <Button
                          type="button"
                          variant="ghost"
                          size="xs"
                          onClick={() =>
                            setForm((f) => ({ ...f, title: f.name.trim() }))
                          }
                          title="Copy current Character Name into Card Title so you can shorten the in-story Character Name"
                        >
                          Copy Name
                        </Button>
                      ) : undefined
                    }
                  />
                </FormGrid>

                {(() => {
                  const tpl = editingId
                    ? templates.find((t) => t.id === editingId)
                    : undefined;
                  const isConverted =
                    editingId !== null && !!tpl?.ccv2Content && !editingIsCcv2;
                  const originalCreatorNotes =
                    tpl?.ccv2CreatorNotes ?? tpl?.creatorNotes ?? "";
                  const originalTags =
                    tpl?.ccv2Tags ??
                    (tpl?.format === "ccv2" ? (tpl.tags ?? []) : []) ??
                    [];

                  if (!isConverted) {
                    // Unconverted CCv2 (read-only) or native BL (editable) — single view.
                    return (
                      <>
                        <TextArea
                          label={
                            <Stack direction="row" align="center" gap="xs">
                              <span>Creator&apos;s Notes</span>
                              {editingIsCcv2 ? (
                                <Badge variant="outline" size="xs" pill>
                                  Read-only CCv2 sheet
                                </Badge>
                              ) : null}
                            </Stack>
                          }
                          rows={3}
                          value={form.creatorNotes}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              creatorNotes: e.target.value,
                            }))
                          }
                          placeholder="Optional notes from the creator (e.g. usage guidelines, character background, tags)..."
                          disabled={editingIsCcv2}
                        />

                        <TagChipEditor
                          tags={form.tags}
                          onChange={(tags) => setForm((f) => ({ ...f, tags }))}
                          allLibraryTags={allTagCounts.map((t) => t.tag)}
                          disabled={editingIsCcv2}
                          onSuggestAI={
                            !editingIsCcv2
                              ? () => void handleOpenAiTagSuggestions()
                              : undefined
                          }
                          suggestingAI={tagSuggestLoading}
                          taxonomyConfig={taxonomyConfig}
                        />

                        <TextArea
                          label={
                            <Stack direction="row" align="center" gap="xs">
                              <span>Content (full character sheet)</span>
                              {editingIsCcv2 ? (
                                <Badge variant="outline" size="xs" pill>
                                  Read-only CCv2 sheet
                                </Badge>
                              ) : null}
                            </Stack>
                          }
                          rows={20}
                          value={form.content}
                          onChange={(e) =>
                            setForm((f) => ({
                              ...f,
                              content: e.target.value,
                            }))
                          }
                          placeholder={CHARACTER_SHEET_EXAMPLE}
                          disabled={editingIsCcv2}
                        />
                      </>
                    );
                  }

                  // Converted → tabs: BL Format (editable) / Original (read-only) / Both (live).
                  return (
                    <div className="editor-tabs-wrap">
                      <Tabs<"bl" | "original" | "both">
                        variant="underline"
                        activeTab={viewTab}
                        onChange={(val) => setViewTab(val)}
                        tabs={[
                          { id: "bl", label: "BL Format" },
                          { id: "original", label: "Original" },
                          { id: "both", label: "Both" },
                        ]}
                      />
                      {viewTab === "bl" ? (
                        <>
                          <TextArea
                            label="Creator's Notes (BL format — editable)"
                            rows={3}
                            value={form.creatorNotes}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                creatorNotes: e.target.value,
                              }))
                            }
                            placeholder="Optional notes from the creator (e.g. usage guidelines, character background, tags)..."
                          />

                          <TagChipEditor
                            tags={form.tags}
                            onChange={(tags) =>
                              setForm((f) => ({ ...f, tags }))
                            }
                            allLibraryTags={allTagCounts.map((t) => t.tag)}
                            onSuggestAI={() =>
                              void handleOpenAiTagSuggestions()
                            }
                            suggestingAI={tagSuggestLoading}
                            taxonomyConfig={taxonomyConfig}
                          />

                          <TextArea
                            label="Content (BL format — editable)"
                            rows={20}
                            value={form.content}
                            onChange={(e) =>
                              setForm((f) => ({
                                ...f,
                                content: e.target.value,
                              }))
                            }
                          />
                        </>
                      ) : viewTab === "original" ? (
                        <>
                          <TextArea
                            label={
                              <Stack direction="row" align="center" gap="xs">
                                <span>Original Creator&apos;s Notes</span>
                                <Badge variant="outline" size="xs" pill>
                                  Read-only
                                </Badge>
                              </Stack>
                            }
                            rows={3}
                            value={originalCreatorNotes}
                            readOnly
                            placeholder="(no original creator notes)"
                          />

                          <div className="editor-field read-only">
                            <div className="editor-field-header-row">
                              <span className="editor-field-label">
                                Original CCv2 Tags
                              </span>
                              {originalTags.length > 0 ? (
                                <Button
                                  type="button"
                                  size="xs"
                                  variant="secondary"
                                  onClick={() =>
                                    setForm((f) => ({
                                      ...f,
                                      tags: [...originalTags],
                                    }))
                                  }
                                  title="Restore original CCv2 tags to current character sheet"
                                  leftIcon={<Icon name="RotateCcw" size={13} />}
                                >
                                  Restore Original Tags
                                </Button>
                              ) : null}
                            </div>
                            <div className="read-only-tags-wrap">
                              {originalTags.length > 0 ? (
                                originalTags.map((tag) => (
                                  <TagChip
                                    key={tag}
                                    tag={tag}
                                    userConfig={taxonomyConfig}
                                    size="sm"
                                  />
                                ))
                              ) : (
                                <span className="empty-tags-hint">
                                  (no original tags)
                                </span>
                              )}
                            </div>
                          </div>

                          <TextArea
                            label={
                              <Stack direction="row" align="center" gap="xs">
                                <span>Original CCv2 Content</span>
                                <Badge variant="outline" size="xs" pill>
                                  Read-only
                                </Badge>
                              </Stack>
                            }
                            rows={20}
                            value={tpl!.ccv2Content ?? ""}
                            readOnly
                          />
                        </>
                      ) : (
                        <>
                          <div className="editor-field">
                            <span className="editor-field-label">
                              Creator&apos;s Notes
                            </span>
                            <TwoPaneDiff
                              leftLabel="Original Creator's Notes"
                              rightLabel="BL Format"
                              leftContent={originalCreatorNotes}
                              rightContent={form.creatorNotes}
                              className="editor-both-diff notes-diff"
                            />
                          </div>

                          <TagDiffViewer
                            originalTags={originalTags}
                            currentTags={form.tags}
                            onRestore={() =>
                              setForm((f) => ({
                                ...f,
                                tags: [...originalTags],
                              }))
                            }
                            taxonomyConfig={taxonomyConfig}
                          />

                          <div className="editor-field">
                            <span className="editor-field-label">Content</span>
                            <TwoPaneDiff
                              leftLabel="Original CCv2"
                              rightLabel="BL Format"
                              leftContent={tpl!.ccv2Content!}
                              rightContent={form.content}
                              className="editor-both-diff"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  );
                })()}

                <div className="editor-footer-actions">
                  {editingId ? (
                    <Tooltip content="Delete this character card from the library">
                      <Button
                        type="button"
                        variant="danger"
                        onClick={() => {
                          const targetTpl = templates.find(
                            (t) => t.id === editingId,
                          );
                          const targetName = targetTpl
                            ? displayTitle(targetTpl)
                            : form.name;
                          requestDelete(editingId, targetName);
                        }}
                        disabled={saving}
                        leftIcon={<Icon name="Trash2" size={14} />}
                      >
                        Delete
                      </Button>
                    </Tooltip>
                  ) : (
                    <div />
                  )}
                  <div className="editor-footer-right-actions">
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={handleCancelClick}
                      disabled={saving}
                    >
                      Cancel
                    </Button>
                    <Tooltip
                      content={
                        !isFormDirty
                          ? "No changes to save"
                          : "Save character card"
                      }
                    >
                      <Button
                        type="button"
                        variant="primary"
                        onClick={handleSave}
                        disabled={saving || !form.name.trim() || !isFormDirty}
                        isLoading={saving}
                        leftIcon={<Icon name="Check" size={14} />}
                      >
                        Save
                      </Button>
                    </Tooltip>
                  </div>
                </div>
              </div>

              {aiBrainstormOpen && (
                <div className="editor-ai-pane">
                  <CharacterBrainstormPanel
                    characterName={form.name}
                    hasOriginalCcv2={
                      !!templates.find((t) => t.id === editingId)?.ccv2Content
                    }
                    includeOriginalCcv2={includeOriginalCcv2}
                    onOpenSettings={() => setBrainstormSettingsOpen(true)}
                    messages={aiMessages}
                    onSendMessage={handleSendBrainstormMessage}
                    onEditMessage={handleEditBrainstormMessage}
                    onRevertAndRetry={handleRevertAndRetryBrainstorm}
                    onRegenerate={handleRegenerateBrainstorm}
                    onApplySection={handleApplySection}
                    onApplyAll={handleApplyAllProposed}
                    onClearChat={handleClearBrainstormChat}
                    onClose={() => setAiBrainstormOpen(false)}
                    loading={aiLoading}
                    error={aiError}
                    onCancel={handleCancelBrainstorm}
                  />
                </div>
              )}
            </div>
          </div>
        ) : (
          <Stack
            direction="row"
            align="start"
            gap="lg"
            fullWidth
            stackBelow="md"
          >
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
            <Stack
              direction="column"
              align="stretch"
              gap="sm"
              flex1
              fullWidth
            >
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
                                    preWrap
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
                                <Text
                                  as="span"
                                  size="xs"
                                  tone="muted"
                                  italic
                                >
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
                                    preWrap
                                  >
                                    {latest.creatorNotes.trim()}
                                  </Text>
                                </Card>
                              ) : null}

                                {/* Rows 5 & 6: Separator + Tags (anchored at bottom) */}
                              <Stack
                                direction="column"
                                align="stretch"
                                gap="xs"
                                fullWidth
                                pushBottom
                              >
                                <Separator spacing="none" />
                                <TagRow
                                  taxonomy="character"
                                  userConfig={taxonomyConfig}
                                  tags={sortedTags}
                                  activeTags={activeFilterTags}
                                  onToggleTag={toggleTag}
                                  onEditTags={() =>
                                    handleEditTagsRequest(latest)
                                  }
                                  wrapAll
                                />
                              </Stack>
                            </Card.Body>
                          </Card>
                        );
                      })}
                    </FormGrid>
                  )}

                  {/* 2. List View */}
                  {viewMode === "list" && (
                    <Stack
                      direction="column"
                      align="stretch"
                      gap="sm"
                      fullWidth
                    >
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
                            <CharacterAvatar
                              template={latest}
                              variant="list"
                            />
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
                                <Stack
                                  direction="row"
                                  align="center"
                                  gap="xs"
                                  wrap
                                  flex1
                                >
                                  <Card.TitleButton
                                    title={displayTitle(latest)}
                                    onClick={() => requestOpenEdit(latest)}
                                  >
                                    <Text
                                      as="span"
                                      size="md"
                                      weight="semibold"
                                      preWrap
                                    >
                                      {displayTitle(latest)}
                                    </Text>
                                  </Card.TitleButton>
                                  {renderCharacterBadges(group, latest, badge)}
                                  {renderCharacterDate(group)}
                                  {latest.creator?.trim() ? (
                                    <Text
                                      as="span"
                                      size="xs"
                                      tone="muted"
                                      italic
                                    >
                                      by {latest.creator.trim()}
                                    </Text>
                                  ) : null}
                                </Stack>

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
                                      onClick={() =>
                                        handleOpenCardFamily(latest)
                                      }
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

                              {latest.creatorNotes?.trim() ? (
                                <Card variant="elevated" padding="xs" fullWidth>
                                  <Text
                                    as="p"
                                    size="xs"
                                    tone="secondary"
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
                                onToggleTag={toggleTag}
                                onEditTags={() => handleEditTagsRequest(latest)}
                                wrapAll
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
                              <CharacterAvatar
                                template={latest}
                                variant="grid"
                              />
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
                                    preWrap
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

                              <Stack
                                direction="column"
                                align="stretch"
                                gap="xs"
                                fullWidth
                                pushBottom
                              >
                                <Separator spacing="none" />
                                <TagRow
                                  taxonomy="character"
                                  userConfig={taxonomyConfig}
                                  tags={sortedTags}
                                  activeTags={activeFilterTags}
                                  onToggleTag={toggleTag}
                                  onEditTags={() =>
                                    handleEditTagsRequest(latest)
                                  }
                                />
                              </Stack>
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

      {/* Diff comparison modal */}
      {diffData ? (
        diffData.readOnly ? (
          <DiffModal
            title="Compare: Original CCv2 vs Current BL"
            oldLabel="Original CCv2"
            newLabel="Current BL"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onClose={closeDiffModal}
            loading={false}
            error={null}
          />
        ) : diffData.kind === "reformat" ? (
          <DiffModal
            title="Update into Newer Format"
            oldLabel="Current Sheet"
            newLabel="Updated Sheet"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onAccept={handleReformatAccept}
            onRetry={handleReformatRetry}
            onClose={closeDiffModal}
            loading={convertLoading}
            error={convertError}
          />
        ) : (
          <DiffModal
            title="Convert to BL Format"
            oldLabel="Original CCv2"
            newLabel="Generated BL"
            oldContent={diffData.oldContent}
            newContent={diffData.newContent}
            onAccept={handleConvertAccept}
            onRetry={handleConvertRetry}
            onClose={closeDiffModal}
            loading={convertLoading}
            error={convertError}
          />
        )
      ) : null}

      {/* Import notice modal */}
      {importNotice ? (
        <Dialog
          title="Already Imported"
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

      {/* AI Tag Suggestion Modal (Option B) */}
      {tagSuggestModalOpen ? (
        <TagSuggestionModal
          characterName={form.name}
          suggestedTags={suggestedTags}
          currentTags={form.tags}
          loading={tagSuggestLoading}
          error={tagSuggestError}
          taxonomyConfig={taxonomyConfig}
          onApply={(selectedTags) => {
            setForm((f) => ({
              ...f,
              tags: sortTags(selectedTags, taxonomyConfig),
            }));
            setTagSuggestModalOpen(false);
            setSuggestedTags([]);
          }}
          onRegenerate={(guidance) => {
            void handleOpenAiTagSuggestions(guidance);
          }}
          onClose={handleCancelTagSuggest}
        />
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

      {/* Discard Changes Warning Modal */}
      {discardConfirm && (
        <ConfirmModal
          title="Discard unsaved changes?"
          confirmLabel="Discard Changes"
          cancelLabel="Keep Editing"
          danger
          onConfirm={handleConfirmDiscard}
          onCancel={() => setDiscardConfirm(null)}
          message={
            !editingId && aiMessages.length > 0 ? (
              <span>
                <strong>&quot;{form.name || "New Character"}&quot;</strong> has
                not been saved yet, so its AI brainstorming session (
                {aiMessages.length} message
                {aiMessages.length === 1 ? "" : "s"}) cannot be kept
                {isFormDirty
                  ? ", and your edits to the sheet go with it"
                  : ""}
                .
              </span>
            ) : (
              <span>
                You have unsaved changes to{" "}
                <strong>&quot;{form.name || "New Character"}&quot;</strong>
                {aiMessages.length > 0
                  ? `, and an AI brainstorming session (${aiMessages.length} message${aiMessages.length === 1 ? "" : "s"}) which is kept`
                  : ""}
                . Your unsaved edits will be discarded.
              </span>
            )
          }
        />
      )}

      {/* Brainstorm Settings Modal */}
      {brainstormSettingsOpen ? (
        <BrainstormSettingsModal
          hasOriginalCcv2={
            !!templates.find((t) => t.id === editingId)?.ccv2Content
          }
          includeOriginalCard={includeOriginalCcv2}
          allowNewSections={brainstormAllowNewSections}
          providerId={brainstormProviderId}
          errorMessage={brainstormSettingsError}
          onToggleIncludeOriginalCard={handleToggleIncludeOriginalCard}
          onToggleAllowNewSections={handleToggleAllowNewSections}
          onProviderChange={handleBrainstormProviderChange}
          onClose={() => {
            setBrainstormSettingsOpen(false);
            setBrainstormSettingsError(null);
          }}
        />
      ) : null}

      {revertRetryTarget ? (
        <ConfirmModal
          title="Revert & Retry"
          message={`Go back to the question this answered and ask it again? The ${revertRetryTarget.drops} message${revertRetryTarget.drops === 1 ? "" : "s"} after it will be dropped.`}
          confirmLabel="Revert & Retry"
          onConfirm={() => {
            const target = revertRetryTarget;
            setRevertRetryTarget(null);
            if (target) performRevertRetry(target.id);
          }}
          onCancel={() => setRevertRetryTarget(null)}
        />
      ) : null}

      {deleteTarget ? (
        <ConfirmModal
          title="Delete Character"
          message={`Delete "${deleteTarget.name}" from the library? This cannot be undone.`}
          confirmLabel="Delete"
          danger
          onConfirm={() => void handleConfirmDelete()}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      <input
        ref={fileInputRef}
        type="file"
        accept=".png,.json"
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
                    disabled={saving || importing}
                    isLoading={importing}
                  >
                    {importing ? "Importing…" : "Import Card"}
                  </Button>
                  <Button
                    variant="primary"
                    size="sm"
                    leftIcon="Plus"
                    onClick={openCreate}
                    disabled={saving || importing}
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
                disabled={saving || importing}
                isLoading={importing}
              >
                {importing ? "Importing…" : "Import Card"}
              </Button>
              <Button
                variant="primary"
                size="md"
                leftIcon="Plus"
                onClick={openCreate}
                disabled={saving || importing}
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
