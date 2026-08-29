import { buildMockAssistantTurn } from "../engine/engine";
import type { AssistantTurn, CharacterFormat, ParsedUserInput, Playthrough, ScenarioPreferences, ScenarioSeed } from "../schemas";

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
    signal?: AbortSignal,
    format?: CharacterFormat
  ): Promise<ScenarioSeed>;

  /** Summarize a chapter transcript into { name, shortDescription, fullSummary }. */
  summarizeChapter(transcript: string, signal?: AbortSignal): Promise<{ name: string; shortDescription: string; fullSummary: string }>;

  /** Consolidate older chapter summaries into / on top of the single rolling
   *  meta-summary. `priorSummary` is the existing meta-summary text (null when
   *  this is the very first fold-after-seed — though the seed itself promotes a
   *  chapter directly with no provider call). Returns the new rolling summary. */
  compactStorySoFar(input: ChapterCompactionInput, signal?: AbortSignal): Promise<{ summary: string }>;

  /** Compute embedding vectors for one or more texts. Returns vectors in input
   *  order. Returns empty array when embeddings are unsupported (mock) or the
   *  API call fails — callers fall back to keyword-based retrieval. */
  embedTexts(texts: string[]): Promise<number[][]>;

  /** Generate a detailed character sheet content blob from a background NPC's
   *  basic data and the current story context. Returns just the content string
   *  (the text blob of the preset's sections). `format` is the target character
   *  format (defaults to the shipped Default format when omitted). */
  generateCharacterSheet(
    npc: { name: string; description: string; disposition?: string },
    storyContext: string,
    signal?: AbortSignal,
    format?: CharacterFormat
  ): Promise<string>;

  /** Refine an existing character sheet draft based on targeted user feedback and
   *  original card reference. Preserves untouched sections while applying requested changes. */
  refineCharacterSheet(
    currentContent: string,
    originalCardContent: string,
    feedback: string,
    storyContext: string,
    signal?: AbortSignal,
    format?: CharacterFormat
  ): Promise<string>;

  /** Restructure an existing sheet into a target character format: ensure every
   *  format section is present in the format's order, add missing sections with
   *  content derived from the existing sheet, preserve established details. */
  reformatCharacterSheet(
    currentContent: string,
    format: CharacterFormat,
    signal?: AbortSignal,
    feedback?: string
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
  /** Target character format whose section guidance the assistant should follow. */
  format?: CharacterFormat;
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

  async generateScenarioSeed(_preferences: ScenarioPreferences, _lorebookIds?: string[], _signal?: AbortSignal, _format?: CharacterFormat): Promise<ScenarioSeed> {
    throw new Error("Scenario generation is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async summarizeChapter(_transcript: string, _signal?: AbortSignal): Promise<{ name: string; shortDescription: string; fullSummary: string }> {
    throw new Error("Chapter summarization is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async compactStorySoFar(_input: ChapterCompactionInput, _signal?: AbortSignal): Promise<{ summary: string }> {
    throw new Error("Chapter compaction is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async embedTexts(_texts: string[]): Promise<number[][]> {
    return []; // mock doesn't support embeddings
  }

  async generateCharacterSheet(_npc: { name: string; description: string; disposition?: string }, _storyContext: string, _signal?: AbortSignal, _format?: CharacterFormat): Promise<string> {
    throw new Error("Character sheet generation is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async refineCharacterSheet(_currentContent: string, _originalCardContent: string, _feedback: string, _storyContext: string, _signal?: AbortSignal, _format?: CharacterFormat): Promise<string> {
    throw new Error("Character sheet refinement is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async reformatCharacterSheet(_currentContent: string, _format: CharacterFormat, _signal?: AbortSignal, _feedback?: string): Promise<string> {
    throw new Error("Character sheet reformatting is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async suggestCharacterTags(_character: { name: string; content: string; creatorNotes?: string; currentTags?: string[]; guidance?: string }, _libraryTags: string[], _signal?: AbortSignal): Promise<string[]> {
    throw new Error("Tag suggestion is not available with the Mock provider. Switch to a real provider in Settings.");
  }

  async brainstormCharacter(_input: CharacterBrainstormInput, _signal?: AbortSignal): Promise<CharacterBrainstormOutput> {
    throw new Error("Character brainstorming is not available with the Mock provider. Switch to a real provider in Settings.");
  }
}
