import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { decryptApiKey, encryptApiKey, loadOrCreateVaultKey } from "../src/server/keyVault";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-vault-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("keyVault", () => {
  it("round-trips an api key through AES-256-GCM", () => {
    const dir = tempDir();
    const key = loadOrCreateVaultKey(dir);
    const stored = encryptApiKey("sk-secret-1234", key);
    expect(stored.startsWith("enc:v1:")).toBe(true);
    expect(stored).not.toContain("sk-secret-1234");
    expect(decryptApiKey(stored, key)).toBe("sk-secret-1234");
  });

  it("creates the key file on first use and reuses it afterwards", () => {
    const dir = tempDir();
    const k1 = loadOrCreateVaultKey(dir);
    const k2 = loadOrCreateVaultKey(dir);
    expect(k1.equals(k2)).toBe(true);
    expect(existsSync(join(dir, ".providers-key"))).toBe(true);
  });

  it("rejects decryption with a different key", () => {
    const dir = tempDir();
    const other = tempDir();
    const stored = encryptApiKey("sk-x", loadOrCreateVaultKey(dir));
    expect(decryptApiKey(stored, loadOrCreateVaultKey(other))).toBeNull();
  });

  it("passes through legacy plaintext values untouched", () => {
    expect(decryptApiKey("sk-legacy", Buffer.alloc(32))).toBe("sk-legacy");
  });

  it("regenerates a corrupt key file", () => {
    const dir = tempDir();
    loadOrCreateVaultKey(dir);
    writeFileSync(join(dir, ".providers-key"), "not-a-valid-32-byte-key-!!", "utf8");
    const key = loadOrCreateVaultKey(dir);
    expect(key.length).toBe(32);
  });
});
