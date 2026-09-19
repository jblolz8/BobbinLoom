import { useCallback, useRef, type TouchEvent as ReactTouchEvent } from "react";
import { PANE_ORDER, ownsHorizontalGesture, stepPane, swipeIntent } from "../engine/paneSwipe";

/** The browser's own edge gesture (back, history) lives here; a panel swipe starts further in. */
const EDGE_ZONE_PX = 24;

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

export type UsePaneSwipeOptions = {
  /** Only the single-panel (mobile) layout swipes; on desktop every panel is already visible. */
  enabled: boolean;
  /** The panel showing now, as an index into `PANE_ORDER`. */
  index: number;
  onChange: (pane: (typeof PANE_ORDER)[number]) => void;
};

/**
 * Spread this onto the container that holds the panels.
 *
 * Nothing moves during the gesture and nothing is `preventDefault`ed: the handlers only read the
 * touch and decide on release, so the panels' own scrolling and momentum stay native.
 */
export function usePaneSwipe({ enabled, index, onChange }: UsePaneSwipeOptions) {
  const origin = useRef<{ x: number; y: number } | null>(null);

  const onTouchStart = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      origin.current = null;
      if (!enabled) return;
      // A pinch is not a swipe, and neither is a drag that began in a horizontal scroller or on the
      // screen edge the browser reserves.
      if (event.touches.length !== 1) return;
      const touch = event.touches[0];
      if (!touch || touch.clientX < EDGE_ZONE_PX) return;
      const target = event.target;
      if (!(target instanceof Element)) return;
      if (startsInHorizontalScroller(target, event.currentTarget)) return;
      origin.current = { x: touch.clientX, y: touch.clientY };
    },
    [enabled]
  );

  const onTouchEnd = useCallback(
    (event: ReactTouchEvent<HTMLElement>) => {
      const from = origin.current;
      origin.current = null;
      if (!enabled || !from) return;
      const touch = event.changedTouches[0];
      if (!touch) return;
      const intent = swipeIntent({ dx: touch.clientX - from.x, dy: touch.clientY - from.y });
      if (!intent) return;
      const next = PANE_ORDER[stepPane(index, intent)];
      if (next && next !== PANE_ORDER[index]) onChange(next);
    },
    [enabled, index, onChange]
  );

  const onTouchCancel = useCallback(() => {
    origin.current = null;
  }, []);

  return { onTouchStart, onTouchEnd, onTouchCancel };
}
