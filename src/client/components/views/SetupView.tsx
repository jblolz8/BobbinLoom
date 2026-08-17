import { useEffect, useMemo, useState } from "react";
import type { CharacterTemplate, LorebookSummary } from "../../../schemas";
import type { Persona } from "../../api";
import { getTagTaxonomy } from "../../api";
import { AvatarBadge, Icon, SearchBar, TagChip, CharacterAvatar } from "../base";
import type { ViewMode } from "../library/CharacterLibrary";
import { cardBadgeLabel, displayTitle, entryKind, filterLibraryEntries, groupByLineage, getGroupCreatedAt, getGroupUpdatedAt, type CharacterSortOption, type SortDirection } from "../../../engine/characterCards";
import { groupTagsByCategory, sortTags, type TagTaxonomyConfig } from "../../../engine/tagTaxonomy";

export type SetupFormState = {
  name: string;
  setting: string;
  generateOpeningChoices: boolean;
  openingMode: "quick" | "fleshedOut";
};

export const defaultSetupForm: SetupFormState = {
  name: "",
  setting: "",
  generateOpeningChoices: false,
  openingMode: "fleshedOut",
};

export type SetupStepTab = "persona" | "cast" | "setting";

export type SetupViewProps = {
  open: boolean;
  onClose: () => void;
  personas: Persona[];
  selectedPersonaId: string;
  onSelectPersona: (id: string) => void;
  castLibrary: CharacterTemplate[];
  selectedCastIds: string[];
  onToggleCastId: (id: string) => void;
  setSelectedCastIds?: (ids: string[]) => void;
  lorebookLibrary: LorebookSummary[];
  selectedLorebookIds: string[];
  onToggleLorebookId: (id: string) => void;
  setSelectedLorebookIds?: (ids: string[]) => void;
  cardSettings: Array<{ title: string; scenario: string }>;
  setupForm: SetupFormState;
  onSetupFormChange: (updater: (f: SetupFormState) => SetupFormState) => void;
  generating: boolean;
  genError: string | null;
  onGenerate: () => void;
  onCancelGenerate: () => void;
  onStartBlank: () => void;
  onBack: () => void;
  onOpenPersonaManager: () => void;
  onOpenLorebookManager: () => void;
};

function formatCastDate(isoOrStr?: string): string {
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

export function SetupView(props: SetupViewProps) {
  const {
    open,
    onClose,
    personas,
    selectedPersonaId,
    onSelectPersona,
    castLibrary,
    selectedCastIds,
    onToggleCastId,
    setSelectedCastIds,
    lorebookLibrary,
    selectedLorebookIds,
    onToggleLorebookId,
    cardSettings,
    setupForm,
    onSetupFormChange,
    generating,
    genError,
    onGenerate,
    onCancelGenerate,
    onStartBlank,
  } = props;

  const [activeTab, setActiveTab] = useState<SetupStepTab>("persona");
  const [castSearch, setCastSearchState] = useState(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem("bobbinloom_setup_cast_search") ?? "";
    }
    return "";
  });

  const setCastSearch = (val: string) => {
    setCastSearchState(val);
    try {
      if (val) {
        localStorage.setItem("bobbinloom_setup_cast_search", val);
      } else {
        localStorage.removeItem("bobbinloom_setup_cast_search");
      }
    } catch { /* silent */ }
  };

  const [sortBy, setSortByState] = useState<CharacterSortOption>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_setup_cast_sort_by");
      if (saved === "name" || saved === "createdAt" || saved === "updatedAt") return saved;
    }
    return "name";
  });

  const [sortDirection, setSortDirectionState] = useState<SortDirection>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_setup_cast_sort_dir");
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
      localStorage.setItem("bobbinloom_setup_cast_sort_by", option);
      localStorage.setItem("bobbinloom_setup_cast_sort_dir", nextDir);
    } catch { /* silent */ }
    setCastPage(1);
  };

  const toggleSortDirection = () => {
    const nextDir: SortDirection = sortDirection === "asc" ? "desc" : "asc";
    setSortDirectionState(nextDir);
    try {
      localStorage.setItem("bobbinloom_setup_cast_sort_dir", nextDir);
    } catch { /* silent */ }
    setCastPage(1);
  };

  const [castPage, setCastPage] = useState(1);
  const [pageSize, setPageSizeState] = useState<number>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_setup_cast_page_size");
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
      localStorage.setItem("bobbinloom_setup_cast_page_size", String(size));
    } catch { /* silent */ }
  };

  const [taxonomyConfig, setTaxonomyConfig] = useState<TagTaxonomyConfig | null>(null);
  const [showTagFilters, setShowTagFiltersState] = useState<boolean>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      return localStorage.getItem("bobbinloom_setup_cast_show_tag_filters") === "true";
    }
    return false;
  });

  const setShowTagFilters = (val: boolean) => {
    setShowTagFiltersState(val);
    try {
      localStorage.setItem("bobbinloom_setup_cast_show_tag_filters", String(val));
    } catch { /* silent */ }
  };

  // View mode with independent SetupView persistence
  const [viewMode, setViewModeState] = useState<ViewMode>(() => {
    if (typeof window !== "undefined" && window.localStorage) {
      const saved = localStorage.getItem("bobbinloom_setup_cast_view_mode");
      if (saved === "portrait" || saved === "list" || saved === "grid") return saved;
    }
    return "portrait";
  });

  const setViewMode = (mode: ViewMode) => {
    setViewModeState(mode);
    try {
      localStorage.setItem("bobbinloom_setup_cast_view_mode", mode);
    } catch { /* silent */ }
  };

  // Fetch taxonomy configuration for tag styling
  useEffect(() => {
    if (open) {
      void getTagTaxonomy()
        .then((res) => setTaxonomyConfig(res.tagTaxonomy))
        .catch(() => setTaxonomyConfig(null));
    }
  }, [open]);

  // Reset tab when modal opens
  useEffect(() => {
    if (open) {
      setActiveTab("persona");
      setCastPage(1);
    }
  }, [open]);

  // Tag frequency tally from library
  const allTagCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const t of castLibrary) {
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
  }, [castLibrary]);

  const groupedTagCategories = useMemo(() => {
    return groupTagsByCategory(allTagCounts, taxonomyConfig);
  }, [allTagCounts, taxonomyConfig]);

  // Active filter tags from search string
  const activeFilterTags = useMemo(() => {
    return castSearch
      .split(/\s+/)
      .map((t) => t.trim().toLowerCase())
      .filter((t) => t.startsWith("tag:") && t.length > 4)
      .map((t) => t.slice(4));
  }, [castSearch]);

  function isTagActive(tag: string): boolean {
    const raw = tag.toLowerCase();
    const norm = raw.replace(/\s+/g, "_");
    return activeFilterTags.some((t) => t === norm || t === raw || t.replace(/_/g, " ") === raw);
  }

  function toggleTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = castSearch.split(/\s+/).filter(Boolean);
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
    setCastSearch(next.join(" "));
    setCastPage(1);
  }

  function removeFilterTag(tag: string) {
    const normTag = tag.trim().toLowerCase().replace(/\s+/g, "_");
    const tagToken = `tag:${normTag}`;
    const tokens = castSearch.split(/\s+/).filter(Boolean);
    const next = tokens.filter((t) => {
      const low = t.toLowerCase();
      return low !== tagToken && low !== `tag:${tag.toLowerCase()}`;
    });
    setCastSearch(next.join(" "));
    setCastPage(1);
  }

  // Filtered cast templates
  const filteredCast = useMemo(() => {
    return filterLibraryEntries(castLibrary, castSearch);
  }, [castLibrary, castSearch]);

  const castGroups = useMemo(() => {
    return groupByLineage(filteredCast, sortBy, sortDirection);
  }, [filteredCast, sortBy, sortDirection]);

  const totalPages = Math.max(1, Math.ceil(castGroups.length / pageSize));
  const paginatedCastGroups = useMemo(() => {
    const start = (castPage - 1) * pageSize;
    return castGroups.slice(start, start + pageSize);
  }, [castGroups, castPage, pageSize]);

  // Selected persona object
  const selectedPersona = useMemo(() => {
    return personas.find((p) => p.id === selectedPersonaId);
  }, [personas, selectedPersonaId]);

  // Selected cast templates
  const selectedCastTemplates = useMemo(() => {
    return castLibrary.filter((t) => selectedCastIds.includes(t.id));
  }, [castLibrary, selectedCastIds]);

  const selectedCastCount = selectedCastIds.length;
  const selectedLorebookCount = selectedLorebookIds.length;

  function handleSelectAllFilteredCast() {
    const selectable = filteredCast
      .filter((t) => t.format !== "ccv2")
      .map((t) => t.id);
    if (setSelectedCastIds) {
      const next = Array.from(new Set([...selectedCastIds, ...selectable]));
      setSelectedCastIds(next);
    } else {
      selectable.forEach((id) => {
        if (!selectedCastIds.includes(id)) onToggleCastId(id);
      });
    }
  }

  function handleClearCast() {
    if (setSelectedCastIds) {
      setSelectedCastIds([]);
    } else {
      selectedCastIds.forEach((id) => onToggleCastId(id));
    }
  }

  if (!open) return null;

  return (
    <div className="modal-backdrop">
      <section className="modal setup-modal setup-wizard-modal">
        {/* Modal Header */}
        <header className="modal-header setup-wizard-header">
          <div>
            <h2>Create New Playthrough</h2>
            <p className="setup-subtitle">
              Configure your character persona, starting cast, and world setting.
            </p>
          </div>
          <button
            type="button"
            className="flex items-center gap-1 modal-close-btn"
            onClick={onClose}
            disabled={generating}
            title="Close setup"
          >
            <Icon name="X" size={16} /> Close
          </button>
        </header>

        {/* ── Active Generating Screen ── */}
        {generating ? (
          <div className="setup-generating-view">
            <div className="setup-generating-icon-wrap">
              <Icon name="Sparkles" size={38} className="generating-sparkle-anim" />
            </div>
            <h3>Weaving Your Playthrough...</h3>
            <p className="setup-generating-subtitle">
              {setupForm.openingMode === "fleshedOut"
                ? "Generating world scenario, characters, and writing the opening scene (2-stage narrative)…"
                : "Generating starting scenario, character state, and initial scene…"}
            </p>
            <div className="setup-shimmer-bar-wrap">
              <div className="setup-shimmer-bar" />
            </div>

            <div className="setup-generating-summary-box">
              <div className="generating-summary-row">
                <span className="summary-label">Persona:</span>
                <strong className="summary-val">{selectedPersona?.name || "None"}</strong>
              </div>
              <div className="generating-summary-row">
                <span className="summary-label">Starting Cast:</span>
                <strong className="summary-val">
                  {selectedCastCount === 0
                    ? "None (Solo)"
                    : `${selectedCastCount} character${selectedCastCount === 1 ? "" : "s"}`}
                </strong>
              </div>
              <div className="generating-summary-row">
                <span className="summary-label">Lorebooks:</span>
                <strong className="summary-val">
                  {selectedLorebookCount === 0
                    ? "None"
                    : `${selectedLorebookCount} selected`}
                </strong>
              </div>
              <div className="generating-summary-row">
                <span className="summary-label">Opening Mode:</span>
                <strong className="summary-val">
                  {setupForm.openingMode === "fleshedOut" ? "Fleshed-out opening" : "Quick start"}
                </strong>
              </div>
            </div>

            <div className="setup-generating-actions">
              <button
                type="button"
                className="danger flex items-center gap-1.5 cancel-gen-btn"
                onClick={onCancelGenerate}
              >
                <Icon name="X" size={15} /> Cancel Generation
              </button>
            </div>
          </div>
        ) : (
          <>
            {/* ── Wizard Step Tabs ── */}
            <nav className="setup-wizard-tabs" aria-label="Setup Steps">
              <button
                type="button"
                className={`setup-tab-btn ${activeTab === "persona" ? "active" : ""}`}
                onClick={() => setActiveTab("persona")}
              >
                <span className="setup-tab-num">1</span>
                <span className="setup-tab-label">Persona</span>
                {selectedPersona ? (
                  <span className="setup-tab-badge active">{selectedPersona.name}</span>
                ) : null}
              </button>

              <button
                type="button"
                className={`setup-tab-btn ${activeTab === "cast" ? "active" : ""}`}
                onClick={() => setActiveTab("cast")}
              >
                <span className="setup-tab-num">2</span>
                <span className="setup-tab-label">Cast</span>
                <span className={`setup-tab-badge ${selectedCastCount > 0 ? "active" : ""}`}>
                  {selectedCastCount} Selected
                </span>
              </button>

              <button
                type="button"
                className={`setup-tab-btn ${activeTab === "setting" ? "active" : ""}`}
                onClick={() => setActiveTab("setting")}
              >
                <span className="setup-tab-num">3</span>
                <span className="setup-tab-label">Setting &amp; Story</span>
                {selectedLorebookCount > 0 ? (
                  <span className="setup-tab-badge active">{selectedLorebookCount} Lorebooks</span>
                ) : null}
              </button>
            </nav>

            {/* ── Scrollable Step Body ── */}
            <div className="setup-step-body">
              {/* ════════ TAB 1: PERSONA ════════ */}
              {activeTab === "persona" && (
                <div className="setup-persona-tab">
                  <div className="setup-section-intro">
                    <h3>Choose Your Persona</h3>
                    <p className="setup-section-hint">
                      Select the identity and perspective your player character will take during the story.
                    </p>
                  </div>

                  {personas.length === 0 ? (
                    <div className="setup-empty-card">
                      <Icon name="User" size={32} className="setup-empty-icon" />
                      <p className="empty-title">No personas found</p>
                      <p className="empty-subtitle">Create a persona in Persona Manager to define your protagonist&apos;s name and traits.</p>
                    </div>
                  ) : (
                    <div className="setup-persona-grid">
                      {personas.map((p) => {
                        const isSelected = selectedPersonaId === p.id;
                        return (
                          <div
                            key={p.id}
                            className={`setup-persona-card ${isSelected ? "selected" : ""}`}
                            onClick={() => onSelectPersona(p.id)}
                            role="button"
                            tabIndex={0}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.preventDefault();
                                onSelectPersona(p.id);
                              }
                            }}
                          >
                            <div className="persona-card-header">
                              <AvatarBadge icon="User" name={p.name} size="sm" />
                              <div className="persona-card-title-wrap">
                                <strong className="persona-card-name">
                                  {p.name}
                                  {p.isDefault ? <span className="persona-star-badge" title="Default Persona">★</span> : null}
                                </strong>
                                <span className="persona-selection-indicator">
                                  {isSelected ? <Icon name="CheckCircle2" size={18} className="text-blue-400" /> : <div className="selection-circle-empty" />}
                                </span>
                              </div>
                            </div>
                            <p className="persona-card-desc">
                              {p.description || "No description provided."}
                            </p>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* ════════ TAB 2: CAST ════════ */}
              {activeTab === "cast" && (
                <div className="setup-cast-tab">
                  {/* Selected Cast Shelf Tray */}
                  <div className="setup-selected-cast-tray">
                    <div className="selected-cast-tray-header">
                      <div className="flex items-center gap-2">
                        <Icon name="UserCheck" size={15} className="text-blue-400" />
                        <h4>Selected Cast ({selectedCastCount})</h4>
                      </div>
                      {selectedCastCount > 0 ? (
                        <button
                          type="button"
                          className="tag-mini-btn"
                          onClick={handleClearCast}
                          title="Deselect all characters"
                        >
                          Clear Selection
                        </button>
                      ) : null}
                    </div>

                    {selectedCastTemplates.length === 0 ? (
                      <p className="selected-cast-empty-hint">
                        No characters selected yet. Click cards below to add them to your starting party, or proceed solo.
                      </p>
                    ) : (
                      <div className="selected-cast-scroll">
                        {selectedCastTemplates.map((t) => (
                          <div key={t.id} className="selected-cast-chip">
                            <CharacterAvatar template={t} variant="chip" />
                            <span className="selected-cast-name" title={displayTitle(t)}>{displayTitle(t)}</span>
                            <button
                              type="button"
                              className="selected-cast-remove"
                              onClick={() => onToggleCastId(t.id)}
                              title={`Remove ${displayTitle(t)}`}
                            >
                              <Icon name="X" size={12} />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {/* Visual Divider */}
                  <div className="setup-section-divider">
                    <span className="divider-label">Available Character Library</span>
                  </div>

                  {/* Cast Library Toolbar */}
                  <div className="setup-cast-toolbar">
                    <div className="setup-cast-search-wrap">
                      <SearchBar
                        value={castSearch}
                        onChange={(val) => {
                          setCastSearch(val);
                          setCastPage(1);
                        }}
                        onClear={() => setCastPage(1)}
                        placeholder="Search cast by name, tag (e.g. species:elf), creator…"
                        size="sm"
                      />
                    </div>

                    <div className="setup-cast-actions">
                      <button
                        type="button"
                        className={`tag-mini-btn tag-filter-toggle-btn ${showTagFilters ? "active" : ""}`}
                        onClick={() => setShowTagFilters(!showTagFilters)}
                        title="Toggle tag taxonomy filter cloud"
                      >
                        <Icon name="Tag" size={13} />
                        <span>Filter Tags {allTagCounts.length > 0 ? `(${allTagCounts.length})` : ""}</span>
                      </button>

                      <button
                        type="button"
                        className="tag-mini-btn"
                        onClick={handleSelectAllFilteredCast}
                        disabled={filteredCast.length === 0}
                        title="Select all filtered characters"
                      >
                        Select All
                      </button>

                      {/* Sort Controls */}
                      <div className="library-sort-control-group setup-cast-sort-group" role="group" aria-label="Sort cast">
                        <div className="library-sort-select-wrapper">
                          <Icon name="ArrowUpDown" size={12} className="library-sort-icon" />
                          <select
                            className="library-sort-select"
                            value={sortBy}
                            onChange={(e) => setSortBy(e.target.value as CharacterSortOption)}
                            aria-label="Sort cast by"
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
                            size={13}
                          />
                          <span className="sort-dir-label">
                            {sortBy === "name"
                              ? (sortDirection === "asc" ? "A-Z" : "Z-A")
                              : (sortDirection === "desc" ? "Newest" : "Oldest")}
                          </span>
                        </button>
                      </div>

                      {/* View Mode Buttons */}
                      <div className="view-mode-selector">
                        <button
                          type="button"
                          className={`view-mode-btn ${viewMode === "portrait" ? "active" : ""}`}
                          onClick={() => setViewMode("portrait")}
                          title="Portrait View"
                        >
                          <Icon name="Columns" size={15} />
                        </button>
                        <button
                          type="button"
                          className={`view-mode-btn ${viewMode === "list" ? "active" : ""}`}
                          onClick={() => setViewMode("list")}
                          title="List View"
                        >
                          <Icon name="List" size={15} />
                        </button>
                        <button
                          type="button"
                          className={`view-mode-btn ${viewMode === "grid" ? "active" : ""}`}
                          onClick={() => setViewMode("grid")}
                          title="Grid View"
                        >
                          <Icon name="LayoutGrid" size={15} />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Active Filter Chips Bar */}
                  {activeFilterTags.length > 0 && (
                    <div className="setup-active-filters-bar">
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
                          setCastSearch("");
                          setCastPage(1);
                        }}
                      >
                        Clear all
                      </button>
                    </div>
                  )}

                  {/* Tag Taxonomy Filter Container */}
                  {showTagFilters && groupedTagCategories.length > 0 && (
                    <div className="setup-cast-tags-panel">
                      <div className="setup-cast-tags-header">
                        <span className="tags-panel-title">Click a tag to filter the cast:</span>
                      </div>
                      <div className="setup-cast-tags-cloud">
                        {groupedTagCategories.map((group) => (
                          <div key={group.id} className="setup-cast-tag-group">
                            <span className="setup-cast-tag-cat-label" style={{ color: group.color }}>
                              {group.label}
                            </span>
                            <div className="setup-cast-tag-chips">
                              {group.tags.map(({ tag, count }) => {
                                const active = isTagActive(tag);
                                return (
                                  <TagChip
                                    key={tag}
                                    tag={tag}
                                    userConfig={taxonomyConfig}
                                    active={active}
                                    count={count}
                                    size="xs"
                                    onClick={() => toggleTag(tag)}
                                  />
                                );
                              })}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Character Cards Display */}
                  {castLibrary.length === 0 ? (
                    <div className="setup-empty-card">
                      <Icon name="Users" size={32} className="setup-empty-icon" />
                      <p className="empty-title">No characters in library</p>
                      <p className="empty-subtitle">You can start a fresh adventure without starting cast, or create characters in the Character Library.</p>
                    </div>
                  ) : filteredCast.length === 0 ? (
                    <div className="setup-empty-card">
                      <Icon name="SearchX" size={28} className="setup-empty-icon" />
                      <p className="empty-title">No characters match &ldquo;{castSearch}&rdquo;</p>
                      <button
                        type="button"
                        className="secondary-btn"
                        onClick={() => {
                          setCastSearch("");
                          setCastPage(1);
                        }}
                      >
                        Clear Search
                      </button>
                    </div>
                  ) : (
                    <>
                      {/* Portrait View */}
                      {viewMode === "portrait" && (
                        <div className="character-portrait-grid setup-cast-grid">
                          {paginatedCastGroups.map((group) => {
                            const latest = group.versions[0];
                            const isCcv2 = latest.format === "ccv2";
                            const isSelected = selectedCastIds.includes(latest.id);
                            const badge = cardBadgeLabel(latest);

                            return (
                              <div
                                key={group.key}
                                className={`card-portrait setup-cast-card ${isSelected ? "selected" : ""} ${isCcv2 ? "cast-disabled" : ""}`}
                                onClick={!isCcv2 ? () => onToggleCastId(latest.id) : undefined}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabIndex={!isCcv2 ? 0 : -1}
                                onKeyDown={(e) => {
                                  if (!isCcv2 && (e.key === "Enter" || e.key === " ")) {
                                    e.preventDefault();
                                    onToggleCastId(latest.id);
                                  }
                                }}
                              >
                                <div className="card-portrait-image-wrap">
                                  <CharacterAvatar template={latest} variant="portrait" />
                                  <div className={`card-selection-badge ${isSelected ? "checked" : ""}`}>
                                    {isSelected ? <Icon name="Check" size={13} strokeWidth={3} /> : null}
                                  </div>
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

                                  {isCcv2 ? (
                                    <span className="cast-warn">Convert to BL in library to select</span>
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

                                  <div className="card-portrait-footer">
                                    <div className="card-portrait-badges">
                                      {badge === "ccv2" ? <span className="ccv2-badge">CCv2</span> : null}
                                      {badge === "ccv2bl" ? <span className="ccv2bl-badge">CCv2 / BL</span> : null}
                                      <span className="version-badge">v{latest.cardVersion ?? String(latest.version)}</span>
                                      {sortBy === "createdAt" && getGroupCreatedAt(group) ? (
                                        <span className="card-timestamp-badge" title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}>
                                          <Icon name="Calendar" size={10} /> {formatCastDate(getGroupCreatedAt(group))}
                                        </span>
                                      ) : null}
                                      {sortBy === "updatedAt" && getGroupUpdatedAt(group) ? (
                                        <span className="card-timestamp-badge" title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}>
                                          <Icon name="Clock" size={10} /> {formatCastDate(getGroupUpdatedAt(group))}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* List View */}
                      {viewMode === "list" && (
                        <div className="character-list-view setup-cast-list">
                          {paginatedCastGroups.map((group) => {
                            const latest = group.versions[0];
                            const isCcv2 = latest.format === "ccv2";
                            const isSelected = selectedCastIds.includes(latest.id);
                            const badge = cardBadgeLabel(latest);

                            return (
                              <div
                                key={group.key}
                                className={`card-list-row setup-cast-card ${isSelected ? "selected" : ""} ${isCcv2 ? "cast-disabled" : ""}`}
                                onClick={!isCcv2 ? () => onToggleCastId(latest.id) : undefined}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabIndex={!isCcv2 ? 0 : -1}
                                onKeyDown={(e) => {
                                  if (!isCcv2 && (e.key === "Enter" || e.key === " ")) {
                                    e.preventDefault();
                                    onToggleCastId(latest.id);
                                  }
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
                                        <span className="version-count">({group.versions.length} v)</span>
                                      ) : null}
                                      {latest.creator?.trim() ? (
                                        <span className="card-creator-tag">by {latest.creator.trim()}</span>
                                      ) : null}
                                      {sortBy === "createdAt" && getGroupCreatedAt(group) ? (
                                        <span className="card-timestamp-tag" title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}>
                                          <Icon name="Calendar" size={11} /> {formatCastDate(getGroupCreatedAt(group))}
                                        </span>
                                      ) : null}
                                      {sortBy === "updatedAt" && getGroupUpdatedAt(group) ? (
                                        <span className="card-timestamp-tag" title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}>
                                          <Icon name="Clock" size={11} /> {formatCastDate(getGroupUpdatedAt(group))}
                                        </span>
                                      ) : null}
                                    </div>

                                    <div className={`card-selection-badge ${isSelected ? "checked" : ""}`}>
                                      {isSelected ? <Icon name="Check" size={13} strokeWidth={3} /> : null}
                                    </div>
                                  </div>

                                  {isCcv2 ? (
                                    <span className="cast-warn">Convert to BL in library to select</span>
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

                      {/* Grid View */}
                      {viewMode === "grid" && (
                        <div className="character-grid-view setup-cast-compact-grid">
                          {paginatedCastGroups.map((group) => {
                            const latest = group.versions[0];
                            const isCcv2 = latest.format === "ccv2";
                            const isSelected = selectedCastIds.includes(latest.id);
                            const badge = cardBadgeLabel(latest);

                            return (
                              <div
                                key={group.key}
                                className={`card-grid-item setup-cast-card ${isSelected ? "selected" : ""} ${isCcv2 ? "cast-disabled" : ""}`}
                                onClick={!isCcv2 ? () => onToggleCastId(latest.id) : undefined}
                                role="checkbox"
                                aria-checked={isSelected}
                                tabIndex={!isCcv2 ? 0 : -1}
                                onKeyDown={(e) => {
                                  if (!isCcv2 && (e.key === "Enter" || e.key === " ")) {
                                    e.preventDefault();
                                    onToggleCastId(latest.id);
                                  }
                                }}
                              >
                                <div className="card-grid-thumb-wrap">
                                  <CharacterAvatar template={latest} variant="grid" />
                                  <div className={`card-selection-badge ${isSelected ? "checked" : ""}`}>
                                    {isSelected ? <Icon name="Check" size={13} strokeWidth={3} /> : null}
                                  </div>
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
                                      {sortBy === "createdAt" && getGroupCreatedAt(group) ? (
                                        <span className="card-grid-timestamp" title={`Created: ${new Date(getGroupCreatedAt(group)).toLocaleString()}`}>
                                          {formatCastDate(getGroupCreatedAt(group))}
                                        </span>
                                      ) : null}
                                      {sortBy === "updatedAt" && getGroupUpdatedAt(group) ? (
                                        <span className="card-grid-timestamp" title={`Updated: ${new Date(getGroupUpdatedAt(group)).toLocaleString()}`}>
                                          {formatCastDate(getGroupUpdatedAt(group))}
                                        </span>
                                      ) : null}
                                    </div>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}

                      {/* Pagination Controls */}
                      <div className="library-pagination setup-cast-pagination">
                        <div className="pagination-info">
                          Showing <strong>{castGroups.length === 0 ? 0 : (castPage - 1) * pageSize + 1}–{Math.min(castPage * pageSize, castGroups.length)}</strong> of <strong>{castGroups.length}</strong>
                        </div>
                        {totalPages > 1 ? (
                          <div className="pagination-controls">
                            <button
                              type="button"
                              className="pagination-nav-btn"
                              disabled={castPage === 1}
                              onClick={() => setCastPage(1)}
                              title="First page"
                            >
                              <Icon name="ChevronsLeft" size={14} />
                            </button>
                            <button
                              type="button"
                              className="pagination-nav-btn"
                              disabled={castPage === 1}
                              onClick={() => setCastPage((p) => Math.max(1, p - 1))}
                              title="Previous page"
                            >
                              <Icon name="ChevronLeft" size={14} />
                            </button>
                            {getPageNumbers(castPage, totalPages).map((p, idx) =>
                              p === -1 ? (
                                <span key={`ellipsis-${idx}`} className="pagination-ellipsis">…</span>
                              ) : (
                                <button
                                  key={p}
                                  type="button"
                                  className={`pagination-page-btn ${castPage === p ? "active" : ""}`}
                                  onClick={() => setCastPage(p)}
                                >
                                  {p}
                                </button>
                              )
                            )}
                            <button
                              type="button"
                              className="pagination-nav-btn"
                              disabled={castPage === totalPages}
                              onClick={() => setCastPage((p) => Math.min(totalPages, p + 1))}
                              title="Next page"
                            >
                              <Icon name="ChevronRight" size={14} />
                            </button>
                            <button
                              type="button"
                              className="pagination-nav-btn"
                              disabled={castPage === totalPages}
                              onClick={() => setCastPage(totalPages)}
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
                                setCastPage(1);
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
                </div>
              )}

              {/* ════════ TAB 3: SETTING & STORY ════════ */}
              {activeTab === "setting" && (
                <div className="setup-setting-tab">
                  <div className="setup-section-intro">
                    <h3>Setting, Lore &amp; Generation</h3>
                    <p className="setup-section-hint">
                      Describe your world, select lorebooks, and choose how the opening scene should be written.
                    </p>
                  </div>

                  {/* Lorebooks Section */}
                  <div className="setup-setting-block">
                    <div className="setup-block-header">
                      <div>
                        <h4>Lorebooks</h4>
                        <span className="field-hint">
                          World Info lorebooks are automatically scanned for keyword matches each turn.
                        </span>
                      </div>
                    </div>

                    {lorebookLibrary.length === 0 ? (
                      <p className="persona-empty">
                        No lorebooks imported yet. Import lorebooks in the Lorebook Manager or proceed without world info.
                      </p>
                    ) : (
                      <div className="setup-lorebook-grid">
                        {lorebookLibrary.map((lb) => {
                          const isSelected = selectedLorebookIds.includes(lb.id);
                          return (
                            <div
                              key={lb.id}
                              className={`setup-lorebook-card ${isSelected ? "selected" : ""}`}
                              onClick={() => onToggleLorebookId(lb.id)}
                              role="checkbox"
                              aria-checked={isSelected}
                              tabIndex={0}
                              onKeyDown={(e) => {
                                if (e.key === "Enter" || e.key === " ") {
                                  e.preventDefault();
                                  onToggleLorebookId(lb.id);
                                }
                              }}
                            >
                              <div className="lorebook-card-header">
                                <div className="flex items-center gap-1.5 flex-1 min-w-0">
                                  <Icon name="BookOpen" size={14} className={isSelected ? "text-blue-400" : "text-slate-400"} />
                                  <strong className="lorebook-name" title={lb.name}>{lb.name}</strong>
                                </div>
                                <span className="lorebook-selection-indicator">
                                  {isSelected ? (
                                    <Icon name="CheckCircle2" size={17} className="text-blue-400" />
                                  ) : (
                                    <div className="selection-circle-empty" />
                                  )}
                                </span>
                              </div>
                              <span className="lorebook-card-meta">
                                {lb.entryCount} entries · depth {lb.scanDepth}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {/* Playthrough Details Form */}
                  <div className="settings-form setup-form">
                    <label>
                      <span className="field-label">Playthrough Name</span>
                      <input
                        value={setupForm.name}
                        onChange={(e) => onSetupFormChange((f) => ({ ...f, name: e.target.value }))}
                        placeholder="e.g. Dragon's Rest"
                        className="setup-text-input"
                      />
                    </label>

                    <label>
                      <span className="field-label">World Setting &amp; Starting Scenario</span>
                      <span className="field-hint">
                        Describe the world, tone, genre, factions, and initial situation. The AI uses this to craft your scenario.
                      </span>
                      <textarea
                        value={setupForm.setting}
                        onChange={(e) => {
                          onSetupFormChange((f) => ({ ...f, setting: e.target.value }));
                          e.target.style.height = "auto";
                          e.target.style.height = `${e.target.scrollHeight}px`;
                        }}
                        rows={4}
                        placeholder="Describe the world, tone, genre, factions, and initial situation. Include starting location or goals..."
                        className="auto-grow-textarea setup-setting-textarea"
                      />
                    </label>

                    {cardSettings.length > 0 ? (
                      <label>
                        <span className="field-hint">…or use an existing setting from an imported card</span>
                        <select
                          value=""
                          onChange={(e) => {
                            if (!e.target.value) return;
                            const picked = cardSettings.find((s) => s.scenario === e.target.value);
                            if (picked) onSetupFormChange((f) => ({ ...f, setting: picked.scenario }));
                          }}
                          className="setup-scenario-select"
                        >
                          <option value="">Choose a card scenario…</option>
                          {cardSettings.map((s) => (
                            <option key={s.scenario} value={s.scenario}>{s.title}</option>
                          ))}
                        </select>
                      </label>
                    ) : null}

                    {/* Opening Mode Option Cards */}
                    <div className="opening-mode-picker">
                      <span className="field-label">Opening Style</span>
                      <div className="opening-mode-options">
                        <label className={`opening-mode-option ${setupForm.openingMode === "quick" ? "selected" : ""}`}>
                          <input
                            type="radio"
                            name="openingMode"
                            checked={setupForm.openingMode === "quick"}
                            onChange={() => onSetupFormChange((f) => ({ ...f, openingMode: "quick" }))}
                          />
                          <div>
                            <strong>Quick start</strong>
                            <span className="opening-mode-sub">Scenario + short opening · 1 call · faster</span>
                          </div>
                        </label>
                        <label className={`opening-mode-option ${setupForm.openingMode === "fleshedOut" ? "selected" : ""}`}>
                          <input
                            type="radio"
                            name="openingMode"
                            checked={setupForm.openingMode === "fleshedOut"}
                            onChange={() => onSetupFormChange((f) => ({ ...f, openingMode: "fleshedOut" }))}
                          />
                          <div>
                            <strong>Fleshed-out opening</strong>
                            <span className="opening-mode-sub">Generate, then write rich first scene · 2 calls · immersive</span>
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Generate Initial Choices Custom Toggle Card */}
                    <div
                      className={`setup-choices-toggle-card ${setupForm.generateOpeningChoices ? "active" : ""}`}
                      onClick={() => onSetupFormChange((f) => ({ ...f, generateOpeningChoices: !f.generateOpeningChoices }))}
                      role="checkbox"
                      aria-checked={setupForm.generateOpeningChoices}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          onSetupFormChange((f) => ({ ...f, generateOpeningChoices: !f.generateOpeningChoices }));
                        }
                      }}
                    >
                      <div className="setup-choices-toggle-info">
                        <strong className="setup-choices-toggle-title">
                          <Icon name="ListOrdered" size={16} className="text-blue-400 inline mr-1.5" />
                          Generate Initial Choices
                        </strong>
                        <span className="setup-choices-toggle-sub">
                          Provide 3 suggested action choices at the end of the opening scene to kickstart gameplay.
                        </span>
                      </div>
                      <div className={`setup-custom-switch ${setupForm.generateOpeningChoices ? "checked" : ""}`}>
                        <div className="setup-switch-handle" />
                      </div>
                    </div>
                  </div>

                  {/* Error Box if previous attempt failed */}
                  {genError ? (
                    <div className="error-box setup-error">
                      <p>{genError}</p>
                      <div className="flex items-center gap-2 mt-2">
                        <button
                          type="button"
                          className="flex items-center gap-1 retry-btn"
                          onClick={onGenerate}
                        >
                          <Icon name="RotateCcw" size={14} /> Retry
                        </button>
                        <button
                          type="button"
                          className="flex items-center gap-1 start-blank-alt-btn"
                          onClick={onStartBlank}
                        >
                          <Icon name="FilePlus" size={14} /> Use Start Blank Instead
                        </button>
                      </div>
                    </div>
                  ) : null}
                </div>
              )}
            </div>

            {/* ── Sticky Pinned Bottom Footer ── */}
            <footer className="setup-sticky-footer">
              {activeTab === "persona" && (
                <div className="setup-footer-row flex items-center justify-between w-full">
                  <div />
                  <button
                    type="button"
                    className="primary-btn flex items-center gap-1.5"
                    onClick={() => setActiveTab("cast")}
                  >
                    Next: Choose Cast <Icon name="ArrowRight" size={15} />
                  </button>
                </div>
              )}

              {activeTab === "cast" && (
                <div className="setup-footer-row flex items-center justify-between w-full">
                  <button
                    type="button"
                    className="secondary-btn flex items-center gap-1"
                    onClick={() => setActiveTab("persona")}
                  >
                    <Icon name="ArrowLeft" size={14} /> Back: Persona
                  </button>
                  <button
                    type="button"
                    className="primary-btn flex items-center gap-1.5"
                    onClick={() => setActiveTab("setting")}
                  >
                    Next: Setting &amp; Story <Icon name="ArrowRight" size={15} />
                  </button>
                </div>
              )}

              {activeTab === "setting" && (
                <div className="setup-footer-row flex items-center justify-between w-full">
                  <button
                    type="button"
                    className="secondary-btn flex items-center gap-1"
                    onClick={() => setActiveTab("cast")}
                  >
                    <Icon name="ArrowLeft" size={14} /> Back: Cast
                  </button>

                  <div className="setup-launch-actions">
                    <button
                      type="button"
                      className="btn-secondary flex items-center gap-1.5"
                      onClick={onStartBlank}
                      disabled={generating}
                      title="Start immediately with selected cast without generating scenario text"
                    >
                      <Icon name="FilePlus" size={15} /> Start Blank
                    </button>
                    <button
                      type="button"
                      className="primary-btn flex items-center gap-1.5 generate-scenario-btn"
                      onClick={onGenerate}
                      disabled={generating}
                    >
                      <Icon name="Wand2" size={16} /> Generate Scenario
                    </button>
                  </div>
                </div>
              )}
            </footer>
          </>
        )}
      </section>
    </div>
  );
}
