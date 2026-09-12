import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { atomicWriteJson, backupFile, quarantineFile } from "./persistence";
import { maskApiKey, normalizeBaseUrl, normalizeImageBaseUrl } from "./providerConfig";
import { authHeaders } from "./httpAuth";
import { ProviderConnectionSchema, ProviderRegistryFileSchema } from "../schemas";
import type { ImageApiStyle, ProviderConnection, ProviderKind, ProviderRegistryFile } from "../schemas";
import type { ProviderConnectionInput, PublicProviderConnection } from "./providerConfig";
import { decryptApiKey, encryptApiKey, loadOrCreateVaultKey } from "./keyVault";

export type ProviderRegistry = {
  activeTextProviderId: string;
  activeImageProviderId: string;
  connections: ProviderConnection[];
};

export type PublicProviderRegistry = Omit<ProviderRegistry, "connections"> & {
  connections: PublicProviderConnection[];
  warnings: string[];
};

/** createConnection/updateConnection input: the shared connection fields plus
 *  the registry-v2 `kind` discriminator and the image-only fields. Declared
 *  here (and not in providerConfig.ts, which owns ProviderConnectionInput) so
 *  the image surface stays inside the registry. */
export type ProviderConnectionDraft = ProviderConnectionInput & {
  kind?: ProviderKind;
  apiStyle?: ImageApiStyle;
  safeMode?: boolean;
  size?: string;
  aspectRatio?: string;
  promptProviderId?: string | null;
  stylePreset?: string;
  hideWatermark?: boolean;
  variants?: number;
  /** `null` clears the stored seed (the editor's empty field), the same
   *  convention `apiKey` uses — an absent key cannot overwrite a stored value. */
  seed?: number | null;
  // ── a1111-only sampling controls; absent = the WebUI's own defaults ──
  steps?: number;
  cfgScale?: number;
  sampler?: string;
  scheduler?: string;
  timeoutMs?: number;
};

/** Connections of one kind, and the active one among them. The kind filter is
 *  mandatory — the old `?? connections[0]` fallback would hand a text turn an
 *  image endpoint (and vice versa). */
export function activeConnectionOfKind(reg: ProviderRegistry, kind: ProviderKind): ProviderConnection | null {
  const of = reg.connections.filter((c) => c.kind === kind);
  const wanted = kind === "text" ? reg.activeTextProviderId : reg.activeImageProviderId;
  return of.find((c) => c.id === wanted) ?? of[0] ?? null;
}

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

/** v1 (and bare v0) → v2: `activeProviderId` splits into activeTextProviderId
 *  plus an empty activeImageProviderId, and every connection is stamped
 *  `kind: "text"` (an explicit kind wins). Archived to .bak, like the v0 path. */
function migrateToV2(raw: Record<string, unknown>): Record<string, unknown> {
  const connections = Array.isArray(raw.connections) ? raw.connections : [];
  return {
    schemaVersion: 2,
    activeTextProviderId:
      typeof raw.activeTextProviderId === "string" ? raw.activeTextProviderId
      : typeof raw.activeProviderId === "string" ? raw.activeProviderId : "",
    activeImageProviderId: typeof raw.activeImageProviderId === "string" ? raw.activeImageProviderId : "",
    connections: connections.map((c) =>
      c && typeof c === "object" && !Array.isArray(c)
        ? { kind: "text", ...(c as Record<string, unknown>) }
        : c
    ),
  };
}

/** Read + validate the registry file. Three-tier contract (same as the
 *  character store):
 *  - unparseable JSON  → quarantine to .bak, warn, treat as missing;
 *  - schema-invalid    → per-connection salvage (valid kept, invalid dropped),
 *                        archive original to .bak, write the cleaned file;
 *  - valid v0/v1       → migrate to the v2 shape (two active slots + per-row
 *                        kind), archive original to .bak.
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
    const rawObj = (raw ?? {}) as Record<string, unknown>;
    // v0 has no schemaVersion; v1 has schemaVersion 1 + activeProviderId. Both
    // parse "successfully" under the v2 schema (the unknown key is stripped and
    // activeTextProviderId defaults to ""), which would SILENTLY lose the active
    // id — so migrate from the RAW object, never from the parse output. A v2
    // file (schemaVersion 2 + the slot present) passes straight through.
    if (rawObj.schemaVersion !== 2 || typeof rawObj.activeTextProviderId !== "string") {
      const backup = backupFile(path);
      const migrated = migrateToV2(rawObj);
      atomicWriteJson(path, migrated);
      warnings.push(`providers.json migrated to the versioned format (previous file archived to ${backup ?? "?"}).`);
      console.warn(`[providers] → v2; archived ${backup ?? "?"}`);
      // Re-parse what we just wrote so the returned registry is validated + typed.
      const parsed = ProviderRegistryFileSchema.parse(migrated);
      const vaultKey = loadOrCreateVaultKey(dir);
      return {
        registry: {
          activeTextProviderId: parsed.activeTextProviderId,
          activeImageProviderId: parsed.activeImageProviderId,
          connections: decryptConnections(parsed.connections, vaultKey),
        },
        warnings,
      };
    }
    const vaultKey = loadOrCreateVaultKey(dir);
    return {
      registry: {
        activeTextProviderId: file.data.activeTextProviderId,
        activeImageProviderId: file.data.activeImageProviderId,
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
  const rawActive =
    typeof rawObj.activeTextProviderId === "string" ? rawObj.activeTextProviderId
    : typeof rawObj.activeProviderId === "string" ? rawObj.activeProviderId : "";
  const keptText = kept.filter((c) => c.kind === "text");
  const salvaged: ProviderRegistry = {
    activeTextProviderId: keptText.some((c) => c.id === rawActive) ? rawActive : (keptText[0]?.id ?? ""),
    activeImageProviderId: "",
    connections: kept,   // ProviderConnectionSchema now defaults every kept row to kind: "text"
  };
  const backup = backupFile(path);
  const sealed: ProviderRegistryFile = { schemaVersion: 2, ...salvaged };
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
      activeTextProviderId: salvaged.activeTextProviderId,
      activeImageProviderId: salvaged.activeImageProviderId,
      connections: decryptConnections(salvaged.connections, vaultKey),
    },
    warnings,
  };
}

function writeRegistry(dir: string, reg: ProviderRegistry): void {
  mkdirSync(dir, { recursive: true });
  const vaultKey = loadOrCreateVaultKey(dir);
  const sealed: ProviderRegistryFile = {
    schemaVersion: 2,
    activeTextProviderId: reg.activeTextProviderId,
    activeImageProviderId: reg.activeImageProviderId,
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
  const reg: ProviderRegistry = { activeTextProviderId: "", activeImageProviderId: "", connections: [] };
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
    activeTextProviderId: reg.activeTextProviderId,
    activeImageProviderId: reg.activeImageProviderId,
    connections: reg.connections.map(toPublicConnection),
    warnings,
  };
}

export function createConnection(dir: string, input: ProviderConnectionDraft): PublicProviderConnection {
  const reg = getRegistry(dir);
  const id = (input.id ?? input.label).trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "_") ||
    `conn_${Date.now()}`;
  if (reg.connections.some((c) => c.id === id)) throw new Error(`Provider id already exists: ${id}`);
  const kind: ProviderKind = input.kind ?? "text";
  const now = new Date().toISOString();
  const conn: ProviderConnection = {
    id,
    label: input.label,
    // Style-aware: an a1111 connection is served from the WebUI ROOT, so it
    // must NOT gain the OpenAI-style /v1 segment at write time (every request
    // would then become /v1/sdapi/v1/...). Everything else is unchanged.
    baseUrl: normalizeImageBaseUrl(input.baseUrl, input.apiStyle),
    model: input.model,
    temperature: input.temperature ?? 0.8,
    maxTokens: input.maxTokens ?? 1200,
    contextWindow: input.contextWindow ?? 32768,
    kind,
    // image-only fields — copied straight off the input when the caller sent them
    apiStyle: input.apiStyle,
    safeMode: input.safeMode,
    size: input.size,
    aspectRatio: input.aspectRatio,
    promptProviderId: input.promptProviderId,
    stylePreset: input.stylePreset,
    hideWatermark: input.hideWatermark,
    variants: input.variants,
    // Never a null on disk: null is only the write-side "clear" signal.
    seed: input.seed ?? undefined,
    // a1111-only; absent fields stay absent so the WebUI keeps its own defaults
    steps: input.steps,
    cfgScale: input.cfgScale,
    sampler: input.sampler,
    scheduler: input.scheduler,
    timeoutMs: input.timeoutMs,
    createdAt: now,
    updatedAt: now
  };
  if (typeof input.apiKey === "string" && input.apiKey.trim()) conn.apiKey = input.apiKey.trim();
  reg.connections.push(conn);
  // Auto-activate only when THIS kind has no active connection yet — adding a
  // text connection must never steal (or be stolen by) the image slot.
  const activeKey = kind === "text" ? "activeTextProviderId" : "activeImageProviderId";
  if (!reg.connections.some((c) => c.kind === kind && c.id === reg[activeKey])) {
    reg[activeKey] = id;
    conn.lastActiveAt = now;
  }
  writeRegistry(dir, reg);
  return toPublicConnection(conn);
}

export function updateConnection(dir: string, id: string, input: ProviderConnectionDraft): PublicProviderConnection {
  const reg = getRegistry(dir);
  const idx = reg.connections.findIndex((c) => c.id === id);
  if (idx === -1) throw new Error(`Provider not found: ${id}`);
  const cur = reg.connections[idx];
  // `seed` is pulled OUT of the spread: null is the write-side "clear" signal
  // and must never reach the persisted row (the schema holds a number only).
  const { seed, ...rest } = input;
  const next: ProviderConnection = {
    ...cur,
    ...rest,
    id: cur.id, // id is server-owned (derived from the label at create time)
    // The style may be only STORED (an editor PUT that resends the base URL but
    // not the style), so the current row's style is the fallback — otherwise an
    // a1111 row would silently acquire a /v1 suffix on an unrelated edit.
    baseUrl:
      input.baseUrl !== undefined
        ? normalizeImageBaseUrl(input.baseUrl, input.apiStyle ?? cur.apiStyle)
        : cur.baseUrl,
    apiKey: input.apiKey ?? cur.apiKey,
  };
  if (input.apiKey === null) delete next.apiKey;
  else if (typeof input.apiKey === "string" && input.apiKey.trim()) next.apiKey = input.apiKey.trim();
  // null clears a stored seed — an absent field cannot overwrite one, so the
  // editor's emptied Seed box has no other way to go back to a random seed.
  if (seed === null) delete next.seed;
  else if (seed !== undefined) next.seed = seed;
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
  // Only the slot this id occupied clears: never promote the other kind.
  if (reg.activeTextProviderId === id) reg.activeTextProviderId = "";
  if (reg.activeImageProviderId === id) reg.activeImageProviderId = "";
  writeRegistry(dir, reg);
  return {
    activeTextProviderId: reg.activeTextProviderId,
    activeImageProviderId: reg.activeImageProviderId,
    connections: reg.connections.map(toPublicConnection),
    warnings: [],
  };
}

/** Activate a connection in the slot matching its KIND (a text connection can
 *  never take the image slot). Returns the full public registry so the client
 *  can replace its state in one call instead of activate-then-reload. */
export function setActiveConnection(dir: string, id: string): PublicProviderRegistry {
  const reg = getRegistry(dir);
  const conn = reg.connections.find((c) => c.id === id);
  if (!conn) throw new Error(`Provider not found: ${id}`);
  if (conn.kind === "image") {
    reg.activeImageProviderId = id;
  } else {
    reg.activeTextProviderId = id;
  }
  conn.lastActiveAt = new Date().toISOString();
  writeRegistry(dir, reg);
  return {
    activeTextProviderId: reg.activeTextProviderId,
    activeImageProviderId: reg.activeImageProviderId,
    connections: reg.connections.map(toPublicConnection),
    warnings: [],
  };
}

/** Steps one model publishes: its default and its ceiling. */
export type ModelStepRange = { default?: number; max?: number };

/** What a model's `model_spec.constraints` says it accepts. Deliberately a
 *  plain, tolerant shape: every field is optional, an omitted one simply says
 *  nothing, and a model whose spec publishes nothing useful maps to no entry at
 *  all rather than to an empty object. The UI reads this to show WHICH sizing
 *  parameter a model takes — `aspectRatios` is present when the model wants
 *  `aspect_ratio` (and rejects `width`/`height`), `widthHeightDivisor` when it
 *  wants `width`/`height`. */
export type ModelCapabilities = {
  promptCharacterLimit?: number;
  steps?: ModelStepRange;
  /** `width`/`height` must be multiples of this. */
  widthHeightDivisor?: number;
  aspectRatios?: string[];
  defaultAspectRatio?: string;
  /** Whatever the model's `resolution` field publishes, flattened to plain
   *  tier strings. */
  resolutions?: string[];
};

/** Per-model capabilities, keyed by the model id the same listing returned. */
export type ProviderModelCapabilities = Record<string, ModelCapabilities>;

export type ModelsProbeResult = {
  ok: boolean;
  status?: number;
  message?: string;
  latencyMs?: number;
  models: string[];
  /** Parsed from the SAME response as `models`. Always present (an empty map
   *  when the listing said nothing useful or the probe failed) so a caller can
   *  read it without a guard. */
  modelSpecs: ProviderModelCapabilities;
  /** A1111 only: the sampler and scheduler names the WebUI itself publishes,
   *  fetched best-effort from `/sdapi/v1/samplers` and `/sdapi/v1/schedulers`.
   *  Absent when neither answered (an older build may have no schedulers), and
   *  partially populated when only one did — a missing list is never an error:
   *  the editor falls back to a free-text field, which is how a fork's own
   *  sampler name gets typed anyway. */
  dialectOptions?: { samplers?: string[]; schedulers?: string[] };
};

/** A finite number, or nothing (a string, null, NaN and Infinity all mean the
 *  provider said nothing usable). */
function numberOrUndefined(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** A string, or an array of them, deduped and trimmed. Anything else — or an
 *  empty result — is absent. */
function stringsOrUndefined(value: unknown): string[] | undefined {
  const list = typeof value === "string" ? [value] : Array.isArray(value) ? value : null;
  if (!list) return undefined;
  const trimmed = list
    .map((entry) => (typeof entry === "string" ? entry.trim() : ""))
    .filter(Boolean);
  return trimmed.length ? [...new Set(trimmed)] : undefined;
}

/** Every string inside an arbitrary value, deduped. `resolution` is published
 *  in more than one shape (a flat list of tiers, or an object keyed by aspect
 *  ratio), so the tiers are collected structurally instead of guessing one
 *  shape. Depth-bounded: a pathological body must not recurse forever. */
function collectStrings(value: unknown, depth = 0): string[] {
  if (depth > 3) return [];
  if (typeof value === "string") return value.trim() ? [value.trim()] : [];
  if (Array.isArray(value)) return value.flatMap((entry) => collectStrings(entry, depth + 1));
  if (value && typeof value === "object") {
    return Object.values(value as Record<string, unknown>).flatMap((entry) => collectStrings(entry, depth + 1));
  }
  return [];
}

/** `steps` as either a bare number (the default) or `{ default, max }`. */
function parseSteps(value: unknown): ModelStepRange | undefined {
  if (typeof value === "number") {
    const only = numberOrUndefined(value);
    return only === undefined ? undefined : { default: only };
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const raw = value as Record<string, unknown>;
  const steps: ModelStepRange = {
    default: numberOrUndefined(raw.default),
    max: numberOrUndefined(raw.max)
  };
  return steps.default === undefined && steps.max === undefined ? undefined : steps;
}

/** One model's `model_spec.constraints`, tolerant by construction: each field
 *  is carried only when the provider actually published a usable value, and a
 *  constraints object that says nothing usable maps to `null`. */
function parseCapabilities(constraints: unknown): ModelCapabilities | null {
  if (!constraints || typeof constraints !== "object" || Array.isArray(constraints)) return null;
  const raw = constraints as Record<string, unknown>;
  const caps: ModelCapabilities = {};

  const promptCharacterLimit = numberOrUndefined(raw.promptCharacterLimit);
  if (promptCharacterLimit !== undefined) caps.promptCharacterLimit = promptCharacterLimit;

  const steps = parseSteps(raw.steps);
  if (steps) caps.steps = steps;

  const widthHeightDivisor = numberOrUndefined(raw.widthHeightDivisor);
  if (widthHeightDivisor !== undefined) caps.widthHeightDivisor = widthHeightDivisor;

  const aspectRatios = stringsOrUndefined(raw.aspectRatios);
  if (aspectRatios) caps.aspectRatios = aspectRatios;

  const defaultAspectRatio = stringsOrUndefined(raw.defaultAspectRatio);
  if (defaultAspectRatio) caps.defaultAspectRatio = defaultAspectRatio[0];

  const resolutions = [...new Set(collectStrings(raw.resolution))];
  if (resolutions.length) caps.resolutions = resolutions;

  return Object.keys(caps).length ? caps : null;
}

/** Parse the model list out of the common OpenAI-compatible `/models` response
 *  shapes: `{ data: [{ id, model_spec }] }`, `{ models: [...] }`, or a bare
 *  array. Ids are deduped + sorted (and mean exactly what they always meant);
 *  `modelSpecs` is the per-model capability map read from the SAME response, so
 *  showing a model's constraints costs no second request. A model with no
 *  `model_spec` maps to nothing — never to an empty capability object. */
function parseModels(bodyText: string): { models: string[]; modelSpecs: ProviderModelCapabilities } {
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
    const ids: string[] = [];
    const modelSpecs: ProviderModelCapabilities = {};
    for (const entry of raw) {
      if (typeof entry === "string") {
        if (entry) ids.push(entry);
        continue;
      }
      if (!entry || typeof entry !== "object") continue;
      const row = entry as Record<string, unknown>;
      if (typeof row.id !== "string" || !row.id) continue;
      ids.push(row.id);
      const spec = row.model_spec && typeof row.model_spec === "object"
        ? (row.model_spec as Record<string, unknown>)
        : null;
      const caps = parseCapabilities(spec?.constraints);
      // First mention wins: a duplicate id is the same model twice.
      if (caps && !modelSpecs[row.id]) modelSpecs[row.id] = caps;
    }
    return {
      models: [...new Set(ids)].sort((a, b) => a.localeCompare(b)),
      modelSpecs
    };
  } catch {
    return { models: [], modelSpecs: {} };
  }
}

/** Shared /models probe: reachability + auth check, and the model list when the
 *  response is parseable. Used by both the test and fetch-models paths.
 *  `type` is forwarded as the `type` query parameter — image endpoints (Venice)
 *  list image checkpoints behind `GET /models?type=image` and return a text
 *  list without it.
 *
 *  The same pass also reads each model's `model_spec.constraints` into
 *  `modelSpecs` (prompt cap, steps, sizing rules), because that is the only
 *  place a provider publishes what a given model actually accepts — and asking
 *  for it twice would be two round trips for one body.
 *
 *  `apiStyle` picks the DIALECT, not a flavor of the same request: an a1111
 *  connection shares no path, no list shape and no auth rule with the
 *  OpenAI-compatible probe, so it is routed to its own implementation. */
async function probeProviderModels(
  input: { baseUrl: string; apiKey?: string; type?: string; apiStyle?: ImageApiStyle },
  fetchImpl: typeof fetch = fetch
): Promise<ModelsProbeResult> {
  if ((input.apiStyle ?? "openai") === "a1111") return probeA1111Models(input, fetchImpl);
  const base = normalizeImageBaseUrl(input.baseUrl, input.apiStyle);
  const query = input.type ? `?type=${encodeURIComponent(input.type)}` : "";
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const start = Date.now();
  try {
    const res = await fetchImpl(`${base}/models${query}`, {
      method: "GET",
      headers: authHeaders(input.apiKey, input.apiStyle),
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      // One parse serves both halves: the id list and the per-model
      // capabilities, so the UI never needs a second request for them.
      return { ok: true, status: res.status, latencyMs, ...parseModels(await res.text()) };
    }
    // A failed probe says nothing about any model: an EMPTY map, not an error.
    return { ok: false, status: res.status, message: (await res.text()).slice(0, 300), latencyMs, models: [], modelSpecs: {} };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start, models: [], modelSpecs: {} };
  } finally {
    clearTimeout(timeout);
  }
}

/** A1111's API only exists when the WebUI was started with `--api`; without
 *  that flag every `/sdapi/v1/*` route answers 404 and the user has no way to
 *  tell a missing flag from a wrong URL. Appended to the 404 message so the
 *  settings UI can show the fix instead of a bare "Not Found". */
export const A1111_API_MISSING_HINT =
  "the WebUI must be started with --api — without it every /sdapi/v1/* route answers 404";

/** Parse `GET /sdapi/v1/sd-models` → `[{title, model_name, hash, …}]` into
 *  checkpoint names. The server's ORDER is preserved and duplicates dropped:
 *  a WebUI lists recently-used checkpoints first, a curated order the UI must
 *  not silently rearrange (the same contract as the Venice style list, and the
 *  opposite of the alphabetical OpenAI id list). */
function parseA1111Checkpoints(bodyText: string): string[] {
  return parseA1111Names(bodyText, ["title", "model_name"]);
}

/** Parse `GET /sdapi/v1/samplers` and `/schedulers` → `[{name, aliases, …}]`.
 *  Tolerant of a bare string array too, so a fork that answers with names only
 *  still populates the list. */
function parseA1111Names(bodyText: string, keys: string[] = ["name"]): string[] {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    if (!Array.isArray(parsed)) return [];
    const names = parsed
      .map((entry) => {
        if (typeof entry === "string") return entry.trim() || null;
        if (!entry || typeof entry !== "object") return null;
        const row = entry as Record<string, unknown>;
        for (const key of keys) {
          const value = row[key];
          if (typeof value === "string" && value.trim()) return value.trim();
        }
        return null;
      })
      .filter((n): n is string => Boolean(n));
    return [...new Set(names)];
  } catch {
    return [];
  }
}

/** One of A1111's optional lists, best effort: a missing, slow, failed or
 *  unparseable endpoint yields nothing and must NEVER fail the probe — the
 *  editor just falls back to a free-text field. */
async function fetchA1111Names(
  url: string,
  headers: Record<string, string>,
  fetchImpl: typeof fetch
): Promise<string[] | undefined> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5_000);
  try {
    const res = await fetchImpl(url, { method: "GET", headers, signal: controller.signal });
    if (!res.ok) return undefined;
    const names = parseA1111Names(await res.text());
    return names.length ? names : undefined;
  } catch {
    return undefined;
  } finally {
    clearTimeout(timeout);
  }
}

/** The a1111 dialect's probe: `GET <WebUI ROOT>/sdapi/v1/sd-models` for the
 *  checkpoints, plus the sampler and scheduler lists in parallel.
 *
 *  The base URL is the WebUI ROOT — normalizeImageBaseUrl, never the /v1
 *  normalization: an OpenAI-style suffix turns every path into
 *  `/v1/sdapi/v1/...` and 404s. Auth follows the same dialect rule as the
 *  adapter (`user:pass` → Basic, anything else → Bearer). */
async function probeA1111Models(
  input: { baseUrl: string; apiKey?: string },
  fetchImpl: typeof fetch
): Promise<ModelsProbeResult> {
  const base = normalizeImageBaseUrl(input.baseUrl, "a1111");
  const headers = authHeaders(input.apiKey, "a1111");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const start = Date.now();
  try {
    const res = await fetchImpl(`${base}/sdapi/v1/sd-models`, {
      method: "GET",
      headers,
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    if (!res.ok) {
      const body = (await res.text()).slice(0, 300);
      return {
        ok: false,
        status: res.status,
        message: res.status === 404 ? `${body} — ${A1111_API_MISSING_HINT}` : body,
        latencyMs,
        models: [],
        modelSpecs: {}
      };
    }
    const models = parseA1111Checkpoints(await res.text());
    // Both lists at once — they are independent, and one failing must not cost
    // the other. `Promise.all` here can never reject: each fetcher swallows.
    const [samplers, schedulers] = await Promise.all([
      fetchA1111Names(`${base}/sdapi/v1/samplers`, headers, fetchImpl),
      fetchA1111Names(`${base}/sdapi/v1/schedulers`, headers, fetchImpl)
    ]);
    const dialectOptions: NonNullable<ModelsProbeResult["dialectOptions"]> = {};
    if (samplers) dialectOptions.samplers = samplers;
    if (schedulers) dialectOptions.schedulers = schedulers;
    return {
      ok: true,
      status: res.status,
      latencyMs,
      models,
      // An A1111 listing publishes no `model_spec` constraints, so the map is
      // empty — the same answer as a provider that publishes none.
      modelSpecs: {},
      ...(samplers || schedulers ? { dialectOptions } : {})
    };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start, models: [], modelSpecs: {} };
  } finally {
    clearTimeout(timeout);
  }
}

/** Cheap reachability + auth check: GET <base>/models. No token-generating call. */
export async function testProviderConnection(
  input: { baseUrl: string; apiKey?: string; apiStyle?: ImageApiStyle },
  fetchImpl: typeof fetch = fetch
): Promise<{ ok: boolean; status?: number; message?: string; latencyMs?: number }> {
  // The probe answers {ok, models, modelSpecs, dialectOptions, status, message,
  // latencyMs}; a reachability check wants none of the listing, so all of it is
  // stripped — models, modelSpecs and the dialect's own option lists.
  const { models: _models, modelSpecs: _modelSpecs, dialectOptions: _dialectOptions, ...result } =
    await probeProviderModels(input, fetchImpl);
  return result;
}

/** Fetch the model list from an OpenAI-compatible server: GET <base>/models
 *  (with `?type=<type>` when the caller asks for a typed list, e.g. image
 *  checkpoints), or from an A1111 WebUI's own `/sdapi/v1/sd-models` when
 *  `apiStyle` says so. */
export async function fetchProviderModels(
  input: { baseUrl: string; apiKey?: string; type?: string; apiStyle?: ImageApiStyle },
  fetchImpl: typeof fetch = fetch
): Promise<ModelsProbeResult> {
  return probeProviderModels(input, fetchImpl);
}

/** Venice's documented API host, used as the base-URL fallback for the styles
 *  probe below. That endpoint is keyless and Venice is the only known
 *  implementation of it, so a probe with no base URL still has somewhere to go
 *  instead of failing on a missing field. A self-hosted implementation must
 *  supply its own base URL. */
const VENICE_DEFAULT_BASE_URL = "https://api.venice.ai/api/v1";

export type StylesProbeResult = {
  ok: boolean;
  status?: number;
  message?: string;
  latencyMs?: number;
  styles: string[];
};

/** Parse the image style list: `{ data: string[] }` (Venice's shape), with a
 *  `styles` array or a bare array tolerated as fallbacks. Deduped, and the
 *  provider's ORDER is preserved — unlike the model list (sorted, because an
 *  alphabetical id list is easier to scan), this is a curated presentation
 *  order that the UI must not silently rearrange. */
function parseStylePresets(bodyText: string): string[] {
  try {
    const parsed = JSON.parse(bodyText) as unknown;
    let raw: unknown[] = [];
    if (Array.isArray(parsed)) {
      raw = parsed;
    } else if (parsed && typeof parsed === "object") {
      const obj = parsed as Record<string, unknown>;
      if (Array.isArray(obj.data)) raw = obj.data;
      else if (Array.isArray(obj.styles)) raw = obj.styles;
    }
    const styles = raw
      .map((entry) => (typeof entry === "string" ? entry.trim() : null))
      .filter((s): s is string => Boolean(s));
    return [...new Set(styles)];
  } catch {
    return [];
  }
}

/** Probe the provider's image style list: GET <base>/image/styles.
 *
 *  The endpoint is PUBLIC — an unauthenticated call returns the same body as an
 *  authenticated one — so the Authorization header is optional here: it is sent
 *  only when a key is available (harmless upstream, and it keeps the call
 *  correct behind a proxy that requires one). */
export async function fetchProviderImageStyles(
  input: { baseUrl?: string; apiKey?: string },
  fetchImpl: typeof fetch = fetch
): Promise<StylesProbeResult> {
  const base = normalizeBaseUrl(input.baseUrl?.trim() || VENICE_DEFAULT_BASE_URL);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);
  const start = Date.now();
  try {
    const res = await fetchImpl(`${base}/image/styles`, {
      method: "GET",
      headers: {
        ...(input.apiKey ? { Authorization: `Bearer ${input.apiKey}` } : {})
      },
      signal: controller.signal
    });
    const latencyMs = Date.now() - start;
    if (res.ok) {
      return { ok: true, status: res.status, latencyMs, styles: parseStylePresets(await res.text()) };
    }
    return { ok: false, status: res.status, message: (await res.text()).slice(0, 300), latencyMs, styles: [] };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : String(e), latencyMs: Date.now() - start, styles: [] };
  } finally {
    clearTimeout(timeout);
  }
}
