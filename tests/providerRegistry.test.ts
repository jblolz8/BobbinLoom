import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderConnectionSchema } from "../src/schemas";
import { ProviderManager } from "../src/server/providerManager";
import { MockProvider } from "../src/server/provider";
import {
  activeConnectionOfKind,
  createConnection,
  deleteConnection,
  duplicateConnection,
  fetchProviderModels,
  getRegistry,
  listConnections,
  seedRegistry,
  setActiveConnection,
  testProviderConnection,
  updateConnection
} from "../src/server/providerRegistry";
import type { ProviderConnectionDraft } from "../src/server/providerRegistry";

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

function connInput(overrides: Partial<ProviderConnectionDraft> = {}): ProviderConnectionDraft {
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
    expect(reg.activeTextProviderId).toBe("");
    expect(reg.activeImageProviderId).toBe("");
    expect(reg.connections).toEqual([]);

    // A providers.json file was written to the temp dir.
    const onDisk = readRegistryFile(dir) as {
      schemaVersion: number;
      activeTextProviderId: string;
      activeImageProviderId: string;
      connections: unknown[];
    };
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.activeTextProviderId).toBe("");
    expect(onDisk.activeImageProviderId).toBe("");
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
    expect(reg.activeTextProviderId).toBe("");
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
    const disk = readRegistryFile(dir) as { activeTextProviderId: string };
    expect(disk.activeTextProviderId).toBe("active");

    // Deleting the active connection is allowed and clears its slot.
    const after = deleteConnection(dir, "active");
    expect(after.activeTextProviderId).toBe("");
    expect(after.connections).toEqual([]);

    // Deleting the last remaining connection yields an empty registry.
    createConnection(dir, connInput({ label: "Solo", baseUrl: "http://s:1" }));
    const emptied = deleteConnection(dir, "solo");
    expect(emptied.connections).toEqual([]);
    expect(emptied.activeTextProviderId).toBe("");

    // Unknown ids still throw.
    expect(() => deleteConnection(dir, "nope")).toThrow(/not found/i);
  });

  it("setActiveConnection persists, updates lastActiveAt, and rejects unknown ids", () => {
    const dir = tempDir();
    const created = createConnection(dir, connInput({ label: "Pick Me", baseUrl: "http://p:1" }));
    expect(created.lastActiveAt).toBeTruthy();

    const second = createConnection(dir, connInput({ label: "Second", baseUrl: "http://p:2" }));
    // 'Second' was added when 'pick_me' was already active, so it starts with no lastActiveAt
    expect(second.lastActiveAt).toBeUndefined();

    setActiveConnection(dir, "second");
    const disk = readRegistryFile(dir) as { activeTextProviderId: string; connections: Array<{ id: string; lastActiveAt?: string }> };
    expect(disk.activeTextProviderId).toBe("second");
    const activeConn = disk.connections.find((c) => c.id === "second");
    expect(activeConn?.lastActiveAt).toBeTruthy();

    expect(() => setActiveConnection(dir, "nope")).toThrow(/not found/i);
  });

  it("listConnections masks api keys publicly", () => {
    const dir = tempDir();
    createConnection(dir, connInput({ label: "Sec", baseUrl: "http://s:1", apiKey: "sk-secret-9999" }));

    const pub = listConnections(dir);
    expect(pub.activeTextProviderId).toBe("sec");
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

  it("migrates a v1 registry to v2: activeProviderId becomes the text slot, rows gain kind, original archived", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "providers.json"),
      JSON.stringify({
        schemaVersion: 1,
        activeProviderId: "ds",
        connections: [validConn]
      }),
      "utf8"
    );

    const list = listConnections(dir);

    expect(list.connections.map((c) => c.id)).toEqual(["ds"]);
    expect(list.warnings).toHaveLength(1);
    expect(list.warnings[0]).toContain("migrated");
    expect(list.activeTextProviderId).toBe("ds");
    expect(list.activeImageProviderId).toBe("");
    expect(list.connections[0].kind).toBe("text");
    expect(existsSync(join(dir, "providers.json.bak"))).toBe(true);
    const migrated = JSON.parse(readFileSync(join(dir, "providers.json"), "utf8")) as {
      schemaVersion: number;
      activeTextProviderId: string;
      activeImageProviderId: string;
      connections: Array<{ id: string; kind: string }>;
    };
    expect(migrated.schemaVersion).toBe(2);
    expect(migrated.activeTextProviderId).toBe("ds");
    expect(migrated.activeImageProviderId).toBe("");
    expect(migrated.connections[0].kind).toBe("text");
  });

  it("migrates a bare v0 file (no schemaVersion) and keeps its active id", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "providers.json"),
      JSON.stringify({ activeProviderId: "ds", connections: [validConn] }),
      "utf8"
    );

    const list = listConnections(dir);

    expect(list.warnings).toHaveLength(1);
    expect(list.warnings[0]).toContain("migrated");
    expect(list.activeTextProviderId).toBe("ds");
    expect(list.activeImageProviderId).toBe("");
    const onDisk = JSON.parse(readFileSync(join(dir, "providers.json"), "utf8")) as {
      schemaVersion: number;
      activeTextProviderId: string;
      activeImageProviderId: string;
      connections: Array<{ kind: string }>;
    };
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.activeTextProviderId).toBe("ds");
    expect(onDisk.activeImageProviderId).toBe("");
    expect(onDisk.connections[0].kind).toBe("text");
  });

  it("does not re-migrate or re-archive an already-v2 registry", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "providers.json"),
      JSON.stringify({
        schemaVersion: 2,
        activeTextProviderId: "ds",
        activeImageProviderId: "",
        connections: [{ ...validConn, kind: "text" }]
      }),
      "utf8"
    );

    const list = listConnections(dir);

    expect(list.activeTextProviderId).toBe("ds");
    expect(list.warnings).toEqual([]);
    expect(existsSync(join(dir, "providers.json.bak"))).toBe(false);
  });

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
    expect(stamped.schemaVersion).toBe(2);
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
    expect(reseeded.schemaVersion).toBe(2);
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
    expect(list.activeTextProviderId).toBe("ds"); // dead active id re-pointed
    expect(list.warnings).toHaveLength(1);
    expect(list.warnings[0]).toContain("1 invalid connection");
    expect(existsSync(join(dir, "providers.json.bak"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "providers.json"), "utf8")) as {
      schemaVersion: number;
      connections: Array<{ id: string }>;
    };
    expect(onDisk.schemaVersion).toBe(2);
    expect(onDisk.connections.map((c) => c.id)).toEqual(["ds"]);
  });

  it("updateConnection normalizes the baseUrl like create does", () => {
    const dir = tempDir();
    const created = createConnection(dir, { label: "DS", baseUrl: "https://api.deepseek.com/v1", model: "m" });
    const updated = updateConnection(dir, created.id, { label: "DS", baseUrl: "https://api.deepseek.com", model: "m" });
    expect(updated.baseUrl).toBe("https://api.deepseek.com/v1");
  });
});

describe("provider connection kind", () => {
  it("parses a legacy text connection without a kind, defaulting to text", () => {
    const parsed = ProviderConnectionSchema.parse({
      id: "a", label: "A", baseUrl: "http://x/v1", model: "m",
      temperature: 0.8, maxTokens: 100, contextWindow: 4096
    });
    expect(parsed.kind).toBe("text");
  });

  it("accepts an image connection with its own fields", () => {
    const parsed = ProviderConnectionSchema.parse({
      id: "venice", label: "Venice", baseUrl: "https://api.venice.ai/api/v1", model: "m",
      temperature: 0.8, maxTokens: 100, contextWindow: 4096,
      kind: "image", apiStyle: "venice", safeMode: false, size: "1024x1024",
      promptProviderId: null
    });
    expect(parsed.kind).toBe("image");
    expect(parsed.apiStyle).toBe("venice");
  });
});

describe("kind-aware registry slots", () => {
  it("keeps independent text and image active slots", () => {
    const dir = tempDir();
    const text = createConnection(dir, connInput({ label: "Local Text", baseUrl: "http://t:1" }));
    const image = createConnection(
      dir,
      connInput({
        label: "Venice",
        baseUrl: "https://api.venice.ai/api/v1",
        kind: "image",
        apiStyle: "venice",
        safeMode: false,
        size: "1024x1024",
        promptProviderId: null
      })
    );

    const reg = listConnections(dir);
    expect(reg.activeTextProviderId).toBe(text.id);
    expect(reg.activeImageProviderId).toBe(image.id);

    // The image row carries its own fields; the text row carries none of them.
    const imageRow = reg.connections.find((c) => c.id === image.id);
    expect(imageRow?.kind).toBe("image");
    expect(imageRow?.apiStyle).toBe("venice");
    expect(imageRow?.safeMode).toBe(false);
    expect(imageRow?.size).toBe("1024x1024");
    expect(imageRow?.promptProviderId).toBeNull();
    expect(reg.connections.find((c) => c.id === text.id)?.apiStyle).toBeUndefined();

    // Adding a second text connection does not steal the text slot…
    const text2 = createConnection(dir, connInput({ label: "Second Text", baseUrl: "http://t:2" }));
    expect(listConnections(dir).activeTextProviderId).toBe(text.id);

    // …and activating it leaves the image slot alone.
    setActiveConnection(dir, text2.id);
    const after = listConnections(dir);
    expect(after.activeTextProviderId).toBe(text2.id);
    expect(after.activeImageProviderId).toBe(image.id);

    // Deleting the image connection clears only the image slot.
    const afterDelete = deleteConnection(dir, image.id);
    expect(afterDelete.activeImageProviderId).toBe("");
    expect(afterDelete.activeTextProviderId).toBe(text2.id);
  });

  it("adding a connection of one kind never steals the other kind's slot", () => {
    const dir = tempDir();
    const image = createConnection(dir, connInput({ label: "Images", kind: "image", apiStyle: "openai" }));
    expect(listConnections(dir).activeImageProviderId).toBe(image.id);
    expect(listConnections(dir).activeTextProviderId).toBe("");

    const text = createConnection(dir, connInput({ label: "Text" }));
    const reg = listConnections(dir);
    expect(reg.activeTextProviderId).toBe(text.id);
    expect(reg.activeImageProviderId).toBe(image.id);
  });

  it("duplicates an image connection with its kind and image fields intact", () => {
    const dir = tempDir();
    const created = createConnection(
      dir,
      connInput({ label: "Venice", kind: "image", apiStyle: "venice", size: "1024x1024", promptProviderId: null, variants: 2 })
    );

    const dup = duplicateConnection(dir, created.id);
    expect(dup.kind).toBe("image");
    expect(dup.apiStyle).toBe("venice");
    expect(dup.variants).toBe(2);
    expect(dup.promptProviderId).toBeNull();
    expect(listConnections(dir).activeImageProviderId).toBe(created.id);
  });

  it("resolves the active connection per kind, and only per kind", () => {
    const dir = tempDir();
    const text = createConnection(dir, connInput({ label: "Text", baseUrl: "http://t:1", contextWindow: 8192 }));
    createConnection(dir, connInput({ label: "Img", kind: "image", contextWindow: 4096 }));

    const reg = getRegistry(dir);
    expect(activeConnectionOfKind(reg, "text")?.id).toBe(text.id);
    expect(activeConnectionOfKind(reg, "text")?.kind).toBe("text");
    expect(activeConnectionOfKind(reg, "image")?.kind).toBe("image");

    // A dead active id falls back to the first connection OF THAT KIND.
    setActiveConnection(dir, text.id);
    deleteConnection(dir, text.id);
    const after = getRegistry(dir);
    expect(activeConnectionOfKind(after, "text")).toBeNull();
    expect(activeConnectionOfKind(after, "image")?.kind).toBe("image");
  });
});

describe("provider manager kind resolution", () => {
  it("does not treat an image connection as the text fallback", () => {
    const dir = tempDir();
    createConnection(
      dir,
      connInput({
        label: "Venice Images",
        baseUrl: "https://api.venice.ai/api/v1",
        kind: "image",
        apiStyle: "venice",
        contextWindow: 4096,
        maxTokens: 77
      })
    );

    const manager = new ProviderManager(dir, {});
    expect(manager.getProvider().constructor.name).toBe("MockProvider");
    expect(manager.getProvider()).toBeInstanceOf(MockProvider);
    // The image connection's numbers must NOT leak into the text turn budget.
    expect(manager.getContextWindow()).toBe(32768);
    expect(manager.getMaxTokens()).toBe(1200);
  });
});
