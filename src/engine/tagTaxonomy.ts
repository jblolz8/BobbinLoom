/**
 * Tag Taxonomy & Color Engine
 * Resolves raw tag strings into categorized, styled tag objects,
 * supports user-defined custom prefixes and tag overrides,
 * and groups tag collections for library navigation.
 */

export interface TagColors {
  text: string;
  bg: string;
  border: string;
  glow?: string;
}

export interface TagCategoryDefinition {
  id: string;
  label: string;
  prefixes: string[];
  color: string; // Base Dark Hex/CSS color
  colorLight?: string; // Calibrated Light Theme Hex/CSS color
  colors: TagColors; // Dark TagColors
  colorsLight: TagColors; // Light TagColors
  order: number;
  description?: string;
  isBuiltIn?: boolean;
}

export interface CustomCategoryConfig {
  id: string;
  label: string;
  prefixes: string[];
  color: string;
  colorLight?: string;
  description?: string;
}

export interface TagTaxonomyConfig {
  customCategories: CustomCategoryConfig[];
  tagOverrides: Record<string, string>; // rawTag -> categoryId or custom hex color
}

export interface TagStyle {
  raw: string;
  namespace?: string;
  value: string;
  displayLabel: string;
  categoryId: string;
  categoryLabel: string;
  colors: TagColors;
  colorsLight: TagColors;
  colorsDark?: TagColors;
}

/** Convert a hex color (#rrggbb or #rgb) to RGBA with alpha */
export function hexToRgba(hex: string, alpha: number): string {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) {
    return `rgba(148, 163, 184, ${alpha})`;
  }
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Convert a hex color string to HSL { h: 0-360, s: 0-100, l: 0-100 } */
export function hexToHsl(hex: string): { h: number; s: number; l: number } {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) {
    return { h: 215, s: 16, l: 47 };
  }
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  let s = 0;
  const l = (max + min) / 2;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }

  return {
    h: Math.round(h * 360),
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

export function hslToHex(h: number, s: number, l: number): string {
  s /= 100;
  l /= 100;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => {
    const k = (n + h / 30) % 12;
    const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
    return Math.round(255 * color)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${f(0)}${f(8)}${f(4)}`;
}

/**
 * Derives a high-contrast, WCAG-legible light theme color from a dark base color.
 * Calibrates lightness to 30-35% for strong legibility against white/light surfaces,
 * maintaining vivid saturation.
 */
export function deriveLightColor(baseHex: string): string {
  const { h, s, l } = hexToHsl(baseHex);
  const newS = s < 15 ? s : Math.max(s, 65);
  const newL = Math.min(l, 34);
  return hslToHex(h, newS, newL);
}

/** Generate a complete TagColors set from a base hex color */
export function deriveTagColors(baseHex: string, isLight: boolean = false): TagColors {
  if (isLight) {
    return {
      text: baseHex,
      bg: hexToRgba(baseHex, 0.10),
      border: hexToRgba(baseHex, 0.32),
      glow: hexToRgba(baseHex, 0.20),
    };
  }
  return {
    text: baseHex,
    bg: hexToRgba(baseHex, 0.15),
    border: hexToRgba(baseHex, 0.45),
    glow: hexToRgba(baseHex, 0.25),
  };
}

export const BUILT_IN_CATEGORIES: TagCategoryDefinition[] = [
  {
    id: "rating_nsfw",
    label: "Rating: NSFW",
    prefixes: ["rating"],
    color: "#f87171",
    colorLight: "#dc2626",
    colors: {
      text: "#f87171",
      bg: "rgba(239, 68, 68, 0.15)",
      border: "rgba(239, 68, 68, 0.45)",
      glow: "rgba(239, 68, 68, 0.25)",
    },
    colorsLight: {
      text: "#dc2626",
      bg: "rgba(220, 38, 38, 0.10)",
      border: "rgba(220, 38, 38, 0.32)",
      glow: "rgba(220, 38, 38, 0.20)",
    },
    order: 10,
    isBuiltIn: true,
    description: "Adult, explicit, or mature content tags (e.g. rating:nsfw, rating:explicit, rating:lewd, or standalone nsfw)",
  },
  {
    id: "rating_sfw",
    label: "Rating: SFW",
    prefixes: ["rating"],
    color: "#4ade80",
    colorLight: "#16a34a",
    colors: {
      text: "#4ade80",
      bg: "rgba(34, 197, 94, 0.15)",
      border: "rgba(34, 197, 94, 0.45)",
      glow: "rgba(34, 197, 94, 0.25)",
    },
    colorsLight: {
      text: "#16a34a",
      bg: "rgba(22, 163, 74, 0.10)",
      border: "rgba(22, 163, 74, 0.32)",
      glow: "rgba(22, 163, 74, 0.20)",
    },
    order: 20,
    isBuiltIn: true,
    description: "Safe for work or general audience tags (e.g. rating:sfw, rating:safe, rating:general, or standalone sfw)",
  },
  {
    id: "copyright",
    label: "Copyright & Franchise",
    prefixes: ["copyright", "franchise", "series", "origin", "fandom", "universe", "anime", "game", "novel"],
    color: "#c084fc",
    colorLight: "#7c3aed",
    colors: {
      text: "#c084fc",
      bg: "rgba(168, 85, 247, 0.15)",
      border: "rgba(168, 85, 247, 0.45)",
      glow: "rgba(168, 85, 247, 0.25)",
    },
    colorsLight: {
      text: "#7c3aed",
      bg: "rgba(124, 58, 237, 0.10)",
      border: "rgba(124, 58, 237, 0.32)",
      glow: "rgba(124, 58, 237, 0.20)",
    },
    order: 30,
    isBuiltIn: true,
    description: "Intellectual properties, shows, games, and universes",
  },
  {
    id: "character",
    label: "Character & Persona",
    prefixes: ["character", "char", "persona", "who"],
    color: "#60a5fa",
    colorLight: "#2563eb",
    colors: {
      text: "#60a5fa",
      bg: "rgba(59, 130, 246, 0.15)",
      border: "rgba(59, 130, 246, 0.45)",
      glow: "rgba(59, 130, 246, 0.25)",
    },
    colorsLight: {
      text: "#2563eb",
      bg: "rgba(37, 99, 235, 0.10)",
      border: "rgba(37, 99, 235, 0.32)",
      glow: "rgba(37, 99, 235, 0.20)",
    },
    order: 40,
    isBuiltIn: true,
    description: "Specific named character identities",
  },
  {
    id: "species",
    label: "Species & Race",
    prefixes: ["species", "race", "monster", "creature", "beast", "subspecies"],
    color: "#22d3ee",
    colorLight: "#0891b2",
    colors: {
      text: "#22d3ee",
      bg: "rgba(6, 182, 212, 0.15)",
      border: "rgba(6, 182, 212, 0.45)",
      glow: "rgba(6, 182, 212, 0.25)",
    },
    colorsLight: {
      text: "#0891b2",
      bg: "rgba(8, 145, 178, 0.10)",
      border: "rgba(8, 145, 178, 0.32)",
      glow: "rgba(8, 145, 178, 0.20)",
    },
    order: 50,
    isBuiltIn: true,
    description: "Creature types, fantasy races, or biological traits",
  },
  {
    id: "artist",
    label: "Artist & Creator",
    prefixes: ["artist", "creator", "author", "illustrator", "circle"],
    color: "#fbbf24",
    colorLight: "#d97706",
    colors: {
      text: "#fbbf24",
      bg: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.45)",
      glow: "rgba(245, 158, 11, 0.25)",
    },
    colorsLight: {
      text: "#d97706",
      bg: "rgba(217, 119, 6, 0.10)",
      border: "rgba(217, 119, 6, 0.32)",
      glow: "rgba(217, 119, 6, 0.20)",
    },
    order: 60,
    isBuiltIn: true,
    description: "Card creators, artists, and illustrators",
  },
  {
    id: "theme",
    label: "Theme & Class",
    prefixes: ["theme", "class", "role", "element", "genre", "setting", "job", "archetype", "style", "magic"],
    color: "#facc15",
    colorLight: "#b45309",
    colors: {
      text: "#facc15",
      bg: "rgba(234, 179, 8, 0.15)",
      border: "rgba(234, 179, 8, 0.45)",
      glow: "rgba(234, 179, 8, 0.25)",
    },
    colorsLight: {
      text: "#b45309",
      bg: "rgba(180, 83, 9, 0.10)",
      border: "rgba(180, 83, 9, 0.32)",
      glow: "rgba(180, 83, 9, 0.20)",
    },
    order: 70,
    isBuiltIn: true,
    description: "RPG classes, elemental affinities, archetypes, and settings",
  },
  {
    id: "meta",
    label: "Meta & System",
    prefixes: ["meta", "source", "status", "version", "bl", "ccv2", "format"],
    color: "#94a3b8",
    colorLight: "#475569",
    colors: {
      text: "#94a3b8",
      bg: "rgba(148, 163, 184, 0.12)",
      border: "rgba(148, 163, 184, 0.35)",
      glow: "rgba(148, 163, 184, 0.2)",
    },
    colorsLight: {
      text: "#475569",
      bg: "rgba(71, 85, 105, 0.09)",
      border: "rgba(71, 85, 105, 0.28)",
      glow: "rgba(71, 85, 105, 0.18)",
    },
    order: 80,
    isBuiltIn: true,
    description: "Technical metadata and system tags",
  },
  {
    id: "general",
    label: "General Tags",
    prefixes: [],
    color: "#cbd5e1",
    colorLight: "#334155",
    colors: {
      text: "#cbd5e1",
      bg: "rgba(30, 41, 59, 0.65)",
      border: "rgba(51, 65, 85, 0.8)",
      glow: "rgba(148, 163, 184, 0.15)",
    },
    colorsLight: {
      text: "#334155",
      bg: "rgba(241, 245, 249, 0.9)",
      border: "rgba(203, 213, 225, 0.9)",
      glow: "rgba(51, 65, 85, 0.15)",
    },
    order: 999,
    isBuiltIn: true,
    description: "Standard descriptive traits and attributes",
  },
];

const KNOWN_NSFW_STANDALONE = new Set([
  "nsfw",
  "explicit",
  "questionable",
  "lewd",
  "mature",
  "18+",
  "r18",
  "r-18",
  "ecchi",
  "hentai",
  "gore",
  "erotic",
]);

const KNOWN_SFW_STANDALONE = new Set([
  "sfw",
  "safe",
  "general_audience",
  "family_friendly",
]);

/** Normalize tag for lookup and comparison */
export function cleanTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Resolves a raw tag into its full presentation style, namespace, category, and colors.
 * Supports themeMode ("dark" | "light") to return theme-specific active colors,
 * while always exposing both colorsDark and colorsLight on TagStyle.
 */
export function resolveTagStyle(
  rawTag: string,
  userConfig?: TagTaxonomyConfig | null,
  themeMode?: "dark" | "light"
): TagStyle {
  const norm = cleanTag(rawTag);
  const isLight = themeMode === "light";

  const makeTagStyle = (
    value: string,
    categoryId: string,
    categoryLabel: string,
    colorsDark: TagColors,
    colorsLight: TagColors,
    namespace?: string
  ): TagStyle => ({
    raw: norm,
    namespace,
    value,
    displayLabel: norm,
    categoryId,
    categoryLabel,
    colors: isLight ? colorsLight : colorsDark,
    colorsLight,
    colorsDark,
  });

  if (!norm) {
    const gen = BUILT_IN_CATEGORIES.find((c) => c.id === "general")!;
    return {
      raw: rawTag,
      value: "",
      displayLabel: "",
      categoryId: gen.id,
      categoryLabel: gen.label,
      colors: isLight ? gen.colorsLight : gen.colors,
      colorsLight: gen.colorsLight,
      colorsDark: gen.colors,
    };
  }

  // 1. Check user tag overrides first
  if (userConfig?.tagOverrides && userConfig.tagOverrides[norm]) {
    const override = userConfig.tagOverrides[norm];
    const colonIdx = norm.indexOf(":");
    const namespace = colonIdx > 0 ? norm.slice(0, colonIdx) : undefined;
    const value = colonIdx > 0 ? norm.slice(colonIdx + 1) : norm;

    // Can be a categoryId or a hex color
    if (override.startsWith("#")) {
      const darkColors = deriveTagColors(override, false);
      const lightHex = deriveLightColor(override);
      const lightColors = deriveTagColors(lightHex, true);
      return makeTagStyle(value, "custom_override", "Custom", darkColors, lightColors, namespace);
    }

    // Match an existing category
    const cat =
      userConfig.customCategories?.find((c) => c.id === override) ??
      BUILT_IN_CATEGORIES.find((c) => c.id === override);
    if (cat) {
      let darkColors: TagColors;
      let lightColors: TagColors;
      if ("colorsLight" in cat && cat.colorsLight) {
        darkColors = (cat as TagCategoryDefinition).colors;
        lightColors = (cat as TagCategoryDefinition).colorsLight;
      } else {
        const customCat = cat as CustomCategoryConfig;
        darkColors = deriveTagColors(customCat.color, false);
        const lightHex = customCat.colorLight || deriveLightColor(customCat.color);
        lightColors = deriveTagColors(lightHex, true);
      }
      return makeTagStyle(value, cat.id, cat.label, darkColors, lightColors, namespace);
    }
  }

  // 2. Rating tags (namespaced "rating:*" or standalone well-known ratings)
  if (norm.startsWith("rating:")) {
    const value = norm.slice(7);
    const isNsfw =
      KNOWN_NSFW_STANDALONE.has(value) ||
      value.startsWith("18") ||
      value.startsWith("r18") ||
      value.startsWith("r-18") ||
      value.includes("nsfw") ||
      value.includes("explicit") ||
      value.includes("lewd") ||
      value.includes("mature");

    const cat = BUILT_IN_CATEGORIES.find((c) => c.id === (isNsfw ? "rating_nsfw" : "rating_sfw"))!;
    return makeTagStyle(value, cat.id, cat.label, cat.colors, cat.colorsLight, "rating");
  }

  // Standalone rating values without "rating:" prefix (e.g. "nsfw", "sfw", "explicit", "safe")
  if (KNOWN_NSFW_STANDALONE.has(norm)) {
    const nsfwCat = BUILT_IN_CATEGORIES.find((c) => c.id === "rating_nsfw")!;
    return makeTagStyle(norm, nsfwCat.id, nsfwCat.label, nsfwCat.colors, nsfwCat.colorsLight);
  }

  if (KNOWN_SFW_STANDALONE.has(norm)) {
    const sfwCat = BUILT_IN_CATEGORIES.find((c) => c.id === "rating_sfw")!;
    return makeTagStyle(norm, sfwCat.id, sfwCat.label, sfwCat.colors, sfwCat.colorsLight);
  }

  // 3. Prefix extraction (namespace:value)
  const colonIdx = norm.indexOf(":");
  if (colonIdx > 0) {
    const prefix = norm.slice(0, colonIdx);
    const value = norm.slice(colonIdx + 1);

    // 3a. Check user custom categories
    if (userConfig?.customCategories) {
      for (const custom of userConfig.customCategories) {
        if (custom.prefixes.map((p) => p.toLowerCase()).includes(prefix)) {
          const darkColors = deriveTagColors(custom.color, false);
          const lightHex = custom.colorLight || deriveLightColor(custom.color);
          const lightColors = deriveTagColors(lightHex, true);
          return makeTagStyle(value, custom.id, custom.label, darkColors, lightColors, prefix);
        }
      }
    }

    // 3b. Check built-in categories
    for (const builtIn of BUILT_IN_CATEGORIES) {
      if (builtIn.prefixes.map((p) => p.toLowerCase()).includes(prefix)) {
        return makeTagStyle(value, builtIn.id, builtIn.label, builtIn.colors, builtIn.colorsLight, prefix);
      }
    }

    // 3c. Unrecognized prefix: dynamically generate a cohesive category style
    const darkHex = generateStableColor(prefix, false);
    const lightHex = generateStableColor(prefix, true);
    const darkColors = deriveTagColors(darkHex, false);
    const lightColors = deriveTagColors(lightHex, true);
    return makeTagStyle(
      value,
      `ns_${prefix}`,
      prefix.charAt(0).toUpperCase() + prefix.slice(1),
      darkColors,
      lightColors,
      prefix
    );
  }

  // 4. Default general tag
  const genCat = BUILT_IN_CATEGORIES.find((c) => c.id === "general")!;
  return makeTagStyle(norm, genCat.id, genCat.label, genCat.colors, genCat.colorsLight);
}

/** Generate a stable aesthetically pleasing hex color for unknown prefixes (dark or light mode) */
export function generateStableColor(str: string, isLight: boolean = false): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  if (isLight) {
    return hslToHex(hue, 75, 34);
  }
  return hslToHex(hue, 75, 65);
}

export interface GroupedTagCategory {
  id: string;
  label: string;
  color: string;
  colorLight?: string;
  colors: TagColors;
  colorsLight?: TagColors;
  order: number;
  tags: Array<{
    tag: string;
    count: number;
    style: TagStyle;
  }>;
}

/**
 * Group a list of tag counts by category for the library sidebar or filter modals.
 */
export function groupTagsByCategory(
  tagCounts: Array<{ tag: string; count: number }>,
  userConfig?: TagTaxonomyConfig | null
): GroupedTagCategory[] {
  const map = new Map<string, GroupedTagCategory>();

  // Initialize with built-in categories
  for (const cat of BUILT_IN_CATEGORIES) {
    map.set(cat.id, {
      id: cat.id,
      label: cat.label,
      color: cat.color,
      colorLight: cat.colorLight,
      colors: cat.colors,
      colorsLight: cat.colorsLight,
      order: cat.order,
      tags: [],
    });
  }

  // Initialize with user custom categories
  if (userConfig?.customCategories) {
    for (let i = 0; i < userConfig.customCategories.length; i++) {
      const custom = userConfig.customCategories[i];
      const lightHex = custom.colorLight || deriveLightColor(custom.color);
      map.set(custom.id, {
        id: custom.id,
        label: custom.label,
        color: custom.color,
        colorLight: lightHex,
        colors: deriveTagColors(custom.color, false),
        colorsLight: deriveTagColors(lightHex, true),
        order: 100 + i,
        tags: [],
      });
    }
  }

  // Group tags
  for (const item of tagCounts) {
    const style = resolveTagStyle(item.tag, userConfig);
    let group = map.get(style.categoryId);
    if (!group) {
      const darkColor = style.colorsDark?.text || style.colors.text;
      const lightColor = style.colorsLight?.text || deriveLightColor(darkColor);
      group = {
        id: style.categoryId,
        label: style.categoryLabel,
        color: darkColor,
        colorLight: lightColor,
        colors: style.colorsDark || style.colors,
        colorsLight: style.colorsLight,
        order: 200,
        tags: [],
      };
      map.set(style.categoryId, group);
    }
    group.tags.push({
      tag: item.tag,
      count: item.count,
      style,
    });
  }

  // Sort tags inside groups by count descending, then alphabetical
  for (const group of map.values()) {
    group.tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  // Return non-empty groups sorted by order
  return [...map.values()]
    .filter((g) => g.tags.length > 0)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/**
 * Scan all tags across a library and return a list of discovered prefix namespaces.
 */
export function discoverLibraryNamespaces(tags: string[]): Array<{ prefix: string; count: number; sampleTag: string }> {
  const prefixCounts = new Map<string, { count: number; sampleTag: string }>();

  for (const raw of tags) {
    const norm = cleanTag(raw);
    const colonIdx = norm.indexOf(":");
    if (colonIdx > 0) {
      const prefix = norm.slice(0, colonIdx);
      const existing = prefixCounts.get(prefix) ?? { count: 0, sampleTag: norm };
      existing.count += 1;
      existing.sampleTag = norm;
      prefixCounts.set(prefix, existing);
    }
  }

  return [...prefixCounts.entries()]
    .map(([prefix, { count, sampleTag }]) => ({ prefix, count, sampleTag }))
    .sort((a, b) => b.count - a.count || a.prefix.localeCompare(b.prefix));
}

/**
 * Return numerical ordering weight for a given categoryId.
 */
export function getCategoryOrder(categoryId: string, userConfig?: TagTaxonomyConfig | null): number {
  if (categoryId === "custom_override") return 250;
  const builtIn = BUILT_IN_CATEGORIES.find((c) => c.id === categoryId);
  if (builtIn) return builtIn.order;
  if (userConfig?.customCategories) {
    const idx = userConfig.customCategories.findIndex((c) => c.id === categoryId);
    if (idx >= 0) return 100 + idx;
  }
  if (categoryId.startsWith("ns_")) return 200;
  if (categoryId === "general") return 999;
  return 500;
}

/**
 * Canonical sorting for a list of tags:
 * 1. Lowercase, trim, deduplicate.
 * 2. Primary sort by taxonomy category order (Ratings first -> Copyright -> Character -> Species -> Artist -> Theme -> Meta -> Custom -> Dynamic -> General).
 * 3. Secondary sort alphabetically by clean tag string.
 */
export function sortTags(tags: string[], userConfig?: TagTaxonomyConfig | null): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const norm = cleanTag(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      normalized.push(norm);
    }
  }

  const resolved = normalized.map((tag) => ({
    tag,
    style: resolveTagStyle(tag, userConfig),
  }));

  resolved.sort((a, b) => {
    const orderA = getCategoryOrder(a.style.categoryId, userConfig);
    const orderB = getCategoryOrder(b.style.categoryId, userConfig);
    if (orderA !== orderB) {
      return orderA - orderB;
    }
    return a.tag.localeCompare(b.tag);
  });

  return resolved.map((r) => r.tag);
}
