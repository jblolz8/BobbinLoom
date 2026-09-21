import type { CharacterFormat, CharacterTemplate, ClothingItem, Playthrough } from "../../schemas";
import { request } from "./client";
import type { BrainstormSession } from "../../engine/brainstorm";

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

/** A character's brainstorm session, or null when it has never been brainstormed with. The session lives
 *  beside the character on the server, so it survives a cleared browser and is visible from any device. */
export function getBrainstormSession(characterId: string): Promise<BrainstormSession | null> {
  return request<BrainstormSession | null>(`/api/characters/${characterId}/brainstorm`).catch(() =>
    null
  );
}

/** Stores the whole thread. Unusable entries are dropped server-side and the tail is trimmed there, so a
 *  caller may send whatever it holds. */
export function saveBrainstormSession(
  characterId: string,
  messages: unknown[]
): Promise<BrainstormSession> {
  return request<BrainstormSession>(`/api/characters/${characterId}/brainstorm`, {
    method: "PUT",
    body: JSON.stringify({ messages })
  });
}

export function clearBrainstormSession(characterId: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>(`/api/characters/${characterId}/brainstorm`, { method: "DELETE" });
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

export function uploadCharacterAvatar(
  id: string,
  type: "portrait" | "profile",
  dataBase64: string,
  fileName?: string
): Promise<{ record: CharacterTemplate }> {
  return request<{ record: CharacterTemplate }>(`/api/characters/${id}/avatar`, {
    method: "POST",
    body: JSON.stringify({ type, dataBase64, fileName })
  });
}

export function restoreOriginalCharacterAvatar(id: string): Promise<{ record: CharacterTemplate }> {
  return request<{ record: CharacterTemplate }>(`/api/characters/${id}/avatar/restore`, {
    method: "POST"
  });
}

export function deleteCharacterProfileAvatar(id: string): Promise<{ record: CharacterTemplate }> {
  return request<{ record: CharacterTemplate }>(`/api/characters/${id}/avatar/profile`, {
    method: "DELETE"
  });
}

export function getCharacterAvatarUrl(
  id: string,
  type: "portrait" | "profile" | "original" = "portrait",
  updatedAt?: number
): string {
  const query = new URLSearchParams();
  if (type !== "portrait") query.set("type", type);
  if (updatedAt) query.set("t", String(updatedAt));
  const qs = query.toString();
  return `/api/characters/${id}/avatar${qs ? `?${qs}` : ""}`;
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
  /** Target character format (defaults to the active preset's format). */
  format?: CharacterFormat;
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
      ...(options?.format ? { format: options.format } : {}),
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

// ── Reformat an existing BL sheet into a target character format ──

export type ReformatGenerateOptions = {
  format?: CharacterFormat;
  /** Source sheet for retry-with-feedback; defaults to the stored template content. */
  currentContent?: string;
  feedback?: string;
  signal?: AbortSignal;
};

export function reformatCharacterGenerate(
  id: string,
  options?: ReformatGenerateOptions
): Promise<ConvertGenerateResult> {
  return request<ConvertGenerateResult>(`/api/characters/${id}/reformat`, {
    method: "POST",
    body: JSON.stringify({
      action: "generate",
      ...(options?.format ? { format: options.format } : {}),
      ...(options?.currentContent ? { currentContent: options.currentContent } : {}),
      ...(options?.feedback ? { feedback: options.feedback } : {}),
    }),
    signal: options?.signal,
  });
}

export function reformatCharacterApply(
  id: string,
  content: string
): Promise<ConvertApplyResult> {
  return request<ConvertApplyResult>(`/api/characters/${id}/reformat`, {
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
  /** The connection to think with; absent follows the active one. */
  providerId?: string;
  /** Whether a section the format does not list may be proposed. */
  allowNewSections?: boolean;
  includeOriginalCard?: boolean;
  /** Target character format whose section guidance the assistant should follow. */
  format?: CharacterFormat;
};

export type CharacterBrainstormResult = {
  reply: string;
  /** Headers the server refused because the sheet has no such section. */
  unmappedHeaders?: string[];
  /** Headers kept as additions, so the card can mark them as new sections. */
  newSections?: string[];
  /** The model that answered, for the badge on the reply. */
  model?: string;
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
