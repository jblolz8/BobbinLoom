import type { LorebookEntry } from "../schemas";
import { getLorebook } from "./store";

/** Budget estimate: 25% of max_tokens, ~4 chars/token. */
export function lorebookBudgetChars(maxTokens: number): number {
  return Math.floor(maxTokens * 0.25 * 4);
}

export function buildLorebookContextFromEntries(entries: LorebookEntry[], haystackText: string, budgetChars: number): string {
  const constants = entries.filter((e) => e.constant && !e.disable);
  const selective = entries.filter((e) => {
    if (e.disable || e.constant || !e.key || e.key.length === 0) return false;
    const hay = haystackText.toLowerCase();
    return e.key.some((k) => k.trim().length > 0 && hay.includes(k.trim().toLowerCase()));
  });
  let used = 0;
  const included: string[] = [];
  for (const e of [...constants, ...selective]) {
    if (used + e.content.length > budgetChars) break;
    included.push(e.content);
    used += e.content.length;
  }
  if (included.length === 0) return "";
  return "WORLD LORE (use this to ground your generation):\n" + included.join("\n\n");
}

export function buildLorebookContext(lorebookIds: string[] | undefined, haystackText: string, budgetChars: number): string {
  if (!lorebookIds || lorebookIds.length === 0) return "";
  const entries: LorebookEntry[] = [];
  for (const id of lorebookIds) {
    const lb = getLorebook(id);
    if (lb) entries.push(...Object.values(lb.entries));
  }
  return buildLorebookContextFromEntries(entries, haystackText, budgetChars);
}