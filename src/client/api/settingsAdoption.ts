/**
 * The one-shot adoption: move a device's `localStorage` preferences into the instance's settings.
 *
 * The storage pass moved these preferences from `localStorage` to `AppSettings.viewPreferences`, and
 * an existing profile has real values in the keys. A naive move silently resets them — the reader's
 * chat toggles off, their page size back to the default — so the first read after a group migrates
 * takes the device's value, writes it to the server, and only then deletes the key.
 *
 * It is called by the READ path (`adoptLocalPreferences`), not from a boot hook, because that is the
 * only way the order is guaranteed: whoever asks for the preferences gets the adopted ones back, with
 * no window in which a surface reads the server's empty answer and paints defaults over the reader's
 * choices.
 *
 * The registry is kept in step with the surfaces: a key is listed here only once the surface that
 * reads it has moved to the server, or adoption would take the value away from the only place still
 * reading it. Each migration adds its keys in that same change.
 *
 * The plan-building half is pure and takes the local reader as an argument, so it is testable with no
 * DOM and no server.
 */
import type { ViewPreferences } from "../../schemas";
import { getViewPreferences, updateViewPreferences } from "./settings";

/** The groups shaped as "a bag of leaves". `staleNoteDismissals` is a record, not a group of these,
 *  and is handled on its own when its surface migrates. */
export type PreferenceGroup = Exclude<keyof ViewPreferences, "staleNoteDismissals">;

/** One migrated local key: which group and leaf it feeds, and how to read its raw value. A single key
 *  may appear several times — the chat settings blob feeds nine leaves — and the key is then adopted
 *  once per leaf and deleted once in total. */
export type LocalAdoptionSource = {
  /** The `localStorage` key on the device. */
  key: string;
  group: PreferenceGroup;
  leaf: string;
  /** Parse the raw local value into the leaf's own type. Returning undefined means "do not adopt" —
   *  an unreadable value is left where it is rather than written as junk. */
  parse: (raw: string) => unknown;
};

const CHAT_KEY = "bobbinloom_chat_settings";

/** Read one boolean leaf out of the old chat-settings blob, so one key can feed every leaf it held. */
const fromChatBlob = (leaf: string) => (raw: string) => {
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const value = parsed?.[leaf];
    return typeof value === "boolean" ? value : undefined;
  } catch {
    return undefined;
  }
};

/** A leaf stored as-is (a plain string, or `""` for an emptied search box). */
const asString = (raw: string) => raw;

/** A leaf that must be one of a fixed set, stored as-is. The old readers validated exactly this way,
 *  which is why junk is left where it is rather than written to the server. */
const oneOf =
  (allowed: readonly string[]) =>
  (raw: string): string | undefined =>
    allowed.includes(raw) ? raw : undefined;

/** A leaf stored as JSON — an array of category ids. */
const asStringArray = (raw: string) => {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) && parsed.every((value) => typeof value === "string")
      ? (parsed as string[])
      : undefined;
  } catch {
    return undefined;
  }
};

/** The two browsing lists' keys, so the registry below reads as a mapping rather than a wall of
 *  string literals. */
const LIBRARY_KEYS = {
  viewMode: "bobbinloom_library_view_mode",
  sortBy: "bobbinloom_library_sort_by",
  sortDir: "bobbinloom_library_sort_dir",
  sidebarViewMode: "bobbinloom_library_sidebar_view_mode",
  collapsedCategories: "bobbinloom_library_collapsed_categories",
  search: "bobbinloom_library_search"
} as const;

const SHELF_KEYS = {
  viewMode: "bobbinloom_playthrough_view_mode",
  sortBy: "bobbinloom_playthrough_sort_by",
  sortDir: "bobbinloom_playthrough_sort_dir"
} as const;

/**
 * Every key this pass migrates, added one group at a time as its surface switches to the server. A
 * group that is missing here has simply not been migrated yet — `PAGE_SIZE_KEYS` (the five pagers)
 * are the known remainder.
 */
export const ADOPTION_SOURCES: readonly LocalAdoptionSource[] = [
  { key: CHAT_KEY, group: "chat", leaf: "choicesEnabled", parse: fromChatBlob("choicesEnabled") },
  { key: CHAT_KEY, group: "chat", leaf: "showDebug", parse: fromChatBlob("showDebug") },
  { key: CHAT_KEY, group: "chat", leaf: "showContextUsage", parse: fromChatBlob("showContextUsage") },
  { key: CHAT_KEY, group: "chat", leaf: "showGenerationTime", parse: fromChatBlob("showGenerationTime") },
  {
    key: CHAT_KEY,
    group: "chat",
    leaf: "showMessageTimestamps",
    parse: fromChatBlob("showMessageTimestamps")
  },
  { key: CHAT_KEY, group: "chat", leaf: "showModelName", parse: fromChatBlob("showModelName") },
  { key: CHAT_KEY, group: "chat", leaf: "imagePromptPreview", parse: fromChatBlob("imagePromptPreview") },
  { key: CHAT_KEY, group: "chat", leaf: "autoImageAfterTurn", parse: fromChatBlob("autoImageAfterTurn") },
  {
    key: CHAT_KEY,
    group: "chat",
    leaf: "alwaysDiscardOldImage",
    parse: fromChatBlob("alwaysDiscardOldImage")
  },
  { key: LIBRARY_KEYS.viewMode, group: "library", leaf: "viewMode", parse: oneOf(["portrait", "list", "grid"]) },
  { key: LIBRARY_KEYS.sortBy, group: "library", leaf: "sortBy", parse: oneOf(["name", "createdAt", "updatedAt"]) },
  { key: LIBRARY_KEYS.sortDir, group: "library", leaf: "sortDir", parse: oneOf(["asc", "desc"]) },
  {
    key: LIBRARY_KEYS.sidebarViewMode,
    group: "library",
    leaf: "sidebarViewMode",
    parse: oneOf(["grouped", "flat"])
  },
  {
    key: LIBRARY_KEYS.collapsedCategories,
    group: "library",
    leaf: "collapsedCategories",
    parse: asStringArray
  },
  { key: LIBRARY_KEYS.search, group: "library", leaf: "search", parse: asString },
  {
    key: SHELF_KEYS.viewMode,
    group: "library",
    leaf: "playthroughViewMode",
    parse: oneOf(["grid", "list"])
  },
  {
    key: SHELF_KEYS.sortBy,
    group: "library",
    leaf: "playthroughSortBy",
    parse: oneOf(["updatedAt", "name", "turn"])
  },
  {
    key: SHELF_KEYS.sortDir,
    group: "library",
    leaf: "playthroughSortDir",
    parse: oneOf(["asc", "desc"])
  }
];

export type AdoptionPlan = {
  /** Only the leaves the device holds and the server does not. Grouped, ready to PUT. */
  write: ViewPreferences;
  /** The keys to delete once `write` has landed — each key once, however many leaves it fed. */
  removeKeys: string[];
};

/**
 * What to do about the device's keys, given what the server already holds.
 *
 * The rule is "the server is the source of truth; the device is adopted only where the server has
 * nothing". That matters after the first migration as much as before it: a server value exists only
 * because this profile adopted one or the reader chose one, so it always wins — and its local key is
 * dead weight either way, which is why every key of a migrated group is scheduled for removal unless
 * its value could not be read at all.
 */
export function planAdoption(
  server: ViewPreferences,
  readLocal: (key: string) => string | null,
  sources: readonly LocalAdoptionSource[] = ADOPTION_SOURCES
): AdoptionPlan {
  const write: Record<string, Record<string, unknown>> = {};
  const removeKeys = new Set<string>();

  for (const source of sources) {
    const raw = readLocal(source.key);
    if (raw === null) continue; // The device never had one: nothing to adopt, nothing to delete.

    const chosen = (server[source.group] as Record<string, unknown> | undefined)?.[source.leaf];
    if (chosen !== undefined) {
      // Already chosen server-side: the device's copy is superseded, not authoritative.
      removeKeys.add(source.key);
      continue;
    }

    const parsed = source.parse(raw);
    if (parsed === undefined) continue; // Unreadable: leave it for a human rather than write junk.
    // (A key that reads fine but yields nothing adoptable is left alone too: it holds no preference to
    // migrate, and the first leaf that IS adoptable brings the key with it.)

    (write[source.group] ??= {})[source.leaf] = parsed;
    removeKeys.add(source.key);
  }

  return { write: write as ViewPreferences, removeKeys: [...removeKeys] };
}

/** What the read path gets back: the preferences to use, and whether anything moved. */
export type AdoptionOutcome = { preferences: ViewPreferences; changed: boolean };

/**
 * Read the preferences, adopting anything still on the device first.
 *
 * Order matters in both directions: the write lands BEFORE the keys are deleted, so a failed write
 * cannot lose the values, and nothing is dual-written afterwards — a key left in place is a second
 * source of truth that will disagree later.
 */
export async function adoptLocalPreferences(): Promise<AdoptionOutcome> {
  const server = await getViewPreferences();

  if (typeof window === "undefined" || !window.localStorage) {
    return { preferences: server, changed: false };
  }

  const plan = planAdoption(server, (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  });
  if (plan.removeKeys.length === 0) return { preferences: server, changed: false };

  // The server's answer to the write is the merged truth, not the patch that was sent.
  const preferences =
    Object.keys(plan.write).length > 0 ? await updateViewPreferences(plan.write) : server;

  for (const key of plan.removeKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* A blocked storage is not a reason to break the first load. */
    }
  }
  return { preferences, changed: true };
}
