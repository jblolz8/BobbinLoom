import { CHARACTER_SHEET_EXAMPLE, toJsonExampleContent } from "../engine/characterSections";
import {
  AssistantTurnSchema,
  ParsedUserInput,
  Playthrough,
  PromptPresetModule,
  ScenarioPreferences,
  ScenarioSeed,
  ScenarioSeedSchema
} from "../schemas";
import type { ChapterCompactionInput, ProviderTurn } from "./provider";
import type { ResolvedProviderConfig } from "./providerConfig";
import { buildLorebookContext, lorebookBudgetChars } from "./lorebookContext";
import { completionValidator, extractJsonPayload, repairRawControlChars } from "./provider/patchParser";
import { assembleTurnPrompt, renderModules } from "./provider/promptBuilder";
import { requestWithRetry } from "./provider/openaiClient";

export { extractJsonPayload, repairRawControlChars } from "./provider/patchParser";
export { assembleTurnPrompt, summarizePlaythrough, renderModules, buildSystemPrompt, buildUserPrompt } from "./provider/promptBuilder";

type ChatMessage = {
  role: "system" | "user" | "assistant";
  content: string;
};

export class OpenAICompatibleProvider {
  constructor(
    private readonly config: ResolvedProviderConfig,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  private async executeRequest(
    body: Record<string, unknown>,
    path: string = "/chat/completions",
    validate?: (text: string) => string | null,
    signal?: AbortSignal
  ): Promise<Response> {
    return requestWithRetry(this.config, this.fetchImpl, body, path, validate, signal);
  }

  async generateTurn(
    input: ParsedUserInput,
    state: Playthrough,
    choicesEnabled: boolean,
    signal?: AbortSignal
  ): Promise<ProviderTurn> {
    const queryMessages = state.messages.filter(m => !m.hidden).slice(-4);
    const queryText = queryMessages.map(m => m.content).join("\n");
    const queryEmbeddings = queryText
      ? await this.embedTexts([queryText])
      : [[]];
    const queryEmbedding = queryEmbeddings[0] ?? [];

    const { system, user, promptUsage } = assembleTurnPrompt(input, state, choicesEnabled, queryEmbedding);

    const messages: ChatMessage[] = [
      { role: "system", content: system },
      { role: "user", content: user }
    ];

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: this.config.temperature,
      max_tokens: this.config.maxTokens,
      response_format: { type: "json_object" }
    };

    const rawInput = JSON.stringify(body);
    const response = await this.executeRequest(body, "/chat/completions", completionValidator, signal);
    const rawOutput = await response.text();
    let payload: { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }> } = { choices: [] };
    try {
      payload = JSON.parse(rawOutput) as typeof payload;
    } catch {
      // Non-JSON body survived retries
    }

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const finishReason = payload.choices?.[0]?.finish_reason ?? null;
    const extracted = extractJsonPayload(content);

    if (extracted) {
      const parsed = AssistantTurnSchema.safeParse(extracted);
      if (parsed.success && parsed.data.narrative.trim()) {
        if (!choicesEnabled) {
          delete parsed.data.choices;
        }
        return { turn: parsed.data, promptUsage, rawInput, rawOutput, finishReason };
      }

      const extractedObj = extracted as Record<string, unknown>;
      const narrative = typeof extractedObj.narrative === "string" && extractedObj.narrative.trim() ? extractedObj.narrative : "";
      const choices = Array.isArray(extractedObj.choices)
        ? extractedObj.choices.filter((c): c is string => typeof c === "string")
        : undefined;
      const statePatch = typeof extractedObj.statePatch === "object" && extractedObj.statePatch !== null
        ? extractedObj.statePatch
        : undefined;

      if (narrative) {
        return { turn: { narrative, choices: choicesEnabled ? choices : undefined, statePatch }, promptUsage, rawInput, rawOutput, finishReason };
      }

      return {
        turn: { narrative: "The provider returned an empty response.", statePatch },
        promptUsage,
        rawInput,
        rawOutput,
        finishReason
      };
    }

    return {
      turn: { narrative: content || "The provider returned an empty response." },
      promptUsage,
      rawInput,
      rawOutput,
      finishReason
    };
  }

  async generateScenarioSeed(preferences: ScenarioPreferences, lorebookIds?: string[], modules?: PromptPresetModule[], signal?: AbortSignal): Promise<ScenarioSeed> {
    const lorebookContext = buildLorebookContext(lorebookIds, preferences.setting ?? "", lorebookBudgetChars(this.config.maxTokens));
    const seedModules = renderModules(modules);

    const prompt = [
      "You are a scenario generator for a local RPG chat engine called BobbinLoom.",
      "Generate a starting scenario seed based on the user's preferences below.",
      "",
      "Return ONLY a JSON object with this exact shape:",
      "{",
      '  "locations": [',
      '    { "id": "loc_shortname", "name": "Location Name", "description": "What this place is.", "state": "", "icon": "🏠", "connections": ["loc_other_id"] }',
      "  ],",
      '  "character": {',
      '    "name": "Character Name",',
      `    "content": "${toJsonExampleContent(CHARACTER_SHEET_EXAMPLE)}"`,
      "  },",
      '  "quest": {',
      '    "id": "quest_shortname",',
      '    "name": "Quest Name",',
      '    "summary": "One-line quest summary."',
      "  },",
      '  "items": [',
      '    { "id": "item_id", "name": "Item Name", "type": "weapon", "description": "What it does.", "quantity": 1 }',
      "  ],",
      '  "startingFlags": [],',
      '  "npcs": [',
      '    { "name": "Borg", "description": "Gruff blacksmith at the forge.", "disposition": "gruff" }',
      "  ],",
      '  "openingText": "Setting the stage: 2-3 sentences of introduction to the situation."',
      "}",
      "",
      "USER PREFERENCES:",
      `Title / Concept: ${preferences.name}`,
      preferences.setting ? `Setting: ${preferences.setting}` : "",
      "",
      ...(lorebookContext ? [lorebookContext, ""] : []),
      ...(seedModules ? [seedModules, ""] : []),
      "Guidelines:",
      "- Provide 2 to 4 distinct connected locations (the first location is where the player starts).",
      "- Give locations realistic snake_case IDs with loc_ prefix (e.g. loc_tavern, loc_square).",
      "- Ensure connections form a valid graph using the loc_ IDs defined in the list.",
      "- Provide 1 starting companion character template with a complete character sheet in the content field. Write a compelling, detailed character sheet using standard section headers ([Species], [Gender], [Body], [Appearance], [Clothing], [Personality], [Communication - Public], [Communication - Private], [Likes], [Dislikes]).",
      "- The companion's [Clothing] section should describe what they wear using slot-style bullets (- Top: ..., - Bottom: ..., - Feet: ...).",
      "- Provide 1 clear starting quest with a snake_case id (quest_ prefix).",
      "- Provide 2 to 4 starting items with snake_case IDs (item_ prefix), unique names, type words, descriptions, and quantities (1-5).",
      "- Provide 0 to 2 simple background NPCs with names, one-line descriptions, and optional dispositions.",
      "- Make openingText engaging, setting up immediate atmosphere and context for the player.",
      "- Return ONLY the JSON object. No markdown, no explanation."
    ].filter(Boolean).join("\n");

    const messages: ChatMessage[] = [
      { role: "user", content: prompt }
    ];

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: 0.8,
      max_tokens: Math.max(4000, this.config.maxTokens),
      response_format: { type: "json_object" }
    };

    const response = await this.executeRequest(body, "/chat/completions", completionValidator, signal);
    const rawOutput = await response.text();
    let payload: { choices?: Array<{ message?: { content?: string | null }; finish_reason?: string | null }> } = { choices: [] };
    try {
      payload = JSON.parse(rawOutput) as typeof payload;
    } catch {
      // Non-JSON body
    }

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const finishReason = payload.choices?.[0]?.finish_reason ?? null;
    const extracted = extractJsonPayload(content);

    if (extracted) {
      const parsed = ScenarioSeedSchema.safeParse(extracted);
      if (parsed.success) return parsed.data;

      if (parsed.error) {
        throw new Error(`Generated scenario failed validation: ${parsed.error.issues.map((i) => `${i.path.join(".") || "root"}: ${i.message}`).join("; ")}`);
      }
    }

    const snippet = content ? content.slice(0, 300) : "(empty response)";
    const truncationHint = finishReason === "length"
      ? " The response was cut off at the token limit (finish_reason: \"length\") — raise Max Tokens for this connection in Settings and try again."
      : "";
    throw new Error(
      `The model did not return a valid scenario. Raw response snippet: "${snippet}"${truncationHint}`
    );
  }

  async generateCharacterSheet(
    npc: { name: string; description: string; disposition?: string },
    storyContext: string,
    modules?: PromptPresetModule[],
    signal?: AbortSignal
  ): Promise<string> {
    const sheetModules = renderModules(modules);
    const prompt = [
      "You are a character sheet generator for a local RPG chat engine called BobbinLoom.",
      "Given a background NPC's basic info and the current story context, produce a detailed character sheet content blob.",
      "",
      "Return ONLY a JSON object with this exact shape:",
      "{",
      `  "content": "${toJsonExampleContent(CHARACTER_SHEET_EXAMPLE)}"`,
      "}",
      "",
      "Rules:",
      `- The NPC is named "${npc.name}". Their current description is: "${npc.description}"${npc.disposition ? ` and their disposition is "${npc.disposition}".` : "."}`,
      "- Expand this into a full character sheet. Invent reasonable details that fit the story context — species, body type, appearance, personality, communication style, likes, and dislikes.",
      "- Use the standard section headers: [Species], [Gender], [Body], [Appearance], [Clothing], [Personality], [Communication - Public], [Communication - Private], [Likes], [Dislikes].",
      "- Match the tone and detail level of the story context.",
      "- The [Clothing] section should be a bulleted list describing what the character wears. Use slot-style bullets (- Top: ..., - Bottom: ..., - Feet: ...).",
      "- The character should feel like they belong in this world. Use the story context to ground their details.",
      "",
      ...(sheetModules ? [sheetModules] : []),
      "",
      "STORY CONTEXT:",
      storyContext,
      "",
      "Return ONLY the JSON object. No markdown, no explanation.",
    ].join("\n");

    const messages: ChatMessage[] = [
      { role: "user", content: prompt }
    ];

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: 0.7,
      max_tokens: Math.min(4000, this.config.maxTokens),
      response_format: { type: "json_object" }
    };

    const response = await this.executeRequest(body, "/chat/completions", undefined, signal);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const rawContent = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const extracted = extractJsonPayload(rawContent);

    if (extracted && typeof extracted === "object" && extracted !== null && "content" in extracted) {
      const sheetContent = (extracted as Record<string, unknown>).content;
      if (typeof sheetContent === "string" && sheetContent.trim()) {
        return sheetContent.trim();
      }
    }

    const errSnippet = rawContent ? rawContent.slice(0, 300) : "(empty response)";
    throw new Error(
      `The model did not return a valid character sheet. Raw response snippet: "${errSnippet}"`
    );
  }

  async summarizeChapter(transcript: string, modules?: PromptPresetModule[], signal?: AbortSignal): Promise<{ name: string; shortDescription: string; fullSummary: string }> {
    const summaryModules = renderModules(modules);
    const summaryPrompt = [
      "You are a story archivist. Below is the transcript of a story chapter.",
      "Produce a JSON object with:",
      "- name: a short title for the chapter (2-6 words)",
      "- shortDescription: one sentence summary",
      "- fullSummary: a narrative summary of the key events (~300 words). Focus on what actually happened — key events, character moments, location changes, quest developments. Do not speculate about unresolved threads.",
      "",
      ...(summaryModules ? [summaryModules] : []),
      "",
      "TRANSCRIPT:",
      transcript,
      "",
      "Return ONLY the JSON object, nothing else."
    ].join("\n");

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: "system", content: summaryPrompt }
      ],
      temperature: 0.3,
      max_tokens: this.config.maxTokens,
      response_format: { type: "json_object" }
    };

    const response = await this.executeRequest(body, "/chat/completions", undefined, signal);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    const extracted = extractJsonPayload(content);

    if (extracted) {
      const obj = extracted as Record<string, unknown>;
      const name = typeof obj.name === "string" ? obj.name.trim() : "Untitled Chapter";
      const shortDescription = typeof obj.shortDescription === "string" ? obj.shortDescription.trim() : "";
      const fullSummary = typeof obj.fullSummary === "string" ? obj.fullSummary.trim() : "";
      if (name && fullSummary) {
        return { name, shortDescription, fullSummary };
      }
    }

    return { name: "Untitled Chapter", shortDescription: "", fullSummary: content || "No summary available." };
  }

  async compactStorySoFar(input: ChapterCompactionInput, modules?: PromptPresetModule[], signal?: AbortSignal): Promise<{ summary: string }> {
    const summaryModules = renderModules(modules);
    const parts: string[] = [
      "You are a story archivist maintaining a rolling summary of an ongoing roleplay story.",
      "Below is the prior rolling summary, the endings of chapters that must now be folded in,",
      "and a list of important plot events.",
      "",
      ...(summaryModules ? [summaryModules] : []),
      "",
      "PRIOR SUMMARY:",
      input.priorSummary || "(none yet)",
      "",
      "CHAPTERS TO FOLD IN:",
    ];
    if (input.chapterTranscriptions.length === 0 && input.importantEvents.length === 0) {
      parts.push("(none — just refresh/continue the prior summary)");
    }
    for (const ch of input.chapterTranscriptions) {
      parts.push(`- ${ch.name}: ${ch.fullSummary}`);
    }
    if (input.importantEvents.length > 0) {
      parts.push("", "IMPORTANT EVENTS (must be preserved):");
      for (const ev of input.importantEvents) {
        parts.push(`- T${ev.turn} [${ev.type}] ${ev.summary}`);
      }
    }
    parts.push(
      "",
      "Write the continuation/consolidation of the PRIOR SUMMARY that now also covers the CHAPTERS TO FOLD IN.",
      "Reflect the important events. Do not re-state what the PRIOR SUMMARY already covers in detail —",
      "only record new developments and keep continuity.",
      "Return the consolidated story-so-far as a single cohesive paragraph (~250-350 words).",
      "Return ONLY the summary text, no JSON."
    );

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages: [
        { role: "system", content: parts.join("\n") }
      ],
      temperature: 0.3,
      max_tokens: this.config.maxTokens
    };

    const response = await this.executeRequest(body, "/chat/completions", undefined, signal);
    const payload = (await response.json()) as {
      choices?: Array<{ message?: { content?: string } }>;
    };

    const content = payload.choices?.[0]?.message?.content?.trim() ?? "";
    if (content) {
      return { summary: content };
    }
    throw new Error("compactStorySoFar: empty response from provider");
  }

  async embedTexts(texts: string[]): Promise<number[][]> {
    if (texts.length === 0) return [];

    const body: Record<string, unknown> = {
      model: this.config.model,
      input: texts,
    };

    try {
      const response = await this.executeRequest(body, "/embeddings");
      const payload = (await response.json()) as {
        data?: Array<{ embedding?: number[] }>;
      };

      if (payload.data && Array.isArray(payload.data)) {
        return payload.data.map((item) => item.embedding ?? []);
      }
      return [];
    } catch (error) {
      console.error(`embedTexts failed: ${error instanceof Error ? error.message : String(error)}`);
      return [];
    }
  }
}
