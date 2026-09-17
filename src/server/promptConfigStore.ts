import { loadAppSettings, saveAppSettings } from "./appSettingsStore";
import { loadPresets } from "./routes/helpers";
import type { PromptConfig } from "../schemas";

/**
 * The single global prompt configuration every playthrough reads at generation
 * time. It is a full, always-persisted copy of a preset's `modules` /
 * `characterFormat` / `imageGeneration` that may carry UNSAVED edits — it *is*
 * the draft, so an unsaved change survives a restart and still counts as
 * "dirty" against its backing preset. There is no separate dirty object.
 *
 * Stored in app settings (`user-settings.json`), so it is gitignored runtime
 * state alongside the other per-user overrides — never the committed seed file.
 */
export interface PromptConfigState {
  activePresetId: string;
  promptConfig: PromptConfig;
}

/** Deep-copy a preset's three sections into a fresh `PromptConfig`. A preset may
 *  legitimately omit `characterFormat`/`imageGeneration` (read sites default
 *  them), so those fields stay absent rather than being half-filled. */
export function promptConfigFromPreset(preset: {
  modules: { turn: { id: string; name: string; description: string; content: string; order: number; enabled: boolean }[] };
  characterFormat?: PromptConfig["characterFormat"];
  imageGeneration?: PromptConfig["imageGeneration"];
}): PromptConfig {
  return {
    modules: { turn: preset.modules.turn.map((m) => ({ ...m })) },
    ...(preset.characterFormat ? { characterFormat: JSON.parse(JSON.stringify(preset.characterFormat)) } : {}),
    ...(preset.imageGeneration ? { imageGeneration: JSON.parse(JSON.stringify(preset.imageGeneration)) } : {}),
  };
}

/**
 * Load the global config, seeding it from the active preset when absent (fresh
 * install or a pre-change `user-settings.json` that predates `promptConfig`).
 * Falls back to the shipped "default" preset when `activePresetId` names a
 * preset that no longer exists.
 */
export function loadPromptConfig(dataDir: string): PromptConfigState {
  const settings = loadAppSettings(dataDir);
  const activePresetId = settings.activePresetId ?? "default";
  if (settings.promptConfig) {
    return { activePresetId, promptConfig: settings.promptConfig };
  }
  const presets = loadPresets();
  const preset = presets.find((p) => p.id === activePresetId) ?? presets.find((p) => p.id === "default");
  const promptConfig: PromptConfig = preset
    ? promptConfigFromPreset(preset)
    : { modules: { turn: [] } };
  saveAppSettings(dataDir, { activePresetId, promptConfig });
  return { activePresetId, promptConfig };
}

export function persistPromptConfig(
  dataDir: string,
  activePresetId: string,
  promptConfig: PromptConfig
): PromptConfigState {
  saveAppSettings(dataDir, { activePresetId, promptConfig });
  return { activePresetId, promptConfig };
}
