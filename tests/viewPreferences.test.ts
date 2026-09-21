import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadAppSettings, saveViewPreferences } from "../src/server/appSettingsStore";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-prefs-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("view preferences storage", () => {
  it("stores only the leaves it is given", () => {
    const dir = tempDir();
    saveViewPreferences(dir, { chat: { showDebug: false } });
    const stored = loadAppSettings(dir).viewPreferences;
    expect(stored?.chat).toEqual({ showDebug: false });
    // A group nobody touched stays absent rather than becoming an empty object — absence is what the
    // one-shot adoption reads.
    expect(stored?.library).toBeUndefined();
    expect(stored?.nav).toBeUndefined();
  });

  it("merges a later patch into the group instead of replacing it", () => {
    const dir = tempDir();
    saveViewPreferences(dir, { library: { viewMode: "grid", sortBy: "name" } });
    saveViewPreferences(dir, { library: { pageSize: 25 } });

    expect(loadAppSettings(dir).viewPreferences?.library).toEqual({
      viewMode: "grid",
      sortBy: "name",
      pageSize: 25
    });
  });

  it("keeps the groups independent", () => {
    const dir = tempDir();
    saveViewPreferences(dir, { chat: { choicesEnabled: false }, setup: { showTagFilters: true } });
    saveViewPreferences(dir, { setup: { castViewMode: "list" } });

    const stored = loadAppSettings(dir).viewPreferences;
    expect(stored?.chat).toEqual({ choicesEnabled: false });
    expect(stored?.setup).toEqual({ showTagFilters: true, castViewMode: "list" });
  });

  it("merges the dismissals record rather than dropping earlier ones", () => {
    const dir = tempDir();
    saveViewPreferences(dir, { staleNoteDismissals: { ch_1: "2026-01-01T00:00:00.000Z" } });
    saveViewPreferences(dir, { staleNoteDismissals: { ch_2: "2026-01-02T00:00:00.000Z" } });

    expect(loadAppSettings(dir).viewPreferences?.staleNoteDismissals).toEqual({
      ch_1: "2026-01-01T00:00:00.000Z",
      ch_2: "2026-01-02T00:00:00.000Z"
    });
  });

  it("survives a reload with the rest of the settings intact", () => {
    const dir = tempDir();
    saveViewPreferences(dir, { nav: { showPlayNavTabs: false } });
    const settings = loadAppSettings(dir);
    // The preferences ride beside the display settings without disturbing them.
    expect(settings.themePreset).toBe("default-dark");
    expect(settings.paneSwipeEnabled).toBe(true);
    expect(settings.viewPreferences?.nav).toEqual({ showPlayNavTabs: false });
  });
});
