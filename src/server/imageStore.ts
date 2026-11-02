import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, statSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import type { Playthrough } from "../schemas";
import { MIME_BY_EXT } from "./imageProvider/shared";
import { atomicWriteFile } from "./persistence";
import {
  listPlaythroughRecords,
  playthroughImagesDir,
} from "./store";

/** Default fallback image store directory (`data/images`); primary storage is now
 *  per-playthrough (`data/playthroughs/<play_id>/images/<sha256>.<ext>`). */
export const IMAGES_DIR = join(process.cwd(), "data", "images");

/** Traversal guard: 64 lowercase hex chars and one known extension. Nothing
 *  else is ever joined onto an images directory. */
const FILE_RE = /^[a-f0-9]{64}\.(png|jpg|webp)$/;

const EXT_BY_MIME: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** Writes bytes under their sha256. Identical bytes reuse one file on disk. */
export function saveImageBytes(
  bytes: Buffer,
  mime: string,
  dir: string = IMAGES_DIR,
): { file: string; created: boolean } {
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
 *  traversal attempt can never reach the disk.
 *
 *  Checks:
 *  1) `data/playthroughs/<playthroughId>/images/<file>` when `dataDir` + `playthroughId` are given.
 *  2) Direct `dir/<file>` (supports unit tests and custom `imagesDir` seams).
 *  3) Per-playthrough `<dataDir>/<id>/images/<file>` across playthrough folders. */
export function imageFilePath(
  file: string,
  dir: string = IMAGES_DIR,
  dataDir?: string,
  playthroughId?: string,
): string | null {
  if (!FILE_RE.test(file)) return null;

  if (dataDir && playthroughId) {
    const ptCandidate = join(playthroughImagesDir(dataDir, playthroughId), file);
    if (existsSync(ptCandidate)) return ptCandidate;
  }

  const directPath = join(dir, file);
  if (existsSync(directPath)) return directPath;

  const playthroughsRoot =
    dataDir ??
    (existsSync(join(dirname(dir), "playthroughs"))
      ? join(dirname(dir), "playthroughs")
      : null);

  if (playthroughsRoot && existsSync(playthroughsRoot)) {
    try {
      const entries = readdirSync(playthroughsRoot, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isDirectory() || entry.name.endsWith(".bak")) continue;
        const candidate = join(playthroughsRoot, entry.name, "images", file);
        if (existsSync(candidate)) return candidate;
      }
    } catch {
      /* ignore */
    }
  }

  return null;
}

export function mimeForFile(file: string): string {
  const ext = file.slice(file.lastIndexOf(".") + 1);
  return MIME_BY_EXT[ext] ?? "application/octet-stream";
}

/** Every file name referenced by any message — or by a manual cover — of any of the given
 *  playthroughs. */
export function collectReferencedImages(
  playthroughs: Playthrough[],
): Set<string> {
  const refs = new Set<string>();
  for (const playthrough of playthroughs) {
    for (const message of playthrough.messages ?? []) {
      for (const image of message.images ?? []) {
        if (image?.file) refs.add(image.file);
      }
    }
    if (playthrough.cover?.file) refs.add(playthrough.cover.file);
  }
  return refs;
}

function sweepDirReturningRemoved(
  referenced: Set<string>,
  dir: string,
): Set<string> {
  const removed = new Set<string>();
  if (!existsSync(dir)) return removed;
  for (const entry of readdirSync(dir)) {
    if (!FILE_RE.test(entry) || referenced.has(entry)) continue;
    try {
      unlinkSync(join(dir, entry));
      removed.add(entry);
    } catch {
      // Raced with another sweep (or already gone) — not a failure.
    }
  }
  return removed;
}

/** Deletes unreferenced files; returns the count removed. Files that are not
 *  hash-named are left alone — the store does not own that namespace. */
export function sweepOrphanImages(
  playthroughs: Playthrough[],
  dir: string = IMAGES_DIR,
): number {
  const referenced = collectReferencedImages(playthroughs);
  return sweepDirReturningRemoved(referenced, dir).size;
}

/** Sweep helper for call sites that have the playthroughs data directory.
 *  Sweeps each playthrough's dedicated `<dataDir>/<id>/images/` folder against that
 *  playthrough's own references, plus any shared/legacy `imagesDir` when present. */
export function sweepOrphansInDataDir(
  dataDir: string,
  imagesDir: string = IMAGES_DIR,
): number {
  const { playthroughs } = listPlaythroughRecords(dataDir, {
    includeTimelineBranches: true,
  });
  const removedFiles = new Set<string>();

  for (const pt of playthroughs) {
    const ptDir = playthroughImagesDir(dataDir, pt.id);
    if (existsSync(ptDir) && statSync(ptDir).isDirectory()) {
      const ptRefs = collectReferencedImages([pt]);
      for (const file of sweepDirReturningRemoved(ptRefs, ptDir)) {
        removedFiles.add(file);
      }
    }
  }

  if (existsSync(imagesDir)) {
    const allRefs = collectReferencedImages(playthroughs);
    for (const file of sweepDirReturningRemoved(allRefs, imagesDir)) {
      removedFiles.add(file);
    }
  }

  return removedFiles.size;
}
