import { useEffect, useMemo, useState } from "react";
import type { TagTaxonomyConfig, CustomCategoryConfig } from "../../../schemas";
import { BUILT_IN_CATEGORIES, deriveLightColor, discoverLibraryNamespaces } from "../../../engine/tagTaxonomy";
import { Icon, TagChip } from "../base";
import { getTagTaxonomy, updateTagTaxonomy } from "../../api";

const PRESET_COLOR_SWATCHES = [
  "#f87171", // Red / Crimson
  "#fb923c", // Orange
  "#fbbf24", // Amber
  "#facc15", // Yellow
  "#4ade80", // Green
  "#2dd4bf", // Teal
  "#22d3ee", // Cyan
  "#38bdf8", // Light Blue
  "#60a5fa", // Blue
  "#818cf8", // Indigo
  "#c084fc", // Purple
  "#f472b6", // Pink
  "#e879f9", // Fuchsia
  "#94a3b8", // Slate
];

const PRESET_LIGHT_COLOR_SWATCHES = [
  "#dc2626", // Crimson
  "#ea580c", // Orange
  "#d97706", // Amber
  "#b45309", // Dark Gold
  "#16a34a", // Forest Green
  "#0d9488", // Deep Teal
  "#0891b2", // Cyan
  "#0284c7", // Sky Blue
  "#2563eb", // Royal Blue
  "#4f46e5", // Indigo
  "#7c3aed", // Purple
  "#db2777", // Pink
  "#c026d3", // Fuchsia
  "#475569", // Slate
];

export type TagTaxonomyPanelProps = {
  allLibraryTags?: string[];
  currentConfig?: TagTaxonomyConfig | null;
  onConfigUpdated?: (config: TagTaxonomyConfig) => void;
};

export function TagTaxonomyPanel({
  allLibraryTags = [],
  currentConfig,
  onConfigUpdated,
}: TagTaxonomyPanelProps) {
  const [config, setConfig] = useState<TagTaxonomyConfig>(() => {
    return currentConfig ?? { customCategories: [], tagOverrides: {} };
  });

  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [previewInput, setPreviewInput] = useState("species:cat-girl");
  const [previewTheme, setPreviewTheme] = useState<"both" | "dark" | "light">("both");

  // Form state for creating/editing a custom category
  const [newCatLabel, setNewCatLabel] = useState("");
  const [newCatPrefixes, setNewCatPrefixes] = useState("");
  const [newCatColor, setNewCatColor] = useState("#2dd4bf");
  const [newCatColorLight, setNewCatColorLight] = useState<string>("");
  const [useAutoLightColor, setUseAutoLightColor] = useState(true);
  const [editingCatId, setEditingCatId] = useState<string | null>(null);

  // Form state for custom tag override
  const [overrideTag, setOverrideTag] = useState("");
  const [overrideTarget, setOverrideTarget] = useState("");

  useEffect(() => {
    if (currentConfig) {
      setConfig(currentConfig);
    } else {
      void getTagTaxonomy()
        .then((res) => setConfig(res.tagTaxonomy))
        .catch(() => {});
    }
  }, [currentConfig]);

  // Discover prefixes present in the library
  const discoveredNamespaces = useMemo(() => {
    return discoverLibraryNamespaces(allLibraryTags);
  }, [allLibraryTags]);

  // Check which discovered prefixes are not yet mapped to any built-in or custom category
  const unmappedNamespaces = useMemo(() => {
    const allKnownPrefixes = new Set<string>();
    for (const b of BUILT_IN_CATEGORIES) {
      for (const p of b.prefixes) {
        allKnownPrefixes.add(p.toLowerCase().replace(/:.*$/, ""));
      }
    }
    for (const c of config.customCategories) {
      for (const p of c.prefixes) {
        allKnownPrefixes.add(p.toLowerCase().replace(/:.*$/, ""));
      }
    }
    return discoveredNamespaces.filter((d) => !allKnownPrefixes.has(d.prefix.toLowerCase()));
  }, [discoveredNamespaces, config.customCategories]);

  const effectiveLightColor = useMemo(() => {
    return useAutoLightColor
      ? deriveLightColor(newCatColor)
      : (newCatColorLight || deriveLightColor(newCatColor));
  }, [useAutoLightColor, newCatColor, newCatColorLight]);

  function handleAddOrUpdateCategory() {
    const label = newCatLabel.trim();
    if (!label) return;

    const prefixes = newCatPrefixes
      .split(/[,|\s]+/)
      .map((p) => p.trim().toLowerCase().replace(/:$/, ""))
      .filter(Boolean);

    if (prefixes.length === 0) {
      prefixes.push(label.toLowerCase().replace(/\s+/g, "_"));
    }

    const id = editingCatId ?? `custom_${Date.now()}`;
    const category: CustomCategoryConfig = {
      id,
      label,
      prefixes,
      color: newCatColor,
      colorLight: useAutoLightColor ? undefined : (newCatColorLight || undefined),
    };

    setConfig((prev) => {
      const existingIdx = prev.customCategories.findIndex((c) => c.id === id);
      let updatedList: CustomCategoryConfig[];
      if (existingIdx >= 0) {
        updatedList = [...prev.customCategories];
        updatedList[existingIdx] = category;
      } else {
        updatedList = [...prev.customCategories, category];
      }
      return { ...prev, customCategories: updatedList };
    });

    setNewCatLabel("");
    setNewCatPrefixes("");
    setNewCatColor("#2dd4bf");
    setNewCatColorLight("");
    setUseAutoLightColor(true);
    setEditingCatId(null);
  }

  function handleEditCategory(cat: CustomCategoryConfig) {
    setEditingCatId(cat.id);
    setNewCatLabel(cat.label);
    setNewCatPrefixes(cat.prefixes.join(", "));
    setNewCatColor(cat.color);
    if (cat.colorLight) {
      setUseAutoLightColor(false);
      setNewCatColorLight(cat.colorLight);
    } else {
      setUseAutoLightColor(true);
      setNewCatColorLight(deriveLightColor(cat.color));
    }
  }

  function handleDeleteCategory(id: string) {
    setConfig((prev) => ({
      ...prev,
      customCategories: prev.customCategories.filter((c) => c.id !== id),
    }));
    if (editingCatId === id) {
      setEditingCatId(null);
      setNewCatLabel("");
      setNewCatPrefixes("");
      setNewCatColor("#2dd4bf");
      setNewCatColorLight("");
      setUseAutoLightColor(true);
    }
  }

  function handleQuickAddNamespace(prefix: string) {
    const label = prefix.charAt(0).toUpperCase() + prefix.slice(1);
    const color = PRESET_COLOR_SWATCHES[Math.floor(Math.random() * PRESET_COLOR_SWATCHES.length)];
    setEditingCatId(null);
    setNewCatLabel(label);
    setNewCatPrefixes(prefix);
    setNewCatColor(color);
    setUseAutoLightColor(true);
    setNewCatColorLight(deriveLightColor(color));
  }

  function handleAddTagOverride() {
    const tag = overrideTag.trim().toLowerCase();
    const target = overrideTarget.trim();
    if (!tag || !target) return;

    setConfig((prev) => ({
      ...prev,
      tagOverrides: {
        ...prev.tagOverrides,
        [tag]: target,
      },
    }));

    setOverrideTag("");
    setOverrideTarget("");
  }

  function handleRemoveTagOverride(tag: string) {
    setConfig((prev) => {
      const next = { ...prev.tagOverrides };
      delete next[tag];
      return { ...prev, tagOverrides: next };
    });
  }

  async function handleSave() {
    setSaving(true);
    setStatus(null);
    try {
      const res = await updateTagTaxonomy(config);
      onConfigUpdated?.(res.tagTaxonomy);
      setStatus("Taxonomy configuration saved successfully!");
      setTimeout(() => {
        setStatus(null);
      }, 3000);
    } catch (e) {
      setStatus(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="taxonomy-panel-container">
      {/* Live Preview Bar */}
      <div className="taxonomy-preview-card">
        <div className="preview-top-row">
          <span className="preview-label">Live Tag Preview:</span>
          <div className="preview-theme-toggle" role="group" aria-label="Preview theme mode">
            <button
              type="button"
              className={`preview-toggle-btn ${previewTheme === "both" ? "active" : ""}`}
              onClick={() => setPreviewTheme("both")}
            >
              Side-by-Side
            </button>
            <button
              type="button"
              className={`preview-toggle-btn ${previewTheme === "dark" ? "active" : ""}`}
              onClick={() => setPreviewTheme("dark")}
            >
              Dark Theme
            </button>
            <button
              type="button"
              className={`preview-toggle-btn ${previewTheme === "light" ? "active" : ""}`}
              onClick={() => setPreviewTheme("light")}
            >
              Light Theme
            </button>
          </div>
        </div>

        <div className={`preview-themes-wrap ${previewTheme === "both" ? "is-split" : ""}`}>
          {(previewTheme === "both" || previewTheme === "dark") && (
            <div className="preview-theme-pane dark-pane" data-theme="dark">
              <span className="theme-pane-tag">Dark Mode</span>
              <div className="preview-chips-row">
                <TagChip tag={previewInput || "species:cat-girl"} userConfig={config} size="md" />
                <TagChip tag="nsfw" userConfig={config} size="md" />
                <TagChip tag="rating:sfw" userConfig={config} size="md" />
                <TagChip tag="copyright:cyberpunk" userConfig={config} size="md" />
                <TagChip tag="adventurer" userConfig={config} size="md" />
              </div>
            </div>
          )}

          {(previewTheme === "both" || previewTheme === "light") && (
            <div className="preview-theme-pane light-pane" data-theme="light" data-theme-preview="light">
              <span className="theme-pane-tag">Light Mode</span>
              <div className="preview-chips-row">
                <TagChip tag={previewInput || "species:cat-girl"} userConfig={config} size="md" />
                <TagChip tag="nsfw" userConfig={config} size="md" />
                <TagChip tag="rating:sfw" userConfig={config} size="md" />
                <TagChip tag="copyright:cyberpunk" userConfig={config} size="md" />
                <TagChip tag="adventurer" userConfig={config} size="md" />
              </div>
            </div>
          )}
        </div>

        <div className="preview-input-row">
          <input
            type="text"
            className="preview-test-input"
            placeholder="Type any tag to test (e.g. species:dragon, faction:solar)..."
            value={previewInput}
            onChange={(e) => setPreviewInput(e.target.value)}
          />
        </div>
      </div>

      {/* Unmapped Namespaces Banner */}
      {unmappedNamespaces.length > 0 ? (
        <div className="unmapped-namespaces-banner">
          <div className="unmapped-banner-header">
            <Icon name="Sparkles" size={15} />
            <span>Discovered prefixes in your library without a custom category:</span>
          </div>
          <div className="unmapped-chips">
            {unmappedNamespaces.map((d) => (
              <button
                key={d.prefix}
                type="button"
                className="unmapped-prefix-chip"
                onClick={() => handleQuickAddNamespace(d.prefix)}
                title={`Create a category for "${d.prefix}:" (${d.count} characters use this)`}
              >
                + <strong>{d.prefix}:</strong> ({d.count})
              </button>
            ))}
          </div>
        </div>
      ) : null}

      {/* Built-in Categories Reference */}
      <div className="taxonomy-section">
        <h4 className="taxonomy-section-title">
          <Icon name="Layers" size={14} /> Built-in Categories
        </h4>
        <div className="category-cards-grid">
          {BUILT_IN_CATEGORIES.map((cat) => (
            <div key={cat.id} className="category-card built-in">
              <div className="category-card-header">
                <div className="category-title-wrap">
                  <div className="category-color-dots" title={`Dark: ${cat.color} | Light: ${cat.colorLight || cat.color}`}>
                    <span className="category-color-dot dark" style={{ backgroundColor: cat.color }} />
                    <span className="category-color-dot light" style={{ backgroundColor: cat.colorLight || cat.color }} />
                  </div>
                  <strong className="category-name">{cat.label}</strong>
                </div>
              </div>
              <p className="category-desc">{cat.description}</p>
              <div className="category-prefixes-wrap">
                {cat.prefixes.map((p) => (
                  <span key={p} className="prefix-badge" style={{ borderColor: `${cat.color}66`, color: cat.color }}>
                    {p.endsWith(":") ? p : `${p}:`}
                  </span>
                ))}
                {cat.id === "rating_nsfw" && (
                  <span className="prefix-badge" style={{ borderColor: `${cat.color}66`, color: cat.color }}>
                    nsfw, explicit, lewd, 18+ (values)
                  </span>
                )}
                {cat.id === "rating_sfw" && (
                  <span className="prefix-badge" style={{ borderColor: `${cat.color}66`, color: cat.color }}>
                    sfw, safe, general (values)
                  </span>
                )}
                {cat.prefixes.length === 0 ? <span className="prefix-badge neutral">Standalone tags</span> : null}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* User Custom Categories */}
      <div className="taxonomy-section">
        <h4 className="taxonomy-section-title">
          <Icon name="Sliders" size={14} /> Custom Categories &amp; Namespaces
        </h4>

        {config.customCategories.length > 0 ? (
          <div className="category-cards-grid" style={{ marginBottom: "1rem" }}>
            {config.customCategories.map((cat) => {
              const derivedLight = deriveLightColor(cat.color);
              const lightColor = cat.colorLight || derivedLight;
              return (
                <div key={cat.id} className="category-card custom">
                  <div className="category-card-header">
                    <div className="category-title-wrap">
                      <div className="category-color-dots" title={`Dark: ${cat.color} | Light: ${lightColor}`}>
                        <span className="category-color-dot dark" style={{ backgroundColor: cat.color }} />
                        <span className="category-color-dot light" style={{ backgroundColor: lightColor }} />
                      </div>
                      <strong className="category-name">{cat.label}</strong>
                    </div>
                    <div className="category-actions">
                      <button
                        type="button"
                        className="cat-action-btn"
                        onClick={() => handleEditCategory(cat)}
                        title="Edit category"
                      >
                        <Icon name="Pencil" size={12} />
                      </button>
                      <button
                        type="button"
                        className="cat-action-btn danger"
                        onClick={() => handleDeleteCategory(cat.id)}
                        title="Delete category"
                      >
                        <Icon name="Trash2" size={12} />
                      </button>
                    </div>
                  </div>
                  <div className="category-prefixes-wrap">
                    {cat.prefixes.map((p) => (
                      <span key={p} className="prefix-badge" style={{ borderColor: `${cat.color}66`, color: cat.color }}>
                        {p}:
                      </span>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <p className="empty-category-hint">
            No custom categories added yet. You can create custom prefixes (like <code>clan:</code>, <code>world:</code>, <code>faction:</code>) below.
          </p>
        )}

        {/* Add / Edit Category Form */}
        <div className="add-category-box">
          <h5>{editingCatId ? "Edit Custom Category" : "Add New Custom Category"}</h5>
          <div className="add-cat-row">
            <div className="form-group flex-1">
              <label>Category Label</label>
              <input
                type="text"
                placeholder="e.g. Faction, World, Clan…"
                value={newCatLabel}
                onChange={(e) => setNewCatLabel(e.target.value)}
              />
            </div>
            <div className="form-group flex-1">
              <label>Prefixes (comma separated)</label>
              <input
                type="text"
                placeholder="e.g. faction, clan, house"
                value={newCatPrefixes}
                onChange={(e) => setNewCatPrefixes(e.target.value)}
              />
            </div>
          </div>

          <div className="add-cat-row colors-row">
            <div className="form-group flex-1">
              <label>Dark Theme Color</label>
              <div className="color-picker-wrap">
                <input
                  type="color"
                  value={newCatColor}
                  onChange={(e) => {
                    setNewCatColor(e.target.value);
                    if (useAutoLightColor) {
                      setNewCatColorLight(deriveLightColor(e.target.value));
                    }
                  }}
                  className="color-input"
                  title="Dark theme base color"
                />
                <div className="preset-swatches">
                  {PRESET_COLOR_SWATCHES.slice(0, 7).map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`swatch-btn ${newCatColor === swatch ? "selected" : ""}`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => {
                        setNewCatColor(swatch);
                        if (useAutoLightColor) {
                          setNewCatColorLight(deriveLightColor(swatch));
                        }
                      }}
                      title={swatch}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="form-group flex-1">
              <div className="light-color-label-row">
                <label>Light Theme Color</label>
                <label className="auto-derive-checkbox-label">
                  <input
                    type="checkbox"
                    checked={useAutoLightColor}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setUseAutoLightColor(checked);
                      if (checked) {
                        setNewCatColorLight(deriveLightColor(newCatColor));
                      }
                    }}
                  />
                  <span>Auto-contrast</span>
                </label>
              </div>
              <div className="color-picker-wrap">
                <input
                  type="color"
                  value={effectiveLightColor}
                  onChange={(e) => {
                    setUseAutoLightColor(false);
                    setNewCatColorLight(e.target.value);
                  }}
                  className="color-input"
                  title={useAutoLightColor ? "Auto-derived from dark color" : "Custom light theme color"}
                />
                <div className="preset-swatches">
                  {PRESET_LIGHT_COLOR_SWATCHES.slice(0, 7).map((swatch) => (
                    <button
                      key={swatch}
                      type="button"
                      className={`swatch-btn ${effectiveLightColor === swatch ? "selected" : ""}`}
                      style={{ backgroundColor: swatch }}
                      onClick={() => {
                        setUseAutoLightColor(false);
                        setNewCatColorLight(swatch);
                      }}
                      title={swatch}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="add-cat-actions">
            {editingCatId ? (
              <button
                type="button"
                className="secondary-btn"
                onClick={() => {
                  setEditingCatId(null);
                  setNewCatLabel("");
                  setNewCatPrefixes("");
                  setNewCatColor("#2dd4bf");
                  setNewCatColorLight("");
                  setUseAutoLightColor(true);
                }}
              >
                Cancel Edit
              </button>
            ) : null}
            <button
              type="button"
              className="primary-btn"
              onClick={handleAddOrUpdateCategory}
              disabled={!newCatLabel.trim()}
            >
              <Icon name="Plus" size={13} /> {editingCatId ? "Update Category" : "Add Category"}
            </button>
          </div>
        </div>
      </div>

      {/* Specific Tag Overrides */}
      <div className="taxonomy-section">
        <h4 className="taxonomy-section-title">
          <Icon name="Bookmark" size={14} /> Specific Tag Overrides
        </h4>
        <p className="section-subtitle">
          Map individual standalone tags directly to a specific category ID or Hex color.
        </p>

        {Object.keys(config.tagOverrides).length > 0 ? (
          <div className="tag-overrides-list">
            {Object.entries(config.tagOverrides).map(([tag, target]) => (
              <div key={tag} className="tag-override-chip">
                <span className="override-tag-name">{tag}</span>
                <span className="override-arrow">→</span>
                <span className="override-target-val">{target}</span>
                <button
                  type="button"
                  className="override-remove-btn"
                  onClick={() => handleRemoveTagOverride(tag)}
                  title="Remove override"
                >
                  ✕
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className="add-override-row">
          <input
            type="text"
            placeholder="Tag name (e.g. gore, protagonist)…"
            value={overrideTag}
            onChange={(e) => setOverrideTag(e.target.value)}
            className="override-input"
          />
          <input
            type="text"
            placeholder="Category (e.g. rating_nsfw) or Hex (#ff0077)…"
            value={overrideTarget}
            onChange={(e) => setOverrideTarget(e.target.value)}
            className="override-input"
          />
          <button
            type="button"
            className="secondary-btn"
            onClick={handleAddTagOverride}
            disabled={!overrideTag.trim() || !overrideTarget.trim()}
          >
            Add Override
          </button>
        </div>
      </div>

      <div className="taxonomy-save-bar">
        {status ? <span className="modal-status-text">{status}</span> : <span />}
        <button type="button" className="primary" onClick={handleSave} disabled={saving}>
          {saving ? "Saving…" : "Save Taxonomy Settings"}
        </button>
      </div>
    </div>
  );
}

export type TagTaxonomyModalProps = {
  open: boolean;
  onClose: () => void;
  allLibraryTags: string[];
  currentConfig: TagTaxonomyConfig | null;
  onConfigUpdated: (config: TagTaxonomyConfig) => void;
};

export function TagTaxonomyModal({
  open,
  onClose,
  allLibraryTags,
  currentConfig,
  onConfigUpdated,
}: TagTaxonomyModalProps) {
  if (!open) return null;

  return (
    <div
      className="modal-backdrop"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <section className="modal tag-taxonomy-modal">
        <header className="modal-header">
          <div className="taxonomy-header-title">
            <Icon name="Tag" size={20} />
            <div>
              <h2>Tag Taxonomy &amp; Color Settings</h2>
              <p className="taxonomy-subtitle">
                Customize category namespaces (e.g. <code>species:</code>, <code>copyright:</code>), colors, and tag rules.
              </p>
            </div>
          </div>
          <button type="button" className="diff-close-btn" onClick={onClose} title="Close">
            <Icon name="X" size={16} />
          </button>
        </header>

        <div className="taxonomy-modal-body">
          <TagTaxonomyPanel
            allLibraryTags={allLibraryTags}
            currentConfig={currentConfig}
            onConfigUpdated={(cfg) => {
              onConfigUpdated(cfg);
              setTimeout(() => {
                onClose();
              }, 400);
            }}
          />
        </div>
      </section>
    </div>
  );
}
