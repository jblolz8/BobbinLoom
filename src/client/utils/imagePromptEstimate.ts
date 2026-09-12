/**
 * A rough length estimate for an image prompt, in the units Stable Diffusion
 * actually consumes: CLIP text chunks.
 *
 * CLIP encodes 75 tokens per chunk and everything past the first chunk is
 * weighted less, so a long tag soup quietly loses the emphasis on its tail —
 * exactly the thing a prompt author wants to know before paying for a render.
 *
 * This is deliberately an APPROXIMATION, not a tokenizer: bringing in a real
 * CLIP BPE vocabulary would be a new dependency, and the number only ever
 * drives a warning. Four characters per token is the usual rule of thumb for
 * English prose and is conservative for the comma-separated tags these prompts
 * are made of (a tag boundary usually costs a token where the estimate assumes
 * four characters).
 */

/** CLIP encodes 75 tokens per chunk. */
export const CLIP_CHUNK_TOKENS = 75;

/** Rule-of-thumb characters per token — an approximation, never a limit. */
export const CHARS_PER_TOKEN = 4;

/** The estimate for one prompt. `chunks` is always ≥ 1: even an empty prompt
 *  occupies the single chunk every prompt starts with. */
export type PromptEstimate = {
  tokens: number;
  chunks: number;
};

/**
 * Approximate token count and CLIP chunk count for `prompt`. The string is
 * measured exactly as it will be sent — nothing is trimmed or normalised, so
 * the estimate matches the text the provider receives.
 */
export function estimatePromptChunks(prompt: string): PromptEstimate {
  const tokens = Math.ceil(prompt.length / CHARS_PER_TOKEN);
  return { tokens, chunks: Math.max(1, Math.ceil(tokens / CLIP_CHUNK_TOKENS)) };
}

/**
 * A one-line warning when the prompt spills past the first CLIP chunk, `null`
 * when it fits (or is empty).
 *
 * Wording is fixed by the two facts the warning exists to convey: the tail tags
 * are weighted less, and nothing is being changed for the user — this is
 * information, not truncation. The caller decides where to show it.
 */
export function chunkWarning(prompt: string): string | null {
  const { tokens, chunks } = estimatePromptChunks(prompt);
  if (chunks <= 1) return null;
  return (
    `About ${tokens} tokens — ${chunks} CLIP chunks of ${CLIP_CHUNK_TOKENS}. ` +
    `Only the first chunk is encoded at full strength, so the tags past it are weighted less. ` +
    `The text is sent unchanged — nothing is trimmed, reordered or dropped.`
  );
}
