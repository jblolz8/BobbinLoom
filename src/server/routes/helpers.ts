import type { FastifyReply } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PromptPreset } from "../../schemas";
import {
  loadAppSettings,
  saveAppSettings,
  saveViewPreferences,
} from "../appSettingsStore";
import { createProviderManager } from "../providerManager";
import { atomicWriteJson } from "../persistence";

export { loadAppSettings, saveAppSettings, saveViewPreferences };

export const dataDir = join(process.cwd(), "data", "playthroughs");
export const settingsDir = join(process.cwd(), "data");
/** Generated image bytes live in their own content-addressed directory (see
 *  imageStore.ts) — re-exported here as the route-level default. */
export { IMAGES_DIR as imagesDir } from "../imageStore";
export const providerManager = createProviderManager(settingsDir);

export function presetsPath(): string {
  return join(process.cwd(), "data", "prompt-presets.json");
}

export function userPresetsPath(): string {
  return join(process.cwd(), "data", "user-prompt-presets.json");
}

function readPresetFile(path: string): PromptPreset[] {
  if (!existsSync(path)) return [];
  try {
    const parsed = JSON.parse(readFileSync(path, "utf8"));
    return Array.isArray(parsed) ? (parsed as PromptPreset[]) : [];
  } catch {
    return [];
  }
}

/**
 * Load all prompt presets: shipped read-only presets from `data/prompt-presets.json`
 * followed by user-created presets from `data/user-prompt-presets.json`.
 *
 * When `user-prompt-presets.json` does not exist yet on disk, any legacy
 * `readonly: false` presets stored inside `prompt-presets.json` are included so
 * pre-split user presets (and test fixtures) remain visible and migrate cleanly
 * into `user-prompt-presets.json` on the first write.
 */
export function loadPresets(): PromptPreset[] {
  const shippedFile = readPresetFile(presetsPath());
  const userPath = userPresetsPath();
  if (!existsSync(userPath)) {
    return shippedFile;
  }
  const shippedReadonly = shippedFile.filter((p) => p.readonly);
  const userPresets = readPresetFile(userPath).map((p) => ({
    ...p,
    readonly: false,
  }));
  return [...shippedReadonly, ...userPresets];
}

/**
 * Persist user-created (`readonly: false`) presets to `data/user-prompt-presets.json`,
 * leaving the committed `data/prompt-presets.json` seed file untouched.
 */
export function savePresets(presets: PromptPreset[]): void {
  const userPresets = presets
    .filter((p) => !p.readonly)
    .map((p) => ({ ...p, readonly: false }));
  atomicWriteJson(userPresetsPath(), userPresets);
}

/**
 * Wires an AbortController to the client connection: it aborts when the client
 * disconnects before we've replied, so long-running AI calls stop burning
 * tokens and cancelled results aren't persisted. Listeners fire once per
 * request (on response close) and are dropped with the response object.
 */
export function abortOnClientDisconnect(reply: FastifyReply): AbortController {
  const controller = new AbortController();
  reply.raw.on("close", () => {
    if (!reply.raw.writableEnded) controller.abort();
  });
  return controller;
}
