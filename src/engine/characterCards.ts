import type { CharacterTemplate } from "../schemas";
import { sortTags } from "./tagTaxonomy";

/** Booru-style tag normalization: lowercase, trim, spaces→underscores, dedupe, and canonical category sort. */
export function normalizeTags(tags: string[]): string[] {
  return sortTags(tags);
}

/** Creator normalization: lowercase, trim, strip leading @/URLs, "" when empty. */
export function normalizeCreator(creator: string | undefined): string {
  return (creator ?? "")
    .trim()
    .toLowerCase()
    .replace(/^@+/, "")
    .replace(/^https?:\/\/(www\.)?/, "");
}

export type LibraryEntryKind = "bl" | "ccv2";
export function entryKind(t: CharacterTemplate): LibraryEntryKind {
  return t.format === "ccv2" ? "ccv2" : "bl";
}

export type CardBadgeKind = "ccv2" | "ccv2bl" | null;

/** Library card badge: unconverted CCv2 = "CCv2"; converted (has ccv2Content,
 *  format dropped to BL) = "CCv2 / BL"; native BL with no original = null. */
export function cardBadgeLabel(t: CharacterTemplate): CardBadgeKind {
  if (t.format === "ccv2") return "ccv2";
  if (t.ccv2Content !== undefined) return "ccv2bl";
  return null;
}

/** True when a converted BL card still retains embedded CCv2 source metadata/sidecars (`CCv2 / BL`). */
export function hasCcv2Source(t: CharacterTemplate): boolean {
  if (t.format === "ccv2") return false;
  return (
    t.ccv2Content !== undefined ||
    t.ccv2CreatorNotes !== undefined ||
    t.ccv2Tags !== undefined ||
    t.cardRef !== undefined
  );
}

export function displayTitle(t: CharacterTemplate): string {
  return (t.title ?? "").trim() || t.name;
}

/** True when `t.title` is non-empty and differs (case-insensitively) from `t.name`. */
export function hasDistinctTitle(t: CharacterTemplate): boolean {
  const title = (t.title ?? "").trim();
  return Boolean(
    title && title.toLowerCase() !== t.name.trim().toLowerCase(),
  );
}

export interface LibraryQuery {
  text: string;
}

/** Booru tag matcher: exact match with whitespace/underscore/hyphen normalization and optional wildcards (*). */
export function matchesTag(tag: string, target: string): boolean {
  const normTag = tag.trim().toLowerCase();
  const normTarget = target.trim().toLowerCase();
  if (!normTag || !normTarget) return false;
  if (normTag === normTarget) return true;

  const tagFlat = normTag.replace(/[-_\s]+/g, " ");
  const targetFlat = normTarget.replace(/[-_\s]+/g, " ");
  if (tagFlat === targetFlat) return true;

  // Wildcard support: *suffix, prefix*, or *substring*
  if (
    normTarget.startsWith("*") &&
    normTarget.endsWith("*") &&
    normTarget.length > 2
  ) {
    const inner = normTarget.slice(1, -1);
    return (
      normTag.includes(inner) ||
      tagFlat.includes(inner.replace(/[-_\s]+/g, " "))
    );
  }
  if (normTarget.endsWith("*") && normTarget.length > 1) {
    const prefix = normTarget.slice(0, -1);
    return (
      normTag.startsWith(prefix) ||
      tagFlat.startsWith(prefix.replace(/[-_\s]+/g, " "))
    );
  }
  if (normTarget.startsWith("*") && normTarget.length > 1) {
    const suffix = normTarget.slice(1);
    return (
      normTag.endsWith(suffix) ||
      tagFlat.endsWith(suffix.replace(/[-_\s]+/g, " "))
    );
  }

  return false;
}

export function parseQueryTerms(query: string): string[] {
  const terms: string[] = [];
  const regex =
    /(-?(?:tag|creator|format):"(?:[^"\\]|\\.)*"|-?(?:tag|creator|format):[^\s]+|"(?:[^"\\]|\\.)*"|[^\s]+)/gi;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(query)) !== null) {
    let term = match[0].trim();
    if (!term) continue;
    // Strip inner quotes from tag:"...", creator:"...", -tag:"..."
    term = term.replace(/^(-?(?:tag|creator|format):)"([^"]*)"$/i, "$1$2");
    // Strip surrounding quotes "..."
    term = term.replace(/^"|"$/g, "");
    if (term) {
      terms.push(term.toLowerCase());
    }
  }
  return terms;
}

/** Booru search: whitespace/quote-split terms; `-tag` excludes; `creator:x` / `format:x` / `tag:x`
 *  virtual namespaces; otherwise match title/name/tags (case-insensitive substring). */
export function filterLibraryEntries(
  entries: CharacterTemplate[],
  query: string,
): CharacterTemplate[] {
  const terms = parseQueryTerms(query);
  if (terms.length === 0) return entries;
  return entries.filter((e) => {
    const rawTags = (e.tags ?? []).map((t) => t.toLowerCase());
    const creator = (e.creator ?? "").toLowerCase();
    const format = entryKind(e);
    const title = displayTitle(e).toLowerCase();
    const name = e.name.toLowerCase();

    for (const raw of terms) {
      const negate = raw.startsWith("-");
      const term = negate ? raw.slice(1) : raw;
      let hit: boolean;
      if (term.startsWith("creator:")) {
        hit = creator.includes(term.slice(8));
      } else if (term.startsWith("format:")) {
        hit = format === term.slice(7);
      } else if (term.startsWith("tag:")) {
        const tagTarget = term.slice(4);
        hit = rawTags.some((t) => matchesTag(t, tagTarget));
      } else {
        hit =
          rawTags.some((t) => matchesTag(t, term)) ||
          title.includes(term) ||
          name.includes(term);
      }
      if (negate ? hit : !hit) return false;
    }
    return true;
  });
}

/** Collect playthrough-setting candidates from CCv2-backed records (F6). */
export function collectCardSettings(
  entries: CharacterTemplate[],
): Array<{ title: string; scenario: string }> {
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

export type CharacterSortOption = "name" | "createdAt" | "updatedAt";
export type SortDirection = "asc" | "desc";

export type VersionGroup = { key: string; versions: CharacterTemplate[] };

export function extractTimestampFromId(id: string): string | null {
  const m = id.match(/^char_(\d{10,13})$/);
  if (m) {
    const epoch = parseInt(m[1], 10);
    if (!isNaN(epoch) && epoch > 1000000000) {
      return new Date(epoch).toISOString();
    }
  }
  return null;
}

export function getCharacterCreatedAt(t: CharacterTemplate): string {
  if (t.createdAt) return t.createdAt;
  const fromId = extractTimestampFromId(t.id);
  if (fromId) return fromId;
  return "";
}

export function getCharacterUpdatedAt(t: CharacterTemplate): string {
  if (t.updatedAt) return t.updatedAt;
  if (t.avatarUpdatedAt) {
    try {
      return new Date(t.avatarUpdatedAt).toISOString();
    } catch {
      /* ignore */
    }
  }
  return getCharacterCreatedAt(t);
}

export function getGroupCreatedAt(group: VersionGroup): string {
  let earliest = "";
  for (const v of group.versions) {
    const c = getCharacterCreatedAt(v);
    if (c && (!earliest || c < earliest)) {
      earliest = c;
    }
  }
  return earliest;
}

export function getGroupUpdatedAt(group: VersionGroup): string {
  let latest = "";
  for (const v of group.versions) {
    const u = getCharacterUpdatedAt(v);
    if (u && (!latest || u > latest)) {
      latest = u;
    }
  }
  return latest;
}

export function sortVersionGroups(
  groups: VersionGroup[],
  sortBy: CharacterSortOption = "name",
  sortDirection: SortDirection = "asc",
): VersionGroup[] {
  const dir = sortDirection === "asc" ? 1 : -1;
  return [...groups].sort((a, b) => {
    const aLatest = a.versions[0];
    const bLatest = b.versions[0];
    if (!aLatest && !bLatest) return 0;
    if (!aLatest) return 1;
    if (!bLatest) return -1;

    if (sortBy === "name") {
      const aName = (displayTitle(aLatest) || aLatest.name).toLowerCase();
      const bName = (displayTitle(bLatest) || bLatest.name).toLowerCase();
      const cmp = aName.localeCompare(bName);
      if (cmp !== 0) return cmp * dir;
      return aLatest.name.localeCompare(bLatest.name) * dir;
    }

    if (sortBy === "createdAt") {
      const aCreated = getGroupCreatedAt(a);
      const bCreated = getGroupCreatedAt(b);
      // If one is missing a timestamp, push it to the end regardless of direction
      if (!aCreated && !bCreated) {
        return (displayTitle(aLatest) || aLatest.name).localeCompare(
          displayTitle(bLatest) || bLatest.name,
        );
      }
      if (!aCreated) return 1;
      if (!bCreated) return -1;

      const cmp = aCreated.localeCompare(bCreated);
      if (cmp !== 0) return cmp * dir;
      return (displayTitle(aLatest) || aLatest.name).localeCompare(
        displayTitle(bLatest) || bLatest.name,
      );
    }

    if (sortBy === "updatedAt") {
      const aUpdated = getGroupUpdatedAt(a);
      const bUpdated = getGroupUpdatedAt(b);
      // If one is missing a timestamp, push it to the end
      if (!aUpdated && !bUpdated) {
        return (displayTitle(aLatest) || aLatest.name).localeCompare(
          displayTitle(bLatest) || bLatest.name,
        );
      }
      if (!aUpdated) return 1;
      if (!bUpdated) return -1;

      const cmp = aUpdated.localeCompare(bUpdated);
      if (cmp !== 0) return cmp * dir;
      return (displayTitle(aLatest) || aLatest.name).localeCompare(
        displayTitle(bLatest) || bLatest.name,
      );
    }

    return 0;
  });
}

export function groupByLineage(
  templates: CharacterTemplate[],
  sortBy: CharacterSortOption = "name",
  sortDirection: SortDirection = "asc",
): VersionGroup[] {
  const map = new Map<string, CharacterTemplate[]>();
  for (const t of templates) {
    const key = t.lineageId ?? t.id;
    const list = map.get(key) ?? [];
    list.push(t);
    map.set(key, list);
  }
  const groups = [...map.entries()].map(([key, versions]) => ({
    key,
    versions: versions.sort((a, b) => b.version - a.version),
  }));
  return sortVersionGroups(groups, sortBy, sortDirection);
}

export interface CharacterFamilyNode {
  template: CharacterTemplate;
  children: CharacterFamilyNode[];
  depth: number;
}

export interface CharacterFamilyInfo {
  focus: CharacterTemplate;
  root: CharacterTemplate;
  tree: CharacterFamilyNode;
  parent: CharacterTemplate | null;
  children: CharacterTemplate[];
  siblings: CharacterTemplate[];
  /** All cards in the connected family tree (root + all descendants), in depth-first order. */
  members: CharacterTemplate[];
  /** IDs of all descendants of `focus` (used to prevent cycles when choosing a parent for `focus`). */
  descendantIds: Set<string>;
}

/**
 * Resolves the connected Parent -> Child / Sibling family tree for a given character card.
 * Collapses version lineages to their latest version first so each card appears once.
 */
export function buildCharacterFamilyTree(
  focusId: string,
  allTemplates: CharacterTemplate[],
): CharacterFamilyInfo | null {
  const latestCards = groupByLineage(allTemplates, "name", "asc")
    .map((g) => g.versions[0])
    .filter((t): t is CharacterTemplate => t !== undefined);

  const byId = new Map<string, CharacterTemplate>();
  // Also map any older version IDs or lineageIds to the latest version card
  for (const g of groupByLineage(allTemplates, "name", "asc")) {
    const latest = g.versions[0];
    if (!latest) continue;
    byId.set(latest.id, latest);
    if (latest.lineageId) byId.set(latest.lineageId, latest);
    for (const v of g.versions) {
      byId.set(v.id, latest);
    }
  }

  const focus = byId.get(focusId);
  if (!focus) return null;

  const resolveParent = (card: CharacterTemplate): CharacterTemplate | null => {
    if (!card.parentId) return null;
    const p = byId.get(card.parentId);
    if (!p || p.id === card.id) return null;
    return p;
  };

  // Walk up to the root card with cycle protection
  let root = focus;
  const ancestorSeen = new Set<string>([root.id]);
  while (true) {
    const p = resolveParent(root);
    if (!p || ancestorSeen.has(p.id)) break;
    ancestorSeen.add(p.id);
    root = p;
  }

  // Build adjacency list of parent.id -> direct children
  const childrenMap = new Map<string, CharacterTemplate[]>();
  for (const card of latestCards) {
    const p = resolveParent(card);
    if (!p) continue;
    const list = childrenMap.get(p.id) ?? [];
    list.push(card);
    childrenMap.set(p.id, list);
  }
  for (const list of childrenMap.values()) {
    list.sort((a, b) => displayTitle(a).localeCompare(displayTitle(b)));
  }

  // Depth-first tree construction with cycle protection
  const members: CharacterTemplate[] = [];
  const treeVisited = new Set<string>();
  const buildNode = (
    card: CharacterTemplate,
    depth: number,
  ): CharacterFamilyNode => {
    treeVisited.add(card.id);
    members.push(card);
    const rawChildren = childrenMap.get(card.id) ?? [];
    const childNodes: CharacterFamilyNode[] = [];
    for (const ch of rawChildren) {
      if (!treeVisited.has(ch.id)) {
        childNodes.push(buildNode(ch, depth + 1));
      }
    }
    return {
      template: card,
      children: childNodes,
      depth,
    };
  };

  const tree = buildNode(root, 0);

  // Collect descendants of `focus` specifically (for cycle prevention)
  const descendantIds = new Set<string>();
  const collectDescendants = (cardId: string) => {
    for (const ch of childrenMap.get(cardId) ?? []) {
      if (!descendantIds.has(ch.id) && ch.id !== focus.id) {
        descendantIds.add(ch.id);
        collectDescendants(ch.id);
      }
    }
  };
  collectDescendants(focus.id);

  const parent = resolveParent(focus);
  const children = childrenMap.get(focus.id) ?? [];
  const siblings = parent
    ? (childrenMap.get(parent.id) ?? []).filter((c) => c.id !== focus.id)
    : [];

  return {
    focus,
    root,
    tree,
    parent,
    children,
    siblings,
    members,
    descendantIds,
  };
}
