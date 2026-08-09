import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ProviderManager } from "../src/server/providerManager";
import { MockProvider } from "../src/server/provider";
import { loadAppSettings, saveAppSettings } from "../src/server/appSettingsStore";
import { seedRegistry } from "../src/server/providerRegistry";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("app settings store", () => {
  it("returns defaults when settings.json is missing", () => {
    const dir = tempDir();
    expect(loadAppSettings(dir)).toEqual({ schemaVersion: 1 });
  });

  it("loads a legacy v0 settings.json tolerantly: provider fields ignored, no archive written", () => {
    const dir = tempDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        providerId: "kimi",
        model: "kimi-k3",
        baseUrl: "https://api.moonshot.ai/v1",
        apiKey: "sk-legacy",
        temperature: 0.9,
        maxTokens: 1800,
        contextWindow: 131072,
        defaultPresetId: "default-nsfw"
      }),
      "utf8"
    );

    const settings = loadAppSettings(dir);

    expect(settings.defaultPresetId).toBe("default-nsfw");
    expect(settings.schemaVersion).toBe(1);
    expect("providerId" in settings).toBe(false);
    expect("apiKey" in settings).toBe(false);
    // No migration side-effects: no .bak is written, the on-disk file is untouched.
    expect(existsSync(join(dir, "settings.json.bak"))).toBe(false);
    const onDisk = JSON.parse(readFileSync(join(dir, "settings.json"), "utf8"));
    expect(onDisk).toEqual(expect.objectContaining({ defaultPresetId: "default-nsfw" }));
  });

  it("quarantines a corrupt settings.json and returns defaults", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "settings.json"), "{ nope", "utf8");

    const settings = loadAppSettings(dir);

    expect(settings).toEqual({ schemaVersion: 1 });
    expect(existsSync(join(dir, "settings.json.bak"))).toBe(true);
  });

  it("saveAppSettings persists defaultPresetId and updatedAt", () => {
    const dir = tempDir();
    const saved = saveAppSettings(dir, { defaultPresetId: "default-nsfw" });

    expect(saved.defaultPresetId).toBe("default-nsfw");
    expect(saved.schemaVersion).toBe(1);
    expect(typeof saved.updatedAt).toBe("string");

    expect(loadAppSettings(dir).defaultPresetId).toBe("default-nsfw");

    const updated = saveAppSettings(dir, { defaultPresetId: "default" });
    expect(updated.defaultPresetId).toBe("default");
  });
});

describe("provider manager registry integration", () => {
  it("getProvider() uses the active connection (mock by default)", () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    expect(manager.getProvider()).toBeInstanceOf(MockProvider);
  });
  it("getContextWindow()/getMaxTokens() resolve from the active connection", () => {
    const dir = tempDir();
    seedRegistry(dir);
    const manager = new ProviderManager(dir, {});
    expect(typeof manager.getContextWindow()).toBe("number");
    expect(typeof manager.getMaxTokens()).toBe("number");
  });
  it("exposes list / create / update / delete / set-active / test", async () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    const list = manager.listConnections();
    expect(Array.isArray(list.connections)).toBe(true);
    const created = manager.createConnection({
      label: "LMO",
      baseUrl: "http://l:1234",
      model: "m",
      temperature: 0.8,
      maxTokens: 1200,
      contextWindow: 32768
    });
    expect(created.id).toBe("lmo");
    expect(manager.setActiveConnection(created.id).activeProviderId).toBe(created.id);
    const updated = manager.updateConnection(created.id, {
      label: "LMO2",
      baseUrl: "http://l:1234",
      model: "m",
      temperature: 0.8,
      maxTokens: 1200,
      contextWindow: 32768
    });
    expect(updated.label).toBe("LMO2");
    const tested = await manager.testConnection({ baseUrl: "http://localhost:1" });
    expect(typeof tested.ok).toBe("boolean");
    // Deleting the (now active) connection is allowed; active id clears.
    const afterDelete = manager.deleteConnection(created.id);
    expect(afterDelete.activeProviderId).toBe("");
  });

  it("testConnection/fetchModels with an id use the STORED connection key and base URL", async () => {
    const dir = tempDir();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 })
    );
    const manager = new ProviderManager(dir, {}, fetchImpl as unknown as typeof fetch);

    const created = manager.createConnection({
      label: "DS",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "sk-stored"
    });

    const models = await manager.fetchModels({ id: created.id });
    expect(models.ok).toBe(true);
    expect(models.models).toEqual(["m1", "m2"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-stored" })
      })
    );

    const tested = await manager.testConnection({ id: created.id });
    expect(tested.ok).toBe(true);
  });

  it("fetchModels with an unknown id throws", async () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    await expect(manager.fetchModels({ id: "nope" })).rejects.toThrow(/not found/i);
  });

  it("getApiKey returns the stored key for a connection and rejects unknown ids", () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    const created = manager.createConnection({
      label: "DS", baseUrl: "https://api.deepseek.com", model: "m", apiKey: "sk-test-1234"
    });
    expect(manager.getApiKey(created.id)).toEqual({ apiKey: "sk-test-1234" });
    expect(() => manager.getApiKey("nope")).toThrow(/not found/i);
  });
});
