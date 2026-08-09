import {
  copyFileSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import { dirname, join } from "node:path";

/** Write JSON to `path` atomically: serialize with 2-space indent (identical
 *  bytes to the writeFileSync calls it replaces), write to a `.tmp` sibling,
 *  then rename over the target. Rename is atomic on the same filesystem
 *  (Windows renameSync overwrites via MoveFileEx REPLACE_EXISTING). No fsync —
 *  a crash may leave a stale `.tmp`, never a corrupt final file. */
export function atomicWriteJson(path: string, data: unknown): void {
  atomicWriteText(path, JSON.stringify(data, null, 2));
}

/** Write plain text to `path` atomically (tmp + rename). */
export function atomicWriteText(path: string, text: string): void {
  mkdirSync(dirname(path), { recursive: true });
  const tmp = path + ".tmp";
  writeFileSync(tmp, text, "utf8");
  renameSync(tmp, path);
}

/** Format a timestamp suffix like `.bak.20260808-101530`. */
export function timestampSuffix(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}` +
    `-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  );
}

/** path + suffix, or a timestamped variant when the plain suffix is taken. */
function nextSuffixPath(path: string, suffix: string): string {
  if (!existsSync(path + suffix)) return path + suffix;
  return `${path}${suffix}.${timestampSuffix()}`;
}

/** Copy `path` to `path + ".bak"` (timestamped if the plain `.bak` already
 *  exists). Returns the backup path, or null on failure. Never deletes. */
export function backupFile(path: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const backup = nextSuffixPath(path, ".bak");
    copyFileSync(path, backup);
    return backup;
  } catch {
    return null;
  }
}

/** Rename `path` to `path + ".bak"` (timestamped if the plain `.bak` already
 *  exists). Returns the new path, or null on failure. Quarantine NEVER deletes
 *  — the data always survives as a sidecar for manual recovery. */
export function quarantineFile(path: string, reason: string): string | null {
  try {
    if (!existsSync(path)) return null;
    const backup = nextSuffixPath(path, ".bak");
    renameSync(path, backup);
    return backup;
  } catch {
    return null;
  }
}

/** Remove `*.tmp` files in `dir` (stale leftovers from crashed atomic writes).
 *  No-op when the directory is missing or unreadable. */
export function cleanupStaleTmp(dir: string): void {
  let entries: string[];
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    if (entry.endsWith(".tmp")) {
      try {
        unlinkSync(join(dir, entry));
      } catch {
        // ignore per-file failures — best effort cleanup
      }
    }
  }
}

export type ReadJsonResult =
  | { ok: true; data: unknown }
  | { ok: false; reason: string };

/** Read + parse a JSON file with discriminated failure reasons:
 *  "missing" vs "unparseable: <error message>". */
export function readJsonFile(path: string): ReadJsonResult {
  if (!existsSync(path)) return { ok: false, reason: "missing" };
  try {
    const raw = readFileSync(path, "utf8");
    return { ok: true, data: JSON.parse(raw) as unknown };
  } catch (e) {
    return {
      ok: false,
      reason: `unparseable: ${e instanceof Error ? e.message : String(e)}`
    };
  }
}
