import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { basename, join } from "node:path";
import { z } from "zod";
import {
  buildCharacterFamilyTree,
  displayTitle,
  hasCcv2Source,
  normalizeCreator,
  normalizeTags,
} from "../../engine/characterCards";
import {
  ClothingItemSchema,
  type CharacterTemplate,
  type ExportFormat,
} from "../../schemas";
import {
  loadSharp,
  transcodeToPng,
  transcodeToWebp,
} from "../imageTranscode";
import {
  encodePngCharaChunk,
  encodeWebpPersonaChunk,
  extractWebpPersonaChunk,
  isWebpBuffer,
} from "../personaCards";
import {
  CHARACTERS_DIR,
  characterFolderForId,
  getCharacterAvatarPath,
  getCharacterTemplate,
  listCharacterTemplates,
  saveCharacterAvatar,
  saveCharacterTemplateRecord,
  updateCharacterTemplateRecord,
} from "../store";
import { PNG_SIG, extractCharaPayload } from "./pngText";

const Ccv2SourcePayloadSchema = z.object({
  ccv2Content: z.string().optional(),
  ccv2CreatorNotes: z.string().optional(),
  ccv2Tags: z.array(z.string()).optional(),
  scenario: z.string().optional(),
  hasCustomPortrait: z.boolean().optional(),
  originalCardKind: z.enum(["png", "json"]).optional(),
  originalCardBase64: z.string().optional(),
});

const CharacterAvatarsPayloadSchema = z.object({
  portraitBase64: z.string().optional(),
  profileBase64: z.string().optional(),
});

const ExportedCharacterEntrySchema = z.object({
  sourceId: z.string().optional(),
  parentSourceId: z.string().optional(),
  name: z.string().min(1),
  title: z.string().optional(),
  content: z.string().optional().default(""),
  summary: z.string().optional().default(""),
  startingClothing: z.array(ClothingItemSchema).optional().default([]),
  creatorNotes: z.string().optional(),
  creator: z.string().optional(),
  cardVersion: z.string().optional(),
  tags: z.array(z.string()).optional().default([]),
  extensions: z.record(z.any()).optional().default({}),
  ccv2Source: Ccv2SourcePayloadSchema.optional(),
  avatars: CharacterAvatarsPayloadSchema.optional(),
});

export type ExportedCharacterEntry = z.infer<
  typeof ExportedCharacterEntrySchema
>;

export const CharacterCardPackagePayloadSchema = z.object({
  spec: z.literal("bobbinloom_chara"),
  specVersion: z.string().optional().default("1.0"),
  data: ExportedCharacterEntrySchema,
  familyCards: z.array(ExportedCharacterEntrySchema).optional(),
});

export type CharacterCardPackagePayload = z.infer<
  typeof CharacterCardPackagePayloadSchema
>;

export type ExportCharacterOptions = {
  format: ExportFormat;
  includeCcv2?: boolean;
  includeFamily?: boolean;
};

export type ExportedCharacterPackage = {
  buffer: Buffer;
  mimeType: string;
  fileName: string;
  actualFormat: ExportFormat;
};

function slugifyFileName(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "character"
  );
}

export function buildCharacterExportFileName(
  cards: CharacterTemplate[],
  ext: ExportFormat,
): string {
  if (cards.length <= 1) {
    const baseSlug = cards[0]
      ? slugifyFileName(displayTitle(cards[0]))
      : "character";
    return `${baseSlug}.chara.${ext}`;
  }

  const slugs = cards.map((c) => slugifyFileName(displayTitle(c)));
  const kept: string[] = [];
  let currentLen = 0;

  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i];
    const nextLen = currentLen === 0 ? slug.length : currentLen + 1 + slug.length;
    if (kept.length >= 4 || (kept.length > 0 && nextLen > 140)) {
      break;
    }
    kept.push(slug);
    currentLen = nextLen;
  }

  const remaining = slugs.length - kept.length;
  if (remaining > 0) {
    kept.push(`plus-${remaining}-more`);
  }

  return `${kept.join(".")}.charapack.${ext}`;
}

function escapeXml(str: string): string {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function createPlaceholderTileSvg(
  title: string,
  width: number,
  height: number,
): Buffer {
  const initial = (title.trim().charAt(0) || "?").toUpperCase();
  const safeTitle = escapeXml(
    title.trim().length > 22
      ? `${title.trim().slice(0, 20)}…`
      : title.trim() || "Character",
  );
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
    <defs>
      <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stop-color="#1a2234"/>
        <stop offset="100%" stop-color="#0f1522"/>
      </linearGradient>
    </defs>
    <rect width="${width}" height="${height}" fill="url(#bg)"/>
    <circle cx="${width / 2}" cy="${height * 0.42}" r="${Math.round(width * 0.22)}" fill="rgba(96, 165, 250, 0.14)" stroke="rgba(96, 165, 250, 0.35)" stroke-width="2"/>
    <text x="${width / 2}" y="${Math.round(height * 0.42 + width * 0.08)}" text-anchor="middle" fill="#60a5fa" font-family="sans-serif" font-weight="700" font-size="${Math.round(width * 0.22)}">${escapeXml(initial)}</text>
    <text x="${width / 2}" y="${Math.round(height * 0.76)}" text-anchor="middle" fill="#cbd5e1" font-family="sans-serif" font-weight="600" font-size="22">${safeTitle}</text>
  </svg>`;
  return Buffer.from(svg, "utf8");
}

export async function buildCharacterPackCollage(
  tiles: Array<{ title: string; portraitBytes: Buffer | null }>,
  format: "webp" | "png",
): Promise<Buffer> {
  const sharp = loadSharp();
  const count = Math.max(1, tiles.length);
  const cols = count <= 3 ? count : count === 4 ? 2 : 3;
  const rows = Math.ceil(count / cols);
  const tileWidth = 360;
  const tileHeight = 540;
  const gap = 6;

  const canvasWidth = cols * tileWidth + (cols - 1) * gap;
  const canvasHeight = rows * tileHeight + (rows - 1) * gap;

  const composites: Array<{ input: Buffer; left: number; top: number }> = [];

  for (let i = 0; i < tiles.length; i++) {
    const tile = tiles[i];
    const col = i % cols;
    const row = Math.floor(i / cols);
    const left = col * (tileWidth + gap);
    const top = row * (tileHeight + gap);

    let tilePng: Buffer | null = null;
    if (tile.portraitBytes) {
      try {
        tilePng = await sharp(tile.portraitBytes)
          .rotate()
          .resize(tileWidth, tileHeight, {
            fit: "cover",
            position: "attention",
          })
          .png()
          .toBuffer();
      } catch {
        tilePng = null;
      }
    }

    if (!tilePng) {
      const svgBuf = createPlaceholderTileSvg(
        tile.title,
        tileWidth,
        tileHeight,
      );
      tilePng = await sharp(svgBuf)
        .resize(tileWidth, tileHeight)
        .png()
        .toBuffer();
    }

    composites.push({ input: tilePng, left, top });
  }

  const pipeline = sharp({
    create: {
      width: canvasWidth,
      height: canvasHeight,
      channels: 4,
      background: { r: 13, g: 17, b: 26, alpha: 1 },
    },
  }).composite(composites);

  if (format === "webp") {
    return pipeline.webp({ quality: 90, effort: 4 }).toBuffer();
  }
  return pipeline.png().toBuffer();
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

function buildExportEntry(
  record: CharacterTemplate,
  opts: {
    includeCcv2: boolean;
    includePortraitBase64: boolean;
    canonicalParentId?: string;
    dir: string;
  },
): {
  entry: ExportedCharacterEntry;
  portraitBytes: Buffer | null;
} {
  const { includeCcv2, includePortraitBase64, canonicalParentId, dir } = opts;
  const folder = characterFolderForId(record.id, dir);
  const portraitPath = getCharacterAvatarPath(record.id, "portrait", dir);
  const profilePath = getCharacterAvatarPath(record.id, "profile", dir);
  const originalPngPath = getCharacterAvatarPath(record.id, "original", dir);

  const hasDedicatedProfile = Boolean(
    profilePath && portraitPath && profilePath !== portraitPath,
  );
  const hasDedicatedCustomPortrait = Boolean(
    portraitPath && (!originalPngPath || portraitPath !== originalPngPath),
  );

  const portraitBytes = portraitPath ? readFileSync(portraitPath) : null;
  const profileBytes =
    hasDedicatedProfile && profilePath ? readFileSync(profilePath) : null;

  let ccv2Source: ExportedCharacterEntry["ccv2Source"] | undefined;
  if (includeCcv2 && hasCcv2Source(record)) {
    let originalCardKind: "png" | "json" | undefined;
    let originalCardBase64: string | undefined;
    if (folder && record.cardRef?.file) {
      const refPath = join(folder, record.cardRef.file);
      if (existsSync(refPath)) {
        originalCardKind = record.cardRef.kind;
        originalCardBase64 = readFileSync(refPath).toString("base64");
      }
    }
    ccv2Source = {
      ...(record.ccv2Content !== undefined
        ? { ccv2Content: record.ccv2Content }
        : {}),
      ...(record.ccv2CreatorNotes !== undefined
        ? { ccv2CreatorNotes: record.ccv2CreatorNotes }
        : {}),
      ...(record.ccv2Tags !== undefined ? { ccv2Tags: record.ccv2Tags } : {}),
      ...(record.scenario !== undefined ? { scenario: record.scenario } : {}),
      hasCustomPortrait: hasDedicatedCustomPortrait,
      ...(originalCardKind && originalCardBase64
        ? { originalCardKind, originalCardBase64 }
        : {}),
    };
  }

  const avatars: NonNullable<ExportedCharacterEntry["avatars"]> = {};
  if (includePortraitBase64 && portraitBytes) {
    avatars.portraitBase64 = portraitBytes.toString("base64");
  }
  if (profileBytes) {
    avatars.profileBase64 = profileBytes.toString("base64");
  }

  const entry: ExportedCharacterEntry = {
    sourceId: record.id,
    ...(canonicalParentId ? { parentSourceId: canonicalParentId } : {}),
    name: record.name,
    ...(record.title?.trim() ? { title: record.title.trim() } : {}),
    content: record.content,
    summary: record.summary ?? "",
    startingClothing: record.startingClothing ?? [],
    ...(record.creatorNotes ? { creatorNotes: record.creatorNotes } : {}),
    ...(record.creator?.trim() ? { creator: record.creator.trim() } : {}),
    ...(record.cardVersion?.trim()
      ? { cardVersion: record.cardVersion.trim() }
      : {}),
    tags: record.tags ?? [],
    extensions: record.extensions ?? {},
    ...(ccv2Source ? { ccv2Source } : {}),
    ...(Object.keys(avatars).length > 0 ? { avatars } : {}),
  };

  return { entry, portraitBytes };
}

export async function exportCharacterPackage(
  id: string,
  options: ExportCharacterOptions,
  dir: string = CHARACTERS_DIR,
): Promise<ExportedCharacterPackage | null> {
  const focus = getCharacterTemplate(id, dir);
  if (!focus || focus.format === "ccv2") {
    return null;
  }

  const includeCcv2 = Boolean(options.includeCcv2);
  const includeFamily = Boolean(options.includeFamily);
  const allTemplates = listCharacterTemplates(dir);

  // Resolve family tree members (excluding unconverted CCv2 cards) when requested
  let exportedMembers: CharacterTemplate[] = [focus];
  const canonicalIdByAnyId = new Map<string, string>();
  canonicalIdByAnyId.set(focus.id, focus.id);
  if (focus.lineageId) canonicalIdByAnyId.set(focus.lineageId, focus.id);

  if (includeFamily) {
    const family = buildCharacterFamilyTree(focus.id, allTemplates);
    if (family && family.members.length > 1) {
      const blMembers = family.members.filter((m) => m.format !== "ccv2");
      exportedMembers = [
        focus,
        ...blMembers.filter((m) => m.id !== focus.id),
      ];
      for (const m of exportedMembers) {
        canonicalIdByAnyId.set(m.id, m.id);
        if (m.lineageId) canonicalIdByAnyId.set(m.lineageId, m.id);
      }
      // Also map older version IDs to their latest canonical member ID
      for (const t of allTemplates) {
        const lid = t.lineageId ?? t.id;
        const canonical = canonicalIdByAnyId.get(lid);
        if (canonical) {
          canonicalIdByAnyId.set(t.id, canonical);
        }
      }
    }
  }

  const resolveParentSourceId = (
    card: CharacterTemplate,
  ): string | undefined => {
    if (!includeFamily || !card.parentId) return undefined;
    const mapped = canonicalIdByAnyId.get(card.parentId);
    return mapped && mapped !== card.id ? mapped : undefined;
  };

  const isMultiCard = exportedMembers.length > 1;
  const hasAnyPortrait = exportedMembers.some((m) =>
    Boolean(getCharacterAvatarPath(m.id, "portrait", dir)),
  );

  const effectiveFormat: ExportFormat =
    (options.format === "webp" || options.format === "png") && !hasAnyPortrait
      ? "json"
      : options.format;

  const isImageContainer =
    effectiveFormat === "webp" || effectiveFormat === "png";

  // For a multi-card pack, the outer container image is a collage, so we embed
  // the primary card's individual portrait inside `data.avatars.portraitBase64`
  // so importing restores each card's own individual portrait cleanly.
  const { entry: primaryEntry, portraitBytes: primaryPortraitBytes } =
    buildExportEntry(focus, {
      includeCcv2,
      includePortraitBase64: !isImageContainer || isMultiCard,
      canonicalParentId: resolveParentSourceId(focus),
      dir,
    });

  const familyEntries: ExportedCharacterEntry[] = [];
  const collageTiles: Array<{ title: string; portraitBytes: Buffer | null }> = [
    { title: displayTitle(focus), portraitBytes: primaryPortraitBytes },
  ];

  for (const member of exportedMembers.slice(1)) {
    const { entry, portraitBytes } = buildExportEntry(member, {
      includeCcv2,
      includePortraitBase64: true,
      canonicalParentId: resolveParentSourceId(member),
      dir,
    });
    familyEntries.push(entry);
    collageTiles.push({
      title: displayTitle(member),
      portraitBytes,
    });
  }

  const payload: CharacterCardPackagePayload = {
    spec: "bobbinloom_chara",
    specVersion: "1.0",
    data: primaryEntry,
    ...(familyEntries.length > 0 ? { familyCards: familyEntries } : {}),
  };

  const fileName = buildCharacterExportFileName(
    exportedMembers,
    effectiveFormat,
  );
  const jsonString = JSON.stringify(payload);

  if (effectiveFormat === "webp") {
    const webpImage = isMultiCard
      ? await buildCharacterPackCollage(collageTiles, "webp")
      : await ensureWebpBytes(primaryPortraitBytes!);
    const encoded = encodeWebpPersonaChunk(webpImage, jsonString);
    return {
      buffer: encoded,
      mimeType: "image/webp",
      fileName,
      actualFormat: "webp",
    };
  }

  if (effectiveFormat === "png") {
    const pngImage = isMultiCard
      ? await buildCharacterPackCollage(collageTiles, "png")
      : await ensurePngBytes(primaryPortraitBytes!);
    const encoded = encodePngCharaChunk(pngImage, jsonString);
    return {
      buffer: encoded,
      mimeType: "image/png",
      fileName,
      actualFormat: "png",
    };
  }

  return {
    buffer: Buffer.from(JSON.stringify(payload, null, 2), "utf8"),
    mimeType: "application/json",
    fileName,
    actualFormat: "json",
  };
}

/**
 * Inspects an uploaded file buffer (.webp, .png, or .json) to see if it is a
 * BobbinLoom character package (`spec: "bobbinloom_chara"`).
 * - Returns `{ payload, outerPortraitBytes }` when matched.
 * - Throws an Error if the file is a `.webp` without valid `bobbinloom_chara` data
 *   or if a `bobbinloom_chara` payload fails validation.
 * - Returns `null` when the file is a standard CCv2/V3/V1 PNG or JSON card.
 */
export function tryExtractBobbinLoomCharacterPackage(bytes: Buffer): {
  payload: CharacterCardPackagePayload;
  outerPortraitBytes: Buffer | null;
} | null {
  let rawJson: string | null = null;
  let outerPortraitBytes: Buffer | null = null;

  if (isWebpBuffer(bytes)) {
    const { jsonPayload, cleanWebpBytes } = extractWebpPersonaChunk(bytes);
    if (!jsonPayload) {
      throw new Error(
        "WebP image has no embedded BobbinLoom character card data.",
      );
    }
    rawJson = jsonPayload;
    outerPortraitBytes = cleanWebpBytes;
  } else if (bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIG)) {
    const payload = extractCharaPayload(bytes);
    if (!payload) return null;
    const candidates = [
      Buffer.from(payload, "base64").toString("utf8"),
      payload,
    ];
    for (const candidate of candidates) {
      try {
        const parsed = JSON.parse(candidate) as { spec?: unknown };
        if (parsed && typeof parsed === "object") {
          if (parsed.spec === "bobbinloom_chara") {
            rawJson = candidate;
            outerPortraitBytes = bytes;
          }
          break;
        }
      } catch {
        // try next candidate
      }
    }
    if (!rawJson) return null;
  } else {
    try {
      const text = bytes.toString("utf8");
      const parsed = JSON.parse(text) as { spec?: unknown };
      if (
        parsed &&
        typeof parsed === "object" &&
        parsed.spec === "bobbinloom_chara"
      ) {
        rawJson = text;
      } else {
        return null;
      }
    } catch {
      return null;
    }
  }

  let parsedObj: unknown;
  try {
    parsedObj = JSON.parse(rawJson);
  } catch {
    throw new Error("Invalid BobbinLoom character card JSON payload.");
  }

  // Support both `{ spec: "bobbinloom_chara", data: { ... } }` and flat legacy `CharacterTemplate` exports
  const normalizedObj =
    parsedObj &&
    typeof parsedObj === "object" &&
    "spec" in parsedObj &&
    (parsedObj as Record<string, unknown>).spec === "bobbinloom_chara" &&
    !("data" in parsedObj)
      ? {
          spec: "bobbinloom_chara",
          specVersion: "1.0",
          data: parsedObj,
        }
      : parsedObj;

  const validated = CharacterCardPackagePayloadSchema.safeParse(normalizedObj);
  if (!validated.success) {
    throw new Error(
      "Invalid BobbinLoom character card data: missing required character fields.",
    );
  }

  return {
    payload: validated.data,
    outerPortraitBytes,
  };
}

export async function importCharacterPackage(
  bytes: Buffer,
  dir: string = CHARACTERS_DIR,
): Promise<{
  record: CharacterTemplate;
  records: CharacterTemplate[];
  created: boolean;
}> {
  const extracted = tryExtractBobbinLoomCharacterPackage(bytes);
  if (!extracted) {
    throw new Error("File is not a valid BobbinLoom character card package.");
  }

  const { payload, outerPortraitBytes } = extracted;
  const entries: ExportedCharacterEntry[] = [
    payload.data,
    ...(payload.familyCards ?? []),
  ];

  const existingIds = new Set(listCharacterTemplates(dir).map((t) => t.id));
  const sourceIdToNewId = new Map<string, string>();
  const createdRecords: CharacterTemplate[] = [];
  let nextTimestamp = Date.now();

  for (let i = 0; i < entries.length; i++) {
    const entry = entries[i];
    while (existingIds.has(`char_${nextTimestamp}`)) {
      nextTimestamp += 1;
    }
    const newId = `char_${nextTimestamp}`;
    existingIds.add(newId);
    if (entry.sourceId) {
      sourceIdToNewId.set(entry.sourceId, newId);
    }

    const now = new Date().toISOString();
    const ccv2 = entry.ccv2Source;
    const baseTemplate: CharacterTemplate = {
      id: newId,
      name: entry.name.trim(),
      ...(entry.title?.trim() ? { title: entry.title.trim() } : {}),
      version: 1,
      content: entry.content ?? "",
      summary: entry.summary ?? "",
      startingClothing: entry.startingClothing ?? [],
      spec: "bobbinloom_chara",
      specVersion: "1.0",
      ...(entry.creatorNotes ? { creatorNotes: entry.creatorNotes } : {}),
      ...(entry.creator?.trim()
        ? { creator: normalizeCreator(entry.creator) }
        : {}),
      ...(entry.cardVersion?.trim()
        ? { cardVersion: entry.cardVersion.trim() }
        : {}),
      tags: normalizeTags(entry.tags ?? []),
      extensions: entry.extensions ?? {},
      ...(ccv2?.ccv2Content !== undefined
        ? { ccv2Content: ccv2.ccv2Content }
        : {}),
      ...(ccv2?.ccv2CreatorNotes !== undefined
        ? { ccv2CreatorNotes: ccv2.ccv2CreatorNotes }
        : {}),
      ...(ccv2?.ccv2Tags !== undefined
        ? { ccv2Tags: normalizeTags(ccv2.ccv2Tags) }
        : {}),
      ...(ccv2?.scenario !== undefined ? { scenario: ccv2.scenario } : {}),
      createdAt: now,
      updatedAt: now,
    };

    let saved = saveCharacterTemplateRecord(baseTemplate, dir);
    const folder = characterFolderForId(saved.id, dir);

    // Restore original CCv2 file if bundled
    if (
      folder &&
      ccv2?.originalCardBase64 &&
      (ccv2.originalCardKind === "png" || ccv2.originalCardKind === "json")
    ) {
      const slug = basename(folder);
      const originalFile =
        ccv2.originalCardKind === "png" ? `${slug}.png` : `${slug}.card.json`;
      writeFileSync(
        join(folder, originalFile),
        Buffer.from(ccv2.originalCardBase64, "base64"),
      );
      saved = saveCharacterTemplateRecord(
        {
          ...saved,
          cardRef: { file: originalFile, kind: ccv2.originalCardKind },
        },
        dir,
      );
    }

    // Save portrait image (prefer embedded portraitBase64; fall back to outer container image only for single-card exports)
    const portraitBytesToSave =
      (entry.avatars?.portraitBase64
        ? Buffer.from(entry.avatars.portraitBase64, "base64")
        : null) ??
      (i === 0 && entries.length === 1 ? outerPortraitBytes : null);

    const shouldSaveCustomPortrait =
      Boolean(portraitBytesToSave) &&
      !(
        ccv2?.originalCardKind === "png" &&
        ccv2?.originalCardBase64 &&
        ccv2?.hasCustomPortrait === false
      );

    if (portraitBytesToSave && shouldSaveCustomPortrait) {
      const transcodedPortrait = await transcodeToWebp(
        portraitBytesToSave,
        "webp",
      );
      saved =
        saveCharacterAvatar(
          saved.id,
          "portrait",
          transcodedPortrait.bytes,
          transcodedPortrait.ext,
          dir,
        ) ?? saved;
    }

    if (entry.avatars?.profileBase64) {
      const profileBytes = Buffer.from(entry.avatars.profileBase64, "base64");
      const transcodedProfile = await transcodeToWebp(profileBytes, "webp");
      saved =
        saveCharacterAvatar(
          saved.id,
          "profile",
          transcodedProfile.bytes,
          transcodedProfile.ext,
          dir,
        ) ?? saved;
    }

    createdRecords.push(saved);
  }

  // Second pass: re-link parentId across imported family cards
  for (let i = 0; i < entries.length; i++) {
    const parentSourceId = entries[i].parentSourceId;
    if (!parentSourceId) continue;
    const newParentId = sourceIdToNewId.get(parentSourceId);
    if (!newParentId) continue;
    const updated = updateCharacterTemplateRecord(
      createdRecords[i].id,
      { parentId: newParentId },
      dir,
    );
    if (updated) {
      createdRecords[i] = updated;
    }
  }

  return {
    record: createdRecords[0],
    records: createdRecords,
    created: true,
  };
}
