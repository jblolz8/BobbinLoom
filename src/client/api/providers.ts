import { request } from "./client";
import type {
  CharacterFormat,
  ImageApiStyle,
  ImageGenerationSettings,
  ProviderConnection as ProviderConnectionRow,
  ProviderKind
} from "../../schemas";
// Type-only, so it is erased at build time and the client bundle never reaches
// `src/server` at runtime. The capability shape is PRODUCED there; hand-copying
// it here is the drift this file already warns about for the connection row.
import type { ProviderModelCapabilities } from "../../server/providerRegistry";

/** Re-exported so a consumer can name one model's capability shape without
 *  reaching into the server module itself. */
export type { ModelCapabilities, ModelStepRange, ProviderModelCapabilities } from "../../server/providerRegistry";

/**
 * A connection as the API returns it: the persisted row with the secret
 * replaced by `hasApiKey` + `apiKeyMasked`.
 *
 * Derived from the schema (`src/schemas`) rather than hand-copied, on purpose.
 * This used to be a second, independent declaration of the same shape and it
 * silently drifted behind the registry — it still declared `activeProviderId`
 * and had no `kind` — which the compiler could not catch, because the server is
 * typed from the schema and the client from this copy. Deriving it means the
 * two can never disagree again. The import is type-only, so it is erased at
 * build time and the client bundle never reaches `src/schemas` at runtime.
 */
export type ProviderConnection = Omit<ProviderConnectionRow, "apiKey"> & {
  hasApiKey: boolean;
  apiKeyMasked: string | null;
};

/**
 * Write shape for create/update. `kind` is required here (the server defaults
 * it, but) the discriminator decides which endpoint the connection may be used
 * for, so it has to be stated at every call site instead of defaulting to text
 * by omission.
 */
export type ProviderConnectionPayload = {
  id?: string;
  kind: ProviderKind;
  label: string;
  baseUrl: string;
  apiKey?: string | null;
  model: string;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
  // ── image-only; absent on text rows ──
  /** Dialect for an image connection: `openai` | `venice` | `a1111`
   *  (AUTOMATIC1111 / Forge). The union comes from the schema, so it cannot
   *  drift behind the server. */
  apiStyle?: ImageApiStyle;
  safeMode?: boolean;
  size?: string;
  aspectRatio?: string;
  promptProviderId?: string | null;
  stylePreset?: string;
  hideWatermark?: boolean;
  variants?: number;
  /** Venice `seed`, sent with every generation. Empty = let the provider pick;
   *  `null` clears a stored seed (the editor's emptied field). */
  seed?: number | null;
  // ── a1111-only sampling controls; absent = the WebUI's own defaults ──
  /** 1–150. Absent means the field is omitted and the WebUI's own default
   *  applies, which is what a user who tuned the WebUI expects. */
  steps?: number;
  /** 0–30. */
  cfgScale?: number;
  /** Free text: a fork may ship samplers we do not know. The UI offers the
   *  server's own list (`dialectOptions.samplers`) as suggestions only. */
  sampler?: string;
  scheduler?: string;
  /** Per-connection request timeout in ms (≥1000). Absent = the dialect
   *  default — 10 minutes for a1111, 180 s otherwise. */
  timeoutMs?: number;
};

/** Registry v2: one active slot per kind, plus the read warnings. */
export type ProviderRegistry = {
  activeTextProviderId: string;
  activeImageProviderId: string;
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
  /** Per-model capabilities from the same response (`model_spec.constraints`),
   *  keyed by model id. Always present; an empty map = the listing said nothing
   *  usable, which is never an error. */
  modelSpecs: ProviderModelCapabilities;
  /** a1111 only: the WebUI's own sampler and scheduler names, for the
   *  editor's suggestion lists. Absent when the WebUI did not publish them —
   *  an older build may have no `/sdapi/v1/schedulers` at all — and possibly
   *  partially populated. Never an error. */
  dialectOptions?: { samplers?: string[]; schedulers?: string[] };
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

/** Preset-owned image-prompt configuration. Optional on BOTH payloads with no
 *  default: presets and playthrough snapshots written before the image feature
 *  have no block, so read sites fall back to `DEFAULT_IMAGE_GENERATION_SETTINGS`
 *  explicitly (same contract as the server). Declared here — rather than as an
 *  intersection type at the call site — so every consumer of `getPreset` /
 *  `updatePreset` / the prompt-settings snapshot sees the field with no cast. */
export type Preset = {
  id: string;
  name: string;
  readonly: boolean;
  modules: PromptModuleSet;
  characterFormat?: CharacterFormat;
  imageGeneration?: ImageGenerationSettings;
};

export type PlaythroughPromptSettings = {
  presetId: string;
  presetName: string;
  modules: PromptModuleSet;
  characterFormat?: CharacterFormat;
  imageGeneration?: ImageGenerationSettings;
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
/** Activating returns the whole registry (registry v2), so the caller can
 *  replace its state in one call instead of activate-then-reload. */
export function setActiveProviderConnection(id: string): Promise<ProviderRegistry> {
  return request<ProviderRegistry>(`/api/settings/providers/${id}/active`, { method: "PUT", body: JSON.stringify({}) });
}
export function testProviderConnection(p: {
  id?: string;
  baseUrl?: string;
  apiKey?: string;
  /** Saved `id` wins; a draft states its own dialect so an unsaved a1111
   *  connection is not tested against `/v1/models`. */
  apiStyle?: ImageApiStyle;
}): Promise<ConnectionTestResult> {
  return request<ConnectionTestResult>("/api/settings/providers/test", { method: "POST", body: JSON.stringify(p) });
}
/**
 * Probe `<baseUrl>/models`. `type` narrows the listing on servers that expose
 * more than one model family (`"image"` for image endpoints); it is optional
 * because most OpenAI-compatible text servers ignore it.
 *
 * `apiStyle: "a1111"` switches the probe to the WebUI's own
 * `/sdapi/v1/sd-models` (see `dialectOptions` on the result). A saved `id`
 * uses the STORED style, which always wins.
 */
export function fetchProviderModels(p: {
  id?: string;
  baseUrl?: string;
  apiKey?: string;
  type?: "text" | "image";
  apiStyle?: ImageApiStyle;
}): Promise<ConnectionModelsResult> {
  return request<ConnectionModelsResult>("/api/settings/providers/models", { method: "POST", body: JSON.stringify(p) });
}

export type ConnectionStylesResult = {
  ok: boolean;
  styles: string[];
  status?: number;
  message?: string;
  latencyMs?: number;
};

/**
 * Probe `<baseUrl>/image/styles` — the image style list a Venice connection's
 * Style Preset must be chosen from.
 *
 * The endpoint is PUBLIC, so the call needs no key: `baseUrl` may be omitted
 * entirely and the server falls back to the documented host. `id` (a saved
 * connection) wins over `baseUrl` and uses the stored key, which is never sent
 * to the client.
 *
 * The values are CASE-SENSITIVE and title-cased upstream (`Anime`, not
 * `anime`) — a lowercase value is exactly the 400 this control exists to
 * prevent.
 */
export function fetchProviderImageStyles(p: {
  id?: string;
  baseUrl?: string;
  apiKey?: string;
}): Promise<ConnectionStylesResult> {
  return request<ConnectionStylesResult>("/api/settings/providers/image-styles", {
    method: "POST",
    body: JSON.stringify(p)
  });
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

/** Write shape for `updatePreset`. The image block is preset-owned state (not a
 *  prompt module), so it travels on the same save call as the others. */
export type PresetUpdatePayload = {
  name?: string;
  modules?: PromptModuleSet;
  characterFormat?: CharacterFormat;
  imageGeneration?: ImageGenerationSettings;
};

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

export function updatePreset(id: string, payload: PresetUpdatePayload): Promise<Preset> {
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
