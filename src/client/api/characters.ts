import type { CharacterTemplate, ClothingItem, Playthrough } from "../../schemas";
import { request } from "./client";

export type CharacterTemplateUpdate = Partial<Pick<CharacterTemplate, "name" | "content">>;

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

export function convertCharacterGenerate(
  id: string,
  feedback?: string
): Promise<ConvertGenerateResult> {
  return request<ConvertGenerateResult>(`/api/characters/${id}/convert`, {
    method: "POST",
    body: JSON.stringify({ action: "generate", ...(feedback ? { feedback } : {}) }),
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
