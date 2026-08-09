import type { Playthrough, PlaythroughListResponse, SimpleNPC } from "../../schemas";
import { request } from "./client";

export type TokenBreakdown = {
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

export type TokenUsage = {
  estimated: number;
  contextWindow: number;
  breakdown: TokenBreakdown;
  castPresence?: { present: number; absent: number };
};

export type TurnResponse = {
  narrative: string;
  choices?: string[];
  state: Playthrough;
  applied: string[];
  rejected: string[];
  warnings: string[];
  tokenUsage: TokenUsage;
  rawInput?: string;
  rawOutput?: string;
  finishReason?: string | null;
};

export type QuestAction = "toggleTracking" | "delete" | "edit";

export type PromoteDraftResult = { npc: SimpleNPC; content: string; storyContext: string };

export type ScenarioPreferences = {
  name: string;
  setting?: string;
};

export type GeneratePlaythroughResponse = {
  state: Playthrough;
  tokenUsage: TokenUsage;
  rawInput?: string;
  rawOutput?: string;
  finishReason?: string | null;
};

export type CloseChapterBody = {
  addClosingMessage: boolean;
  closingMessage?: string;
};

export function listPlaythroughs(): Promise<PlaythroughListResponse> {
  return request<PlaythroughListResponse>("/api/playthroughs");
}

export function createPlaythrough(
  name: string,
  personaId?: string,
  castIds?: string[],
  blank?: boolean,
  lorebookIds?: string[],
  setting?: string
): Promise<Playthrough> {
  return request<Playthrough>("/api/playthroughs", {
    method: "POST",
    body: JSON.stringify({ name, personaId, castIds, blank, lorebookIds, setting })
  });
}

export function sendTurn(
  playthroughId: string,
  input: string,
  suggestedChoicesEnabled: boolean,
  signal?: AbortSignal
): Promise<TurnResponse> {
  return request<TurnResponse>("/api/turn", {
    method: "POST",
    body: JSON.stringify({ playthroughId, input, suggestedChoicesEnabled }),
    signal
  });
}

export function retryTurn(
  playthroughId: string,
  messageId: string,
  suggestedChoicesEnabled: boolean
): Promise<TurnResponse> {
  return request<TurnResponse>(`/api/playthroughs/${playthroughId}/retry`, {
    method: "POST",
    body: JSON.stringify({ messageId, suggestedChoicesEnabled })
  });
}

export function getContextUsage(playthroughId: string, choicesEnabled: boolean): Promise<TokenUsage> {
  return request<TokenUsage>(`/api/playthroughs/${playthroughId}/context-usage?choices=${choicesEnabled}`);
}

export function editMessage(
  playthroughId: string,
  messageId: string,
  content: string
): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/messages/${messageId}`, {
    method: "PUT",
    body: JSON.stringify({ content })
  });
}

export function questAction(
  playthroughId: string,
  questId: string,
  action: QuestAction,
  name?: string,
  summary?: string
): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/quest-action`, {
    method: "POST",
    body: JSON.stringify({ questId, action, name, summary })
  });
}

export function promoteNpc(playthroughId: string, npcId: string, content?: string, signal?: AbortSignal): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/npcs/${npcId}/promote`, {
    method: "POST",
    body: JSON.stringify(content !== undefined ? { content } : {}),
    signal,
  });
}

export function promoteNpcDraft(playthroughId: string, npcId: string, signal?: AbortSignal): Promise<PromoteDraftResult> {
  return request<PromoteDraftResult>(`/api/playthroughs/${playthroughId}/npcs/${npcId}/promote/draft`, {
    method: "POST",
    signal,
  });
}

export function deletePlaythrough(id: string): Promise<void> {
  return request<void>(`/api/playthroughs/${id}`, { method: "DELETE" });
}

export function renamePlaythrough(id: string, name: string): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}`, {
    method: "PUT",
    body: JSON.stringify({ name })
  });
}

export function duplicatePlaythrough(id: string): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}/duplicate`, {
    method: "POST"
  });
}

export function generatePlaythrough(
  preferences: ScenarioPreferences,
  personaId?: string,
  castIds?: string[],
  generateOpeningChoices?: boolean,
  lorebookIds?: string[],
  presetId?: string,
  signal?: AbortSignal
): Promise<GeneratePlaythroughResponse> {
  return request<GeneratePlaythroughResponse>("/api/playthroughs/generate", {
    method: "POST",
    body: JSON.stringify({ ...preferences, personaId, castIds, generateOpeningChoices, lorebookIds, ...(presetId ? { presetId } : {}) }),
    signal
  });
}

export function closeChapter(
  playthroughId: string,
  body: CloseChapterBody
): Promise<{ state: Playthrough; tokenUsage: TokenUsage }> {
  return request<{ state: Playthrough; tokenUsage: TokenUsage }>(`/api/playthroughs/${playthroughId}/close-chapter`, {
    method: "POST",
    body: JSON.stringify(body)
  });
}

export function resummarizeChapter(
  playthroughId: string,
  chapterId: string
): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/chapters/${chapterId}/resummarize`, {
    method: "POST"
  });
}
