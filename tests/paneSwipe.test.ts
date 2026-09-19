import { describe, expect, it } from "vitest";
import {
  PANE_ORDER,
  commitSwipe,
  incomingOffset,
  ownsHorizontalGesture,
  paneIndexOf,
  paneSide,
  stepPane,
  swipeIntent,
  swipeVelocity
} from "../src/client/engine/paneSwipe";

describe("when a drag is a panel swipe", () => {
  it("reads a long left drag as going to the next panel, and a right drag as the previous one", () => {
    expect(swipeIntent({ dx: -120, dy: 8 })).toBe("next");
    expect(swipeIntent({ dx: 120, dy: -8 })).toBe("previous");
  });

  it("ignores a drag that is too short, however fast it felt", () => {
    expect(swipeIntent({ dx: -59, dy: 0 })).toBeNull();
    expect(swipeIntent({ dx: 40, dy: 0 })).toBeNull();
  });

  it("accepts a drag exactly at the threshold", () => {
    expect(swipeIntent({ dx: -60, dy: 0 })).toBe("next");
  });

  it("leaves a vertical flick alone, so the panel keeps its own scrolling", () => {
    expect(swipeIntent({ dx: -40, dy: 140 })).toBeNull();
    expect(swipeIntent({ dx: 0, dy: 200 })).toBeNull();
  });

  it("leaves a diagonal drag alone: horizontal enough is not the same as clearly horizontal", () => {
    // 70px across but 40px down is 1.75x — under the 2x the rule asks for.
    expect(swipeIntent({ dx: -70, dy: -40 })).toBeNull();
    // The same drag with less vertical travel is a swipe.
    expect(swipeIntent({ dx: -70, dy: -20 })).toBe("next");
  });

  it("takes the threshold and the ratio as options", () => {
    expect(swipeIntent({ dx: -30, dy: 0 }, { threshold: 20 })).toBe("next");
    expect(swipeIntent({ dx: -100, dy: 60 }, { dominance: 1 })).toBe("next");
  });

  it("is symmetric: the sign of the vertical travel never changes the direction", () => {
    expect(swipeIntent({ dx: -120, dy: 40 })).toBe("next");
    expect(swipeIntent({ dx: -120, dy: -40 })).toBe("next");
  });
});

describe("when an element owns the horizontal gesture", () => {
  it("owns it while it has somewhere to scroll", () => {
    expect(ownsHorizontalGesture(676, 309)).toBe(true); // a code block wider than the column
  });

  it("gives the swipe back once there is nothing to scroll", () => {
    expect(ownsHorizontalGesture(333, 333)).toBe(false);
  });

  it("tolerates a sub-pixel rounding difference", () => {
    expect(ownsHorizontalGesture(334, 333)).toBe(false);
    expect(ownsHorizontalGesture(335, 333)).toBe(true);
  });
});

describe("when a released drag lands on the neighbour", () => {
  it("lands on it once it has travelled far enough", () => {
    expect(commitSwipe({ offset: -142, velocity: -0.1, width: 355 })).toBe(true); // 40% of 355
    expect(commitSwipe({ offset: -141, velocity: -0.1, width: 355 })).toBe(false);
  });

  it("lands on it when it was thrown, even if it went nowhere", () => {
    expect(commitSwipe({ offset: -30, velocity: -0.8, width: 355 })).toBe(true);
  });

  it("ignores a fast drag that was let go on the way back", () => {
    // Travelling right while sitting to the left: the throw disagrees with the position.
    expect(commitSwipe({ offset: -30, velocity: 0.8, width: 355 })).toBe(false);
  });

  it("ignores a long lazy drag that stopped short of the mark", () => {
    expect(commitSwipe({ offset: -60, velocity: -0.05, width: 355 })).toBe(false);
  });

  it("never commits without a width to measure against", () => {
    expect(commitSwipe({ offset: -300, velocity: -2, width: 0 })).toBe(false);
  });
});

describe("how fast a gesture was travelling", () => {
  it("measures the tail, not the whole drag", () => {
    // A slow start followed by a throw: the throw is what the finger meant.
    const samples = [
      { x: 320, t: 0 },
      { x: 318, t: 200 },
      { x: 240, t: 210 },
      { x: 180, t: 220 }
    ];
    // (180 - 318) / (220 - 200) = -6.9 px/ms
    expect(swipeVelocity(samples)).toBeLessThan(-2);
  });

  it("has nothing to say about a gesture with no travel in time", () => {
    expect(swipeVelocity([])).toBe(0);
    expect(swipeVelocity([{ x: 10, t: 5 }])).toBe(0);
    expect(swipeVelocity([{ x: 10, t: 5 }, { x: 40, t: 5 }])).toBe(0);
  });
});

describe("where the panel being pulled in sits", () => {
  it("trails the drag by one width, on the side it is coming from", () => {
    expect(incomingOffset(-100, 1, 2, 355)).toBe(255); // next panel, still to the right
    expect(incomingOffset(-100, 2, 1, 355)).toBe(-455); // previous panel, still to the left
  });

  it("arrives exactly when the drag completes", () => {
    expect(incomingOffset(-355, 1, 2, 355)).toBe(0);
    expect(incomingOffset(355, 2, 1, 355)).toBe(0);
  });
});

describe("which panel a swipe lands on", () => {
  it("steps to the neighbour", () => {
    expect(stepPane(0, "next")).toBe(1);
    expect(stepPane(2, "previous")).toBe(1);
  });

  it("stops at the ends instead of wrapping", () => {
    expect(stepPane(0, "previous")).toBe(0);
    expect(stepPane(PANE_ORDER.length - 1, "next")).toBe(PANE_ORDER.length - 1);
  });

  it("survives an empty or unknown panel list", () => {
    expect(stepPane(0, "next", 0)).toBe(0);
    expect(stepPane(9, "next", 3)).toBe(2);
    expect(stepPane(-4, "previous", 3)).toBe(0);
  });
});

describe("which side the arriving panel slides in from", () => {
  it("comes from the right when moving forward, and from the left when moving back", () => {
    expect(paneSide(1, 2)).toBe("right");
    expect(paneSide(2, 1)).toBe("left");
  });

  it("treats a re-selected panel as no movement", () => {
    expect(paneSide(1, 1)).toBe("right");
  });
});

describe("the panel order", () => {
  it("is the swipe order the tab bar shows", () => {
    expect([...PANE_ORDER]).toEqual(["scene", "chat", "info"]);
    expect(paneIndexOf("chat")).toBe(1);
    expect(paneIndexOf("nope")).toBe(-1);
  });
});
