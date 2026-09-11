import type { TurnProvider } from "./provider";
import { MockProvider } from "./provider";
import { OpenAICompatibleProvider } from "./openAiCompatibleProvider";
import { resolveConnectionConfig } from "./providerConfig";
import type { PublicProviderConnection, ResolvedProviderConfig } from "./providerConfig";
import type { ProviderConnection } from "../schemas";
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

  getProvider(): TurnProvider {
    const conn = this.activeTextConnection();
    if (!conn) return new MockProvider(); // no text connection configured yet
    return new OpenAICompatibleProvider(resolveConnectionConfig(conn, this.env));
  }

  getContextWindow(): number {
    return this.activeTextConnection()?.contextWindow ?? 32768;
  }

  getMaxTokens(): number {
    return this.activeTextConnection()?.maxTokens ?? 1200;
  }

  /** The image connection a request should use: an explicit id when given (and
   *  it really is an image connection), else the active image connection. */
  imageConnection(id?: string): ProviderConnection | null {
    if (id) {
      const reg = getRegistry(this.dataDir);
      const explicit = reg.connections.find((c) => c.id === id && c.kind === "image");
      if (explicit) return explicit;
    }
    return this.activeImageConnection();
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
   *  sent back to the client) or an unsaved draft's baseUrl/apiKey. */
  private resolveProbeTarget(input: { id?: string; baseUrl?: string; apiKey?: string }): { baseUrl: string; apiKey?: string } {
    if (input.id) {
      const reg = getRegistry(this.dataDir);
      const conn = reg.connections.find((c) => c.id === input.id);
      if (!conn) throw new Error(`Provider not found: ${input.id}`);
      return { baseUrl: conn.baseUrl, apiKey: conn.apiKey };
    }
    if (!input.baseUrl) throw new Error("baseUrl is required when no connection id is given");
    return { baseUrl: input.baseUrl, apiKey: input.apiKey };
  }

  async testConnection(input: { id?: string; baseUrl?: string; apiKey?: string }) {
    return testProviderConnection(this.resolveProbeTarget(input), this.fetchImpl);
  }

  async fetchModels(input: { id?: string; baseUrl?: string; apiKey?: string; type?: string }): Promise<ModelsProbeResult> {
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
