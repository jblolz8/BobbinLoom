/** Shared fixtures for the image pipeline tests: temp dirs, real PNG bytes, and
 *  playthrough records carrying image refs. Everything writes under a temp dir
 *  — no test may touch the real data/ directory. */
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { EMPTY_MODULE_SET, type MessageImage, type Playthrough } from "../../src/schemas";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../../src/engine/imageDefaults";
import { createBlankPlaythroughRecord, updatePlaythroughRecord } from "../../src/server/store";
import { makePng } from "./pngBuilder";

const tempDirs: string[] = [];

export function tempDir(prefix: string): string {
  const dir = mkdtempSync(join(tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

export function cleanupTempDirs(): void {
  while (tempDirs.length) {
    const dir = tempDirs.pop()!;
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Distinct-but-real PNG bytes per `seed`. */
export function pngBytes(seed: string): Buffer {
  return makePng(`fixture-${seed}`);
}

export function imageRef(file: string, overrides: Partial<MessageImage> = {}): MessageImage {
  return {
    file,
    prompt: "a test prompt",
    negativePrompt: "a test negative",
    providerId: "venice_images",
    model: "test-image-model",
    durationMs: 1200,
    createdAt: new Date().toISOString(),
    ...overrides
  };
}

/** Write a playthrough whose messages carry `filesPerMessage[i]` as images.
 *  Message roles alternate assistant/user starting with assistant (index 0), so
 *  every even index is a legal image target. */
export function writePlaythroughWithImages(
  dir: string,
  name: string,
  filesPerMessage: string[][] = [],
  overrides: Partial<Playthrough> = {}
): Playthrough {
  // An EXPLICIT preset override, so this fixture never consults
  // data/user-settings.json + data/prompt-presets.json. Without it the record
  // inherits whatever default preset the running app has set — the day it was
  // switched to Default (NSFW), three route tests started composing a different
  // negative prompt and failed on the user's own setting.
  const pt = createBlankPlaythroughRecord(dir, name, undefined, [], undefined, undefined, {
    id: "default",
    name: "Default",
    modules: EMPTY_MODULE_SET,
    imageGeneration: DEFAULT_IMAGE_GENERATION_SETTINGS
  });
  pt.messages = filesPerMessage.map((files, i) => ({
    id: `msg_${name.replace(/\W+/g, "_")}_${i}`,
    role: i % 2 === 0 ? ("assistant" as const) : ("user" as const),
    content: `message ${i} of ${name}`,
    createdAt: new Date(2026, 0, 1, 0, i).toISOString(),
    ...(files.length ? { images: files.map((file) => imageRef(file)) } : {})
  }));
  Object.assign(pt, overrides);
  updatePlaythroughRecord(dir, pt);
  return pt;
}
