import type { ImageApiStyle, ProviderConnection } from "../schemas";

export type ResolvedProviderConfig = {
  providerId: string;
  label: string;
  baseUrl: string;
  apiKey: string;
  model: string;
  temperature: number;
  maxTokens: number;
  contextWindow: number;
  maxRetries: number;
  timeoutMs: number;
};

export type PublicProviderConnection = Omit<ProviderConnection, "apiKey"> & {
  hasApiKey: boolean;
  apiKeyMasked: string | null;
};

/** Client/Create input — apiKey optional (blank keeps existing; null clears).
 *  temperature/maxTokens/contextWindow optional — the registry defaults them
 *  at runtime. id is derived from the label; readonly is server-owned. */
export type ProviderConnectionInput = {
  id?: string;
  label: string;
  baseUrl: string;
  model: string;
  apiKey?: string | null;
  temperature?: number;
  maxTokens?: number;
  contextWindow?: number;
};

export function normalizeBaseUrl(baseUrl: string): string {
  const trimmed = baseUrl.trim().replace(/\/+$/, "");
  if (!trimmed) return trimmed;
  return trimmed.endsWith("/v1") ? trimmed : `${trimmed}/v1`;
}

/** A1111 is served from the WebUI root (/sdapi/v1/...), NOT from an
 *  OpenAI-style /v1 prefix — appending one turns every path into /v1/sdapi/... */
export function normalizeImageBaseUrl(baseUrl: string, apiStyle: ImageApiStyle = "openai"): string {
  return apiStyle === "a1111" ? baseUrl.trim().replace(/\/+$/, "") : normalizeBaseUrl(baseUrl);
}

/** A local WebUI rendering a 1024x1024 SDXL batch at 30 steps takes minutes,
 *  not seconds; the 180 s generic image default would cut a healthy generation
 *  off mid-sampler. The connection's own `timeoutMs` overrides this, and so
 *  does BOBBINLOOM_IMAGE_TIMEOUT_MS. */
export const A1111_DEFAULT_IMAGE_TIMEOUT_MS = 600_000;

export function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Image requests get their own timeout: local diffusion queues and Venice's
 *  image lane both blow past the 120s text default, and cutting a generation
 *  off at 120s wastes the whole call. Retries stay at 1 — a 60-second
 *  generation is not something to repeat twice on a 5xx.
 *
 *  The base URL is normalized for the DIALECT, not generically: an a1111
 *  connection is served from the WebUI root and must not gain a /v1 segment.
 *  Only the base URL is overridden here — `resolveConnectionConfig` still does
 *  everything else, and text providers keep calling it directly. */
export function resolveImageConfig(
  conn: ProviderConnection,
  env: NodeJS.ProcessEnv = process.env
): ResolvedProviderConfig {
  const apiStyle = conn.apiStyle ?? "openai";
  const dialectDefault = apiStyle === "a1111" ? A1111_DEFAULT_IMAGE_TIMEOUT_MS : 180_000;
  return {
    ...resolveConnectionConfig(conn, env),
    baseUrl: normalizeImageBaseUrl(conn.baseUrl, apiStyle),
    timeoutMs: conn.timeoutMs ?? numberFromEnv(env.BOBBINLOOM_IMAGE_TIMEOUT_MS, dialectDefault),
    maxRetries: numberFromEnv(env.BOBBINLOOM_IMAGE_MAX_RETRIES, 1)
  };
}

/** Resolve a persisted connection into the runtime provider config. Only
 *  BOBBINLOOM_MAX_RETRIES and BOBBINLOOM_TIMEOUT_MS come from the environment —
 *  everything else lives in the connection (stored keys are already decrypted
 *  by the registry read path). */
export function resolveConnectionConfig(
  conn: ProviderConnection,
  env: NodeJS.ProcessEnv = process.env
): ResolvedProviderConfig {
  return {
    providerId: conn.id,
    label: conn.label,
    baseUrl: normalizeBaseUrl(conn.baseUrl),
    apiKey: conn.apiKey ?? "",
    model: conn.model,
    temperature: conn.temperature,
    maxTokens: conn.maxTokens,
    contextWindow: conn.contextWindow,
    maxRetries: numberFromEnv(env.BOBBINLOOM_MAX_RETRIES, 1),
    timeoutMs: numberFromEnv(env.BOBBINLOOM_TIMEOUT_MS, 120_000)
  };
}

export function maskApiKey(apiKey?: string): string | null {
  if (!apiKey) return null;
  return `••••${apiKey.slice(-4)}`;
}
