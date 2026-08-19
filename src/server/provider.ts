import { buildMockAssistantTurn } from "../engine/engine";
import type { AssistantTurn, ParsedUserInput, Playthrough, PromptPresetModule, ScenarioPreferences, ScenarioSeed } from "../schemas";

/** Per-segment token estimates (chars/4) of the prompt actually sent to the model. */
export type PromptUsageBreakdown = {
  modules: number;
  outputFormat: number;
  lorebook: number;
  storySoFar: number;
  stateSummary: number;
  recentMessages: number;
  memoryEvents: number;
  lorebookDepth: number;
  userInput: number;
};

export type PromptUsage = {
  estimated: number;
  breakdown: PromptUsageBreakdown;
};

export type ChapterCompactionInput = {
  /** Existing meta-summary text, or null when the caller is building the first
   *  post-seed fold. The seed itself (first compaction) promotes a chapter's
   *  fullSummary directly and never calls the provider. */
  priorSummary: string | null;
  chapterTranscriptions: { name: string; fullSummary: string }[];
  importantEvents: { type: string; summary: string; importance: number; turn: number }[];
};

/** Most-recent chapters injected verbatim into STORY SO FAR; older ones fold into
 *  the single rolling meta-summary (see ChapterMetaSummary). */
export const VERBATIM_CHAPTER_LIMIT = 3;
/** Auto-compact once verbatim chapters would exceed this count. */
export const COMPACT_TRIGGER_COUNT = 4;
/** Memory events at or above this importance pass verbatim into the compaction
 *  prompt — a deterministic floor so high-importance beats are never lost. */
export const IMPORTANCE_FLOOR = 3;

export type ProviderTurn = {
  turn: AssistantTurn;
  /** Real measured prompt usage. Absent from providers that don't assemble a prompt (mock). */
  promptUsage?: PromptUsage;
  /** Model name or ID that generated this turn. */
  model?: string;
  /** Raw request body sent to the provider — for the Debug → Input tab. */
  rawInput?: string;
  /** Raw response body from the provider — for the Debug → Output tab. */
  rawOutput?: string;
  /** OpenAI finish_reason ("stop", "length", …) — surfaces truncation diagnostics. */
  finishReason?: string | null;
};

export interface TurnProvider {
  generateTurn(
    input: ParsedUserInput,
    state: Playthrough,
    choicesEnabled: boolean,
    signal?: AbortSignal
  ): Promise<ProviderTurn>;

  generateScenarioSeed(
    preferences: ScenarioPreferences,
    lorebookIds?: string[],
    modules?: PromptPresetModule[],
    signal?: AbortSignal
  ): Promise<ScenarioSeed>;

  /** Summarize a chapter transcript into { name, shortDescription, fullSummary }. */
  summarizeChapter(transcript: string, modules?: PromptPresetModule[], signal?: AbortSignal): Promise<{ name: string; shortDescription: string; fullSummary: string }>;

  /** Consolidate older chapter summaries into / on top of the single rolling
   *  meta-summary. `priorSummary` is the existing meta-summary text (null when
   *  this is the very first fold-after-seed — though the seed itself promotes a
   *  chapter directly with no provider call). Returns the new rolling summary. */
  compactStorySoFar(input: ChapterCompactionInput, modules?: PromptPresetModule[], signal?: AbortSignal): Promise<{ summary: string }>;

  /** Compute embedding vectors for one or more texts. Returns vectors in input
   *  order. Returns empty array when embeddings are unsupported (mock) or the
   *  API call fails — callers fall back to keyword-based retrieval. */
  embedTexts(texts: string[]): Promise<number[][]>;

  /** Generate a detailed character sheet content blob from a background NPC's
   *  basic data and the current story context. Returns just the content string
   *  (the text blob for the [Species]…[Dislikes] sections). */
  generateCharacterSheet(
    npc: { name: string; description: string; disposition?: string },
    storyContext: string,
    modules?: PromptPresetModule[],
    signal?: AbortSignal
  ): Promise<string>;

  /** Refine an existing character sheet draft based on targeted user feedback and
   *  original card reference. Preserves untouched sections while applying requested changes. */
  refineCharacterSheet(
    currentContent: string,
    originalCardContent: string,
    feedback: string,
    storyContext: string,
    modules?: PromptPresetModule[],
    signal?: AbortSignal
  ): Promise<string>;

  /** Suggest a list of relevant tags for a character based on its sheet, notes,
   *  and the existing library taxonomy. */
  suggestCharacterTags(
    character: { name: string; content: string; creatorNotes?: string; currentTags?: string[]; guidance?: string },
    libraryTags: string[],
    signal?: AbortSignal
  ): Promise<string[]>;

  /** Interactive brainstorming and refinement session for character cards. */
  brainstormCharacter(
    input: CharacterBrainstormInput,
    signal?: AbortSignal
  ): Promise<CharacterBrainstormOutput>;
}

export interface ProposedSectionChange {
  header: string;
  body: string;
}

export interface CharacterBrainstormInput {
  character: {
    name: string;
    content: string;
    creatorNotes?: string;
    tags?: string[];
    ccv2Content?: string;
  };
  chatHistory: Array<{
    role: "user" | "assistant";
    content: string;
  }>;
  userMessage: string;
  includeOriginalCard?: boolean;
  modules?: PromptPresetModule[];
}

export interface CharacterBrainstormOutput {
  reply: string;
  proposedChanges?: {
    sections?: ProposedSectionChange[];
    name?: string;
    creatorNotes?: string;
    tags?: string[];
    fullContent?: string;
  };
}

export class MockProvider implements TurnProvider {
  async generateTurn(
    input: ParsedUserInput,
    state: Playthrough,
    choicesEnabled: boolean,
    _signal?: AbortSignal
  ): Promise<ProviderTurn> {
    return { turn: buildMockAssistantTurn(input, state, choicesEnabled) };
  }

  async generateScenarioSeed(_preferences: ScenarioPreferences, _lorebookIds?: string[], _modules?: PromptPresetModule[], _signal?: AbortSignal): Promise<ScenarioSeed> {
    throw new Error("Scenario generation is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async summarizeChapter(_transcript: string, _modules?: PromptPresetModule[], _signal?: AbortSignal): Promise<{ name: string; shortDescription: string; fullSummary: string }> {
    throw new Error("Chapter summarization is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async compactStorySoFar(_input: ChapterCompactionInput, _modules?: PromptPresetModule[], _signal?: AbortSignal): Promise<{ summary: string }> {
    throw new Error("Chapter compaction is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async embedTexts(_texts: string[]): Promise<number[][]> {
    return []; // mock doesn't support embeddings
  }

  async generateCharacterSheet(_npc: { name: string; description: string; disposition?: string }, _storyContext: string, _modules?: PromptPresetModule[], _signal?: AbortSignal): Promise<string> {
    throw new Error("Character sheet generation is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async refineCharacterSheet(_currentContent: string, _originalCardContent: string, _feedback: string, _storyContext: string, _modules?: PromptPresetModule[], _signal?: AbortSignal): Promise<string> {
    throw new Error("Character sheet refinement is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async suggestCharacterTags(_character: { name: string; content: string; creatorNotes?: string; currentTags?: string[]; guidance?: string }, _libraryTags: string[], _signal?: AbortSignal): Promise<string[]> {
    throw new Error("Tag suggestion is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async brainstormCharacter(_input: CharacterBrainstormInput, _signal?: AbortSignal): Promise<CharacterBrainstormOutput> {
    throw new Error("Character brainstorming is not available with the Mock provider. Switch to a real provider in Settings.");
  }
}
