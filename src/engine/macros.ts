/** Runtime-only macro expansion (D10). Source data is never modified. */
import { sortPlaythroughTags } from "./playthroughTagTaxonomy";

/**
 * These carry `/g`, so `String.replace` resets `lastIndex` on every call and reuse
 * here is safe. Anything reaching for `.test()` or `.exec()` must build its own
 * regex rather than use these.
 */
const CHAR_RE = /\{\{\s*char\s*\}\}/gi;
const USER_RE = /\{\{\s*user\s*\}\}/gi;
const PLAYTHROUGH_TAGS_RE = /\{\{\s*playthroughTags\s*\}\}/gi;

export const EMPTY_PLAYTHROUGH_TAGS_FALLBACK =
  "determined by the scenario and story so far";

/** Both macros. Use only where `{{char}}` has an unambiguous owner — a character's
 *  sheet, that character's own runtime block, or their absent one-liner. */
export function expandMacros(
  text: string,
  charName: string,
  playerName: string,
): string {
  return text.replace(CHAR_RE, charName).replace(USER_RE, playerName);
}

/** `{{user}}` only; `{{char}}` is deliberately left literal. For shared or ownerless
 *  text — a lorebook entry belongs to no single character, and neither does a block
 *  covering several of them. Guessing an owner would substitute the wrong name. */
export function expandUserMacro(text: string, playerName: string): string {
  return text.replace(USER_RE, playerName);
}

/**
 * Formats a playthrough's assigned tags into a natural, human-readable list
 * preserving category prefixes with spaces (e.g.
 * `"theme: dark romance, setting: modern day, trope: femdom, and trope: power play"`),
 * or returns `"determined by the scenario and story so far"` when no tags are assigned.
 */
export function formatPlaythroughTagsMacro(
  tags?: readonly string[] | null,
): string {
  const sorted = sortPlaythroughTags(tags ? [...tags] : []);
  if (sorted.length === 0) return EMPTY_PLAYTHROUGH_TAGS_FALLBACK;

  const formatted = sorted.map((tag) => {
    const colonIdx = tag.indexOf(":");
    if (colonIdx > 0) {
      const prefix = tag.slice(0, colonIdx).trim();
      const value = tag
        .slice(colonIdx + 1)
        .replace(/_/g, " ")
        .trim();
      return `${prefix}: ${value}`;
    }
    return tag.replace(/_/g, " ").trim();
  });

  if (formatted.length === 1) return formatted[0];
  if (formatted.length === 2) return `${formatted[0]} and ${formatted[1]}`;
  return `${formatted.slice(0, -1).join(", ")}, and ${formatted[formatted.length - 1]}`;
}

/**
 * Expands `{{playthroughTags}}` in turn prompt modules at prompt-build time.
 */
export function expandPlaythroughTagsMacro(
  text: string,
  tags?: readonly string[] | null,
): string {
  if (!text.includes("{{")) return text;
  return text.replace(PLAYTHROUGH_TAGS_RE, () =>
    formatPlaythroughTagsMacro(tags),
  );
}
