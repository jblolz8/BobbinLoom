import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, backupFile, quarantineFile } from "./persistence";
import { maskApiKey, normalizeBaseUrl } from "./providerConfig";
import { ProviderConnectionSchema, ProviderRegistryFileSchema } from "../schemas";
import type { ProviderConnection, ProviderRegistryFile } from "../schemas";
import type { ProviderConnectionInput, PublicProviderConnection } from "./providerConfig";
import { decryptApiKey, encryptApiKey, loadOrCreateVaultKey } from "./keyVault";

export type ProviderRegistry = {
  activeProviderId: string;
  connections: ProviderConnection[];
};

export type PublicProviderRegistry = {
  activeProviderId: string;
  connections: PublicProviderConnection[];
  warnings: string[];
};

function registryPath(dir: string): string {
  return join(dir, "providers.json");
}

/** Decrypt stored api keys into memory; unreadable keys are dropped. */
function decryptConnections(connections: ProviderConnection[], vaultKey: Buffer): ProviderConnection[] {
  return connections.map((c) => {
    if (!c.apiKey) return c;
    const decrypted = decryptApiKey(c.apiKey, vaultKey);
    return { ...c, apiKey: decrypted ?? undefined };
  });
}

type ReadResult = { registry: ProviderRegistry | null; warnings: string[] };

/** Read + validate the registry file. Three-tier contract (same as the
 *  character store):
 *  - unparseable JSON  → quarantine to .bak, warn, treat as missing;
 *  - schema-invalid    → per-connection salvage (valid kept, invalid dropped),
 *                        archive original to .bak, write the cleaned file;
 *  - valid v0 (bare)   → stamp schemaVersion, archive original to .bak.
 *  Keys are persisted still-sealed; the returned registry is decrypted. */
function readRegistry(dir: string): ReadResult {
  const path = registryPath(dir);
  const warnings: string[] = [];
  if (!existsSync(path)) return { registry: null, warnings };

  let raw: unknown;
  try {
    raw = JSON.parse(readFileSync(path, "utf8"));
  } catch {
    const backup = quarantineFile(path, "registry unreadable");
    const label = backup ? `quarantined to ${backup}` : "quarantine failed";
    warnings.push(`providers.json was unreadable (${label}) — starting with an empty registry.`);
    console.warn(`[providers] unreadable — ${label}`);
    return { registry: null, warnings };
  }

  const file = ProviderRegistryFileSchema.safeParse(raw);
  if (file.success) {
    if (!(raw as Record<string, unknown>).schemaVersion) {
      const backup = backupFile(path);
      atomicWriteJson(path, file.data);
      warnings.push(`providers.json migrated to the versioned format (previous file archived to ${backup ?? "?"}).`);
      console.warn(`[providers] v0 → v1; archived ${backup ?? "?"}`);
    }
    const vaultKey = loadOrCreateVaultKey(dir);
    return {
      registry: {
        activeProviderId: file.data.activeProviderId,
        connections: decryptConnections(file.data.connections, vaultKey),
      },
      warnings,
    };
  }

  // Schema-invalid but parseable — salvage valid connections.
  const rawObj = (raw ?? {}) as Record<string, unknown>;
  const rawConns = Array.isArray(rawObj.connections) ? (rawObj.connections as unknown[]) : [];
  const kept: ProviderConnection[] = [];
  let dropped = 0;
  for (const c of rawConns) {
    const parsed = ProviderConnectionSchema.safeParse(c);
    if (parsed.success) kept.push(parsed.data);
    else dropped += 1;
  }
  const active = typeof rawObj.activeProviderId === "string" ? rawObj.activeProviderId : "";
  const salvaged: ProviderRegistry = {
    activeProviderId: kept.some((c) => c.id === active) ? active : (kept[0]?.id ?? ""),
    connections: kept,
  };
  const backup = backupFile(path);
  const sealed: ProviderRegistryFile = { schemaVersion: 1, ...salvaged };
  atomicWriteJson(path, sealed);
  warnings.push(
    dropped > 0
      ? `providers.json had ${dropped} invalid connection${dropped === 1 ? "" : "s"} — dropped; the ${kept.length} valid one${kept.length === 1 ? "" : "s"} were kept (original archived to ${backup ?? "?"}).`
      : `providers.json was invalid — the readable connections were recovered (original archived to ${backup ?? "?"}).`
  );
  console.warn(`[providers] salvaged ${kept.length} connection(s), dropped ${dropped}; archived ${backup ?? "?"}`);
  const vaultKey = loadOrCreateVaultKey(dir);
  return {
    registry: {
      activeProviderId: salvaged.activeProviderId,
      connections: decryptConnections(salvaged.connections, vaultKey),
    },
    warnings,
  };
}

function writeRegistry(dir: string, reg: ProviderRegistry): void {
  mkdirSync(dir, { recursive: true });
  const vaultKey = loadOrCreateVaultKey(dir);
  const sealed: ProviderRegistryFile = {
    schemaVersion: 1,
    activeProviderId: reg.activeProviderId,
    connections: reg.connections.map((c) =>
      c.apiKey ? { ...c, apiKey: encryptApiKey(c.apiKey, vaultKey) } : c
    ),
  };
  atomicWriteJson(registryPath(dir), sealed);
}

/** Fresh installs start with an EMPTY registry — no built-in connections are
 *  auto-seeded. Users add their own via the UI. (Only called when no
 *  providers.json exists yet, or after a quarantine.) */
export function seedRegistry(dir: string): ProviderRegistry {
  const reg: ProviderRegistry = { activeProviderId: "", connections: [] };
  writeRegistry(dir, reg);
  return reg;
}

/** Read the persisted registry, or seed an empty one when missing/corrupt. */
export function getRegistry(dir: string): ProviderRegistry {
  return readRegistry(dir).registry ?? seedRegistry(dir);
}

export function toPublicConnection(c: ProviderConnection): PublicProviderConnection {
  const { apiKey, ...rest } = c;
  return { ...rest, hasApiKey: Boolean(apiKey), apiKeyMasked: maskApiKey(apiKey) };
}

export function listConnections(dir: string): PublicProviderRegistry {
  const { registry, warnings } = readRegistry(dir);
  const reg = registry ?? seedRegistry(dir);
  return {
    activeProviderId: reg.activeProviderId,
    connections: reg.connections.map(toPublicConnection),
    warnings,
  };
}

export function createConnection(dir: string, input: ProviderConnectionInput): PublicProviderConnection {
  const reg = getRegistry(dir);
  const id = (input.id ?? input.label).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") ||
    `conn_${Date.now()}`;
  if (reg.connections.some((c) => c.id === id)) throw new Error(`Provider id already exists: ${id}`);
  const now = new Date().toISOString();
  const conn: ProviderConnection = {
    id,
    label: input.label,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model,
    temperature: input.temperature ?? 0.8,
    maxTokens: input.maxTokens ?? 1200,
    contextWindow: input.contextWindow ?? 32768,
    createdAt: now,
    updatedAt: now
  };
  if (typeof input.apiKey === "string" && input.apiKey.trim()) conn.apiKey = input.apiKey.trim();
  reg.connections.push(conn);
  if (!reg.connections.some((c) => c.id === reg.activeProviderId)) {
    reg.activeProviderId = id;
    conn.lastActiveAt = now;
  }
  writeRegistry(dir, reg);
  return toPublicConnection(conn);
}

export function updateConnection(dir: string, id: string, input: ProviderConnectionInput): PublicProviderConnection {
  const reg = getRegistry(dir);
  const idx = reg.connections.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Provider not found: ${id}`);
  const cur = reg.connections[idx];
  const next: ProviderConnection = {
    ...cur,
    ...input,
    id: cur.id, // id is server-owned (derived from the label at create time)
    baseUrl: input.baseUrl !== undefined ? normalizeBaseUrl(input.baseUrl) : cur.baseUrl,
    apiKey: input.apiKey ?? cur.apiKey,
  };
  if (input.apiKey === null) delete next.apiKey;
  else if (typeof input.apiKey === "string" && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
  next.updatedAt = new Date().toISOString();
  reg.connections[idx] = next;
  writeRegistry(dir, reg);
  return toPublicConnection(next);
}

export function duplicateConnection(dir: string, id: string): PublicProviderConnection {
  const reg = getRegistry(dir);
  const source = reg.connections.find((c) => c.id === id);
  if (!source) throw new Error(`Provider not found: ${id}`);

  const baseId = `${source.id}_copy`;
  let newId = baseId;
  let n = 2;
  while (reg.connections.some((c) => c.id === newId)) {
    newId = `${baseId}_${n}`;
    n += 1;
  }

  const now = new Date().toISOString();
  const copy: ProviderConnection = {
    ...source,            // carries apiKey + headers server-side
    id: newId,
    label: `${source.label} (copy)`,
    readonly: false,      // the copy is always editable
    createdAt: now,
    updatedAt: now
  };
  reg.connections.push(copy);
  writeRegistry(dir, reg);
  return toPublicConnection(copy);
}

export function deleteConnection(dir: string, id: string): PublicProviderRegistry {
  const reg = getRegistry(dir);
  if (!reg.connections.some((c) => c.id === id)) throw new Error(`Provider not found: ${id}`);
  reg.connections = reg.connections.filter((c) => c.id !== id);
  // Deleting the active connection is allowed — the app falls back to the mock
  // provider until another connection is added (createConnection re-activates).
  if (reg.activeProviderId === id) reg.activeProviderId = "";
  writeRegistry(dir, reg);
  return { activeProviderId: reg.activeProviderId, connections: reg.connections.map(toPublicConnection), warnings: [] };
}

export function setActiveConnection(dir: string, id: string): { activeProviderId: string } {
  const reg = getRegistry(dir);
  const conn = reg.connections.find((c) => c.id === id);
  if (!conn) throw new Error(`Provider not found: ${id}`);
  reg.activeProviderId = id;
  conn.lastActiveAt = new Date().toISOString();
  writeRegistry(dir, reg);
  return { activeProviderId: id };
}

export type ModelsProbeResult = {
  ok: boolean;
  status?: number;
  message?: string;
  latencyMs?: number;
  models: string[];
};

/** Parse model ids from the common OpenAI-compatible /models response shapes:
 *  { data: [{ id }] }, { models: [...] }, or a bare array. Dedupes + sorts. */
function parseModelIds(bodyText: string): string[] {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    let raw: unknown[] = [];
    if (Array.isArray(parsed)) {
      raw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.data)) raw = obj.data;
      else if (Array.isArray(obj.models)) raw = obj.models;
    }
    const ids = raw
      .map((entry) => {
        if (typeof entry === "string") return entry;
        if (entry && typeof entry === "object") {
          const id = (entry as Record<string, unknown>).id;
          return typeof id === "string" ? id : null;
        }
        return null;
      })
      .filter((s): s is string => Boolean(s));
    return [...new Set(ids)].sort((a, b) => a.localeCompare(b));
  } catch {
    return [];
  }
}

/** Shared /models probe: reachability + auth check, and the model list when the
 *  response is parseable. Used by both the test and fetch-models paths. */
async function probeProviderModels(
  input: { baseUrl: string; apiKey?: string },
  fetchImpl: typeof fetch = fetch
): Promise<ModelsProbeResult> {
  const base = normalizeBaseUrl(input.baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const start = Date.now();
  try {
    const res = await fetchImpl(`${base}/models`, {
      method: "GET",
      headers: {
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {})
      },
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, status: res.status, latencyMs, models: parseModelIds(await res.text()) };
    }
    return { ok: false, status: res.status, message: (await res.text()).slice(0, 300), latencyMs, models: [] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start, models: [] };
  } finally {
    clearTimeout(timeout);
  }
}

/** Cheap reachability + auth check: GET <base>/models. No token-generating call. */
export async function testProviderConnection(
  input: { baseUrl: string; apiKey?: string },
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status?: number; message?: string; latencyMs?: number }> {
  const { models: _models, ...result } = await probeProviderModels(input, fetchImpl);
  return result;
}

/** Fetch the model list from an OpenAI-compatible server: GET <base>/models. */
export async function fetchProviderModels(
  input: { baseUrl: string; apiKey?: string },
  fetchImpl: typeof fetch = fetch
): Promise<ModelsProbeResult> {
  return probeProviderModels(input, fetchImpl);
}
