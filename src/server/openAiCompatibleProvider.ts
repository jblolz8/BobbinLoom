import { toJsonExampleContent } from "../engine/characterSections";
import { buildFormatExample, buildFormatRules, formatSectionHeaders, resolveCharacterFormat } from "../engine/characterFormat";
import {
  AssistantTurnSchema,
  CharacterFormat,
  ParsedUserInput,
  Playthrough,
  ScenarioPreferences,
  ScenarioSeed,
  ScenarioSeedSchema
} from "../schemas";
import type {
  ChapterCompactionInput,
  CharacterBrainstormInput,
  CharacterBrainstormOutput,
  ProposedSectionChange,
  ProviderTurn
} from "./provider";
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
        return { turn: parsed.data, promptUsage, model: this.config.model, rawInput, rawOutput, finishReason };
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
        return { turn: { narrative, choices: choicesEnabled ? choices : undefined, statePatch }, promptUsage, model: this.config.model, rawInput, rawOutput, finishReason };
      }

      return {
        turn: { narrative: "The provider returned an empty response.", statePatch },
        promptUsage,
        model: this.config.model,
        rawInput,
        rawOutput,
        finishReason
      };
    }

    return {
      turn: { narrative: content || "The provider returned an empty response." },
      promptUsage,
      model: this.config.model,
      rawInput,
      rawOutput,
      finishReason
    };
  }

  async generateScenarioSeed(preferences: ScenarioPreferences, lorebookIds?: string[], signal?: AbortSignal, format?: CharacterFormat): Promise<ScenarioSeed> {
    const lorebookContext = buildLorebookContext(lorebookIds, preferences.setting ?? "", lorebookBudgetChars(this.config.maxTokens));
    const sheetExample = toJsonExampleContent(buildFormatExample(format));

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
      `    "content": "${sheetExample}"`,
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
      ...(preferences.cast && preferences.cast.length ? [
        "",
        "EXISTING CAST (already chosen — do NOT create new versions of these):",
        ...preferences.cast.map((c) => `- ${c.name}${c.summary ? ` — ${c.summary}` : ""}`),
        `The lead companion is ${preferences.cast[0].name}.`,
        `Set "character.name" to ${preferences.cast[0].name} and keep "character.content" minimal (the engine reuses the chosen card's existing sheet).`,
        "",
      ] : []),
      "Guidelines:",
      "- Write in a neutral tone; let the user's setting description carry the genre and atmosphere.",
      "- Provide 2 to 4 distinct connected locations (the first location is where the player starts).",
      "- Give locations realistic snake_case IDs with loc_ prefix (e.g. loc_tavern, loc_square).",
      "- Ensure connections form a valid graph using the loc_ IDs defined in the list.",
      "- Provide 1 starting companion character template with a complete character sheet in the content field. Write a compelling, detailed character sheet using the standard section headers: " + formatSectionHeaders(format).join(", ") + ".",
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
    signal?: AbortSignal,
    format?: CharacterFormat
  ): Promise<string> {
    const fmt = resolveCharacterFormat(format);
    const example = toJsonExampleContent(buildFormatExample(fmt));
    const rules = buildFormatRules(fmt);
    const prompt = [
      "You are a character sheet generator for a local RPG chat engine called BobbinLoom.",
      "Given a background NPC's basic info and the current story context, produce a detailed character sheet content blob.",
      "",
      "Return ONLY a JSON object with this exact shape:",
      "{",
      `  "content": "${example}"`,
      "}",
      "",
      "Rules:",
      `- The NPC is named "${npc.name}". Their current description is: "${npc.description}"${npc.disposition ? ` and their disposition is "${npc.disposition}".` : "."}`,
      "- Expand this into a full character sheet. Invent reasonable details that fit the story context.",
      "- The [Clothing] section, if present, should be a bulleted list describing what the character wears (- Top: ..., - Bottom: ..., - Feet: ...).",
      "- Match the tone and detail level of the story context.",
      "- The character should feel like they belong in this world.",
      rules,
      "",
      "STORY CONTEXT:",
      storyContext,
      "",
      "Return ONLY the JSON object. No markdown, no explanation.",
    ].join("\n");

    return this.executeSheetJsonRequest(prompt, signal, "The model did not return a valid character sheet.");
  }

  async refineCharacterSheet(
    currentContent: string,
    originalCardContent: string,
    feedback: string,
    storyContext: string,
    signal?: AbortSignal,
    format?: CharacterFormat
  ): Promise<string> {
    const fmt = resolveCharacterFormat(format);
    const example = toJsonExampleContent(buildFormatExample(fmt));
    const rules = buildFormatRules(fmt);
    const prompt = [
      "You are an expert character sheet editor for a local RPG chat engine called BobbinLoom.",
      "Your task is to refine and revise an existing BobbinLoom character sheet draft based on user feedback.",
      "",
      "Return ONLY a JSON object with this exact shape:",
      "{",
      `  "content": "${example}"`,
      "}",
      "",
      "CRITICAL INSTRUCTIONS FOR TARGETED EDITING:",
      "1. Apply the USER FEEDBACK precisely to the relevant sections or lines of the character sheet.",
      "2. PRESERVE all parts, sections, and details of the CURRENT DRAFT that were not criticized or targeted by the feedback verbatim. Do NOT unnecessarily rewrite, shuffle, or delete good existing sections.",
      "3. Keep the sheet conforming to the target format below.",
      rules,
      "4. The [Clothing] section, if present, should be a bulleted list describing what the character wears (- Top: ..., - Bottom: ..., - Feet: ...).",
      "5. Reference the ORIGINAL SOURCE CARD if additional source lore is needed.",
      "",
      "--- CURRENT DRAFT SHEET ---",
      currentContent,
      "",
      "--- ORIGINAL SOURCE CARD (REFERENCE) ---",
      originalCardContent,
      "",
      "--- USER FEEDBACK (APPLY THIS) ---",
      feedback,
      "",
      ...(storyContext && storyContext !== "(no additional context)" ? ["--- ADDITIONAL CONTEXT ---", storyContext, ""] : []),
      "Return ONLY the JSON object. No markdown, no explanation.",
    ].join("\n");

    return this.executeSheetJsonRequest(prompt, signal, "The model did not return a valid revised character sheet.");
  }

  async reformatCharacterSheet(
    currentContent: string,
    format: CharacterFormat,
    signal?: AbortSignal,
    feedback?: string
  ): Promise<string> {
    const fmt = resolveCharacterFormat(format);
    const example = toJsonExampleContent(buildFormatExample(fmt));
    const rules = buildFormatRules(fmt);
    const prompt = [
      "You are an expert character sheet editor for a local RPG chat engine called BobbinLoom.",
      "Restructure an existing character sheet to match a target format.",
      "",
      "Return ONLY a JSON object with this exact shape:",
      "{",
      `  "content": "${example}"`,
      "}",
      "",
      "TARGET FORMAT:",
      rules,
      "",
      "RULES:",
      "- Keep every established detail from the source sheet — do not lose or invent facts.",
      "- Ensure every section in the target format is present, in the given order. For a missing section, derive fitting content from the existing sheet, or write \"(not established)\" when nothing is known.",
      "- Preserve additional sections that carry real information; fold clearly redundant ones into the nearest matching section.",
      "- Sections marked inline are written as `[Name]: value` on one line; the rest use block form ([Name] followed by content lines).",
      "",
      ...(feedback ? ["USER GUIDANCE FOR THIS REVISION:", feedback, ""] : []),
      "--- CURRENT SHEET ---",
      currentContent,
      "",
      "Return ONLY the JSON object. No markdown, no explanation.",
    ].join("\n");

    return this.executeSheetJsonRequest(prompt, signal, "The model did not return a valid restructured character sheet.");
  }

  /** Shared `{ "content": "..." }` JSON request for the sheet generation,
   *  refinement, and reformatting methods. */
  private async executeSheetJsonRequest(
    prompt: string,
    signal: AbortSignal | undefined,
    errorPrefix: string
  ): Promise<string> {
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
    throw new Error(`${errorPrefix} Raw response snippet: "${errSnippet}"`);
  }

  async suggestCharacterTags(
    character: { name: string; content: string; creatorNotes?: string; currentTags?: string[]; guidance?: string },
    libraryTags: string[],
    signal?: AbortSignal
  ): Promise<string[]> {
    const systemPrompt = "You are an expert booru-style tagger for characters in BobbinLoom RPG. You must output a valid JSON object containing a 'tags' array.";
    const userPrompt = [
      "Given the character's details, current tags, and library taxonomy, generate a comprehensive list of recommended tags.",
      "",
      "Return ONLY a JSON object with this exact shape:",
      "{",
      '  "tags": ["species:elf", "rating:sfw", "female", "mage", "introvert", "fire-magic", "adventurer"]',
      "}",
      "",
      "TAGGING RULES & INSTRUCTIONS:",
      "1. COMPREHENSIVE TAGGING: Suggest between 6 and 16 strong, relevant tags capturing:",
      "   - Species/Race (e.g. species:elf, species:human, species:demon, species:cat-girl, species:android)",
      "   - Content Rating (e.g. rating:sfw, rating:nsfw, sfw, nsfw)",
      "   - Copyright / Franchise / Universe (e.g. copyright:original, copyright:<series>)",
      "   - Gender/Archetype (e.g. female, male, tomboy, tsundere, hero, villain)",
      "   - Occupation/Class (e.g. mage, knight, merchant, assassin, scholar)",
      "   - Personality Traits (e.g. stoic, cheerful, brooding, playful, sarcastic)",
      "   - Key Physical/Clothing Features (e.g. silver-hair, red-eyes, armored, cloaked)",
      "   - Abilities/Themes (e.g. pyromancy, swordsman, stealth, royalty, cyberpunk, fantasy)",
      "2. CURRENT TAGS: If current tags are provided, retain the accurate ones, but actively ADD new missing descriptive tags from the character sheet and creator notes.",
      "3. TAXONOMY REUSE: Reuse existing tags and prefixes from the LIBRARY TAXONOMY where appropriate, but feel free to introduce new specific tags when the character possesses distinct traits not in the taxonomy.",
      "4. FORMAT & NAMESPACES: Lowercase, concise (1-3 words max, kebab-case or space-separated). Use category prefixes (species:..., copyright:..., rating:...) when appropriate alongside general descriptive tags.",
      ...(character.guidance ? ["", `USER GUIDANCE: ${character.guidance}`] : []),
      "",
      `CHARACTER NAME: ${character.name || "Unnamed"}`,
      character.creatorNotes ? `CREATOR'S NOTES: ${character.creatorNotes}` : "",
      character.currentTags && character.currentTags.length > 0
        ? `CURRENT CARD TAGS: ${character.currentTags.join(", ")}`
        : "",
      "CHARACTER CONTENT / SHEET:",
      character.content || "(no content provided)",
      "",
      libraryTags.length > 0 ? `LIBRARY TAXONOMY (FOR REFERENCE / CONSISTENCY):\n${libraryTags.join(", ")}` : "",
      "",
      "Return ONLY the JSON object. No markdown, no explanation.",
    ].filter(Boolean).join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt }
    ];

    const maxTokens = Math.max(4000, this.config.maxTokens || 4000);

    // Attempt 1: Standard with response_format: { type: "json_object" }
    try {
      const bodyWithFormat: Record<string, unknown> = {
        model: this.config.model,
        messages,
        temperature: 0.5,
        max_tokens: maxTokens,
        response_format: { type: "json_object" }
      };

      const response = await this.executeRequest(bodyWithFormat, "/chat/completions", undefined, signal);
      const rawText = await response.text();
      let payload: {
        choices?: Array<{
          message?: { content?: string | null; reasoning_content?: string | null };
          text?: string | null;
          delta?: { content?: string | null };
          finish_reason?: string | null;
        }>;
        text?: string;
        content?: string;
      } = {};

      try {
        payload = JSON.parse(rawText) as typeof payload;
      } catch {
        // Fallback to plain text if endpoint returned non-JSON
      }

      const rawContent = (
        payload.choices?.[0]?.message?.content ??
        payload.choices?.[0]?.text ??
        payload.choices?.[0]?.delta?.content ??
        payload.choices?.[0]?.message?.reasoning_content ??
        payload.content ??
        payload.text ??
        rawText ??
        ""
      ).trim();

      const tags = parseTagsFromModelOutput(rawContent);
      if (tags.length > 0) {
        return tags;
      }
    } catch {
      // Fall through to Attempt 2
    }

    // Attempt 2: Fallback without response_format for models/proxies that don't support structured output
    const bodyFallback: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: 0.5,
      max_tokens: maxTokens
    };

    const fallbackResponse = await this.executeRequest(bodyFallback, "/chat/completions", undefined, signal);
    const fallbackRawText = await fallbackResponse.text();
    let fallbackPayload: {
      choices?: Array<{
        message?: { content?: string | null; reasoning_content?: string | null };
        text?: string | null;
        delta?: { content?: string | null };
        finish_reason?: string | null;
      }>;
      text?: string;
      content?: string;
    } = {};

    try {
      fallbackPayload = JSON.parse(fallbackRawText) as typeof fallbackPayload;
    } catch {
      // Plain text fallback
    }

    const finishReason = fallbackPayload.choices?.[0]?.finish_reason;
    const fallbackRawContent = (
      fallbackPayload.choices?.[0]?.message?.content ??
      fallbackPayload.choices?.[0]?.text ??
      fallbackPayload.choices?.[0]?.delta?.content ??
      fallbackPayload.choices?.[0]?.message?.reasoning_content ??
      fallbackPayload.content ??
      fallbackPayload.text ??
      fallbackRawText ??
      ""
    ).trim();

    const fallbackTags = parseTagsFromModelOutput(fallbackRawContent);
    if (fallbackTags.length > 0) {
      return fallbackTags;
    }

    const truncationHint = finishReason === "length"
      ? " (The model response was truncated due to token limit: finish_reason='length'. Please increase Max Tokens in Settings.)"
      : "";
    const errSnippet = fallbackRawContent ? fallbackRawContent.slice(0, 300) : "(empty response)";
    throw new Error(`The model did not return any recognized tags. Raw model output: "${errSnippet}"${truncationHint}`);
  }

  async brainstormCharacter(
    input: CharacterBrainstormInput,
    signal?: AbortSignal
  ): Promise<CharacterBrainstormOutput> {
    const c = input.character;
    const fmt = resolveCharacterFormat(input.format);
    const inlineSections = fmt.sections.filter((s) => s.inline).map((s) => s.name);
    const formatRules = [
      buildFormatRules(fmt),
      `- Sections marked inline (${inlineSections.join(", ")}) are written as [Name]: value on one line; the rest use block form ([Name] followed by content lines).`,
      "- In proposedChanges.sections, return ONLY the section body — never the [Header] itself.",
    ].join("\n");

    const contextParts: string[] = [
      "--- ACTIVE CHARACTER CARD ---",
      `Name: ${c.name || "(unnamed)"}`,
    ];
    if (c.creatorNotes) {
      contextParts.push(`Creator's Notes: ${c.creatorNotes}`);
    }
    if ((c.tags ?? []).length > 0) {
      contextParts.push(`Tags: ${c.tags!.join(", ")}`);
    }
    contextParts.push(`\n--- CURRENT CHARACTER SHEET CONTENT ---\n${c.content || "(empty sheet)"}`);

    if (input.includeOriginalCard && c.ccv2Content) {
      contextParts.push(`\n--- ORIGINAL CCV2 CARD (REFERENCE) ---\n${c.ccv2Content}`);
    }

    const systemPrompt = [
      "You are an expert character designer and creative co-writer for BobbinLoom, a local RPG chat engine.",
      "Your role is to brainstorm, refine, and co-create character cards with the user in a natural, multi-turn dialogue.",
      "",
      "BOBBINLOOM CHARACTER SHEET FORMAT RULES:",
      formatRules,
      "",
      "RESPONSE GUIDELINES:",
      "1. Reply conversationally, constructively, and creatively to the user's questions, feedback, or brainstorming ideas in the 'reply' field. Markdown formatting is encouraged.",
      "2. If proposing specific edits or additions to the character card, include them in 'proposedChanges':",
      "   - 'sections': array of objects { \"header\": \"SectionName\", \"body\": \"updated section body content WITHOUT the [SectionName] header\" }.",
      "   - 'tags': optional updated array of string tags if tag changes are suggested.",
      "   - 'creatorNotes': optional updated creator notes.",
      "   - 'name': optional updated character name.",
      "3. SURGICAL EDITING: When the user asks to modify specific attributes (e.g., 'Change her personality to be sarcastic', 'Update her outfit for winter', 'Add tea brewing to Likes'), return ONLY the affected section(s) in 'proposedChanges.sections'. Do NOT duplicate or rewrite untouched sections.",
      "4. If no direct card changes are being proposed (e.g. general brainstorming, answering lore questions, comparing ideas), set 'proposedChanges' to null or omit it.",
      "",
      "RESPONSE JSON FORMAT:",
      "{",
      '  "reply": "Conversational reply, advice, or suggestions here...",',
      '  "proposedChanges": {',
      '    "sections": [',
      '      { "header": "Personality", "body": "- Sarcastic and sharp-witted\\n- Secretly protective" }',
      "    ],",
      '    "tags": ["elf", "mage"]',
      "  }",
      "}",
      "",
      ...contextParts
    ].join("\n");

    const messages: ChatMessage[] = [
      { role: "system", content: systemPrompt }
    ];

    for (const msg of input.chatHistory) {
      if (msg.content) {
        messages.push({ role: msg.role, content: msg.content });
      }
    }
    messages.push({ role: "user", content: input.userMessage });

    const maxTokens = Math.max(4000, this.config.maxTokens || 4000);

    const body: Record<string, unknown> = {
      model: this.config.model,
      messages,
      temperature: 0.7,
      max_tokens: maxTokens,
      response_format: { type: "json_object" }
    };

    let rawContent = "";
    try {
      const response = await this.executeRequest(body, "/chat/completions", undefined, signal);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      rawContent = payload.choices?.[0]?.message?.content?.trim() ?? "";
    } catch {
      const bodyFallback = { ...body };
      delete bodyFallback.response_format;
      const response = await this.executeRequest(bodyFallback, "/chat/completions", undefined, signal);
      const payload = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      rawContent = payload.choices?.[0]?.message?.content?.trim() ?? "";
    }

    const extracted = extractJsonPayload(rawContent);

    if (extracted && typeof extracted === "object") {
      const extObj = extracted as Record<string, unknown>;
      const reply = typeof extObj.reply === "string"
        ? extObj.reply
        : (typeof extObj.message === "string" ? extObj.message : "");
      let proposedChanges: CharacterBrainstormOutput["proposedChanges"] = undefined;

      if (extObj.proposedChanges && typeof extObj.proposedChanges === "object") {
        const propObj = extObj.proposedChanges as Record<string, unknown>;
        const sections: ProposedSectionChange[] = [];

        if (Array.isArray(propObj.sections)) {
          for (const s of propObj.sections) {
            if (s && typeof s === "object" && typeof s.header === "string" && typeof s.body === "string") {
              sections.push({
                header: s.header.replace(/^\[|\]$/g, "").trim(),
                body: s.body.trim()
              });
            }
          }
        }

        const tags = Array.isArray(propObj.tags)
          ? sanitizeTags(propObj.tags)
          : undefined;

        const creatorNotes = typeof propObj.creatorNotes === "string" && propObj.creatorNotes.trim()
          ? propObj.creatorNotes.trim()
          : undefined;

        const name = typeof propObj.name === "string" && propObj.name.trim()
          ? propObj.name.trim()
          : undefined;

        const fullContent = typeof propObj.fullContent === "string" && propObj.fullContent.trim()
          ? propObj.fullContent.trim()
          : undefined;

        if (sections.length > 0 || (tags && tags.length > 0) || creatorNotes || name || fullContent) {
          proposedChanges = {
            ...(sections.length > 0 ? { sections } : {}),
            ...(tags && tags.length > 0 ? { tags } : {}),
            ...(creatorNotes ? { creatorNotes } : {}),
            ...(name ? { name } : {}),
            ...(fullContent ? { fullContent } : {})
          };
        }
      }

      if (reply || proposedChanges) {
        return {
          reply: reply || "Here are the suggested changes for the character sheet.",
          proposedChanges
        };
      }
    }

    return {
      reply: rawContent || "No response received from the model.",
      proposedChanges: undefined
    };
  }

  async summarizeChapter(transcript: string, signal?: AbortSignal): Promise<{ name: string; shortDescription: string; fullSummary: string }> {
    const summaryPrompt = [
      "You are a story archivist. Below is the transcript of a story chapter.",
      "Produce a JSON object with:",
      "- name: a short title for the chapter (2-6 words)",
      "- shortDescription: one sentence summary",
      "- fullSummary: a narrative summary of the key events (~300 words). Focus on what actually happened — key events, character moments, location changes, quest developments. Do not speculate about unresolved threads.",
      "- Write in a clear, neutral tone. Describe events factually — what happened, who was involved, and how it changed the situation.",
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

  async compactStorySoFar(input: ChapterCompactionInput, signal?: AbortSignal): Promise<{ summary: string }> {
    const parts: string[] = [
      "You are a story archivist maintaining a rolling summary of an ongoing roleplay story.",
      "Below is the prior rolling summary, the endings of chapters that must now be folded in,",
      "and a list of important plot events.",
      "- Write in a clear, neutral tone. Describe events factually — what happened, who was involved, and how it changed the situation.",
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

function sanitizeTags(rawList: unknown[]): string[] {
  return rawList
    .filter((t): t is string => typeof t === "string" && t.trim().length > 0)
    .map((t) => t.trim().toLowerCase().replace(/^[#\s]+/, ""))
    .filter((t) => t.length > 0 && t.length < 50)
    .filter((t, idx, arr) => arr.indexOf(t) === idx);
}

function parseTagsFromCleanString(rawContent: string): string[] {
  if (!rawContent || !rawContent.trim()) return [];

  // Strategy 1: Standard JSON extraction
  const extracted = extractJsonPayload(rawContent);
  if (extracted) {
    if (Array.isArray(extracted)) {
      const sanitized = sanitizeTags(extracted);
      if (sanitized.length > 0) return sanitized;
    }
    if (typeof extracted === "object" && extracted !== null) {
      for (const key of ["tags", "suggestedTags", "recommendedTags", "characterTags", "results", "output"]) {
        if (key in extracted && Array.isArray((extracted as Record<string, unknown>)[key])) {
          const sanitized = sanitizeTags((extracted as Record<string, unknown>)[key] as unknown[]);
          if (sanitized.length > 0) return sanitized;
        }
      }
      const values = Object.values(extracted);
      for (const v of values) {
        if (Array.isArray(v)) {
          const sanitized = sanitizeTags(v);
          if (sanitized.length > 0) return sanitized;
        }
      }
    }
  }

  // Strategy 2: Look for JSON array in text [ "tag1", "tag2", ... ]
  const arrayMatch = rawContent.match(/\[\s*(?:"[^"]*"|'[^']*'|[\w-]+)(?:\s*,\s*(?:"[^"]*"|'[^']*'|[\w-]+))*\s*\]/);
  if (arrayMatch) {
    try {
      const parsed = JSON.parse(arrayMatch[0].replace(/'/g, '"'));
      if (Array.isArray(parsed)) {
        const sanitized = sanitizeTags(parsed);
        if (sanitized.length > 0) return sanitized;
      }
    } catch {
      // continue to next fallback strategy
    }
  }

  // Strategy 3: Line-based bullet extraction (e.g. "- female", "1. elf", "* mage")
  const lines = rawContent.split(/\r?\n/);
  const lineTags: string[] = [];
  for (const line of lines) {
    const trimmed = line.trim();
    const bulletMatch = trimmed.match(/^(?:[-*•+]|\d+\.)\s*["']?([^"',\n]+)["']?/);
    if (bulletMatch?.[1]) {
      const tag = bulletMatch[1].trim();
      if (tag && tag.length < 40 && !tag.toLowerCase().includes("tags:")) {
        lineTags.push(tag);
      }
    }
  }
  if (lineTags.length >= 2) {
    const sanitized = sanitizeTags(lineTags);
    if (sanitized.length > 0) return sanitized;
  }

  // Strategy 4: Comma-separated list
  const commaSeparated = rawContent
    .replace(/^.*tags:?\s*/i, "")
    .split(/[,;\n]/)
    .map((t) => t.trim().replace(/^["'\s]+|["'\s]+$/g, ""))
    .filter((t) => t && t.length > 1 && t.length < 35 && !t.includes("{") && !t.includes("}"));
  if (commaSeparated.length >= 2) {
    const sanitized = sanitizeTags(commaSeparated);
    if (sanitized.length > 0) return sanitized;
  }

  return [];
}

export function parseTagsFromModelOutput(rawContent: string): string[] {
  if (!rawContent || !rawContent.trim()) return [];

  // If content contains reasoning tags (<think>...</think>), test content after </think> first
  if (rawContent.includes("</think>")) {
    const afterThink = rawContent.split("</think>")[1]?.trim();
    if (afterThink) {
      const parsedAfter = parseTagsFromCleanString(afterThink);
      if (parsedAfter.length > 0) return parsedAfter;
    }
  }

  const cleanContent = rawContent.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  if (cleanContent) {
    const parsed = parseTagsFromCleanString(cleanContent);
    if (parsed.length > 0) return parsed;
  }

  // Fallback to original raw content
  return parseTagsFromCleanString(rawContent);
}
