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
  /** True when the COMPOSED prompt had to be cut to `promptCharacterLimit`
   *  inside this call. The cut lands at the END of the text — where a tag list
   *  keeps its action and physical-state tags — so the dry-run route turns this
   *  into a warning for the review modal. The text is still returned as-is. */
  promptTruncated: boolean;
  rawInput: string;
  rawOutput: string;
  model: string;
  durationMs: number;
  /** Advisory notes about the model's answer — a suspected refusal used
   *  verbatim, or JSON that carried no `prompt` string. Never blocking: the
   *  text above is still returned as-is and the review modal is where the user
   *  fixes it. Empty when the answer looked exactly like what was asked for. */
  warnings: string[];
};

/** The message shape this call reads: `content` is `unknown` on purpose (a
 *  proxy can answer with a non-string shape, and this call must fail with a
 *  diagnostic instead of a TypeError), and the two reasoning fields are the
 *  "the model spent its budget thinking" signal. */
type MessageShape = {
  content?: unknown;
  reasoning_content?: unknown;
  reasoning?: unknown;
};

/** The chat-completion envelope, as far as this call reads it. */
type CompletionEnvelope = {
  choices?: Array<{
    finish_reason?: string | null;
    message?: MessageShape;
  }>;
};

/** How much of the raw response an empty-content failure quotes. Enough to see
 *  what the provider actually answered; never the whole body. */
const ERROR_SNIPPET_CHARS = 400;

/** How far into the answer a refusal shape is looked for. Bounded on purpose:
 *  "cannot help with" appearing mid-prompt is a description, not a refusal. */
const REFUSAL_WINDOW_CHARS = 200;

/** Bounded, case-insensitive refusal shapes, matched against the START of the
 *  text. Advisory only — the text is still used as the prompt. */
const REFUSAL_PATTERNS = [
  "i can't",
  "i cannot",
  "i'm unable",
  "i am unable",
  "i won't",
  "i will not",
  "as an ai",
  "sorry, but",
  "i must decline",
  "can't help with",
  "cannot help with",
  "cannot assist"
];

/** Typographic apostrophes ("I can’t") must match the same patterns as ASCII. */
function normalizeQuotes(text: string): string {
  return text.replace(/[\u2018\u2019\u02bc]/g, "'");
}

/** The refusal shape the text opens with, or null when it opens like a prompt. */
function matchedRefusal(text: string): string | null {
  const window = normalizeQuotes(text.slice(0, REFUSAL_WINDOW_CHARS)).toLowerCase();
  return REFUSAL_PATTERNS.find((pattern) => window.includes(pattern)) ?? null;
}

/** The parsed object's own keys, bounded — shown in the warning so the user can
 *  see what the model actually answered instead of a generic "bad JSON". */
function describeKeys(obj: Record<string, unknown>): string {
  const keys = Object.keys(obj).slice(0, 6);
  return keys.length ? keys.map((key) => `"${key}"`).join(", ") : "none";
}

/** The JSON contract the prompt call enforces. `requestWithRetry` drops this
 *  field and retries once when a model or proxy rejects it (400/422/404), so it
 *  is safe on endpoints without structured output. */
const JSON_RESPONSE_FORMAT = { type: "json_object" } as const;

type ReasoningSignal = "reasoning_content" | "reasoning" | "a reasoning block" | null;

/** A content block typed as reasoning/thinking (Anthropic-style proxying). */
function isReasoningBlock(block: unknown): boolean {
  if (!block || typeof block !== "object") return false;
  const type = (block as { type?: unknown }).type;
  return typeof type === "string" && /reason|thinking/i.test(type);
}

/**
 * The "the model spent its budget thinking" signal. Providers spell the
 * reasoning side differently: a `reasoning_content` / `reasoning` string beside
 * the content, or a content array whose blocks are typed as reasoning.
 */
function reasoningSignal(message: MessageShape | undefined): ReasoningSignal {
  if (!message) return null;
  if (typeof message.reasoning_content === "string" && message.reasoning_content.trim()) return "reasoning_content";
  if (typeof message.reasoning === "string" && message.reasoning.trim()) return "reasoning";
  if (Array.isArray(message.content) && message.content.some(isReasoningBlock)) return "a reasoning block";
  return null;
}

/**
 * The ONE empty-content failure. It carries everything the last round trip had
 * to be spent discovering: the finish reason, whether the model spent its
 * budget on a reasoning side, and a truncated quote of the raw response. There
 * is deliberately no retry and no deterministic fallback prompt.
 */
function emptyContentError(
  text: string,
  finishReason: string,
  reasoning: ReasoningSignal
): Error {
  const details = [`finish_reason: ${finishReason}`];
  if (reasoning) {
    details.push(
      `the message carried ${reasoning} while content was empty — the model spent its output budget on reasoning instead of writing the prompt (raise the connection's maxTokens, or use a connection that answers directly)`
    );
  } else {
    details.push("the message carried no reasoning field");
  }
  const snippet = text.length > ERROR_SNIPPET_CHARS ? `${text.slice(0, ERROR_SNIPPET_CHARS)}…` : text;
  return new Error(
    `The text provider returned no image prompt (${details.join("; ")}). Raw response (truncated): ${snippet}`
  );
}

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
  blocks.push('Return ONE line of comma-separated tags describing this moment. Return JSON only: {"prompt": "…"}');
  return blocks.join("\n\n");
}

/** Compose + clamp a side: preset prefix first, then the model's text. A limit
 *  of 0 means unlimited (the schema allows it), so it is never asked to clamp.
 *  `truncated` says whether the clamp actually cut anything. */
function compose(prefix: string, body: string, limit: number): { text: string; truncated: boolean } {
  const composed = composePrompt(prefix, body);
  if (limit <= 0) return { text: composed, truncated: false };
  const clamped = clampChars(composed, limit);
  return { text: clamped, truncated: clamped.length < composed.length };
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
    // The CONNECTION governs the budget. The old `min(maxTokens, 600)` ceiling
    // made a model that thinks or writes a preamble spend everything and answer
    // with empty content and `finish_reason: "length"` — which surfaced as the
    // useless "the text provider returned no image prompt".
    max_tokens: config.maxTokens,
    // Enforce the JSON contract the instruction asks for. Safe on endpoints
    // without structured output: `requestWithRetry` retries once without this
    // field on a 400/422/404.
    response_format: JSON_RESPONSE_FORMAT,
    messages: [
      { role: "system", content: settings.instruction },
      { role: "user", content: buildImagePromptContextBlock(input, settings) }
    ]
  };

  const res = await requestWithRetry(config, fetchImpl, body, "/chat/completions", undefined, signal);
  const text = await res.text();
  if (!res.ok) throw new Error(`Image prompt provider error ${res.status}: ${text.slice(0, 300)}`);

  let envelope: CompletionEnvelope;
  try {
    envelope = JSON.parse(text) as CompletionEnvelope;
  } catch {
    throw new Error("The text provider returned a non-JSON response while writing the image prompt.");
  }

  const choice = envelope.choices?.[0];
  const message = choice?.message;
  const content = typeof message?.content === "string" ? message.content : "";

  // FAIL IMMEDIATELY on empty content: no retry, no deterministic fallback
  // prompt. The diagnostic IS the deliverable — see `emptyContentError`.
  if (!content.trim()) {
    const finishReason = choice?.finish_reason
      ?? (envelope.choices?.length ? "absent" : "absent — the response carried no choices");
    throw emptyContentError(text, finishReason, reasoningSignal(message));
  }

  const warnings: string[] = [];
  const payload = extractJsonPayload(content);
  const obj = payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : null;

  let rawPrompt = "";
  let rawNegative = "";
  if (obj) {
    if (typeof obj.prompt === "string") rawPrompt = obj.prompt;
    if (typeof obj.negative_prompt === "string") rawNegative = obj.negative_prompt;
    if (typeof obj.prompt !== "string") {
      warnings.push(
        `The text model returned JSON with no "prompt" field (keys: ${describeKeys(obj)}), so that raw JSON is now the image prompt. Edit it before generating, or try another text connection.`
      );
    }
  }
  // Prose fallback: the model ignored the JSON contract but still wrote a
  // prompt. Use it verbatim; the negative side falls back to the preset prefix.
  if (!rawPrompt.trim()) {
    rawPrompt = content.trim();
    // A refusal is taken verbatim too — flag it, never block it. The modal is
    // where the user fixes (or discards) it.
    const refusal = matchedRefusal(rawPrompt);
    if (refusal) {
      warnings.push(
        `The text model looks like it refused — it opened with "${refusal}" instead of describing an image, and that text is now the prompt. Review it before generating, or try another text connection.`
      );
    }
  }

  const composedPrompt = compose(settings.positivePrefix, rawPrompt, settings.promptCharacterLimit);
  // The negative has NO preset ceiling: it is a fixed list we ship, not a tag list
  // the preset sizes. A limit of 0 reads as unlimited here, and the route clamps
  // the composed negative to the dialect's hard cap — which is the only ceiling it
  // should ever have. Clamping it here made the route's cap unreachable: the text
  // was already cut before it got there.
  const composedNegative = compose(settings.negativePrefix, rawNegative, 0);

  return {
    prompt: composedPrompt.text,
    negativePrompt: composedNegative.text,
    promptTruncated: composedPrompt.truncated,
    rawInput: JSON.stringify(body),
    rawOutput: text,
    model: config.model,
    durationMs: Date.now() - start,
    warnings
  };
}
