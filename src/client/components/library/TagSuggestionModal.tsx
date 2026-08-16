import { useEffect, useMemo, useState } from "react";
import { Icon } from "../base";
import { resolveTagStyle, type TagTaxonomyConfig } from "../../../engine/tagTaxonomy";

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

  // Sync selectedTags whenever new suggestedTags arrive from the server for this character
  useEffect(() => {
    if (!loading && suggestedTags.length > 0) {
      setSelectedTags(new Set([...suggestedTags, ...currentTags, ...customTags]));
    }
  }, [suggestedTags, currentTags, customTags, loading]);

  const allAvailableTags = useMemo(() => {
    return Array.from(new Set([...suggestedTags, ...currentTags, ...customTags]));
  }, [suggestedTags, currentTags, customTags]);

  const filteredTags = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return allAvailableTags;
    return allAvailableTags.filter((t) => t.includes(q));
  }, [allAvailableTags, filterQuery]);

  const aiSuggestedTagsList = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return suggestedTags;
    return suggestedTags.filter((t) => t.includes(q));
  }, [suggestedTags, filterQuery]);

  const otherCardTags = useMemo(() => {
    const unmatched = currentTags.filter((t) => !suggestedTags.includes(t));
    const q = filterQuery.trim().toLowerCase();
    if (!q) return unmatched;
    return unmatched.filter((t) => t.includes(q));
  }, [currentTags, suggestedTags, filterQuery]);

  const customTagsList = useMemo(() => {
    const q = filterQuery.trim().toLowerCase();
    if (!q) return customTags;
    return customTags.filter((t) => t.includes(q));
  }, [customTags, filterQuery]);

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
    const norm = customTagInput.trim().toLowerCase();
    if (!norm) return;
    setCustomTags((prev) => (prev.includes(norm) ? prev : [...prev, norm]));
    setSelectedTags((prev) => new Set([...prev, norm]));
    setCustomTagInput("");
  }

  function handleSelectAll() {
    setSelectedTags(new Set(allAvailableTags));
  }

  function handleDeselectAll() {
    setSelectedTags(new Set());
  }

  function handleConfirm() {
    onApply(Array.from(selectedTags));
  }

  function handleRegenerateClick() {
    onRegenerate(guidanceInput.trim() || undefined);
  }

  function renderTagToggle(tag: string, source: "ai_new" | "ai_confirmed" | "saved" | "custom") {
    const isChecked = selectedTags.has(tag);
    const tagStyle = resolveTagStyle(tag, taxonomyConfig);

    return (
      <button
        key={tag}
        type="button"
        className={`tag-suggestion-toggle ${source === "ai_new" ? "new-ai-tag" : ""} ${isChecked ? "checked" : ""}`}
        onClick={() => toggleTag(tag)}
        style={{
          borderColor: isChecked ? tagStyle.colors.text : tagStyle.colors.border,
          backgroundColor: isChecked ? (tagStyle.colors.glow || tagStyle.colors.bg) : tagStyle.colors.bg,
        }}
      >
        <span
          className="tag-checkbox-indicator"
          style={{ borderColor: tagStyle.colors.border, color: tagStyle.colors.text }}
        >
          {isChecked ? <Icon name="Check" size={12} /> : null}
        </span>
        <span className="tag-label-text" style={{ color: tagStyle.colors.text }}>
          {tagStyle.namespace ? (
            <span className="tag-toggle-namespace" style={{ opacity: 0.75 }}>
              {tagStyle.namespace}:
            </span>
          ) : null}
          <span className="tag-toggle-value">{tagStyle.value}</span>
        </span>
        {source === "ai_new" ? (
          <span className="tag-source-badge ai" title="New tag suggested by AI">
            New AI
          </span>
        ) : source === "ai_confirmed" ? (
          <span className="tag-source-badge confirmed" title="AI also recommends keeping this tag">
            AI Confirmed
          </span>
        ) : source === "saved" ? (
          <span className="tag-source-badge current" title="Previously saved on card">
            Saved
          </span>
        ) : (
          <span className="tag-source-badge custom">Custom</span>
        )}
      </button>
    );
  }

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal tag-suggestion-modal">
        <header className="modal-header">
          <div className="tag-modal-title-wrap">
            <div className="tag-modal-title-row">
              <span className="tag-modal-icon-badge">
                <Icon name="Sparkles" size={18} />
              </span>
              <h2>AI Tag Suggestions</h2>
            </div>
            <p className="tag-modal-subtitle">
              Review and select tags for <strong>&quot;{characterName || "New Character"}&quot;</strong>:
            </p>
          </div>
          <button
            type="button"
            className="diff-close-btn"
            onClick={onClose}
            title="Close and cancel"
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
              <Icon name="Sliders" size={13} />
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
            <div className="tag-guidance-input-row">
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
              <button
                type="button"
                className="primary-btn tag-guidance-apply-btn"
                onClick={handleRegenerateClick}
                disabled={loading}
              >
                Apply &amp; Regenerate
              </button>
            </div>
          )}
        </div>

        {/* Modal Main Content */}
        {loading ? (
          <div className="tag-suggestion-loading-state">
            <div className="tag-loading-spinner-wrap">
              <Icon name="Sparkles" size={32} className="sparkle-pulse text-amber-400" />
            </div>
            <h3>Analyzing Character Sheet…</h3>
            <p>Our AI tagger is evaluating personality, species, abilities, and library taxonomy.</p>
          </div>
        ) : error ? (
          <div className="tag-suggestion-error-state">
            <div className="diff-error-banner">
              <Icon name="AlertCircle" size={18} />
              <span>{error}</span>
            </div>
            <div className="tag-error-actions">
              <button
                type="button"
                className="secondary-btn"
                onClick={handleRegenerateClick}
              >
                <Icon name="RefreshCw" size={14} /> Retry Generation
              </button>
            </div>
          </div>
        ) : (
          <div className="tag-suggestion-body">
            <div className="tag-suggestion-toolbar">
              <span className="tag-count-label">
                {selectedTags.size} of {allAvailableTags.length} tags selected
              </span>

              {allAvailableTags.length > 6 && (
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
                    >
                      <Icon name="X" size={10} />
                    </button>
                  )}
                </div>
              )}

              <div className="tag-selection-actions">
                <button
                  type="button"
                  className="tag-mini-btn"
                  onClick={handleSelectAll}
                >
                  Select All
                </button>
                <button
                  type="button"
                  className="tag-mini-btn"
                  onClick={handleDeselectAll}
                >
                  Deselect All
                </button>
              </div>
            </div>

            {/* AI Suggested Tags */}
            {aiSuggestedTagsList.length > 0 ? (
              <div className="tag-modal-group">
                <div className="tag-modal-group-title">
                  <Icon name="Sparkles" size={13} />
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

            {/* Other Existing Tags */}
            {otherCardTags.length > 0 ? (
              <div className="tag-modal-group">
                <div className="tag-modal-group-title">
                  <Icon name="Tag" size={13} />
                  <span>Other Saved Card Tags ({otherCardTags.length})</span>
                </div>
                <div className="tag-suggestion-chips-grid">
                  {otherCardTags.map((tag) => renderTagToggle(tag, "saved"))}
                </div>
              </div>
            ) : null}

            {/* Custom Added Tags */}
            {customTagsList.length > 0 ? (
              <div className="tag-modal-group">
                <div className="tag-modal-group-title">
                  <Icon name="Plus" size={13} />
                  <span>Custom Added Tags ({customTagsList.length})</span>
                </div>
                <div className="tag-suggestion-chips-grid">
                  {customTagsList.map((tag) => renderTagToggle(tag, "custom"))}
                </div>
              </div>
            ) : null}

            {filteredTags.length === 0 ? (
              <p className="empty-tags-hint">No matching tags found. You can add custom tags below.</p>
            ) : null}

            {/* Quick Add Custom Tag */}
            <div className="tag-modal-add-row">
              <input
                type="text"
                placeholder="Add custom tag…"
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
          <button
            type="button"
            className="diff-cancel-btn"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="diff-accept-btn"
            onClick={handleConfirm}
            disabled={loading}
          >
            <Icon name="Check" size={15} /> Apply ({selectedTags.size}) Tags
          </button>
        </footer>
      </section>
    </div>
  );
}
