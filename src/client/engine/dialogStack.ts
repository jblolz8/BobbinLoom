/**
 * The dialog stack: which dialogs are open, and which one is on top.
 *
 * Dialogs nest — the character sheet's dirty guard opens a confirm on top of the sheet — and only the
 * top one may intercept anything: focus, Escape, the backdrop. Without this the outer dialog's focus
 * trap pulls focus straight back out of the inner one, and a single Escape closes both (the outer's
 * window-level net fires because the event target is inside the inner dialog, not the outer's section).
 *
 * The only pair that stacked before this was the hand-rolled Settings modal and a confirm — and it
 * worked because Settings has no trap and no Escape handler at all. That is not a property to build on.
 *
 * Module-level and React-free so the rule itself is unit-testable; `Dialog` registers on mount.
 */
const openDialogs: string[] = [];

/** Register a dialog as open. The most recently pushed dialog is the top one. */
export function pushDialog(id: string): void {
  if (!openDialogs.includes(id)) openDialogs.push(id);
}

/** Remove a dialog. Closing a dialog that is not on top leaves the top alone. */
export function popDialog(id: string): void {
  const index = openDialogs.lastIndexOf(id);
  if (index !== -1) openDialogs.splice(index, 1);
}

/** The id of the topmost open dialog, or null when none is open. */
export function topDialogId(): string | null {
  return openDialogs.length > 0 ? openDialogs[openDialogs.length - 1] : null;
}

/** Whether this dialog is the one allowed to trap focus, answer Escape and own the backdrop. */
export function isTopDialog(id: string): boolean {
  return topDialogId() === id;
}

/** The stack is module state, so a test needs a way to start from empty. */
export function resetDialogStack(): void {
  openDialogs.length = 0;
}
