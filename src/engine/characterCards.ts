import type { CharacterTemplate } from "../schemas";
import { sortTags } from "./tagTaxonomy";

/** Booru-style tag normalization: lowercase, trim, spaces→underscores, dedupe, and canonical category sort. */
export function normalizeTags(tags: string[]): string[] {
  return sortTags(tags);
}

/** Creator normalization: lowercase, trim, strip leading @/URLs, "" when empty. */
export function normalizeCreator(creator: string | undefined): string {
  return (creator ?? "").trim().toLowerCase().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?/, "");
}

export type LibraryEntryKind = "bl" | "ccv2";
export function entryKind(t: CharacterTemplate): LibraryEntryKind {
  return t.format === "ccv2" ? "ccv2" : "bl";
}

export type CardBadgeKind = "ccv2" | "ccv2bl" | null;

/** Library card badge: unconverted CCv2 = "CCv2"; converted (has ccv2Content,
 *  format dropped to BL) = "CCv2 / BL"; native BL with no original = null. */
export function cardBadgeLabel(t: CharacterTemplate): CardBadgeKind {
  if (t.format === "ccv2") return "ccv2";
  if (t.ccv2Content !== undefined) return "ccv2bl";
  return null;
}

export function displayTitle(t: CharacterTemplate): string {
  return (t.title ?? "").trim() || t.name;
}

export interface LibraryQuery { text: string }

/** Booru tag matcher: exact match with whitespace/underscore/hyphen normalization and optional wildcards (*). */
export function matchesTag(tag: string, target: string): boolean {
  const normTag = tag.trim().toLowerCase();
  const normTarget = target.trim().toLowerCase();
  if (!normTag || !normTarget) return false;
  if (normTag === normTarget) return true;

  const tagFlat = normTag.replace(/[-_\s]+/g, " ");
  const targetFlat = normTarget.replace(/[-_\s]+/g, " ");
  if (tagFlat === targetFlat) return true;

  // Wildcard support: *suffix, prefix*, or *substring*
  if (normTarget.startsWith("*") && normTarget.endsWith("*") && normTarget.length > 2) {
    const inner = normTarget.slice(1, -1);
    return normTag.includes(inner) || tagFlat.includes(inner.replace(/[-_\s]+/g, " "));
  }
  if (normTarget.endsWith("*") && normTarget.length > 1) {
    const prefix = normTarget.slice(0, -1);
    return normTag.startsWith(prefix) || tagFlat.startsWith(prefix.replace(/[-_\s]+/g, " "));
  }
  if (normTarget.startsWith("*") && normTarget.length > 1) {
    const suffix = normTarget.slice(1);
    return normTag.endsWith(suffix) || tagFlat.endsWith(suffix.replace(/[-_\s]+/g, " "));
  }

  return false;
}

export function parseQueryTerms(query: string): string[] {
  const terms: string[] = [];
  const regex = /(-?(?:tag|creator|format):"(?:[^"\\]|\\.)*"|-?(?:tag|creator|format):[^\s]+|"(?:[^"\\]|\\.)*"|[^\s]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    let term = match[0].trim();
    if (!term) continue;
    // Strip inner quotes from tag:"...", creator:"...", -tag:"..."
    term = term.replace(/^(-?(?:tag|creator|format):)"([^"]*)"$/i, "$1$2");
    // Strip surrounding quotes "..."
    term = term.replace(/^"|"$/g, "");
    if (term) {
      terms.push(term.toLowerCase());
    }
  }
  return terms;
}

/** Booru search: whitespace/quote-split terms; `-tag` excludes; `creator:x` / `format:x` / `tag:x`
 *  virtual namespaces; otherwise match title/name/tags (case-insensitive substring). */
export function filterLibraryEntries(entries: CharacterTemplate[], query: string): CharacterTemplate[] {
  const terms = parseQueryTerms(query);
  if (terms.length === 0) return entries;
  return entries.filter((e) => {
    const rawTags = (e.tags ?? []).map((t) => t.toLowerCase());
    const creator = (e.creator ?? "").toLowerCase();
    const format = entryKind(e);
    const title = displayTitle(e).toLowerCase();
    const name = e.name.toLowerCase();

    for (const raw of terms) {
      const negate = raw.startsWith("-");
      const term = negate ? raw.slice(1) : raw;
      let hit: boolean;
      if (term.startsWith("creator:")) {
        hit = creator.includes(term.slice(8));
      } else if (term.startsWith("format:")) {
        hit = format === term.slice(7);
      } else if (term.startsWith("tag:")) {
        const tagTarget = term.slice(4);
        hit = rawTags.some((t) => matchesTag(t, tagTarget));
      } else {
        hit =
          rawTags.some((t) => matchesTag(t, term)) ||
          title.includes(term) ||
          name.includes(term);
      }
      if (negate ? hit : !hit) return false;
    }
    return true;
  });
}

/** Collect playthrough-setting candidates from CCv2-backed records (F6). */
export function collectCardSettings(entries: CharacterTemplate[]): Array<{ title: string; scenario: string }> {
  const seen = new Set<string>();
  const out: Array<{ title: string; scenario: string }> = [];
  for (const e of entries) {
    const s = (e.scenario ?? "").trim();
    if (entryKind(e) !== "ccv2" || !s || seen.has(s)) continue;
    seen.add(s);
    out.push({ title: displayTitle(e), scenario: s });
  }
  return out;
}
