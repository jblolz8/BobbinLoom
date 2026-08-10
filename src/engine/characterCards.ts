import type { CharacterTemplate } from "../schemas";

/** Booru-style tag normalization: lowercase, trim, spaces→underscores, dedupe. */
export function normalizeTags(tags: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const t of tags) {
    const n = t.trim().toLowerCase().replace(/\s+/g, "_");
    if (n && !seen.has(n)) { seen.add(n); out.push(n); }
  }
  return out;
}

/** Creator normalization: lowercase, trim, strip leading @/URLs, "" when empty. */
export function normalizeCreator(creator: string | undefined): string {
  return (creator ?? "").trim().toLowerCase().replace(/^@+/, "").replace(/^https?:\/\/(www\.)?/, "");
}

export type LibraryEntryKind = "bl" | "ccv2";
export function entryKind(t: CharacterTemplate): LibraryEntryKind {
  return t.format === "ccv2" ? "ccv2" : "bl";
}

export function displayTitle(t: CharacterTemplate): string {
  return (t.title ?? "").trim() || t.name;
}

export interface LibraryQuery { text: string }
/** Booru search: whitespace-split terms; `-tag` excludes; `creator:x` / `format:x`
 *  virtual namespaces; otherwise match title/name/tags (case-insensitive substring). */
export function filterLibraryEntries(entries: CharacterTemplate[], query: string): CharacterTemplate[] {
  const terms = query.trim().toLowerCase().split(/\s+/).filter(Boolean);
  if (terms.length === 0) return entries;
  return entries.filter((e) => {
    const tags = new Set((e.tags ?? []).map((t) => t.toLowerCase()));
    const creator = (e.creator ?? "").toLowerCase();
    const format = entryKind(e);
    const title = displayTitle(e).toLowerCase();
    const name = e.name.toLowerCase();
    for (const raw of terms) {
      const negate = raw.startsWith("-");
      const term = negate ? raw.slice(1) : raw;
      let hit: boolean;
      if (term.startsWith("creator:")) hit = creator.includes(term.slice(8));
      else if (term.startsWith("format:")) hit = format === term.slice(7);
      else hit = tags.has(term) || title.includes(term) || name.includes(term);
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
