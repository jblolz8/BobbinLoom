import type { AvatarShape, ChapterOpeningMode, CoverAspect, CustomThemeColors, TagTaxonomyConfig, ThemeMode, ViewPreferences } from "../../schemas";
import { request } from "./client";

export type { ThemeMode, CustomThemeColors, ChapterOpeningMode };

/**
 * The reader's display preferences as stored — only what was chosen.
 *
 * Unlike the appearance GET, this does NOT fill defaults: an absent leaf is the signal the one-shot
 * adoption reads to tell "never migrated" from "chosen equal to the default". `resolveViewPreferences`
 * is the one place the UI turns this into concrete values.
 */
export function getViewPreferences(): Promise<ViewPreferences> {
  return request<{ preferences: ViewPreferences }>("/api/settings/preferences").then(
    (result) => result.preferences ?? {}
  );
}

/** Merge a partial preferences patch server-side. Callers set their own state optimistically first,
 *  the way the appearance panel does. */
export function updateViewPreferences(patch: ViewPreferences): Promise<ViewPreferences> {
  return request<{ preferences: ViewPreferences }>("/api/settings/preferences", {
    method: "PUT",
    body: JSON.stringify(patch)
  }).then((result) => result.preferences ?? {});
}

/** What a reader who has never chosen anything gets for the chat toggles. These are the values the
 *  hook's old `loadChatSettings` fell back to, moved here so a default lives in ONE place rather than
 *  a `?? true` per call site. */
export const CHAT_PREFERENCE_DEFAULTS = {
  choicesEnabled: true,
  showDebug: true,
  showContextUsage: true,
  showGenerationTime: true,
  showMessageTimestamps: true,
  showModelName: true,
  imagePromptPreview: true,
  /** Costs a text call plus a render per turn, and a local render runs for minutes: OFF. */
  autoImageAfterTurn: false,
  /** Skips the confirmation when re-sending an image's request body: OFF. */
  alwaysDiscardOldImage: false
} as const;

export type ResolvedChatPreferences = { [K in keyof typeof CHAT_PREFERENCE_DEFAULTS]: boolean };

/** The chat toggles with defaults filled. An absent leaf means "never chosen", so defaults are applied
 *  HERE and nowhere else — and a stored `false` must beat a default `true`, which is why the spread
 *  order is the whole point of this function. */
export function resolveChatPreferences(stored: ViewPreferences | undefined): ResolvedChatPreferences {
  return { ...CHAT_PREFERENCE_DEFAULTS, ...(stored?.chat ?? {}) };
}

/** What a reader who has never chosen anything gets for the two browsing lists. The old initializers
 *  had these literals scattered across both components; they live here now so a default exists once. */
export const LIBRARY_PREFERENCE_DEFAULTS = {
  /** The character library. */
  viewMode: "portrait",
  sortBy: "name",
  sortDir: "asc",
  sidebarViewMode: "grouped",
  collapsedCategories: [] as string[],
  search: "",
  /** The home shelf. Its own view mode, sort and direction — a different list, same group. */
  playthroughViewMode: "grid",
  playthroughSortBy: "updatedAt",
  playthroughSortDir: "desc"
} satisfies ResolvedLibraryPreferences;

export type ResolvedLibraryPreferences = {
  viewMode: "portrait" | "list" | "grid";
  sortBy: "name" | "createdAt" | "updatedAt";
  sortDir: "asc" | "desc";
  sidebarViewMode: "grouped" | "flat";
  collapsedCategories: string[];
  search: string;
  playthroughViewMode: "grid" | "list";
  playthroughSortBy: "updatedAt" | "name" | "turn";
  playthroughSortDir: "asc" | "desc";
};

/** The library group, defaults filled. Absent means "never chosen", so the defaults are applied HERE
 *  and nowhere else — a stored value always wins, including one that matches a default. */
export function resolveLibraryPreferences(
  stored: ViewPreferences | undefined
): ResolvedLibraryPreferences {
  return { ...LIBRARY_PREFERENCE_DEFAULTS, ...(stored?.library ?? {}) };
}

/** Which list a pager is, keyed as `viewPreferences.pageSizes` keys it. Page size has no resolver here
 *  — unlike the other groups there is no meaningful "default" to fill, because a list that has never
 *  been sized keeps the pager's own `DEFAULT_PAGE_SIZE`. */
export type PageSizeSurface = "library" | "lorebook" | "persona" | "setupCast" | "home";

export interface AppearanceSettings {
  avatarShape: AvatarShape;
  /** The shape of every cover frame on the playthrough shelf. */
  coverAspect: CoverAspect;
  themeMode: ThemeMode;
  themePreset: string;
  customThemeColors: CustomThemeColors;
  /** Whether a horizontal swipe moves between the play view's panels on the single-panel layout.
   *  The play view reads it; there is no `apply…`/cache helper here on purpose — a cache exists to
   *  avoid a wrong PAINT before the server answers, and arming a gesture has no such flicker. */
  paneSwipeEnabled: boolean;
}

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  colors: Record<string, string>;
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "default-dark",
    name: "Bobbin Classic Dark",
    description: "The signature sleek dark slate roleplay theme",
    mode: "dark",
    colors: {
      "--text-primary": "#eceff4",
      "--story-text": "#eceff4",
      "--story-emphasis": "#60a5fa",
      "--chat-ai-text": "#eceff4",
      "--chat-user-text": "#eceff4",
    },
  },
  {
    id: "default-light",
    name: "Studio Light",
    description: "Clean, high-contrast light mode for daytime reading",
    mode: "light",
    colors: {
      "--text-primary": "#0f172a",
      "--story-text": "#0f172a",
      "--story-emphasis": "#1d4ed8",
      "--chat-ai-text": "#0f172a",
      "--chat-user-text": "#1e1b4b",
    },
  },
  {
    id: "nord-frost",
    name: "Nord Frost",
    description: "Arctic, north-bluish palette with soft contrast",
    mode: "dark",
    colors: {
      "--bg-app": "#2e3440",
      "--bg-panel": "#3b4252",
      "--bg-surface-elevated": "#434c5e",
      "--bg-surface-hover": "#4c566a",
      "--border-main": "#4c566a",
      "--border-subtle": "#3b4252",
      "--border-light": "#4c566a",
      "--border-focus": "#88c0d0",
      "--text-primary": "#eceff4",
      "--text-secondary": "#d8dee9",
      "--text-muted": "#aeb7c4",
      "--accent-base": "#88c0d0",
      "--accent-hover": "#81a1c1",
      "--accent-active": "#5e81ac",
      "--accent-highlight": "#88c0d0",
      "--accent-translucent": "rgba(136, 192, 208, 0.16)",
      "--chat-user-bg": "#434c5e",
      "--chat-user-border": "#4c566a",
      "--chat-user-text": "#eceff4",
      "--chat-ai-bg": "#3b4252",
      "--chat-ai-border": "#434c5e",
      "--chat-ai-text": "#eceff4",
      "--story-text": "#eceff4",
      "--story-emphasis": "#88c0d0",
      "--story-quote": "#ebcb8b",
      "--story-italic": "#e5e9f0",
      "--ai-accent": "#b48ead",
      "--ai-accent-hover": "#d8dee9",
      "--ai-accent-translucent": "rgba(180, 142, 173, 0.18)",
      "--ai-bubble-bg": "#2e3440",
      "--ai-bubble-border": "#4c566a",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#4c566a",
      "--scrollbar-thumb-hover": "#88c0d0",
      "--scrollbar-thumb-active": "#81a1c1",
      "--btn-warning-bg": "#393328",
      "--btn-warning-border": "#6e5d3c",
      "--btn-warning-text": "#ebcb8b",
      "--btn-warning-hover": "#474032",
      "--input-bg": "#2e3440",
      "--input-filled-bg": "#353c4a",
      "--input-border": "#4c566a",
      "--input-text": "#eceff4",
      "--input-placeholder": "#768296",
      "--input-focus-border": "#88c0d0",
      "--input-focus-ring": "rgba(136, 192, 208, 0.25)",
    },
  },
  {
    id: "warm-parchment",
    name: "Warm Parchment",
    description: "Soft sepia book aesthetic that goes easy on the eyes",
    mode: "light",
    colors: {
      "--bg-app": "#f5efe6",
      "--bg-panel": "#fdfbf7",
      "--bg-surface-elevated": "#ede4d8",
      "--bg-surface-hover": "#e3d8c8",
      "--border-main": "#d8ccbe",
      "--border-subtle": "#e6ded4",
      "--border-light": "#cbbdac",
      "--border-focus": "#965938",
      "--text-primary": "#2d241e",
      "--text-secondary": "#635347",
      "--text-muted": "#8a7565",
      "--chat-user-bg": "#e6ded3",
      "--chat-user-border": "#d4c8b8",
      "--chat-user-text": "#2d241e",
      "--chat-ai-bg": "#fbf8f3",
      "--chat-ai-border": "#e3dacf",
      "--chat-ai-text": "#2d241e",
      "--story-text": "#2d241e",
      "--story-emphasis": "#8b1e1e",
      "--story-quote": "#8a4b08",
      "--story-italic": "#59483b",
      "--accent-base": "#965938",
      "--accent-hover": "#7c4424",
      "--accent-active": "#663619",
      "--accent-highlight": "#965938",
      "--accent-translucent": "rgba(150, 89, 56, 0.14)",
      "--ai-accent": "#935338",
      "--ai-accent-hover": "#7c4424",
      "--ai-accent-active": "#663619",
      "--ai-accent-translucent": "rgba(147, 83, 56, 0.14)",
      "--ai-bubble-bg": "#f9f5ee",
      "--ai-bubble-border": "#dfd4c4",
      "--ai-bubble-text": "#2d241e",
      "--input-bg": "#fdfbf7",
      "--input-filled-bg": "#f5efe6",
      "--input-border": "#d8ccbe",
      "--input-text": "#2d241e",
      "--input-placeholder": "#8c7a6b",
      "--input-focus-border": "#965938",
      "--input-focus-ring": "rgba(150, 89, 56, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(185, 28, 28, 0.1)",
      "--status-danger-border": "rgba(185, 28, 28, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(21, 128, 61, 0.1)",
      "--status-success-border": "rgba(21, 128, 61, 0.28)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(180, 83, 9, 0.12)",
      "--status-warning-border": "rgba(180, 83, 9, 0.3)",
      "--btn-danger-bg": "#fdf0ef",
      "--btn-danger-border": "#f3b7b2",
      "--btn-danger-text": "#9b1c1c",
      "--btn-danger-hover": "#fce2e0",
      "--btn-warning-bg": "#fcf4e8",
      "--btn-warning-border": "#f0cf9e",
      "--btn-warning-text": "#854d0e",
      "--btn-warning-hover": "#f7e8cf",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#cbbdac",
      "--scrollbar-thumb-hover": "#965938",
      "--scrollbar-thumb-active": "#7c4424",
      "--code-inline-bg": "#ede4d8",
      "--code-inline-border": "#d8ccbe",
      "--code-inline-text": "#7c4424",
    },
  },
  {
    id: "midnight-purple",
    name: "Midnight Violet",
    description: "Deep amethyst night theme with glowing accents",
    mode: "dark",
    colors: {
      "--bg-app": "#0e0d16",
      "--bg-panel": "#171524",
      "--bg-surface-elevated": "#221e35",
      "--bg-surface-hover": "#2c2742",
      "--border-main": "#312a4c",
      "--border-subtle": "#25203b",
      "--border-light": "#3d345f",
      "--border-focus": "#9353d3",
      "--text-primary": "#f1ecf9",
      "--text-secondary": "#d4c5e9",
      "--text-muted": "#a092b8",
      "--accent-base": "#9353d3",
      "--accent-hover": "#a86de4",
      "--accent-active": "#7928ca",
      "--accent-highlight": "#b37af0",
      "--accent-translucent": "rgba(147, 83, 211, 0.18)",
      "--chat-user-bg": "#2b1f48",
      "--chat-user-border": "#3f2e6b",
      "--chat-user-text": "#f1ecf9",
      "--chat-ai-bg": "#1a1728",
      "--chat-ai-border": "#28233e",
      "--chat-ai-text": "#f1ecf9",
      "--story-text": "#f1ecf9",
      "--story-emphasis": "#e879f9",
      "--story-quote": "#f5a524",
      "--story-italic": "#d4c5e9",
      "--ai-accent": "#c084fc",
      "--ai-accent-translucent": "rgba(192, 132, 252, 0.18)",
      "--ai-bubble-bg": "#1e1932",
      "--ai-bubble-border": "#413763",
      "--ai-bubble-text": "#f1ecf9",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#312a4c",
      "--scrollbar-thumb-hover": "#9353d3",
      "--scrollbar-thumb-active": "#a86de4",
      "--btn-warning-bg": "#2e2014",
      "--btn-warning-border": "#684820",
      "--btn-warning-text": "#fde047",
      "--btn-warning-hover": "#3d2b1b",
      "--input-bg": "#151322",
      "--input-filled-bg": "#1a1728",
      "--input-border": "#312a4c",
      "--input-text": "#eceff4",
      "--input-placeholder": "#6b6285",
      "--input-focus-border": "#9353d3",
      "--input-focus-ring": "rgba(147, 83, 211, 0.25)",
    },
  },
  {
    id: "emerald-archive",
    name: "Emerald Archive",
    description: "Scholarly evergreen slate with luminous jade accents",
    mode: "dark",
    colors: {
      "--bg-app": "#0c1512",
      "--bg-panel": "#121e1a",
      "--bg-surface-elevated": "#172722",
      "--bg-surface-hover": "#1e322c",
      "--border-main": "#243c34",
      "--border-subtle": "#1a2d27",
      "--border-light": "#2f4d43",
      "--border-focus": "#10b981",
      "--text-primary": "#ecfdf5",
      "--text-secondary": "#a7f3d0",
      "--text-muted": "#6ee7b7",
      "--accent-base": "#10b981",
      "--accent-hover": "#059669",
      "--accent-active": "#047857",
      "--accent-highlight": "#34d399",
      "--accent-translucent": "rgba(16, 185, 129, 0.16)",
      "--chat-user-bg": "#1a3028",
      "--chat-user-border": "#294c40",
      "--chat-user-text": "#ecfdf5",
      "--chat-ai-bg": "#121e1a",
      "--chat-ai-border": "#223830",
      "--chat-ai-text": "#ecfdf5",
      "--story-text": "#ecfdf5",
      "--story-emphasis": "#34d399",
      "--story-quote": "#fbbf24",
      "--story-italic": "#a7f3d0",
      "--ai-accent": "#34d399",
      "--ai-accent-hover": "#6ee7b7",
      "--ai-accent-translucent": "rgba(52, 211, 153, 0.16)",
      "--ai-bubble-bg": "#10261f",
      "--ai-bubble-border": "#1d483b",
      "--ai-bubble-text": "#ecfdf5",
      "--input-bg": "#0e1814",
      "--input-filled-bg": "#14221d",
      "--input-border": "#243c34",
      "--input-text": "#ecfdf5",
      "--input-placeholder": "#53796d",
      "--input-focus-border": "#10b981",
      "--input-focus-ring": "rgba(16, 185, 129, 0.25)",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#243c34",
      "--scrollbar-thumb-hover": "#10b981",
      "--scrollbar-thumb-active": "#34d399",
      "--btn-warning-bg": "#2e2511",
      "--btn-warning-border": "#69521d",
      "--btn-warning-text": "#fde047",
      "--btn-warning-hover": "#3d3116",
      "--code-inline-bg": "rgba(12, 21, 18, 0.8)",
      "--code-inline-border": "#243c34",
      "--code-inline-text": "#34d399",
    },
  },
  {
    id: "amber-hearth",
    name: "Amber Hearth",
    description: "Cozy candlelit espresso slate with glowing honey amber accents",
    mode: "dark",
    colors: {
      "--bg-app": "#13110e",
      "--bg-panel": "#1b1713",
      "--bg-surface-elevated": "#241f1a",
      "--bg-surface-hover": "#2f2821",
      "--border-main": "#3b3228",
      "--border-subtle": "#2c251e",
      "--border-light": "#4b3f32",
      "--border-focus": "#d97706",
      "--text-primary": "#fef3c7",
      "--text-secondary": "#d5c3a5",
      "--text-muted": "#a6957c",
      "--accent-base": "#d97706",
      "--accent-hover": "#b45309",
      "--accent-active": "#92400e",
      "--accent-highlight": "#f59e0b",
      "--accent-translucent": "rgba(217, 119, 6, 0.16)",
      "--chat-user-bg": "#2b2218",
      "--chat-user-border": "#443625",
      "--chat-user-text": "#fef3c7",
      "--chat-ai-bg": "#1b1713",
      "--chat-ai-border": "#342b20",
      "--chat-ai-text": "#fef3c7",
      "--story-text": "#fef3c7",
      "--story-emphasis": "#fb923c",
      "--story-quote": "#fde047",
      "--story-italic": "#e7d8bf",
      "--ai-accent": "#f97316",
      "--ai-accent-hover": "#fb923c",
      "--ai-accent-translucent": "rgba(249, 115, 22, 0.16)",
      "--ai-bubble-bg": "#251c14",
      "--ai-bubble-border": "#4d3722",
      "--ai-bubble-text": "#fef3c7",
      "--input-bg": "#15120f",
      "--input-filled-bg": "#1d1914",
      "--input-border": "#3b3228",
      "--input-text": "#fef3c7",
      "--input-placeholder": "#7a6c58",
      "--input-focus-border": "#d97706",
      "--input-focus-ring": "rgba(217, 119, 6, 0.25)",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#3b3228",
      "--scrollbar-thumb-hover": "#d97706",
      "--scrollbar-thumb-active": "#f59e0b",
      "--btn-warning-bg": "#31230e",
      "--btn-warning-border": "#694b1a",
      "--btn-warning-text": "#fde047",
      "--btn-warning-hover": "#402e12",
      "--code-inline-bg": "rgba(19, 17, 14, 0.8)",
      "--code-inline-border": "#3b3228",
      "--code-inline-text": "#f59e0b",
    },
  },
  {
    id: "matcha-cream",
    name: "Matcha & Cream",
    description: "Organic botanical tea paper with calming forest laurel accents",
    mode: "light",
    colors: {
      "--bg-app": "#f1f5f2",
      "--bg-panel": "#fbfdfb",
      "--bg-surface-elevated": "#ffffff",
      "--bg-surface-hover": "#e6eee8",
      "--border-main": "#cbd7ce",
      "--border-subtle": "#dde5df",
      "--border-light": "#b8c8bc",
      "--border-focus": "#2d6a4f",
      "--text-primary": "#17231c",
      "--text-secondary": "#3f5447",
      "--text-muted": "#688071",
      "--accent-base": "#2d6a4f",
      "--accent-hover": "#1b4332",
      "--accent-active": "#081c15",
      "--accent-highlight": "#2d6a4f",
      "--accent-translucent": "rgba(45, 106, 79, 0.14)",
      "--chat-user-bg": "#e3ede5",
      "--chat-user-border": "#c4d6c7",
      "--chat-user-text": "#17231c",
      "--chat-ai-bg": "#ffffff",
      "--chat-ai-border": "#d2ded5",
      "--chat-ai-text": "#17231c",
      "--story-text": "#17231c",
      "--story-emphasis": "#166534",
      "--story-quote": "#b45309",
      "--story-italic": "#475569",
      "--ai-accent": "#3f6212",
      "--ai-accent-hover": "#2f490d",
      "--ai-accent-translucent": "rgba(63, 98, 18, 0.14)",
      "--ai-bubble-bg": "#f5f9f5",
      "--ai-bubble-border": "#c8d8cb",
      "--ai-bubble-text": "#17231c",
      "--input-bg": "#ffffff",
      "--input-filled-bg": "#eef3ef",
      "--input-border": "#cbd7ce",
      "--input-text": "#17231c",
      "--input-placeholder": "#7a9182",
      "--input-focus-border": "#2d6a4f",
      "--input-focus-ring": "rgba(45, 106, 79, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(185, 28, 28, 0.1)",
      "--status-danger-border": "rgba(185, 28, 28, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(21, 128, 61, 0.1)",
      "--status-success-border": "rgba(21, 128, 61, 0.28)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(180, 83, 9, 0.12)",
      "--status-warning-border": "rgba(180, 83, 9, 0.3)",
      "--btn-danger-bg": "#fdf0ef",
      "--btn-danger-border": "#f3b7b2",
      "--btn-danger-text": "#9b1c1c",
      "--btn-danger-hover": "#fce2e0",
      "--btn-warning-bg": "#fcf4e8",
      "--btn-warning-border": "#f0cf9e",
      "--btn-warning-text": "#854d0e",
      "--btn-warning-hover": "#f7e8cf",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#b8c8bc",
      "--scrollbar-thumb-hover": "#2d6a4f",
      "--scrollbar-thumb-active": "#1b4332",
      "--code-inline-bg": "#e7efe9",
      "--code-inline-border": "#cbd7ce",
      "--code-inline-text": "#1b4332",
    },
  },
  {
    id: "polar-mist",
    name: "Polar Mist",
    description: "Crisp glacial light paper with razor-sharp arctic fjord accents",
    mode: "light",
    colors: {
      "--bg-app": "#f0f4f8",
      "--bg-panel": "#ffffff",
      "--bg-surface-elevated": "#ffffff",
      "--bg-surface-hover": "#e4ebf2",
      "--border-main": "#cbd5e1",
      "--border-subtle": "#e2e8f0",
      "--border-light": "#94a3b8",
      "--border-focus": "#0284c7",
      "--text-primary": "#0f172a",
      "--text-secondary": "#475569",
      "--text-muted": "#64748b",
      "--accent-base": "#0284c7",
      "--accent-hover": "#0369a1",
      "--accent-active": "#075985",
      "--accent-highlight": "#0284c7",
      "--accent-translucent": "rgba(2, 132, 199, 0.12)",
      "--chat-user-bg": "#e0f2fe",
      "--chat-user-border": "#bae6fd",
      "--chat-user-text": "#082f49",
      "--chat-ai-bg": "#ffffff",
      "--chat-ai-border": "#e2e8f0",
      "--chat-ai-text": "#0f172a",
      "--story-text": "#0f172a",
      "--story-emphasis": "#0369a1",
      "--story-quote": "#d97706",
      "--story-italic": "#475569",
      "--ai-accent": "#6366f1",
      "--ai-accent-hover": "#4f46e5",
      "--ai-accent-translucent": "rgba(99, 102, 241, 0.12)",
      "--ai-bubble-bg": "#f5f7ff",
      "--ai-bubble-border": "#c7d2fe",
      "--ai-bubble-text": "#1e1b4b",
      "--input-bg": "#ffffff",
      "--input-filled-bg": "#f0f4f8",
      "--input-border": "#cbd5e1",
      "--input-text": "#0f172a",
      "--input-placeholder": "#94a3b8",
      "--input-focus-border": "#0284c7",
      "--input-focus-ring": "rgba(2, 132, 199, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(220, 38, 38, 0.1)",
      "--status-danger-border": "rgba(220, 38, 38, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(22, 163, 74, 0.12)",
      "--status-success-border": "rgba(22, 163, 74, 0.3)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(217, 119, 6, 0.12)",
      "--status-warning-border": "rgba(217, 119, 6, 0.3)",
      "--btn-danger-bg": "#fee2e2",
      "--btn-danger-border": "#fca5a5",
      "--btn-danger-text": "#991b1b",
      "--btn-danger-hover": "#fecaca",
      "--btn-warning-bg": "#fef3c7",
      "--btn-warning-border": "#fcd34d",
      "--btn-warning-text": "#92400e",
      "--btn-warning-hover": "#fde68a",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#cbd5e1",
      "--scrollbar-thumb-hover": "#0284c7",
      "--scrollbar-thumb-active": "#0369a1",
      "--code-inline-bg": "#e2e8f0",
      "--code-inline-border": "#cbd5e1",
      // accent-base on its own inline chip measures 3.3:1 — too low for code.
      "--code-inline-text": "#0369a1",
    },
  },
];

function hexToAlpha(hex: string, alpha: number): string {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return `rgba(150, 89, 56, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getTagTaxonomy(): Promise<{ tagTaxonomy: TagTaxonomyConfig }> {
  return request<{ tagTaxonomy: TagTaxonomyConfig }>("/api/settings/tag-taxonomy");
}

export function updateTagTaxonomy(config: TagTaxonomyConfig): Promise<{ tagTaxonomy: TagTaxonomyConfig }> {
  return request<{ tagTaxonomy: TagTaxonomyConfig }>("/api/settings/tag-taxonomy", {
    method: "PUT",
    body: JSON.stringify(config),
  });
}

/** The brainstorm assistant's preferences: the original-card context, and its chosen connection. */
export type BrainstormSettings = {
  includeOriginalCard: boolean;
  textProviderId: string | null;
  /** Whether the assistant may propose a section the format does not list. */
  allowNewSections: boolean;
};

export function getBrainstormSettings(): Promise<BrainstormSettings> {
  return request<BrainstormSettings>("/api/settings/brainstorm");
}

export function setBrainstormSettings(patch: Partial<BrainstormSettings>): Promise<BrainstormSettings> {
  return request<BrainstormSettings>("/api/settings/brainstorm", {
    method: "PUT",
    body: JSON.stringify(patch)
  });
}

/** The remembered chapter-opening mode. */
export function getChapterOpeningMode(): Promise<{ chapterOpeningMode: ChapterOpeningMode }> {
  return request<{ chapterOpeningMode: ChapterOpeningMode }>("/api/settings/chapter-opening-mode");
}

export function setChapterOpeningMode(
  mode: ChapterOpeningMode
): Promise<{ chapterOpeningMode: ChapterOpeningMode }> {
  return request<{ chapterOpeningMode: ChapterOpeningMode }>("/api/settings/chapter-opening-mode", {
    method: "PUT",
    body: JSON.stringify({ openingMode: mode })
  });
}

export function getAppearanceSettings(): Promise<AppearanceSettings> {
  return request<AppearanceSettings>("/api/settings/appearance");
}

export function updateAppearanceSettings(payload: Partial<AppearanceSettings>): Promise<AppearanceSettings> {
  return request<AppearanceSettings>("/api/settings/appearance", {
    method: "PUT",
    body: JSON.stringify(payload),
  });
}

/** Applies avatar shape CSS variable and attribute globally */
export function applyAvatarShapeTheme(shape: AvatarShape) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-avatar-shape", shape);
  const radius = shape === "circle" ? "50%" : shape === "square" ? "2px" : "8px";
  document.documentElement.style.setProperty("--avatar-badge-radius", radius);
  try {
    localStorage.setItem("bobbinloom_avatar_shape", shape);
  } catch {
    /* silent */
  }
}

/** The frame shape each setting means, in CSS `aspect-ratio` terms. */
const COVER_ASPECT_VALUES: Record<CoverAspect, string> = {
  portrait: "2 / 3",
  square: "1 / 1",
  landscape: "16 / 9"
};

/**
 * Applies the cover frame shape globally: a `data-cover-aspect` attribute on the root (the same
 * shape `applyAvatarShapeTheme` uses, and what a probe can read back), the value itself as
 * `--cover-art-aspect` for the stylesheet, and a localStorage cache so a reload paints the right
 * shape before the server answers.
 *
 * One global look, deliberately: the shape belongs to the display, not to an individual cover, so
 * no per-playthrough field carries it.
 */
export function applyCoverAspect(aspect: CoverAspect) {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-cover-aspect", aspect);
  document.documentElement.style.setProperty("--cover-art-aspect", COVER_ASPECT_VALUES[aspect]);
  try {
    localStorage.setItem("bobbinloom_cover_aspect", aspect);
  } catch {
    /* silent */
  }
}

/** The cached shape, or null when nothing usable is stored. Validated here so both callers
 *  (the app's boot effect and the Appearance panel) agree on what counts as a good value. */
export function cachedCoverAspect(): CoverAspect | null {
  if (typeof window === "undefined" || !window.localStorage) return null;
  const saved = localStorage.getItem("bobbinloom_cover_aspect");
  if (saved === "portrait" || saved === "square" || saved === "landscape") return saved;
  return null;
}

/** Applies CSS variables, data-theme attribute, and custom colors globally */
export function applyTheme(settings: {
  themeMode?: ThemeMode;
  themePreset?: string;
  customThemeColors?: CustomThemeColors;
}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // 1. Resolve Effective Mode (Dark vs Light)
  let effectiveMode: "dark" | "light" = "dark";
  const mode = settings.themeMode ?? "dark";
  if (mode === "system") {
    const prefersLight = typeof window !== "undefined" && window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches;
    effectiveMode = prefersLight ? "light" : "dark";
  } else {
    effectiveMode = mode;
  }
  root.setAttribute("data-theme", effectiveMode);

  // 2. Clear any previously set inline CSS variables so we start clean
  const style = root.style;
  const propsToRemove: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (prop.startsWith("--") && prop !== "--avatar-badge-radius") {
      propsToRemove.push(prop);
    }
  }
  for (const p of propsToRemove) {
    style.removeProperty(p);
  }

  // 3. Assemble combined colors from Preset
  const presetId = settings.themePreset ?? (effectiveMode === "light" ? "default-light" : "default-dark");
  const preset = THEME_PRESETS.find((p) => p.id === presetId);
  const combinedColors: Record<string, string> = { ...(preset?.colors ?? {}) };

  // 4. Merge User Custom Overrides on top
  if (settings.customThemeColors) {
    for (const [key, value] of Object.entries(settings.customThemeColors)) {
      if (value) {
        combinedColors[key] = value;
      }
    }
  }

  // 5. If --accent-base is set but --accent-translucent is not explicitly supplied, derive it
  if (combinedColors["--accent-base"] && !combinedColors["--accent-translucent"] && combinedColors["--accent-base"].startsWith("#")) {
    combinedColors["--accent-translucent"] = hexToAlpha(combinedColors["--accent-base"], 0.14);
  }

  // 5b. Guarantee --accent-highlight is set for every preset and custom palette
  if (!combinedColors["--accent-highlight"] && combinedColors["--accent-base"]) {
    combinedColors["--accent-highlight"] = combinedColors["--accent-base"];
  }

  // 5c. If user explicitly customized --accent-base, update input focus border & ring
  if (settings.customThemeColors?.["--accent-base"]) {
    if (!combinedColors["--input-focus-border"]) {
      combinedColors["--input-focus-border"] = combinedColors["--accent-base"];
    }
    if (!combinedColors["--input-focus-ring"] && combinedColors["--accent-base"].startsWith("#")) {
      combinedColors["--input-focus-ring"] = hexToAlpha(combinedColors["--accent-base"], 0.25);
    }
  }

  // 6. If --ai-accent is set but --ai-accent-translucent is not explicitly supplied, derive it
  if (combinedColors["--ai-accent"] && !combinedColors["--ai-accent-translucent"] && combinedColors["--ai-accent"].startsWith("#")) {
    combinedColors["--ai-accent-translucent"] = hexToAlpha(combinedColors["--ai-accent"], 0.14);
  }

  // 6b. Ensure story text, interface text, and chat typography are consistently set
  if (!combinedColors["--story-text"]) {
    combinedColors["--story-text"] = combinedColors["--text-primary"] || (effectiveMode === "light" ? "#0f172a" : "#eceff4");
  }
  if (!combinedColors["--text-primary"]) {
    combinedColors["--text-primary"] = combinedColors["--story-text"] || (effectiveMode === "light" ? "#0f172a" : "#eceff4");
  }
  if (!combinedColors["--chat-ai-text"]) {
    combinedColors["--chat-ai-text"] = combinedColors["--story-text"];
  }
  if (!combinedColors["--chat-user-text"]) {
    combinedColors["--chat-user-text"] = combinedColors["--story-text"];
  }
  if (!combinedColors["--story-emphasis"]) {
    combinedColors["--story-emphasis"] = effectiveMode === "light" ? "#1d4ed8" : "#60a5fa";
  }

  // 7. Injects properties onto root element
  for (const [key, value] of Object.entries(combinedColors)) {
    root.style.setProperty(key, value);
  }

  // 8. Update dynamic browser tab favicon to match active accent color
  const activeAccent = combinedColors["--accent-base"] || (effectiveMode === "light" ? "#2563eb" : "#2b4b7b");
  updateFavicon(activeAccent, effectiveMode === "light");

  // 9. Cache to localStorage for instant, flicker-free subsequent page loads
  try {
    localStorage.setItem("bobbinloom_theme_mode", mode);
    if (settings.themePreset) localStorage.setItem("bobbinloom_theme_preset", settings.themePreset);
    if (settings.customThemeColors) {
      localStorage.setItem("bobbinloom_theme_custom", JSON.stringify(settings.customThemeColors));
    }
  } catch {
    /* silent */
  }
}

/** Generates dynamic thread spool SVG data URI for browser tab favicon */
export function generateThreadFaviconDataUri(accentColor: string, isLightMode: boolean = false): string {
  const spoolColor = isLightMode ? "%23475569" : "%2394a3b8";
  const holeColor = "%230f172a";
  const encodedAccent = encodeURIComponent(accentColor);

  const svg = `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24'><path d='M5 3.5C5 2.67 5.67 2 6.5 2H17.5C18.33 2 19 2.67 19 3.5C19 4.33 18.33 5 17.5 5H6.5C5.67 5 5 4.33 5 3.5Z' fill='${spoolColor}'/><ellipse cx='12' cy='3.5' rx='2' ry='0.75' fill='${holeColor}'/><rect x='8.5' y='5' width='7' height='14' fill='${spoolColor}' opacity='0.4'/><rect x='6' y='5' width='12' height='14' rx='1.5' fill='${encodedAccent}'/><path d='M6 7.5H18 M6 10.5H18 M6 13.5H18 M6 16.5H18' stroke='%23ffffff' stroke-width='0.75' stroke-opacity='0.3' stroke-linecap='round'/><path d='M6 8.5H18 M6 11.5H18 M6 14.5H18 M6 17.5H18' stroke='%23000000' stroke-width='0.75' stroke-opacity='0.25' stroke-linecap='round'/><path d='M5 19.5C5 18.67 5.67 18 6.5 18H17.5C18.33 18 19 18.67 19 19.5C19 20.33 18.33 21 17.5 21H6.5C5.67 21 5 20.33 5 19.5Z' fill='${spoolColor}'/><path d='M17.5 17.5C19.8 18.2 21.2 19.8 20.2 22C19.6 23.2 17.8 22.8 17.2 21.8' stroke='${encodedAccent}' stroke-width='1.5' stroke-linecap='round' fill='none'/></svg>`;

  return `data:image/svg+xml,${svg}`;
}

/** Updates the document favicon link tag dynamically */
export function updateFavicon(accentColor: string, isLightMode: boolean = false): void {
  if (typeof document === "undefined") return;
  try {
    let link = document.querySelector<HTMLLinkElement>("link[rel~='icon']");
    if (!link) {
      link = document.createElement("link");
      link.rel = "icon";
      document.head.appendChild(link);
    }
    link.type = "image/svg+xml";
    link.href = generateThreadFaviconDataUri(accentColor, isLightMode);
  } catch {
    /* silent */
  }
}
