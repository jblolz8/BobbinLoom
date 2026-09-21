import { describe, expect, it } from "vitest";
import { LIBRARY_PREFERENCE_DEFAULTS, resolveLibraryPreferences } from "../src/client/api/settings";
import { ADOPTION_SOURCES, planAdoption } from "../src/client/api/settingsAdoption";

/** A device holding exactly these keys. */
const device = (values: Record<string, string>) => (key: string) => values[key] ?? null;

describe("resolveLibraryPreferences", () => {
  it("fills every leaf from the defaults when the server has nothing", () => {
    expect(resolveLibraryPreferences(undefined)).toEqual(LIBRARY_PREFERENCE_DEFAULTS);
    expect(resolveLibraryPreferences({})).toEqual(LIBRARY_PREFERENCE_DEFAULTS);
  });

  it("lets a stored leaf win — including one whose value equals a default", () => {
    const prefs = resolveLibraryPreferences({
      library: { viewMode: "list", playthroughSortDir: "asc" }
    });
    expect(prefs.viewMode).toBe("list");
    expect(prefs.playthroughSortDir).toBe("asc");
    // A leaf the server did not mention keeps its default rather than being cleared.
    expect(prefs.sidebarViewMode).toBe(LIBRARY_PREFERENCE_DEFAULTS.sidebarViewMode);
  });

  it("is not disturbed by another group", () => {
    const prefs = resolveLibraryPreferences({
      chat: { showDebug: false },
      library: { search: "elf" }
    });
    expect(prefs.search).toBe("elf");
    expect(prefs.viewMode).toBe(LIBRARY_PREFERENCE_DEFAULTS.viewMode);
  });

  it("hands out the default empty collapsed list", () => {
    // The component turns this straight into a Set, so the reader who never collapsed anything starts
    // from nothing rather than from another reader's array.
    expect(resolveLibraryPreferences(undefined).collapsedCategories).toEqual([]);
  });
});

describe("adopting the library and shelf keys", () => {
  it("registers every migrated leaf", () => {
    expect(ADOPTION_SOURCES.filter((source) => source.group === "library")).toHaveLength(9);
  });

  it("takes every leaf the device holds, and schedules each key once", () => {
    const plan = planAdoption(
      {},
      device({
        bobbinloom_library_view_mode: "list",
        bobbinloom_library_sort_by: "createdAt",
        bobbinloom_library_sort_dir: "desc",
        bobbinloom_library_sidebar_view_mode: "flat",
        bobbinloom_library_collapsed_categories: JSON.stringify(["body", "dress"]),
        bobbinloom_library_search: "elf",
        bobbinloom_playthrough_view_mode: "list",
        bobbinloom_playthrough_sort_by: "turn",
        bobbinloom_playthrough_sort_dir: "asc"
      })
    );

    expect(plan.write.library).toEqual({
      viewMode: "list",
      sortBy: "createdAt",
      sortDir: "desc",
      sidebarViewMode: "flat",
      collapsedCategories: ["body", "dress"],
      search: "elf",
      playthroughViewMode: "list",
      playthroughSortBy: "turn",
      playthroughSortDir: "asc"
    });
    // Nine keys, each named once — one key per leaf here, so the dedupe has nothing to do.
    expect(plan.removeKeys).toHaveLength(9);
    expect(new Set(plan.removeKeys).size).toBe(9);
  });

  it("leaves a view mode the UI has no branch for where it is", () => {
    const plan = planAdoption({}, device({ bobbinloom_library_view_mode: "huge" }));
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual([]);
  });

  it("leaves a collapsed list that is not an array of ids where it is", () => {
    const plan = planAdoption(
      {},
      device({ bobbinloom_library_collapsed_categories: JSON.stringify({ body: true }) })
    );
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual([]);
  });

  it("drops a key the server has already chosen, without writing anything", () => {
    const plan = planAdoption(
      { library: { viewMode: "grid" } },
      device({ bobbinloom_library_view_mode: "list" })
    );
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual(["bobbinloom_library_view_mode"]);
  });

  it("adopts nothing from a device that never chose", () => {
    const plan = planAdoption({}, device({}));
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual([]);
  });
});
