import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  atomicWriteJson,
  atomicWriteText,
  backupFile,
  cleanupStaleTmp,
  quarantineFile,
  readJsonFile
} from "../src/server/persistence";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-persist-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("persistence", () => {
  describe("atomicWriteJson", () => {
    it("writes valid JSON at the final path with no .tmp left behind", () => {
      const dir = tempDir();
      const path = join(dir, "nested", "file.json");

      atomicWriteJson(path, { a: 1, b: [1, 2] });

      expect(existsSync(path)).toBe(true);
      expect(existsSync(path + ".tmp")).toBe(false);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ a: 1, b: [1, 2] });
    });

    it("creates parent directories", () => {
      const dir = tempDir();
      const path = join(dir, "a", "b", "c.json");

      atomicWriteJson(path, { ok: true });

      expect(existsSync(path)).toBe(true);
      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ ok: true });
    });

    it("overwrites an existing file atomically", () => {
      const dir = tempDir();
      const path = join(dir, "file.json");

      atomicWriteJson(path, { v: 1 });
      atomicWriteJson(path, { v: 2 });

      expect(JSON.parse(readFileSync(path, "utf8"))).toEqual({ v: 2 });
      expect(existsSync(path + ".tmp")).toBe(false);
    });
  });

  describe("atomicWriteText", () => {
    it("writes plain text at the final path", () => {
      const dir = tempDir();
      const path = join(dir, "note.txt");

      atomicWriteText(path, "hello world");

      expect(readFileSync(path, "utf8")).toBe("hello world");
      expect(existsSync(path + ".tmp")).toBe(false);
    });
  });

  describe("cleanupStaleTmp", () => {
    it("removes *.tmp files but leaves real files untouched", () => {
      const dir = tempDir();
      writeFileSync(join(dir, "stale.json.tmp"), "x", "utf8");
      writeFileSync(join(dir, "good.json"), "{}", "utf8");

      cleanupStaleTmp(dir);

      expect(existsSync(join(dir, "stale.json.tmp"))).toBe(false);
      expect(existsSync(join(dir, "good.json"))).toBe(true);
    });

    it("is a no-op on a missing directory", () => {
      expect(() => cleanupStaleTmp(join(tempDir(), "does-not-exist"))).not.toThrow();
    });
  });

  describe("backupFile", () => {
    it("copies the file to path.bak and returns the backup path", () => {
      const dir = tempDir();
      const path = join(dir, "file.json");
      writeFileSync(path, "data", "utf8");

      const backup = backupFile(path);

      expect(backup).toBe(path + ".bak");
      expect(readFileSync(path, "utf8")).toBe("data");
      expect(readFileSync(backup!, "utf8")).toBe("data");
    });

    it("uses a timestamped suffix when .bak already exists", () => {
      const dir = tempDir();
      const path = join(dir, "file.json");
      writeFileSync(path, "v1", "utf8");
      writeFileSync(path + ".bak", "older", "utf8");

      const backup = backupFile(path);

      expect(backup).not.toBeNull();
      expect(backup).toMatch(/\.bak\.\d{8}-\d{6}$/);
      expect(readFileSync(backup!, "utf8")).toBe("v1");
      expect(readFileSync(path + ".bak", "utf8")).toBe("older"); // first backup untouched
    });

    it("returns null when the source file is missing", () => {
      expect(backupFile(join(tempDir(), "ghost.json"))).toBeNull();
    });
  });

  describe("quarantineFile", () => {
    it("renames the file to .bak and never deletes it", () => {
      const dir = tempDir();
      const path = join(dir, "file.json");
      writeFileSync(path, "corrupt", "utf8");

      const moved = quarantineFile(path, "unparseable");

      expect(moved).toBe(path + ".bak");
      expect(existsSync(path)).toBe(false);
      expect(readFileSync(moved!, "utf8")).toBe("corrupt"); // data survives
    });

    it("uses a timestamped suffix when .bak already exists", () => {
      const dir = tempDir();
      const path = join(dir, "file.json");
      writeFileSync(path, "bad", "utf8");
      writeFileSync(path + ".bak", "older", "utf8");

      const moved = quarantineFile(path, "corrupt");

      expect(moved).toMatch(/\.bak\.\d{8}-\d{6}$/);
      expect(readFileSync(moved!, "utf8")).toBe("bad");
      expect(readFileSync(path + ".bak", "utf8")).toBe("older");
    });

    it("returns null when there is nothing to quarantine", () => {
      expect(quarantineFile(join(tempDir(), "ghost.json"), "missing")).toBeNull();
    });
  });

  describe("readJsonFile", () => {
    it("returns ok with parsed data for a valid file", () => {
      const dir = tempDir();
      const path = join(dir, "valid.json");
      writeFileSync(path, '{"x": 42}', "utf8");

      const res = readJsonFile(path);

      expect(res.ok).toBe(true);
      if (res.ok) expect(res.data).toEqual({ x: 42 });
    });

    it("discriminates a missing file", () => {
      const res = readJsonFile(join(tempDir(), "missing.json"));

      expect(res.ok).toBe(false);
      if (!res.ok) expect(res.reason).toBe("missing");
    });

    it("discriminates an unparseable file and includes the error message", () => {
      const dir = tempDir();
      const path = join(dir, "bad.json");
      writeFileSync(path, "{ not json", "utf8");

      const res = readJsonFile(path);

      expect(res.ok).toBe(false);
      if (!res.ok) {
        expect(res.reason).toMatch(/^unparseable:/);
        expect(res.reason.length).toBeGreaterThan("unparseable:".length);
      }
    });
  });
});
