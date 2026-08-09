import { existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, quarantineFile, readJsonFile } from "./persistence";
import { AppSettingsSchema } from "../schemas";
import type { AppSettings } from "../schemas";

function settingsPath(dataDir: string): string {
  return join(dataDir, "settings.json");
}

/** Load app settings. Unparseable or future-version files are quarantined to
 *  `.bak` and defaults are used. Missing file → defaults (no write). */
export function loadAppSettings(dataDir: string): AppSettings {
  const path = settingsPath(dataDir);
  if (!existsSync(path)) return { schemaVersion: 1 };

  const result = readJsonFile(path);
  if (!result.ok) {
    const backup = quarantineFile(path, "settings unreadable");
    console.warn(`[settings] settings.json unreadable — quarantined to ${backup ?? "?"}; using defaults.`);
    return { schemaVersion: 1 };
  }

  const parsed = AppSettingsSchema.safeParse(result.data);
  if (!parsed.success || parsed.data.schemaVersion > 1) {
    const backup = quarantineFile(path, "settings invalid");
    console.warn(`[settings] settings.json invalid — quarantined to ${backup ?? "?"}; using defaults.`);
    return { schemaVersion: 1 };
  }
  return parsed.data;
}

export function saveAppSettings(dataDir: string, input: { defaultPresetId?: string }): AppSettings {
  mkdirSync(dataDir, { recursive: true });
  const next: AppSettings = {
    ...loadAppSettings(dataDir),
    ...input,
    updatedAt: new Date().toISOString(),
  };
  atomicWriteJson(settingsPath(dataDir), next);
  return next;
}
