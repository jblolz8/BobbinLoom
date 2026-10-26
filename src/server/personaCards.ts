import { readFileSync } from "node:fs";
import { z } from "zod";
import type { ExportFormat, PlayerPersona } from "../schemas";
import { PNG_SIG, extractCharaPayload } from "./characterCards/pngText";
import { transcodeToPng, transcodeToWebp } from "./imageTranscode";
import {
  PERSONAS_DIR,
  createPersonaRecord,
  getPersona,
  getPersonaAvatarPath,
  savePersonaAvatar,
  updatePersonaRecord,
} from "./store";

const WEBP_BLOM_FOURCC = "BLOM";

const PersonaClothingItemSchema = z.object({
  slot: z.string(),
  name: z.string(),
  state: z.string().optional(),
});

const PersonaDataFieldsSchema = z.object({
  name: z.string().min(1),
  description: z.string().optional().default(""),
  bodyType: z.string().optional().default(""),
  appearance: z.string().optional().default(""),
  initialClothing: z.array(PersonaClothingItemSchema).optional().default([]),
});

export type PersonaCardPayload = {
  spec: "bobbinloom_persona";
  specVersion: "1.0";
  data: {
    name: string;
    description: string;
    bodyType: string;
    appearance: string;
    initialClothing: Array<{ slot: string; name: string; state?: string }>;
  };
  avatars?: {
    portraitBase64?: string;
    profileBase64?: string;
  };
};

/** Standard IEEE 802.3 CRC-32 used by PNG chunks. */
function crc32(buf: Buffer): number {
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc ^= buf[i];
    for (let bit = 0; bit < 8; bit++) {
      crc = (crc >>> 1) ^ (crc & 1 ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Inject a `tEXt` chunk (`chara\0<base64>`) immediately before `IEND` in a PNG buffer. */
export function encodePngCharaChunk(
  pngBytes: Buffer,
  jsonPayload: string,
): Buffer {
  if (pngBytes.length < 8 || !pngBytes.subarray(0, 8).equals(PNG_SIG)) {
    throw new Error("Invalid PNG buffer");
  }
  const keyword = Buffer.from("chara\0", "latin1");
  const base64Text = Buffer.from(
    Buffer.from(jsonPayload, "utf8").toString("base64"),
    "latin1",
  );
  const chunkData = Buffer.concat([keyword, base64Text]);
  const chunkType = Buffer.from("tEXt", "ascii");
  const chunkLen = Buffer.alloc(4);
  chunkLen.writeUInt32BE(chunkData.length, 0);
  const chunkCrc = Buffer.alloc(4);
  chunkCrc.writeUInt32BE(crc32(Buffer.concat([chunkType, chunkData])), 0);
  const textChunk = Buffer.concat([chunkLen, chunkType, chunkData, chunkCrc]);

  // Walk PNG chunks, stripping any existing `chara` tEXt chunk and inserting before IEND
  const chunks: Buffer[] = [pngBytes.subarray(0, 8)];
  let offset = 8;
  let inserted = false;
  while (offset + 8 <= pngBytes.length) {
    const len = pngBytes.readUInt32BE(offset);
    const type = pngBytes.toString("ascii", offset + 4, offset + 8);
    const totalChunkLen = 8 + len + 4;
    if (offset + totalChunkLen > pngBytes.length) break;

    if (type === "tEXt") {
      const data = pngBytes.subarray(offset + 8, offset + 8 + len);
      const nul = data.indexOf(0);
      if (nul > 0 && data.toString("latin1", 0, nul) === "chara") {
        offset += totalChunkLen;
        continue;
      }
    }

    if (type === "IEND" && !inserted) {
      chunks.push(textChunk);
      inserted = true;
    }
    chunks.push(pngBytes.subarray(offset, offset + totalChunkLen));
    offset += totalChunkLen;
  }

  if (!inserted) {
    chunks.push(textChunk);
  }
  return Buffer.concat(chunks);
}

export function isWebpBuffer(bytes: Buffer): boolean {
  return (
    bytes.length >= 12 &&
    bytes.toString("ascii", 0, 4) === "RIFF" &&
    bytes.toString("ascii", 8, 12) === "WEBP"
  );
}

/** Strip any existing `BLOM` chunk from a RIFF WebP buffer and return clean image bytes + extracted JSON string. */
export function extractWebpPersonaChunk(webpBytes: Buffer): {
  jsonPayload: string | null;
  cleanWebpBytes: Buffer;
} {
  if (!isWebpBuffer(webpBytes)) {
    return { jsonPayload: null, cleanWebpBytes: webpBytes };
  }

  const keptChunks: Buffer[] = [];
  let foundPayload: string | null = null;
  let offset = 12;

  while (offset + 8 <= webpBytes.length) {
    const fourCC = webpBytes.toString("ascii", offset, offset + 4);
    const chunkSize = webpBytes.readUInt32LE(offset + 4);
    const dataStart = offset + 8;
    const dataEnd = dataStart + chunkSize;
    const paddedSize = chunkSize + (chunkSize % 2);
    const nextOffset = dataStart + paddedSize;

    if (dataEnd > webpBytes.length) break;

    if (fourCC === WEBP_BLOM_FOURCC) {
      const raw = webpBytes.subarray(dataStart, dataEnd).toString("utf8");
      try {
        // Support either raw UTF-8 JSON or base64-encoded JSON
        foundPayload = raw.trim().startsWith("{")
          ? raw
          : Buffer.from(raw, "base64").toString("utf8");
      } catch {
        foundPayload = null;
      }
    } else {
      const sliceEnd = Math.min(nextOffset, webpBytes.length);
      keptChunks.push(webpBytes.subarray(offset, sliceEnd));
    }

    offset = nextOffset;
  }

  const body = Buffer.concat(keptChunks);
  const header = Buffer.alloc(12);
  header.write("RIFF", 0, 4, "ascii");
  header.writeUInt32LE(4 + body.length, 4);
  header.write("WEBP", 8, 4, "ascii");

  return {
    jsonPayload: foundPayload,
    cleanWebpBytes: Buffer.concat([header, body]),
  };
}

/** Append a `BLOM` metadata chunk to a RIFF WebP buffer and update the RIFF container size. */
export function encodeWebpPersonaChunk(
  webpBytes: Buffer,
  jsonPayload: string,
): Buffer {
  const { cleanWebpBytes } = extractWebpPersonaChunk(webpBytes);
  if (!isWebpBuffer(cleanWebpBytes)) {
    throw new Error("Invalid WebP buffer");
  }

  const payloadBytes = Buffer.from(jsonPayload, "utf8");
  const padByte =
    payloadBytes.length % 2 === 1 ? Buffer.from([0]) : Buffer.alloc(0);
  const chunkHeader = Buffer.alloc(8);
  chunkHeader.write(WEBP_BLOM_FOURCC, 0, 4, "ascii");
  chunkHeader.writeUInt32LE(payloadBytes.length, 4);

  const combined = Buffer.concat([
    cleanWebpBytes,
    chunkHeader,
    payloadBytes,
    padByte,
  ]);
  combined.writeUInt32LE(combined.length - 8, 4);
  return combined;
}

function slugifyFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "persona"
  );
}

async function ensurePngBytes(imageBytes: Buffer): Promise<Buffer> {
  if (imageBytes.length >= 8 && imageBytes.subarray(0, 8).equals(PNG_SIG)) {
    return imageBytes;
  }
  return transcodeToPng(imageBytes);
}

async function ensureWebpBytes(imageBytes: Buffer): Promise<Buffer> {
  if (isWebpBuffer(imageBytes)) {
    return imageBytes;
  }
  const transcoded = await transcodeToWebp(imageBytes, "webp", 90);
  if (isWebpBuffer(transcoded.bytes)) {
    return transcoded.bytes;
  }
  throw new Error("Could not encode portrait image to WebP");
}

export type ExportedPersonaPackage = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  actualFormat: ExportFormat;
};

export async function exportPersonaPackage(
  id: string,
  requestedFormat: ExportFormat,
  dir: string = PERSONAS_DIR,
): Promise<ExportedPersonaPackage | null> {
  const persona = getPersona(id, dir);
  if (!persona) return null;

  const portraitPath = getPersonaAvatarPath(id, "portrait", dir);
  const profilePath = getPersonaAvatarPath(id, "profile", dir);
  const hasDedicatedProfile = Boolean(
    profilePath && portraitPath && profilePath !== portraitPath,
  );

  const portraitBytes = portraitPath ? readFileSync(portraitPath) : null;
  const profileBytes =
    hasDedicatedProfile && profilePath ? readFileSync(profilePath) : null;

  const baseSlug = slugifyFileName(persona.name);

  // If an image format was requested but the persona has no portrait, fall back to .json
  const effectiveFormat: ExportFormat =
    (requestedFormat === "webp" || requestedFormat === "png") && !portraitBytes
      ? "json"
      : requestedFormat;

  const basePayload: PersonaCardPayload = {
    spec: "bobbinloom_persona",
    specVersion: "1.0",
    data: {
      name: persona.name,
      description: persona.description,
      bodyType: persona.bodyType,
      appearance: persona.appearance,
      initialClothing: persona.initialClothing,
    },
  };

  if (effectiveFormat === "webp" && portraitBytes) {
    const webpImage = await ensureWebpBytes(portraitBytes);
    const payload: PersonaCardPayload = {
      ...basePayload,
      ...(profileBytes
        ? { avatars: { profileBase64: profileBytes.toString("base64") } }
        : {}),
    };
    const encoded = encodeWebpPersonaChunk(webpImage, JSON.stringify(payload));
    return {
      buffer: encoded,
      mimeType: "image/webp",
      fileName: `${baseSlug}.persona.webp`,
      actualFormat: "webp",
    };
  }

  if (effectiveFormat === "png" && portraitBytes) {
    const pngImage = await ensurePngBytes(portraitBytes);
    const payload: PersonaCardPayload = {
      ...basePayload,
      ...(profileBytes
        ? { avatars: { profileBase64: profileBytes.toString("base64") } }
        : {}),
    };
    const encoded = encodePngCharaChunk(pngImage, JSON.stringify(payload));
    return {
      buffer: encoded,
      mimeType: "image/png",
      fileName: `${baseSlug}.persona.png`,
      actualFormat: "png",
    };
  }

  // JSON format
  const avatars: NonNullable<PersonaCardPayload["avatars"]> = {};
  if (portraitBytes) {
    avatars.portraitBase64 = portraitBytes.toString("base64");
  }
  if (profileBytes) {
    avatars.profileBase64 = profileBytes.toString("base64");
  }
  const jsonPayload: PersonaCardPayload = {
    ...basePayload,
    ...(Object.keys(avatars).length > 0 ? { avatars } : {}),
  };

  return {
    buffer: Buffer.from(JSON.stringify(jsonPayload, null, 2), "utf8"),
    mimeType: "application/json",
    fileName: `${baseSlug}.persona.json`,
    actualFormat: "json",
  };
}

function parsePersonaJsonObject(rawJson: string): {
  fields: z.infer<typeof PersonaDataFieldsSchema>;
  portraitBase64?: string;
  profileBase64?: string;
} {
  let parsedUnknown: unknown;
  try {
    parsedUnknown = JSON.parse(rawJson);
  } catch {
    throw new Error("File does not contain valid JSON persona metadata.");
  }

  if (!parsedUnknown || typeof parsedUnknown !== "object") {
    throw new Error("Persona payload must be a JSON object.");
  }

  const obj = parsedUnknown as Record<string, unknown>;
  const candidateData =
    obj.data && typeof obj.data === "object"
      ? (obj.data as Record<string, unknown>)
      : obj;

  const validated = PersonaDataFieldsSchema.safeParse(candidateData);
  if (!validated.success) {
    throw new Error(
      "Invalid persona data: missing a valid 'name' or persona fields.",
    );
  }

  const avatarsObj =
    obj.avatars && typeof obj.avatars === "object"
      ? (obj.avatars as Record<string, unknown>)
      : undefined;

  const portraitBase64 =
    typeof avatarsObj?.portraitBase64 === "string" &&
    avatarsObj.portraitBase64.length > 0
      ? avatarsObj.portraitBase64
      : undefined;
  const profileBase64 =
    typeof avatarsObj?.profileBase64 === "string" &&
    avatarsObj.profileBase64.length > 0
      ? avatarsObj.profileBase64
      : undefined;

  return {
    fields: validated.data,
    portraitBase64,
    profileBase64,
  };
}

export async function importPersonaPackage(
  bytes: Buffer,
  dir: string = PERSONAS_DIR,
): Promise<PlayerPersona> {
  let rawJson: string | null = null;
  let embeddedPortraitBytes: Buffer | null = null;

  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIG)) {
    const base64Payload = extractCharaPayload(bytes);
    if (!base64Payload) {
      throw new Error(
        "This PNG image does not contain embedded persona card data.",
      );
    }
    rawJson = Buffer.from(base64Payload, "base64").toString("utf8");
    embeddedPortraitBytes = bytes;
  } else if (isWebpBuffer(bytes)) {
    const { jsonPayload, cleanWebpBytes } = extractWebpPersonaChunk(bytes);
    if (!jsonPayload) {
      throw new Error(
        "This WebP image does not contain embedded persona card data.",
      );
    }
    rawJson = jsonPayload;
    embeddedPortraitBytes = cleanWebpBytes;
  } else {
    rawJson = bytes.toString("utf8");
  }

  const { fields, portraitBase64, profileBase64 } =
    parsePersonaJsonObject(rawJson);

  const created = createPersonaRecord(fields.name, undefined, dir);
  let record =
    updatePersonaRecord(
      created.id,
      {
        name: fields.name,
        description: fields.description,
        bodyType: fields.bodyType,
        appearance: fields.appearance,
        initialClothing: fields.initialClothing,
      },
      dir,
    ) ?? created;

  const portraitBytesToSave =
    embeddedPortraitBytes ??
    (portraitBase64 ? Buffer.from(portraitBase64, "base64") : null);

  if (portraitBytesToSave) {
    const transcodedPortrait = await transcodeToWebp(
      portraitBytesToSave,
      "webp",
    );
    record =
      savePersonaAvatar(
        record.id,
        "portrait",
        transcodedPortrait.bytes,
        transcodedPortrait.ext,
        dir,
      ) ?? record;
  }

  if (profileBase64) {
    const profileBytes = Buffer.from(profileBase64, "base64");
    const transcodedProfile = await transcodeToWebp(profileBytes, "webp");
    record =
      savePersonaAvatar(
        record.id,
        "profile",
        transcodedProfile.bytes,
        transcodedProfile.ext,
        dir,
      ) ?? record;
  }

  return record;
}
