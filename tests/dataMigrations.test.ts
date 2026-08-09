import { describe, expect, it } from "vitest";
import { createInitialPlaythrough } from "../src/engine/engine";
import {
  CURRENT_PLAYTHROUGH_VERSION,
  migratePlaythrough
} from "../src/server/dataMigrations";

describe("migratePlaythrough", () => {
  function playthroughWithoutStamp(): unknown {
    const pt = createInitialPlaythrough("Migration Test");
    const raw: Record<string, unknown> = { ...pt };
    delete raw.schemaVersion;
    return raw;
  }

  it("default-fills schemaVersion on a file without one (lazy — no write)", () => {
    const res = migratePlaythrough(playthroughWithoutStamp());

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.schemaVersion).toBe(1);
      expect(res.migratedFrom).toBeUndefined();
      expect(res.data.name).toBe("Migration Test");
    }
  });

  it("passes a current-version playthrough through", () => {
    const res = migratePlaythrough(createInitialPlaythrough("Migration Test"));

    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.data.schemaVersion).toBe(1);
      expect(res.data.name).toBe("Migration Test");
    }
  });

  it("rejects a future version without downgrading", () => {
    const res = migratePlaythrough({ ...createInitialPlaythrough("Future"), schemaVersion: 2 });

    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toBe("newer than supported");
  });

  it("fails on corrupt input", () => {
    expect(migratePlaythrough({ id: 42 }).ok).toBe(false);
    expect(migratePlaythrough("garbage").ok).toBe(false);
  });

  it("exposes the current playthrough version constant", () => {
    expect(CURRENT_PLAYTHROUGH_VERSION).toBe(1);
  });
});
