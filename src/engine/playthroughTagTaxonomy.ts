import {
  cleanTag,
  deriveLightColor,
  deriveTagColors,
  generateStableColor,
  type GroupedTagCategory,
  type TagCategoryDefinition,
  type TagColors,
  type TagStyle,
  type TagTaxonomyConfig,
} from "./tagTaxonomy";

/**
 * Built-in Playthrough Tag Categories (VNDB-inspired):
 * 1. Theme & Genre (theme)
 * 2. Setting & Backdrop (setting)
 * 3. Tropes, Dynamics & Kinks (trope)
 * 4. General Tags (general - generic slate color matching Character tags)
 */
export const PLAYTHROUGH_BUILT_IN_CATEGORIES: TagCategoryDefinition[] = [
  {
    id: "theme",
    label: "Theme & Genre",
    prefixes: ["theme", "genre"],
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
    order: 10,
    isBuiltIn: true,
    description:
      "Story genres and overarching thematic motifs (e.g. Horror, Lovecraftian Horror, Dark Fantasy, Cyberpunk, Romance, Mystery)",
  },
  {
    id: "setting",
    label: "Setting & Backdrop",
    prefixes: ["setting", "location", "era", "world", "backdrop"],
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
    order: 20,
    isBuiltIn: true,
    description:
      "Locations, eras, and world backdrops (e.g. Workplace, Academy, Medieval, Modern Day, Space Station, Dungeon)",
  },
  {
    id: "trope",
    label: "Tropes, Dynamics & Kinks",
    prefixes: ["trope", "kink", "fetish", "dynamic", "content"],
    color: "#f472b6",
    colorLight: "#db2777",
    colors: {
      text: "#f472b6",
      bg: "rgba(244, 114, 182, 0.15)",
      border: "rgba(244, 114, 182, 0.45)",
      glow: "rgba(244, 114, 182, 0.25)",
    },
    colorsLight: {
      text: "#db2777",
      bg: "rgba(219, 39, 119, 0.10)",
      border: "rgba(219, 39, 119, 0.32)",
      glow: "rgba(219, 39, 119, 0.20)",
    },
    order: 30,
    isBuiltIn: true,
    description:
      "Character dynamics, narrative tropes, and adult/fetish themes (e.g. Femdom, Slow Burn, Enemies to Lovers, Mind Control)",
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
    description: "Standard custom and descriptive playthrough tags",
  },
];

const BUILT_IN_THEME_VALUES = [
  "action",
  "adventure",
  "comedy",
  "cosmic_horror",
  "crime",
  "cyberpunk",
  "dark_fantasy",
  "dark_romance",
  "detective",
  "drama",
  "dystopian",
  "fantasy",
  "folklore",
  "gothic_horror",
  "high_fantasy",
  "historical",
  "horror",
  "isekai",
  "lovecraftian_horror",
  "mecha",
  "military",
  "mystery",
  "mythology",
  "noir",
  "occult",
  "post-apocalyptic",
  "psychological",
  "psychological_horror",
  "romance",
  "sci-fi",
  "slice_of_life",
  "steampunk",
  "supernatural",
  "survival",
  "thriller",
  "tragedy",
  "urban_fantasy",
] as const;

const BUILT_IN_SETTING_VALUES = [
  "academy",
  "ancient_world",
  "asylum",
  "boarding_school",
  "castle",
  "college",
  "corporate",
  "cruise_ship",
  "cyber_city",
  "dungeon",
  "forest",
  "frontier",
  "gothic",
  "high_school",
  "hospital",
  "island",
  "laboratory",
  "labyrinth",
  "manor",
  "mansion",
  "medieval",
  "metropolis",
  "modern_day",
  "office",
  "prison",
  "royal_court",
  "shrine",
  "small_town",
  "space",
  "space_station",
  "starship",
  "suburbia",
  "tavern",
  "temple",
  "underground",
  "university",
  "victorian",
  "wasteland",
  "wilderness",
  "workplace",
] as const;

const BUILT_IN_TROPE_VALUES = [
  "amnesia",
  "arranged_marriage",
  "betrayal",
  "blackmail",
  "bodyguard",
  "bondage",
  "captive",
  "chastity",
  "coercion",
  "corruption",
  "degradation",
  "enemies_to_lovers",
  "fake_dating",
  "femdom",
  "forbidden_love",
  "forced_proximity",
  "friends_to_lovers",
  "gentle_femdom",
  "harem",
  "hypnosis",
  "kuudere",
  "love_triangle",
  "maledom",
  "masquerade",
  "mind_control",
  "monster_boy",
  "monster_girl",
  "pet_play",
  "power_play",
  "praise",
  "redemption",
  "revenge",
  "reverse_harem",
  "rivals_to_lovers",
  "role_reversal",
  "secret_identity",
  "size_difference",
  "slow_burn",
  "time_loop",
  "transformation",
  "tsundere",
  "wholesome",
  "yandere",
] as const;

export const SUGGESTED_PLAYTHROUGH_TAGS_BY_CATEGORY: Record<
  "theme" | "setting" | "trope",
  string[]
> = {
  theme: BUILT_IN_THEME_VALUES.map((t) => `theme:${t}`),
  setting: BUILT_IN_SETTING_VALUES.map((t) => `setting:${t}`),
  trope: BUILT_IN_TROPE_VALUES.map((t) => `trope:${t}`),
};

const KNOWN_THEME_TAGS = new Set<string>(BUILT_IN_THEME_VALUES);
const KNOWN_SETTING_TAGS = new Set<string>(BUILT_IN_SETTING_VALUES);
const KNOWN_TROPE_TAGS = new Set<string>(BUILT_IN_TROPE_VALUES);

/**
 * Normalizes a raw playthrough tag and automatically applies the canonical
 * `theme:`, `setting:`, or `trope:` prefix when it matches a built-in default value.
 */
export function canonicalizePlaythroughTag(rawTag: string): string {
  const norm = cleanTag(rawTag);
  if (!norm) return "";
  const colonIdx = norm.indexOf(":");
  if (colonIdx > 0) {
    const prefix = norm.slice(0, colonIdx);
    const val = norm.slice(colonIdx + 1);
    if (!val) return "";
    for (const cat of PLAYTHROUGH_BUILT_IN_CATEGORIES) {
      if (
        cat.id !== "general" &&
        cat.prefixes.map((p) => p.toLowerCase()).includes(prefix)
      ) {
        return `${cat.id}:${val}`;
      }
    }
    return norm;
  }
  if (KNOWN_THEME_TAGS.has(norm)) return `theme:${norm}`;
  if (KNOWN_SETTING_TAGS.has(norm)) return `setting:${norm}`;
  if (KNOWN_TROPE_TAGS.has(norm)) return `trope:${norm}`;
  return norm;
}

/**
 * Resolves a playthrough tag into its presentation style, namespace, category, and colors.
 * Recognizes explicit prefixes (`theme:horror`, `setting:workplace`, `trope:femdom`) as well
 * as standalone VNDB-inspired keywords (`horror`, `lovecraftian_horror`, `dark_fantasy`, `workplace`, `femdom`),
 * falling back to `general` (generic slate palette matching Character tags).
 */
export function resolvePlaythroughTagStyle(
  rawTag: string,
  userConfig?: TagTaxonomyConfig | null,
  themeMode?: "dark" | "light",
): TagStyle {
  const norm = cleanTag(rawTag);
  const isLight = themeMode === "light";

  const makeTagStyle = (
    value: string,
    categoryId: string,
    categoryLabel: string,
    colorsDark: TagColors,
    colorsLight: TagColors,
    namespace?: string,
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

  const genCat = PLAYTHROUGH_BUILT_IN_CATEGORIES.find(
    (c) => c.id === "general",
  )!;

  if (!norm) {
    return {
      raw: rawTag,
      value: "",
      displayLabel: "",
      categoryId: genCat.id,
      categoryLabel: genCat.label,
      colors: isLight ? genCat.colorsLight : genCat.colors,
      colorsLight: genCat.colorsLight,
      colorsDark: genCat.colors,
    };
  }

  // 1. Check user overrides if provided
  if (userConfig?.tagOverrides && userConfig.tagOverrides[norm]) {
    const override = userConfig.tagOverrides[norm];
    const colonIdx = norm.indexOf(":");
    const namespace = colonIdx > 0 ? norm.slice(0, colonIdx) : undefined;
    const value = colonIdx > 0 ? norm.slice(colonIdx + 1) : norm;

    if (override.startsWith("#")) {
      const darkColors = deriveTagColors(override, false);
      const lightHex = deriveLightColor(override);
      const lightColors = deriveTagColors(lightHex, true);
      return makeTagStyle(
        value,
        "custom_override",
        "Custom",
        darkColors,
        lightColors,
        namespace,
      );
    }

    const cat = PLAYTHROUGH_BUILT_IN_CATEGORIES.find((c) => c.id === override);
    if (cat) {
      return makeTagStyle(
        value,
        cat.id,
        cat.label,
        cat.colors,
        cat.colorsLight,
        namespace,
      );
    }
  }

  // 2. Prefix extraction (e.g. theme:lovecraftian_horror, setting:workplace, trope:femdom)
  const colonIdx = norm.indexOf(":");
  if (colonIdx > 0) {
    const prefix = norm.slice(0, colonIdx);
    const value = norm.slice(colonIdx + 1);

    for (const builtIn of PLAYTHROUGH_BUILT_IN_CATEGORIES) {
      if (builtIn.prefixes.map((p) => p.toLowerCase()).includes(prefix)) {
        return makeTagStyle(
          value,
          builtIn.id,
          builtIn.label,
          builtIn.colors,
          builtIn.colorsLight,
          prefix,
        );
      }
    }

    const darkHex = generateStableColor(prefix, false);
    const lightHex = generateStableColor(prefix, true);
    return makeTagStyle(
      value,
      `ns_${prefix}`,
      prefix.charAt(0).toUpperCase() + prefix.slice(1),
      deriveTagColors(darkHex, false),
      deriveTagColors(lightHex, true),
      prefix,
    );
  }

  // 3. Standalone VNDB-inspired keyword recognition (upgraded with canonical category namespace)
  if (KNOWN_THEME_TAGS.has(norm)) {
    const cat = PLAYTHROUGH_BUILT_IN_CATEGORIES.find((c) => c.id === "theme")!;
    return makeTagStyle(
      norm,
      cat.id,
      cat.label,
      cat.colors,
      cat.colorsLight,
      "theme",
    );
  }

  if (KNOWN_SETTING_TAGS.has(norm)) {
    const cat = PLAYTHROUGH_BUILT_IN_CATEGORIES.find(
      (c) => c.id === "setting",
    )!;
    return makeTagStyle(
      norm,
      cat.id,
      cat.label,
      cat.colors,
      cat.colorsLight,
      "setting",
    );
  }

  if (KNOWN_TROPE_TAGS.has(norm)) {
    const cat = PLAYTHROUGH_BUILT_IN_CATEGORIES.find((c) => c.id === "trope")!;
    return makeTagStyle(
      norm,
      cat.id,
      cat.label,
      cat.colors,
      cat.colorsLight,
      "trope",
    );
  }

  // 4. Default general tag (generic slate color matching Character tags)
  return makeTagStyle(
    norm,
    genCat.id,
    genCat.label,
    genCat.colors,
    genCat.colorsLight,
  );
}

/**
 * Group playthrough tag counts by category for the library TagSidebar.
 */
export function groupPlaythroughTagsByCategory(
  tagCounts: Array<{ tag: string; count: number }>,
  userConfig?: TagTaxonomyConfig | null,
): GroupedTagCategory[] {
  const map = new Map<string, GroupedTagCategory>();

  for (const cat of PLAYTHROUGH_BUILT_IN_CATEGORIES) {
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

  for (const item of tagCounts) {
    const style = resolvePlaythroughTagStyle(item.tag, userConfig);
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

  for (const group of map.values()) {
    group.tags.sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag));
  }

  return [...map.values()]
    .filter((g) => g.tags.length > 0)
    .sort((a, b) => a.order - b.order || a.label.localeCompare(b.label));
}

/**
 * Canonical sorting for playthrough tags:
 * 1. Lowercase, trim, replace spaces with underscores, deduplicate.
 * 2. Primary sort by category order (theme -> setting -> trope -> custom -> general).
 * 3. Secondary sort alphabetically.
 */
export function sortPlaythroughTags(
  tags: string[],
  userConfig?: TagTaxonomyConfig | null,
): string[] {
  if (!tags || tags.length === 0) return [];
  const seen = new Set<string>();
  const normalized: string[] = [];
  for (const raw of tags) {
    const norm = canonicalizePlaythroughTag(raw);
    if (norm && !seen.has(norm)) {
      seen.add(norm);
      normalized.push(norm);
    }
  }

  const getOrder = (catId: string): number => {
    const builtIn = PLAYTHROUGH_BUILT_IN_CATEGORIES.find((c) => c.id === catId);
    if (builtIn) return builtIn.order;
    if (catId.startsWith("ns_")) return 200;
    return 500;
  };

  const resolved = normalized.map((tag) => ({
    tag,
    style: resolvePlaythroughTagStyle(tag, userConfig),
  }));

  resolved.sort((a, b) => {
    const orderA = getOrder(a.style.categoryId);
    const orderB = getOrder(b.style.categoryId);
    if (orderA !== orderB) return orderA - orderB;
    return a.tag.localeCompare(b.tag);
  });

  return resolved.map((r) => r.tag);
}
