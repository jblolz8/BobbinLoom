import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../src/engine/imageDefaults";
import type { ImageGenerationSettings } from "../src/schemas";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { generateImagePrompt, buildImagePromptContextBlock } from "../src/server/provider/imagePrompt";

function testConfig(overrides: Partial<ResolvedProviderConfig> = {}): ResolvedProviderConfig {
  return {
    providerId: "local_lm_studio",
    label: "Local LM Studio",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "",
    model: "local-model",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    maxRetries: 0,
    timeoutMs: 180_000,
    ...overrides
  };
}

function settings(overrides: Partial<ImageGenerationSettings> = {}): ImageGenerationSettings {
  return { ...DEFAULT_IMAGE_GENERATION_SETTINGS, ...overrides };
}

/** Answers every call with a chat-completion envelope wrapping `content`. */
function stubFetch(content: string): { fetchImpl: typeof fetch; calls: Array<{ url: string; body: any }> } {
  const calls: Array<{ url: string; body: any }> = [];
  const fetchImpl = (async (url: any, init: any) => {
    calls.push({ url: String(url), body: JSON.parse(init.body) });
    return new Response(JSON.stringify({ choices: [{ message: { content } }] }), {
      status: 200,
      headers: { "Content-Type": "application/json" }
    });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls };
}

const INPUT = {
  messageContent: "She stepped into the rain-slick alley.",
  previousUserContent: "I follow her outside.",
  stateSummary: "Location: The Alley. Turn 4.",
  castSummary: "Mira — soaked coat, wary"
};

describe("generateImagePrompt", () => {
  it("does not cut the composed negative at the preset's prompt limit", async () => {
    // The shipped negative is ~650 chars and the model may volunteer more; the
    // preset's prompt limit sizes the PROMPT, never the negative. The route clamps
    // the negative to the dialect cap, so the side call must hand it over whole.
    const longPrefix = `${"tag, ".repeat(320)}tail`;
    const { fetchImpl } = stubFetch('{"prompt": "a tag line", "negative_prompt": "volunteered"}');

    const out = await generateImagePrompt(
      testConfig(),
      settings({ negativePrefix: longPrefix }),
      INPUT,
      fetchImpl
    );

    expect(longPrefix.length).toBeGreaterThan(1200);
    // The negative is comma-joined (prefix list, then the model's tags), so the
    // assertion is about the LENGTH surviving, not the separator.
    expect(out.negativePrompt).toBe(`${longPrefix}, volunteered`);
  });

  it("sends a tag-list instruction and asks for the two-field JSON shape", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "safe, 1girl, bedroom"}');
    await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    const system = calls[0].body.messages[0].content as string;
    // The system message IS the preset instruction: a booru-style tag list, not
    // a prose sentence.
    expect(system).toBe(settings().instruction);
    expect(system).toContain("booru-style tags");
    expect(system).toContain('Return JSON only:\n{"prompt": "<the tag line>", "negative": "<negative tags>"}');
    expect(system).not.toContain("describe ONE still image");

    // …and the trailing context line asks for the same thing, both fields.
    const block = calls[0].body.messages[1].content as string;
    expect(block).toContain("Return ONE line of comma-separated tags describing this moment.");
    expect(block).toContain('Return JSON only: {"prompt": "…", "negative": "…"}');
    expect(block).not.toContain("negative_prompt");
  });

  it("still accepts a volunteer negative_prompt and composes it with the prefix", async () => {
    const { fetchImpl } = stubFetch('{"prompt": "safe, 1girl", "negative_prompt": "hands, extra fingers"}');
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(result.prompt).toBe("anime style safe, 1girl");
    expect(result.negativePrompt).toBe(`${settings().negativePrefix}, hands, extra fingers`);
    expect(result.warnings).toEqual([]);
  });

  it("parses the instruction's `negative` field and comma-joins it after the shipped list", async () => {
    // The two-field contract the shipped instruction asks for: `negative`, not
    // the legacy `negative_prompt`. The shipped list (prefix) must come first,
    // comma-joined, because both sides are comma-separated strings.
    const { fetchImpl } = stubFetch('{"prompt": "explicit, 1girl", "negative": "human, human ears"}');
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(result.prompt).toBe("anime style explicit, 1girl");
    expect(result.negativePrompt).toBe(`${settings().negativePrefix}, human, human ears`);
    expect(result.warnings).toEqual([]);
  });

  it("parses the JSON contract and composes the preset prefixes", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "a woman in a wet alley", "negative_prompt": "blurry"}');
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    // Side call: exactly one request, to the chat completion endpoint.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
    expect(calls[0].body.model).toBe("local-model");
    expect(calls[0].body.temperature).toBe(0.7);
    // The CONNECTION governs the budget: no artificial ceiling here.
    expect(calls[0].body.max_tokens).toBe(1200);
    expect(calls[0].body.messages[0].role).toBe("system");
    expect(calls[0].body.messages[0].content).toBe(settings().instruction);
    expect(calls[0].body.messages[1].content).toContain(INPUT.messageContent);
    expect(calls[0].body.messages[1].content).toContain(INPUT.previousUserContent);
    expect(calls[0].body.messages[1].content).toContain(INPUT.stateSummary);
    expect(calls[0].body.messages[1].content).toContain(INPUT.castSummary);

    expect(result.prompt).toBe("anime style a woman in a wet alley");
    expect(result.negativePrompt).toBe(`${settings().negativePrefix}, blurry`);
    expect(result.model).toBe("local-model");
    expect(result.rawInput).toContain("local-model");
    expect(result.rawOutput).toContain("wet alley");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("sends the connection's own maxTokens and accepts a fenced JSON block", async () => {
    const { fetchImpl, calls } = stubFetch('```json\n{"prompt": "a bridge", "negative_prompt": ""}\n```');
    const result = await generateImagePrompt(testConfig({ maxTokens: 200 }), settings(), INPUT, fetchImpl);
    expect(calls[0].body.max_tokens).toBe(200);
    expect(result.prompt).toBe("anime style a bridge");
    // No model-written negative → the preset's negative prefix alone.
    expect(result.negativePrompt).toBe(settings().negativePrefix);
  });

  it("falls back to plain prose when the model does not return JSON", async () => {
    const { fetchImpl } = stubFetch("  a lone figure in the rain  ");
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(result.prompt).toBe("anime style a lone figure in the rain");
    expect(result.negativePrompt).toBe(settings().negativePrefix);
  });

  it("clamps the composed prompt to promptCharacterLimit", async () => {
    const { fetchImpl } = stubFetch('{"prompt": "z", "negative_prompt": "q"}');
    const result = await generateImagePrompt(testConfig(), settings({ promptCharacterLimit: 12 }), INPUT, fetchImpl);
    expect(result.prompt).toBe("anime style");
    expect(result.prompt.length).toBeLessThanOrEqual(12);
    expect(result.prompt).not.toMatch(/\s$/);
    // The cut is reported so the dry-run route can warn the user.
    expect(result.promptTruncated).toBe(true);
  });

  it("reports no truncation when the composed prompt fits the limit", async () => {
    const { fetchImpl } = stubFetch('{"prompt": "safe, 1girl, bedroom", "negative_prompt": ""}');
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(result.prompt).toBe("anime style safe, 1girl, bedroom");
    expect(result.promptTruncated).toBe(false);
  });

  it("drops the state and cast blocks when the settings say so", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "a", "negative_prompt": ""}');
    await generateImagePrompt(testConfig(), settings({ includeState: false, includeCast: false }), INPUT, fetchImpl);
    const block = calls[0].body.messages[1].content as string;
    expect(block).not.toContain("CURRENT STATE");
    expect(block).not.toContain(INPUT.stateSummary);
    expect(block).not.toContain("PRESENT CHARACTERS");
    expect(block).not.toContain(INPUT.castSummary);
    expect(block).toContain("SCENE TEXT");
    expect(block).toContain("PLAYER'S LAST ACTION");
  });

  it("omits optional context blocks that were not supplied", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "a", "negative_prompt": ""}');
    await generateImagePrompt(testConfig(), settings(), { messageContent: "only a scene" }, fetchImpl);
    const block = calls[0].body.messages[1].content as string;
    expect(block).toContain("only a scene");
    expect(block).not.toContain("PLAYER'S LAST ACTION");
  });

  it("rejects when the model returns nothing usable", async () => {
    const { fetchImpl } = stubFetch("   ");
    await expect(generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl)).rejects.toThrow(/no image prompt/i);
  });

  it("surfaces a provider failure instead of inventing a prompt", async () => {
    const fetchImpl = (async () =>
      new Response("upstream exploded", { status: 500 })) as unknown as typeof fetch;
    await expect(generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl)).rejects.toThrow(/500/);
  });
});

describe("the history block in the context", () => {
  const HISTORY = "PREVIOUS MESSAGES (what happened BEFORE the scene text below — continuity only, NOT the frame to render):\nAssistant: an earlier beat";

  it("opens the message, and SCENE TEXT stays the frame that follows it", () => {
    const block = buildImagePromptContextBlock({ ...INPUT, history: HISTORY }, settings());
    expect(block.startsWith("PREVIOUS MESSAGES")).toBe(true);
    expect(block).toContain("an earlier beat");
    expect(block.indexOf("SCENE TEXT:")).toBeGreaterThan(block.indexOf("PREVIOUS MESSAGES"));
  });

  it("emits no history block when none was built", () => {
    // The count is 0, the message is the first one, or there is nothing prose-like
    // behind it — all three arrive as an absent field, never as an empty header.
    const block = buildImagePromptContextBlock(INPUT, settings());
    expect(block.startsWith("SCENE TEXT:")).toBe(true);
    expect(block).not.toContain("PREVIOUS MESSAGES");
  });
});

describe("the instruction mode in the side call", () => {
  it("sends the scene document when the block is in scene mode", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "a bridge"}');
    await generateImagePrompt(testConfig(), settings({ instructionMode: "scene" }), INPUT, fetchImpl);

    const system = calls[0].body.messages[0].content as string;
    expect(system).toContain("NO CAMERA — THE PLAYER IS NOT IN THIS FRAME");
    expect(system).not.toContain("THE PLAYER (POV scenes)");
    // The rest of the document is the same text: only the perspective moved.
    expect(system).toContain("Return JSON only:");
    expect(system).toContain("NEGATIVE PROMPT");
  });

  it("sends the pov document unchanged when the block is in pov mode", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "a bridge"}');
    await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);
    expect(calls[0].body.messages[0].content).toBe(settings().instruction);
  });

  it("never rewrites an instruction that carries neither variant", async () => {
    const custom = "Just write me some tags.";
    const { fetchImpl, calls } = stubFetch('{"prompt": "a bridge"}');
    await generateImagePrompt(testConfig(), settings({ instruction: custom, instructionMode: "scene" }), INPUT, fetchImpl);
    expect(calls[0].body.messages[0].content).toBe(custom);
  });
});
