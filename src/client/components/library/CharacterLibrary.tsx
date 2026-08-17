import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate } from "../../../schemas";
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
import { convertCharacterApply, convertCharacterGenerate, suggestCharacterTags, brainstormCharacter } from "../../api";
import type { CharacterTemplateUpdate, ProposedSectionChange, CharacterBrainstormResult } from "../../api";
import { CHARACTER_SHEET_EXAMPLE, applySectionChanges } from "../../../engine/characterSections";
import { displayTitle, entryKind, filterLibraryEntries, cardBadgeLabel, groupByLineage, getGroupCreatedAt, getGroupUpdatedAt, type CharacterSortOption, type SortDirection } from "../../../engine/characterCards";
import { Icon, SearchBar, TagChip, CharacterAvatar } from "../base";
export { CharacterAvatar } from "../base";
import { ConfirmModal } from "../common/ConfirmModal";
import { DiffModal } from "./DiffModal";
import { TwoPaneDiff } from "./TwoPaneDiff";
import { TagSuggestionModal } from "./TagSuggestionModal";
import { TagTaxonomyModal } from "./TagTaxonomyModal";
import { CharacterBrainstormPanel, type BrainstormChatMessage } from "./CharacterBrainstormPanel";
import { CharacterVisualsDrawer } from "./CharacterVisualsDrawer";
import { getTagTaxonomy } from "../../api";
import { groupTagsByCategory, sortTags, type TagTaxonomyConfig } from "../../../engine/tagTaxonomy";

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
    onChange(sortTags(tags.filter((t) => t !== tagToRemove), taxonomyConfig));
  }

  return (
    <div className="editor-field tag-editor-field">
      <div className="editor-field-header-row">
        <span className="editor-field-label">Tags</span>
        {onSuggestAI ? (
          <button
            type="button"
            className="suggest-tags-ai-btn"
            onClick={() => onSuggestAI()}
            disabled={disabled || suggestingAI}
            title="Use AI to analyze character content and suggest tags based on library taxonomy"
          >
            <Icon name="Sparkles" size={13} className={suggestingAI ? "sparkle-pulse" : ""} />
            {suggestingAI ? "Analyzing Tags…" : "Edit Tags by AI"}
          </button>
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
                placeholder={tags.length === 0 ? "Add tags (e.g. species:elf, rating:sfw)…" : "Add tag…"}
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
                          prev <= 0 ? availableSuggestions.length - 1 : prev - 1
                        );
                      } else {
                        setFocusedSuggestionIdx((prev) =>
                          prev >= availableSuggestions.length - 1 ? 0 : prev + 1
                        );
                      }
                      return;
                    } else if (e.key === "ArrowDown") {
                      e.preventDefault();
                      setFocusedSuggestionIdx((prev) =>
                        prev >= availableSuggestions.length - 1 ? 0 : prev + 1
                      );
                      return;
                    } else if (e.key === "ArrowUp") {
                      e.preventDefault();
                      setFocusedSuggestionIdx((prev) =>
                        prev <= 0 ? availableSuggestions.length - 1 : prev - 1
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
                  } else if (e.key === "Backspace" && !inputVal && tags.length > 0) {
                    removeTag(tags[tags.length - 1]);
                  }
                }}
                className="tag-inline-input"
              />

              {showSuggestions && availableSuggestions.length > 0 ? (
                <div className="tag-autocomplete-dropdown" role="listbox">
                  <span className="autocomplete-header">Library Suggestions:</span>
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
                      <TagChip tag={sug} userConfig={taxonomyConfig} size="xs" />
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
  const normOriginal = useMemo(() => originalTags.map((t) => t.toLowerCase()), [originalTags]);
  const normCurrent = useMemo(() => currentTags.map((t) => t.toLowerCase()), [currentTags]);

  const added = normCurrent.filter((t) => !normOriginal.includes(t));
  const removed = normOriginal.filter((t) => !normCurrent.includes(t));

  return (
    <div className="editor-field tag-diff-field">
      <div className="editor-field-header-row">
        <span className="editor-field-label">Tags Comparison</span>
        {originalTags.length > 0 ? (
          <button
            type="button"
            className="restore-tags-btn"
            onClick={onRestore}
            title="Restore original CCv2 tags"
          >
            <Icon name="RotateCcw" size={13} /> Restore Original Tags
          </button>
        ) : null}
      </div>

      <div className="tag-diff-container">
        <div className="tag-diff-pane">
          <span className="tag-diff-pane-header">Original CCv2 Tags ({originalTags.length})</span>
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
          <span className="tag-diff-pane-header">BL Format Tags ({currentTags.length})</span>
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

function getPageNumbers(current: number, total: number): number[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }
  if (current <= 4) {
    return [1, 2, 3, 4, 5, -1, total];
  }
  if (current >= total - 3) {
    return [1, -1, total - 4, total - 3, total - 2, total - 1, total];
  }
  return [1, -1, current - 1, current, current + 1, -1, total];
}



/** Card dropdown "more options" menu */
function MoreOptionsMenu({
  template,
  isOpen,
  onToggle,
  onEdit,
  onConvert,
  onDelete,
  converting,
}: {
  template: CharacterTemplate;
  isOpen: boolean;
  onToggle: (e: React.MouseEvent) => void;
  onEdit: (e: React.MouseEvent) => void;
  onConvert?: (e: React.MouseEvent) => void;
  onDelete: (e: React.MouseEvent) => void;
  converting?: boolean;
}) {
  return (
    <div
      className="card-more-menu-container"
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <button
        type="button"
        className={`more-options-btn ${isOpen ? "active" : ""}`}
        onClick={onToggle}
        title="Actions"
        aria-label="Actions"
      >
        <Icon name="MoreVertical" size={16} />
      </button>
      {isOpen ? (
        <div className="dropdown-menu">
          <button type="button" className="dropdown-item" onClick={onEdit}>
            <Icon name="Pencil" size={13} /> Edit
          </button>
          {onConvert ? (
            <button type="button" className="dropdown-item" onClick={onConvert} disabled={converting}>
              <Icon name="Sparkles" size={13} /> {converting ? "Converting…" : "Convert to BL"}
            </button>
          ) : null}
          <button type="button" className="dropdown-item danger" onClick={onDelete}>
            <Icon name="Trash2" size={13} /> Delete
          </button>
        </div>
      ) : null}
    </div>
  );
}

export function CharacterLibrary({ isModal, initialEditingId }: CharacterLibraryProps) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [form, setForm] = useState<CharacterForm>(blankForm());
  const [initialForm, setInitialForm] = useState<CharacterForm>(blankForm());
  const [showDiscardConfirm, setShowDiscardConfirm] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsCcv2, setEditingIsCcv2] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearchState] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem("bobbinloom_library_search") ?? "";
    }
    return "";
  });

  const setSearch = (val: string) => {
    setSearchState(val);
    try {
      if (val) {
        localStorage.setItem("bobbinloom_library_search", val);
      } else {
        localStorage.removeItem("bobbinloom_library_search");
      }
    } catch { /* silent */ }
  };

  const [tagFilterSearch, setTagFilterSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_library_view_mode");
      if (saved === "portrait" || saved === "list" || saved === "grid") return saved;
    }
    return "portrait";
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem("bobbinloom_library_view_mode", mode);
    } catch { /* silent */ }
  };

  const [sortBy, setSortByState] = useState<CharacterSortOption>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_library_sort_by");
      if (saved === "name" || saved === "createdAt" || saved === "updatedAt") return saved;
    }
    return "name";
  });

  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_library_sort_dir");
      if (saved === "asc" || saved === "desc") return saved;
    }
    return "asc";
  });

  const setSortBy = (option: CharacterSortOption) => {
    setSortByState(option);
    let nextDir: SortDirection = "asc";
    if (option === "createdAt" || option === "updatedAt") {
      nextDir = "desc";
    } else {
      nextDir = "asc";
    }
    setSortDirectionState(nextDir);
    try {
      localStorage.setItem("bobbinloom_library_sort_by", option);
      localStorage.setItem("bobbinloom_library_sort_dir", nextDir);
    } catch { /* silent */ }
    setCurrentPage(1);
  };

  const toggleSortDirection = () => {
    const nextDir: SortDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirectionState(nextDir);
    try {
      localStorage.setItem("bobbinloom_library_sort_dir", nextDir);
    } catch { /* silent */ }
    setCurrentPage(1);
  };
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_library_page_size");
      if (saved) {
        const parsed = Number(saved);
        if (!isNaN(parsed) && [12, 24, 48, 96, 1000].includes(parsed)) {
          return parsed;
        }
      }
    }
    return 12;
  });

  const setPageSize = (size: number) => {
    setPageSizeState(size);
    try {
      localStorage.setItem("bobbinloom_library_page_size", String(size));
    } catch { /* silent */ }
  };

  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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
  } | null>(null);

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
  const [taxonomyConfig, setTaxonomyConfig] = useState<TagTaxonomyConfig | null>(null);
  const [taxonomyModalOpen, setTaxonomyModalOpen] = useState(false);
  const [sidebarViewMode, setSidebarViewModeState] = useState<"grouped" | "flat">(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_library_sidebar_view_mode");
      if (saved === "grouped" || saved === "flat") return saved;
    }
    return "grouped";
  });

  const setSidebarViewMode = (mode: "grouped" | "flat") => {
    setSidebarViewModeState(mode);
    try {
      localStorage.setItem("bobbinloom_library_sidebar_view_mode", mode);
    } catch { /* silent */ }
  };

  const [collapsedCategories, setCollapsedCategories] = useState<Set<string>>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      try {
        const saved = localStorage.getItem("bobbinloom_library_collapsed_categories");
        if (saved) {
          const parsed = JSON.parse(saved);
          if (Array.isArray(parsed)) return new Set(parsed);
        }
      } catch { /* silent */ }
    }
    return new Set();
  });
  const [mobileSidebarExpanded, setMobileSidebarExpanded] = useState(false);

  // ── AI Brainstorming State ──
  const [aiBrainstormOpen, setAiBrainstormOpen] = useState(false);
  const [aiMessages, setAiMessages] = useState<BrainstormChatMessage[]>([]);
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState<string | null>(null);
  const [includeOriginalCcv2, setIncludeOriginalCcv2] = useState(false);
  const aiAbortControllerRef = useRef<AbortController | null>(null);

  // ── Deletion Confirmation Modal State ──
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);

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

  const hasUnsavedSession = isFormDirty || aiMessages.length > 0;

  const convertingCharacter = useMemo(() => {
    if (!convertingId) return null;
    return templates.find((t) => t.id === convertingId) ?? null;
  }, [templates, convertingId]);

  async function loadData() {
    try {
      const [chars, taxRes] = await Promise.all([
        listCharacters(),
        getTagTaxonomy().catch(() => ({ tagTaxonomy: { customCategories: [], tagOverrides: {} } })),
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

  // Close dropdown menu when clicking outside
  useEffect(() => {
    if (!openMenuId) return;
    function handleDocClick(e: MouseEvent) {
      const target = e.target as HTMLElement;
      if (!target.closest(".card-more-menu-container")) {
        setOpenMenuId(null);
      }
    }
    document.addEventListener("mousedown", handleDocClick);
    return () => document.removeEventListener("mousedown", handleDocClick);
  }, [openMenuId]);

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
    setShowDiscardConfirm(false);
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
    setShowDiscardConfirm(false);
  }

  function closeEditor() {
    handleCancelTagSuggest();
    handleCancelBrainstorm();
    setEditorOpen(false);
    setEditingId(null);
    setEditingIsCcv2(false);
    setViewTab("bl");
    setStatus(null);
    setShowDiscardConfirm(false);
    setAiBrainstormOpen(false);
    setAiMessages([]);
    setAiError(null);
    setIncludeOriginalCcv2(false);
  }

  function handleCancelClick() {
    if (hasUnsavedSession) {
      setShowDiscardConfirm(true);
    } else {
      closeEditor();
    }
  }

  function handleConfirmDiscard() {
    setShowDiscardConfirm(false);
    closeEditor();
  }

  async function handleSendBrainstormMessage(userText: string) {
    if (aiAbortControllerRef.current) {
      aiAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    aiAbortControllerRef.current = controller;

    const userMsg: BrainstormChatMessage = {
      id: `user-${Date.now()}`,
      role: "user",
      content: userText,
    };

    const nextHistory = [...aiMessages, userMsg];
    setAiMessages(nextHistory);
    setAiLoading(true);
    setAiError(null);

    try {
      const activeTpl = editingId ? templates.find((t) => t.id === editingId) : undefined;
      const res = await brainstormCharacter(
        {
          character: {
            name: form.name,
            content: form.content,
            creatorNotes: form.creatorNotes,
            tags: form.tags,
            ccv2Content: activeTpl?.ccv2Content,
          },
          chatHistory: aiMessages.map((m) => ({
            role: m.role,
            content: m.content,
          })),
          userMessage: userText,
          includeOriginalCard: includeOriginalCcv2,
        },
        { signal: controller.signal }
      );

      const assistantMsg: BrainstormChatMessage = {
        id: `assistant-${Date.now()}`,
        role: "assistant",
        content: res.reply,
        proposedChanges: res.proposedChanges,
        appliedChanges: {},
      };

      setAiMessages([...nextHistory, assistantMsg]);
    } catch (e) {
      if (
        (e instanceof Error && (e.name === "AbortError" || e.message.includes("abort") || e.message.includes("cancelled"))) ||
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

  function handleApplySection(section: ProposedSectionChange, messageId: string) {
    const updatedContent = applySectionChanges(form.content, [section]);
    setForm((f) => ({ ...f, content: updatedContent }));

    setAiMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              appliedChanges: {
                ...msg.appliedChanges,
                [`section:${section.header.toLowerCase()}`]: true,
              },
            }
          : msg
      )
    );
  }

  function handleApplyAllProposed(
    proposed: CharacterBrainstormResult["proposedChanges"],
    messageId: string
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
        ...(proposed.creatorNotes ? { creatorNotes: proposed.creatorNotes } : {}),
        ...(proposed.name ? { name: proposed.name } : {}),
      };
    });

    setAiMessages((prev) =>
      prev.map((msg) =>
        msg.id === messageId
          ? {
              ...msg,
              appliedChanges: {
                ...msg.appliedChanges,
                all: true,
                ...(proposed.sections
                  ? Object.fromEntries(
                      proposed.sections.map((s) => [`section:${s.header.toLowerCase()}`, true])
                    )
                  : {}),
              },
            }
          : msg
      )
    );
  }

  function handleClearBrainstormChat() {
    setAiMessages([]);
    setAiError(null);
  }

  async function handleOpenAiTagSuggestions(guidance?: unknown) {
    if (tagSuggestAbortControllerRef.current) {
      tagSuggestAbortControllerRef.current.abort();
    }
    const controller = new AbortController();
    tagSuggestAbortControllerRef.current = controller;

    const cleanGuidance = typeof guidance === "string" ? guidance.trim() || undefined : undefined;
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
        { signal: controller.signal }
      );
      setSuggestedTags(res.tags);
    } catch (e) {
      if (
        (e instanceof Error && (e.name === "AbortError" || e.message.includes("abort") || e.message.includes("cancelled"))) ||
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
        await updateCharacter(editingId, editingIsCcv2 ? { name: update.name } : update);
        setStatus(`"${form.name}" saved successfully.`);
      } else {
        const created = await createCharacter(form.name);
        await updateCharacter(created.id, {
          content: form.content,
          creatorNotes: form.creatorNotes,
          tags: canonicalTags,
        });
        setEditingId(created.id);
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
        reader.onerror = () => reject(reader.error ?? new Error("Could not read file."));
        reader.readAsDataURL(file);
      });
      const base64 = dataUrl.slice(dataUrl.indexOf(",") + 1); // strip data: prefix
      const result = await importCharacter(file.name, base64);
      // Check for already-converted notice
      if ("notice" in result && (result as Record<string, unknown>).notice === "already_converted") {
        const existing = (result as Record<string, unknown>).existingRecord as CharacterTemplate;
        setImportNotice({
          message: "This character already exists with its original content, importing will make no change.",
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
    const controller = new AbortController();
    abortControllerRef.current = controller;
    try {
      const result = await convertCharacterGenerate(template.id, { signal: controller.signal });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: template.id,
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || e.message.includes("aborted") || e.message.includes("cancelled"))) {
        setStatus("Conversion cancelled.");
        setConvertingId(null);
      } else {
        setConvertError(e instanceof Error ? e.message : String(e));
      }
    } finally {
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
        signal: controller.signal,
      });
      setDiffData({
        oldContent: result.originalContent,
        newContent: result.content,
        recordId: diffData.recordId,
      });
    } catch (e) {
      if (e instanceof Error && (e.name === "AbortError" || e.message.includes("aborted") || e.message.includes("cancelled"))) {
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
      const applyResult = await convertCharacterApply(diffData.recordId, diffData.newContent);
      const convertedRecordId = diffData.recordId;
      setDiffData(null);
      setConvertingId(null);
      const refreshed = await listCharacters();
      setTemplates(refreshed);

      const targetTpl = refreshed.find(t => t.id === convertedRecordId) ?? applyResult.record;
      setConvertedSuccess({
        recordId: convertedRecordId,
        recordName: displayTitle(targetTpl),
        template: targetTpl,
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

  // Tag filter sidebar search
  const filteredTagCounts = useMemo(() => {
    if (!tagFilterSearch.trim()) return allTagCounts;
    const q = tagFilterSearch.trim().toLowerCase();
    return allTagCounts.filter(item => item.tag.includes(q));
  }, [allTagCounts, tagFilterSearch]);

  const groupedTagCategories = useMemo(() => {
    return groupTagsByCategory(filteredTagCounts, taxonomyConfig);
  }, [filteredTagCounts, taxonomyConfig]);

  function toggleCategoryCollapse(categoryId: string) {
    setCollapsedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(categoryId)) next.delete(categoryId);
      else next.add(categoryId);
      try {
        localStorage.setItem("bobbinloom_library_collapsed_categories", JSON.stringify([...next]));
      } catch { /* silent */ }
      return next;
    });
  }

  const activeFilterTags = useMemo(() => {
    return search
      .split(/\s+/)
      .map(t => t.trim().toLowerCase())
      .filter(t => t.startsWith("tag:") && t.length > 4)
      .map(t => t.slice(4));
  }, [search]);

  function isTagActive(tag: string): boolean {
    const raw = tag.toLowerCase();
    const norm = raw.replace(/\s+/g, "_");
    return activeFilterTags.some(t => t === norm || t === raw || t.replace(/_/g, " ") === raw);
  }

  function toggleTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = search.split(/\s+/).filter(Boolean);
    const existingIdx = tokens.findIndex(t => {
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
    setCurrentPage(1);
  }

  function removeFilterTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = search.split(/\s+/).filter(Boolean);
    const next = tokens.filter(t => {
      const low = t.toLowerCase();
      return low !== tagToken && low !== `tag:${tag.toLowerCase()}`;
    });
    setSearch(next.join(" "));
    setCurrentPage(1);
  }

  // ── Filtering and Pagination ──
  const filteredTemplates = useMemo(() => filterLibraryEntries(templates, search), [templates, search]);
  const groups = useMemo(() => groupByLineage(filteredTemplates, sortBy, sortDirection), [filteredTemplates, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(groups.length / pageSize));
  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(1);
    }
  }, [totalPages, currentPage]);

  const paginatedGroups = useMemo(() => {
    if (pageSize >= 1000) return groups;
    const start = (currentPage - 1) * pageSize;
    return groups.slice(start, start + pageSize);
  }, [groups, currentPage, pageSize]);

  return (
    <div className={`character-library-container ${isModal ? "is-modal" : "is-workspace"}`}>
      {isModal ? (
        <div className="global-scope-badge" title="Edits modify global templates used for new playthroughs">
          🌐 Global Character Templates
        </div>
      ) : null}

      <div className="character-manager-body">
        {convertLoading && convertingCharacter ? (
          <div className="conversion-active-banner">
            <div className="conversion-banner-content">
              <span className="conversion-banner-spinner">
                <Icon name="Sparkles" size={17} className="sparkle-pulse" />
              </span>
              <span className="conversion-banner-text">
                Converting <strong>&quot;{displayTitle(convertingCharacter)}&quot;</strong> to BobbinLoom format with AI…
              </span>
            </div>
            <button
              type="button"
              className="conversion-cancel-btn"
              onClick={handleCancelConvert}
              title="Cancel ongoing conversion"
            >
              <Icon name="X" size={14} /> Cancel
            </button>
          </div>
        ) : null}

        {importing ? (
          <div className="conversion-active-banner import-active-banner">
            <div className="conversion-banner-content">
              <span className="conversion-banner-spinner">
                <Icon name="Upload" size={17} className="sparkle-pulse" />
              </span>
              <span className="conversion-banner-text">
                Importing character card…
              </span>
            </div>
          </div>
        ) : null}

        {convertedSuccess ? (
          <div className="conversion-success-banner">
            <div className="conversion-success-content">
              <span className="conversion-success-icon">
                <Icon name="CheckCircle2" size={18} />
              </span>
              <span className="conversion-success-text">
                Successfully converted and saved <strong>&quot;{convertedSuccess.recordName}&quot;</strong> to BobbinLoom format!
              </span>
              <button
                type="button"
                className="conversion-view-edit-link"
                onClick={() => {
                  openEdit(convertedSuccess.template);
                  setConvertedSuccess(null);
                }}
              >
                Open in Editor <Icon name="ArrowRight" size={13} />
              </button>
            </div>
            <button
              type="button"
              className="conversion-success-dismiss"
              onClick={() => setConvertedSuccess(null)}
              title="Dismiss notification"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        ) : null}

        {importSuccess ? (
          <div className="conversion-success-banner import-success-banner">
            <div className="conversion-success-content">
              <span className="conversion-success-icon">
                <Icon name="CheckCircle2" size={18} />
              </span>
              <span className="conversion-success-text">
                Successfully imported <strong>&quot;{importSuccess.recordName}&quot;</strong> into the library!
              </span>
              <button
                type="button"
                className="conversion-view-edit-link"
                onClick={() => {
                  openEdit(importSuccess.template);
                  setImportSuccess(null);
                }}
              >
                Open in Editor <Icon name="ArrowRight" size={13} />
              </button>
            </div>
            <button
              type="button"
              className="conversion-success-dismiss"
              onClick={() => setImportSuccess(null)}
              title="Dismiss notification"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        ) : null}

        {deleteSuccess ? (
          <div className="conversion-success-banner delete-success-banner">
            <div className="conversion-success-content">
              <span className="conversion-success-icon delete-icon">
                <Icon name="Trash2" size={18} />
              </span>
              <span className="conversion-success-text">
                Character card <strong>&quot;{deleteSuccess.recordName}&quot;</strong> was deleted from the library.
              </span>
            </div>
            <button
              type="button"
              className="conversion-success-dismiss"
              onClick={() => setDeleteSuccess(null)}
              title="Dismiss notification"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        ) : null}

        {libraryError ? (
          <div className="conversion-success-banner library-error-banner">
            <div className="conversion-success-content">
              <span className="conversion-success-icon error-icon">
                <Icon name="AlertTriangle" size={18} />
              </span>
              <span className="conversion-success-text error-text">
                {libraryError}
              </span>
            </div>
            <button
              type="button"
              className="conversion-success-dismiss"
              onClick={() => setLibraryError(null)}
              title="Dismiss notification"
            >
              <Icon name="X" size={14} />
            </button>
          </div>
        ) : null}

        {editorOpen ? (
          <div className={`character-editor-inline ${aiBrainstormOpen ? "split-layout" : ""}`}>
            <div className="editor-top-bar">
              <div className="editor-title-wrap">
                <h3>{editingId ? `Edit: ${form.name}` : "New Character"}</h3>
                {status ? <span className="editor-status-toast">{status}</span> : null}
              </div>

              <div className="editor-header-actions">
                {!editingIsCcv2 ? (
                  <button
                    type="button"
                    className={`ai-brainstorm-toggle-btn ${aiBrainstormOpen ? "active" : ""}`}
                    onClick={() => setAiBrainstormOpen(!aiBrainstormOpen)}
                    title={aiBrainstormOpen ? "Hide AI Assistant" : "Open AI Brainstorm Assistant"}
                  >
                    <Icon name="Sparkles" size={14} className={aiLoading ? "sparkle-pulse" : ""} />
                    <span>AI Assistant</span>
                    {aiMessages.length > 0 && (
                      <span className="ai-msg-count-badge">{aiMessages.length}</span>
                    )}
                  </button>
                ) : null}

                {editingIsCcv2 ? (
                  <button
                    className="convert-btn"
                    onClick={() => {
                      const tpl = templates.find(t => t.id === editingId);
                      if (tpl) handleConvert(tpl);
                    }}
                    disabled={convertLoading}
                  >
                    {convertLoading ? "Converting…" : "Convert to BL Format"}
                  </button>
                ) : null}
              </div>
            </div>

            <div className="editor-split-container">
              <div className="editor-main-pane">
                <CharacterVisualsDrawer
                  template={editingId ? templates.find((t) => t.id === editingId) : null}
                  characterName={form.name}
                  onUploadPortrait={async (dataBase64, fileName) => {
                    if (!editingId) return;
                    const res = await uploadCharacterAvatar(editingId, "portrait", dataBase64, fileName);
                    setTemplates((prev) => prev.map((t) => (t.id === editingId ? res.record : t)));
                  }}
                  onUploadProfile={async (dataBase64, fileName) => {
                    if (!editingId) return;
                    const res = await uploadCharacterAvatar(editingId, "profile", dataBase64, fileName);
                    setTemplates((prev) => prev.map((t) => (t.id === editingId ? res.record : t)));
                  }}
                  onRestoreOriginalPortrait={async () => {
                    if (!editingId) return;
                    const res = await restoreOriginalCharacterAvatar(editingId);
                    setTemplates((prev) => prev.map((t) => (t.id === editingId ? res.record : t)));
                  }}
                  onDeleteProfile={async () => {
                    if (!editingId) return;
                    const res = await deleteCharacterProfileAvatar(editingId);
                    setTemplates((prev) => prev.map((t) => (t.id === editingId ? res.record : t)));
                  }}
                  disabled={saving}
                />

                <label className="editor-field">
                  <span className="editor-field-label">Name</span>
                  <input value={form.name} onChange={e => setForm(f => ({ ...f, name: e.target.value }))} />
                </label>

                {(() => {
                  const tpl = editingId ? templates.find(t => t.id === editingId) : undefined;
                  const isConverted = editingId !== null && !!tpl?.ccv2Content && !editingIsCcv2;
                  const originalCreatorNotes = tpl?.ccv2CreatorNotes ?? tpl?.creatorNotes ?? "";
                  const originalTags = tpl?.ccv2Tags ?? (tpl?.format === "ccv2" ? (tpl.tags ?? []) : []) ?? [];

                  if (!isConverted) {
                    // Unconverted CCv2 (read-only) or native BL (editable) — single view.
                    return (
                      <>
                        <label className="editor-field">
                          <span className="editor-field-label">
                            Creator's Notes
                            {editingIsCcv2 ? <span className="ccv2-readonly-badge">Read-only CCv2 sheet</span> : null}
                          </span>
                          <textarea
                            rows={3}
                            value={form.creatorNotes}
                            onChange={e => setForm(f => ({ ...f, creatorNotes: e.target.value }))}
                            placeholder="Optional notes from the creator (e.g. usage guidelines, character background, tags)..."
                            className="creator-notes-textarea"
                            disabled={editingIsCcv2}
                          />
                        </label>

                        <TagChipEditor
                          tags={form.tags}
                          onChange={tags => setForm(f => ({ ...f, tags }))}
                          allLibraryTags={allTagCounts.map(t => t.tag)}
                          disabled={editingIsCcv2}
                          onSuggestAI={!editingIsCcv2 ? () => void handleOpenAiTagSuggestions() : undefined}
                          suggestingAI={tagSuggestLoading}
                          taxonomyConfig={taxonomyConfig}
                        />

                        <label className="editor-field">
                          <span className="editor-field-label">
                            Content (full character sheet)
                            {editingIsCcv2 ? <span className="ccv2-readonly-badge">Read-only CCv2 sheet</span> : null}
                          </span>
                          <textarea rows={20} value={form.content}
                            onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                            placeholder={CHARACTER_SHEET_EXAMPLE}
                            className="content-textarea"
                            disabled={editingIsCcv2} />
                        </label>
                      </>
                    );
                  }

                  // Converted → tabs: BL Format (editable) / Original (read-only) / Both (live).
                  return (
                    <div className="editor-tabs-wrap">
                      <div className="editor-tabs" role="tablist">
                        <button className={viewTab === "bl" ? "active" : ""} onClick={() => setViewTab("bl")} role="tab">BL Format</button>
                        <button className={viewTab === "original" ? "active" : ""} onClick={() => setViewTab("original")} role="tab">Original</button>
                        <button className={viewTab === "both" ? "active" : ""} onClick={() => setViewTab("both")} role="tab">Both</button>
                      </div>
                      {viewTab === "bl" ? (
                        <>
                          <label className="editor-field">
                            <span className="editor-field-label">Creator's Notes (BL format — editable)</span>
                            <textarea
                              rows={3}
                              value={form.creatorNotes}
                              onChange={e => setForm(f => ({ ...f, creatorNotes: e.target.value }))}
                              placeholder="Optional notes from the creator (e.g. usage guidelines, character background, tags)..."
                              className="creator-notes-textarea"
                            />
                          </label>

                          <TagChipEditor
                            tags={form.tags}
                            onChange={tags => setForm(f => ({ ...f, tags }))}
                            allLibraryTags={allTagCounts.map(t => t.tag)}
                            onSuggestAI={() => void handleOpenAiTagSuggestions()}
                            suggestingAI={tagSuggestLoading}
                            taxonomyConfig={taxonomyConfig}
                          />

                          <label className="editor-field">
                            <span className="editor-field-label">Content (BL format — editable)</span>
                            <textarea rows={20} value={form.content}
                              onChange={e => setForm(f => ({ ...f, content: e.target.value }))}
                              className="content-textarea" />
                          </label>
                        </>
                      ) : viewTab === "original" ? (
                        <>
                          <div className="editor-field read-only">
                            <span className="editor-field-label">Original Creator's Notes</span>
                            <pre className="content-view notes-view">{originalCreatorNotes || "(no original creator notes)"}</pre>
                          </div>

                          <div className="editor-field read-only">
                            <div className="editor-field-header-row">
                              <span className="editor-field-label">Original CCv2 Tags</span>
                              {originalTags.length > 0 ? (
                                <button
                                  type="button"
                                  className="restore-tags-btn"
                                  onClick={() => setForm(f => ({ ...f, tags: [...originalTags] }))}
                                  title="Restore original CCv2 tags to current character sheet"
                                >
                                  <Icon name="RotateCcw" size={13} /> Restore Original Tags
                                </button>
                              ) : null}
                            </div>
                            <div className="read-only-tags-wrap">
                              {originalTags.length > 0 ? (
                                originalTags.map(tag => (
                                  <TagChip key={tag} tag={tag} userConfig={taxonomyConfig} size="sm" />
                                ))
                              ) : (
                                <span className="empty-tags-hint">(no original tags)</span>
                              )}
                            </div>
                          </div>

                          <div className="editor-field read-only">
                            <span className="editor-field-label">Original CCv2 Content</span>
                            <pre className="content-view">{tpl!.ccv2Content!}</pre>
                          </div>
                        </>
                      ) : (
                        <>
                          <div className="editor-field">
                            <span className="editor-field-label">Creator's Notes</span>
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
                            onRestore={() => setForm(f => ({ ...f, tags: [...originalTags] }))}
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

                <div className="modal-actions editor-footer-actions">
                  {editingId ? (
                    <button
                      type="button"
                      className="danger editor-delete-btn"
                      onClick={() => {
                        const targetTpl = templates.find((t) => t.id === editingId);
                        const targetName = targetTpl ? displayTitle(targetTpl) : form.name;
                        requestDelete(editingId, targetName);
                      }}
                      disabled={saving}
                      title="Delete this character card from the library"
                    >
                      <Icon name="Trash2" size={14} /> Delete
                    </button>
                  ) : <div />}
                  <div className="editor-footer-right-actions">
                    <button
                      type="button"
                      className="secondary-btn"
                      onClick={handleCancelClick}
                      disabled={saving}
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      className="primary-btn editor-save-btn"
                      onClick={handleSave}
                      disabled={saving || !form.name.trim() || !isFormDirty}
                      title={!isFormDirty ? "No changes to save" : "Save character card"}
                    >
                      <Icon name="Check" size={14} />
                      {saving ? "Saving…" : "Save"}
                    </button>
                  </div>
                </div>
              </div>

              {aiBrainstormOpen && (
                <div className="editor-ai-pane">
                  <CharacterBrainstormPanel
                    characterName={form.name}
                    hasOriginalCcv2={!!templates.find(t => t.id === editingId)?.ccv2Content}
                    includeOriginalCcv2={includeOriginalCcv2}
                    onToggleIncludeOriginalCcv2={setIncludeOriginalCcv2}
                    messages={aiMessages}
                    onSendMessage={handleSendBrainstormMessage}
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
            {/* ── Left-side Booru Tag Sidebar ── */}
            <aside className={`character-tag-sidebar ${mobileSidebarExpanded ? "mobile-expanded" : "mobile-collapsed"}`}>
              <div
                className="sidebar-header"
                onClick={() => setMobileSidebarExpanded(!mobileSidebarExpanded)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    setMobileSidebarExpanded(!mobileSidebarExpanded);
                  }
                }}
              >
                <h4>
                  <Icon name="Tag" size={15} /> Tags
                  <span className="sidebar-total-count">({allTagCounts.length})</span>
                  {activeFilterTags.length > 0 && (
                    <span className="sidebar-active-filter-badge" title={`${activeFilterTags.length} active tag filter(s)`}>
                      {activeFilterTags.length} active
                    </span>
                  )}
                </h4>
                <div className="sidebar-header-actions" onClick={(e) => e.stopPropagation()}>
                  <button
                    type="button"
                    className={`sidebar-mode-btn ${sidebarViewMode === "grouped" ? "active" : ""}`}
                    onClick={() => setSidebarViewMode(sidebarViewMode === "grouped" ? "flat" : "grouped")}
                    title={sidebarViewMode === "grouped" ? "Switch to flat tag list" : "Switch to category grouped tags"}
                  >
                    <Icon name={sidebarViewMode === "grouped" ? "Layers" : "List"} size={13} />
                  </button>
                  <button
                    type="button"
                    className="sidebar-settings-btn"
                    onClick={() => setTaxonomyModalOpen(true)}
                    title="Configure Tag Taxonomy & Colors"
                  >
                    <Icon name="Sliders" size={13} />
                  </button>
                  {search.trim() ? (
                    <button
                      type="button"
                      className="sidebar-clear-btn"
                      onClick={() => {
                        setSearch("");
                        setCurrentPage(1);
                      }}
                      title="Clear search and tag filters"
                    >
                      Clear
                    </button>
                  ) : null}
                  <button
                    type="button"
                    className="sidebar-mobile-toggle-btn"
                    onClick={() => setMobileSidebarExpanded(!mobileSidebarExpanded)}
                    aria-label={mobileSidebarExpanded ? "Collapse tag filters" : "Expand tag filters"}
                    title={mobileSidebarExpanded ? "Collapse tag filters" : "Expand tag filters"}
                  >
                    <span className="sidebar-toggle-text">{mobileSidebarExpanded ? "Hide" : "Filter"}</span>
                    <Icon name={mobileSidebarExpanded ? "ChevronUp" : "ChevronDown"} size={13} />
                  </button>
                </div>
              </div>

              <div className="sidebar-collapsible-body">
                {allTagCounts.length > 6 ? (
                  <div className="sidebar-tag-search-wrap">
                    <input
                      type="text"
                      placeholder="Filter tags…"
                      value={tagFilterSearch}
                      onChange={(e) => setTagFilterSearch(e.target.value)}
                      className="sidebar-tag-search-input"
                    />
                    {tagFilterSearch ? (
                      <button
                        type="button"
                        className="sidebar-tag-clear"
                        onClick={() => setTagFilterSearch("")}
                      >
                        ✕
                      </button>
                    ) : null}
                  </div>
                ) : null}

                {/* Active filter tags quick bar on mobile / narrow space */}
                {activeFilterTags.length > 0 && (
                  <div className="sidebar-active-tags-row">
                    <span className="sidebar-active-tags-label">Active:</span>
                    <div className="sidebar-active-tags-list">
                      {activeFilterTags.map((tag) => (
                        <button
                          key={tag}
                          type="button"
                          className="sidebar-active-tag-chip"
                          onClick={() => removeFilterTag(tag)}
                          title={`Remove filter "${tag}"`}
                        >
                          <span>{tag}</span>
                          <Icon name="X" size={10} />
                        </button>
                      ))}
                    </div>
                  </div>
                )}

                <div className="sidebar-tag-list">
                  {filteredTagCounts.length === 0 ? (
                    <p className="sidebar-empty-tags">
                      {tagFilterSearch ? "No matching tags." : "No tags yet."}
                    </p>
                  ) : sidebarViewMode === "grouped" ? (
                    groupedTagCategories.map((group) => {
                      const isCollapsed = collapsedCategories.has(group.id);
                      return (
                        <div key={group.id} className="sidebar-category-group">
                          <button
                            type="button"
                            className="sidebar-category-header"
                            onClick={() => toggleCategoryCollapse(group.id)}
                          >
                            <div className="sidebar-cat-title-wrap">
                              <span
                                className="sidebar-cat-dot"
                                style={{ backgroundColor: group.color }}
                              />
                              <span className="sidebar-cat-label">{group.label}</span>
                            </div>
                            <div className="sidebar-cat-right">
                              <span className="sidebar-cat-count">{group.tags.length}</span>
                              <Icon
                                name={isCollapsed ? "ChevronRight" : "ChevronDown"}
                                size={12}
                                className="sidebar-cat-chevron"
                              />
                            </div>
                          </button>
                          {!isCollapsed && (
                            <div className="sidebar-category-items">
                              {group.tags.map(({ tag, count, style }) => {
                                const active = isTagActive(tag);
                                return (
                                  <button
                                    key={tag}
                                    type="button"
                                    className={`sidebar-tag-item ${active ? "active" : ""}`}
                                    onClick={() => toggleTag(tag)}
                                    title={active ? `Remove tag "${tag}"` : `Filter by tag "${tag}"`}
                                    style={{
                                      borderLeftColor: active ? style.colors.text : "transparent",
                                    }}
                                  >
                                    <span className="sidebar-tag-name">
                                      {style.namespace ? (
                                        <span className="sidebar-tag-prefix" style={{ color: style.colors.text, opacity: 0.8 }}>
                                          {style.namespace}:
                                        </span>
                                      ) : null}
                                      <span style={{ color: active ? style.colors.text : undefined }}>{style.value}</span>
                                    </span>
                                    <span
                                      className="sidebar-tag-count"
                                      style={{ borderColor: active ? style.colors.text : undefined }}
                                    >
                                      {count}
                                    </span>
                                  </button>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      );
                    })
                  ) : (
                    filteredTagCounts.map(({ tag, count }) => {
                      const active = isTagActive(tag);
                      return (
                        <button
                          key={tag}
                          type="button"
                          className={`sidebar-tag-item ${active ? "active" : ""}`}
                          onClick={() => toggleTag(tag)}
                          title={active ? `Remove tag "${tag}"` : `Filter by tag "${tag}"`}
                        >
                          <span className="sidebar-tag-name">{tag}</span>
                          <span className="sidebar-tag-count">{count}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            </aside>

            {/* ── Main Gallery Area ── */}
            <main className="character-main-gallery">
              {/* Top Toolbar */}
              <div className="library-toolbar">
                <div className="library-toolbar-actions">
                  <button className="primary-btn" onClick={openCreate}>
                    <Icon name="Plus" size={15} /> New Character
                  </button>
                  <button className="import-btn" onClick={() => fileInputRef.current?.click()} disabled={importing}>
                    <Icon name="Upload" size={15} /> {importing ? "Importing…" : "Import Card"}
                  </button>
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
                    setCurrentPage(1);
                  }}
                  onClear={() => setCurrentPage(1)}
                  placeholder="Search name, tags, creator:…"
                  size="md"
                  containerClassName="library-search-wrapper"
                />

                {/* Sort Controls */}
                <div className="library-sort-control-group" role="group" aria-label="Sort library">
                  <div className="library-sort-select-wrapper">
                    <Icon name="ArrowUpDown" size={13} className="library-sort-icon" />
                    <select
                      className="library-sort-select"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as CharacterSortOption)}
                      aria-label="Sort characters by"
                    >
                      <option value="name">Name</option>
                      <option value="createdAt">Created Date</option>
                      <option value="updatedAt">Updated Date</option>
                    </select>
                  </div>
                  <button
                    type="button"
                    className="library-sort-dir-btn"
                    onClick={toggleSortDirection}
                    title={
                      sortBy === "name"
                        ? (sortDirection === "asc" ? "Sort A to Z (click for Z to A)" : "Sort Z to A (click for A to Z)")
                        : (sortDirection === "desc" ? "Newest first (click for Oldest first)" : "Oldest first (click for Newest first)")
                    }
                    aria-label="Toggle sort order"
                  >
                    <Icon
                      name={sortDirection === "asc" ? "ArrowUpNarrowWide" : "ArrowDownWideNarrow"}
                      size={14}
                    />
                    <span className="sort-dir-label">
                      {sortBy === "name"
                        ? (sortDirection === "asc" ? "A-Z" : "Z-A")
                        : (sortDirection === "desc" ? "Newest" : "Oldest")}
                    </span>
                  </button>
                </div>

                {/* View Mode Switcher */}
                <div className="view-mode-switcher" role="group" aria-label="View mode">
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "portrait" ? "active" : ""}`}
                    onClick={() => setViewMode("portrait")}
                    title="Card Portrait View"
                  >
                    <Icon name="IdCard" size={16} />
                    <span className="view-mode-label">Portrait</span>
                  </button>
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
                    onClick={() => setViewMode("list")}
                    title="List View"
                  >
                    <Icon name="List" size={16} />
                    <span className="view-mode-label">List</span>
                  </button>
                  <button
                    type="button"
                    className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
                    onClick={() => setViewMode("grid")}
                    title="Grid View"
                  >
                    <Icon name="LayoutGrid" size={16} />
                    <span className="view-mode-label">Grid</span>
                  </button>
                </div>
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
                  <button
                    type="button"
                    className="clear-all-filters-btn"
                    onClick={() => {
                      setSearch("");
                      setCurrentPage(1);
                    }}
                  >
                    Clear all
                  </button>
                </div>
              ) : null}

              {/* Results Gallery according to ViewMode */}
              {groups.length === 0 ? (
                <div className="empty-library-container">
                  <p className="empty-value">
                    {search ? "No characters found matching your search." : "No characters in the library yet."}
                  </p>
                  {search ? (
                    <button
                      type="button"
                      className="secondary-btn"
                      style={{ marginTop: "8px" }}
                      onClick={() => {
                        setSearch("");
                        setCurrentPage(1);
                      }}
                    >
                      Reset filters
                    </button>
                  ) : null}
                </div>
              ) : (
                <>
                  {/* 1. Card Portrait View */}
                  {viewMode === "portrait" && (
                    <div className="character-portrait-grid">
                      {paginatedGroups.map((group) => {
                        const latest = group.versions[0];
                        const badge = cardBadgeLabel(latest);
                        const isConverting = convertingId === latest.id && convertLoading;
                        return (
                          <div
                            key={group.key}
                            className={`card-portrait ${openMenuId === latest.id ? "menu-open" : ""} ${isConverting ? "is-converting" : ""}`}
                            onClick={() => openEdit(latest)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") openEdit(latest);
                            }}
                          >
                            <div className="card-portrait-image-wrap">
                              <CharacterAvatar template={latest} variant="portrait" />
                            </div>

                            <div className="card-portrait-body">
                              <div className="card-portrait-title-row">
                                <strong className="card-portrait-title" title={displayTitle(latest)}>
                                  {displayTitle(latest)}
                                </strong>
                                {group.versions.length > 1 ? (
                                  <span className="version-count">({group.versions.length} v)</span>
                                ) : null}
                              </div>

                              {latest.creator?.trim() ? (
                                <span className="card-creator-tag">by {latest.creator.trim()}</span>
                              ) : null}

                              {latest.creatorNotes?.trim() ? (
                                <p className="card-creator-notes-snippet">
                                  {latest.creatorNotes.trim()}
                                </p>
                              ) : null}

                              {(latest.tags ?? []).length > 0 ? (
                                <div className="tag-chips" onClick={(e) => e.stopPropagation()}>
                                  {sortTags(latest.tags ?? [], taxonomyConfig).map((tag) => {
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
                                  {badge === "ccv2" ? <span className="ccv2-badge">CCv2</span> : null}
                                  {badge === "ccv2bl" ? <span className="ccv2bl-badge">CCv2 / BL</span> : null}
                                  <span className="version-badge">v{latest.cardVersion ?? String(latest.version)}</span>
                                  {sortBy === "createdAt" && getGroupCreatedAt(group) ? (
                                    <span className="card-timestamp-badge" title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}>
                                      <Icon name="Calendar" size={10} /> {formatLibraryDate(getGroupCreatedAt(group))}
                                    </span>
                                  ) : null}
                                  {sortBy === "updatedAt" && getGroupUpdatedAt(group) ? (
                                    <span className="card-timestamp-badge" title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}>
                                      <Icon name="Clock" size={10} /> {formatLibraryDate(getGroupUpdatedAt(group))}
                                    </span>
                                  ) : null}
                                </div>
                                <MoreOptionsMenu
                                  template={latest}
                                  isOpen={openMenuId === latest.id}
                                  onToggle={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === latest.id ? null : latest.id);
                                  }}
                                  onEdit={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(null);
                                    openEdit(latest);
                                  }}
                                  onConvert={
                                    entryKind(latest) === "ccv2"
                                      ? (e) => {
                                          e.stopPropagation();
                                          setOpenMenuId(null);
                                          handleConvert(latest);
                                        }
                                      : undefined
                                  }
                                  onDelete={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(null);
                                    requestDelete(latest.id, displayTitle(latest));
                                  }}
                                  converting={isConverting}
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
                        const isConverting = convertingId === latest.id && convertLoading;
                        return (
                          <div
                            key={group.key}
                            className={`card-list-row ${openMenuId === latest.id ? "menu-open" : ""} ${isConverting ? "is-converting" : ""}`}
                            onClick={() => openEdit(latest)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") openEdit(latest);
                            }}
                          >
                            <CharacterAvatar template={latest} variant="list" />
                            <div className="card-list-content">
                              <div className="card-list-header-row">
                                <div className="card-list-title-wrap">
                                  <strong className="card-list-title">{displayTitle(latest)}</strong>
                                  {badge === "ccv2" ? <span className="ccv2-badge">CCv2</span> : null}
                                  {badge === "ccv2bl" ? <span className="ccv2bl-badge">CCv2 / BL</span> : null}
                                  <span className="version-badge">v{latest.cardVersion ?? String(latest.version)}</span>
                                  {group.versions.length > 1 ? (
                                    <span className="version-count">({group.versions.length} versions)</span>
                                  ) : null}
                                  {latest.creator?.trim() ? (
                                    <span className="card-creator-tag">by {latest.creator.trim()}</span>
                                  ) : null}
                                  {sortBy === "createdAt" && getGroupCreatedAt(group) ? (
                                    <span className="card-timestamp-tag" title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}>
                                      <Icon name="Calendar" size={11} /> {formatLibraryDate(getGroupCreatedAt(group))}
                                    </span>
                                  ) : null}
                                  {sortBy === "updatedAt" && getGroupUpdatedAt(group) ? (
                                    <span className="card-timestamp-tag" title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}>
                                      <Icon name="Clock" size={11} /> {formatLibraryDate(getGroupUpdatedAt(group))}
                                    </span>
                                  ) : null}
                                </div>

                                <MoreOptionsMenu
                                  template={latest}
                                  isOpen={openMenuId === latest.id}
                                  onToggle={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === latest.id ? null : latest.id);
                                  }}
                                  onEdit={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(null);
                                    openEdit(latest);
                                  }}
                                  onConvert={
                                    entryKind(latest) === "ccv2"
                                      ? (e) => {
                                          e.stopPropagation();
                                          setOpenMenuId(null);
                                          handleConvert(latest);
                                        }
                                      : undefined
                                  }
                                  onDelete={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(null);
                                    requestDelete(latest.id, displayTitle(latest));
                                  }}
                                  converting={isConverting}
                                />
                              </div>

                              {latest.creatorNotes?.trim() ? (
                                <p className="card-creator-notes-snippet">
                                  {latest.creatorNotes.trim()}
                                </p>
                              ) : null}

                              {(latest.tags ?? []).length > 0 ? (
                                <div className="tag-chips" onClick={(e) => e.stopPropagation()}>
                                  {sortTags(latest.tags ?? [], taxonomyConfig).map((tag) => {
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
                        const isConverting = convertingId === latest.id && convertLoading;
                        return (
                          <div
                            key={group.key}
                            className={`card-grid-item ${openMenuId === latest.id ? "menu-open" : ""} ${isConverting ? "is-converting" : ""}`}
                            onClick={() => openEdit(latest)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") openEdit(latest);
                            }}
                          >
                            <div className="card-grid-thumb-wrap">
                              <CharacterAvatar template={latest} variant="grid" />
                            </div>
                            <div className="card-grid-body">
                              <strong className="card-grid-title" title={displayTitle(latest)}>
                                {displayTitle(latest)}
                              </strong>
                              <div className="card-grid-footer">
                                <div className="card-grid-badges">
                                  {badge === "ccv2" ? <span className="ccv2-badge">CCv2</span> : null}
                                  {badge === "ccv2bl" ? <span className="ccv2bl-badge">CCv2 / BL</span> : null}
                                  <span className="version-badge">v{latest.cardVersion ?? String(latest.version)}</span>
                                  {group.versions.length > 1 ? (
                                    <span className="version-count">({group.versions.length} v)</span>
                                  ) : null}
                                  {sortBy === "createdAt" && getGroupCreatedAt(group) ? (
                                    <span className="card-grid-timestamp" title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}>
                                      {formatLibraryDate(getGroupCreatedAt(group))}
                                    </span>
                                  ) : null}
                                  {sortBy === "updatedAt" && getGroupUpdatedAt(group) ? (
                                    <span className="card-grid-timestamp" title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}>
                                      {formatLibraryDate(getGroupUpdatedAt(group))}
                                    </span>
                                  ) : null}
                                </div>
                                <MoreOptionsMenu
                                  template={latest}
                                  isOpen={openMenuId === latest.id}
                                  onToggle={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(openMenuId === latest.id ? null : latest.id);
                                  }}
                                  onEdit={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(null);
                                    openEdit(latest);
                                  }}
                                  onConvert={
                                    entryKind(latest) === "ccv2"
                                      ? (e) => {
                                          e.stopPropagation();
                                          setOpenMenuId(null);
                                          handleConvert(latest);
                                        }
                                      : undefined
                                  }
                                  onDelete={(e) => {
                                    e.stopPropagation();
                                    setOpenMenuId(null);
                                    requestDelete(latest.id, displayTitle(latest));
                                  }}
                                  converting={isConverting}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* ── Bottom Pagination Controls ── */}
                  <div className="library-pagination">
                    <div className="pagination-info">
                      Showing <strong>{groups.length === 0 ? 0 : (currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, groups.length)}</strong> of <strong>{groups.length}</strong> characters
                    </div>

                    {totalPages > 1 ? (
                      <div className="pagination-controls">
                        <button
                          type="button"
                          className="pagination-nav-btn"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage(1)}
                          title="First page"
                        >
                          <Icon name="ChevronsLeft" size={14} />
                        </button>
                        <button
                          type="button"
                          className="pagination-nav-btn"
                          disabled={currentPage === 1}
                          onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                          title="Previous page"
                        >
                          <Icon name="ChevronLeft" size={14} />
                        </button>

                        {getPageNumbers(currentPage, totalPages).map((p, idx) => {
                          if (p === -1) {
                            return <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>;
                          }
                          return (
                            <button
                              key={p}
                              type="button"
                              className={`pagination-page-btn ${currentPage === p ? "active" : ""}`}
                              onClick={() => setCurrentPage(p)}
                            >
                              {p}
                            </button>
                          );
                        })}

                        <button
                          type="button"
                          className="pagination-nav-btn"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                          title="Next page"
                        >
                          <Icon name="ChevronRight" size={14} />
                        </button>
                        <button
                          type="button"
                          className="pagination-nav-btn"
                          disabled={currentPage === totalPages}
                          onClick={() => setCurrentPage(totalPages)}
                          title="Last page"
                        >
                          <Icon name="ChevronsRight" size={14} />
                        </button>
                      </div>
                    ) : null}

                    <div className="pagination-size-selector">
                      <label>
                        <span>Per page:</span>
                        <select
                          value={pageSize}
                          onChange={(e) => {
                            setPageSize(Number(e.target.value));
                            setCurrentPage(1);
                          }}
                        >
                          <option value={12}>12</option>
                          <option value={24}>24</option>
                          <option value={48}>48</option>
                          <option value={96}>96</option>
                          <option value={1000}>All</option>
                        </select>
                      </label>
                    </div>
                  </div>
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
        <div className="modal-backdrop" onMouseDown={(e) => { if (e.target === e.currentTarget) setImportNotice(null); }}>
          <section className="modal import-notice-modal">
            <header className="modal-header">
              <h2>Already Imported</h2>
              <button onClick={() => setImportNotice(null)}>Close</button>
            </header>
            <p>{importNotice.message}</p>
            <div className="version-group" style={{ margin: "12px 0", padding: "12px", border: "1px solid var(--border-color, #333)", borderRadius: "6px" }}>
              <div className="version-group-header">
                <CharacterAvatar template={importNotice.existingRecord} variant="portrait" />
                <div className="version-group-title">
                  <strong>{displayTitle(importNotice.existingRecord)}</strong>
                </div>
              </div>
            </div>
            <div className="modal-actions">
              <button onClick={() => setImportNotice(null)}>Dismiss</button>
              <button className="primary" onClick={() => {
                setImportNotice(null);
                openEdit(importNotice.existingRecord);
              }}>View / Edit</button>
            </div>
          </section>
        </div>
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
            setForm((f) => ({ ...f, tags: sortTags(selectedTags, taxonomyConfig) }));
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
      {showDiscardConfirm && (
        <div
          className="modal-backdrop"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setShowDiscardConfirm(false);
          }}
        >
          <section className="modal discard-warning-modal" aria-labelledby="discard-modal-title">
            <header className="modal-header discard-warning-header">
              <div className="discard-warning-title-wrap">
                <span className="discard-warning-icon-badge">
                  <Icon name="AlertTriangle" size={20} />
                </span>
                <h3 id="discard-modal-title">Discard unsaved changes?</h3>
              </div>
              <button
                type="button"
                className="diff-close-btn"
                onClick={() => setShowDiscardConfirm(false)}
                title="Close dialog"
                aria-label="Close dialog"
              >
                <Icon name="X" size={16} />
              </button>
            </header>
            <div className="discard-warning-body">
              {aiMessages.length > 0 && isFormDirty ? (
                <p>
                  You have unsaved changes to <strong>&quot;{form.name || "New Character"}&quot;</strong> and an active AI brainstorming session ({aiMessages.length} message{aiMessages.length === 1 ? "" : "s"}). If you leave now, all your edits and AI chat history will be discarded.
                </p>
              ) : aiMessages.length > 0 ? (
                <p>
                  You have an active AI brainstorming session ({aiMessages.length} message{aiMessages.length === 1 ? "" : "s"}). If you leave now, your chat session will be discarded.
                </p>
              ) : (
                <p>
                  You have unsaved changes to <strong>&quot;{form.name || "New Character"}&quot;</strong>. If you leave now, all your temporary edits will be lost.
                </p>
              )}
            </div>
            <footer className="discard-warning-footer">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setShowDiscardConfirm(false)}
              >
                Keep Editing
              </button>
              <button
                type="button"
                className="discard-confirm-btn"
                onClick={handleConfirmDiscard}
              >
                <Icon name="Trash2" size={14} /> Discard Changes
              </button>
            </footer>
          </section>
        </div>
      )}
      {/* Confirm Delete Character Modal */}
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