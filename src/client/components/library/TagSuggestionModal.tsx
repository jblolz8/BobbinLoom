import { useEffect, useMemo, useState } from "react";
import { Icon } from "../base";
import { resolveTagStyle, sortTags, type TagTaxonomyConfig } from "../../../engine/tagTaxonomy";

export type TagSuggestionModalProps = {
  characterName: string;
  suggestedTags: string[];
  currentTags: string[];
  loading: boolean;
  error: string | null;
  taxonomyConfig?: TagTaxonomyConfig | null;
  onApply: (selectedTags: string[]) => void;
  onRegenerate: (guidance?: string) => void;
  onClose: () => void;
};

const GUIDANCE_PRESETS = [
  { label: "🧬 Species & Race", text: "Focus on species, race, origin, and physiological traits" },
  { label: "⚔️ Combat & Powers", text: "Focus on magic, powers, fighting style, weapons, and abilities" },
  { label: "🎭 Personality", text: "Focus on personality archetypes, demeanor, and psychological traits" },
  { label: "👗 Outfits & Style", text: "Focus on clothing, visual aesthetic, colors, and outfit style" },
  { label: "🏷️ Namespaces", text: "Strictly enforce taxonomy namespaces (e.g. species:, role:, style:, rating:)" },
];

// Predefined widths for realistic skeleton tag cloud
const SKELETON_WIDTHS = [
  "85px", "120px", "95px", "140px", "75px", "110px",
  "130px", "80px", "105px", "150px", "90px", "115px",
  "100px", "70px", "125px", "135px", "88px", "108px"
];

export function TagSuggestionModal({
  characterName,
  suggestedTags,
  currentTags,
  loading,
  error,
  taxonomyConfig,
  onApply,
  onRegenerate,
  onClose,
}: TagSuggestionModalProps) {
  const [selectedTags, setSelectedTags] = useState<Set<string>>(() => {
    return new Set(currentTags);
  });
  const [customTags, setCustomTags] = useState<string[]>([]);
  const [customTagInput, setCustomTagInput] = useState("");
  const [guidanceInput, setGuidanceInput] = useState("");
  const [showGuidanceInput, setShowGuidanceInput] = useState(false);
  const [filterQuery, setFilterQuery] = useState("");
  const [dismissedError, setDismissedError] = useState(false);

  // Sync selectedTags whenever new suggestedTags arrive from the server for this character
  useEffect(() => {
    if (!loading && suggestedTags.length > 0) {
      setSelectedTags(new Set([...suggestedTags, ...currentTags, ...customTags]));
    }
  }, [suggestedTags, currentTags, customTags, loading]);

  // Reset dismissed error flag when error changes
  useEffect(() => {
    setDismissedError(false);
  }, [error]);

  // Handle escape key to close modal
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        onClose();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const allAvailableTags = useMemo(() => {
    return sortTags(Array.from(new Set([...suggestedTags, ...currentTags, ...customTags])), taxonomyConfig);
  }, [suggestedTags, currentTags, customTags, taxonomyConfig]);

  const filteredTags = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return allAvailableTags;
    return allAvailableTags.filter((t) => t.toLowerCase().includes(q));
  }, [allAvailableTags, filterQuery]);

  const aiSuggestedTagsList = useMemo(() => {
    const sorted = sortTags(suggestedTags, taxonomyConfig);
    const q = filterQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.toLowerCase().includes(q));
  }, [suggestedTags, filterQuery, taxonomyConfig]);

  const otherCardTags = useMemo(() => {
    const unmatched = currentTags.filter((t) => !suggestedTags.includes(t));
    const sorted = sortTags(unmatched, taxonomyConfig);
    const q = filterQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.toLowerCase().includes(q));
  }, [currentTags, suggestedTags, filterQuery, taxonomyConfig]);

  const customTagsList = useMemo(() => {
    const sorted = sortTags(customTags, taxonomyConfig);
    const q = filterQuery.trim().toLowerCase();
    if (!q) return sorted;
    return sorted.filter((t) => t.toLowerCase().includes(q));
  }, [customTags, filterQuery, taxonomyConfig]);

  // Count breakdown for footer status
  const aiSelectedCount = useMemo(() => {
    return suggestedTags.filter((t) => selectedTags.has(t)).length;
  }, [suggestedTags, selectedTags]);

  const savedSelectedCount = useMemo(() => {
    const unmatched = currentTags.filter((t) => !suggestedTags.includes(t));
    return unmatched.filter((t) => selectedTags.has(t)).length;
  }, [currentTags, suggestedTags, selectedTags]);

  const customSelectedCount = useMemo(() => {
    return customTags.filter((t) => selectedTags.has(t)).length;
  }, [customTags, selectedTags]);

  function toggleTag(tag: string) {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(tag)) {
        next.delete(tag);
      } else {
        next.add(tag);
      }
      return next;
    });
  }

  function handleAddCustomTag() {
    const raw = customTagInput.trim();
    if (!raw) return;

    // Support comma-separated or space-separated multiple tags
    const newItems = raw
      .split(/[,;\n]+/)
      .map((item) => item.trim().toLowerCase())
      .filter((item) => item.length > 0);

    if (newItems.length === 0) return;

    setCustomTags((prev) => {
      const existing = new Set(prev);
      const toAdd = newItems.filter((t) => !existing.has(t));
      return [...prev, ...toAdd];
    });

    setSelectedTags((prev) => {
      const next = new Set(prev);
      newItems.forEach((t) => next.add(t));
      return next;
    });

    setCustomTagInput("");
  }

  function handleRemoveCustomTag(tag: string) {
    setCustomTags((prev) => prev.filter((t) => t !== tag));
    setSelectedTags((prev) => {
      const next = new Set(prev);
      next.delete(tag);
      return next;
    });
  }

  function handleSelectAll() {
    setSelectedTags(new Set(allAvailableTags));
  }

  function handleDeselectAll() {
    setSelectedTags(new Set());
  }

  function handleSelectOnlyAi() {
    setSelectedTags(new Set(suggestedTags));
  }

  function handleApplyPresetGuidance(presetText: string) {
    setGuidanceInput((prev) => {
      const trimmed = prev.trim();
      if (!trimmed) return presetText;
      if (trimmed.includes(presetText)) return prev;
      return `${trimmed}; ${presetText}`;
    });
    setShowGuidanceInput(true);
  }

  function handleConfirm() {
    onApply(sortTags(Array.from(selectedTags), taxonomyConfig));
  }

  function handleRegenerateClick() {
    setDismissedError(false);
    onRegenerate(guidanceInput.trim() || undefined);
  }

  function renderTagToggle(tag: string, source: "ai_new" | "ai_confirmed" | "saved" | "custom") {
    const isChecked = selectedTags.has(tag);
    const tagStyle = resolveTagStyle(tag, taxonomyConfig);

    return (
      <div
        key={tag}
        className={`tag-suggestion-toggle ${source === "ai_new" ? "new-ai-tag" : ""} ${isChecked ? "checked" : ""}`}
        onClick={() => toggleTag(tag)}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === " " || e.key === "Enter") {
            e.preventDefault();
            toggleTag(tag);
          }
        }}
        style={{
          borderColor: isChecked ? tagStyle.colors.text : tagStyle.colors.border,
          backgroundColor: isChecked ? (tagStyle.colors.glow || tagStyle.colors.bg) : tagStyle.colors.bg,
        }}
      >
        <span
          className={`tag-checkbox-indicator ${isChecked ? "active" : ""}`}
          style={{ borderColor: tagStyle.colors.border, color: tagStyle.colors.text }}
        >
          {isChecked ? <Icon name="Check" size={12} strokeWidth={3} /> : null}
        </span>
        <span className="tag-label-text" style={{ color: tagStyle.colors.text }}>
          {tagStyle.namespace ? (
            <span className="tag-toggle-namespace" style={{ opacity: 0.72 }}>
              {tagStyle.namespace}:
            </span>
          ) : null}
          <span className="tag-toggle-value">{tagStyle.value}</span>
        </span>

        {source === "ai_new" ? (
          <span className="tag-source-badge ai" title="New tag suggested by AI">
            <Icon name="Sparkles" size={10} /> New AI
          </span>
        ) : source === "ai_confirmed" ? (
          <span className="tag-source-badge confirmed" title="AI also recommends keeping this tag">
            <Icon name="CheckCircle2" size={10} /> Confirmed
          </span>
        ) : source === "saved" ? (
          <span className="tag-source-badge current" title="Previously saved on character card">
            <Icon name="Tag" size={10} /> Saved
          </span>
        ) : (
          <span className="tag-source-badge custom" title="Custom tag added in this session">
            <Icon name="Plus" size={10} /> Custom
          </span>
        )}

        {source === "custom" && (
          <button
            type="button"
            className="tag-remove-custom-btn"
            onClick={(e) => {
              e.stopPropagation();
              handleRemoveCustomTag(tag);
            }}
            title="Remove custom tag"
          >
            <Icon name="X" size={11} />
          </button>
        )}
      </div>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal tag-suggestion-modal" aria-labelledby="tag-modal-title">
        <header className="modal-header tag-suggestion-header">
          <div className="tag-modal-title-wrap">
            <div className="tag-modal-title-row">
              <span className="tag-modal-icon-badge">
                <Icon name="Sparkles" size={18} />
              </span>
              <h2 id="tag-modal-title">AI Tag Suggestions</h2>
            </div>
            <p className="tag-modal-subtitle">
              Review and select tags for <strong className="tag-char-name-badge">&quot;{characterName || "New Character"}&quot;</strong>
            </p>
          </div>
          <button
            type="button"
            className="diff-close-btn"
            onClick={onClose}
            title="Close and cancel"
            aria-label="Close modal"
          >
            <Icon name="X" size={16} />
          </button>
        </header>

        {/* Optional AI Tagging Guidance Bar */}
        <div className="tag-modal-guidance-section">
          <div className="tag-guidance-toggle-row">
            <button
              type="button"
              className="tag-guidance-toggle-btn"
              onClick={() => setShowGuidanceInput(!showGuidanceInput)}
            >
              <Icon name={showGuidanceInput ? "ChevronUp" : "Sliders"} size={13} />
              <span>{showGuidanceInput ? "Hide AI Prompt Focus / Guidance" : "Add Custom Focus / Instructions for AI"}</span>
            </button>
            {!loading && (
              <button
                type="button"
                className="tag-mini-btn tag-regenerate-btn"
                onClick={handleRegenerateClick}
                title="Regenerate tag suggestions with optional guidance"
              >
                <Icon name="Sparkles" size={12} /> Regenerate Suggestions
              </button>
            )}
          </div>

          {showGuidanceInput && (
            <div className="tag-guidance-content-wrap">
              <div className="tag-guidance-input-row">
                <div className="tag-guidance-input-inner">
                  <Icon name="Sparkles" size={14} className="tag-guidance-inner-icon" />
                  <input
                    type="text"
                    className="tag-guidance-input"
                    placeholder="e.g. Focus on species:demon traits, gothic outfit, magical combat abilities, rating:sfw..."
                    value={guidanceInput}
                    onChange={(e) => setGuidanceInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !loading) {
                        handleRegenerateClick();
                      }
                    }}
                  />
                  {guidanceInput && (
                    <button
                      type="button"
                      className="tag-guidance-clear-btn"
                      onClick={() => setGuidanceInput("")}
                      title="Clear guidance text"
                    >
                      <Icon name="X" size={12} />
                    </button>
                  )}
                </div>
                <button
                  type="button"
                  className="primary-btn tag-guidance-apply-btn"
                  onClick={handleRegenerateClick}
                  disabled={loading}
                >
                  <Icon name="Sparkles" size={13} /> Apply &amp; Regenerate
                </button>
              </div>

              {/* Quick Guidance Preset Pills */}
              <div className="tag-guidance-presets-row">
                <span className="tag-guidance-presets-label">Quick Presets:</span>
                <div className="tag-guidance-presets-list">
                  {GUIDANCE_PRESETS.map((preset) => (
                    <button
                      key={preset.label}
                      type="button"
                      className="tag-preset-chip-btn"
                      onClick={() => handleApplyPresetGuidance(preset.text)}
                      title={`Add "${preset.text}" to prompt focus`}
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Modal Main Content */}
        {loading ? (
          <div className="tag-suggestion-loading-state">
            {/* Glowing Cosmic AI Orb */}
            <div className="tag-loading-orb-wrap">
              <div className="tag-pulse-ring ring-1" />
              <div className="tag-pulse-ring ring-2" />
              <div className="tag-loading-orb">
                <Icon name="Sparkles" size={30} className="tag-loading-sparkle-icon" />
              </div>
            </div>

            {/* Clear and honest title and subtitle */}
            <div className="tag-loading-status-wrap">
              <h3 className="tag-loading-stage-title">Analyzing Character Sheet…</h3>
              <p className="tag-loading-stage-desc">
                Evaluating character lore and matching taxonomy to curate relevant tags.
              </p>
            </div>

            {/* Indeterminate Glowing Line */}
            <div className="tag-loading-line-track">
              <div className="tag-loading-line-bar" />
            </div>

            {/* Active Guidance Reminder (if provided) */}
            {guidanceInput.trim() ? (
              <div className="tag-loading-guidance-pill">
                <Icon name="Sliders" size={12} />
                <span>Applying focus: <em>&ldquo;{guidanceInput.trim()}&rdquo;</em></span>
              </div>
            ) : null}

            {/* Tag Skeleton Cloud Preview */}
            <div className="tag-loading-skeleton-preview">
              <span className="tag-skeleton-caption">Incoming Tag Recommendations</span>
              <div className="tag-skeleton-grid">
                {SKELETON_WIDTHS.map((width, i) => (
                  <div
                    key={i}
                    className="tag-skeleton-pill skeleton-shimmer"
                    style={{ width, animationDelay: `${(i % 6) * 0.15}s` }}
                  />
                ))}
              </div>
            </div>

            {/* Explicit Cancel Button */}
            <div className="tag-loading-actions">
              <button
                type="button"
                className="tag-cancel-generation-btn"
                onClick={onClose}
              >
                <Icon name="XCircle" size={14} /> Cancel Generation
              </button>
            </div>
          </div>
        ) : error && !dismissedError ? (
          <div className="tag-suggestion-error-state">
            <div className="tag-modal-error-banner">
              <div className="tag-error-icon-wrap">
                <Icon name="AlertCircle" size={24} />
              </div>
              <div className="tag-error-text-wrap">
                <h4>AI Tag Generation Failed</h4>
                <p>{error}</p>
              </div>
            </div>
            <div className="tag-error-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={() => setDismissedError(true)}
              >
                <Icon name="Edit3" size={14} /> Continue Manually
              </button>
              <button
                type="button"
                className="primary-btn tag-error-retry-btn"
                onClick={handleRegenerateClick}
              >
                <Icon name="RefreshCw" size={14} /> Retry Generation
              </button>
            </div>
          </div>
        ) : (
          <div className="tag-suggestion-body">
            {/* Toolbar */}
            <div className="tag-suggestion-toolbar">
              <div className="tag-count-indicator">
                <span className="tag-count-number">{selectedTags.size}</span>
                <span className="tag-count-text">of {allAvailableTags.length} tags selected</span>
              </div>

              {/* Tag Search Filter */}
              <div className="tag-filter-search-wrap">
                <Icon name="Search" size={12} className="tag-filter-search-icon" />
                <input
                  type="text"
                  className="tag-filter-search-input"
                  placeholder="Filter tags…"
                  value={filterQuery}
                  onChange={(e) => setFilterQuery(e.target.value)}
                />
                {filterQuery && (
                  <button
                    type="button"
                    className="tag-filter-clear-btn"
                    onClick={() => setFilterQuery("")}
                    title="Clear filter"
                  >
                    <Icon name="X" size={10} />
                  </button>
                )}
              </div>

              {/* Batch Select Actions */}
              <div className="tag-selection-actions">
                <button
                  type="button"
                  className="tag-mini-btn"
                  onClick={handleSelectAll}
                  title="Select all tags"
                >
                  Select All
                </button>
                {suggestedTags.length > 0 && otherCardTags.length > 0 && (
                  <button
                    type="button"
                    className="tag-mini-btn"
                    onClick={handleSelectOnlyAi}
                    title="Select only AI suggestions"
                  >
                    AI Only
                  </button>
                )}
                <button
                  type="button"
                  className="tag-mini-btn"
                  onClick={handleDeselectAll}
                  title="Deselect all tags"
                >
                  Clear All
                </button>
              </div>
            </div>

            {/* AI Suggested Tags Group */}
            {aiSuggestedTagsList.length > 0 ? (
              <div className="tag-modal-group ai-group">
                <div className="tag-modal-group-title">
                  <Icon name="Sparkles" size={13} className="text-purple-400" />
                  <span>AI Recommended Tags ({aiSuggestedTagsList.length})</span>
                </div>
                <div className="tag-suggestion-chips-grid">
                  {aiSuggestedTagsList.map((tag) => {
                    const isNew = !currentTags.includes(tag);
                    return renderTagToggle(tag, isNew ? "ai_new" : "ai_confirmed");
                  })}
                </div>
              </div>
            ) : null}

            {/* Other Existing Saved Tags Group */}
            {otherCardTags.length > 0 ? (
              <div className="tag-modal-group saved-group">
                <div className="tag-modal-group-title">
                  <Icon name="Tag" size={13} className="text-blue-400" />
                  <span>Other Saved Card Tags ({otherCardTags.length})</span>
                </div>
                <div className="tag-suggestion-chips-grid">
                  {otherCardTags.map((tag) => renderTagToggle(tag, "saved"))}
                </div>
              </div>
            ) : null}

            {/* Custom Added Tags Group */}
            {customTagsList.length > 0 ? (
              <div className="tag-modal-group custom-group">
                <div className="tag-modal-group-title">
                  <Icon name="Plus" size={13} className="text-cyan-400" />
                  <span>Custom Added Tags ({customTagsList.length})</span>
                </div>
                <div className="tag-suggestion-chips-grid">
                  {customTagsList.map((tag) => renderTagToggle(tag, "custom"))}
                </div>
              </div>
            ) : null}

            {/* Filter Empty State */}
            {filteredTags.length === 0 ? (
              <div className="tag-empty-filter-state">
                <Icon name="SearchX" size={24} className="tag-empty-icon" />
                <p>No matching tags found for &ldquo;<strong>{filterQuery}</strong>&rdquo;.</p>
                <div className="tag-empty-actions">
                  <button
                    type="button"
                    className="tag-mini-btn"
                    onClick={() => {
                      setCustomTagInput(filterQuery);
                      setFilterQuery("");
                    }}
                  >
                    <Icon name="Plus" size={12} /> Add &ldquo;{filterQuery}&rdquo; as Custom Tag
                  </button>
                  <button
                    type="button"
                    className="tag-mini-btn"
                    onClick={() => setFilterQuery("")}
                  >
                    Clear Filter
                  </button>
                </div>
              </div>
            ) : null}

            {/* Quick Add Custom Tag Row */}
            <div className="tag-modal-add-row">
              <div className="tag-custom-input-wrap">
                <Icon name="Plus" size={13} className="tag-custom-icon" />
                <input
                  type="text"
                  placeholder="Add custom tag(s)… (comma-separated e.g. species:elf, archer, gothic)"
                  value={customTagInput}
                  onChange={(e) => setCustomTagInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleAddCustomTag();
                    }
                  }}
                  className="tag-custom-input"
                />
              </div>
              <button
                type="button"
                className="secondary-btn add-custom-tag-btn"
                onClick={handleAddCustomTag}
                disabled={!customTagInput.trim()}
              >
                <Icon name="Plus" size={14} /> Add
              </button>
            </div>
          </div>
        )}

        <footer className="tag-modal-footer">
          <div className="tag-footer-status">
            {!loading && (
              <span className="tag-footer-breakdown">
                <strong>{selectedTags.size}</strong> selected
                {aiSelectedCount > 0 && <span className="tag-breakdown-sub"> · {aiSelectedCount} AI</span>}
                {savedSelectedCount > 0 && <span className="tag-breakdown-sub"> · {savedSelectedCount} Saved</span>}
                {customSelectedCount > 0 && <span className="tag-breakdown-sub"> · {customSelectedCount} Custom</span>}
              </span>
            )}
          </div>
          <div className="tag-footer-actions">
            <button
              type="button"
              className="diff-cancel-btn"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="button"
              className="diff-accept-btn tag-apply-btn"
              onClick={handleConfirm}
              disabled={loading}
            >
              <Icon name="Check" size={15} /> Apply ({selectedTags.size}) Tags
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}
