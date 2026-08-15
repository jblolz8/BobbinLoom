import { useEffect, useMemo, useRef, useState } from "react";
import type { ChangeEvent } from "react";
import type { CharacterTemplate } from "../../../schemas";
import { createCharacter, deleteCharacter, importCharacter, listCharacters, updateCharacter } from "../../api";
import { convertCharacterApply, convertCharacterGenerate, suggestCharacterTags } from "../../api";
import type { CharacterTemplateUpdate } from "../../api";
import { CHARACTER_SHEET_EXAMPLE } from "../../../engine/characterSections";
import { displayTitle, entryKind, filterLibraryEntries, cardBadgeLabel } from "../../../engine/characterCards";
import { Icon } from "../base";
import { DiffModal } from "./DiffModal";
import { TwoPaneDiff } from "./TwoPaneDiff";
import { TagSuggestionModal } from "./TagSuggestionModal";

export type CharacterLibraryProps = {
  isModal?: boolean;
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
}: {
  tags: string[];
  onChange: (tags: string[]) => void;
  allLibraryTags: string[];
  disabled?: boolean;
  onSuggestAI?: () => void;
  suggestingAI?: boolean;
}) {
  const [inputVal, setInputVal] = useState("");
  const [showSuggestions, setShowSuggestions] = useState(false);

  const availableSuggestions = useMemo(() => {
    const q = inputVal.trim().toLowerCase();
    if (!q) return allLibraryTags.filter((t) => !tags.includes(t)).slice(0, 8);
    return allLibraryTags
      .filter((t) => t.includes(q) && !tags.includes(t))
      .slice(0, 10);
  }, [allLibraryTags, tags, inputVal]);

  function addTag(raw: string) {
    const norm = raw.trim().toLowerCase();
    if (!norm) return;
    if (!tags.includes(norm)) {
      onChange([...tags, norm]);
    }
    setInputVal("");
    setShowSuggestions(false);
  }

  function removeTag(tagToRemove: string) {
    onChange(tags.filter((t) => t !== tagToRemove));
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
            <span key={tag} className="editable-tag-chip">
              <span className="editable-tag-text">{tag}</span>
              {!disabled ? (
                <button
                  type="button"
                  className="editable-tag-remove"
                  onClick={() => removeTag(tag)}
                  title={`Remove "${tag}"`}
                >
                  ✕
                </button>
              ) : null}
            </span>
          ))}

          {!disabled ? (
            <div className="tag-input-wrap">
              <input
                type="text"
                placeholder={tags.length === 0 ? "Add tags (press Enter or comma)…" : "Add tag…"}
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
                onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    if (inputVal.trim()) addTag(inputVal);
                  } else if (e.key === "Backspace" && !inputVal && tags.length > 0) {
                    removeTag(tags[tags.length - 1]);
                  }
                }}
                className="tag-inline-input"
              />

              {showSuggestions && availableSuggestions.length > 0 ? (
                <div className="tag-autocomplete-dropdown">
                  <span className="autocomplete-header">Library Suggestions:</span>
                  {availableSuggestions.map((sug) => (
                    <button
                      key={sug}
                      type="button"
                      className="autocomplete-item"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        addTag(sug);
                      }}
                    >
                      + {sug}
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
}: {
  originalTags: string[];
  currentTags: string[];
  onRestore: () => void;
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
                  className={`diff-tag-chip ${removed.includes(tag.toLowerCase()) ? "removed" : "same"}`}
                >
                  {removed.includes(tag.toLowerCase()) ? "- " : ""}
                  {tag}
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
                  className={`diff-tag-chip ${added.includes(tag.toLowerCase()) ? "added" : "same"}`}
                >
                  {added.includes(tag.toLowerCase()) ? "+ " : ""}
                  {tag}
                </span>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

type VersionGroup = { key: string; versions: CharacterTemplate[] };

function groupByLineage(templates: CharacterTemplate[]): VersionGroup[] {
  const map = new Map<string, CharacterTemplate[]>();
  for (const t of templates) {
    const key = t.lineageId ?? t.id;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  const groups = [...map.entries()].map(([key, versions]) => ({
    key,
    versions: versions.sort((a, b) => b.version - a.version)
  }));
  groups.sort((a, b) => a.versions[0].name.localeCompare(b.versions[0].name));
  return groups;
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

/** Avatar for a library card: the record's PNG (imported CCv2 cards), falling
 *  back to a letter placeholder when the route 404s (BL-native records). */
function CharacterAvatar({ template, className }: { template: CharacterTemplate; className?: string }) {
  const [failed, setFailed] = useState(false);

  // Reset the fallback when the card changes (list reloads reuse components).
  useEffect(() => {
    setFailed(false);
  }, [template.id]);

  if (failed) {
    return <div className={`avatar-placeholder ${className ?? ""}`}>{displayTitle(template).charAt(0).toUpperCase()}</div>;
  }
  return (
    <img
      className={`library-avatar ${className ?? ""}`}
      src={`/api/characters/${template.id}/avatar`}
      alt=""
      onError={() => setFailed(true)}
    />
  );
}

/** Card dropdown "more options" menu */
function MoreOptionsMenu({
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
    <div className="card-more-menu-container" onClick={(e) => e.stopPropagation()}>
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

export function CharacterLibrary({ isModal }: CharacterLibraryProps) {
  const [templates, setTemplates] = useState<CharacterTemplate[]>([]);
  const [form, setForm] = useState<CharacterForm>(blankForm());
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingIsCcv2, setEditingIsCcv2] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [tagFilterSearch, setTagFilterSearch] = useState("");
  const [importing, setImporting] = useState(false);
  const [viewMode, setViewMode] = useState<ViewMode>("portrait");
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(12);
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

  // ── AI Tag Suggestion state (Option B) ──
  const [tagSuggestModalOpen, setTagSuggestModalOpen] = useState(false);
  const [tagSuggestLoading, setTagSuggestLoading] = useState(false);
  const [tagSuggestError, setTagSuggestError] = useState<string | null>(null);
  const [suggestedTags, setSuggestedTags] = useState<string[]>([]);
  const tagSuggestAbortControllerRef = useRef<AbortController | null>(null);

  const convertingCharacter = useMemo(() => {
    if (!convertingId) return null;
    return templates.find((t) => t.id === convertingId) ?? null;
  }, [templates, convertingId]);

  async function loadData() {
    try {
      setTemplates(await listCharacters());
    } catch {
      setTemplates([]);
    }
  }

  useEffect(() => {
    void loadData();
  }, []);

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

  function openCreate() {
    handleCancelTagSuggest();
    setForm(blankForm());
    setEditingId(null);
    setEditingIsCcv2(false);
    setEditorOpen(true);
    setStatus(null);
    setConvertedSuccess(null);
  }

  function openEdit(t: CharacterTemplate) {
    handleCancelTagSuggest();
    setForm(templateToForm(t));
    setEditingId(t.id);
    setEditingIsCcv2(t.format === "ccv2");
    setViewTab("bl");
    setEditorOpen(true);
    setStatus(null);
    setConvertedSuccess(null);
  }

  function closeEditor() {
    handleCancelTagSuggest();
    setEditorOpen(false);
    setEditingId(null);
    setEditingIsCcv2(false);
    setViewTab("bl");
    setStatus(null);
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
        // Cancelled cleanly by user
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
      const update = formToUpdate(form);
      if (editingId) {
        await updateCharacter(editingId, editingIsCcv2 ? { name: update.name } : update);
        setStatus(`"${form.name}" updated.`);
      } else {
        const created = await createCharacter(form.name);
        await updateCharacter(created.id, {
          content: form.content,
          creatorNotes: form.creatorNotes,
          tags: form.tags,
        });
        setStatus(`"${form.name}" created.`);
      }
      setTemplates(await listCharacters());
      closeEditor();
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete(id: string, name: string) {
    if (!window.confirm(`Delete "${name}" from the library?`)) return;
    await deleteCharacter(id);
    setTemplates(await listCharacters());
  }

  async function handleImportFile(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-importing the same file
    if (!file) return;
    setImporting(true);
    setStatus(null);
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
      setTemplates(await listCharacters());
      setStatus(`Imported "${displayTitle(result.record)}".`);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
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
        setForm(templateToForm(targetTpl));
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
  const groups = useMemo(() => groupByLineage(filteredTemplates), [filteredTemplates]);

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

        {editorOpen ? (
          <div className="character-editor-inline">
            <h3>{editingId ? `Edit: ${form.name}` : "New Character"}</h3>
            {status ? <p className="status-message">{status}</p> : null}

            <div className="editor-header-actions">
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
                              <span key={tag} className="read-only-tag-chip">{tag}</span>
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

            <div className="modal-actions">
              <button onClick={closeEditor}>Cancel</button>
              <button className="primary" onClick={handleSave} disabled={saving || !form.name.trim()}>
                {saving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        ) : (
          <div className="character-booru-layout">
            {/* ── Left-side Booru Tag Sidebar ── */}
            <aside className="character-tag-sidebar">
              <div className="sidebar-header">
                <h4>
                  <Icon name="Tag" size={15} /> Tags
                  <span className="sidebar-total-count">({allTagCounts.length})</span>
                </h4>
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
              </div>

              {allTagCounts.length > 8 ? (
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

              <div className="sidebar-tag-list">
                {filteredTagCounts.length === 0 ? (
                  <p className="sidebar-empty-tags">
                    {tagFilterSearch ? "No matching tags." : "No tags yet."}
                  </p>
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

                <div className="library-search-wrapper">
                  <span className="search-icon-prefix">
                    <Icon name="Search" size={15} />
                  </span>
                  <input
                    type="text"
                    placeholder="Search name, tags, creator:…"
                    value={search}
                    onChange={(e) => {
                      setSearch(e.target.value);
                      setCurrentPage(1);
                    }}
                    className="library-search-input"
                  />
                  {search ? (
                    <button
                      className="clear-search-btn"
                      onClick={() => {
                        setSearch("");
                        setCurrentPage(1);
                      }}
                    >
                      ✕
                    </button>
                  ) : null}
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

              {status ? (
                <p className={`status-message ${status.startsWith("Imported") ? "" : "status-error"}`}>
                  {status}
                </p>
              ) : null}

              {/* Active Search Summary Filter Chips */}
              {activeFilterTags.length > 0 ? (
                <div className="active-filters-bar">
                  <span className="active-filters-label">Active filters:</span>
                  {activeFilterTags.map((tag) => (
                    <button
                      key={tag}
                      type="button"
                      className="active-filter-chip"
                      onClick={() => removeFilterTag(tag)}
                      title={`Remove filter "${tag}"`}
                    >
                      tag:{tag} <span className="chip-remove">✕</span>
                    </button>
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
                              <CharacterAvatar template={latest} className="card-portrait-avatar" />
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

                              <p className="card-summary-snippet">
                                {latest.summary?.trim()
                                  ? latest.summary.trim()
                                  : latest.content
                                      .split("\n")
                                      .find((l) => l.trim() && !l.startsWith("["))
                                      ?.trim() || "(empty content)"}
                              </p>

                              {(latest.tags ?? []).length > 0 ? (
                                <div className="tag-chips" onClick={(e) => e.stopPropagation()}>
                                  {(latest.tags ?? []).map((tag) => {
                                    const active = isTagActive(tag);
                                    return (
                                      <button
                                        key={tag}
                                        type="button"
                                        className={`tag-chip ${active ? "active" : ""}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleTag(tag);
                                        }}
                                        title={active ? `Remove "${tag}" from search` : `Add "${tag}" to search`}
                                      >
                                        {tag}
                                      </button>
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
                                    handleDelete(latest.id, latest.name);
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
                            <CharacterAvatar template={latest} className="card-list-avatar" />
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
                                    handleDelete(latest.id, latest.name);
                                  }}
                                  converting={isConverting}
                                />
                              </div>

                              {latest.creatorNotes?.trim() ? (
                                <p className="card-creator-notes-snippet">
                                  {latest.creatorNotes.trim()}
                                </p>
                              ) : null}

                              <p className="card-summary-snippet">
                                {latest.summary?.trim()
                                  ? latest.summary.trim()
                                  : latest.content
                                      .split("\n")
                                      .find((l) => l.trim() && !l.startsWith("["))
                                      ?.trim() || "(empty content)"}
                              </p>

                              {(latest.tags ?? []).length > 0 ? (
                                <div className="tag-chips" onClick={(e) => e.stopPropagation()}>
                                  {(latest.tags ?? []).map((tag) => {
                                    const active = isTagActive(tag);
                                    return (
                                      <button
                                        key={tag}
                                        type="button"
                                        className={`tag-chip ${active ? "active" : ""}`}
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          toggleTag(tag);
                                        }}
                                        title={active ? `Remove "${tag}" from search` : `Add "${tag}" to search`}
                                      >
                                        {tag}
                                      </button>
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
                              <CharacterAvatar template={latest} className="card-grid-thumb" />
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
                                    handleDelete(latest.id, latest.name);
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
                <CharacterAvatar template={importNotice.existingRecord} />
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
          onApply={(selectedTags) => {
            setForm((f) => ({ ...f, tags: selectedTags }));
            setTagSuggestModalOpen(false);
            setSuggestedTags([]);
          }}
          onRegenerate={(guidance) => {
            void handleOpenAiTagSuggestions(guidance);
          }}
          onClose={handleCancelTagSuggest}
        />
      ) : null}
    </div>
  );
}