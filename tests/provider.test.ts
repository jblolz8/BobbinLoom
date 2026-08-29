import { describe, expect, it, vi } from "vitest";
import { createBlankPlaythrough, createInitialPlaythrough, DEFAULT_CHARACTER_FORMAT, NSFW_CHARACTER_FORMAT, parseUserInput } from "../src/engine/engine";
import { DEMO_TEMPLATE } from "../src/engine/demoData";
import { OpenAICompatibleProvider, assembleTurnPrompt, extractJsonPayload, repairRawControlChars } from "../src/server/openAiCompatibleProvider";
import { normalizeBaseUrl, resolveConnectionConfig } from "../src/server/providerConfig";
import type { ResolvedProviderConfig } from "../src/server/providerConfig";
import { EMPTY_MODULE_SET, PlaythroughPromptSettingsSchema, ScenarioSeedSchema } from "../src/schemas";
import type { ProviderConnection } from "../src/schemas";
import type { CharacterTemplate } from "../src/schemas";
import type { PromptPresetModule } from "../src/schemas";

function testConfig(overrides: Partial<ResolvedProviderConfig>): ResolvedProviderConfig {
  return {
    providerId: "custom",
    label: "Test Provider",
    baseUrl: "http://localhost:1234/v1",
    apiKey: "test-key",
    model: "local-model",
    temperature: 0.8,
    maxTokens: 800,
    contextWindow: 32768,
    maxRetries: 1,
    timeoutMs: 120_000,
    ...overrides
  };
}

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

const VALID_SEED = {
  locations: [
    {
      id: "loc_start",
      name: "Start",
      description: "A small starting spot.",
      state: "",
      icon: "🏠",
      connections: []
    }
  ],
  character: {
    name: "Mira",
    content: "[Species]: Human\n\n[Body]\n- Height: tall"
  },
  quest: { id: "quest_1", name: "First Quest", summary: "Do a thing." },
  items: [],
  startingFlags: [],
  npcs: []
};

describe("ScenarioSeedSchema", () => {
  it("parses seed missing startingFlags by defaulting startingFlags to []", () => {
    const seedWithoutFlags = {
      locations: VALID_SEED.locations,
      character: VALID_SEED.character,
      quest: VALID_SEED.quest,
      items: [],
    };
    const parsed = ScenarioSeedSchema.safeParse(seedWithoutFlags);
    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.startingFlags).toEqual([]);
      expect(parsed.data.npcs).toEqual([]);
    }
  });
});

describe("provider config", () => {
  it("normalizes OpenAI-compatible base URLs", () => {
    expect(normalizeBaseUrl("https://api.deepseek.com")).toBe("https://api.deepseek.com/v1");
    expect(normalizeBaseUrl("https://api.deepseek.com/v1/")).toBe("https://api.deepseek.com/v1");
  });

  it("resolves a connection with BOBBINLOOM_TIMEOUT_MS and a 120s default", () => {
    const conn: ProviderConnection = {
      id: "ds",
      label: "DeepSeek",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      temperature: 0.8,
      maxTokens: 1400,
      contextWindow: 65536
    };

    const overridden = resolveConnectionConfig(conn, { BOBBINLOOM_TIMEOUT_MS: "45000" });
    expect(overridden.timeoutMs).toBe(45000);
    expect(overridden.baseUrl).toBe("https://api.deepseek.com/v1");

    const defaulted = resolveConnectionConfig(conn, {});
    expect(defaulted.timeoutMs).toBe(120_000);
  });
});

describe("OpenAICompatibleProvider", () => {
  it("posts a chat completion request with auth and json mode when supported", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                narrative: "Mira nods once.",
                choices: ["Ask about the gym"],
                statePatch: { flagsAdd: ["met_mira"] }
              })
            }
          }
        ]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({
        providerId: "deepseek",
        baseUrl: "https://api.deepseek.com/v1",
        model: "deepseek-chat",
        temperature: 0.7,
        maxTokens: 900
      }),
      fetchImpl as unknown as typeof fetch
    );

    const state = createInitialPlaythrough("Provider Test");
    const parsed = parseUserInput('I say, "Hello."');
    const { turn } = await provider.generateTurn(parsed, state, true);

    expect(fetchImpl).toHaveBeenCalledTimes(1);

    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.deepseek.com/v1/chat/completions");
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer test-key");

    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("deepseek-chat");
    expect(body.response_format).toEqual({ type: "json_object" });
    expect(body.messages.length).toBeGreaterThan(0);

    expect(turn.narrative).toContain("Mira");
    expect(turn.choices).toEqual(["Ask about the gym"]);
    expect(turn.statePatch?.flagsAdd).toContain("met_mira");
  });

  it("extracts JSON from a markdown code fence", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [
          {
            message: {
              content: "```json\n{\"narrative\":\"Fenced narrative\",\"statePatch\":{\"flagsAdd\":[\"fenced\"]}}\n```"
            }
          }
        ]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );

    const { turn } = await provider.generateTurn(
      parseUserInput("Look around"),
      createInitialPlaythrough("Fence Test"),
      false
    );

    expect(turn.narrative).toBe("Fenced narrative");
    expect(turn.choices).toBeUndefined();
    expect(turn.statePatch?.flagsAdd).toContain("fenced");
  });

  it("falls back to raw narrative when the provider does not return JSON", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: "This is not JSON." } }]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );

    const { turn } = await provider.generateTurn(
      parseUserInput("Say nothing"),
      createInitialPlaythrough("Fallback Test"),
      true
    );

    expect(turn.narrative).toBe("This is not JSON.");
    expect(turn.statePatch).toBeUndefined();
  });

  it("retries transient provider failures", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("server error", { status: 500 }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "{\"narrative\":\"Recovered\"}" } }]
        })
      );

    const provider = new OpenAICompatibleProvider(
      testConfig({ maxRetries: 1 }),
      fetchImpl as unknown as typeof fetch
    );

    const { turn } = await provider.generateTurn(
      parseUserInput("Test retry"),
      createInitialPlaythrough("Retry Test"),
      false
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(turn.narrative).toBe("Recovered");
  });

  it("retries once WITHOUT response_format when the server rejects JSON mode (400)", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("unsupported param: response_format", { status: 400 }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [{ message: { content: "{\"narrative\":\"No json mode\"}" } }]
        })
      );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );

    const { turn } = await provider.generateTurn(
      parseUserInput("hi"),
      createInitialPlaythrough("Fallback Test"),
      true
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const firstInit = (fetchImpl.mock.calls[0] as unknown[])[1] as RequestInit;
    const firstBody = JSON.parse(String(firstInit.body));
    expect(firstBody.response_format).toEqual({ type: "json_object" });
    const secondInit = (fetchImpl.mock.calls[1] as unknown[])[1] as RequestInit;
    const secondBody = JSON.parse(String(secondInit.body));
    expect(secondBody.response_format).toBeUndefined();
    expect(turn.narrative).toBe("No json mode");
  });

  it("surfaces the error when the no-response_format fallback also fails", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(new Response("unsupported param: response_format", { status: 400 }))
      .mockResolvedValueOnce(new Response("still broken", { status: 400 }));

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );

    await expect(
      provider.generateTurn(parseUserInput("hi"), createInitialPlaythrough("Fallback Test"), false)
    ).rejects.toThrow(/still broken/);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("reports real prompt usage measured from the assembled prompt", async () => {
    let sentChars = 0;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages?: Array<{ content: string }> };
      sentChars = (body.messages ?? []).reduce((sum, m) => sum + m.content.length, 0);
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify({ narrative: "Usage probe" }) } }]
      });
    });

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );

    const state = createInitialPlaythrough("Usage Test");
    state.promptSettings = {
      presetId: "test",
      presetName: "Test",
      modules: {
        turn: [{
          id: "mod_test",
          name: "Test module",
          description: "test",
          content: "You are a meticulous test narrator. ".repeat(12),
          order: 1,
          enabled: true
        }],
        seed: [],
        sheet: [],
        summary: []
      }
    };
    const { turn, promptUsage } = await provider.generateTurn(
      parseUserInput("Check the meter"),
      state,
      false
    );

    expect(turn.narrative).toBe("Usage probe");
    expect(promptUsage).toBeDefined();
    if (!promptUsage) return;

    // Total equals the segment sum and tracks the real payload size (chars/4)
    const sumBreakdown = Object.values(promptUsage.breakdown).reduce((a, b) => a + b, 0);
    expect(promptUsage.estimated).toBe(sumBreakdown);
    expect(promptUsage.estimated).toBeGreaterThan(sentChars / 4 - 64);
    expect(promptUsage.estimated).toBeLessThan(sentChars / 4 + 64);

    // Regression: output format and state summary are real magnitudes, not ~1 token
    expect(promptUsage.breakdown.outputFormat).toBeGreaterThan(1000);
    expect(promptUsage.breakdown.stateSummary).toBeGreaterThan(100);
    expect(promptUsage.breakdown.modules).toBeGreaterThan(0);
  });

  it("scenario-seed prompt embeds a JSON example that parses (escaped newlines in content)", async () => {
    let sentPrompt = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      sentPrompt = body.messages[0]?.content ?? "";
      return jsonResponse({
        choices: [
          {
            message: {
              content: JSON.stringify({
                locations: [
                  {
                    id: "loc_start",
                    name: "Start",
                    description: "A small starting spot.",
                    state: "",
                    icon: "🏠",
                    connections: []
                  }
                ],
                character: {
                  name: "Mira",
                  content: "[Species]: Human\n\n[Body]\n- Height: tall"
                },
                quest: { id: "quest_1", name: "First Quest", summary: "Do a thing." },
                items: [],
                startingFlags: [],
                npcs: []
              })
            }
          }
        ]
      });
    });

    const provider = new OpenAICompatibleProvider(testConfig({}), fetchImpl as unknown as typeof fetch);
    await provider.generateScenarioSeed({
      name: "Test World",
      setting: "A quiet starting village."
    });

    // Extract the JSON example block between the shape marker and the last '}'.
    const shapeMarker = "Return ONLY a JSON object with this exact shape:";
    const markerAt = sentPrompt.indexOf(shapeMarker);
    expect(markerAt).toBeGreaterThan(-1);
    const jsonStart = sentPrompt.indexOf("{", markerAt);
    const jsonEnd = sentPrompt.lastIndexOf("}");
    const example = sentPrompt.slice(jsonStart, jsonEnd + 1);

    expect(() => JSON.parse(example)).not.toThrow();
  });

  it("character-sheet prompt embeds a valid JSON example (escaped newlines, no drift)", async () => {
    let sentPrompt = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      sentPrompt = b.messages[0]?.content ?? "";
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ content: "[Species]: Human" }) } }] });
    });
    const provider = new OpenAICompatibleProvider(testConfig({}), fetchImpl as unknown as typeof fetch);
    await provider.generateCharacterSheet(
      { name: "Shopkeep", description: "A friendly shopkeeper.", disposition: "friendly" },
      "Setting: Town\nContent Rating: mature\nPlayer Character: Hero",
      undefined,
      undefined,
      NSFW_CHARACTER_FORMAT
    );
    const marker = "Return ONLY a JSON object with this exact shape:";
    const start = sentPrompt.indexOf(marker);
    expect(start).toBeGreaterThan(-1);
    const jsonStart = sentPrompt.indexOf("{", start);
    const jsonEnd = sentPrompt.lastIndexOf("}");
    expect(() => JSON.parse(sentPrompt.slice(jsonStart, jsonEnd + 1))).not.toThrow();
    expect(sentPrompt).toContain("[Species]");
    expect(sentPrompt).toContain("[Sexual Capabilities]");
    expect(sentPrompt).toContain("in this order: [Species]");
  });

  it("brainstorm prompt follows the target character format instead of a hardcoded list", async () => {
    let sentPrompt = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      sentPrompt = b.messages[0]?.content ?? "";
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ reply: "ok" }) } }] });
    });
    const provider = new OpenAICompatibleProvider(testConfig({}), fetchImpl as unknown as typeof fetch);

    // Default format (10 sections, no [Sexual Capabilities]).
    await provider.brainstormCharacter(
      {
        character: { name: "Mira", content: "[Species]: Human\n\n[Personality]\n- Cheerful" },
        chatHistory: [],
        userMessage: "Make her more mysterious",
        format: DEFAULT_CHARACTER_FORMAT,
      },
      undefined
    );
    // The format's section order and instructions are injected.
    expect(sentPrompt).toContain("in this order: [Species]");
    expect(sentPrompt).toContain("Communication - Public");
    expect(sentPrompt).toContain("The character's species, ancestry, or type of being.");
    // The Default format has no [Sexual Capabilities], so the assistant must not demand it.
    expect(sentPrompt).not.toContain("[Sexual Capabilities]");
    // Inline sections are explained from the format, not hardcoded Species/Gender only.
    expect(sentPrompt).toContain("Sections marked inline");

    // NSFW format (11 sections) DOES include Sexual Capabilities guidance.
    await provider.brainstormCharacter(
      {
        character: { name: "Mira", content: "[Species]: Human" },
        chatHistory: [],
        userMessage: "Add kinks",
        format: NSFW_CHARACTER_FORMAT,
      },
      undefined
    );
    expect(sentPrompt).toContain("[Sexual Capabilities]");
    expect(sentPrompt).toContain("Femdom (giving)");
  });

  it("STORY SO FAR injects the meta-summary plus only the most recent verbatim chapters", () => {
    const pt = createInitialPlaythrough("Story So Far Test");
    pt.chapters = [
      { id: "ch_1", name: "C1", shortDescription: "s", fullSummary: "FULL1 body", turnRange: { start: 1, end: 1 }, messageIds: [], memoryEventIds: [], createdAt: "2026-01-01T00:00:00.000Z" },
      { id: "ch_2", name: "C2", shortDescription: "s", fullSummary: "FULL2 body", turnRange: { start: 2, end: 2 }, messageIds: [], memoryEventIds: [], createdAt: "2026-01-02T00:00:00.000Z" },
      { id: "ch_3", name: "C3", shortDescription: "s", fullSummary: "FULL3 body", turnRange: { start: 3, end: 3 }, messageIds: [], memoryEventIds: [], createdAt: "2026-01-03T00:00:00.000Z" },
      { id: "ch_4", name: "C4", shortDescription: "s", fullSummary: "FULL4 body", turnRange: { start: 4, end: 4 }, messageIds: [], memoryEventIds: [], createdAt: "2026-01-04T00:00:00.000Z" },
      { id: "ch_5", name: "C5", shortDescription: "s", fullSummary: "FULL5 body", turnRange: { start: 5, end: 5 }, messageIds: [], memoryEventIds: [], createdAt: "2026-01-05T00:00:00.000Z" }
    ];
    pt.storyMetaSummaries = [{
      id: "mch_1",
      chapterIds: ["ch_1", "ch_2"],
      turnRange: { start: 1, end: 2 },
      summary: "META rolling summary",
      createdAt: "2026-01-02T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z"
    }];

    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    const user = assembled.user;

    expect(user).toContain("STORY SO FAR:");
    expect(user).toContain("EARLIER STORY:\nMETA rolling summary");
    // Folded chapters (1,2) are NOT injected verbatim.
    expect(user).not.toContain("FULL1 body");
    expect(user).not.toContain("FULL2 body");
    // Only the last 3 uncompacted (ch_3, ch_4, ch_5) are verbatim.
    expect(user).toContain("FULL3 body");
    expect(user).toContain("FULL4 body");
    expect(user).toContain("FULL5 body");
    expect(user).toContain("RECENT CHAPTERS:");
    expect(assembled.promptUsage.breakdown.storySoFar).toBeGreaterThan(0);
  });

  it("STORY SO FAR is omitted entirely when there are no chapters or meta summaries", () => {
    const pt = createInitialPlaythrough("No Chapters Test");
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).not.toContain("STORY SO FAR:");
    expect(assembled.promptUsage.breakdown.storySoFar).toBe(0);
  });

  it("npcPromote guidance is honest about the starter sheet (no overpromising)", () => {
    const pt = createInitialPlaythrough("Guidance Test");
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.system).toContain("npcPromote");
    // The model-initiated path creates a starter sheet from the NPC's info —
    // the guidance must not claim the character gains full tracked state.
    expect(assembled.system).not.toContain("They gain full tracked state");
    expect(assembled.system).toContain("basic sheet built from their description");
    expect(assembled.system).toContain("npcAdd is the right tool");
  });

  it("sizes the scenario-seed max_tokens off the connection config (with a 4000 floor)", async () => {
    const sentBodies: Array<{ max_tokens?: number }> = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      sentBodies.push(JSON.parse(String(init?.body)) as { max_tokens?: number });
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(VALID_SEED) } }]
      });
    });

    // Connection configured above the floor → follows the config.
    const provider = new OpenAICompatibleProvider(
      testConfig({ maxTokens: 6000 }),
      fetchImpl as unknown as typeof fetch
    );
    await provider.generateScenarioSeed({ name: "Test World", setting: "A village." });

    // Connection configured below the floor → seed still gets the 4000 floor.
    const lowProvider = new OpenAICompatibleProvider(
      testConfig({ maxTokens: 800 }),
      fetchImpl as unknown as typeof fetch
    );
    await lowProvider.generateScenarioSeed({ name: "Test World", setting: "A village." });

    expect(sentBodies[0].max_tokens).toBe(6000);
    expect(sentBodies[1].max_tokens).toBe(4000);
  });

  it("retries generateScenarioSeed when the first completion body is empty", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        // Reasoning model cut off before producing a final answer.
        return jsonResponse({ choices: [{ message: { content: "" } }] });
      }
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(VALID_SEED) } }] });
    });

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const seed = await provider.generateScenarioSeed({ name: "Test World", setting: "A village." });

    expect(calls).toBe(2);
    expect(seed.character.name).toBe("Mira");
  });

  it("retries generateScenarioSeed when the first completion body is not JSON", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        // Proxy returned a 200 with a non-JSON body (e.g. an HTML error page).
        return new Response("<html>gateway hiccup</html>", { status: 200 });
      }
      return jsonResponse({ choices: [{ message: { content: JSON.stringify(VALID_SEED) } }] });
    });

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const seed = await provider.generateScenarioSeed({ name: "Test World", setting: "A village." });

    expect(calls).toBe(2);
    expect(seed.quest.name).toBe("First Quest");
  });

  it("retries generateTurn when the completion content is empty, then succeeds", async () => {
    let calls = 0;
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      calls += 1;
      if (calls === 1) {
        return jsonResponse({ choices: [{ message: { content: "" } }] });
      }
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ narrative: "The mist clears." }) } }] });
    });

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const { turn } = await provider.generateTurn(
      parseUserInput("Look around."),
      createInitialPlaythrough("Retry Turn Test"),
      true
    );

    expect(calls).toBe(2);
    expect(turn.narrative).toBe("The mist clears.");
  });

  it("still degrades to the placeholder when every generateTurn attempt is empty", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: "" } }] })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const { turn } = await provider.generateTurn(
      parseUserInput("Look around."),
      createInitialPlaythrough("Degrade Turn Test"),
      true
    );

    expect(fetchImpl).toHaveBeenCalledTimes(2); // initial + one retry (maxRetries=1)
    expect(turn.narrative).toBe("The provider returned an empty response.");
  });

  it("surfaces finish_reason on the turn result", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ narrative: "All good." }) }, finish_reason: "stop" }]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const result = await provider.generateTurn(
      parseUserInput("hi"),
      createInitialPlaythrough("FR Test"),
      true
    );

    expect(result.finishReason).toBe("stop");
  });

  it("reports truncation explicitly when the scenario seed is cut off at the token limit", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{
          // Truncated JSON — extraction can't repair unbalanced braces.
          message: { content: '{"locations": [{"id": "loc_a", "name": "A"' },
          finish_reason: "length"
        }]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    await expect(
      provider.generateScenarioSeed({ name: "Test World", setting: "A village." })
    ).rejects.toThrow(/token limit/i);
  });

  it("replaces a blank narrative in valid JSON with the placeholder but keeps the statePatch", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{
          message: { content: JSON.stringify({ narrative: "", statePatch: { flagsAdd: ["met_mira"] } }) }
        }]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const { turn } = await provider.generateTurn(
      parseUserInput("hi"),
      createInitialPlaythrough("Blank Narrative Test"),
      true
    );

    expect(turn.narrative).toBe("The provider returned an empty response.");
    expect(turn.statePatch?.flagsAdd).toContain("met_mira");
  });

  it("treats whitespace-only narratives as empty", async () => {
    const fetchImpl = vi.fn(async () =>
      jsonResponse({
        choices: [{ message: { content: JSON.stringify({ narrative: "   " }) } }]
      })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const { turn } = await provider.generateTurn(
      parseUserInput("hi"),
      createInitialPlaythrough("Whitespace Test"),
      true
    );

    expect(turn.narrative).toBe("The provider returned an empty response.");
  });

  it("aborts the in-flight provider request when the caller's signal aborts", async () => {
    const controller = new AbortController();
    const fetchImpl = vi.fn((_url: unknown, init?: RequestInit) => {
      const signal = init?.signal as AbortSignal | undefined;
      if (signal?.aborted) {
        return Promise.reject(new DOMException("The operation was aborted.", "AbortError"));
      }
      // Hang until the request is aborted — like a slow model call.
      return new Promise<Response>((_resolve, reject) => {
        signal?.addEventListener("abort", () => reject(new DOMException("The operation was aborted.", "AbortError")));
      });
    });

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    const promise = provider.generateTurn(
      parseUserInput("hi"),
      createInitialPlaythrough("Abort Test"),
      true,
      controller.signal
    );

    controller.abort();

    await expect(promise).rejects.toThrow();
    // No retry after the abort — exactly one attempt.
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("does not start a provider request when the caller's signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchImpl = vi.fn(async () =>
      jsonResponse({ choices: [{ message: { content: JSON.stringify({ narrative: "x" }) } }] })
    );

    const provider = new OpenAICompatibleProvider(
      testConfig({}),
      fetchImpl as unknown as typeof fetch
    );
    await expect(
      provider.generateTurn(parseUserInput("hi"), createInitialPlaythrough("PreAbort Test"), true, controller.signal)
    ).rejects.toThrow("Request aborted by the client");

    expect(fetchImpl).not.toHaveBeenCalled();
  });
});

describe("extractJsonPayload with raw control characters", () => {
  it("parses JSON whose string values contain raw newlines (repair path)", () => {
    const raw = '{"content": "line1\nline2"}';
    const result = extractJsonPayload(raw);
    expect(result).toEqual({ content: "line1\nline2" });
  });

  it("repairs raw newlines inside strings within a markdown fence", () => {
    const raw = "```json\n" + '{"content": "line1\nline2"}' + "\n```";
    const result = extractJsonPayload(raw);
    expect(result).toEqual({ content: "line1\nline2" });
  });

  it("repairs raw newlines when JSON is extracted from surrounding prose", () => {
    const raw = "The result is:\n" + '{"content": "line1\nline2"}' + "\nHope that helps.";
    const result = extractJsonPayload(raw);
    expect(result).toEqual({ content: "line1\nline2" });
  });

  it("repairs tab and carriage-return control characters inside strings", () => {
    const raw = '{"a": "x\ty", "b": "u\r\nv"}';
    const result = extractJsonPayload(raw);
    expect(result).toEqual({ a: "x\ty", b: "u\r\nv" });
  });

  it("escapes other control characters inside strings as \\uXXXX", () => {
    const raw = '{"a": "x\u0001y"}';
    const result = extractJsonPayload(raw);
    expect(result).toEqual({ a: "x\u0001y" });
  });

  it("still returns null for non-JSON input", () => {
    expect(extractJsonPayload("This is not JSON.")).toBeNull();
    expect(extractJsonPayload("")).toBeNull();
  });
});

describe("repairRawControlChars", () => {
  it("leaves already-escaped sequences untouched", () => {
    const text = '{"content": "line1\\nline2"}';
    expect(repairRawControlChars(text)).toBe(text);
  });

  it("does not alter string values made of plain text", () => {
    const text = '{"a": "hello world"}';
    expect(repairRawControlChars(text)).toBe(text);
  });

  it("leaves newline whitespace between tokens alone", () => {
    const text = '{\n  "a": 1\n}';
    expect(repairRawControlChars(text)).toBe(text);
  });

  it("respects escaped quotes when tracking string boundaries", () => {
    const text = '{"a": "say \\"hi\\"\nnext"}';
    expect(JSON.parse(repairRawControlChars(text))).toEqual({ a: 'say "hi"\nnext' });
  });

  it("does not double-escape already-repaired sequences (idempotent)", () => {
    const repaired = repairRawControlChars('{"a": "x\ny"}');
    expect(repairRawControlChars(repaired)).toBe(repaired);
  });

  it("drops backslashes before invalid escape characters like \\' inside strings", () => {
    const text = '{"a": "Siren\\\'s Lament"}';
    expect(repairRawControlChars(text)).toBe('{"a": "Siren\'s Lament"}');
  });

  it("keeps valid escape sequences while dropping invalid ones", () => {
    const text = '{"a": "Siren\\\'s \\nLament \\"unquoted\\""}';
    // \\' -> ' (dropped), \\n -> kept, \\" -> kept
    expect(repairRawControlChars(text)).toBe('{"a": "Siren\'s \\nLament \\"unquoted\\""}');
  });
});

describe("resolveConnectionConfig", () => {
  const conn: ProviderConnection = {
    id: "local_lmstudio", label: "Local", baseUrl: "http://localhost:1234",
    apiKey: "abc", model: "my-model",
    temperature: 0.5, maxTokens: 900, contextWindow: 32768
  };
  it("maps a connection to a resolved config (normalizing the base URL)", () => {
    const cfg = resolveConnectionConfig(conn, {});
    expect(cfg.providerId).toBe("local_lmstudio");
    expect(cfg.baseUrl).toBe("http://localhost:1234/v1");
    expect(cfg.apiKey).toBe("abc");
    expect(cfg.model).toBe("my-model");
    expect(cfg.temperature).toBe(0.5);
    expect(cfg.timeoutMs).toBe(120_000);
  });
  it("honors timeout/retries env overrides", () => {
    const cfg = resolveConnectionConfig(conn, { BOBBINLOOM_TIMEOUT_MS: "30000", BOBBINLOOM_MAX_RETRIES: "3" });
    expect(cfg.timeoutMs).toBe(30000);
    expect(cfg.maxRetries).toBe(3);
  });
});

describe("presence-gated character injection", () => {
  const CLOTHED_TEMPLATE: CharacterTemplate = {
    id: "char_aya",
    name: "Aya",
    version: 1,
    summary: "Quiet swordswoman",
    startingClothing: [],
    content: [
      "[Species]: Human",
      "",
      "[Clothing]",
      "- Top: Torn silk blouse",
      "- Legs: Leather pants",
      "",
      "[Personality]",
      "- Quiet observer."
    ].join("\n")
  };

  it("renders same-location characters with their full sheet and no ABSENT block", () => {
    const pt = createInitialPlaythrough("Presence Present Test");
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("CHARACTER: Mira");
    expect(assembled.user).toContain("- Values competence, honesty, and self-control.");
    expect(assembled.user).not.toContain("ABSENT CHARACTERS");
  });

  it("demotes different-location characters to a one-liner and withholds the full sheet", () => {
    const pt = createInitialPlaythrough("Presence Absent Test");
    const miraId = pt.characters[0].id;
    pt.characters[0].currentLocationId = "loc_other";
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("ABSENT CHARACTERS");
    expect(assembled.user).toContain(`- Mira (${miraId}) — `);
    expect(assembled.user).toContain("at loc_other (loc_other)");
    // Full sheet withheld for the absent character.
    expect(assembled.user).not.toContain("- Values competence, honesty, and self-control.");
    expect(assembled.user).not.toContain("[RUNTIME STATE]");
  });

  it("includes towardPlayer brackets in the absent line only when non-neutral", () => {
    const pt = createInitialPlaythrough("Presence Toward Test");
    const miraId = pt.characters[0].id;
    pt.characters[0].currentLocationId = "loc_other";
    pt.characters[0].towardPlayer = "wary";
    const wary = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(wary.user).toContain(`- Mira (${miraId}) [wary] — `);
    pt.characters[0].towardPlayer = "neutral";
    const neutral = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(neutral.user).toContain(`- Mira (${miraId}) — `);
    expect(neutral.user).not.toContain("[neutral]");
  });

  it("appends conditions to the absent line only when non-empty", () => {
    const pt = createInitialPlaythrough("Presence Conditions Test");
    pt.characters[0].currentLocationId = "loc_other";
    pt.characters[0].conditions = ["🤕 wounded"];
    const wounded = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(wounded.user).toContain("🤕 wounded");
    pt.characters[0].conditions = [];
    const clean = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(clean.user).not.toContain("🤕 wounded");
  });

  it("treats a blank playthrough (all at 'unknown') as fully present", () => {
    const pt = createBlankPlaythrough("Presence Blank Test", EMPTY_MODULE_SET, "default", "Default", undefined, [DEMO_TEMPLATE]);
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("CHARACTER: Mira");
    expect(assembled.user).not.toContain("ABSENT CHARACTERS");
  });

  it("keeps all instance ids in the Allowed IDs line regardless of presence", () => {
    const pt = createInitialPlaythrough("Presence AllowedIds Test", EMPTY_MODULE_SET, "default", "Default", undefined, [DEMO_TEMPLATE, CLOTHED_TEMPLATE]);
    pt.characters[1].currentLocationId = "loc_other";
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain(`Characters: ${pt.characters[0].id}, ${pt.characters[1].id}`);
    expect(assembled.user).toContain("ABSENT CHARACTERS");
  });

  it("omits the raw [Clothing] section and renders a derived line when structured clothing exists", () => {
    const pt = createInitialPlaythrough("Presence Clothing Test", EMPTY_MODULE_SET, "default", "Default", undefined, [CLOTHED_TEMPLATE]);
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("CHARACTER: Aya");
    expect(assembled.user).not.toContain("[Clothing]");
    expect(assembled.user).toContain("Clothing: Top: Torn silk blouse; Legs: Leather pants");
    // The rest of the sheet is still injected verbatim.
    expect(assembled.user).toContain("[Personality]");
    expect(assembled.user).toContain("Quiet observer.");
  });

  it("injects the blob unchanged when the character wears no structured clothing", () => {
    const pt = createInitialPlaythrough("Presence NoClothing Test");
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("CHARACTER: Mira");
    expect(assembled.user).toContain("[Species]: Human");
    expect(assembled.user).toContain("[Personality]");
    expect(assembled.user).toContain("- Values competence, honesty, and self-control.");
  });

  it("documents the absent-character rules and characterClothing* patches in the system prompt", () => {
    const pt = createInitialPlaythrough("Presence System Test");
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.system).toContain("characterClothingAdd/Remove/SetState/Set: manage a character's worn clothing.");
    expect(assembled.system).toContain('The "Clothing" section is managed via characterClothing* patches');
    expect(assembled.system).toContain("A character is present at the scene only when their location matches the current location.");
    expect(assembled.system).toContain("Absent characters can still be affected by statePatch: characterLocation");
    expect(assembled.system).toContain("While a character is absent they may evolve off-screen");
  });
});

describe("CCv2 runtime macros (D10)", () => {
  const CCV2_TEMPLATE: CharacterTemplate = {
    id: "tmpl_ccv2_macro",
    name: "Mira",
    version: 1,
    summary: "",
    startingClothing: [],
    content: "{{char}} loves {{user}}",
    format: "ccv2"
  };

  const BL_MACRO_TEMPLATE: CharacterTemplate = {
    id: "tmpl_bl_macro",
    name: "Mira",
    version: 1,
    summary: "",
    startingClothing: [],
    content: "{{Char}} greets {{User}} warmly."
  };

  it("expands {{char}}/{{user}} for a CCv2-backed sheet at prompt build time", () => {
    const pt = createInitialPlaythrough("CCv2 Macro Test", EMPTY_MODULE_SET, "default", "Default", undefined, [CCV2_TEMPLATE]);
    pt.playerCharacter.name = "Anon";
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    // Sheet is rendered verbatim + macros expanded (D6/D10).
    expect(assembled.user).toContain("CHARACTER: Mira");
    expect(assembled.user).toContain("Mira loves Anon");
    // Raw macros never leak into the prompt.
    expect(assembled.user).not.toContain("{{char}}");
    expect(assembled.user).not.toContain("{{user}}");
  });

  it("expands macros in BL sheets too (shared path, case-insensitive)", () => {
    const pt = createInitialPlaythrough("BL Macro Test", EMPTY_MODULE_SET, "default", "Default", undefined, [BL_MACRO_TEMPLATE]);
    pt.playerCharacter.name = "Anon";
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("Mira greets Anon warmly.");
    expect(assembled.user).not.toContain("{{Char}}");
  });

  it("expands macros in the absent-character one-liner summary", () => {
    const pt = createInitialPlaythrough("CCv2 Absent Macro Test", EMPTY_MODULE_SET, "default", "Default", undefined, [CCV2_TEMPLATE]);
    pt.playerCharacter.name = "Anon";
    pt.characters[0].currentLocationId = "loc_other";
    const assembled = assembleTurnPrompt(parseUserInput("go"), pt, true);
    expect(assembled.user).toContain("ABSENT CHARACTERS");
    expect(assembled.user).not.toContain("{{char}}");
  });
});

describe("per-context prompt modules", () => {
  it("injects seed-context modules into the scenario-seed prompt but not the turn prompt", async () => {
    let sentPrompt = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      sentPrompt = body.messages[0]?.content ?? "";
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(VALID_SEED) } }]
      });
    });
    const provider = new OpenAICompatibleProvider(testConfig({}), fetchImpl as unknown as typeof fetch);

    const seedModule: PromptPresetModule = {
      id: "mod_seed",
      name: "Seed tone",
      description: "test",
      content: "SEED MARKER",
      order: 99,
      enabled: true
    };
    const turnModule: PromptPresetModule = {
      id: "mod_turn",
      name: "Turn tone",
      description: "test",
      content: "TURN MARKER",
      order: 98,
      enabled: true
    };

    await provider.generateScenarioSeed({ name: "Test World", setting: "A quiet starting village." }, undefined, [seedModule]);
    expect(sentPrompt).toContain("SEED MARKER");

    const state = createInitialPlaythrough("Context Isolation");
    state.promptSettings = {
      presetId: "test",
      presetName: "Test",
      modules: { turn: [turnModule], seed: [seedModule], sheet: [], summary: [] }
    };
    const assembled = assembleTurnPrompt(parseUserInput("go"), state, true);
    expect(assembled.system).toContain("TURN MARKER");
    expect(assembled.system).not.toContain("SEED MARKER");
  });

  it("makes the scenario-seed prompt cast-aware and names the lead companion", async () => {
    let sentPrompt = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      sentPrompt = body.messages[0]?.content ?? "";
      return jsonResponse({
        choices: [{ message: { content: JSON.stringify(VALID_SEED) } }]
      });
    });
    const provider = new OpenAICompatibleProvider(testConfig({}), fetchImpl as unknown as typeof fetch);

    await provider.generateScenarioSeed({
      name: "Test World",
      setting: "A quiet starting village.",
      cast: [{ name: "Mira", summary: "a fox companion" }]
    });
    expect(sentPrompt).toContain("EXISTING CAST");
    expect(sentPrompt).toContain("Mira");
    expect(sentPrompt).toContain("a fox companion");
    expect(sentPrompt).toContain("lead companion is Mira");
  });

  it("injects sheet-context modules into the character-sheet prompt", async () => {
    let sentPrompt = "";
    const fetchImpl = vi.fn(async (_url: unknown, init?: RequestInit) => {
      const b = JSON.parse(String(init?.body)) as { messages: Array<{ content: string }> };
      sentPrompt = b.messages[0]?.content ?? "";
      return jsonResponse({ choices: [{ message: { content: JSON.stringify({ content: "[Species]: Human" }) } }] });
    });
    const provider = new OpenAICompatibleProvider(testConfig({}), fetchImpl as unknown as typeof fetch);
    const sheetModule: PromptPresetModule = {
      id: "mod_sheet",
      name: "Sheet boundaries",
      description: "test",
      content: "SHEET MARKER: keep the sheet to its standard sections",
      order: 99,
      enabled: true
    };
    await provider.generateCharacterSheet(
      { name: "Shopkeep", description: "A friendly shopkeeper." },
      "Setting: Town",
      [sheetModule]
    );
    expect(sentPrompt).toContain("SHEET MARKER: keep the sheet to its standard sections");
  });

  it("migrates legacy flat-array promptSettings snapshots to turn modules", () => {
    const parsed = PlaythroughPromptSettingsSchema.parse({
      presetId: "default",
      presetName: "Default",
      modules: [
        { id: "mod_legacy", name: "Legacy module", description: "test", content: "content", order: 1, enabled: true }
      ]
    });
    expect(parsed.modules.turn).toHaveLength(1);
    expect(parsed.modules.turn[0].id).toBe("mod_legacy");
    expect(parsed.modules.seed).toEqual([]);
    expect(parsed.modules.sheet).toEqual([]);
    expect(parsed.modules.summary).toEqual([]);
  });
});
