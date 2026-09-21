import type { AvatarShape, ChapterOpeningMode, CoverAspect, CustomThemeColors, TagTaxonomyConfig, ThemeMode, ViewPreferences } from "../../schemas";
import {
  COVER_ASPECT_VALUES,
  avatarBadgeRadius,
  effectiveThemeMode,
  themeTokens
} from "../../engine/theme";
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

/** The shape every resolver below shares: defaults first, so a stored value always wins — including one
 *  that happens to equal a default. `undefined` for a leaf means "never chosen", which is why the
 *  server's answer never fills defaults of its own. */
function resolveGroup<T extends object>(defaults: T, stored: Partial<T> | undefined): T {
  return { ...defaults, ...(stored ?? {}) };
}

export const SETUP_PREFERENCE_DEFAULTS: ResolvedSetupPreferences = {
  castSearch: "",
  castSortBy: "name",
  castSortDir: "asc",
  castViewMode: "portrait",
  showTagFilters: false
};

export type ResolvedSetupPreferences = {
  castSearch: string;
  castSortBy: "name" | "createdAt" | "updatedAt";
  castSortDir: "asc" | "desc";
  castViewMode: "portrait" | "list" | "grid";
  showTagFilters: boolean;
};

export function resolveSetupPreferences(stored?: ViewPreferences): ResolvedSetupPreferences {
  return resolveGroup(SETUP_PREFERENCE_DEFAULTS, stored?.setup);
}

export const CAST_PREFERENCE_DEFAULTS: ResolvedCastPreferences = { viewMode: "portrait" };

export type ResolvedCastPreferences = { viewMode: "portrait" | "compact" };

export function resolveCastPreferences(stored?: ViewPreferences): ResolvedCastPreferences {
  return resolveGroup(CAST_PREFERENCE_DEFAULTS, stored?.cast);
}

export const PROVIDER_PREFERENCE_DEFAULTS: ResolvedProviderPreferences = {
  sortByText: "lastActiveAt",
  sortDirText: "desc",
  sortByImage: "lastActiveAt",
  sortDirImage: "desc"
};

export type ResolvedProviderPreferences = {
  sortByText: "lastActiveAt" | "label" | "updatedAt" | "createdAt";
  sortDirText: "asc" | "desc";
  sortByImage: "lastActiveAt" | "label" | "updatedAt" | "createdAt";
  sortDirImage: "asc" | "desc";
};

export function resolveProviderPreferences(stored?: ViewPreferences): ResolvedProviderPreferences {
  return resolveGroup(PROVIDER_PREFERENCE_DEFAULTS, stored?.providers);
}

export const NAV_PREFERENCE_DEFAULTS: ResolvedNavPreferences = { showPlayNavTabs: true };

export type ResolvedNavPreferences = { showPlayNavTabs: boolean };

export function resolveNavPreferences(stored?: ViewPreferences): ResolvedNavPreferences {
  return resolveGroup(NAV_PREFERENCE_DEFAULTS, stored?.nav);
}

export const UI_PREFERENCE_DEFAULTS: ResolvedUiPreferences = {
  settingsTab: "provider",
  settingsProviderKind: "text"
};

export type ResolvedUiPreferences = {
  settingsTab: "provider" | "prompts" | "tags" | "chat" | "appearance";
  settingsProviderKind: "text" | "image";
};

export function resolveUiPreferences(stored?: ViewPreferences): ResolvedUiPreferences {
  return resolveGroup(UI_PREFERENCE_DEFAULTS, stored?.ui);
}

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
  document.documentElement.style.setProperty("--avatar-badge-radius", avatarBadgeRadius(shape));
}

/** The avatar shape the page is CURRENTLY wearing, read off the root. The server paints it into the first
 *  frame and `applyAvatarShapeTheme` keeps it there, so this is the live value rather than a cached guess —
 *  which is what a surface with no access to the settings themselves (the crop modal) needs. */
export function currentAvatarShape(): AvatarShape {
  if (typeof document === "undefined") return "rounded";
  const attribute = document.documentElement.getAttribute("data-avatar-shape");
  return attribute === "square" || attribute === "circle" ? attribute : "rounded";
}

/** The frame shape each setting means, in CSS `aspect-ratio` terms. */

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
}

/** Applies CSS variables, data-theme attribute, and custom colors globally. The tokens come from the
 *  shared compiler (`src/engine/theme.ts`), which the server also uses to paint the first frame — the two
 *  must agree leaf for leaf, or a reload would visibly correct itself. */
export function applyTheme(settings: {
  themeMode?: ThemeMode;
  themePreset?: string;
  customThemeColors?: CustomThemeColors;
}) {
  if (typeof document === "undefined") return;
  const root = document.documentElement;

  // `system` follows the reader's OS, which only this side can ask about.
  const mode = settings.themeMode ?? "dark";
  const prefersLight =
    typeof window !== "undefined" && !!window.matchMedia
      ? window.matchMedia("(prefers-color-scheme: light)").matches
      : false;
  const effectiveMode = effectiveThemeMode(mode, prefersLight);
  root.setAttribute("data-theme", effectiveMode);

  // Clear any previously set inline custom property so we start clean — except the two that belong to their
  // own appliers (the avatar shape's badge radius and the cover frame's aspect), which would otherwise be
  // wiped by the very next line after they set them.
  const style = root.style;
  const propsToRemove: string[] = [];
  for (let i = 0; i < style.length; i++) {
    const prop = style[i];
    if (prop.startsWith("--") && prop !== "--avatar-badge-radius" && prop !== "--cover-art-aspect") {
      propsToRemove.push(prop);
    }
  }
  for (const p of propsToRemove) {
    style.removeProperty(p);
  }

  const tokens = themeTokens(settings, effectiveMode);
  for (const [key, value] of Object.entries(tokens)) {
    root.style.setProperty(key, value);
  }

  const activeAccent = tokens["--accent-base"] || (effectiveMode === "light" ? "#2563eb" : "#2b4b7b");
  updateFavicon(activeAccent, effectiveMode === "light");
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
