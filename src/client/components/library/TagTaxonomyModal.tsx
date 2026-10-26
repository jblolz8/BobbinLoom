import { useEffect, useMemo, useState } from "react";
import type { TagTaxonomyConfig, CustomCategoryConfig } from "../../../schemas";
import {
  BUILT_IN_CATEGORIES,
  deriveLightColor,
  discoverLibraryNamespaces,
} from "../../../engine/tagTaxonomy";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  FormGrid,
  Header,
  Modal,
  Separator,
  Stack,
  StatusMessage,
  Tabs,
  TagChip,
  Text,
  TextInput,
  type TabItem,
} from "../base";
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

type PreviewThemeMode = "both" | "dark" | "light";

const PREVIEW_THEME_TABS: TabItem<PreviewThemeMode>[] = [
  { id: "both", label: "Side-by-Side" },
  { id: "dark", label: "Dark Theme" },
  { id: "light", label: "Light Theme" },
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
  const [previewTheme, setPreviewTheme] = useState<PreviewThemeMode>("both");

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
    return discoveredNamespaces.filter(
      (d) => !allKnownPrefixes.has(d.prefix.toLowerCase()),
    );
  }, [discoveredNamespaces, config.customCategories]);

  const effectiveLightColor = useMemo(() => {
    return useAutoLightColor
      ? deriveLightColor(newCatColor)
      : newCatColorLight || deriveLightColor(newCatColor);
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
      colorLight: useAutoLightColor ? undefined : newCatColorLight || undefined,
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
    const color =
      PRESET_COLOR_SWATCHES[
        Math.floor(Math.random() * PRESET_COLOR_SWATCHES.length)
      ];
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
    <Stack direction="column" align="stretch" gap="md">
      {/* Live Preview Card */}
      <Card variant="elevated" padding="sm">
        <Stack direction="column" align="stretch" gap="xs">
          <Stack
            direction="row"
            align="center"
            justify="between"
            gap="sm"
            wrap
          >
            <Text as="strong" size="xs" weight="semibold" tone="secondary">
              Live Tag Preview:
            </Text>
            <Tabs<PreviewThemeMode>
              tabs={PREVIEW_THEME_TABS}
              activeTab={previewTheme}
              onChange={setPreviewTheme}
              variant="segmented"
              size="sm"
              ariaLabel="Preview theme mode"
            />
          </Stack>

          <FormGrid cols={previewTheme === "both" ? 2 : 1} gap="xs">
            {(previewTheme === "both" || previewTheme === "dark") && (
              <Card
                variant="panel"
                padding="xs"
                data-theme="dark"
                style={{
                  background: "#0b0f19",
                  borderColor: "#1e293b",
                }}
              >
                <Stack direction="column" align="stretch" gap="xs">
                  <Text
                    as="span"
                    variant="overline"
                    style={{ color: "#94a3b8" }}
                  >
                    Dark Mode
                  </Text>
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <TagChip
                      tag={previewInput || "species:cat-girl"}
                      userConfig={config}
                      size="md"
                    />
                    <TagChip tag="nsfw" userConfig={config} size="md" />
                    <TagChip tag="rating:sfw" userConfig={config} size="md" />
                    <TagChip
                      tag="copyright:cyberpunk"
                      userConfig={config}
                      size="md"
                    />
                    <TagChip tag="adventurer" userConfig={config} size="md" />
                  </Stack>
                </Stack>
              </Card>
            )}

            {(previewTheme === "both" || previewTheme === "light") && (
              <Card
                variant="panel"
                padding="xs"
                data-theme="light"
                data-theme-preview="light"
                style={{
                  background: "#f8fafc",
                  borderColor: "#cbd5e1",
                }}
              >
                <Stack direction="column" align="stretch" gap="xs">
                  <Text
                    as="span"
                    variant="overline"
                    style={{ color: "#475569" }}
                  >
                    Light Mode
                  </Text>
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <TagChip
                      tag={previewInput || "species:cat-girl"}
                      userConfig={config}
                      size="md"
                    />
                    <TagChip tag="nsfw" userConfig={config} size="md" />
                    <TagChip tag="rating:sfw" userConfig={config} size="md" />
                    <TagChip
                      tag="copyright:cyberpunk"
                      userConfig={config}
                      size="md"
                    />
                    <TagChip tag="adventurer" userConfig={config} size="md" />
                  </Stack>
                </Stack>
              </Card>
            )}
          </FormGrid>

          <TextInput
            size="sm"
            fullWidth
            placeholder="Type any tag to test (e.g. species:dragon, faction:solar)..."
            value={previewInput}
            onChange={(e) => setPreviewInput(e.target.value)}
            aria-label="Test tag input"
          />
        </Stack>
      </Card>

      {/* Unmapped Namespaces Banner */}
      {unmappedNamespaces.length > 0 ? (
        <StatusMessage variant="banner" tone="neutral" icon="Sparkles">
          <Stack direction="column" align="start" gap="xs">
            <Text as="strong" size="xs" weight="semibold">
              Discovered prefixes in your library without a custom category:
            </Text>
            <Stack direction="row" align="center" gap="xs" wrap>
              {unmappedNamespaces.map((d) => (
                <Button
                  key={d.prefix}
                  type="button"
                  variant="outline"
                  size="xs"
                  onClick={() => handleQuickAddNamespace(d.prefix)}
                  title={`Create a category for "${d.prefix}:" (${d.count} characters use this)`}
                >
                  + {d.prefix}: ({d.count})
                </Button>
              ))}
            </Stack>
          </Stack>
        </StatusMessage>
      ) : null}

      {/* Built-in Categories Reference */}
      <Card variant="elevated" padding="sm">
        <Stack direction="column" align="stretch" gap="sm">
          <Header
            variant="section"
            icon="Layers"
            title="Built-in Categories"
          />
          <FormGrid cols={3} gap="xs">
            {BUILT_IN_CATEGORIES.map((cat) => (
              <Card
                key={cat.id}
                variant="panel"
                padding="xs"
                style={{ borderLeft: "3px solid var(--text-muted)" }}
              >
                <Stack direction="column" align="stretch" gap="2xs">
                  <Stack direction="row" align="center" gap="xs">
                    <Stack
                      direction="row"
                      align="center"
                      gap="2xs"
                      title={`Dark: ${cat.color} | Light: ${cat.colorLight || cat.color}`}
                    >
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: cat.color,
                          border: "1px solid rgba(0, 0, 0, 0.25)",
                          flexShrink: 0,
                        }}
                      />
                      <span
                        style={{
                          width: 8,
                          height: 8,
                          borderRadius: "50%",
                          backgroundColor: cat.colorLight || cat.color,
                          border: "1px solid rgba(255, 255, 255, 0.35)",
                          flexShrink: 0,
                        }}
                      />
                    </Stack>
                    <Text
                      as="strong"
                      size="xs"
                      weight="semibold"
                      tone="primary"
                    >
                      {cat.label}
                    </Text>
                  </Stack>

                  <Text as="p" variant="caption" tone="secondary">
                    {cat.description}
                  </Text>

                  <Stack direction="row" align="center" gap="2xs" wrap>
                    {cat.prefixes.map((p) => (
                      <Badge
                        key={p}
                        variant="outline"
                        size="xs"
                        style={{
                          borderColor: `${cat.color}66`,
                          color: cat.color,
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        {p.endsWith(":") ? p : `${p}:`}
                      </Badge>
                    ))}
                    {cat.id === "rating_nsfw" && (
                      <Badge
                        variant="outline"
                        size="xs"
                        style={{
                          borderColor: `${cat.color}66`,
                          color: cat.color,
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        nsfw, explicit, lewd, 18+ (values)
                      </Badge>
                    )}
                    {cat.id === "rating_sfw" && (
                      <Badge
                        variant="outline"
                        size="xs"
                        style={{
                          borderColor: `${cat.color}66`,
                          color: cat.color,
                          fontFamily: "var(--font-mono, monospace)",
                        }}
                      >
                        sfw, safe, general (values)
                      </Badge>
                    )}
                    {cat.prefixes.length === 0 ? (
                      <Badge variant="neutral" size="xs">
                        Standalone tags
                      </Badge>
                    ) : null}
                  </Stack>
                </Stack>
              </Card>
            ))}
          </FormGrid>
        </Stack>
      </Card>

      {/* User Custom Categories */}
      <Card variant="elevated" padding="sm">
        <Stack direction="column" align="stretch" gap="sm">
          <Header
            variant="section"
            icon="Sliders"
            title="Custom Categories & Namespaces"
          />

          {config.customCategories.length > 0 ? (
            <FormGrid cols={3} gap="xs">
              {config.customCategories.map((cat) => {
                const derivedLight = deriveLightColor(cat.color);
                const lightColor = cat.colorLight || derivedLight;
                return (
                  <Card
                    key={cat.id}
                    variant="panel"
                    padding="xs"
                    style={{
                      borderLeft:
                        "3px solid var(--accent-highlight, var(--accent-base))",
                    }}
                  >
                    <Stack direction="column" align="stretch" gap="xs">
                      <Stack
                        direction="row"
                        align="center"
                        justify="between"
                        gap="xs"
                      >
                        <Stack direction="row" align="center" gap="xs">
                          <Stack
                            direction="row"
                            align="center"
                            gap="2xs"
                            title={`Dark: ${cat.color} | Light: ${lightColor}`}
                          >
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                backgroundColor: cat.color,
                                border: "1px solid rgba(0, 0, 0, 0.25)",
                                flexShrink: 0,
                              }}
                            />
                            <span
                              style={{
                                width: 8,
                                height: 8,
                                borderRadius: "50%",
                                backgroundColor: lightColor,
                                border: "1px solid rgba(255, 255, 255, 0.35)",
                                flexShrink: 0,
                              }}
                            />
                          </Stack>
                          <Text
                            as="strong"
                            size="xs"
                            weight="semibold"
                            tone="primary"
                          >
                            {cat.label}
                          </Text>
                        </Stack>
                        <Stack direction="row" align="center" gap="2xs">
                          <Button
                            type="button"
                            variant="ghost"
                            size="xs"
                            iconOnly
                            leftIcon="Pencil"
                            onClick={() => handleEditCategory(cat)}
                            title="Edit category"
                            aria-label={`Edit ${cat.label}`}
                          />
                          <Button
                            type="button"
                            variant="danger"
                            size="xs"
                            iconOnly
                            leftIcon="Trash2"
                            onClick={() => handleDeleteCategory(cat.id)}
                            title="Delete category"
                            aria-label={`Delete ${cat.label}`}
                          />
                        </Stack>
                      </Stack>

                      <Stack direction="row" align="center" gap="2xs" wrap>
                        {cat.prefixes.map((p) => (
                          <Badge
                            key={p}
                            variant="outline"
                            size="xs"
                            style={{
                              borderColor: `${cat.color}66`,
                              color: cat.color,
                              fontFamily: "var(--font-mono, monospace)",
                            }}
                          >
                            {p}:
                          </Badge>
                        ))}
                      </Stack>
                    </Stack>
                  </Card>
                );
              })}
            </FormGrid>
          ) : (
            <Text as="p" size="xs" tone="muted">
              No custom categories added yet. You can create custom prefixes
              (like <Text as="code" mono>clan:</Text>,{" "}
              <Text as="code" mono>world:</Text>,{" "}
              <Text as="code" mono>faction:</Text>) below.
            </Text>
          )}

          {/* Add / Edit Category Form */}
          <Card variant="panel" padding="sm">
            <Stack direction="column" align="stretch" gap="sm">
              <Text as="strong" size="xs" weight="semibold" tone="primary">
                {editingCatId
                  ? "Edit Custom Category"
                  : "Add New Custom Category"}
              </Text>

              <FormGrid cols={2} gap="sm">
                <TextInput
                  label="Category Label"
                  size="sm"
                  fullWidth
                  placeholder="e.g. Faction, World, Clan…"
                  value={newCatLabel}
                  onChange={(e) => setNewCatLabel(e.target.value)}
                />
                <TextInput
                  label="Prefixes (comma separated)"
                  size="sm"
                  fullWidth
                  placeholder="e.g. faction, clan, house"
                  value={newCatPrefixes}
                  onChange={(e) => setNewCatPrefixes(e.target.value)}
                />
              </FormGrid>

              <FormGrid cols={2} gap="sm">
                <Stack direction="column" align="stretch" gap="2xs">
                  <Text as="span" size="xs" weight="medium" tone="secondary">
                    Dark Theme Color
                  </Text>
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <input
                      type="color"
                      value={newCatColor}
                      onChange={(e) => {
                        setNewCatColor(e.target.value);
                        if (useAutoLightColor) {
                          setNewCatColorLight(deriveLightColor(e.target.value));
                        }
                      }}
                      title="Dark theme base color"
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        border: "1px solid var(--border-light)",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: "transparent",
                      }}
                    />
                    <Stack direction="row" align="center" gap="2xs" wrap>
                      {PRESET_COLOR_SWATCHES.slice(0, 7).map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          className="base-btn"
                          style={{
                            width: 18,
                            height: 18,
                            minHeight: 18,
                            padding: 0,
                            borderRadius: "50%",
                            backgroundColor: swatch,
                            border: "1px solid var(--border-light)",
                            boxShadow:
                              newCatColor === swatch
                                ? "0 0 0 2px var(--text-primary)"
                                : undefined,
                          }}
                          onClick={() => {
                            setNewCatColor(swatch);
                            if (useAutoLightColor) {
                              setNewCatColorLight(deriveLightColor(swatch));
                            }
                          }}
                          title={swatch}
                          aria-label={`Select dark color ${swatch}`}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Stack>

                <Stack direction="column" align="stretch" gap="2xs">
                  <Stack
                    direction="row"
                    align="center"
                    justify="between"
                    gap="xs"
                    wrap
                  >
                    <Text as="span" size="xs" weight="medium" tone="secondary">
                      Light Theme Color
                    </Text>
                    <Checkbox
                      label="Auto-contrast"
                      checked={useAutoLightColor}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setUseAutoLightColor(checked);
                        if (checked) {
                          setNewCatColorLight(deriveLightColor(newCatColor));
                        }
                      }}
                    />
                  </Stack>
                  <Stack direction="row" align="center" gap="xs" wrap>
                    <input
                      type="color"
                      value={effectiveLightColor}
                      onChange={(e) => {
                        setUseAutoLightColor(false);
                        setNewCatColorLight(e.target.value);
                      }}
                      title={
                        useAutoLightColor
                          ? "Auto-derived from dark color"
                          : "Custom light theme color"
                      }
                      style={{
                        width: 28,
                        height: 28,
                        padding: 0,
                        border: "1px solid var(--border-light)",
                        borderRadius: 6,
                        cursor: "pointer",
                        background: "transparent",
                      }}
                    />
                    <Stack direction="row" align="center" gap="2xs" wrap>
                      {PRESET_LIGHT_COLOR_SWATCHES.slice(0, 7).map((swatch) => (
                        <button
                          key={swatch}
                          type="button"
                          className="base-btn"
                          style={{
                            width: 18,
                            height: 18,
                            minHeight: 18,
                            padding: 0,
                            borderRadius: "50%",
                            backgroundColor: swatch,
                            border: "1px solid var(--border-light)",
                            boxShadow:
                              effectiveLightColor === swatch
                                ? "0 0 0 2px var(--text-primary)"
                                : undefined,
                          }}
                          onClick={() => {
                            setUseAutoLightColor(false);
                            setNewCatColorLight(swatch);
                          }}
                          title={swatch}
                          aria-label={`Select light color ${swatch}`}
                        />
                      ))}
                    </Stack>
                  </Stack>
                </Stack>
              </FormGrid>

              <Stack direction="row" align="center" justify="end" gap="xs" wrap>
                {editingCatId ? (
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
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
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="primary"
                  size="sm"
                  leftIcon="Plus"
                  onClick={handleAddOrUpdateCategory}
                  disabled={!newCatLabel.trim()}
                >
                  {editingCatId ? "Update Category" : "Add Category"}
                </Button>
              </Stack>
            </Stack>
          </Card>
        </Stack>
      </Card>

      {/* Specific Tag Overrides */}
      <Card variant="elevated" padding="sm">
        <Stack direction="column" align="stretch" gap="sm">
          <Header
            variant="section"
            icon="Bookmark"
            title="Specific Tag Overrides"
            subtitle="Map individual standalone tags directly to a specific category ID or Hex color."
          />

          {Object.keys(config.tagOverrides).length > 0 ? (
            <Stack direction="row" align="center" gap="xs" wrap>
              {Object.entries(config.tagOverrides).map(([tag, target]) => (
                <Card key={tag} variant="panel" padding="xs">
                  <Stack direction="row" align="center" gap="2xs">
                    <Text as="strong" size="xs" weight="semibold" tone="accent">
                      {tag}
                    </Text>
                    <Text as="span" size="xs" tone="muted">
                      →
                    </Text>
                    <Text as="span" size="xs" tone="primary">
                      {target}
                    </Text>
                    <Button
                      type="button"
                      variant="ghost"
                      size="xs"
                      iconOnly
                      leftIcon="X"
                      onClick={() => handleRemoveTagOverride(tag)}
                      title="Remove override"
                      aria-label={`Remove override for ${tag}`}
                    />
                  </Stack>
                </Card>
              ))}
            </Stack>
          ) : null}

          <Stack
            direction="row"
            align="center"
            gap="xs"
            stackBelow="sm"
            fullWidth
          >
            <TextInput
              size="sm"
              fullWidth
              placeholder="Tag name (e.g. gore, protagonist)…"
              value={overrideTag}
              onChange={(e) => setOverrideTag(e.target.value)}
              aria-label="Override tag name"
            />
            <TextInput
              size="sm"
              fullWidth
              placeholder="Category (e.g. rating_nsfw) or Hex (#ff0077)…"
              value={overrideTarget}
              onChange={(e) => setOverrideTarget(e.target.value)}
              aria-label="Override target category or hex"
            />
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={handleAddTagOverride}
              disabled={!overrideTag.trim() || !overrideTarget.trim()}
            >
              Add Override
            </Button>
          </Stack>
        </Stack>
      </Card>

      <Separator spacing="none" />

      <Stack direction="row" align="center" justify="between" gap="sm" wrap>
        {status ? (
          <StatusMessage variant="inline" tone="ok">
            {status}
          </StatusMessage>
        ) : (
          <span />
        )}
        <Button
          type="button"
          variant="primary"
          size="sm"
          onClick={handleSave}
          disabled={saving}
          isLoading={saving}
        >
          {saving ? "Saving…" : "Save Taxonomy Settings"}
        </Button>
      </Stack>
    </Stack>
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
  return (
    <Modal open={open} onClose={onClose} size="lg" fullScreenMobile>
      <Header
        variant="modal"
        icon="Tag"
        title="Tag Taxonomy & Color Settings"
        subtitle="Customize category namespaces (e.g. species:, copyright:), colors, and tag rules."
        bordered
        actions={
          <Button
            type="button"
            variant="ghost"
            size="sm"
            iconOnly
            leftIcon="X"
            onClick={onClose}
            title="Close"
            aria-label="Close"
          />
        }
      />

      <Modal.Body>
        <Modal.Content>
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
        </Modal.Content>
      </Modal.Body>
    </Modal>
  );
}
