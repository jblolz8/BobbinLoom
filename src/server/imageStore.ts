import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, unlinkSync } from "node:fs";
import { join } from "node:path";
import type { Playthrough } from "../schemas";
import { MIME_BY_EXT } from "./imageProvider/shared";
import { atomicWriteFile } from "./persistence";
import { listPlaythroughRecords } from "./store";

/** Content-addressed image store: `data/images/<sha256>.<ext>`.
 *
 *  Bytes are SHARED, never owned: `branchPlaythroughRecord` structuredClones a
 *  playthrough by value, so a branch's messages hold the same `file` names as
 *  its parent. That is why deletion is ref-counted by a sweep over every
 *  playthrough (branches included) rather than by unlink-on-delete. */
export const IMAGES_DIR = join(process.cwd(), "data", "images");

/** Traversal guard: 64 lowercase hex chars and one known extension. Nothing
 *  else is ever joined onto the images directory. */
const FILE_RE = /^[a-f0-9]{64}\.(png|jpg|webp)$/;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp"
};

/** Writes bytes under their sha256. Identical bytes (a re-roll that reproduces
 *  the same image, or a branch copying a message) reuse one file on disk. */
export function saveImageBytes(bytes: Buffer, mime: string, dir: string = IMAGES_DIR): { file: string; created: boolean } {
  mkdirSync(dir, { recursive: true });
  const ext = EXT_BY_MIME[mime] ?? "png";
  const file = `${createHash("sha256").update(bytes).digest("hex")}.${ext}`;
  const path = join(dir, file);
  if (existsSync(path)) return { file, created: false };
  atomicWriteFile(path, bytes);
  return { file, created: true };
}

/** Absolute path for a stored file, or null when the name is malformed or the
 *  file is missing. EVERY read path goes through this (the serve route, the
 *  per-image delete) — the regex runs before any filesystem call, so a
 *  traversal attempt can never reach the disk. */
export function imageFilePath(file: string, dir: string = IMAGES_DIR): string | null {
  if (!FILE_RE.test(file)) return null;
  const path = join(dir, file);
  return existsSync(path) ? path : null;
}

export function mimeForFile(file: string): string {
  const ext = file.slice(file.lastIndexOf(".") + 1);
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Every file name referenced by any message of any of the given playthroughs. */
export function collectReferencedImages(playthroughs: Playthrough[]): Set<string> {
  const refs = new Set<string>();
  for (const playthrough of playthroughs) {
    for (const message of playthrough.messages ?? []) {
      for (const image of message.images ?? []) {
        if (image?.file) refs.add(image.file);
      }
    }
  }
  return refs;
}

/** Deletes unreferenced files; returns the count removed. Files that are not
 *  hash-named are left alone — the store does not own that namespace. */
export function sweepOrphanImages(playthroughs: Playthrough[], dir: string = IMAGES_DIR): number {
  if (!existsSync(dir)) return 0;
  const referenced = collectReferencedImages(playthroughs);
  let removed = 0;
  for (const entry of readdirSync(dir)) {
    if (!FILE_RE.test(entry) || referenced.has(entry)) continue;
    try {
      unlinkSync(join(dir, entry));
      removed += 1;
    } catch {
      // Raced with another sweep (or already gone) — not a failure.
    }
  }
  return removed;
}

/** Sweep helper for call sites that only have the data directory. It MUST read
 *  the list with `includeTimelineBranches` — a timeline branch is excluded from
 *  the default list, so a sweep that skipped branches would delete a surviving
 *  branch's images the moment its parent was deleted. */
export function sweepOrphansInDataDir(dataDir: string, imagesDir: string = IMAGES_DIR): number {
  const { playthroughs } = listPlaythroughRecords(dataDir, { includeTimelineBranches: true });
  return sweepOrphanImages(playthroughs, imagesDir);
}
