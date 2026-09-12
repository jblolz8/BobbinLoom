import { describe, it, expect } from "vitest";
import {
  CLIP_CHUNK_TOKENS,
  chunkWarning,
  estimatePromptChunks
} from "../src/client/utils/imagePromptEstimate";

/** A prompt of exactly `n` characters — the estimator counts the characters of
 *  the string it is handed, so the fixtures are built rather than typed. */
function chars(n: number): string {
  return "a".repeat(n);
}

describe("estimatePromptChunks", () => {
  it("reports an empty prompt as zero tokens and one chunk", () => {
    expect(estimatePromptChunks("")).toEqual({ tokens: 0, chunks: 1 });
  });

  it("approximates four characters per token", () => {
    expect(estimatePromptChunks(chars(4)).tokens).toBe(1);
    expect(estimatePromptChunks(chars(300)).tokens).toBe(75);
  });

  it("keeps a 300-character prompt inside a single chunk", () => {
    expect(estimatePromptChunks(chars(300)).chunks).toBe(1);
  });

  it("splits a 700-character prompt into three chunks", () => {
    expect(estimatePromptChunks(chars(700))).toEqual({ tokens: 175, chunks: 3 });
  });

  it("puts the second chunk one character past the first boundary", () => {
    expect(estimatePromptChunks(chars(300)).chunks).toBe(1);
    expect(estimatePromptChunks(chars(301)).chunks).toBe(2);
  });

  it("never reports fewer than one chunk, even for a one-character prompt", () => {
    expect(estimatePromptChunks("a").chunks).toBe(1);
  });

  it("sizes a chunk at the exported CLIP constant", () => {
    expect(CLIP_CHUNK_TOKENS).toBe(75);
    // Exactly two chunks' worth of tokens.
    expect(estimatePromptChunks(chars(CLIP_CHUNK_TOKENS * 2 * 4)).chunks).toBe(2);
  });
});

describe("chunkWarning", () => {
  it("stays silent for an empty prompt", () => {
    expect(chunkWarning("")).toBeNull();
  });

  it("stays silent while the whole prompt is one chunk", () => {
    expect(chunkWarning(chars(300))).toBeNull();
  });

  it("warns once the prompt runs past the first chunk", () => {
    expect(chunkWarning(chars(700))).not.toBeNull();
  });

  it("says the tags past the first chunk are weighted less", () => {
    expect(chunkWarning(chars(700))).toMatch(/weighted less/i);
  });

  it("says the text is sent unchanged", () => {
    expect(chunkWarning(chars(700))).toMatch(/sent unchanged/i);
  });

  it("carries the numbers, so the warning is actionable", () => {
    const warning = chunkWarning(chars(700)) ?? "";
    expect(warning).toContain("175");
    expect(warning).toContain("3");
    expect(warning).toContain(String(CLIP_CHUNK_TOKENS));
  });

  it("warns for a prompt of several chunks", () => {
    expect(chunkWarning(chars(3100))).not.toBeNull();
  });
});
