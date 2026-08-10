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
    try {
      raw = JSON.parse(payload);
    } catch {
      throw new Error("Card data is not valid JSON.");
    }
  } else {
    try {
      raw = JSON.parse(bytes.toString("utf8"));
    } catch {
      throw new Error("Card data is not valid JSON.");
    }
  }
  const data = (raw as { spec?: string; data?: Record<string, unknown> }).data;
  const spec = (raw as { spec?: string }).spec;
  if (!data || typeof data !== "object") throw new Error("Card JSON has no `data` object.");
  if (spec !== "chara_card_v2" && spec !== "chara_card_v3") {
    throw new Error(`Unsupported card spec "${String(spec)}" — expected chara_card_v2.`);
  }
  const str = (v: unknown): string => (typeof v === "string" ? v : "");
  const name = str(data.name).trim();
  if (!name) throw new Error("Card has no name.");
  return {
    name,
    description: str(data.description),
    personality: str(data.personality),
    scenario: str(data.scenario),
    creator: str(data.creator),
    creatorNotes: str(data.creator_notes),
    tags: Array.isArray(data.tags) ? data.tags.filter((t): t is string => typeof t === "string") : [],
    characterVersion: str(data.character_version),
  };
}
