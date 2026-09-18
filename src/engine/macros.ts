/** Runtime-only macro expansion (D10). Source data is never modified. */

/**
 * These carry `/g`, so `String.replace` resets `lastIndex` on every call and reuse
 * here is safe. Anything reaching for `.test()` or `.exec()` must build its own
 * regex rather than use these.
 */
const CHAR_RE = /\{\{\s*char\s*\}\}/gi;
const USER_RE = /\{\{\s*user\s*\}\}/gi;

/** Both macros. Use only where `{{char}}` has an unambiguous owner — a character's
 *  sheet, that character's own runtime block, or their absent one-liner. */
export function expandMacros(text: string, charName: string, playerName: string): string {
  return text.replace(CHAR_RE, charName).replace(USER_RE, playerName);
}

/** `{{user}}` only; `{{char}}` is deliberately left literal. For shared or ownerless
 *  text — a lorebook entry belongs to no single character, and neither does a block
 *  covering several of them. Guessing an owner would substitute the wrong name. */
export function expandUserMacro(text: string, playerName: string): string {
  return text.replace(USER_RE, playerName);
}
