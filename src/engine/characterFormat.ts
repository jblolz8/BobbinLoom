import type { CharacterFormat, CharacterFormatSection } from "../schemas";
import type { ContentSection } from "./characterSections";
import { joinContentSections, splitContentSections } from "./characterSections";

/**
 * Preset-owned character format — the single source of truth for what a sheet
 * looks like. The shipped presets in data/prompt-presets.json carry explicit
 * `characterFormat` blocks; playthroughs snapshot it like modules. Old presets /
 * playthroughs without a format fall back to DEFAULT_CHARACTER_FORMAT here.
 *
 * The section list is OPEN: sheets may contain any extra headers; the format
 * drives defaults, order, stubbing, and generation guidance — never a
 * rejection whitelist.
 */

type DefaultSectionDef = {
  name: string;
  order: number;
  instruction: string;
  examples?: string[];
  inline?: boolean;
};

const DEFAULT_SECTIONS: DefaultSectionDef[] = [
  { name: "Species", order: 1, inline: true, instruction: "The character's species, ancestry, or type of being.", examples: ["Human", "Fox spirit"] },
  { name: "Gender", order: 2, inline: true, instruction: "The character's gender identity or presentation.", examples: ["Female", "Non-binary"] },
  { name: "Body", order: 3, instruction: "Physical build and body details — one detail per bullet.", examples: ["- Height: 5'7\"", "- Build: Athletic"] },
  { name: "Appearance", order: 4, instruction: "How the character looks: skin, ears, eyes, hair, and notable features — one detail per bullet.", examples: ["- Hair: long, dark", "- Eyes: amber"] },
  { name: "Clothing", order: 5, instruction: "What the character is currently wearing, as slot-style bullets (- Top: ..., - Bottom: ..., - Feet: ...).", examples: ["- Top: black training top", "- Bottom: grey training pants"] },
  { name: "Personality", order: 6, instruction: "Core traits, values, and temperament — one trait per bullet.", examples: ["- Disciplined, guarded, fair"] },
  { name: "Communication - Public", order: 7, instruction: "How the character speaks and carries themselves in public or social settings — short prose." },
  { name: "Communication - Private", order: 8, instruction: "How the character speaks and behaves in private or with trusted people — short prose." },
  { name: "Likes", order: 9, instruction: "Things the character enjoys — one per bullet.", examples: ["- Honesty", "- Quiet moments"] },
  { name: "Dislikes", order: 10, instruction: "Things the character dislikes or cannot stand — one per bullet.", examples: ["- Manipulation", "- Wasted time"] },
];

/** Shipped "Default" sheet format — the canonical 10-section set (no
 *  [Sexual Capabilities]). Must stay in sync with the Default preset in
 *  data/prompt-presets.json (a test pins them together). */
export const DEFAULT_CHARACTER_FORMAT: CharacterFormat = {
  sections: DEFAULT_SECTIONS.map((s) => ({
    name: s.name,
    order: s.order,
    instruction: s.instruction,
    examples: s.examples ?? [],
    inline: s.inline ?? false,
  })),
};

/** Shipped "Default (NSFW)" sheet format — the full 11-section set. Its
 *  Sexual Capabilities examples stay in sync with data/prompt-presets.json. */
export const NSFW_CHARACTER_FORMAT: CharacterFormat = {
  sections: [
    ...DEFAULT_CHARACTER_FORMAT.sections.map((s) => ({ ...s })),
    {
      name: "Sexual Capabilities",
      order: 11,
      instruction: "The character's attitudes, experience, and preferences around intimacy — bullets or short prose.",
      examples: [
        "- Femdom (giving): She loves manhandling her partner in positions that would give her pleasure too. It would be half the time her being in a compromised position or her partner, as long as he or her gets to do the work.",
        "- Impact Play (giving): She loves the idea of pushing her partner over to edge to climax just from her slapping, smacking, or punching his arm, stomach, or chest while demanding him to cum.",
        "- Fear Play (giving): She would use threats, even faking a punch just to see their reaction; She feels delight from the feeling that every moves or word she makes have a weight behind it enough to make her partner comply.",
      ],
      inline: false,
    },
  ],
};

/** Resolve a possibly-absent format to a usable one: any format with at least
 *  one section wins; otherwise the shipped Default format is used. */
export function resolveCharacterFormat(format?: CharacterFormat): CharacterFormat {
  if (format && Array.isArray(format.sections) && format.sections.length > 0) return format;
  return DEFAULT_CHARACTER_FORMAT;
}

/** The resolved format's sections (never empty). */
export function formatSections(format?: CharacterFormat): CharacterFormatSection[] {
  return resolveCharacterFormat(format).sections;
}

/** The resolved format's section names, in order, wrapped as headers: e.g.
 *  ["[Species]", "[Gender]", ...]. Useful for prompt guidance that lists the
 *  sheet's canonical sections. */
export function formatSectionHeaders(format?: CharacterFormat): string[] {
  return formatSections(format).map((s) => `[${s.name}]`);
}

/** Ordered, lowercased section names of a format. */
export function normalizedFormatSectionNames(format?: CharacterFormat): string[] {
  return formatSections(format).map((s) => s.name.trim().toLowerCase());
}

/** Ordered section names actually present in a content blob (normalized). */
export function normalizedContentSectionNames(content: string): string[] {
  return splitContentSections(content).sections.map((s) => s.header.trim().toLowerCase());
}

/** Build an example sheet blob from a format (for embedding in generation
 *  prompts). Uses each section's first non-empty example as its body, or "..."
 *  when none. */
export function buildFormatExample(format?: CharacterFormat): string {
  const sections = formatSections(format);
  const parts: string[] = [];
  sections.forEach((s, idx) => {
    if (idx > 0) {
      const prev = sections[idx - 1];
      parts.push(prev.inline && s.inline ? "\n" : "\n\n");
    }
    const body = nonEmptyExamples(s)[0] ?? "...";
    parts.push(s.inline ? `[${s.name}]: ${body}` : `[${s.name}]\n${body}`);
  });
  return parts.join("").replace(/^\n+/, "");
}

/** Trimmed, non-empty examples for a section. */
function nonEmptyExamples(s: CharacterFormatSection): string[] {
  return (s.examples ?? []).map((e) => e.trim()).filter(Boolean);
}

/** Build the "use these headers, in this order, with this guidance" rules block
 *  for generation/refinement prompts. */
export function buildFormatRules(format?: CharacterFormat): string {
  const sections = formatSections(format);
  const lines = [
    `- Use the standard section headers, in this order: ${sections.map((s) => `[${s.name}]`).join(", ")}.`,
    "- Additional custom sections are allowed when they add real information.",
  ];
  for (const s of sections) {
    const guidance = s.instruction || "no special guidance.";
    const examples = nonEmptyExamples(s);
    if (examples.length) {
      lines.push(`- ${s.name}: ${guidance} Example${examples.length > 1 ? "s" : ""}:`);
      for (const ex of examples) {
        // Examples are stored as bullet lines ("- item"); re-emit them with a
        // single leading bullet, never a doubled one.
        const exText = ex.replace(/^[-•]\s+/, "").trim();
        lines.push(`    - ${exText}`);
      }
    } else {
      lines.push(`- ${s.name}: ${guidance}`);
    }
  }
  return lines.join("\n");
}

/** Guarantee every section in the target format is present, ordered as the
 *  format specifies. Existing sections keep their body and style; missing ones
 *  are stubbed "(not established)" using the format's inline flag. Sections
 *  present in the content but NOT in the format (the open set) are preserved
 *  and appended after the format's sections. */
export function ensureAllSections(content: string, format?: CharacterFormat): string {
  const { preamble, sections } = splitContentSections(content);
  const byName = new Map<string, ContentSection>();
  for (const s of sections) byName.set(s.header.trim().toLowerCase(), s);

  const result: ContentSection[] = [];
  const used = new Set<string>();
  for (const fs of formatSections(format)) {
    const key = fs.name.trim().toLowerCase();
    used.add(key);
    const existing = byName.get(key);
    result.push(existing ?? { header: fs.name, body: "(not established)", inline: fs.inline });
  }
  for (const s of sections) {
    if (!used.has(s.header.trim().toLowerCase())) result.push(s);
  }
  return joinContentSections(result, preamble);
}

/** Names of format sections missing from the content (original casing). */
export function missingFormatSections(content: string, format?: CharacterFormat): string[] {
  const have = new Set(normalizedContentSectionNames(content));
  return formatSections(format)
    .filter((s) => !have.has(s.name.trim().toLowerCase()))
    .map((s) => s.name);
}

/** True when a sheet's sections conform to the format: every format section is
 *  present (case-insensitive) and the format sections appear in the same
 *  relative order as the format. Extra sections (open set) are ignored. */
export function isFormatAligned(content: string, format?: CharacterFormat): boolean {
  const want = normalizedFormatSectionNames(format);
  const have = normalizedContentSectionNames(content);
  let idx = 0;
  for (const name of want) {
    const found = have.indexOf(name, idx);
    if (found < 0) return false;
    idx = found + 1;
  }
  return true;
}
