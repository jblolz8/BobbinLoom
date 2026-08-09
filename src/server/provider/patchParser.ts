/**
 * Escape raw control characters (U+0000–U+001F) that appear inside double-quoted
 * string literals, and drop backslashes before characters that are not valid JSON
 * escapes (models habitually emit `\'` for apostrophes — invalid JSON). Strict JSON
 * forbids both; some models emit them in prose fields (character sheets, summaries)
 * despite valid examples. The scanner tracks in-string and escape state so valid
 * sequences like \\n or \\" are never double-escaped, and control chars only used
 * as whitespace between tokens are left untouched.
 */
export function repairRawControlChars(text: string): string {
  const VALID_ESCAPES = new Set(['"', "\\", "/", "b", "f", "n", "r", "t", "u"]);

  let out = "";
  let inString = false;
  let escaped = false;

  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    const code = ch.charCodeAt(0);

    if (!inString) {
      out += ch;
      if (ch === '"') inString = true;
      continue;
    }

    if (escaped) {
      escaped = false;
      if (code < 0x20) {
        out += escapeControlChar(code);
        continue;
      }
      if (VALID_ESCAPES.has(ch)) {
        out += "\\" + ch;
      } else {
        out += ch;
      }
      continue;
    }
    if (ch === "\\") {
      escaped = true;
      continue;
    }
    if (ch === '"') {
      out += ch;
      inString = false;
      continue;
    }
    if (code < 0x20) {
      out += escapeControlChar(code);
      continue;
    }

    out += ch;
  }

  return out;
}

function escapeControlChar(code: number): string {
  switch (code) {
    case 0x08: return "\\b";
    case 0x09: return "\\t";
    case 0x0a: return "\\n";
    case 0x0c: return "\\f";
    case 0x0d: return "\\r";
    default: return "\\u" + code.toString(16).padStart(4, "0");
  }
}

export function parseStrictOrRepaired(text: string): unknown | null {
  try {
    return JSON.parse(text);
  } catch {
    const repaired = repairRawControlChars(text);
    if (repaired === text) return null;
    try {
      return JSON.parse(repaired);
    } catch {
      return null;
    }
  }
}

export function extractJsonPayload(content: string): unknown | null {
  const trimmed = content.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
    const parsed = parseStrictOrRepaired(trimmed);
    if (parsed !== null) return parsed;
  }

  const fenceMatch = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fenceMatch?.[1]) {
    const parsed = parseStrictOrRepaired(fenceMatch[1].trim());
    if (parsed !== null) return parsed;
  }

  const firstBrace = trimmed.indexOf("{");
  const lastBrace = trimmed.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    const parsed = parseStrictOrRepaired(trimmed.slice(firstBrace, lastBrace + 1));
    if (parsed !== null) return parsed;
  }

  return null;
}

export function completionValidator(text: string): string | null {
  try {
    const payload = JSON.parse(text) as {
      choices?: Array<{ message?: { content?: string | null } }>;
    };
    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    return content ? null : "Provider returned an empty completion";
  } catch {
    return "Provider returned a non-JSON response";
  }
}
