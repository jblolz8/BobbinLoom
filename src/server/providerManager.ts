import type { TurnProvider } from "./provider";
import { MockProvider } from "./provider";
import { OpenAICompatibleProvider } from "./openAiCompatibleProvider";
import { resolveConnectionConfig } from "./providerConfig";
import type { PublicProviderConnection, ResolvedProviderConfig } from "./providerConfig";
import type { ImageApiStyle, ProviderConnection } from "../schemas";
import {
  activeConnectionOfKind,
  createConnection,
  deleteConnection as deleteRegistryConnection,
  duplicateConnection as duplicateRegistryConnection,
  fetchProviderImageStyles,
  fetchProviderModels,
  getRegistry,
  listConnections,
  setActiveConnection as setActiveRegistryConnection,
  setGenerationTextProvider as setGenerationRegistryTextProvider,
  testProviderConnection,
  updateConnection
} from "./providerRegistry";
import type { ModelsProbeResult, ProviderConnectionDraft, PublicProviderRegistry, StylesProbeResult } from "./providerRegistry";
import { createImageProvider, UnconfiguredImageProvider } from "./imageProvider";
import type { ImageProvider } from "./imageProvider";

export class ProviderManager {
  constructor(
    private readonly dataDir: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /** The active TEXT connection, or null when no text connection is configured.
   *  Reads the persisted registry (never re-seeds over it — that would wipe
   *  user-created connections on every call). The kind filter is mandatory: the
   *  old `?? connections[0]` fallback could hand a text turn an image endpoint. */
  private activeTextConnection() {
    return activeConnectionOfKind(getRegistry(this.dataDir), "text");
  }

  /** The active IMAGE connection, or null. Never returns a text connection. */
  private activeImageConnection() {
    return activeConnectionOfKind(getRegistry(this.dataDir), "image");
  }

  /** The text connection a request should use: an explicit id when given (and it
   *  really is a text connection), else the active text connection. Same rule as
   *  `imageConnection`, and the reason a deleted choice degrades instead of failing. */
  textConnection(id?: string): ProviderConnection | null {
    if (id) {
      const explicit = getRegistry(this.dataDir).connections.find((c) => c.id === id && c.kind === "text");
      if (explicit) return explicit;
    }
    return this.activeTextConnection();
  }

  /** The stored "which connection creates new playthroughs" preference, or null when
   *  unset — null means the caller should follow the active connection. */
  generationTextProviderId(): string | null {
    return getRegistry(this.dataDir).generationTextProviderId ?? null;
  }

  setGenerationTextProvider(id: string | null): PublicProviderRegistry {
    return setGenerationRegistryTextProvider(this.dataDir, id);
  }

  getProvider(id?: string): TurnProvider {
    const conn = this.textConnection(id);
    if (!conn) return new MockProvider(); // no text connection configured yet
    return new OpenAICompatibleProvider(resolveConnectionConfig(conn, this.env));
  }

  /** The chosen connection's budget. Must take the same id as `getProvider`: budgeting
   *  the opening turn for a different model than the one writing it is silent. */
  getContextWindow(id?: string): number {
    return this.textConnection(id)?.contextWindow ?? 32768;
  }

  getMaxTokens(id?: string): number {
    return this.textConnection(id)?.maxTokens ?? 1200;
  }

  /** The image connection a request should use: an explicit id when given (and
   *  it really is an image connection), else the active image connection. */
  imageConnection(id?: string): ProviderConnection | null {
    if (id) {
      const explicit = this.imageConnectionById(id);
      if (explicit) return explicit;
    }
    return this.activeImageConnection();
  }

  /** The image connection an id names EXACTLY, without `imageConnection`'s
   *  active-connection fallback. Null when the id is unknown or names a text
   *  connection.
   *
   *  The re-send path needs this: a stored request body was composed for ONE
   *  dialect and ONE endpoint (and, on a1111, names the checkpoint it pinned), so
   *  a body whose connection has been deleted must be REPORTED — falling back to
   *  whatever is active now would post a body nothing ever composed to an
   *  endpoint that never asked for it, usually without an error. */
  imageConnectionById(id: string): ProviderConnection | null {
    const explicit = getRegistry(this.dataDir).connections.find((c) => c.id === id && c.kind === "image");
    return explicit ?? null;
  }

  /** The image provider for a request: the explicit connection when it resolves
   *  to a real image connection, else the active one, else the throwing
   *  placeholder that the route turns into a 400. */
  getImageProvider(id?: string): ImageProvider {
    const conn = this.imageConnection(id);
    if (!conn) return new UnconfiguredImageProvider();
    return createImageProvider(conn, this.env, this.fetchImpl);
  }

  /** The config used to WRITE image prompts: the image connection's
   *  promptProviderId when it still resolves to a text connection, else the
   *  active text connection. null ⇒ no text provider available (the route turns
   *  that into a 400). */
  resolveImagePromptConfig(imageConn: ProviderConnection | null): ResolvedProviderConfig | null {
    const reg = getRegistry(this.dataDir);
    if (imageConn?.promptProviderId) {
      const writer = reg.connections.find((c) => c.id === imageConn.promptProviderId && c.kind === "text");
      if (writer) return resolveConnectionConfig(writer, this.env);
    }
    const active = activeConnectionOfKind(reg, "text");
    return active ? resolveConnectionConfig(active, this.env) : null;
  }

  // ── Connection CRUD ──
  listConnections(): PublicProviderRegistry {
    return listConnections(this.dataDir);
  }
  createConnection(input: ProviderConnectionDraft): PublicProviderConnection {
    return createConnection(this.dataDir, input);
  }
  updateConnection(id: string, input: ProviderConnectionDraft): PublicProviderConnection {
    return updateConnection(this.dataDir, id, input);
  }
  duplicateConnection(id: string): PublicProviderConnection {
    return duplicateRegistryConnection(this.dataDir, id);
  }
  deleteConnection(id: string): PublicProviderRegistry {
    return deleteRegistryConnection(this.dataDir, id);
  }
  setActiveConnection(id: string): PublicProviderRegistry {
    return setActiveRegistryConnection(this.dataDir, id);
  }

  /** Resolve a probe target: a saved connection id (uses the STORED key — never
   *  sent back to the client) or an unsaved draft's baseUrl/apiKey. The dialect
   *  rides along so the probe can pick the right endpoint: for a saved
   *  connection the STORED apiStyle is authoritative (a client that sends no
   *  style must not silently downgrade an a1111 probe to the OpenAI lane),
   *  while a draft states its own. */
  private resolveProbeTarget(input: {
    id?: string;
    baseUrl?: string;
    apiKey?: string;
    apiStyle?: ImageApiStyle;
  }): { baseUrl: string; apiKey?: string; apiStyle?: ImageApiStyle } {
    if (input.id) {
      const reg = getRegistry(this.dataDir);
      const conn = reg.connections.find((c) => c.id === input.id);
      if (!conn) throw new Error(`Provider not found: ${input.id}`);
      return { baseUrl: conn.baseUrl, apiKey: conn.apiKey, apiStyle: conn.apiStyle };
    }
    if (!input.baseUrl) throw new Error("baseUrl is required when no connection id is given");
    return { baseUrl: input.baseUrl, apiKey: input.apiKey, apiStyle: input.apiStyle };
  }

  async testConnection(input: { id?: string; baseUrl?: string; apiKey?: string; apiStyle?: ImageApiStyle }) {
    return testProviderConnection(this.resolveProbeTarget(input), this.fetchImpl);
  }

  async fetchModels(input: {
    id?: string;
    baseUrl?: string;
    apiKey?: string;
    type?: string;
    apiStyle?: ImageApiStyle;
  }): Promise<ModelsProbeResult> {
    return fetchProviderModels({ ...this.resolveProbeTarget(input), type: input.type }, this.fetchImpl);
  }

  /** Probe the provider's image style list (`GET <baseUrl>/image/styles`).
   *  Same target resolution as the models probe — a saved id uses the STORED
   *  key, which is never sent back to the client — except that a base URL is
   *  OPTIONAL: the endpoint is keyless and has a documented default host, so
   *  the probe's own fallback applies when the caller has none. An unknown id
   *  still throws (the route turns that into a 500, like the models probe). */
  async fetchImageStyles(input: { id?: string; baseUrl?: string; apiKey?: string }): Promise<StylesProbeResult> {
    if (input.id) {
      return fetchProviderImageStyles(this.resolveProbeTarget({ id: input.id }), this.fetchImpl);
    }
    return fetchProviderImageStyles({ baseUrl: input.baseUrl, apiKey: input.apiKey }, this.fetchImpl);
  }

  /** Full stored key for a connection — used only for on-demand reveal in the UI. */
  getApiKey(id: string): { apiKey: string } {
    const reg = getRegistry(this.dataDir);
    const conn = reg.connections.find((c) => c.id === id);
    if (!conn) throw new Error(`Provider not found: ${id}`);
    return { apiKey: conn.apiKey ?? "" };
  }
}

export function createProviderManager(dataDir: string): ProviderManager {
  return new ProviderManager(dataDir);
}
