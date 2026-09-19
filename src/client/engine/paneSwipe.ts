/**
 * The mobile play view's panels, and the rules that decide when a drag is a panel swipe.
 *
 * Pure, so the Node suite can hold the arithmetic. The DOM half — reading template geometry, walking
 * scrollable ancestors, wiring touch events — lives in `hooks/usePaneSwipe.ts`.
 */

/** The three panels in swipe order. One list, so the tab bar, the swipe and the entry animation
 *  cannot disagree about what "next" means. */
export const PANE_ORDER = ["scene", "chat", "info"] as const;
export type MobilePane = (typeof PANE_ORDER)[number];

export type SwipeIntent = "next" | "previous";

/** How far a drag must travel to mean a panel change, and how clearly horizontal it must be. */
export const SWIPE_THRESHOLD_PX = 60;
export const SWIPE_DOMINANCE = 2;

export function paneIndexOf(pane: string): number {
  return (PANE_ORDER as readonly string[]).indexOf(pane);
}

export type SwipeVector = { dx: number; dy: number };

/**
 * Whether a drag should move between panels.
 *
 * Both conditions matter: a short flick is not a swipe, and a gesture that is not clearly horizontal
 * belongs to whatever the reader is dragging through — the chat's code blocks, the info panel's own
 * tab strip, a scroll they meant to make.
 */
export function swipeIntent(
  { dx, dy }: SwipeVector,
  { threshold = SWIPE_THRESHOLD_PX, dominance = SWIPE_DOMINANCE } = {}
): SwipeIntent | null {
  if (Math.abs(dx) < threshold) return null;
  if (Math.abs(dx) <= dominance * Math.abs(dy)) return null;
  // A finger travelling left pulls the NEXT panel in from the right, like turning a page forward.
  return dx < 0 ? "next" : "previous";
}

/**
 * The neighbouring panel index.
 *
 * Clamped rather than wrapped: a right swipe on the first panel stays on the first panel, because
 * wrapping from Scene straight to Info would read as a hole in the model rather than a shortcut.
 */
export function stepPane(index: number, intent: SwipeIntent, count: number = PANE_ORDER.length): number {
  if (count <= 0) return 0;
  const target = intent === "next" ? index + 1 : index - 1;
  return Math.min(count - 1, Math.max(0, target));
}

/**
 * Whether an element's own horizontal scrolling should win over the panel swipe.
 *
 * The play view has real ones — a code block wider than the column, the info panel's tab strip, the
 * error box — and the rule is simply whether there is anywhere to scroll: an element with no room
 * left or right has nothing to own, and the swipe belongs to the panels.
 */
export function ownsHorizontalGesture(scrollWidth: number, clientWidth: number): boolean {
  return scrollWidth > clientWidth + 1;
}

/** Which side the arriving panel slides in from. */
export function paneSide(from: number, to: number): "left" | "right" {
  return to >= from ? "right" : "left";
}
