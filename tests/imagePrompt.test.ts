import { describe, expect, it } from "vitest";
import { DEFAULT_IMAGE_GENERATION_SETTINGS } from "../src/engine/imageDefaults";
import type { ImageGenerationSettings } from "../src/schemas";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { generateImagePrompt } from "../src/server/provider/imagePrompt";

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
  it("parses the JSON contract and composes the preset prefixes", async () => {
    const { fetchImpl, calls } = stubFetch('{"prompt": "a woman in a wet alley", "negative_prompt": "blurry"}');
    const result = await generateImagePrompt(testConfig(), settings(), INPUT, fetchImpl);

    // Side call: exactly one request, to the chat completion endpoint.
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe("http://localhost:1234/v1/chat/completions");
    expect(calls[0].body.model).toBe("local-model");
    expect(calls[0].body.temperature).toBe(0.7);
    expect(calls[0].body.max_tokens).toBe(600);
    expect(calls[0].body.messages[0].role).toBe("system");
    expect(calls[0].body.messages[0].content).toBe(settings().instruction);
    expect(calls[0].body.messages[1].content).toContain(INPUT.messageContent);
    expect(calls[0].body.messages[1].content).toContain(INPUT.previousUserContent);
    expect(calls[0].body.messages[1].content).toContain(INPUT.stateSummary);
    expect(calls[0].body.messages[1].content).toContain(INPUT.castSummary);

    expect(result.prompt).toBe("anime style a woman in a wet alley");
    expect(result.negativePrompt).toBe(`${settings().negativePrefix} blurry`);
    expect(result.model).toBe("local-model");
    expect(result.rawInput).toContain("local-model");
    expect(result.rawOutput).toContain("wet alley");
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
  });

  it("caps max_tokens at the provider's own maxTokens and accepts a fenced JSON block", async () => {
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
