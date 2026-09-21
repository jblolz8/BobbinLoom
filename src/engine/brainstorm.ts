/**
 * The brainstorm assistant's contract: what the model answers with, and what survives of it.
 *
 * The reply is markdown and the proposals live in **one fenced json block at the end**. Keeping the
 * structured half out of an envelope is what makes the prose half safe: a long markdown answer full
 * of quotes and newlines used to have to survive JSON escaping, and every time it did not, either the
 * proposals vanished or the raw JSON was shown to the reader as chat.
 */

export type ProposedSection = {
  header: string;
  body: string;
};

export type BrainstormProposal = {
  sections?: ProposedSection[];
  name?: string;
  creatorNotes?: string;
  tags?: string[];
  fullContent?: string;
};

export type ParsedBrainstormReply = {
  /** The reply with the proposal block removed. Never contains the block. */
  reply: string;
  proposedChanges?: BrainstormProposal;
  /** Headers the model proposed that this sheet does not have **and that were dropped** — only when
   *  new sections are disallowed. */
  unmappedHeaders: string[];
  /** Headers that are additions rather than edits: kept as new sections, so the card can mark them. */
  newSections: string[];
  /** Whether the model attempted a block at all, so the UI can tell "nothing proposed" from a failure. */
  hadBlock: boolean;
};

export type ProposalOptions = {
  /**
   * Whether a section the format does not list may be proposed. On by default: the sheet machinery
   * appends unknown sections and the format check only asks that its own sections are present and in
   * order, so a `[Daily Life]` beside the canonical ones is an addition, not damage.
   */
  allowNewSections?: boolean;
};

export type BrainstormChatMessageLike = {
  id: string;
  role: "user" | "assistant";
  content: string;
};

/**
 * The old envelope: the whole reply is one JSON object with `reply` and `proposedChanges`.
 *
 * Kept only so a model that ignores the fenced-block instruction is still readable. A reply that
 * merely *starts* with a brace but has no envelope shape is left alone.
 */
function readEnvelope(
  text: string,
  sectionNames: string[],
  options: ProposalOptions = {}
): ParsedBrainstormReply | null {
  if (!text.startsWith("{")) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const obj = parsed as Record<string, unknown>;
  if (!("reply" in obj) && !("proposedChanges" in obj) && !("message" in obj)) return null;
  const reply =
    typeof obj.reply === "string" ? obj.reply : typeof obj.message === "string" ? obj.message : "";
  const { proposal, unmapped, added } = toProposal(obj, sectionNames, options);
  if (!reply.trim() && !proposal) return null;
  return {
    reply: reply.trim() || text,
    proposedChanges: proposal,
    unmappedHeaders: unmapped,
    newSections: added,
    hadBlock: true
  };
}

/** Every ```json block in a reply, in order, with where it sits. */
export function findJsonBlocks(text: string): Array<{ start: number; end: number; body: string }> {
  const pattern = /```[ \t]*json[ \t]*\r?\n([\s\S]*?)```/gi;
  const blocks: Array<{ start: number; end: number; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(text)) !== null) {
    blocks.push({ start: match.index, end: match.index + match[0].length, body: (match[1] ?? "").trim() });
  }
  return blocks;
}

function normaliseHeader(header: string): string {
  return header.replace(/^\[|\]$/g, "").trim().toLowerCase().replace(/\s+/g, " ");
}

/** Letters and digits only, so "Likes & Dislikes" and "likes" are comparable. */
function fingerprint(header: string): string {
  return normaliseHeader(header).replace(/[^a-z0-9]/g, "");
}

/**
 * The section a proposed header means, or null when it means a new one.
 *
 * A model that writes "Personality & Voice" or "likes" means the sheet's `[Personality]` and
 * `[Likes]`; letting those become new sections would leave the sheet with two of each. But
 * "[House Cat]" must stay a section of its own, so the name has to be *joined* to what follows by a
 * connector — a bare space is a different name, not the same one wearing a clause.
 */
function matchCanonicalName(header: string, sectionNames: string[]): string | null {
  const proposed = normaliseHeader(header);
  const wanted = fingerprint(header);
  for (const name of sectionNames) {
    if (fingerprint(name) === wanted) return name;
  }
  for (const name of sectionNames) {
    const canonical = normaliseHeader(name);
    if (!canonical || !proposed.startsWith(canonical)) continue;
    const rest = proposed.slice(canonical.length);
    // "likes & dislikes", "likes and dislikes", "personality: voice" — the same section, rounded out.
    if (/^\s*(?:&|and\b|[:,\/\-–—])/.test(rest)) return name;
  }
  return null;
}

/** Tags as the sheet stores them: trimmed, non-empty, case-insensitively unique. */
export function sanitiseTagList(input: unknown[]): string[] {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const value of input) {
    if (typeof value !== "string") continue;
    const tag = value.trim();
    if (!tag) continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(tag);
  }
  return out;
}

/**
 * Turn whatever the block held into a proposal this sheet can actually accept.
 *
 * A section header the sheet does not have is **dropped and reported** rather than passed on: an
 * invented header would be merged into the content as a brand new section, which is not an edit the
 * model was asked to propose. Some models wrap the object in `proposedChanges` anyway, so both shapes
 * are accepted.
 */
export function toProposal(
  value: unknown,
  sectionNames: string[] = [],
  options: ProposalOptions = {}
): { proposal?: BrainstormProposal; unmapped: string[]; added: string[] } {
  const allowNewSections = options.allowNewSections ?? true;
  if (!value || typeof value !== "object") return { unmapped: [], added: [] };
  const outer = value as Record<string, unknown>;
  const inner =
    outer.proposedChanges && typeof outer.proposedChanges === "object"
      ? (outer.proposedChanges as Record<string, unknown>)
      : outer;

  const known = new Set(sectionNames.map(normaliseHeader));
  const sections: ProposedSection[] = [];
  const unmapped: string[] = [];
  const added: string[] = [];

  if (Array.isArray(inner.sections)) {
    for (const entry of inner.sections) {
      if (!entry || typeof entry !== "object") continue;
      const section = entry as Record<string, unknown>;
      if (typeof section.header !== "string" || typeof section.body !== "string") continue;
      const proposed = section.header.replace(/^\[|\]$/g, "").trim();
      const body = section.body.trim();
      if (!proposed || !body) continue;
      // A header the sheet already has is an edit; a near-miss of one is that edit under another
      // name, and becomes it. Only a genuinely new name is a new section — if it is allowed at all.
      const canonical = sectionNames.length > 0 ? matchCanonicalName(proposed, sectionNames) : null;
      if (canonical) {
        sections.push({ header: canonical, body });
        continue;
      }
      if (known.size > 0 && !known.has(normaliseHeader(proposed))) {
        if (allowNewSections) {
          added.push(proposed);
          sections.push({ header: proposed, body });
        } else {
          unmapped.push(proposed);
        }
        continue;
      }
      sections.push({ header: proposed, body });
    }
  }

  const tags = Array.isArray(inner.tags) ? sanitiseTagList(inner.tags) : undefined;
  const creatorNotes =
    typeof inner.creatorNotes === "string" && inner.creatorNotes.trim() ? inner.creatorNotes.trim() : undefined;
  const name = typeof inner.name === "string" && inner.name.trim() ? inner.name.trim() : undefined;
  const fullContent =
    typeof inner.fullContent === "string" && inner.fullContent.trim() ? inner.fullContent.trim() : undefined;

  const proposal: BrainstormProposal = {
    ...(sections.length > 0 ? { sections } : {}),
    ...(tags && tags.length > 0 ? { tags } : {}),
    ...(creatorNotes ? { creatorNotes } : {}),
    ...(name ? { name } : {}),
    ...(fullContent ? { fullContent } : {})
  };

  return { proposal: Object.keys(proposal).length > 0 ? proposal : undefined, unmapped, added };
}

/**
 * Split a model reply into the prose and the proposals it carries.
 *
 * Only the last block is read — a model that thinks aloud in json and then answers is answering with
 * the last word. A block that does not parse is dropped from the reply like any other (a malformed
 * block rendered as chat is noise), but a reply that was nothing *but* a block keeps its text rather
 * than leaving an empty bubble.
 */
export function parseBrainstormReply(
  text: string,
  sectionNames: string[] = [],
  options: ProposalOptions = {}
): ParsedBrainstormReply {
  const trimmed = text.trim();
  const blocks = findJsonBlocks(trimmed);
  if (blocks.length === 0) {
    // A model that still answers with the old whole-JSON envelope gets read rather than shown: the
    // tolerance costs nothing, and the alternative is a wall of JSON in the chat.
    const envelope = readEnvelope(trimmed, sectionNames, options);
    if (envelope) return envelope;
    return { reply: trimmed, unmappedHeaders: [], newSections: [], hadBlock: false };
  }

  const last = blocks[blocks.length - 1]!;
  let parsed: unknown;
  try {
    parsed = JSON.parse(last.body);
  } catch {
    parsed = undefined;
  }
  const { proposal, unmapped, added } =
    parsed === undefined ? { proposal: undefined, unmapped: [], added: [] } : toProposal(parsed, sectionNames, options);

  // Every json fence goes, not only the one that was read: a fenced block in this conversation is
  // machine talk, whichever block the proposal came from. Text that was nothing but blocks keeps its
  // content rather than leaving an empty bubble.
  let reply = trimmed;
  for (const entry of [...blocks].reverse()) {
    reply = reply.slice(0, entry.start) + reply.slice(entry.end);
  }
  reply = reply.trim();
  if (!reply) reply = trimmed;

  return { reply, proposedChanges: proposal, unmappedHeaders: unmapped, newSections: added, hadBlock: true };
}

/**
 * What the model sees of its own earlier turn.
 *
 * The proposals are part of the history on purpose: without them a follow-up like "make the second
 * one shorter" has nothing to refer to, and the model re-proposes from scratch.
 */
export function brainstormHistoryContent(message: { content: string; proposedChanges?: BrainstormProposal }): string {
  if (!message.proposedChanges) return message.content;
  return [
    message.content,
    "",
    "```json",
    JSON.stringify({ proposedChanges: message.proposedChanges }),
    "```"
  ].join("\n");
}

// ── the per-character session ──
//
// A session lives beside its character on the server (`data/characters/<slug>/brainstorm.json`), so it
// travels with the folder: exporting the folder carries the conversation, and deleting the character
// quarantines the session in the same move. It used to live in the browser's localStorage under the key
// below — the one piece of state a cleared browser or a second device could lose outright, and unlike a
// tab choice, a lost brainstorm is lost work. That key is still READ once, to hand an existing device's
// session over; nothing writes it any more.

export const BRAINSTORM_STORAGE_VERSION = 1;

/** Sessions are trimmed rather than refused: a long thread should not grow without bound. */
export const BRAINSTORM_MESSAGE_LIMIT = 60;

/** The LEGACY device key, keyed by character id. Read once during adoption, never written. */
export function brainstormStorageKey(characterId: string): string {
  return `bobbinloom_brainstorm_${characterId}`;
}

/** One message as it is stored. Checked by SHAPE, because the writer and the reader are a client and a
 *  server that must agree on the format without sharing a component type. */
export type BrainstormSessionMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  proposedChanges?: unknown;
};

export type BrainstormSession = {
  v: number;
  updatedAt: string;
  messages: BrainstormSessionMessage[];
};

/** The tail of a long session, always starting on a question so the trimmed thread still reads. */
export function trimBrainstormMessages<T extends { role: string }>(
  messages: T[],
  limit: number = BRAINSTORM_MESSAGE_LIMIT
): T[] {
  if (messages.length <= limit) return messages;
  const kept = messages.slice(messages.length - limit);
  while (kept.length > 1 && kept[0]?.role === "assistant") kept.shift();
  return kept;
}

export function isBrainstormMessage(value: unknown): boolean {
  if (!value || typeof value !== "object") return false;
  const message = value as Record<string, unknown>;
  return (
    typeof message.id === "string" &&
    (message.role === "user" || message.role === "assistant") &&
    typeof message.content === "string"
  );
}

/** The session the server stores, from messages of unknown provenance: unusable entries are DROPPED —
 *  one bad message must not cost the reader the whole conversation — and the tail is trimmed. */
export function buildBrainstormSession(messages: unknown[]): BrainstormSession {
  const usable = messages.filter(isBrainstormMessage) as BrainstormSessionMessage[];
  return {
    v: BRAINSTORM_STORAGE_VERSION,
    updatedAt: new Date().toISOString(),
    messages: trimBrainstormMessages(usable)
  };
}

/** A session read from disk or off the wire, or null when there is nothing usable: a stale version, a
 *  hand-edited file or a truncated write all read as "no session" rather than as a broken panel. */
export function parseBrainstormSession(raw: unknown): BrainstormSession | null {
  if (!raw || typeof raw !== "object") return null;
  const candidate = raw as { v?: unknown; updatedAt?: unknown; messages?: unknown };
  if (candidate.v !== BRAINSTORM_STORAGE_VERSION || !Array.isArray(candidate.messages)) return null;
  const usable = candidate.messages.filter(isBrainstormMessage) as BrainstormSessionMessage[];
  return {
    v: BRAINSTORM_STORAGE_VERSION,
    updatedAt: typeof candidate.updatedAt === "string" ? candidate.updatedAt : new Date().toISOString(),
    messages: trimBrainstormMessages(usable)
  };
}

/** Messages from the LEGACY device key, or null when it holds nothing usable — a stale or hand-edited
 *  key is dropped rather than handed over. */
export function decodeLegacyBrainstormSession(raw: string | null): unknown[] | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as { v?: unknown; messages?: unknown };
    if (parsed?.v !== BRAINSTORM_STORAGE_VERSION || !Array.isArray(parsed.messages)) return null;
    return parsed.messages;
  } catch {
    return null;
  }
}
