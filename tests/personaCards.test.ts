import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PNG_SIG, extractCharaPayload } from "../src/server/characterCards/pngText";
import {
  encodePngCharaChunk,
  encodeWebpPersonaChunk,
  exportPersonaPackage,
  extractWebpPersonaChunk,
  importPersonaPackage,
} from "../src/server/personaCards";
import {
  createPersonaRecord,
  getPersonaAvatarPath,
  savePersonaAvatar,
  updatePersonaRecord,
} from "../src/server/store";

// Minimal valid 1x1 PNG bytes (IHDR + IDAT + IEND)
const MINIMAL_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
  "base64",
);

// Minimal valid RIFF WebP container
function makeMinimalWebp(): Buffer {
  const chunkPayload = Buffer.from([0x2f, 0x00, 0x00, 0x00]);
  const buf = Buffer.alloc(12 + 8 + chunkPayload.length);
  buf.write("RIFF", 0, 4, "ascii");
  buf.writeUInt32LE(buf.length - 8, 4);
  buf.write("WEBP", 8, 4, "ascii");
  buf.write("VP8L", 12, 4, "ascii");
  buf.writeUInt32LE(chunkPayload.length, 16);
  chunkPayload.copy(buf, 20);
  return buf;
}

describe("personaCards export & import", () => {
  it("encodes and decodes PNG chara tEXt chunk round-trip", () => {
    const json = JSON.stringify({
      spec: "bobbinloom_persona",
      specVersion: "1.0",
      data: { name: "Mira" },
    });
    const encoded = encodePngCharaChunk(MINIMAL_PNG, json);
    expect(encoded.subarray(0, 8).equals(PNG_SIG)).toBe(true);
    const extractedBase64 = extractCharaPayload(encoded);
    expect(extractedBase64).toBeTruthy();
    const decoded = Buffer.from(extractedBase64!, "base64").toString("utf8");
    expect(JSON.parse(decoded)).toEqual(JSON.parse(json));
  });

  it("encodes and decodes WebP BLOM RIFF chunk round-trip", () => {
    const webp = makeMinimalWebp();
    const json = JSON.stringify({
      spec: "bobbinloom_persona",
      specVersion: "1.0",
      data: { name: "John Bobbin", bodyType: "- Height: 5'10\"" },
    });
    const encoded = encodeWebpPersonaChunk(webp, json);
    const { jsonPayload, cleanWebpBytes } = extractWebpPersonaChunk(encoded);
    expect(jsonPayload).toBe(json);
    expect(cleanWebpBytes.equals(webp)).toBe(true);
  });

  it("falls back to .json when exporting a persona with no portrait as .webp or .png, and round-trips .json / .webp / .png imports", async () => {
    const tmpDir = mkdtempSync(join(tmpdir(), "bl-persona-cards-"));
    try {
      const created = createPersonaRecord("No Portrait Hero", undefined, tmpDir);
      updatePersonaRecord(
        created.id,
        {
          description: "Brave wanderer.",
          bodyType: "- Height: 6'0\"",
          appearance: "- Eyes: Green",
          initialClothing: [{ slot: "Top", name: "Cloak", state: "worn" }],
        },
        tmpDir,
      );

      // Requesting .webp without a portrait falls back to .json
      const fallbackExport = await exportPersonaPackage(
        created.id,
        "webp",
        tmpDir,
      );
      expect(fallbackExport).not.toBeNull();
      expect(fallbackExport!.actualFormat).toBe("json");
      expect(fallbackExport!.fileName).toBe("no-portrait-hero.persona.json");

      // Import the exported .json into a fresh persona
      const importedFromJson = await importPersonaPackage(
        fallbackExport!.buffer,
        tmpDir,
      );
      expect(importedFromJson.name).toBe("No Portrait Hero");
      expect(importedFromJson.description).toBe("Brave wanderer.");
      expect(importedFromJson.bodyType).toBe("- Height: 6'0\"");
      expect(importedFromJson.initialClothing).toEqual([
        { slot: "Top", name: "Cloak", state: "worn" },
      ]);

      // Add a portrait and a dedicated profile crop, then export as .webp and .png
      const webpPortrait = makeMinimalWebp();
      savePersonaAvatar(created.id, "portrait", webpPortrait, "webp", tmpDir);
      savePersonaAvatar(created.id, "profile", MINIMAL_PNG, "png", tmpDir);

      const webpExport = await exportPersonaPackage(created.id, "webp", tmpDir);
      expect(webpExport).not.toBeNull();
      expect(webpExport!.actualFormat).toBe("webp");
      expect(webpExport!.fileName).toBe("no-portrait-hero.persona.webp");

      const importedFromWebp = await importPersonaPackage(
        webpExport!.buffer,
        tmpDir,
      );
      expect(importedFromWebp.name).toBe("No Portrait Hero");
      expect(importedFromWebp.customPortrait).toBeDefined();
      expect(importedFromWebp.profileImage).toBeDefined();
      expect(
        getPersonaAvatarPath(importedFromWebp.id, "portrait", tmpDir),
      ).toBeTruthy();
      expect(
        getPersonaAvatarPath(importedFromWebp.id, "profile", tmpDir),
      ).toBeTruthy();
    } finally {
      rmSync(tmpDir, { recursive: true, force: true });
    }
  });
});
