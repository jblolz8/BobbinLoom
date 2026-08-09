import type { FastifyReply } from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { PromptPreset } from "../../schemas";
import { loadAppSettings, saveAppSettings } from "../appSettingsStore";
import { createProviderManager } from "../providerManager";
import { atomicWriteJson } from "../persistence";

export { loadAppSettings, saveAppSettings };

export const dataDir = join(process.cwd(), "data", "playthroughs");
export const settingsDir = join(process.cwd(), "data");
export const providerManager = createProviderManager(settingsDir);

export function presetsPath(): string {
  return join(process.cwd(), "data", "prompt-presets.json");
}

export function loadPresets(): PromptPreset[] {
  const path = presetsPath();
  if (!existsSync(path)) return [];
  try {
    return JSON.parse(readFileSync(path, "utf8")) as PromptPreset[];
  } catch {
    return [];
  }
}

export function savePresets(presets: PromptPreset[]): void {
  atomicWriteJson(presetsPath(), presets);
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
