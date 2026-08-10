/** Runtime-only macro expansion (D10). Source data is never modified. */
export function expandMacros(text: string, charName: string, playerName: string): string {
  return text.replace(/\{\{char\}\}/gi, charName).replace(/\{\{user\}\}/gi, playerName);
}
