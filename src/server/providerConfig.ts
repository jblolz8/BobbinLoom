import type { ProviderConnection } from "../schemas";

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

export function numberFromEnv(value: string | undefined, fallback: number): number {
  if (!value) return fallback;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Image requests get their own timeout: local diffusion queues and Venice's
 *  image lane both blow past the 120s text default, and cutting a generation
 *  off at 120s wastes the whole call. Retries stay at 1 — a 60-second
 *  generation is not something to repeat twice on a 5xx. */
export function resolveImageConfig(
  conn: ProviderConnection,
  env: NodeJS.ProcessEnv = process.env
): ResolvedProviderConfig {
  return {
    ...resolveConnectionConfig(conn, env),
    timeoutMs: numberFromEnv(env.BOBBINLOOM_IMAGE_TIMEOUT_MS, 180_000),
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
