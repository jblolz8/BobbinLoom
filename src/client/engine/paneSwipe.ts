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

/** How far a drag must travel to mean a panel change, and how clearly horizontal it must be.
 *  Used when the panels cannot follow the finger (a reduced-motion preference). */
export const SWIPE_THRESHOLD_PX = 60;

/** How much more horizontal than vertical a drag must be to count as a swipe. ONE number for both
 *  paths — the finger-tracking lock and the reduced-motion release rule — because a second dominance
 *  rule is how they came to disagree about what a swipe is. */
export const SWIPE_DOMINANCE = 2;

/** Before this much travel, a drag has not decided which axis it belongs to. It also has to be far
 *  enough that incidental sideways drift during a scroll cannot reach it. */
export const SWIPE_AXIS_LOCK_PX = 24;

/** How far a released drag must have travelled to land on the neighbour, as a share of the panel. */
export const SWIPE_COMMIT_RATIO = 0.4;

/** A throw this fast lands on the neighbour even if it did not travel far, in px per ms. */
export const SWIPE_FLICK_VELOCITY = 0.4;

export type SwipeSample = { x: number; t: number };

/**
 * How fast the end of a gesture was travelling, in px per ms, positive to the right.
 *
 * Measured over the tail of the samples rather than the whole gesture: a swipe usually starts slowly
 * and is thrown at the end, and it is the throw that should decide.
 */
export function swipeVelocity(samples: SwipeSample[], windowSize = 3): number {
  if (samples.length < 2) return 0;
  const tail = samples.slice(-Math.max(2, windowSize));
  const first = tail[0];
  const last = tail[tail.length - 1];
  const dt = last.t - first.t;
  if (!first || !last || dt <= 0) return 0;
  return (last.x - first.x) / dt;
}

/**
 * Whether a released drag should land on the neighbouring panel.
 *
 * Far enough, or thrown hard enough in the direction it was travelling — whichever comes first. A
 * short lazy drag goes back where it came from.
 */
export function commitSwipe(
  { offset, velocity, width }: { offset: number; velocity: number; width: number },
  { ratio = SWIPE_COMMIT_RATIO, flick = SWIPE_FLICK_VELOCITY } = {}
): boolean {
  if (width <= 0) return false;
  if (Math.abs(offset) >= width * ratio) return true;
  return Math.abs(velocity) >= flick && Math.sign(velocity) === Math.sign(offset);
}

/**
 * Where the panel being pulled in sits while a drag is at `offset`.
 *
 * Within a panel's width of the drag, on the far side: dragging left brings the next panel in from
 * the right, and the two arrive together.
 */
export function incomingOffset(offset: number, from: number, to: number, width: number): number {
  return to > from ? offset + width : offset - width;
}

export function paneIndexOf(pane: string): number {
  return (PANE_ORDER as readonly string[]).indexOf(pane);
}

export type SwipeVector = { dx: number; dy: number };

/** Which axis a drag belongs to, while it is still deciding. `pending` is "not yet either". */
export type DragAxis = "pending" | "horizontal" | "vertical";

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
 * Which axis a drag belongs to, once it has travelled far enough to have one.
 *
 * The fingers-on-the-glass path asks this before it will lock — and it asks with the SAME dominance
 * `swipeIntent` uses. It did not always: the lock was a bare `|dy| > |dx|`, so a scroll that drifted
 * sideways for a single sample took the panels with it while the reduced-motion path called the very
 * same drag a scroll. One rule for both paths, or the gesture means two different things depending on
 * a media query.
 */
export function dragAxis(
  { dx, dy }: SwipeVector,
  { axisLock = SWIPE_AXIS_LOCK_PX, dominance = SWIPE_DOMINANCE } = {}
): DragAxis {
  // Until it has travelled, a small movement is neither axis: the panel's own scrolling must stay
  // free to be the answer.
  if (Math.abs(dx) < axisLock && Math.abs(dy) < axisLock) return "pending";
  return Math.abs(dx) > dominance * Math.abs(dy) ? "horizontal" : "vertical";
}

/**
 * Whether a drag that already locked is STILL a pane drag.
 *
 * Deliberately more permissive than the lock — a bare `|dx| > |dy|`, where the lock demands
 * `SWIPE_DOMINANCE` — and the asymmetry is the point. A drag that turns as vertical as it is
 * horizontal belongs to the panel's scrolling after all, and the pair settles back; a false
 * revocation costs the reader one gesture they can repeat, while a false lock is a panel that jumps
 * while they are reading it.
 */
export function stillPaneDrag({ dx, dy }: SwipeVector): boolean {
  return Math.abs(dx) > Math.abs(dy);
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
