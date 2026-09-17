/** Heading slugs, shared by the docs renderer (which writes heading ids) and the
 *  docs search (which points a hit at its nearest heading).
 *
 *  One implementation on purpose: a second copy would drift, and the symptom is
 *  a search result that scrolls nowhere. */
export function slugifyHeading(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9 -]/g, "")
    .trim()
    .replace(/ /g, "-");
}

const HEADING_LINE = /^#{1,6}\s+(.+?)\s*$/;
const FENCE_LINE = /^(```|~~~)/;

/** The last real heading at or before `index`, or null when the hit precedes
 *  every heading. Lines inside a fenced block are skipped: a `#` in a shell
 *  snippet is a comment, not a heading. */
export function nearestHeading(body: string, index: number): { text: string; slug: string } | null {
  let found: { text: string; slug: string } | null = null;
  let offset = 0;
  let inFence = false;

  for (const line of body.split("\n")) {
    if (offset > index) break;
    if (FENCE_LINE.test(line)) {
      inFence = !inFence;
    } else if (!inFence) {
      const match = HEADING_LINE.exec(line);
      if (match) found = { text: match[1], slug: slugifyHeading(match[1]) };
    }
    offset += line.length + 1;
  }
  return found;
}
