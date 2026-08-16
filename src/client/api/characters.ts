import type { CharacterTemplate, ClothingItem, Playthrough } from "../../schemas";
import { request } from "./client";

export type CharacterTemplateUpdate = Partial<Pick<CharacterTemplate, "name" | "content" | "creatorNotes" | "tags">>;

export type SaveToLibraryResult = { template: CharacterTemplate; created: boolean };

export type ImportCharacterResult = { record: CharacterTemplate; created: boolean };

/** Import a CCv2 card (PNG with embedded `chara` JSON, or standalone JSON).
 *  `dataBase64` is the raw file content base64-encoded (no data: prefix). */
export function importCharacter(fileName: string, dataBase64: string): Promise<ImportCharacterResult> {
  return request<ImportCharacterResult>("/api/characters/import", {
    method: "POST",
    body: JSON.stringify({ fileName, dataBase64 })
  });
}

export type CharacterEditPayload = {
  mood?: string;
  towardPlayer?: string;
  memorySummary?: string;
  conditions?: string[];
  flags?: string[];
  currentLocationId?: string;
  clothing?: ClothingItem[];
  name?: string;
  content?: string;
  summary?: string;
};

export function listCharacters(): Promise<CharacterTemplate[]> {
  return request<CharacterTemplate[]>("/api/characters");
}

export function getCharacter(id: string): Promise<CharacterTemplate> {
  return request<CharacterTemplate>(`/api/characters/${id}`);
}

export function createCharacter(name: string): Promise<CharacterTemplate> {
  return request<CharacterTemplate>("/api/characters", {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export function updateCharacter(id: string, updates: CharacterTemplateUpdate): Promise<CharacterTemplate> {
  return request<CharacterTemplate>(`/api/characters/${id}`, {
    method: "PUT",
    body: JSON.stringify(updates)
  });
}

export function deleteCharacter(id: string): Promise<void> {
  return request<void>(`/api/characters/${id}`, { method: "DELETE" });
}

export function saveCharacterToLibrary(
  playthroughId: string,
  characterId: string,
  mode: "update" | "newVersion" = "update"
): Promise<SaveToLibraryResult> {
  return request<SaveToLibraryResult>(`/api/playthroughs/${playthroughId}/characters/${characterId}/save-to-library`, {
    method: "POST",
    body: JSON.stringify({ mode })
  });
}

export function editCharacter(
  playthroughId: string,
  characterId: string,
  payload: CharacterEditPayload
): Promise<Playthrough> {
  return request<Playthrough>(`/api/playthroughs/${playthroughId}/characters/${characterId}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

// ── CCv2 → BL conversion ──

export type ConvertGenerateResult = {
  content: string;
  originalContent: string;
  record: CharacterTemplate;
};

export type ConvertApplyResult = {
  record: CharacterTemplate;
};

export type ConvertGenerateOptions = {
  feedback?: string;
  currentContent?: string;
  signal?: AbortSignal;
};

export function convertCharacterGenerate(
  id: string,
  options?: ConvertGenerateOptions
): Promise<ConvertGenerateResult> {
  return request<ConvertGenerateResult>(`/api/characters/${id}/convert`, {
    method: "POST",
    body: JSON.stringify({
      action: "generate",
      ...(options?.feedback ? { feedback: options.feedback } : {}),
      ...(options?.currentContent ? { currentContent: options.currentContent } : {}),
    }),
    signal: options?.signal,
  });
}

export function convertCharacterApply(
  id: string,
  content: string
): Promise<ConvertApplyResult> {
  return request<ConvertApplyResult>(`/api/characters/${id}/convert`, {
    method: "POST",
    body: JSON.stringify({ action: "apply", content }),
  });
}

// ── AI Tag Suggestion ──

export type SuggestTagsPayload = {
  name: string;
  content: string;
  creatorNotes?: string;
  currentTags?: string[];
  guidance?: string;
  libraryTags?: string[];
};

export function suggestCharacterTags(
  payload: SuggestTagsPayload,
  options?: { signal?: AbortSignal }
): Promise<{ tags: string[] }> {
  return request<{ tags: string[] }>("/api/characters/suggest-tags", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: options?.signal,
  });
}

// ── AI Character Brainstorming ──

export type ProposedSectionChange = {
  header: string;
  body: string;
};

export type CharacterBrainstormPayload = {
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
};

export type CharacterBrainstormResult = {
  reply: string;
  proposedChanges?: {
    sections?: ProposedSectionChange[];
    name?: string;
    creatorNotes?: string;
    tags?: string[];
    fullContent?: string;
  };
};

export function brainstormCharacter(
  payload: CharacterBrainstormPayload,
  options?: { signal?: AbortSignal }
): Promise<CharacterBrainstormResult> {
  return request<CharacterBrainstormResult>("/api/characters/brainstorm", {
    method: "POST",
    body: JSON.stringify(payload),
    signal: options?.signal,
  });
}
