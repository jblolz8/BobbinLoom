/**
 * What the story changed in a character's sheet, read back out of the turn log.
 *
 * Every turn stores `patchInfo.applied` — the human sentences the engine writes as it applies a patch —
 * and the sheet ones name the character AND the section: `"section item replaced: Mika → [Personality]
 * a ⇒ b"`. So the sheet's growth history needs no new state to display, and it is self-healing in a way
 * a stored log is not: revert the story and the marks for the erased turns go with it, instead of
 * claiming changes that no longer exist.
 *
 * The lines are prose, so the parse is deliberately literal: a line this module does not recognise
 * contributes NOTHING rather than a guess. A character renamed since a change also loses those marks —
 * never a wrong one.
 */

export type SectionChange = {
  /** The story turn whose response carried the patch. */
  turn: number;
  /** What changed inside the section, in the engine's own words — may be empty. */
  note: string;
};

/** The shape the client's messages satisfy; structural so it needs no import from the schema. */
export type ProvenanceMessage = {
  turn?: number;
  patchInfo?: { applied?: string[] };
};

/** One entry per sheet verb the engine writes. `headerIndex` says which `[Header]` names the section:
 *  a rename's CURRENT name is the second one, every other verb's is the first. Clothing updates name
 *  no header at all — they always mean the Clothing section. */
const SECTION_LINE_PATTERNS: ReadonlyArray<{
  verb: string;
  headerIndex: number | "clothing";
}> = [
  { verb: "section updated", headerIndex: 0 },
  { verb: "section removed", headerIndex: 0 },
  { verb: "section renamed", headerIndex: 1 },
  { verb: "section item added", headerIndex: 0 },
  { verb: "section item removed", headerIndex: 0 },
  { verb: "section item replaced", headerIndex: 0 },
  { verb: "clothing updated", headerIndex: "clothing" }
];

function readSectionLine(
  line: string,
  characterName: string,
  turn: number
): { section: string; change: SectionChange } | null {
  for (const pattern of SECTION_LINE_PATTERNS) {
    const prefix = pattern.verb + ": ";
    if (!line.startsWith(prefix)) continue;
    const rest = line.slice(prefix.length);

    if (pattern.headerIndex === "clothing") {
      // "clothing updated: <name> (via section redirect)"
      if (!rest.startsWith(characterName + " ")) return null;
      return { section: "Clothing", change: { turn, note: "" } };
    }

    // Every other verb only ever writes this character's own sheet, so anything else is not ours.
    if (!rest.startsWith(characterName + " → [")) return null;
    const headers = [...line.matchAll(/\[([^\]]+)\]/g)].map((match) => match[1]);
    const header = headers[pattern.headerIndex];
    if (!header) return null;

    const closing = line.indexOf("]", line.indexOf("[" + header + "]"));
    const note = closing === -1 ? "" : line.slice(closing + 1).replace(/^[\s⇒|]+/, "").trim();
    return { section: header, change: { turn, note } };
  }
  return null;
}

/**
 * Every sheet change the story made to one character, keyed by section header — oldest first, so the
 * last entry is the most recent change. Sections with no recognised change simply have no entry.
 */
export function sectionProvenance(
  messages: ReadonlyArray<ProvenanceMessage>,
  characterName: string
): Map<string, SectionChange[]> {
  const out = new Map<string, SectionChange[]>();
  if (!characterName) return out;

  for (const message of messages) {
    const applied = message.patchInfo?.applied;
    if (!applied || applied.length === 0) continue;
    if (typeof message.turn !== "number") continue;

    for (const line of applied) {
      const read = readSectionLine(line, characterName, message.turn);
      if (!read) continue;
      const existing = out.get(read.section);
      if (existing) existing.push(read.change);
      else out.set(read.section, [read.change]);
    }
  }

  for (const changes of out.values()) changes.sort((a, b) => a.turn - b.turn);
  return out;
}

/** The most recent change in a section, or null when there is none. */
export function latestChange(changes: SectionChange[] | undefined): SectionChange | null {
  if (!changes || changes.length === 0) return null;
  return changes[changes.length - 1];
}
