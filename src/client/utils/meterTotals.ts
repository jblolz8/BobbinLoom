import type { TokenUsage } from "../api";

export type MeterTotals = {
  /** Tokens shown in the label and used for free-space width. */
  total: number;
  /** Multiplier applied to each breakdown segment so the bar still tiles to `total`. */
  scale: number;
  remaining: number;
  /** True when `total` is the provider's real count rather than an estimate. */
  measured: boolean;
};

/**
 * Real usage only arrives after a turn has run, and it reports the prompt of
 * that turn — which is exactly the number the player wants. The estimate stays
 * the source of truth before the first turn and on providers that report none.
 * Segments are scaled so per-segment attribution and the bar's total agree.
 */
export function deriveMeterTotals(tokenUsage: TokenUsage): MeterTotals {
  const measuredPrompt = tokenUsage.measured?.promptTokens;
  const measured = typeof measuredPrompt === "number" && measuredPrompt > 0;
  const total = measured ? measuredPrompt! : tokenUsage.estimated;
  const scale = measured && tokenUsage.estimated > 0 ? measuredPrompt! / tokenUsage.estimated : 1;
  return {
    total,
    scale,
    remaining: Math.max(0, tokenUsage.contextWindow - total),
    measured
  };
}
