import type { CharacterFormat, ClothingItem } from "../schemas";
import { resolveCharacterFormat } from "./characterFormat";

export type GuidedSectionKind = "body" | "appearance" | "clothing";

export type GuidedSuggestionItem = {
  /** Attribute or clothing slot name (e.g. "Height", "Build", "Top", "Bottom"). */
  key: string;
  /** Optional example value from the active CharacterFormat or built-in defaults. */
  example?: string;
  /** True when this key is already present as a bullet in the current text. */
  used?: boolean;
};

export type GuidedLintDiagnostic = {
  /** 1-based line number in the textarea. */
  line: number;
  /** Severity of the diagnostic. */
  severity: "warning" | "info";
  /** Short human-readable explanation of how to fix or complete the line. */
  message: string;
  /** Optional 1-click replacement for the line. */
  quickFixLine?: string;
};

const BUILTIN_BODY_SUGGESTIONS: Array<{ key: string; example: string }> = [
  { key: "Height", example: "5'10\"" },
  { key: "Build", example: "Average, travel-hardened" },
  { key: "Physique", example: "Lean and toned" },
  { key: "Shoulders", example: "Broad and steady" },
  { key: "Chest", example: "Defined" },
  { key: "Breasts", example: "Modest" },
  { key: "Waist", example: "Trim" },
  { key: "Hips", example: "Proportionate" },
  { key: "Thighs", example: "Strong from long walks" },
];

const BUILTIN_APPEARANCE_SUGGESTIONS: Array<{ key: string; example: string }> = [
  { key: "Skin", example: "Fair, lightly sun-weathered" },
  { key: "Eyes", example: "Alert and observant" },
  { key: "Hair", example: "Short tousled dark hair" },
  { key: "Face", example: "Calm, approachable expression" },
  { key: "Features", example: "Easy, unhurried posture with a well-worn pack" },
  { key: "Posture", example: "Relaxed and attentive" },
  { key: "Voice", example: "Measured and even-toned" },
  { key: "Ears", example: "Human" },
  { key: "Tail", example: "None" },
];

const BUILTIN_CLOTHING_SUGGESTIONS: Array<{ key: string; example: string }> = [
  { key: "Head", example: "Weathered travel cap" },
  { key: "Ears", example: "Simple stud earrings" },
  { key: "Neck", example: "Woven wool scarf" },
  { key: "Outerwear", example: "Light canvas travel coat" },
  { key: "Top", example: "Simple linen shirt" },
  { key: "Top Underwear", example: "Cotton undershirt" },
  { key: "Arms", example: "Rolled-up sleeves" },
  { key: "Hands", example: "Fingerless leather gloves" },
  { key: "Waist", example: "Leather belt with a small pouch" },
  { key: "Hips", example: "Utility belt" },
  { key: "Bottom", example: "Durable travel trousers" },
  { key: "Bottom Underwear", example: "Cotton briefs" },
  { key: "Pelvis", example: "Cotton briefs" },
  { key: "Legs", example: "Thick wool socks" },
  { key: "Feet", example: "Sturdy walking boots" },
  { key: "Accessory", example: "Well-worn travel pack" },
];

const BULLET_KEY_VALUE_RE = /^\s*(?:[-*•]\s*)?([^:\[\]]+?)\s*:\s*(.*)$/;

/** Extract already-used bullet keys (lowercased) from the current text. */
export function extractUsedBulletKeys(text: string): Set<string> {
  const used = new Set<string>();
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^\[[^\]]+\]$/.test(trimmed)) continue;
    const match = trimmed.match(BULLET_KEY_VALUE_RE);
    if (match && match[1].trim()) {
      used.add(match[1].trim().toLowerCase());
    }
  }
  return used;
}

/** Build the ordered list of attribute/slot suggestions for a section kind,
 *  merging the active CharacterFormat's examples and slot lists with built-in defaults. */
export function getSectionSuggestions(
  kind: GuidedSectionKind,
  text: string = "",
  format?: CharacterFormat,
): GuidedSuggestionItem[] {
  const resolved = resolveCharacterFormat(format);
  const sectionName =
    kind === "body"
      ? "body"
      : kind === "appearance"
        ? "appearance"
        : "clothing";
  const formatSec = resolved.sections.find(
    (s) => s.name.trim().toLowerCase() === sectionName,
  );

  const byKey = new Map<string, { key: string; example?: string }>();

  const addEntry = (rawKey: string, example?: string) => {
    const key = rawKey.trim();
    if (!key || key === "...") return;
    const norm = key.toLowerCase();
    const existing = byKey.get(norm);
    if (!existing) {
      byKey.set(norm, { key, example: example?.trim() || undefined });
    } else if (!existing.example && example?.trim()) {
      existing.example = example.trim();
    }
  };

  // 1. Pull keys & examples from the active CharacterFormat section first
  if (formatSec) {
    // Check if the instruction explicitly enumerates "Slots: A, B, C."
    const slotsMatch = formatSec.instruction.match(
      /Slots\s*:\s*([^.]+)\./i,
    );
    if (slotsMatch) {
      for (const token of slotsMatch[1].split(",")) {
        addEntry(token.trim());
      }
    }

    const linesToScan = [
      ...(formatSec.examples ?? []),
      ...(formatSec.exampleBody ? formatSec.exampleBody.split(/\r?\n/) : []),
    ];
    for (const line of linesToScan) {
      const m = line.match(/^\s*[-*•]?\s*([^:\[\]]+?)\s*:\s*(.+)$/);
      if (m) {
        addEntry(m[1], m[2]);
      }
    }
  }

  // 2. Merge built-in baseline suggestions so common attributes/slots are always available
  const builtins =
    kind === "body"
      ? BUILTIN_BODY_SUGGESTIONS
      : kind === "appearance"
        ? BUILTIN_APPEARANCE_SUGGESTIONS
        : BUILTIN_CLOTHING_SUGGESTIONS;

  for (const b of builtins) {
    addEntry(b.key, b.example);
  }

  const usedKeys = extractUsedBulletKeys(text);
  return [...byKey.values()].map((item) => ({
    key: item.key,
    example: item.example,
    used: usedKeys.has(item.key.toLowerCase()),
  }));
}

/** Serialize structured ClothingItem[] into bulleted `- Slot: Garment (state)` text. */
export function formatClothingToText(items: ClothingItem[]): string {
  if (!items || items.length === 0) return "";
  return items
    .map((item) => {
      const slot = item.slot.trim();
      const name = item.name.trim();
      const state = item.state?.trim();
      return state ? `- ${slot}: ${name} (${state})` : `- ${slot}: ${name}`;
    })
    .join("\n");
}

/** Parse bulleted `- Slot: Garment` (or `Slot: Garment (state)`) text into structured ClothingItem[].
 *  When the same slot appears more than once (case-insensitive), the latest entry wins while keeping slot order. */
export function parseClothingFromText(text: string): ClothingItem[] {
  const bySlot = new Map<string, ClothingItem>();
  for (const rawLine of text.split(/\r?\n/)) {
    const trimmed = rawLine.trim();
    if (!trimmed || /^\[[^\]]+\]$/.test(trimmed)) continue;
    const match = trimmed.match(/^\s*(?:[-*•]\s*)?([^:]+):\s*(.+)$/);
    if (!match) continue;
    const slot = match[1].trim();
    const rawRest = match[2].trim();
    if (!slot || !rawRest) continue;

    const stateMatch = rawRest.match(/^(.*?)\s+\(([^()]+)\)$/);
    const item: ClothingItem =
      stateMatch && stateMatch[1].trim()
        ? {
            slot,
            name: stateMatch[1].trim(),
            state: stateMatch[2].trim(),
          }
        : {
            slot,
            name: rawRest,
          };
    bySlot.set(slot.toLowerCase(), item);
  }
  return [...bySlot.values()];
}

/** Lint the text of a guided section (`body`, `appearance`, or `clothing`) and return
 *  non-blocking line diagnostics + optional 1-click quick fixes. */
export function lintGuidedSectionText(
  text: string,
  kind: GuidedSectionKind,
): GuidedLintDiagnostic[] {
  const diagnostics: GuidedLintDiagnostic[] = [];
  const lines = text.split(/\r?\n/);
  const seenKeys = new Map<string, number>();

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();
    const lineNo = i + 1;
    if (!trimmed || /^\[[^\]]+\]$/.test(trimmed)) continue;

    if (kind === "clothing") {
      const colonIdx = trimmed.indexOf(":");
      if (colonIdx === -1) {
        const cleanItem = trimmed.replace(/^[-*•]\s*/, "").trim();
        diagnostics.push({
          line: lineNo,
          severity: "warning",
          message: `Line ${lineNo}: Missing "- Slot: Garment" format (e.g. "- Top: ${cleanItem || "Simple linen shirt"}").`,
          quickFixLine: `- Top: ${cleanItem}`,
        });
        continue;
      }

      const rawSlot = trimmed
        .slice(0, colonIdx)
        .replace(/^[-*•]\s*/, "")
        .trim();
      const rawVal = trimmed.slice(colonIdx + 1).trim();

      if (!rawSlot) {
        diagnostics.push({
          line: lineNo,
          severity: "warning",
          message: `Line ${lineNo}: Missing slot name before ":" (e.g. "- Top: ${rawVal || "Simple linen shirt"}").`,
          quickFixLine: `- Top: ${rawVal}`,
        });
        continue;
      }

      if (!rawVal) {
        diagnostics.push({
          line: lineNo,
          severity: "warning",
          message: `Line ${lineNo}: Slot "${rawSlot}" needs a garment description after ":".`,
        });
        continue;
      }

      const normSlot = rawSlot.toLowerCase();
      const prevLine = seenKeys.get(normSlot);
      if (prevLine !== undefined) {
        diagnostics.push({
          line: lineNo,
          severity: "warning",
          message: `Line ${lineNo}: Duplicate slot "${rawSlot}" (already on line ${prevLine}; only the latest line for a slot is kept).`,
        });
      } else {
        seenKeys.set(normSlot, lineNo);
      }

      if (!/^\s*-\s+/.test(rawLine)) {
        diagnostics.push({
          line: lineNo,
          severity: "info",
          message: `Line ${lineNo}: Prefix clothing bullets with "- " for consistency.`,
          quickFixLine: `- ${rawSlot}: ${rawVal}`,
        });
      }
    } else {
      // Body or Appearance: supports both `- Key: Value` bullets and freeform text,
      // while checking incomplete or duplicate `- Key:` bullets.
      if (/^\s*[-*•]/.test(rawLine)) {
        const colonIdx = trimmed.indexOf(":");
        if (colonIdx !== -1) {
          const rawKey = trimmed
            .slice(0, colonIdx)
            .replace(/^[-*•]\s*/, "")
            .trim();
          const rawVal = trimmed.slice(colonIdx + 1).trim();
          if (rawKey && !rawVal) {
            diagnostics.push({
              line: lineNo,
              severity: "warning",
              message: `Line ${lineNo}: "${rawKey}" bullet has no description after ":".`,
            });
          } else if (rawKey) {
            const normKey = rawKey.toLowerCase();
            const prevLine = seenKeys.get(normKey);
            if (prevLine !== undefined) {
              diagnostics.push({
                line: lineNo,
                severity: "info",
                message: `Line ${lineNo}: Duplicate "${rawKey}" bullet (also on line ${prevLine}).`,
              });
            } else {
              seenKeys.set(normKey, lineNo);
            }
          }
        }
      }
    }
  }

  return diagnostics;
}

/** Apply a `quickFixLine` replacement to a 1-based line number in `text`. */
export function applyLineQuickFix(
  text: string,
  lineNumber: number,
  replacementLine: string,
): string {
  const lines = text.split(/\r?\n/);
  const idx = lineNumber - 1;
  if (idx < 0 || idx >= lines.length) return text;
  lines[idx] = replacementLine;
  return lines.join("\n");
}

export type AutocompleteContext = {
  /** Whether the autocomplete popover should be shown. */
  active: boolean;
  /** The user's typed key query on the current line (e.g. "" for `- `, "He" for `- He`). */
  query: string;
  /** 1-based line number where the cursor sits. */
  lineNumber: number;
  /** Start character offset of the current line. */
  lineStart: number;
  /** End character offset of the current line. */
  lineEnd: number;
  /** Filtered suggestions (unused items sorted first, then prefix matches, then substring matches). */
  matches: GuidedSuggestionItem[];
};

/** Inspect the text and caret position to determine if inline autocomplete should trigger. */
export function getAutocompleteContext(
  text: string,
  caretOffset: number,
  suggestions: GuidedSuggestionItem[],
  forceOpen: boolean = false,
): AutocompleteContext {
  const clampedCaret = Math.max(0, Math.min(caretOffset, text.length));
  const lineStart =
    clampedCaret === 0 ? 0 : text.lastIndexOf("\n", clampedCaret - 1) + 1;
  const nextNewline = text.indexOf("\n", clampedCaret);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const beforeCaret = text.slice(lineStart, clampedCaret);
  const lineNumber = text.slice(0, lineStart).split("\n").length;

  // If the caret is already past a colon on this line, we are typing the value, not the key.
  if (beforeCaret.includes(":")) {
    return {
      active: false,
      query: "",
      lineNumber,
      lineStart,
      lineEnd,
      matches: [],
    };
  }

  const bulletKeyMatch = beforeCaret.match(/^\s*-\s*([a-zA-Z0-9 _-]*)$/);
  const emptyLineForce = forceOpen
    ? beforeCaret.match(/^\s*([a-zA-Z0-9 _-]*)$/)
    : null;

  if (!bulletKeyMatch && !emptyLineForce) {
    return {
      active: false,
      query: "",
      lineNumber,
      lineStart,
      lineEnd,
      matches: [],
    };
  }

  const query = (
    bulletKeyMatch ? bulletKeyMatch[1] : (emptyLineForce ? emptyLineForce[1] : "")
  ).trim();
  const normQuery = query.toLowerCase();

  const filtered = suggestions
    .filter((s) =>
      normQuery ? s.key.toLowerCase().includes(normQuery) : true,
    )
    .sort((a, b) => {
      // Unused keys first
      if (Boolean(a.used) !== Boolean(b.used)) {
        return a.used ? 1 : -1;
      }
      // Prefix matches first when query is non-empty
      if (normQuery) {
        const aStarts = a.key.toLowerCase().startsWith(normQuery);
        const bStarts = b.key.toLowerCase().startsWith(normQuery);
        if (aStarts !== bStarts) return aStarts ? -1 : 1;
      }
      return 0;
    });

  return {
    active: filtered.length > 0,
    query,
    lineNumber,
    lineStart,
    lineEnd,
    matches: filtered,
  };
}

/** Complete the current line at `caretOffset` with `- ${key}: `, preserving any existing value after `:`
 *  and returning the new text + new caret offset right after `: `. */
export function applyAutocompleteSuggestion(
  text: string,
  caretOffset: number,
  key: string,
): { text: string; caretOffset: number } {
  const clampedCaret = Math.max(0, Math.min(caretOffset, text.length));
  const lineStart =
    clampedCaret === 0 ? 0 : text.lastIndexOf("\n", clampedCaret - 1) + 1;
  const nextNewline = text.indexOf("\n", clampedCaret);
  const lineEnd = nextNewline === -1 ? text.length : nextNewline;
  const currentLine = text.slice(lineStart, lineEnd);

  const colonIdx = currentLine.indexOf(":");
  const existingAfterColon =
    colonIdx !== -1 ? currentLine.slice(colonIdx + 1).trimStart() : "";

  const prefix = `- ${key.trim()}: `;
  const replacementLine = `${prefix}${existingAfterColon}`;
  const nextText =
    text.slice(0, lineStart) + replacementLine + text.slice(lineEnd);
  const nextCaret = lineStart + prefix.length;

  return {
    text: nextText,
    caretOffset: nextCaret,
  };
}

/** Append `- ${key}: ` on a new line (or replace a trailing empty `- ` line) and return the new text and caret offset. */
export function insertBulletKey(
  text: string,
  key: string,
): { text: string; caretOffset: number } {
  const cleanKey = key.trim();
  const bulletPrefix = `- ${cleanKey}: `;

  if (!text.trim()) {
    return {
      text: bulletPrefix,
      caretOffset: bulletPrefix.length,
    };
  }

  // If the text ends with an empty bullet `-` or `- `, replace that trailing line
  const trailingEmptyBullet = text.match(/(?:^|\n)\s*-\s*$/);
  if (trailingEmptyBullet && trailingEmptyBullet.index !== undefined) {
    const startIdx = trailingEmptyBullet[0].startsWith("\n")
      ? trailingEmptyBullet.index + 1
      : trailingEmptyBullet.index;
    const nextText = text.slice(0, startIdx) + bulletPrefix;
    return {
      text: nextText,
      caretOffset: nextText.length,
    };
  }

  const separator = text.endsWith("\n") ? "" : "\n";
  const nextText = `${text}${separator}${bulletPrefix}`;
  return {
    text: nextText,
    caretOffset: nextText.length,
  };
}
