import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate } from "../../../schemas";
import type { CharacterFormat } from "../../../schemas";
import type { ViewPreferences } from "../../../schemas";
import {
  createCharacter,
  deleteCharacter,
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
  displayTitle,
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
  Icon,
  Pagination,
  SearchBar,
  SimpleSelect,
  Stack,
  StatusMessage,
  Tabs,
  TagChip,
  TagSidebar,
  Text,
  TextArea,
  TextInput,
  Tooltip,
} from "../base";
export { CharacterAvatar } from "../base";
import { usePagination } from "../../hooks/usePagination";
import { CharacterPortraitDrawer, ConfirmModal } from "../common";
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
  isModal?: boolean;
  initialEditingId?: string;
};

export type ViewMode = "portrait" | "list" | "grid";

type CharacterForm = {
  name: string;
  creatorNotes: string;
  tags: string[];
  content: string;
};

function blankForm(): CharacterForm {
  return { name: "", creatorNotes: "", tags: [], content: "" };
}

function templateToForm(t: CharacterTemplate): CharacterForm {
  return {
    name: t.name,
    creatorNotes: t.creatorNotes ?? "",
    tags: t.tags ?? [],
    content: t.content,
  };
}

function formToUpdate(form: CharacterForm): CharacterTemplateUpdate {
  return {
    name: form.name,
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
  isModal,
  initialEditingId,
}: CharacterLibraryProps) {
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
      if (editingId) {
        await updateCharacter(
          editingId,
          editingIsCcv2 ? { name: update.name } : update,
        );
        setStatus(`"${form.name}" saved successfully.`);
      } else {
        const created = await createCharacter(form.name);
        await updateCharacter(created.id, {
          content: form.content,
          creatorNotes: form.creatorNotes,
          tags: canonicalTags,
        });
        setEditingId(created.id);
        // Now that the character has an id, the conversation it already has can be kept.
        persistBrainstormSession(aiMessages, created.id);
        setStatus(`"${form.name}" created and saved successfully.`);
      }
      setForm((prev) => ({ ...prev, tags: canonicalTags }));
      setInitialForm({ ...form, tags: canonicalTags });
      setTemplates(await listCharacters());
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
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

  return (
    <div
      className={`character-library-container ${isModal ? "is-modal" : "is-workspace"}`}
    >
      {isModal ? (
        <div style={{ marginBottom: "0.75rem" }}>
          <Badge
            variant="outline"
            size="sm"
            title="Edits modify global templates used for new playthroughs"
          >
            🌐 Global Character Templates
          </Badge>
        </div>
      ) : null}

      <div className="character-manager-body">
        {convertLoading && convertingCharacter ? (
          <StatusMessage
            variant="banner"
            tone="neutral"
            icon="Sparkles"
            className="library-sticky-banner"
          >
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
                leftIcon={<Icon name="X" size={14} />}
                onClick={handleCancelConvert}
                title="Cancel ongoing conversion"
              >
                Cancel
              </Button>
            </Stack>
          </StatusMessage>
        ) : null}

        {importing ? (
          <StatusMessage
            variant="banner"
            tone="neutral"
            icon="Upload"
            className="library-sticky-banner"
          >
            Importing character card…
          </StatusMessage>
        ) : null}

        {convertedSuccess ? (
          <StatusMessage
            variant="banner"
            tone="ok"
            icon="CheckCircle2"
            className="library-sticky-banner"
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
                rightIcon={<Icon name="ArrowRight" size={13} />}
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
            className="library-sticky-banner"
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
                rightIcon={<Icon name="ArrowRight" size={13} />}
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
            className="library-sticky-banner"
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
            className="library-sticky-banner"
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
            className="library-sticky-banner"
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
                leftIcon={<Icon name="RefreshCw" size={12} />}
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
                <h3>{editingId ? `Edit: ${form.name}` : "New Character"}</h3>
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

                <TextInput
                  label="Name"
                  value={form.name}
                  onChange={(e) =>
                    setForm((f) => ({ ...f, name: e.target.value }))
                  }
                />

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
          <div className="character-booru-layout">
            {/* ── Left-side Booru Tag Sidebar (shared primitive) ── */}
            <TagSidebar
              taxonomy="character"
              userConfig={taxonomyConfig}
              tagCounts={allTagCounts}
              activeTags={activeFilterTags}
              onToggleTag={toggleTag}
              onClearTags={search.trim() ? () => setSearch("") : undefined}
              onOpenSettings={() => setTaxonomyModalOpen(true)}
              mode={sidebarViewMode}
              onModeChange={setSidebarViewMode}
              collapsedCategories={collapsedCategories}
              onToggleCategory={toggleCategoryCollapse}
            />

            {/* ── Main Gallery Area ── */}
            <main className="character-main-gallery">
              {/* Top Toolbar */}
              <div className="library-toolbar">
                <div className="library-toolbar-actions">
                  <Button
                    variant="primary"
                    onClick={openCreate}
                    leftIcon={<Icon name="Plus" size={15} />}
                  >
                    New Character
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => fileInputRef.current?.click()}
                    disabled={importing}
                    isLoading={importing}
                    leftIcon={<Icon name="Upload" size={15} />}
                  >
                    Import Card
                  </Button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".png,.json"
                    style={{ display: "none" }}
                    onChange={handleImportFile}
                  />
                </div>

                <SearchBar
                  value={search}
                  onChange={(val) => {
                    setSearch(val);
                  }}
                  placeholder="Search name, tags, creator:…"
                  size="md"
                  containerClassName="library-search-wrapper"
                />

                {/* Sort Controls */}
                <div
                  className="library-sort-control-group"
                  role="group"
                  aria-label="Sort library"
                >
                  <SimpleSelect<CharacterSortOption>
                    value={sortBy}
                    onChange={(val) => setSortBy(val)}
                    options={[
                      {
                        value: "name",
                        label: "Name",
                        icon: <Icon name="ArrowUpDown" size={12} />,
                      },
                      {
                        value: "createdAt",
                        label: "Created Date",
                        icon: <Icon name="ArrowUpDown" size={12} />,
                      },
                      {
                        value: "updatedAt",
                        label: "Updated Date",
                        icon: <Icon name="ArrowUpDown" size={12} />,
                      },
                    ]}
                    size="xs"
                    variant="ghost"
                    aria-label="Sort characters by"
                  />
                  <button
                    type="button"
                    className="library-sort-dir-btn"
                    onClick={toggleSortDirection}
                    title={
                      sortBy === "name"
                        ? sortDirection === "asc"
                          ? "Sort A to Z (click for Z to A)"
                          : "Sort Z to A (click for A to Z)"
                        : sortDirection === "desc"
                          ? "Newest first (click for Oldest first)"
                          : "Oldest first (click for Newest first)"
                    }
                    aria-label="Toggle sort order"
                  >
                    <Icon
                      name={
                        sortDirection === "asc"
                          ? "ArrowUpNarrowWide"
                          : "ArrowDownWideNarrow"
                      }
                      size={14}
                    />
                    <span className="sort-dir-label">
                      {sortBy === "name"
                        ? sortDirection === "asc"
                          ? "A-Z"
                          : "Z-A"
                        : sortDirection === "desc"
                          ? "Newest"
                          : "Oldest"}
                    </span>
                  </button>
                </div>

                {/* View Mode Switcher */}
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
              </div>

              {/* Active Search Summary Filter Chips */}
              {activeFilterTags.length > 0 ? (
                <div className="active-filters-bar">
                  <span className="active-filters-label">Active filters:</span>
                  {activeFilterTags.map((tag) => (
                    <TagChip
                      key={tag}
                      tag={tag}
                      userConfig={taxonomyConfig}
                      active={true}
                      size="sm"
                      onRemove={() => removeFilterTag(tag)}
                    />
                  ))}
                  <Button
                    type="button"
                    variant="ghost"
                    size="xs"
                    onClick={() => {
                      setSearch("");
                    }}
                  >
                    Clear all
                  </Button>
                </div>
              ) : null}

              {/* Results Gallery according to ViewMode */}
              {groups.length === 0 ? (
                <div className="empty-library-container">
                  <Text tone="muted" align="center">
                    {search
                      ? "No characters found matching your search."
                      : "No characters in the library yet."}
                  </Text>
                  {search ? (
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      style={{ marginTop: "8px" }}
                      onClick={() => {
                        setSearch("");
                      }}
                    >
                      Reset filters
                    </Button>
                  ) : null}
                </div>
              ) : (
                <>
                  {paginationElement}
                  {/* 1. Card Portrait View */}
                  {viewMode === "portrait" && (
                    <div className="character-portrait-grid">
                      {paginatedGroups.map((group) => {
                        const latest = group.versions[0];
                        const badge = cardBadgeLabel(latest);
                        const isConverting =
                          convertingId === latest.id && convertLoading;
                        return (
                          <div
                            key={group.key}
                            className={`card-portrait ${isConverting ? "is-converting" : ""}`}
                            onClick={() => requestOpenEdit(latest)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") requestOpenEdit(latest);
                            }}
                          >
                            <div className="card-portrait-image-wrap">
                              <CharacterAvatar
                                template={latest}
                                variant="portrait"
                              />
                            </div>

                            <div className="card-portrait-body">
                              <div className="card-portrait-title-row">
                                <strong
                                  className="card-portrait-title"
                                  title={displayTitle(latest)}
                                >
                                  {displayTitle(latest)}
                                </strong>
                                {group.versions.length > 1 ? (
                                  <span className="version-count">
                                    ({group.versions.length} v)
                                  </span>
                                ) : null}
                              </div>

                              {latest.creator?.trim() ? (
                                <span className="card-creator-tag">
                                  by {latest.creator.trim()}
                                </span>
                              ) : null}

                              {latest.creatorNotes?.trim() ? (
                                <p className="card-creator-notes-snippet">
                                  {latest.creatorNotes.trim()}
                                </p>
                              ) : null}

                              {(latest.tags ?? []).length > 0 ? (
                                <div
                                  className="tag-chips"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {sortTags(
                                    latest.tags ?? [],
                                    taxonomyConfig,
                                  ).map((tag) => {
                                    const active = isTagActive(tag);
                                    return (
                                      <TagChip
                                        key={tag}
                                        tag={tag}
                                        userConfig={taxonomyConfig}
                                        active={active}
                                        size="xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleTag(tag);
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              ) : null}

                              {/* Portrait Footer: Badges on left, Options on right */}
                              <div className="card-portrait-footer">
                                <div className="card-portrait-badges">
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
                                  <Badge variant="accent" size="xs">
                                    v
                                    {latest.cardVersion ??
                                      String(latest.version)}
                                  </Badge>
                                  {sortBy === "createdAt" &&
                                  getGroupCreatedAt(group) ? (
                                    <Badge
                                      variant="outline"
                                      size="xs"
                                      leftIcon={<Icon name="Calendar" size={10} />}
                                      title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}
                                    >
                                      {formatLibraryDate(
                                        getGroupCreatedAt(group),
                                      )}
                                    </Badge>
                                  ) : null}
                                  {sortBy === "updatedAt" &&
                                  getGroupUpdatedAt(group) ? (
                                    <Badge
                                      variant="outline"
                                      size="xs"
                                      leftIcon={<Icon name="Clock" size={10} />}
                                      title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}
                                    >
                                      {formatLibraryDate(
                                        getGroupUpdatedAt(group),
                                      )}
                                    </Badge>
                                  ) : null}
                                </div>
                                <ActionsMenu
                                  label="Actions"
                                  items={[
                                    {
                                      label: "Edit",
                                      icon: "Pencil",
                                      onClick: () => requestOpenEdit(latest),
                                    },
                                    entryKind(latest) === "ccv2"
                                      ? {
                                          label: isConverting
                                            ? "Converting…"
                                            : "Convert to BL",
                                          icon: "Sparkles",
                                          iconClassName: isConverting
                                            ? "sparkle-pulse"
                                            : undefined,
                                          disabled: isConverting,
                                          onClick: () => handleConvert(latest),
                                        }
                                      : null,
                                    {
                                      label: "Delete",
                                      icon: "Trash2",
                                      danger: true,
                                      onClick: () =>
                                        requestDelete(
                                          latest.id,
                                          displayTitle(latest),
                                        ),
                                    },
                                  ]}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 2. List View */}
                  {viewMode === "list" && (
                    <div className="character-list-view">
                      {paginatedGroups.map((group) => {
                        const latest = group.versions[0];
                        const badge = cardBadgeLabel(latest);
                        const isConverting =
                          convertingId === latest.id && convertLoading;
                        return (
                          <div
                            key={group.key}
                            className={`card-list-row ${isConverting ? "is-converting" : ""}`}
                            onClick={() => requestOpenEdit(latest)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") requestOpenEdit(latest);
                            }}
                          >
                            <CharacterAvatar template={latest} variant="list" />
                            <div className="card-list-content">
                              <div className="card-list-header-row">
                                <div className="card-list-title-wrap">
                                  <strong className="card-list-title">
                                    {displayTitle(latest)}
                                  </strong>
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
                                  <Badge variant="accent" size="xs">
                                    v
                                    {latest.cardVersion ??
                                      String(latest.version)}
                                  </Badge>
                                  {group.versions.length > 1 ? (
                                    <span className="version-count">
                                      ({group.versions.length} versions)
                                    </span>
                                  ) : null}
                                  {latest.creator?.trim() ? (
                                    <span className="card-creator-tag">
                                      by {latest.creator.trim()}
                                    </span>
                                  ) : null}
                                  {sortBy === "createdAt" &&
                                  getGroupCreatedAt(group) ? (
                                    <Badge
                                      variant="outline"
                                      size="xs"
                                      leftIcon={<Icon name="Calendar" size={11} />}
                                      title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}
                                    >
                                      {formatLibraryDate(
                                        getGroupCreatedAt(group),
                                      )}
                                    </Badge>
                                  ) : null}
                                  {sortBy === "updatedAt" &&
                                  getGroupUpdatedAt(group) ? (
                                    <Badge
                                      variant="outline"
                                      size="xs"
                                      leftIcon={<Icon name="Clock" size={11} />}
                                      title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}
                                    >
                                      {formatLibraryDate(
                                        getGroupUpdatedAt(group),
                                      )}
                                    </Badge>
                                  ) : null}
                                </div>

                                <ActionsMenu
                                  label="Actions"
                                  items={[
                                    {
                                      label: "Edit",
                                      icon: "Pencil",
                                      onClick: () => requestOpenEdit(latest),
                                    },
                                    entryKind(latest) === "ccv2"
                                      ? {
                                          label: isConverting
                                            ? "Converting…"
                                            : "Convert to BL",
                                          icon: "Sparkles",
                                          iconClassName: isConverting
                                            ? "sparkle-pulse"
                                            : undefined,
                                          disabled: isConverting,
                                          onClick: () => handleConvert(latest),
                                        }
                                      : null,
                                    {
                                      label: "Delete",
                                      icon: "Trash2",
                                      danger: true,
                                      onClick: () =>
                                        requestDelete(
                                          latest.id,
                                          displayTitle(latest),
                                        ),
                                    },
                                  ]}
                                />
                              </div>

                              {latest.creatorNotes?.trim() ? (
                                <p className="card-creator-notes-snippet">
                                  {latest.creatorNotes.trim()}
                                </p>
                              ) : null}

                              {(latest.tags ?? []).length > 0 ? (
                                <div
                                  className="tag-chips"
                                  onClick={(e) => e.stopPropagation()}
                                >
                                  {sortTags(
                                    latest.tags ?? [],
                                    taxonomyConfig,
                                  ).map((tag) => {
                                    const active = isTagActive(tag);
                                    return (
                                      <TagChip
                                        key={tag}
                                        tag={tag}
                                        userConfig={taxonomyConfig}
                                        active={active}
                                        size="xs"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleTag(tag);
                                        }}
                                      />
                                    );
                                  })}
                                </div>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* 3. Grid View */}
                  {viewMode === "grid" && (
                    <div className="character-grid-view">
                      {paginatedGroups.map((group) => {
                        const latest = group.versions[0];
                        const badge = cardBadgeLabel(latest);
                        const isConverting =
                          convertingId === latest.id && convertLoading;
                        return (
                          <div
                            key={group.key}
                            className={`card-grid-item ${isConverting ? "is-converting" : ""}`}
                            onClick={() => requestOpenEdit(latest)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") requestOpenEdit(latest);
                            }}
                          >
                            <div className="card-grid-thumb-wrap">
                              <CharacterAvatar
                                template={latest}
                                variant="grid"
                              />
                            </div>
                            <div className="card-grid-body">
                              <strong
                                className="card-grid-title"
                                title={displayTitle(latest)}
                              >
                                {displayTitle(latest)}
                              </strong>
                              <div className="card-grid-footer">
                                <div className="card-grid-badges">
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
                                  <Badge variant="accent" size="xs">
                                    v
                                    {latest.cardVersion ??
                                      String(latest.version)}
                                  </Badge>
                                  {group.versions.length > 1 ? (
                                    <span className="version-count">
                                      ({group.versions.length} v)
                                    </span>
                                  ) : null}
                                  {sortBy === "createdAt" &&
                                  getGroupCreatedAt(group) ? (
                                    <span
                                      className="card-grid-timestamp"
                                      title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}
                                    >
                                      {formatLibraryDate(
                                        getGroupCreatedAt(group),
                                      )}
                                    </span>
                                  ) : null}
                                  {sortBy === "updatedAt" &&
                                  getGroupUpdatedAt(group) ? (
                                    <span
                                      className="card-grid-timestamp"
                                      title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}
                                    >
                                      {formatLibraryDate(
                                        getGroupUpdatedAt(group),
                                      )}
                                    </span>
                                  ) : null}
                                </div>
                                <ActionsMenu
                                  label="Actions"
                                  items={[
                                    {
                                      label: "Edit",
                                      icon: "Pencil",
                                      onClick: () => requestOpenEdit(latest),
                                    },
                                    entryKind(latest) === "ccv2"
                                      ? {
                                          label: isConverting
                                            ? "Converting…"
                                            : "Convert to BL",
                                          icon: "Sparkles",
                                          iconClassName: isConverting
                                            ? "sparkle-pulse"
                                            : undefined,
                                          disabled: isConverting,
                                          onClick: () => handleConvert(latest),
                                        }
                                      : null,
                                    {
                                      label: "Delete",
                                      icon: "Trash2",
                                      danger: true,
                                      onClick: () =>
                                        requestDelete(
                                          latest.id,
                                          displayTitle(latest),
                                        ),
                                    },
                                  ]}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {paginationElement}
                </>
              )}
            </main>
          </div>
        )}
      </div>

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
    </div>
  );
}
