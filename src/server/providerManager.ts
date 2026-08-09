import type { TurnProvider } from "./provider";
import { MockProvider } from "./provider";
import { OpenAICompatibleProvider } from "./openAiCompatibleProvider";
import { resolveConnectionConfig } from "./providerConfig";
import type { ProviderConnectionInput, PublicProviderConnection } from "./providerConfig";
import {
  createConnection,
  deleteConnection as deleteRegistryConnection,
  duplicateConnection as duplicateRegistryConnection,
  fetchProviderModels,
  getRegistry,
  listConnections,
  setActiveConnection as setActiveRegistryConnection,
  testProviderConnection,
  updateConnection
} from "./providerRegistry";
import type { ModelsProbeResult, PublicProviderRegistry } from "./providerRegistry";

export class ProviderManager {
  constructor(
    private readonly dataDir: string,
    private readonly env: NodeJS.ProcessEnv = process.env,
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  /** The active connection, or null when the registry has no connections.
   *  Reads the persisted registry (never re-seeds over it — that would wipe
   *  user-created connections on every call). */
  private activeConnection() {
    const reg = getRegistry(this.dataDir);
    return reg.connections.find((c) => c.id === reg.activeProviderId) ?? reg.connections[0] ?? null;
  }

  getProvider(): TurnProvider {
    const conn = this.activeConnection();
    if (!conn) return new MockProvider(); // no connections configured yet
    return new OpenAICompatibleProvider(resolveConnectionConfig(conn, this.env));
  }

  getContextWindow(): number {
    return this.activeConnection()?.contextWindow ?? 32768;
  }

  getMaxTokens(): number {
    return this.activeConnection()?.maxTokens ?? 1200;
  }

  // ── Connection CRUD ──
  listConnections(): PublicProviderRegistry {
    return listConnections(this.dataDir);
  }
  createConnection(input: ProviderConnectionInput): PublicProviderConnection {
    return createConnection(this.dataDir, input);
  }
  updateConnection(id: string, input: ProviderConnectionInput): PublicProviderConnection {
    return updateConnection(this.dataDir, id, input);
  }
  duplicateConnection(id: string): PublicProviderConnection {
    return duplicateRegistryConnection(this.dataDir, id);
  }
  deleteConnection(id: string): PublicProviderRegistry {
    return deleteRegistryConnection(this.dataDir, id);
  }
  setActiveConnection(id: string): { activeProviderId: string } {
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

  async fetchModels(input: { id?: string; baseUrl?: string; apiKey?: string }): Promise<ModelsProbeResult> {
    return fetchProviderModels(this.resolveProbeTarget(input), this.fetchImpl);
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
