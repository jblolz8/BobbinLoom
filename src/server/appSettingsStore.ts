import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, quarantineFile, readJsonFile } from "./persistence";
import { AppSettingsSchema } from "../schemas";
import type { AppSettings, AvatarShape, CustomThemeColors, TagTaxonomyConfig, ThemeMode } from "../schemas";

/**
 * Shipped product defaults — the single source of truth for a fresh install
 * (Bobbin Classic Dark theme, the Default preset, rounded avatars). This is
 * never written by the app; the committed data/settings.json is a matching
 * reference template only.
 */
export const DEFAULT_APP_SETTINGS: AppSettings = {
  schemaVersion: 1,
  defaultPresetId: "default",
  avatarShape: "rounded",
  themeMode: "dark",
  themePreset: "default-dark",
  customThemeColors: {},
};

/**
 * Runtime overrides file (gitignored). Holds only what the user has actually
 * changed; everything not present falls through to DEFAULT_APP_SETTINGS. This
 * separation keeps the shipped default (data/settings.json, committed) clean of
 * per-user runtime state.
 */
function userSettingsPath(dataDir: string): string {
  return join(dataDir, "user-settings.json");
}

/**
 * Load app settings: shipped defaults merged with the user's runtime overrides
 * from user-settings.json. Missing runtime file → defaults. An unparseable or
 * future-version runtime file is quarantined to `.bak` and defaults are used.
 */
export function loadAppSettings(dataDir: string): AppSettings {
  const path = userSettingsPath(dataDir);
  if (!existsSync(path)) return { ...DEFAULT_APP_SETTINGS };

  const result = readJsonFile(path);
  if (!result.ok) {
    const backup = quarantineFile(path, "settings unreadable");
    console.warn(`[settings] user-settings.json unreadable — quarantined to ${backup ?? "?"}; using defaults.`);
    return { ...DEFAULT_APP_SETTINGS };
  }

  const parsed = AppSettingsSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.schemaVersion > 1) {
    const backup = quarantineFile(path, "settings invalid");
    console.warn(`[settings] user-settings.json invalid — quarantined to ${backup ?? "?"}; using defaults.`);
    return { ...DEFAULT_APP_SETTINGS };
  }
  return { ...DEFAULT_APP_SETTINGS, ...parsed.data };
}

export function saveAppSettings(
  dataDir: string,
  input: {
    defaultPresetId?: string;
    tagTaxonomy?: TagTaxonomyConfig;
    avatarShape?: AvatarShape;
    themeMode?: ThemeMode;
    themePreset?: string;
    customThemeColors?: CustomThemeColors;
  }
): AppSettings {
  mkdirSync(dataDir, { recursive: true });
  const current = loadAppSettings(dataDir);
  const next: AppSettings = {
    ...current,
    ...input,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(userSettingsPath(dataDir), next);
  return next;
}
