import { useEffect, useMemo, useState } from "react";
import {
  Badge,
  Button,
  Card,
  Header,
  Icon,
  Modal,
  SearchBar,
  Stack,
  StatusMessage,
  Text,
  TextInput,
} from "../base";
import {
  resolveTagStyle,
  sortTags,
  type TagTaxonomyConfig,
} from "../../../engine/tagTaxonomy";
import "./TagSuggestionModal.css";

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
  {
    label: "🧬 Species & Race",
    text: "Focus on species, race, origin, and physiological traits",
  },
  {
    label: "⚔️ Combat & Powers",
    text: "Focus on magic, powers, fighting style, weapons, and abilities",
  },
  {
    label: "🎭 Personality",
    text: "Focus on personality archetypes, demeanor, and psychological traits",
  },
  {
    label: "👗 Outfits & Style",
    text: "Focus on clothing, visual aesthetic, colors, and outfit style",
  },
  {
    label: "🏷️ Namespaces",
    text: "Strictly enforce taxonomy namespaces (e.g. species:, role:, style:, rating:)",
  },
];

// Predefined widths for realistic skeleton tag cloud
const SKELETON_WIDTHS = [
  "85px",
  "120px",
  "95px",
  "140px",
  "75px",
  "110px",
  "130px",
  "80px",
  "105px",
  "150px",
  "90px",
  "115px",
  "100px",
  "70px",
  "125px",
  "135px",
  "88px",
  "108px",
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
      setSelectedTags(
        new Set([...suggestedTags, ...currentTags, ...customTags]),
      );
    }
  }, [suggestedTags, currentTags, customTags, loading]);

  // Reset dismissed error flag when error changes
  useEffect(() => {
    setDismissedError(false);
  }, [error]);

  const allAvailableTags = useMemo(() => {
    return sortTags(
      Array.from(new Set([...suggestedTags, ...currentTags, ...customTags])),
      taxonomyConfig,
    );
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

  function renderTagToggle(
    tag: string,
    source: "ai_new" | "ai_confirmed" | "saved" | "custom",
  ) {
    const isChecked = selectedTags.has(tag);
    const tagStyle = resolveTagStyle(tag, taxonomyConfig);
    const dark = tagStyle.colorsDark || tagStyle.colors;
    const light = tagStyle.colorsLight || tagStyle.colors;

    // Expose both dark and light palettes as CSS vars so the toggle follows the
    // active theme mode ([data-theme="light"] / .theme-light), matching how the
    // base TagChip and the Tags & Taxonomy preview color tag chips.
    const toggleVars = {
      "--tag-text": dark.text,
      "--tag-bg": isChecked ? dark.glow || dark.bg : dark.bg,
      "--tag-border": isChecked ? dark.text : dark.border,
      "--tag-glow": isChecked ? `0 0 8px ${dark.glow || dark.border}` : "none",
      "--tag-text-light": light.text,
      "--tag-bg-light": isChecked ? light.glow || light.bg : light.bg,
      "--tag-border-light": isChecked ? light.text : light.border,
      "--tag-glow-light": isChecked
        ? `0 0 8px ${light.glow || light.border}`
        : "none",
    } as React.CSSProperties;

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
        style={toggleVars}
      >
        <span className={`tag-checkbox-indicator ${isChecked ? "active" : ""}`}>
          {isChecked ? <Icon name="Check" size={12} strokeWidth={3} /> : null}
        </span>
        <span className="tag-label-text">
          {tagStyle.namespace ? (
            <span className="tag-toggle-namespace" style={{ opacity: 0.72 }}>
              {tagStyle.namespace}:
            </span>
          ) : null}
          <span className="tag-toggle-value">{tagStyle.value}</span>
        </span>

        {source === "ai_new" ? (
          <Badge variant="accent" size="xs" leftIcon="Sparkles">
            New AI
          </Badge>
        ) : source === "ai_confirmed" ? (
          <Badge variant="success" size="xs" leftIcon="CheckCircle2">
            Confirmed
          </Badge>
        ) : source === "saved" ? (
          <Badge variant="info" size="xs" leftIcon="Tag">
            Saved
          </Badge>
        ) : (
          <Badge variant="neutral" size="xs" leftIcon="Plus">
            Custom
          </Badge>
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
    <Modal
      open={true}
      onClose={onClose}
      size="md"
      ariaLabelledBy="tag-modal-title"
    >
      <Header
        variant="modal"
        titleId="tag-modal-title"
        icon="Sparkles"
        title="AI Tag Suggestions"
        subtitle={
          <Text as="span" size="xs" tone="secondary">
            Review and select tags for{" "}
            <Badge variant="accent" size="xs">
              &quot;{characterName || "New Character"}&quot;
            </Badge>
          </Text>
        }
        actions={
          <Button
            type="button"
            variant="secondary"
            size="xs"
            leftIcon="X"
            onClick={onClose}
          >
            Close
          </Button>
        }
      />

      <Modal.Body>
        <Modal.Content>
          <Stack direction="column" gap="md">
          {/* Optional AI Tagging Guidance Bar */}
          <Card variant="elevated" padding="sm">
            <Stack direction="column" gap="sm">
              <Stack
                direction="row"
                justify="between"
                align="center"
                gap="sm"
                wrap
              >
                <Button
                  type="button"
                  variant="ghost"
                  size="xs"
                  leftIcon={showGuidanceInput ? "ChevronUp" : "Sliders"}
                  onClick={() => setShowGuidanceInput(!showGuidanceInput)}
                >
                  {showGuidanceInput
                    ? "Hide AI Prompt Focus / Guidance"
                    : "Add Custom Focus / Instructions for AI"}
                </Button>
                {!loading && (
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    leftIcon="Sparkles"
                    onClick={handleRegenerateClick}
                    title="Regenerate tag suggestions with optional guidance"
                  >
                    Regenerate Suggestions
                  </Button>
                )}
              </Stack>

              {showGuidanceInput && (
                <Stack direction="column" gap="xs">
                  <Stack direction="row" gap="xs" align="center">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <TextInput
                        size="sm"
                        leftIcon={<Icon name="Sparkles" size={14} />}
                        placeholder="e.g. Focus on species:demon traits, gothic outfit, magical combat abilities, rating:sfw..."
                        value={guidanceInput}
                        onChange={(e) => setGuidanceInput(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && !loading) {
                            handleRegenerateClick();
                          }
                        }}
                      />
                    </div>
                    {guidanceInput && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        iconOnly
                        onClick={() => setGuidanceInput("")}
                        title="Clear guidance text"
                        aria-label="Clear guidance text"
                      >
                        <Icon name="X" size={12} />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="primary"
                      size="sm"
                      leftIcon="Sparkles"
                      onClick={handleRegenerateClick}
                      disabled={loading}
                    >
                      Apply &amp; Regenerate
                    </Button>
                  </Stack>

                  {/* Quick Guidance Preset Pills */}
                  <Stack direction="row" gap="xs" align="center" wrap>
                    <Text as="span" size="xs" tone="muted" weight="medium">
                      Quick Presets:
                    </Text>
                    {GUIDANCE_PRESETS.map((preset) => (
                      <Button
                        key={preset.label}
                        type="button"
                        variant="secondary"
                        size="xs"
                        onClick={() => handleApplyPresetGuidance(preset.text)}
                        title={`Add "${preset.text}" to prompt focus`}
                      >
                        {preset.label}
                      </Button>
                    ))}
                  </Stack>
                </Stack>
              )}
            </Stack>
          </Card>

          {/* Modal Main Content */}
          {loading ? (
            <div className="tag-suggestion-loading-state">
              <div className="tag-loading-orb-wrap">
                <div className="tag-pulse-ring ring-1" />
                <div className="tag-pulse-ring ring-2" />
                <div className="tag-loading-orb">
                  <Icon
                    name="Sparkles"
                    size={28}
                    className="tag-loading-sparkle-icon"
                  />
                </div>
              </div>

              <Stack direction="column" gap="2xs" align="center">
                <Text as="h3" size="md" weight="semibold">
                  Analyzing Character Sheet…
                </Text>
                <Text as="p" size="xs" tone="secondary">
                  Evaluating character lore and matching taxonomy to curate
                  relevant tags.
                </Text>
              </Stack>

              <div className="tag-loading-line-track">
                <div className="tag-loading-line-bar" />
              </div>

              {guidanceInput.trim() ? (
                <Badge variant="accent" size="xs" leftIcon="Sliders">
                  Applying focus: &ldquo;{guidanceInput.trim()}&rdquo;
                </Badge>
              ) : null}

              <Card variant="elevated" padding="sm" fullWidth>
                <Stack direction="column" gap="xs" align="center">
                  <Text
                    as="span"
                    size="xs"
                    tone="muted"
                    weight="semibold"
                    uppercase
                  >
                    Incoming Tag Recommendations
                  </Text>
                  <div className="tag-skeleton-grid">
                    {SKELETON_WIDTHS.map((width, i) => (
                      <div
                        key={i}
                        className="tag-skeleton-pill"
                        style={{ width, animationDelay: `${(i % 6) * 0.15}s` }}
                      />
                    ))}
                  </div>
                </Stack>
              </Card>

              <Button
                variant="danger"
                size="sm"
                onClick={onClose}
                leftIcon={<Icon name="XCircle" size={14} />}
              >
                Cancel Generation
              </Button>
            </div>
          ) : error && !dismissedError ? (
            <Stack direction="column" gap="md">
              <StatusMessage variant="banner" tone="err">
                <strong>AI Tag Generation Failed:</strong> {error}
              </StatusMessage>
              <Stack direction="row" justify="end" gap="sm">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setDismissedError(true)}
                  leftIcon={<Icon name="Edit3" size={14} />}
                >
                  Continue Manually
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={handleRegenerateClick}
                  leftIcon={<Icon name="RefreshCw" size={14} />}
                >
                  Retry Generation
                </Button>
              </Stack>
            </Stack>
          ) : (
            <Stack direction="column" gap="md">
              {/* Toolbar */}
              <Stack
                direction="row"
                justify="between"
                align="center"
                gap="sm"
                wrap
              >
                <Stack direction="row" gap="xs" align="center">
                  <Badge variant="accent" size="xs" pill>
                    {selectedTags.size}
                  </Badge>
                  <Text as="span" size="xs" tone="muted">
                    of {allAvailableTags.length} tags selected
                  </Text>
                </Stack>

                <div style={{ flex: "1 1 180px", maxWidth: "240px" }}>
                  <SearchBar
                    size="sm"
                    placeholder="Filter tags…"
                    value={filterQuery}
                    onChange={setFilterQuery}
                  />
                </div>

                <Stack direction="row" gap="xs" align="center">
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={handleSelectAll}
                    title="Select all tags"
                  >
                    Select All
                  </Button>
                  {suggestedTags.length > 0 && otherCardTags.length > 0 && (
                    <Button
                      type="button"
                      variant="secondary"
                      size="xs"
                      onClick={handleSelectOnlyAi}
                      title="Select only AI suggestions"
                    >
                      AI Only
                    </Button>
                  )}
                  <Button
                    type="button"
                    variant="secondary"
                    size="xs"
                    onClick={handleDeselectAll}
                    title="Deselect all tags"
                  >
                    Clear All
                  </Button>
                </Stack>
              </Stack>

              {/* AI Suggested Tags Group */}
              {aiSuggestedTagsList.length > 0 ? (
                <Card variant="elevated" padding="sm">
                  <Stack direction="column" gap="xs">
                    <Stack direction="row" gap="xs" align="center">
                      <Icon name="Sparkles" size={13} />
                      <Text
                        as="span"
                        size="xs"
                        tone="muted"
                        weight="semibold"
                        uppercase
                      >
                        AI Recommended Tags ({aiSuggestedTagsList.length})
                      </Text>
                    </Stack>
                    <div className="tag-suggestion-chips-grid">
                      {aiSuggestedTagsList.map((tag) => {
                        const isNew = !currentTags.includes(tag);
                        return renderTagToggle(
                          tag,
                          isNew ? "ai_new" : "ai_confirmed",
                        );
                      })}
                    </div>
                  </Stack>
                </Card>
              ) : null}

              {/* Other Existing Saved Tags Group */}
              {otherCardTags.length > 0 ? (
                <Card variant="elevated" padding="sm">
                  <Stack direction="column" gap="xs">
                    <Stack direction="row" gap="xs" align="center">
                      <Icon name="Tag" size={13} />
                      <Text
                        as="span"
                        size="xs"
                        tone="muted"
                        weight="semibold"
                        uppercase
                      >
                        Other Saved Card Tags ({otherCardTags.length})
                      </Text>
                    </Stack>
                    <div className="tag-suggestion-chips-grid">
                      {otherCardTags.map((tag) => renderTagToggle(tag, "saved"))}
                    </div>
                  </Stack>
                </Card>
              ) : null}

              {/* Custom Added Tags Group */}
              {customTagsList.length > 0 ? (
                <Card variant="elevated" padding="sm">
                  <Stack direction="column" gap="xs">
                    <Stack direction="row" gap="xs" align="center">
                      <Icon name="Plus" size={13} />
                      <Text
                        as="span"
                        size="xs"
                        tone="muted"
                        weight="semibold"
                        uppercase
                      >
                        Custom Added Tags ({customTagsList.length})
                      </Text>
                    </Stack>
                    <div className="tag-suggestion-chips-grid">
                      {customTagsList.map((tag) =>
                        renderTagToggle(tag, "custom"),
                      )}
                    </div>
                  </Stack>
                </Card>
              ) : null}

              {/* Filter Empty State */}
              {filteredTags.length === 0 ? (
                <Card variant="elevated" padding="md">
                  <Stack direction="column" gap="xs" align="center">
                    <Icon name="SearchX" size={24} />
                    <Text as="p" size="sm" tone="secondary" align="center">
                      No matching tags found for &ldquo;
                      <strong>{filterQuery}</strong>&rdquo;.
                    </Text>
                    <Stack direction="row" gap="xs" align="center">
                      <Button
                        type="button"
                        variant="secondary"
                        size="xs"
                        leftIcon="Plus"
                        onClick={() => {
                          setCustomTagInput(filterQuery);
                          setFilterQuery("");
                        }}
                      >
                        Add &ldquo;{filterQuery}&rdquo; as Custom Tag
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="xs"
                        onClick={() => setFilterQuery("")}
                      >
                        Clear Filter
                      </Button>
                    </Stack>
                  </Stack>
                </Card>
              ) : null}

              {/* Quick Add Custom Tag Row */}
              <Stack direction="row" gap="xs" align="center">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <TextInput
                    size="sm"
                    leftIcon={<Icon name="Plus" size={13} />}
                    placeholder="Add custom tag(s)… (comma-separated e.g. species:elf, archer, gothic)"
                    value={customTagInput}
                    onChange={(e) => setCustomTagInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddCustomTag();
                      }
                    }}
                  />
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  leftIcon="Plus"
                  onClick={handleAddCustomTag}
                  disabled={!customTagInput.trim()}
                >
                  Add
                </Button>
              </Stack>
            </Stack>
          )}
        </Stack>
        </Modal.Content>
      </Modal.Body>

      <Modal.Footer>
        <Stack
          direction="row"
          justify="between"
          align="center"
          gap="sm"
          wrap
          fullWidth
        >
          <div>
            {!loading && (
              <Text as="span" size="xs" tone="muted">
                <Text as="strong" size="xs" tone="primary" weight="semibold">
                  {selectedTags.size}
                </Text>{" "}
                selected
                {aiSelectedCount > 0 ? ` · ${aiSelectedCount} AI` : ""}
                {savedSelectedCount > 0 ? ` · ${savedSelectedCount} Saved` : ""}
                {customSelectedCount > 0
                  ? ` · ${customSelectedCount} Custom`
                  : ""}
              </Text>
            )}
          </div>
          <Stack direction="row" gap="sm" align="center">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={handleConfirm}
              disabled={loading}
              leftIcon={<Icon name="Check" size={15} />}
            >
              Apply ({selectedTags.size}) Tags
            </Button>
          </Stack>
        </Stack>
      </Modal.Footer>
    </Modal>
  );
}
