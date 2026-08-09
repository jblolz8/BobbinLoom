import type { CharacterTemplate, ClothingItem, Playthrough } from "../../schemas";
import { request } from "./client";

export type CharacterTemplateUpdate = Partial<Pick<CharacterTemplate, "name" | "content">>;

export type SaveToLibraryResult = { template: CharacterTemplate; created: boolean };

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
