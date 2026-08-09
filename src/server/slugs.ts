/** Slug helpers for folder-per-entity storage (data/characters, data/personas). */

/** Lowercase ASCII slug from a display name: runs of non-[a-z0-9] → dashes,
 *  trimmed at the ends, capped. Windows- and case-insensitive-filesystem safe
 *  ("Mira" and "mira" must never collide). Falls back to "unnamed". */
export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64) || "unnamed"
  );
}

/** Numeric-suffix a slug when it collides with existing ones (mira → mira-2). */
export function uniqueSlug(base: string, existing: Set<string>): string {
  if (!existing.has(base)) return base;
  let i = 2;
  while (existing.has(`${base}-${i}`)) i += 1;
  return `${base}-${i}`;
}
