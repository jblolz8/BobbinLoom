/**
 * Focus rules for the shared dialog shell.
 *
 * Kept pure (and free of the DOM) so the Node test suite — which has no jsdom — can still hold the
 * arithmetic that decides where Tab lands. The shell does the querying; this module decides.
 */

/** The elements a dialog keeps focus inside. Disabled controls are not stops, and a `-1` tabindex is
 *  a programmatic target rather than somewhere Tab should ever arrive. */
export const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])'
].join(", ");

/**
 * Where Tab lands next inside a ring of `count` stops.
 *
 * `index` is where focus is now, or `-1` when it is somewhere the ring does not contain (the dialog
 * container itself, or a slip out of it). Returning an index instead of moving focus keeps the
 * decision testable: an empty ring stays empty, a forward move past the end wraps to the top, a
 * backward move before the start wraps to the bottom, and a ring of one holds its only stop.
 */
export function wrapIndex(count: number, index: number, backwards: boolean): number {
  if (count <= 0) return -1;
  if (index < 0) return backwards ? count - 1 : 0;
  const next = backwards ? index - 1 : index + 1;
  if (next < 0) return count - 1;
  if (next >= count) return 0;
  return next;
}

/**
 * Whether a rename draft may be submitted.
 *
 * The same rule the server enforces (`z.string().min(1)`), applied to the trimmed value so a name made
 * of spaces is refused before a request is made — and so the dialog does not need to know about zod.
 */
export function isRenameable(value: string): boolean {
  return value.trim().length > 0;
}
