import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../src/engine/imageDefaults";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { generateImagePrompt } from "../src/server/provider/imagePrompt";

function testConfig(): ResolvedProviderConfig {
  return {
    providerId: "local_lm_studio",
    label: "Local LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "test-key",
    model: "local-model",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    maxRetries: 0,
    timeoutMs: 180_000
  };
}

/** Answers every call with a chat-completion envelope wrapping `content`. */
function stubFetch(content: string): typeof fetch {
  return (async () =>
    new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    })) as unknown as typeof fetch;
}

const INPUT = {
  messageContent: "She knelt between his knees and hooked a finger into his waistband.",
  previousUserContent: "I sit down on the mattress.",
  stateSummary: "Location: Cramped apartment — A dim studio with a sagging mattress.",
  castSummary: "THE CAMERA (the player):\nAnon — A male human"
};

async function warningsFor(content: string): Promise<string[]> {
  const out = await generateImagePrompt(testConfig(), DEFAULT_IMAGE_GENERATION_SETTINGS, INPUT, stubFetch(content));
  return out.warnings;
}

/** The real failure, verbatim in shape: the model wrapped a JSON object INSIDE the
 *  `prompt` value and answered in prose. The outer object parses, `obj.prompt` is a
 *  string, so this used to render with zero warnings. */
const NESTED_JSON = JSON.stringify({
  prompt: JSON.stringify({
    prompt:
      'One naked woman, Jeneine, 5\'7", slim, pale skin, straddling and sitting on a man\'s hips, leaning forward on her elbows, hands gripping his shoulders.',
    negative: "clothing on Jeneine, sheet covering her breasts, censoring"
  }),
  negative: ""
});

const PROSE =
  "A high-angle shot looking down at a man and a woman in a cramped, dimly lit one-room apartment. " +
  "The man, with fair skin, black hair, and glasses, is sitting on a sagging mattress wearing a white long-sleeve shirt.";

const CLEAN_TAGS =
  "explicit, 1boy 1girl, pov, medium shot, bedroom, morning, sunlight, lying on back, straddling, cowgirl position, " +
  "pinning wrists above head, kissing, male pov, viewer's waistband gripped | human, long dark hair, dark eyes, tall, " +
  "black training top, loose cotton shorts, bare feet, wide eyes, flushed face, trembling, sweat";

const CLEAN_TAGS_WITH_PIPES_AND_ONLY_TWO_COMMAS =
  "safe, 1girl, braixen, close-up, bedroom, night, dim lighting, sitting on bed, long yellow fur, red ear-tufts, " +
  "red eyes, face scar, fluffy tail, slim waist, looking at viewer, flushed face, black crop top, black shorts | " +
  "arms crossed, smiling";

describe("the prompt-shape warning", () => {
  it("flags JSON nested inside the prompt value", async () => {
    const warnings = await warningsFor(NESTED_JSON);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("JSON object inside");
    expect(warnings[0]).toContain("Edit it before generating");
  });

  it("flags prose where a tag line belongs", async () => {
    const warnings = await warningsFor(JSON.stringify({ prompt: PROSE, negative: "worst quality" }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("reads as prose");
  });

  it("stays silent on a clean tag line — including a two-group one", async () => {
    expect(await warningsFor(JSON.stringify({ prompt: CLEAN_TAGS, negative: "worst quality" }))).toHaveLength(0);
    expect(await warningsFor(JSON.stringify({ prompt: CLEAN_TAGS_WITH_PIPES_AND_ONLY_TWO_COMMAS }))).toHaveLength(0);
  });

  it("reports a refusal once, without also calling it prose", async () => {
    const warnings = await warningsFor("I can't help with that request.");
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("looks like it refused");
    expect(warnings[0]).not.toContain("reads as prose");
  });

  it("still reports a missing prompt field on its own", async () => {
    // One cause, one warning: the raw blob is already named as the wrong shape,
    // so the JSON-shape note must not pile on top of it.
    const warnings = await warningsFor(JSON.stringify({ negative: "worst quality" }));
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain('no "prompt" field');
  });

  it("stays silent on a terse answer — the false positive this rule must not have", async () => {
    // A short tag line written by a lazy model is not prose. Nagging on it would
    // train the user to ignore the warnings panel.
    expect(await warningsFor(JSON.stringify({ prompt: "a woman in the rain" }))).toHaveLength(0);
    expect(await warningsFor(JSON.stringify({ prompt: "safe, 1girl, bedroom, night" }))).toHaveLength(0);
  });
});
