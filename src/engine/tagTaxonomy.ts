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
  color: string; // Base Hex/CSS color
  colors: TagColors;
  order: number;
  description?: string;
  isBuiltIn?: boolean;
}

export interface CustomCategoryConfig {
  id: string;
  label: string;
  prefixes: string[];
  color: string;
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

/** Generate a complete TagColors set from a base hex color */
export function deriveTagColors(baseHex: string): TagColors {
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
    prefixes: ["rating:nsfw", "rating:explicit", "rating:questionable", "rating:lewd", "rating:mature", "rating:18+"],
    color: "#f87171",
    colors: {
      text: "#f87171",
      bg: "rgba(239, 68, 68, 0.15)",
      border: "rgba(239, 68, 68, 0.45)",
      glow: "rgba(239, 68, 68, 0.25)",
    },
    order: 10,
    isBuiltIn: true,
    description: "Adult, explicit, or mature content tags",
  },
  {
    id: "rating_sfw",
    label: "Rating: SFW",
    prefixes: ["rating:sfw", "rating:general", "rating:safe", "rating:all_ages"],
    color: "#4ade80",
    colors: {
      text: "#4ade80",
      bg: "rgba(34, 197, 94, 0.15)",
      border: "rgba(34, 197, 94, 0.45)",
      glow: "rgba(34, 197, 94, 0.25)",
    },
    order: 20,
    isBuiltIn: true,
    description: "Safe for work or general audience tags",
  },
  {
    id: "copyright",
    label: "Copyright & Franchise",
    prefixes: ["copyright", "franchise", "series", "origin", "fandom", "universe", "anime", "game", "novel"],
    color: "#c084fc",
    colors: {
      text: "#c084fc",
      bg: "rgba(168, 85, 247, 0.15)",
      border: "rgba(168, 85, 247, 0.45)",
      glow: "rgba(168, 85, 247, 0.25)",
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
    colors: {
      text: "#60a5fa",
      bg: "rgba(59, 130, 246, 0.15)",
      border: "rgba(59, 130, 246, 0.45)",
      glow: "rgba(59, 130, 246, 0.25)",
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
    colors: {
      text: "#22d3ee",
      bg: "rgba(6, 182, 212, 0.15)",
      border: "rgba(6, 182, 212, 0.45)",
      glow: "rgba(6, 182, 212, 0.25)",
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
    colors: {
      text: "#fbbf24",
      bg: "rgba(245, 158, 11, 0.15)",
      border: "rgba(245, 158, 11, 0.45)",
      glow: "rgba(245, 158, 11, 0.25)",
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
    colors: {
      text: "#facc15",
      bg: "rgba(234, 179, 8, 0.15)",
      border: "rgba(234, 179, 8, 0.45)",
      glow: "rgba(234, 179, 8, 0.25)",
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
    colors: {
      text: "#94a3b8",
      bg: "rgba(148, 163, 184, 0.12)",
      border: "rgba(148, 163, 184, 0.35)",
      glow: "rgba(148, 163, 184, 0.2)",
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
    colors: {
      text: "#cbd5e1",
      bg: "rgba(30, 41, 59, 0.65)",
      border: "rgba(51, 65, 85, 0.8)",
      glow: "rgba(148, 163, 184, 0.15)",
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
  "all_ages",
  "family_friendly",
]);

/** Normalize tag for lookup and comparison */
export function cleanTag(tag: string): string {
  return tag.trim().toLowerCase().replace(/\s+/g, "_");
}

/**
 * Resolves a raw tag into its full presentation style, namespace, category, and colors.
 */
export function resolveTagStyle(rawTag: string, userConfig?: TagTaxonomyConfig | null): TagStyle {
  const norm = cleanTag(rawTag);
  if (!norm) {
    const gen = BUILT_IN_CATEGORIES.find((c) => c.id === "general")!;
    return {
      raw: rawTag,
      value: "",
      displayLabel: "",
      categoryId: gen.id,
      categoryLabel: gen.label,
      colors: gen.colors,
    };
  }

  // 1. Check user tag overrides first
  if (userConfig?.tagOverrides && userConfig.tagOverrides[norm]) {
    const override = userConfig.tagOverrides[norm];
    // Can be a categoryId or a hex color
    if (override.startsWith("#")) {
      const colors = deriveTagColors(override);
      const colonIdx = norm.indexOf(":");
      const namespace = colonIdx > 0 ? norm.slice(0, colonIdx) : undefined;
      const value = colonIdx > 0 ? norm.slice(colonIdx + 1) : norm;
      return {
        raw: norm,
        namespace,
        value,
        displayLabel: norm,
        categoryId: "custom_override",
        categoryLabel: "Custom",
        colors,
      };
    }
    // Match an existing category
    const cat =
      userConfig.customCategories?.find((c) => c.id === override) ??
      BUILT_IN_CATEGORIES.find((c) => c.id === override);
    if (cat) {
      const colors: TagColors =
        "colors" in cat && cat.colors
          ? (cat as TagCategoryDefinition).colors
          : deriveTagColors((cat as CustomCategoryConfig).color);
      const colonIdx = norm.indexOf(":");
      const namespace = colonIdx > 0 ? norm.slice(0, colonIdx) : undefined;
      const value = colonIdx > 0 ? norm.slice(colonIdx + 1) : norm;
      return {
        raw: norm,
        namespace,
        value,
        displayLabel: norm,
        categoryId: cat.id,
        categoryLabel: cat.label,
        colors,
      };
    }
  }

  // 2. Standalone well-known ratings
  if (
    KNOWN_NSFW_STANDALONE.has(norm) ||
    norm.startsWith("rating:nsfw") ||
    norm.startsWith("rating:explicit") ||
    norm.startsWith("rating:lewd") ||
    norm.startsWith("rating:18")
  ) {
    const nsfwCat = BUILT_IN_CATEGORIES.find((c) => c.id === "rating_nsfw")!;
    const colonIdx = norm.indexOf(":");
    return {
      raw: norm,
      namespace: colonIdx > 0 ? norm.slice(0, colonIdx) : undefined,
      value: colonIdx > 0 ? norm.slice(colonIdx + 1) : norm,
      displayLabel: norm,
      categoryId: nsfwCat.id,
      categoryLabel: nsfwCat.label,
      colors: nsfwCat.colors,
    };
  }

  if (
    KNOWN_SFW_STANDALONE.has(norm) ||
    norm.startsWith("rating:sfw") ||
    norm.startsWith("rating:safe") ||
    norm.startsWith("rating:general")
  ) {
    const sfwCat = BUILT_IN_CATEGORIES.find((c) => c.id === "rating_sfw")!;
    const colonIdx = norm.indexOf(":");
    return {
      raw: norm,
      namespace: colonIdx > 0 ? norm.slice(0, colonIdx) : undefined,
      value: colonIdx > 0 ? norm.slice(colonIdx + 1) : norm,
      displayLabel: norm,
      categoryId: sfwCat.id,
      categoryLabel: sfwCat.label,
      colors: sfwCat.colors,
    };
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
          return {
            raw: norm,
            namespace: prefix,
            value,
            displayLabel: norm,
            categoryId: custom.id,
            categoryLabel: custom.label,
            colors: deriveTagColors(custom.color),
          };
        }
      }
    }

    // 3b. Check built-in categories
    for (const builtIn of BUILT_IN_CATEGORIES) {
      if (builtIn.prefixes.map((p) => p.toLowerCase()).includes(prefix)) {
        return {
          raw: norm,
          namespace: prefix,
          value,
          displayLabel: norm,
          categoryId: builtIn.id,
          categoryLabel: builtIn.label,
          colors: builtIn.colors,
        };
      }
    }

    // 3c. Unrecognized prefix: dynamically generate a cohesive category style
    return {
      raw: norm,
      namespace: prefix,
      value,
      displayLabel: norm,
      categoryId: `ns_${prefix}`,
      categoryLabel: prefix.charAt(0).toUpperCase() + prefix.slice(1),
      colors: deriveTagColors(generateStableColor(prefix)),
    };
  }

  // 4. Default general tag
  const genCat = BUILT_IN_CATEGORIES.find((c) => c.id === "general")!;
  return {
    raw: norm,
    value: norm,
    displayLabel: norm,
    categoryId: genCat.id,
    categoryLabel: genCat.label,
    colors: genCat.colors,
  };
}

/** Generate a stable aesthetically pleasing pastel/neon hex color for unknown prefixes */
export function generateStableColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return hslToHex(hue, 75, 65);
}

function hslToHex(h: number, s: number, l: number): string {
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

export interface GroupedTagCategory {
  id: string;
  label: string;
  color: string;
  colors: TagColors;
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
      colors: cat.colors,
      order: cat.order,
      tags: [],
    });
  }

  // Initialize with user custom categories
  if (userConfig?.customCategories) {
    for (let i = 0; i < userConfig.customCategories.length; i++) {
      const custom = userConfig.customCategories[i];
      map.set(custom.id, {
        id: custom.id,
        label: custom.label,
        color: custom.color,
        colors: deriveTagColors(custom.color),
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
      group = {
        id: style.categoryId,
        label: style.categoryLabel,
        color: style.colors.text,
        colors: style.colors,
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
