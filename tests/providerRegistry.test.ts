import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { ProviderConnectionInput } from "../src/server/providerConfig";
import {
  createConnection,
  deleteConnection,
  duplicateConnection,
  fetchProviderModels,
  listConnections,
  seedRegistry,
  setActiveConnection,
  testProviderConnection,
  updateConnection
} from "../src/server/providerRegistry";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-registry-"));
  tempDirs.push(dir);
  return dir;
}

function writeSettings(dir: string, settings: unknown): void {
  writeFileSync(join(dir, "settings.json"), JSON.stringify(settings), "utf8");
}

function readRegistryFile(dir: string): unknown {
  return JSON.parse(readFileSync(join(dir, "providers.json"), "utf8"));
}

function connInput(overrides: Partial<ProviderConnectionInput> = {}): ProviderConnectionInput {
  return {
    label: "Conn",
    baseUrl: "http://x:1",
    model: "m",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    ...overrides
  };
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("provider registry", () => {
  it("seeds an EMPTY registry on a fresh install and persists providers.json", () => {
    const dir = tempDir();

    const reg = seedRegistry(dir);
    expect(reg.activeProviderId).toBe("");
    expect(reg.connections).toEqual([]);

    // A providers.json file was written to the temp dir.
    const onDisk = readRegistryFile(dir) as { activeProviderId: string; connections: unknown[] };
    expect(onDisk.activeProviderId).toBe("");
    expect(onDisk.connections).toEqual([]);
  });

  it("ignores a legacy settings.json — fresh installs start empty (no built-ins, no migration)", () => {
    const dir = tempDir();
    writeSettings(dir, {
      providerId: "deepseek",
      apiKey: "sk-fake",
      model: "deepseek-v4-pro",
      contextWindow: 24000
    });

    const reg = seedRegistry(dir);
    expect(reg.activeProviderId).toBe("");
    expect(reg.connections).toEqual([]);
  });

  it("createConnection persists the new connection to disk", () => {
    const dir = tempDir();
    const created = createConnection(dir, connInput({ label: "LMO", baseUrl: "http://l:1234" }));

    expect(created.id).toBe("lmo");
    expect(created.hasApiKey).toBe(false);
    expect(created.apiKeyMasked).toBeNull();

    const onDisk = readRegistryFile(dir) as { connections: Array<{ id: string }> };
    expect(onDisk.connections.some((c) => c.id === "lmo")).toBe(true);
  });

  it("updateConnection overwrites, clears, or keeps the api key (encrypted at rest)", () => {
    const dir = tempDir();
    createConnection(dir, connInput({ apiKey: "sk-old" }));

    // Overwrite with a new key.
    updateConnection(dir, "conn", connInput({ apiKey: "new-key" }));
    let disk = readRegistryFile(dir) as { connections: Array<{ id: string; apiKey?: string }> };
    expect(disk.connections.find((c) => c.id === "conn")?.apiKey).toMatch(/^enc:v1:/);
    expect(disk.connections.find((c) => c.id === "conn")?.apiKey).not.toContain("new-key");

    // Explicit null clears it.
    updateConnection(dir, "conn", connInput({ apiKey: null }));
    disk = readRegistryFile(dir) as { connections: Array<{ id: string; apiKey?: string }> };
    expect(disk.connections.find((c) => c.id === "conn")?.apiKey).toBeUndefined();

    // Re-set a key, then omit apiKey => keeps the existing key.
    updateConnection(dir, "conn", connInput({ apiKey: "persist" }));
    updateConnection(dir, "conn", connInput());
    disk = readRegistryFile(dir) as { connections: Array<{ id: string; apiKey?: string }> };
    expect(disk.connections.find((c) => c.id === "conn")?.apiKey).toMatch(/^enc:v1:/);
    expect(disk.connections.find((c) => c.id === "conn")?.apiKey).not.toContain("persist");
  });

  it("drops stored keys gracefully when the vault key file is corrupt", () => {
    const dir = tempDir();
    createConnection(dir, connInput({ label: "A", baseUrl: "http://a:1", apiKey: "sk-secret" }));
    writeFileSync(join(dir, ".providers-key"), "corrupt-key-file-!!", "utf8");

    const pub = listConnections(dir);
    const conn = pub.connections.find((c) => c.id === "a");
    expect(conn?.hasApiKey).toBe(false);
    expect(conn?.apiKeyMasked).toBeNull();
  });

  it("deleteConnection removes ANY connection and clears the active id when it was active", () => {
    const dir = tempDir();

    // First connection on an empty registry becomes active automatically.
    createConnection(dir, connInput({ label: "Active", baseUrl: "http://a:1" }));
    const disk = readRegistryFile(dir) as { activeProviderId: string };
    expect(disk.activeProviderId).toBe("active");

    // Deleting the active connection is allowed and clears activeProviderId.
    const after = deleteConnection(dir, "active");
    expect(after.activeProviderId).toBe("");
    expect(after.connections).toEqual([]);

    // Deleting the last remaining connection yields an empty registry.
    createConnection(dir, connInput({ label: "Solo", baseUrl: "http://s:1" }));
    const emptied = deleteConnection(dir, "solo");
    expect(emptied.connections).toEqual([]);
    expect(emptied.activeProviderId).toBe("");

    // Unknown ids still throw.
    expect(() => deleteConnection(dir, "nope")).toThrow(/not found/i);
  });

  it("setActiveConnection persists and rejects unknown ids", () => {
    const dir = tempDir();
    createConnection(dir, connInput({ label: "Pick Me", baseUrl: "http://p:1" }));

    setActiveConnection(dir, "pick_me");
    const disk = readRegistryFile(dir) as { activeProviderId: string };
    expect(disk.activeProviderId).toBe("pick_me");

    expect(() => setActiveConnection(dir, "nope")).toThrow(/not found/i);
  });

  it("listConnections masks api keys publicly", () => {
    const dir = tempDir();
    createConnection(dir, connInput({ label: "Sec", baseUrl: "http://s:1", apiKey: "sk-secret-9999" }));

    const pub = listConnections(dir);
    expect(pub.activeProviderId).toBe("sec");
    const sec = pub.connections.find((c) => c.id === "sec");
    expect(sec?.hasApiKey).toBe(true);
    expect(sec?.apiKeyMasked).toBe("••••9999");
    expect("apiKey" in (sec ?? {})).toBe(false);
  });

  describe("testProviderConnection", () => {
    it("returns ok for a 200 response, calling the normalized /models URL", async () => {
      const fetchImpl = vi.fn(async () => new Response("{ }", { status: 200 }));
      const result = await testProviderConnection({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.ok).toBe(true);
      expect(fetchImpl).toHaveBeenCalledWith(
        "http://test.local/v1/models",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("returns the status and body text on a non-2xx response", async () => {
      const fetchImpl = vi.fn(async () => new Response("nope", { status: 401 }));
      const result = await testProviderConnection({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toBe("nope");
    });

    it("returns an error message when the request rejects", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("boom");
      });
      const result = await testProviderConnection({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
    });
  });

  describe("fetchProviderModels", () => {
    it("parses data[].id into a sorted, deduped list", async () => {
      const fetchImpl = vi.fn(async () =>
        new Response(JSON.stringify({ data: [{ id: "b-model" }, { id: "a-model" }, { id: "b-model" }] }), { status: 200 })
      );
      const result = await fetchProviderModels({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.ok).toBe(true);
      expect(result.models).toEqual(["a-model", "b-model"]);
      expect(fetchImpl).toHaveBeenCalledWith(
        "http://test.local/v1/models",
        expect.objectContaining({ method: "GET" })
      );
    });

    it("accepts a bare array of model ids and a models[] shape", async () => {
      const fetchImpl = vi.fn(async () => new Response(JSON.stringify(["m1", "m2"]), { status: 200 }));
      const result = await fetchProviderModels({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.models).toEqual(["m1", "m2"]);

      const fetchImpl2 = vi.fn(async () => new Response(JSON.stringify({ models: ["x", "y"] }), { status: 200 }));
      const result2 = await fetchProviderModels({ baseUrl: "http://test.local" }, fetchImpl2);
      expect(result2.models).toEqual(["x", "y"]);
    });

    it("returns ok false with the message and an empty list on non-2xx", async () => {
      const fetchImpl = vi.fn(async () => new Response("unauthorized", { status: 401 }));
      const result = await fetchProviderModels({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.ok).toBe(false);
      expect(result.status).toBe(401);
      expect(result.message).toBe("unauthorized");
      expect(result.models).toEqual([]);
    });

    it("returns ok false with an error message when the request rejects", async () => {
      const fetchImpl = vi.fn(async () => {
        throw new Error("boom");
      });
      const result = await fetchProviderModels({ baseUrl: "http://test.local" }, fetchImpl);
      expect(result.ok).toBe(false);
      expect(result.message).toBeTruthy();
      expect(result.models).toEqual([]);
    });
  });

  describe("duplicateConnection", () => {
    it("copies all fields including the apiKey, with a new unique id and editable copy", () => {
      const dir = tempDir();
      const created = createConnection(dir, connInput({ label: "LM Studio", apiKey: "sk-copy" }));

      const dup = duplicateConnection(dir, created.id);
      expect(dup.id).not.toBe(created.id);
      expect(dup.id).toBe(`${created.id}_copy`);
      expect(dup.label).toBe("LM Studio (copy)");
      expect(dup.baseUrl).toBe(created.baseUrl);
      expect(dup.model).toBe(created.model);
      expect(dup.temperature).toBe(created.temperature);
      expect(dup.maxTokens).toBe(created.maxTokens);
      expect(dup.contextWindow).toBe(created.contextWindow);
      expect(dup.readonly).toBe(false);
      // The copy carries the stored key (server-side) and masks it publicly.
      expect(dup.hasApiKey).toBe(true);
      expect(dup.apiKeyMasked).toBe("••••copy");

      // Persisted to disk ENCRYPTED (never plaintext), carrying the real key.
      const onDisk = readRegistryFile(dir) as { connections: Array<{ id: string; apiKey?: string }> };
      const diskCopy = onDisk.connections.find((c) => c.id === dup.id);
      expect(diskCopy?.apiKey).toMatch(/^enc:v1:/);
      expect(diskCopy?.apiKey).not.toContain("sk-copy");
    });

    it("duplicates a connection created after an empty seed into an editable copy with its key", () => {
      const dir = tempDir();
      seedRegistry(dir);
      const created = createConnection(dir, connInput({ label: "X", apiKey: "sk-x-1234" }));

      const dup = duplicateConnection(dir, created.id);
      expect(dup.id).toBe("x_copy");
      expect(dup.readonly).toBe(false);
      expect(dup.hasApiKey).toBe(true);
      expect(dup.apiKeyMasked).toBe("••••1234");
    });

    it("produces unique ids when duplicating twice", () => {
      const dir = tempDir();
      const created = createConnection(dir, connInput({ label: "A" }));
      const dup1 = duplicateConnection(dir, created.id);
      const dup2 = duplicateConnection(dir, created.id);
      expect(dup1.id).toBe(`${created.id}_copy`);
      expect(dup2.id).toBe(`${created.id}_copy_2`);
      expect(new Set([created.id, dup1.id, dup2.id]).size).toBe(3);
    });

    it("throws when the source connection does not exist", () => {
      const dir = tempDir();
      expect(() => duplicateConnection(dir, "nope")).toThrow(/not found/i);
    });
  });
});

describe("registry file hardening", () => {
  const validConn = {
    id: "ds",
    label: "DS",
    baseUrl: "https://api.deepseek.com",
    model: "deepseek-chat",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768
  };

  it("stamps schemaVersion on a v0 registry and archives the original to .bak", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "providers.json"),
      JSON.stringify({ activeProviderId: "ds", connections: [validConn] }),
      "utf8"
    );

    const list = listConnections(dir);

    expect(list.connections.map((c) => c.id)).toEqual(["ds"]);
    expect(list.warnings).toHaveLength(1);
    expect(list.warnings[0]).toContain("migrated");
    expect(existsSync(join(dir, "providers.json.bak"))).toBe(true);
    const stamped = JSON.parse(readFileSync(join(dir, "providers.json"), "utf8"));
    expect(stamped.schemaVersion).toBe(1);
  });

  it("quarantines an unparseable providers.json, seeds empty, and reports a warning", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "providers.json"), "{ nope", "utf8");

    const list = listConnections(dir);

    expect(list.connections).toEqual([]);
    expect(list.warnings).toHaveLength(1);
    expect(list.warnings[0]).toContain("unreadable");
    expect(existsSync(join(dir, "providers.json.bak"))).toBe(true);
    const reseeded = JSON.parse(readFileSync(join(dir, "providers.json"), "utf8"));
    expect(reseeded.schemaVersion).toBe(1);
    expect(reseeded.connections).toEqual([]);
  });

  it("salvages valid connections from a schema-invalid registry, dropping bad ones", () => {
    const dir = tempDir();
    const bad = { id: "broken", label: "Broken", baseUrl: 42, model: "", temperature: "hot", maxTokens: 1200, contextWindow: 32768 };
    writeFileSync(
      join(dir, "providers.json"),
      JSON.stringify({ activeProviderId: "broken", connections: [validConn, bad] }),
      "utf8"
    );

    const list = listConnections(dir);

    expect(list.connections.map((c) => c.id)).toEqual(["ds"]);
    expect(list.activeProviderId).toBe("ds"); // dead active id re-pointed
    expect(list.warnings).toHaveLength(1);
    expect(list.warnings[0]).toContain("1 invalid connection");
    expect(existsSync(join(dir, "providers.json.bak"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "providers.json"), "utf8")) as {
      schemaVersion: number;
      connections: Array<{ id: string }>;
    };
    expect(onDisk.schemaVersion).toBe(1);
    expect(onDisk.connections.map((c) => c.id)).toEqual(["ds"]);
  });

  it("updateConnection normalizes the baseUrl like create does", () => {
    const dir = tempDir();
    const created = createConnection(dir, { label: "DS", baseUrl: "https://api.deepseek.com/v1", model: "m" });
    const updated = updateConnection(dir, created.id, { label: "DS", baseUrl: "https://api.deepseek.com", model: "m" });
    expect(updated.baseUrl).toBe("https://api.deepseek.com/v1");
  });
});
