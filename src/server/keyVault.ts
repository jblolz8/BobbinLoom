import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteText } from "./persistence";

const PREFIX = "enc:v1:";
const KEY_FILE = ".providers-key";

function keyPath(dataDir: string): string {
  return join(dataDir, KEY_FILE);
}

/** Load the per-machine vault key, creating it on first use. A corrupt or
 *  missing key file is regenerated (existing encrypted keys then become
 *  unreadable — callers degrade gracefully). */
export function loadOrCreateVaultKey(dataDir: string): Buffer {
  const path = keyPath(dataDir);
  if (existsSync(path)) {
    try {
      const key = Buffer.from(readFileSync(path, "utf8").trim(), "base64");
      if (key.length === 32) return key;
      console.warn(`[keyVault] ${KEY_FILE} is invalid (expected 32 bytes) — generating a new key. Existing encrypted keys will be unreadable.`);
    } catch {
      console.warn(`[keyVault] ${KEY_FILE} unreadable — generating a new key.`);
    }
  }
  const key = randomBytes(32);
  mkdirSync(dataDir, { recursive: true });
  atomicWriteText(path, key.toString("base64"));
  return key;
}

/** Encrypt a plaintext api key for storage (AES-256-GCM, random IV + auth tag). */
export function encryptApiKey(plaintext: string, key: Buffer): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${data.toString("base64")}`;
}

/** Decrypt a stored api key. Non-"enc:" values pass through untouched (legacy
 *  plaintext). Returns null when decryption fails (wrong/missing key, corruption). */
export function decryptApiKey(stored: string, key: Buffer): string | null {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const parts = stored.slice(PREFIX.length).split(":");
  if (parts.length !== 3) return null;
  const [ivB64, tagB64, dataB64] = parts;
  try {
    const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
    decipher.setAuthTag(Buffer.from(tagB64, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(dataB64, "base64")),
      decipher.final()
    ]).toString("utf8");
  } catch {
    return null;
  }
}
