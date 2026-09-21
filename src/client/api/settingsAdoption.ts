/**
 * The one-shot adoption: move a device's `localStorage` preferences into the instance's settings.
 *
 * The storage pass moved these preferences from `localStorage` to `AppSettings.viewPreferences`, and
 * an existing profile has real values in the keys. A naive move silently resets them — the reader's
 * chat toggles off, their page size back to the default — so the first load after a group migrates
 * reads the device's value, writes it to the server, and only then deletes the key.
 *
 * The registry below is deliberately EMPTY until a surface is migrated: a key is adopted only once
 * the surface that reads it has switched to the server, otherwise adoption would move the value away
 * from the only place still reading it. Each migrated group adds its keys in the same change that
 * swaps its call sites.
 *
 * The plan-building half is pure and takes the local reader as an argument, so it is testable with no
 * DOM and no server.
 */
import type { ViewPreferences } from "../../schemas";
import { getViewPreferences, updateViewPreferences } from "./settings";

/** The groups shaped as "a bag of leaves". `staleNoteDismissals` is a record, not a group of these,
 *  and is handled on its own when its surface migrates. */
export type PreferenceGroup = Exclude<keyof ViewPreferences, "staleNoteDismissals">;

/** One migrated local key: which group and leaf it feeds, and how to read its raw value. */
export type LocalAdoptionSource = {
  /** The `localStorage` key on the device. */
  key: string;
  group: PreferenceGroup;
  leaf: string;
  /** Parse the raw local value into the leaf's own type. Returning undefined means "do not adopt" —
   *  an unreadable value is left where it is rather than written as junk. */
  parse: (raw: string) => unknown;
};

/**
 * Every key this pass migrates, added one group at a time as its surface switches to the server.
 * Each entry is one line, and a group that is missing here has simply not been migrated yet.
 */
export const ADOPTION_SOURCES: readonly LocalAdoptionSource[] = [];

export type AdoptionPlan = {
  /** Only the leaves the device holds and the server does not. Grouped, ready to PUT. */
  write: ViewPreferences;
  /** The keys to delete once `write` has landed. */
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
  const removeKeys: string[] = [];

  for (const source of sources) {
    const raw = readLocal(source.key);
    if (raw === null) continue; // The device never had one: nothing to adopt, nothing to delete.

    const chosen = (server[source.group] as Record<string, unknown> | undefined)?.[source.leaf];
    if (chosen !== undefined) {
      // Already chosen server-side: the device's copy is superseded, not authoritative.
      removeKeys.push(source.key);
      continue;
    }

    const parsed = source.parse(raw);
    if (parsed === undefined) continue; // Unreadable: leave it for a human rather than write junk.

    (write[source.group] ??= {})[source.leaf] = parsed;
    removeKeys.push(source.key);
  }

  return { write: write as ViewPreferences, removeKeys };
}

/**
 * Run the adoption once, before any surface reads the preferences.
 *
 * Order matters in both directions: the write lands BEFORE the keys are deleted, so a failed write
 * cannot lose the values, and nothing is dual-written afterwards — a key left in place is a second
 * source of truth that will disagree later.
 */
export async function adoptLocalPreferences(): Promise<void> {
  if (ADOPTION_SOURCES.length === 0) return;
  if (typeof window === "undefined" || !window.localStorage) return;

  const server = await getViewPreferences();
  const plan = planAdoption(server, (key) => {
    try {
      return window.localStorage.getItem(key);
    } catch {
      return null;
    }
  });

  if (plan.removeKeys.length === 0) return;

  if (Object.keys(plan.write).length > 0) {
    await updateViewPreferences(plan.write);
  }
  for (const key of plan.removeKeys) {
    try {
      window.localStorage.removeItem(key);
    } catch {
      /* A blocked storage is not a reason to break the first load. */
    }
  }
}
