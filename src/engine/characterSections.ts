import type { ClothingItem } from "../schemas";

/**
 * Canonical Detailed Character format — single source of truth shared by the
 * scenario-seed prompt, the character-sheet prompt, and the sheet editor.
 * Keeps the section list AND the example template from drifting apart.
 *
 * The canonical layout uses INLINE headers for Species/Gender
 * (`[Species]: Human` on one line, back-to-back), then block-style headers
 * (`[Body]` followed by content lines) with one blank line between sections.
 *
 * split/join are exact inverses for example-shaped blobs: consecutive inline
 * sections are joined with a single "\n", everything else with "\n\n".
 */
export const CHARACTER_SECTION_HEADERS = [
  "Species", "Gender", "Body", "Appearance", "Clothing", "Personality",
  "Communication - Public", "Communication - Private", "Likes", "Dislikes",
  "Sexual Capabilities"
] as const;

export type CharacterSectionHeader = (typeof CHARACTER_SECTION_HEADERS)[number];

/** The exact example `content` blob shown to the model. Real newlines; do NOT
 *  hand-escape — use toJsonExampleContent() when embedding in JSON strings. */
export const CHARACTER_SHEET_EXAMPLE = [
  "[Species]: ...",
  "[Gender]: ...",
  "",
  "[Body]",
  "- Height: ...",
  "- Build: ...",
  "- Breasts: ...",
  "- Hips: ...",
  "- Thighs: ...",
  "",
  "[Appearance]",
  "- Skin: ...",
  "- Ears: ...",
  "- Eyes: ...",
  "- Hair: ...",
  "",
  "[Clothing]",
  "- Top: ...",
  "- Bottom: ...",
  "- Feet: ...",
  "",
  "[Personality]",
  "- ...",
  "",
  "[Communication - Public]",
  "...",
  "",
  "[Communication - Private]",
  "...",
  "",
  "[Likes]",
  "- ...",
  "",
  "[Dislikes]",
  "- ...",
  "",
  "[Sexual Capabilities]",
  "- ..."
].join("\n");

/** Escape a content blob for embedding inside a double-quoted JSON string
 *  (the form used in prompt examples). Deterministic; prevents the raw-newline
 *  JSON bug and its variants. */
export function toJsonExampleContent(text: string): string {
  return text.replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/"/g, '\\"');
}

const INLINE_HEADER_RE = /^\s*\[([^\]]+)\]\s*:\s*(.*)$/;
const BARE_HEADER_RE = /^\s*\[([^\]]+)\]\s*$/;

export type ContentSection = { header: string; body: string; inline?: boolean };

/** Split a content blob into preamble + ordered sections by `[Header]` lines.
 *  Handles both inline headers (`[Species]: Human`) and block headers
 *  (`[Body]` + content lines). Blank separator lines between sections are
 *  dropped; blank lines INSIDE a section body are preserved. */
export function splitContentSections(content: string): { preamble: string; sections: ContentSection[] } {
  const lines = content.split("\n");
  const sections: ContentSection[] = [];
  const preamble: string[] = [];
  let current: ContentSection | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const inline = line.match(INLINE_HEADER_RE);
    const bare = line.match(BARE_HEADER_RE);

    if (inline || bare) {
      if (current) sections.push(current);
      current = inline
        ? { header: inline[1].trim(), body: inline[2], inline: true }
        : { header: bare![1].trim(), body: "" };
      continue;
    }

    // Blank line between sections? Drop it only if the next non-blank line is a header.
    if (current && line.trim() === "") {
      let j = i + 1;
      while (j < lines.length && lines[j].trim() === "") j++;
      if (j < lines.length && (lines[j].match(INLINE_HEADER_RE) || lines[j].match(BARE_HEADER_RE))) {
        continue;
      }
    }

    if (current) {
      current.body = current.body ? `${current.body}\n${line}` : line;
    } else if (line.trim() !== "") {
      preamble.push(line);
    }
  }
  if (current) sections.push(current);
  return { preamble: preamble.join("\n"), sections };
}

/** Reassemble sections back into a blob (inverse of split for example-shaped
 *  blobs). Consecutive inline sections are joined with "\n"; all other section
 *  boundaries with "\n\n". */
export function joinContentSections(sections: ContentSection[], preamble = ""): string {
  const parts: string[] = [];
  if (preamble) parts.push(preamble);
  sections.forEach((s, idx) => {
    if (idx > 0) {
      const prev = sections[idx - 1];
      parts.push(prev.inline && s.inline ? "\n" : "\n\n");
    }
    parts.push(s.inline ? `[${s.header}]: ${s.body}` : `[${s.header}]${s.body ? `\n${s.body}` : ""}`);
  });
  return parts.join("").replace(/^\n+/, "");
}

/** Canonical sections absent from the content (case-insensitive compare). */
export function missingSections(content: string): string[] {
  const present = new Set(splitContentSections(content).sections.map((s) => s.header.toLowerCase()));
  return CHARACTER_SECTION_HEADERS.filter((h) => !present.has(h.toLowerCase()));
}

/** Fill in any missing canonical sections with "(not established)" stubs.
 *  [Sexual Capabilities] is NOT stubbed — the section appears only when the
 *  sheet generator (module-driven) or the story itself writes it. Pass
 *  includeSexualCapabilities=true to opt back in (reserved for the prompt
 *  module feature). */
export function ensureAllSections(content: string, includeSexualCapabilities = false): string {
  const headers = [...CHARACTER_SECTION_HEADERS];
  if (!includeSexualCapabilities) {
    headers.splice(headers.indexOf("Sexual Capabilities"), 1);
  }
  const { sections: existing } = splitContentSections(content);
  const sections: ContentSection[] = [...existing];
  for (const h of headers) {
    if (!sections.some((s) => s.header.toLowerCase() === h.toLowerCase())) {
      sections.push({ header: h, body: "(not established)" });
    }
  }
  return joinContentSections(sections);
}

/**
 * Surgically apply changes to specific sections in a character content blob.
 * For each change:
 * - If the section already exists (case-insensitive header match), its body is updated.
 * - If the section does not exist, it is inserted into the section list in canonical order
 *   (or appended if non-canonical).
 * Untouched sections and preambles are preserved verbatim.
 */
export function applySectionChanges(
  currentContent: string,
  changes: Array<{ header: string; body: string }>
): string {
  const { preamble, sections } = splitContentSections(currentContent);
  const updatedSections: ContentSection[] = [...sections];

  for (const change of changes) {
    const trimmedHeader = change.header.trim();
    if (!trimmedHeader) continue;
    const normHeader = trimmedHeader.toLowerCase();
    const existingIdx = updatedSections.findIndex((s) => s.header.toLowerCase() === normHeader);
    const isInline = normHeader === "species" || normHeader === "gender";

    const newSec: ContentSection = {
      header: trimmedHeader,
      body: change.body.trim(),
      inline: isInline && !change.body.includes("\n"),
    };

    if (existingIdx >= 0) {
      updatedSections[existingIdx] = newSec;
    } else {
      const canonicalIdx = CHARACTER_SECTION_HEADERS.findIndex(
        (h) => h.toLowerCase() === normHeader
      );
      if (canonicalIdx >= 0) {
        let insertPos = updatedSections.length;
        for (let i = 0; i < updatedSections.length; i++) {
          const currentCanonicalIdx = CHARACTER_SECTION_HEADERS.findIndex(
            (h) => h.toLowerCase() === updatedSections[i].header.toLowerCase()
          );
          if (currentCanonicalIdx > canonicalIdx) {
            insertPos = i;
            break;
          }
        }
        updatedSections.splice(insertPos, 0, newSec);
      } else {
        updatedSections.push(newSec);
      }
    }
  }

  return joinContentSections(updatedSections, preamble);
}

/** Seed a character instance memorySummary from the [Personality] section.
 *  Falls back to the existing neutral default when no bullet exists. */
export function seedMemorySummary(name: string, content: string): string {
  const { sections } = splitContentSections(content);
  const personality = sections.find((s) => s.header.toLowerCase() === "personality");
  const firstBullet = personality?.body
    .split("\n")
    .map((l) => l.trim().replace(/^-\s*/, ""))
    .find((l) => l.length > 0 && !/^\(/.test(l));
  if (firstBullet) {
    return `${name} — ${firstBullet.slice(0, 100)}`;
  }
  return `${name} has not formed a strong opinion of the player yet.`;
}

/** Parse "- Slot: Name" bullets from a content blob's [Clothing] section.
 *  Freeform lines that don't match the slot pattern are ignored (they belong
 *  in [Appearance]). Returns [] when no section or no slot lines. */
export function parseClothingFromContent(content: string): ClothingItem[] {
  const { sections } = splitContentSections(content);
  const clothing = sections.find((s) => s.header.toLowerCase() === "clothing");
  if (!clothing) return [];
  const items: ClothingItem[] = [];
  for (const line of clothing.body.split("\n")) {
    const match = line.match(/^\s*-\s*([^:]+):\s*(.+)$/);
    if (match) items.push({ slot: match[1].trim(), name: match[2].trim() });
  }
  return items;
}

/** First personality bullet, or "" — powers the absent-line summary fallback
 *  for templates without a `summary` field. Reuses seedMemorySummary's bullet
 *  extraction without the name-prefix formatting or the fallback sentence. */
export function summaryFromContent(content: string): string {
  const { sections } = splitContentSections(content);
  const personality = sections.find((s) => s.header.toLowerCase() === "personality");
  const firstBullet = personality?.body
    .split("\n")
    .map((l) => l.trim().replace(/^-\s*/, ""))
    .find((l) => l.length > 0 && !/^\(/.test(l));
  return firstBullet ?? "";
}

/** Physical-description sections, in display order — used for compact
 *  read-only previews (e.g. Body/Appearance/Clothing on the Chars tab card). */
export const PHYSICAL_SECTION_HEADERS = ["Body", "Appearance", "Clothing"] as const;

const STUB_BODY_RE = /^\s*\(\s*not established\s*\)\s*$/i;

/** Select a subset of sections from a content blob in the order given by
 *  `wanted`. Only sections actually present in the blob are returned — absent
 *  ones are simply omitted (no stubs are synthesized here). */
export function pickSections(content: string, wanted: readonly string[]): ContentSection[] {
  const { sections } = splitContentSections(content);
  const byHeader = new Map(sections.map((s) => [s.header.toLowerCase(), s]));
  const picked: ContentSection[] = [];
  for (const w of wanted) {
    const found = byHeader.get(w.toLowerCase());
    if (found) picked.push(found);
  }
  return picked;
}

/** True when a section is empty or is just a "(not established)" stub. */
export function isStubSection(section: ContentSection): boolean {
  const trimmed = section.body.trim();
  if (trimmed.length === 0) return true;
  return trimmed.split("\n").every((line) => STUB_BODY_RE.test(line.replace(/^-\s*/, "")));
}