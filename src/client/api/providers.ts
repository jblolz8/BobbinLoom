import { request } from "./client";
import type { CharacterFormat } from "../../schemas";

export type ProviderConnection = {
  id: string;
  label: string;
  baseUrl: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  readonly?: boolean;
  hasApiKey: boolean;
  apiKeyMasked: string | null;
  createdAt?: string;
  updatedAt?: string;
};

export type ProviderConnectionPayload = {
  id?: string;
  label: string;
  baseUrl: string;
  apiKey?: string | null;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
};

export type ProviderRegistry = {
  activeProviderId: string;
  connections: ProviderConnection[];
  warnings: string[];
};

export type ConnectionTestResult = {
  ok: boolean;
  status?: number;
  message?: string;
  latencyMs?: number;
};

export type ConnectionModelsResult = {
  ok: boolean;
  models: string[];
  status?: number;
  message?: string;
  latencyMs?: number;
};

export type PresetModule = {
  id: string;
  name: string;
  description: string;
  content: string;
  order: number;
  enabled: boolean;
};

export type PromptModuleSet = {
  turn: PresetModule[];
};

export type PresetSummary = {
  id: string;
  name: string;
  readonly: boolean;
  moduleCount: number;
};

export type Preset = {
  id: string;
  name: string;
  readonly: boolean;
  modules: PromptModuleSet;
  characterFormat?: CharacterFormat;
};

export type PlaythroughPromptSettings = {
  presetId: string;
  presetName: string;
  modules: PromptModuleSet;
  characterFormat?: CharacterFormat;
};

export function listProviderConnections(): Promise<ProviderRegistry> {
  return request<ProviderRegistry>("/api/settings/providers");
}
export function createProviderConnection(p: ProviderConnectionPayload): Promise<ProviderConnection> {
  return request<ProviderConnection>("/api/settings/providers", { method: "POST", body: JSON.stringify(p) });
}
export function updateProviderConnection(id: string, p: ProviderConnectionPayload): Promise<ProviderConnection> {
  return request<ProviderConnection>(`/api/settings/providers/${id}`, { method: "PUT", body: JSON.stringify(p) });
}
export function deleteProviderConnection(id: string): Promise<ProviderRegistry> {
  return request<ProviderRegistry>(`/api/settings/providers/${id}`, { method: "DELETE" });
}
export function duplicateProviderConnection(id: string): Promise<ProviderConnection> {
  return request<ProviderConnection>(`/api/settings/providers/${id}/duplicate`, { method: "POST", body: JSON.stringify({}) });
}
export function setActiveProviderConnection(id: string): Promise<{ activeProviderId: string }> {
  return request<{ activeProviderId: string }>(`/api/settings/providers/${id}/active`, { method: "PUT", body: JSON.stringify({}) });
}
export function testProviderConnection(p: { id?: string; baseUrl?: string; apiKey?: string }): Promise<ConnectionTestResult> {
  return request<ConnectionTestResult>("/api/settings/providers/test", { method: "POST", body: JSON.stringify(p) });
}
export function fetchProviderModels(p: { id?: string; baseUrl?: string; apiKey?: string }): Promise<ConnectionModelsResult> {
  return request<ConnectionModelsResult>("/api/settings/providers/models", { method: "POST", body: JSON.stringify(p) });
}
export function getProviderApiKey(id: string): Promise<{ apiKey: string }> {
  return request<{ apiKey: string }>(`/api/settings/providers/${id}/key`);
}

export function getDefaultPresetId(): Promise<{ defaultPresetId: string }> {
  return request<{ defaultPresetId: string }>("/api/settings/default-preset");
}
export function setDefaultPresetId(defaultPresetId: string): Promise<{ defaultPresetId: string }> {
  return request<{ defaultPresetId: string }>("/api/settings/default-preset", {
    method: "PUT",
    body: JSON.stringify({ defaultPresetId })
  });
}

export function listPresets(): Promise<PresetSummary[]> {
  return request<PresetSummary[]>("/api/prompt-presets");
}

export function getPreset(id: string): Promise<Preset> {
  return request<Preset>(`/api/prompt-presets/${id}`);
}

export function createPreset(name: string, cloneFromId?: string): Promise<Preset> {
  return request<Preset>("/api/prompt-presets", {
    method: "POST",
    body: JSON.stringify({ name, cloneFromId })
  });
}

export function updatePreset(id: string, payload: { name?: string; modules?: PromptModuleSet; characterFormat?: CharacterFormat }): Promise<Preset> {
  return request<Preset>(`/api/prompt-presets/${id}`, {
    method: "PUT",
    body: JSON.stringify(payload)
  });
}

export function deletePreset(id: string): Promise<void> {
  return request<void>(`/api/prompt-presets/${id}`, { method: "DELETE" });
}

export function updatePlaythroughPromptSettings(
  playthroughId: string,
  presetId: string
): Promise<PlaythroughPromptSettings> {
  return request<PlaythroughPromptSettings>(`/api/playthroughs/${playthroughId}/prompt-settings`, {
    method: "PUT",
    body: JSON.stringify({ presetId })
  });
}
