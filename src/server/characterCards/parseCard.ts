import { extractCharaPayload } from "./pngText";

export interface ParsedCard {
  name: string; description: string; personality: string; scenario: string;
  creator: string; creatorNotes: string; tags: string[]; characterVersion: string;
}
/** Parse a CCv2 card from raw bytes. Throws Error with a readable message on failure. */
export function parseCard(fileName: string, bytes: Buffer): ParsedCard {
  const isPng = bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  let raw: unknown;
  if (isPng) {
    const payload = extractCharaPayload(bytes);
    if (!payload) throw new Error("PNG has no embedded `chara` card data (or is not a valid PNG).");
    // Real CCv2 cards base64-encode the card JSON inside the `chara` chunk.
    // Try base64 first, then fall back to raw JSON for non-conforming cards.
    const candidates = [
      Buffer.from(payload, "base64").toString("utf8"),
      payload
    ];
    for (const candidate of candidates) {
      try {
        raw = JSON.parse(candidate);
        break;
      } catch {
        // try next candidate
      }
    }
    if (raw === undefined) throw new Error("Card data is not valid JSON.");
  } else {
    try {
      raw = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Card data is not valid JSON.");
    }
  }
  const spec = (raw as { spec?: string }).spec;
  let data: Record<string, unknown>;

  if (spec !== undefined) {
    // Spec'd card: V2/V3 (and future) nest fields under `data`.
    const nested = (raw as { data?: unknown }).data;
    if (!nested || typeof nested !== "object") {
      throw new Error("Card JSON has no `data` object.");
    }
    if (spec !== "chara_card_v2" && spec !== "chara_card_v3") {
      throw new Error(`Unsupported card spec "${String(spec)}" — expected chara_card_v2.`);
    }
    data = nested as Record<string, unknown>;
  } else {
    // V1 (TavernAI / pygmalion-era) card: flat object, no `spec`, no `data`
    // wrapper. The top-level object IS the field map (matches SillyTavern's
    // `jsonData.spec === undefined` → v1 import gate).
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Card JSON has no `data` object.");
    }
    data = raw as Record<string, unknown>;
  }

  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const name = str(data.name).trim();
  if (!name) throw new Error("Card has no name.");

  // V1 used `creatorcomment` before `creator_notes` was standardized.
  const creatorNotes = str(data.creator_notes) || str((data as { creatorcomment?: unknown }).creatorcomment);

  // V1 allowed tags as a comma-separated string; V2 uses an array.
  const rawTags = data.tags;
  const tags = Array.isArray(rawTags)
    ? rawTags.filter((t): t is string => typeof t === "string")
    : typeof rawTags === "string"
      ? rawTags.split(",").map((t) => t.trim()).filter(Boolean)
      : [];

  return {
    name,
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    creator: str(data.creator),
    creatorNotes,
    tags,
    characterVersion: str(data.character_version),
  };
}
