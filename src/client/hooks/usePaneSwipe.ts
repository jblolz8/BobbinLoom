import { useCallback, useRef, type TouchEvent as ReactTouchEvent } from "react";
import {
  PANE_ORDER,
  SWIPE_AXIS_LOCK_PX,
  commitSwipe,
  ownsHorizontalGesture,
  stepPane,
  swipeIntent,
  swipeVelocity,
  type SwipeSample
} from "../engine/paneSwipe";

/** The browser's own edge gesture (back, history) lives here; a panel swipe starts further in. */
const EDGE_ZONE_PX = 24;

/** How many samples the velocity is measured over. */
const VELOCITY_SAMPLES = 8;

/**
 * Whether the touch began inside something that scrolls horizontally on its own.
 *
 * Those surfaces own the gesture, and the play view has real ones: the info panel's own tab strip
 * (`.base-tabs`), code blocks inside chat messages (`.code-block-pre`), and the error box. A swipe on
 * any of them must scroll them, not change panel.
 */
function startsInHorizontalScroller(node: Element, boundary: Element | null): boolean {
  let current: Element | null = node;
  while (current && current !== boundary?.parentElement) {
    const style = window.getComputedStyle(current);
    if (
      (style.overflowX === "auto" || style.overflowX === "scroll") &&
      ownsHorizontalGesture(current.scrollWidth, current.clientWidth)
    ) {
      return true;
    }
    if (current === boundary) break;
    current = current.parentElement;
  }
  return false;
}

type Gesture = {
  x: number;
  y: number;
  /** Set once the drag is unambiguously horizontal and there is a panel to pull in. */
  locked: boolean;
  /** Set when the drag turned out to be vertical, or pointed at a panel that does not exist. */
  dropped: boolean;
  targetIndex: number;
  samples: SwipeSample[];
};

export type UsePaneSwipeOptions = {
  /** Only the single-panel (mobile) layout swipes; on desktop every panel is already visible. */
  enabled: boolean;
  /**
   * Whether the panels follow the finger. Off under a reduced-motion preference: the gesture still
   * changes panels, it just does not put motion under the finger.
   */
  live: boolean;
  /** The panel showing now, as an index into `PANE_ORDER`. */
  index: number;
  count?: number;
  /** The panel's width in px, read when a decision needs it (the layout can change). */
  paneWidth: () => number;
  /** Live positions while a drag is under the finger, and null when it is not. */
  onDrag: (drag: { offset: number; targetIndex: number } | null) => void;
  /** The finger came up: land on `targetIndex`, or go back where it started. */
  onSettle: (settle: { targetIndex: number; committed: boolean }) => void;
};

/**
 * Spread this onto the container that holds the panels.
 *
 * Nothing is `preventDefault`ed: the panels are moved with transforms, never scrolled, so the
 * browser keeps native vertical scrolling and momentum in every panel. Until the drag is clearly
 * horizontal it is not a swipe at all — a vertical drag is left alone to scroll.
 */
export function usePaneSwipe({
  enabled,
  live,
  index,
  count = PANE_ORDER.length,
  paneWidth,
  onDrag,
  onSettle
}: UsePaneSwipeOptions) {
  const gesture = useRef<Gesture | null>(null);

  const reset = useCallback(
    (keepVisual: boolean) => {
      gesture.current = null;
      if (!keepVisual) onDrag(null);
    },
    [onDrag]
  );

  const onTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      gesture.current = null;
      onDrag(null);
      if (!enabled) return;
      // A pinch is not a swipe, and neither is a drag that began in a horizontal scroller or on the
      // screen edge the browser reserves.
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch || touch.clientX < EDGE_ZONE_PX) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (startsInHorizontalScroller(target, event.currentTarget)) return;
      gesture.current = {
        x: touch.clientX,
        y: touch.clientY,
        locked: false,
        dropped: false,
        targetIndex: index,
        samples: [{ x: touch.clientX, t: event.timeStamp }]
      };
    },
    [enabled, index, onDrag]
  );

  const onTouchMove = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!enabled || !current) return;
      const touch = event.touches[0];
      if (!touch) return;
      const dx = touch.clientX - current.x;
      const dy = touch.clientY - current.y;

      if (!current.locked) {
        // Until the direction is clear, a small movement is neither axis: the panel's own scrolling
        // must stay free to be the answer.
        if (Math.abs(dx) < SWIPE_AXIS_LOCK_PX && Math.abs(dy) < SWIPE_AXIS_LOCK_PX) return;
        if (Math.abs(dy) > Math.abs(dx)) {
          current.dropped = true;
          return;
        }
        // Dragging toward a panel that does not exist is not a drag: the ends do not wrap.
        const targetIndex = stepPane(index, dx < 0 ? "next" : "previous", count);
        if (targetIndex === index) {
          current.dropped = true;
          return;
        }
        current.locked = true;
        current.targetIndex = targetIndex;
      }

      current.samples.push({ x: touch.clientX, t: event.timeStamp });
      if (current.samples.length > VELOCITY_SAMPLES) current.samples.shift();
      if (!live) return;
      const width = paneWidth();
      onDrag({ offset: Math.max(-width, Math.min(width, dx)), targetIndex: current.targetIndex });
    },
    [enabled, live, index, count, paneWidth, onDrag]
  );

  const onTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const current = gesture.current;
      if (!enabled || !current) {
        reset(false);
        return;
      }
      const touch = event.changedTouches[0];
      if (!touch || current.dropped) {
        reset(false);
        return;
      }
      const dx = touch.clientX - current.x;
      const dy = touch.clientY - current.y;

      if (live) {
        // Nothing was dragged: a tap, or a wobble the axis lock refused.
        if (!current.locked) {
          reset(false);
          return;
        }
        const width = paneWidth();
        const offset = Math.max(-width, Math.min(width, dx));
        const velocity = swipeVelocity([...current.samples, { x: touch.clientX, t: event.timeStamp }]);
        const committed = commitSwipe({ offset, velocity, width });
        // The visual is kept while the release animates; the caller clears it afterwards.
        reset(committed);
        onSettle({ targetIndex: current.targetIndex, committed });
        return;
      }

      // No motion under the finger: the older release rule, which needs no width and never had a
      // position to animate from.
      reset(false);
      const intent = swipeIntent({ dx, dy });
      if (!intent) return;
      const targetIndex = stepPane(index, intent, count);
      if (targetIndex === index) return;
      onSettle({ targetIndex, committed: true });
    },
    [enabled, live, index, count, paneWidth, onSettle, reset]
  );

  const onTouchCancel = useCallback(() => {
    reset(false);
  }, [reset]);

  return { onTouchStart, onTouchMove, onTouchEnd, onTouchCancel };
}
