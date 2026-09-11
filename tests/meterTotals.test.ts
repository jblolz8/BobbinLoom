import { describe, expect, it } from "vitest";
import { deriveMeterTotals } from "../src/client/utils/meterTotals";
import type { TokenBreakdown } from "../src/client/api/playthroughs";

const breakdown: TokenBreakdown = {
  modules: 100,
  outputFormat: 500,
  lorebook: 0,
  storySoFar: 0,
  stateSummary: 300,
  chatHistory: 200,
  memoryEvents: 0,
  lorebookDepth: 0,
  userInput: 50
};

describe("deriveMeterTotals", () => {
  it("uses the estimate when no measured usage exists", () => {
    const t = deriveMeterTotals({ estimated: 1150, contextWindow: 32000, breakdown });
    expect(t.total).toBe(1150);
    expect(t.scale).toBe(1);
    expect(t.remaining).toBe(32000 - 1150);
    expect(t.measured).toBe(false);
  });

  it("prefers measured prompt tokens and scales the segments to match", () => {
    const t = deriveMeterTotals({ estimated: 1150, contextWindow: 32000, breakdown, measured: { promptTokens: 1610 } });
    expect(t.total).toBe(1610);
    expect(t.scale).toBeCloseTo(1610 / 1150, 5);
    // segments must still add up to the displayed total
    expect(t.total).toBeCloseTo(1150 * t.scale, 5);
    expect(t.measured).toBe(true);
  });

  it("never reports negative remaining space", () => {
    const t = deriveMeterTotals({ estimated: 1150, contextWindow: 1000, breakdown });
    expect(t.remaining).toBe(0);
  });

  it("keeps the bar tiling: every breakdown segment scaled by `scale` sums to `total`", () => {
    const t = deriveMeterTotals({ estimated: 1150, contextWindow: 32000, breakdown, measured: { promptTokens: 1610 } });
    const segmentSum = (Object.values(breakdown) as number[]).reduce((sum, n) => sum + n * t.scale, 0);
    expect(segmentSum).toBeCloseTo(t.total, 5);
    expect(segmentSum).toBeCloseTo(1610, 5);
  });

  it("guards the scale when the estimate is zero", () => {
    const empty: TokenBreakdown = {
      modules: 0, outputFormat: 0, lorebook: 0, storySoFar: 0, stateSummary: 0,
      chatHistory: 0, memoryEvents: 0, lorebookDepth: 0, userInput: 0
    };
    const t = deriveMeterTotals({ estimated: 0, contextWindow: 32000, breakdown: empty, measured: { promptTokens: 1610 } });
    expect(t.scale).toBe(1);
    expect(Number.isFinite(t.scale)).toBe(true);
    expect(t.total).toBe(1610);
    const segmentSum = (Object.values(empty) as number[]).reduce((sum, n) => sum + n * t.scale, 0);
    expect(segmentSum).toBe(0);
  });
});
