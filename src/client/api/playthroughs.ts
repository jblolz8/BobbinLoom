import type { ChapterOpeningMode, Playthrough, PlaythroughCover, PlaythroughListResponse, SimpleNPC } from "../../schemas";
import type { RevertRequestAnchor } from "../../engine/chapterRevert";
import { request } from "./client";

export type TokenBreakdown = {
  modules: number;
  outputFormat: number;
  lorebook: number;
  storySoFar: number;
  stateSummary: number;
  chatHistory: number;
  memoryEvents: number;
  lorebookDepth: number;
  userInput: number;
};

export type TokenUsage = {
  estimated: number;
  contextWindow: number;
  breakdown: TokenBreakdown;
  /** Real prompt/completion tokens from the provider's last response, when reported. */
  measured?: { promptTokens: number; completionTokens?: number };
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
  /** How the next chapter opens. `custom` needs `openingMessage` — the route refuses it without. */
  openingMode: ChapterOpeningMode;
  /** The player's own message to open the new chapter with: it becomes that chapter's first
   *  message, not part of the chapter being closed. */
  openingMessage?: string;
  /** The text connection to close with; absent = the stored chapter preference, then the
   *  active connection. */
  providerId?: string;
};

export function listPlaythroughs(): Promise<PlaythroughListResponse> {
  return request<PlaythroughListResponse>("/api/playthroughs");
}

export function getPlaythrough(id: string): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}`);
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

export type SendTurnOptions = {
  /** Hide the synthetic user message in the visible chat (the "Continue" flow
   *  sends a hidden continuation instruction so the model replies to the
   *  player's last visible message). */
  hideUserMessage?: boolean;
};

export function sendTurn(
  playthroughId: string,
  input: string,
  suggestedChoicesEnabled: boolean,
  signal?: AbortSignal,
  options?: SendTurnOptions
): Promise<TurnResponse> {
  return request<TurnResponse>("/api/turn", {
    method: "POST",
    body: JSON.stringify({
      playthroughId,
      input,
      suggestedChoicesEnabled,
      hideUserMessage: options?.hideUserMessage ?? false
    }),
    signal
  });
}

export function retryTurn(
  playthroughId: string,
  messageId: string,
  suggestedChoicesEnabled: boolean,
  signal?: AbortSignal
): Promise<TurnResponse> {
  return request<TurnResponse>(`/api/playthroughs/${playthroughId}/retry`, {
    method: "POST",
    body: JSON.stringify({ messageId, suggestedChoicesEnabled }),
    // Same as sendTurn: the retry runs inline, so it needs the same cancel path.
    signal
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

/** Deletes a message and everything after it (inclusive), reverting world state. */
export function truncatePlaythrough(playthroughId: string, messageId: string): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/truncate`, {
    method: "POST",
    body: JSON.stringify({ messageId })
  });
}

/** Reverts to an archived chapter or an archived response: everything from the anchor on is
 *  discarded, the anchor's chapter becomes the running one, and its summary is discarded.
 *  Nothing regenerates. */
export function revertToAnchor(
  playthroughId: string,
  anchor: RevertRequestAnchor
): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/revert`, {
    method: "POST",
    body: JSON.stringify({ anchor })
  });
}

/** Persists the per-playthrough input draft (empty content clears it). */
export function saveDraft(
  playthroughId: string,
  content: string
): Promise<{ ok: boolean; draftUpdatedAt: string }> {
  return request<{ ok: boolean; draftUpdatedAt: string }>(`/api/playthroughs/${playthroughId}/draft`, {
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

/** The manual cover choice: which stored image. How the frame is shaped and filled is a display
 *  setting (Settings → Interface & Appearance → Cover Art), not a property of the choice. */
export type PlaythroughCoverChoice = Pick<PlaythroughCover, "file">;

export function setPlaythroughCover(id: string, cover: PlaythroughCoverChoice): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}/cover`, {
    method: "POST",
    body: JSON.stringify(cover)
  });
}

/** Clears the manual choice, handing the card back to the automatic chain (latest image →
 *  present cast → placeholder). */
export function clearPlaythroughCover(id: string): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}/cover`, { method: "DELETE" });
}

export function branchPlaythrough(
  id: string,
  messageId: string,
  name?: string,
  asStandalone?: boolean
): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}/branch`, {
    method: "POST",
    body: JSON.stringify({ messageId, name, asStandalone })
  });
}

export function listPlaythroughTimelines(id: string): Promise<{ timelines: Playthrough[] }> {
  return request<{ timelines: Playthrough[] }>(`/api/playthroughs/${id}/timelines`);
}

export function promotePlaythroughBranch(id: string): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${id}/promote`, {
    method: "POST"
  });
}

export function generatePlaythrough(
  preferences: ScenarioPreferences,
  personaId?: string,
  castIds?: string[],
  generateOpeningChoices?: boolean,
  openingMode?: "quick" | "fleshedOut",
  lorebookIds?: string[],
  presetId?: string,
  /** The text connection to generate with; absent = the server's stored preference,
   *  then the active connection. */
  providerId?: string,
  signal?: AbortSignal
): Promise<GeneratePlaythroughResponse> {
  return request<GeneratePlaythroughResponse>("/api/playthroughs/generate", {
    method: "POST",
    body: JSON.stringify({
      ...preferences,
      personaId,
      castIds,
      generateOpeningChoices,
      openingMode,
      lorebookIds,
      ...(presetId ? { presetId } : {}),
      ...(providerId ? { providerId } : {})
    }),
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
