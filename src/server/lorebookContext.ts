import { scanLorebooks } from "../engine/contextBudgeting";
import type { LorebookEntry } from "../schemas";
import { getLorebook } from "./store";

/** Budget estimate: 25% of max_tokens, ~4 chars/token. */
export function lorebookBudgetChars(maxTokens: number): number {
  return Math.floor(maxTokens * 0.25 * 4);
}

export function buildLorebookContextFromEntries(
  entries: LorebookEntry[],
  haystackText: string,
  budgetChars: number,
  lorebookDefaults: {
    scanDepth: number;
    caseSensitive: boolean;
    matchWholeWords: boolean;
  } = {
    scanDepth: 2,
    caseSensitive: false,
    matchWholeWords: false,
  },
): string {
  const activated = scanLorebooks({
    messages: [{ role: "user", content: haystackText }],
    entries,
    lorebookDefaults,
  });
  let used = 0;
  const included: string[] = [];
  for (const { entry: e } of activated) {
    if (used + e.content.length > budgetChars) break;
    included.push(e.content);
    used += e.content.length;
  }
  if (included.length === 0) return "";
  return (
    "WORLD LORE (use this to ground your generation):\n" + included.join("\n\n")
  );
}

export function buildLorebookContext(
  lorebookIds: string[] | undefined,
  haystackText: string,
  budgetChars: number,
): string {
  if (!lorebookIds || lorebookIds.length === 0) return "";
  const entries: LorebookEntry[] = [];
  for (const id of lorebookIds) {
    const lb = getLorebook(id);
    if (!lb) continue;
    const lbScanDepth = lb.scanDepth ?? 2;
    const lbCaseSensitive = Boolean(lb.caseSensitive);
    const lbMatchWholeWords = Boolean(lb.matchWholeWords);
    for (const entry of Object.values(lb.entries)) {
      entries.push({
        ...entry,
        scanDepth: entry.scanDepth ?? lbScanDepth,
        caseSensitive: Boolean(entry.caseSensitive || lbCaseSensitive),
        matchWholeWords: Boolean(entry.matchWholeWords || lbMatchWholeWords),
      });
    }
  }
  return buildLorebookContextFromEntries(entries, haystackText, budgetChars);
}
