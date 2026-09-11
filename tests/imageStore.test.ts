import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  collectReferencedImages,
  imageFilePath,
  mimeForFile,
  saveImageBytes,
  sweepOrphanImages,
  sweepOrphansInDataDir
} from "../src/server/imageStore";
import { cleanupTempDirs, pngBytes, tempDir, writePlaythroughWithImages } from "./helpers/imageFixtures";

afterEach(cleanupTempDirs);

function imagesDir(): string {
  return join(tempDir("bobbinloom-images-"), "images");
}

function sha256(bytes: Buffer): string {
  return createHash("sha256").update(bytes).digest("hex");
}

describe("saveImageBytes", () => {
  it("writes the bytes under their sha256 and reports creation", () => {
    const dir = imagesDir();
    const bytes = pngBytes("one");
    const saved = saveImageBytes(bytes, "image/png", dir);

    expect(saved.created).toBe(true);
    expect(saved.file).toBe(`${sha256(bytes)}.png`);
    expect(readdirSync(dir)).toEqual([saved.file]);
    expect(existsSync(join(dir, saved.file))).toBe(true);
  });

  it("reuses one file for identical bytes and adds a new one for different bytes", () => {
    const dir = imagesDir();
    const first = saveImageBytes(pngBytes("same"), "image/png", dir);
    const again = saveImageBytes(pngBytes("same"), "image/png", dir);
    const other = saveImageBytes(pngBytes("other"), "image/png", dir);

    expect(again).toEqual({ file: first.file, created: false });
    expect(other.file).not.toBe(first.file);
    expect(readdirSync(dir).sort()).toEqual([first.file, other.file].sort());
  });

  it("maps the mime onto the file extension", () => {
    const dir = imagesDir();
    expect(saveImageBytes(pngBytes("j"), "image/jpeg", dir).file.endsWith(".jpg")).toBe(true);
    expect(saveImageBytes(pngBytes("w"), "image/webp", dir).file.endsWith(".webp")).toBe(true);
    // Unknown mime falls back to png, the format both dialects are asked for.
    expect(saveImageBytes(pngBytes("u"), "application/octet-stream", dir).file.endsWith(".png")).toBe(true);
  });

  it("creates the directory on demand", () => {
    const dir = imagesDir();
    expect(existsSync(dir)).toBe(false);
    saveImageBytes(pngBytes("mk"), "image/png", dir);
    expect(existsSync(dir)).toBe(true);
  });
});

describe("imageFilePath", () => {
  it("resolves a stored file to its absolute path", () => {
    const dir = imagesDir();
    const { file } = saveImageBytes(pngBytes("path"), "image/png", dir);
    expect(imageFilePath(file, dir)).toBe(join(dir, file));
  });

  it("rejects traversal and malformed names before touching the disk", () => {
    const dir = imagesDir();
    saveImageBytes(pngBytes("guard"), "image/png", dir);

    expect(imageFilePath("../../etc/passwd", dir)).toBeNull();
    expect(imageFilePath("..%2f..%2fetc%2fpasswd.png", dir)).toBeNull();
    expect(imageFilePath("/etc/passwd", dir)).toBeNull();
    expect(imageFilePath("abc.png", dir)).toBeNull();
    expect(imageFilePath(`${"a".repeat(63)}.png`, dir)).toBeNull();
    expect(imageFilePath(`${"a".repeat(64)}.gif`, dir)).toBeNull();
    expect(imageFilePath(`${"A".repeat(64)}.png`, dir)).toBeNull();
  });

  it("returns null for a well-formed name that is not on disk", () => {
    const dir = imagesDir();
    mkdirSync(dir, { recursive: true });
    expect(imageFilePath(`${"b".repeat(64)}.png`, dir)).toBeNull();
  });
});

describe("mimeForFile", () => {
  it("maps every supported extension", () => {
    expect(mimeForFile(`${"a".repeat(64)}.png`)).toBe("image/png");
    expect(mimeForFile(`${"a".repeat(64)}.jpg`)).toBe("image/jpeg");
    expect(mimeForFile(`${"a".repeat(64)}.webp`)).toBe("image/webp");
    expect(mimeForFile("weird.bin")).toBe("application/octet-stream");
  });
});

describe("collectReferencedImages", () => {
  it("collects refs from every message of every playthrough", () => {
    const dir = tempDir("bobbinloom-refs-");
    const a = pngBytes("a");
    const b = pngBytes("b");
    const pt = writePlaythroughWithImages(dir, "Refs", [[saveImageBytes(a, "image/png", dir).file], [], [saveImageBytes(b, "image/png", dir).file]]);

    const refs = collectReferencedImages([pt, writePlaythroughWithImages(dir, "NoImages", [[], []])]);
    expect([...refs].sort()).toEqual([`${sha256(a)}.png`, `${sha256(b)}.png`].sort());
  });
});

describe("sweepOrphanImages", () => {
  it("deletes only unreferenced hash-named files", () => {
    const dir = imagesDir();
    const kept = saveImageBytes(pngBytes("kept"), "image/png", dir).file;
    const orphan = saveImageBytes(pngBytes("orphan"), "image/png", dir).file;
    // Not ours to manage — a stray non-hash file must survive.
    writeFileSync(join(dir, "notes.txt"), "hello", "utf8");

    const pt = writePlaythroughWithImages(tempDir("bobbinloom-sweep-"), "Sweep", [[kept]]);
    expect(sweepOrphanImages([pt], dir)).toBe(1);

    const left = readdirSync(dir).sort();
    expect(left).toEqual([kept, "notes.txt"].sort());
    expect(left).not.toContain(orphan);
  });

  it("is a no-op when the directory does not exist", () => {
    expect(sweepOrphanImages([], join(tempDir("bobbinloom-missing-"), "images"))).toBe(0);
  });
});

describe("sweepOrphansInDataDir", () => {
  it("counts references from timeline branches, so a kept branch keeps its images", () => {
    const dataDir = tempDir("bobbinloom-branch-data-");
    const dir = imagesDir();

    const branchFile = saveImageBytes(pngBytes("branch"), "image/png", dir).file;
    const parentFile = saveImageBytes(pngBytes("parent"), "image/png", dir).file;
    const orphanFile = saveImageBytes(pngBytes("orphan2"), "image/png", dir).file;

    // A timeline branch is EXCLUDED from the default list — the sweep has to ask
    // for it explicitly or the branch's images get eaten when its parent dies.
    writePlaythroughWithImages(dataDir, "Branch", [[branchFile]], { isTimelineBranch: true });
    writePlaythroughWithImages(dataDir, "Parent", [[parentFile]]);

    expect(sweepOrphansInDataDir(dataDir, dir)).toBe(1);
    const left = readdirSync(dir).sort();
    expect(left).toEqual([branchFile, parentFile].sort());
    expect(left).not.toContain(orphanFile);
  });
});
