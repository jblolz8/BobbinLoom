import type { CharacterFormat, CharacterFormatSection } from "../schemas";
import type { ContentSection } from "./characterSections";
import { joinContentSections, splitContentSections } from "./characterSections";

/**
 * Preset-owned character format — the single source of truth for what a sheet
 * looks like. The shipped presets in data/prompt-presets.json carry explicit
 * `characterFormat` blocks, and the global prompt config is seeded from the active
 * preset. It is read from that config at call time (see promptConfigStore) — NOT
 * snapshotted per playthrough, so an edit reaches every playthrough's next turn.
 * Old presets without a format fall back to DEFAULT_CHARACTER_FORMAT here.
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
  exampleBody?: string;
  inline?: boolean;
};

const DEFAULT_SECTIONS: DefaultSectionDef[] = [
  {
    name: "Species", order: 1, inline: true,
    instruction: "The character's species, ancestry, or type of being. One short value — this world is not limited to humans, so name what she is.",
    examples: ["Human", "Anthro Fox", "Slimegirl"],
  },
  {
    name: "Gender", order: 2, inline: true,
    instruction: "The character's gender identity or presentation. One short value.",
    examples: ["Male", "Female", "Androgynous"],
  },
  {
    name: "Body", order: 3,
    instruction: "Physical build as bullets, in this order: Height, Build, Breasts — then Hips and Thighs when they matter for the character. 3-5 bullets, one attribute per bullet. Skin colour and texture belong in [Appearance], not here.",
    examples: ["- Height: 5'7\"", "- Build: Athletic", "- Breasts: B-Cup", "- Hips: Modest", "- Thighs: Thick and firm"],
    exampleBody: "- Height: 5'7\"\n- Build: Athletic\n- Breasts: B-Cup\n- Hips: Modest\n- Thighs: Thick and firm",
  },
  {
    name: "Appearance", order: 4,
    instruction: "How the character looks, one detail per bullet: Skin, Ears, Eyes, Hair — then Tail, Cheeks, scars or other species features. Put colour AND texture or state in the same bullet. 4-7 bullets.",
    examples: [
      "- Skin: Pale white, a little coarse",
      "- Ears: Large Fennekin ears with mid-back-length red ear-tufts",
      "- Eyes: Long vixen-shaped eyes with red irises and thick black linings",
      "- Hair: Dark blue with wavy bangs, shoulder-length sideburns, and a long straight hips-length high ponytail",
      "- Tail: Large fennec tail with a dark orange tip",
    ],
    exampleBody: "- Skin: Pale white, a little coarse\n- Ears: Large Fennekin ears with mid-back-length red ear-tufts\n- Eyes: Long vixen-shaped eyes with red irises and thick black linings\n- Hair: Dark blue with wavy bangs, shoulder-length sideburns, and a long straight hips-length high ponytail\n- Tail: Large fennec tail with a dark orange tip",
  },
  {
    name: "Clothing", order: 5,
    instruction: "What the character is wearing, one garment per bullet as `- Slot: garment`. Slots: Head, Ears, Neck, Top, Top Underwear, Arms, Hands, Hips, Bottom, Pelvis, Legs, Feet. Give every garment its own bullet — never merge several into one line, and never invent a catch-all slot. Clothing means garments only: skin, fur, scales, slime membrane or a ghost's translucency are the character's body and belong in [Body]/[Appearance]. A character wearing nothing has no bullets here — do not write \"None\", and do not invent garments to fill the section.",
    examples: [
      "- Neck: Black latex choker",
      "- Top: Black V-neck sleeveless leather crop tank top",
      "- Hips: Black wet-look booty mini shorts",
      "- Legs: Black latex thigh-high stockings",
      "- Feet: Black biker boots",
    ],
    exampleBody: "- Ears: Two dot stud earrings left, two black ring earrings right\n- Neck: Black latex choker\n- Top: Black V-neck sleeveless leather crop tank top\n- Hands: Black fingerless leather gloves\n- Hips: Black wet-look booty mini shorts\n- Legs: Black latex thigh-high stockings\n- Feet: Black biker boots",
  },
  {
    name: "Personality", order: 6,
    instruction: "Disposition, values and temperament. 4-6 bullets, each a full sentence describing how she is and how it shows — never a bare adjective list. Voice, speech patterns and mannerisms belong in the Communication sections.",
    examples: [
      "- Focused and independent, rarely asking for help even when she needs it",
      "- Presents a stern, aloof demeanor that masks any inner thoughts or feelings",
      "- Maintains precise control over her actions and interactions",
      "- Softens her stern exterior in private, revealing an expressive side through subtle gestures",
    ],
    exampleBody: "- Focused and independent, rarely asking for help even when she needs it\n- Presents a stern, aloof demeanor that masks any inner thoughts or feelings\n- Maintains precise control over her actions and interactions\n- Softens her stern exterior in private, revealing an expressive side through subtle gestures",
  },
  {
    name: "Communication - Public", order: 7,
    instruction: "How she speaks and carries herself in public or social settings. 3-4 bullets: tone of voice, sentence shape, eye contact and body language, and how she responds to other people.",
    examples: [
      "- Speaks with a sharp and direct tone, reflecting her territorial nature",
      "- Uses clipped sentences, rarely indulging in unnecessary conversation",
      "- Maintains constant eye contact, often a cold glare",
      "- Responds quickly and decisively, brushing off reluctance or hesitation from others",
    ],
    exampleBody: "- Speaks with a sharp and direct tone, reflecting her territorial nature\n- Uses clipped sentences, rarely indulging in unnecessary conversation\n- Maintains constant eye contact, often a cold glare\n- Responds quickly and decisively, brushing off reluctance or hesitation from others",
  },
  {
    name: "Communication - Private", order: 8,
    instruction: "How she speaks and behaves in private or with someone she trusts. 3-4 bullets: tone, what she does with her voice, how she teases or commands, and what she is trying to make the other person feel.",
    examples: [
      "- Voice deepens and softens, filled with an assertive yet sensual edge",
      "- Playful teasing interspersed with commanding remarks",
      "- Uses intimate whispers, words designed to elicit reactions and maintain control",
      "- Each phrase calculated to keep a partner on edge, balancing dominance with a hint of allure",
    ],
    exampleBody: "- Voice deepens and softens, filled with an assertive yet sensual edge\n- Playful teasing interspersed with commanding remarks\n- Uses intimate whispers, words designed to elicit reactions and maintain control\n- Each phrase calculated to keep a partner on edge, balancing dominance with a hint of allure",
  },
  {
    name: "Likes", order: 9,
    instruction: "Things she enjoys. 3-5 bullets as `- Thing: why she likes it`. The reason matters more than the thing — it is what lets her react to something new.",
    examples: [
      "- Honey: finds the taste and texture soothing, a reminder of her own nature",
      "- Quiet moments: values the silence where she can hear only breath or a whisper",
      "- Precision: appreciates measured, efficient action, in a fight or in bed",
    ],
    exampleBody: "- Honey: finds the taste and texture soothing, a reminder of her own nature\n- Quiet moments: values the silence where she can hear only breath or a whisper\n- Precision: appreciates measured, efficient action, in a fight or in bed",
  },
  {
    name: "Dislikes", order: 10,
    instruction: "Things she dislikes or cannot stand. 3-5 bullets as `- Thing: why it bothers her`. The reason matters more than the thing — it is what lets her react to something new.",
    examples: [
      "- Heat: dislikes warmth that melts away her composure",
      "- Disorganization: abhors chaos; prefers a controlled, clean environment",
      "- Hesitation: finds it annoying, and prefers decisive action from others",
    ],
    exampleBody: "- Heat: dislikes warmth that melts away her composure\n- Disorganization: abhors chaos; prefers a controlled, clean environment\n- Hesitation: finds it annoying, and prefers decisive action from others",
  },
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
    exampleBody: s.exampleBody ?? "",
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
      instruction: "Her attitudes, experience and preferences around intimacy. 3-5 bullets as `- Kink (giving/receiving): what she does, why it appeals, and how she pursues it`. Baseline is human anatomy unless the sheet says otherwise — scale it for a non-human body.",
      examples: [
        "- Femdom (giving): She loves manhandling her partner in positions that would give her pleasure too. It would be half the time her being in a compromised position or her partner, as long as he or her gets to do the work.",
        "- Impact Play (giving): She loves the idea of pushing her partner over to edge to climax just from her slapping, smacking, or punching his arm, stomach, or chest while demanding him to cum.",
        "- Fear Play (giving): She would use threats, even faking a punch just to see their reaction; She feels delight from the feeling that every moves or word she makes have a weight behind it enough to make her partner comply.",
      ],
      inline: false,
      exampleBody: "- Femdom (giving): She loves manhandling her partner in positions that would give her pleasure too. It would be half the time her being in a compromised position or her partner, as long as he or her gets to do the work.\n- Impact Play (giving): She loves the idea of pushing her partner over to edge to climax just from her slapping, smacking, or punching his arm, stomach, or chest while demanding him to cum.\n- Fear Play (giving): She would use threats, even faking a punch just to see their reaction; She feels delight from the feeling that every moves or word she makes have a weight behind it enough to make her partner comply.",
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
    // A section's sample body is its multi-line `exampleBody` when set, else its
    // first one-line example, else a "fill me in" marker. The body is what the
    // model imitates, so a section expected to hold several bullets must show
    // several — a one-line example here is what produced one-bullet sheets.
    const body = (s.exampleBody ?? "").trim() || nonEmptyExamples(s)[0] || "...";
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
    "- Two macros are available inside a sheet and must be kept exactly as written: {{char}} resolves to the character's own name at play time, and {{user}} to the player's. Never resolve or rewrite them into a literal name — a sheet that hardcodes a name stops working the moment the same character is played by someone else.",
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
