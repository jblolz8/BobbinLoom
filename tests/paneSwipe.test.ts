import { describe, expect, it } from "vitest";
import { PANE_ORDER, ownsHorizontalGesture, paneIndexOf, paneSide, stepPane, swipeIntent } from "../src/client/engine/paneSwipe";

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
