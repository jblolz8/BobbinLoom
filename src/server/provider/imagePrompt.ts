import type { ImageGenerationSettings } from "../../schemas";
import { clampChars, composePrompt } from "../imageProvider/shared";
import type { ResolvedProviderConfig } from "../providerConfig";
import { requestWithRetry } from "./openaiClient";
import { extractJsonPayload } from "./patchParser";

export type ImagePromptInput = {
  messageContent: string;
  previousUserContent?: string;
  stateSummary?: string;
  castSummary?: string;
};

export type ImagePromptOutput = {
  /** The COMPOSED prompt (preset positive prefix + the model's answer), already
   *  clamped to `promptCharacterLimit`. This is what the preview modal shows and
   *  what the image provider receives. */
  prompt: string;
  negativePrompt: string;
  rawInput: string;
  rawOutput: string;
  model: string;
  durationMs: number;
};

/** The JSON contract the shipped instruction asks for; kept in one place so the
 *  fallback path and the prompt text cannot drift apart. */
const MAX_PROMPT_TOKENS = 600;

/**
 * Build the user message for the prompt-writing call. Only what the preset's
 * `includeState` / `includeCast` flags allow is included, and empty blocks are
 * dropped entirely (an empty "CURRENT STATE:" header invites the model to
 * invent one).
 */
export function buildImagePromptContextBlock(input: ImagePromptInput, settings: ImageGenerationSettings): string {
  const blocks: string[] = [`SCENE TEXT:\n${input.messageContent}`];
  if (input.previousUserContent) blocks.push(`PLAYER'S LAST ACTION:\n${input.previousUserContent}`);
  if (settings.includeState && input.stateSummary) blocks.push(`CURRENT STATE:\n${input.stateSummary}`);
  if (settings.includeCast && input.castSummary) blocks.push(`PRESENT CHARACTERS:\n${input.castSummary}`);
  blocks.push('Write ONE image prompt for this moment. Return JSON: {"prompt": "…", "negative_prompt": "…"}');
  return blocks.join("\n\n");
}

/** Compose + clamp a side: preset prefix first, then the model's text. A limit
 *  of 0 means unlimited (the schema allows it), so it is never asked to clamp. */
function compose(prefix: string, body: string, limit: number): string {
  const composed = composePrompt(prefix, body);
  return limit > 0 ? clampChars(composed, limit) : composed;
}

/**
 * The text → image-prompt SIDE CALL.
 *
 * Deliberately standalone (not a `TurnProvider` method): it takes a resolved
 * provider config directly, so nothing about it can touch the turn array, the
 * turn counter, snapshots, or the token meter. It makes exactly one request and
 * persists nothing.
 */
export async function generateImagePrompt(
  config: ResolvedProviderConfig,
  settings: ImageGenerationSettings,
  input: ImagePromptInput,
  fetchImpl: typeof fetch = fetch,
  signal?: AbortSignal
): Promise<ImagePromptOutput> {
  const start = Date.now();
  const body = {
    model: config.model,
    temperature: 0.7,
    max_tokens: Math.min(config.maxTokens, MAX_PROMPT_TOKENS),
    messages: [
      { role: "system", content: settings.instruction },
      { role: "user", content: buildImagePromptContextBlock(input, settings) }
    ]
  };

  const res = await requestWithRetry(config, fetchImpl, body, "/chat/completions", undefined, signal);
  const text = await res.text();
  if (!res.ok) throw new Error(`Image prompt provider error ${res.status}: ${text.slice(0, 300)}`);

  let content: string;
  try {
    const envelope = JSON.parse(text) as { choices?: Array<{ message?: { content?: string | null } }> };
    content = envelope.choices?.[0]?.message?.content ?? "";
  } catch {
    throw new Error("The text provider returned a non-JSON response while writing the image prompt.");
  }

  const payload = extractJsonPayload(content);
  let rawPrompt = "";
  let rawNegative = "";
  if (payload && typeof payload === "object" && !Array.isArray(payload)) {
    const obj = payload as Record<string, unknown>;
    if (typeof obj.prompt === "string") rawPrompt = obj.prompt;
    if (typeof obj.negative_prompt === "string") rawNegative = obj.negative_prompt;
  }
  // Prose fallback: the model ignored the JSON contract but still wrote a
  // prompt. Use it verbatim; the negative side falls back to the preset prefix.
  if (!rawPrompt.trim()) rawPrompt = content.trim();
  if (!rawPrompt) throw new Error("The text provider returned no image prompt.");

  return {
    prompt: compose(settings.positivePrefix, rawPrompt, settings.promptCharacterLimit),
    negativePrompt: compose(settings.negativePrefix, rawNegative, settings.promptCharacterLimit),
    rawInput: JSON.stringify(body),
    rawOutput: text,
    model: config.model,
    durationMs: Date.now() - start
  };
}
