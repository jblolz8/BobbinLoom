import { describe, expect, it } from "vitest";
import {
  CAST_PREFERENCE_DEFAULTS,
  NAV_PREFERENCE_DEFAULTS,
  PROVIDER_PREFERENCE_DEFAULTS,
  SETUP_PREFERENCE_DEFAULTS,
  UI_PREFERENCE_DEFAULTS,
  resolveCastPreferences,
  resolveNavPreferences,
  resolveProviderPreferences,
  resolveSetupPreferences,
  resolveUiPreferences
} from "../src/client/api/settings";
import { ADOPTION_SOURCES, planAdoption } from "../src/client/api/settingsAdoption";

/** A device holding exactly these keys. */
const device = (values: Record<string, string>) => (key: string) => values[key] ?? null;

describe("the remaining groups' resolvers", () => {
  it("fill every leaf from the defaults when the server has nothing", () => {
    expect(resolveSetupPreferences(undefined)).toEqual(SETUP_PREFERENCE_DEFAULTS);
    expect(resolveCastPreferences({})).toEqual(CAST_PREFERENCE_DEFAULTS);
    expect(resolveProviderPreferences(undefined)).toEqual(PROVIDER_PREFERENCE_DEFAULTS);
    expect(resolveNavPreferences(undefined)).toEqual(NAV_PREFERENCE_DEFAULTS);
    expect(resolveUiPreferences(undefined)).toEqual(UI_PREFERENCE_DEFAULTS);
  });

  it("let a stored leaf win, including one that differs from its default", () => {
    expect(resolveSetupPreferences({ setup: { castViewMode: "grid", showTagFilters: true } })).toEqual({
      ...SETUP_PREFERENCE_DEFAULTS,
      castViewMode: "grid",
      showTagFilters: true
    });
    expect(resolveCastPreferences({ cast: { viewMode: "compact" } }).viewMode).toBe("compact");
    expect(resolveProviderPreferences({ providers: { sortByImage: "label" } }).sortByImage).toBe("label");
    expect(resolveNavPreferences({ nav: { showPlayNavTabs: false } }).showPlayNavTabs).toBe(false);
    expect(resolveUiPreferences({ ui: { settingsTab: "tags" } }).settingsTab).toBe("tags");
  });

  it("keep a group's own leaves out of another group's answer", () => {
    // Every resolver is called with the WHOLE settings object, so a sloppy spread would leak.
    const stored = { setup: { showTagFilters: true }, cast: { viewMode: "compact" as const } };
    expect(resolveCastPreferences(stored)).toEqual({ viewMode: "compact" });
    expect(resolveNavPreferences(stored).showPlayNavTabs).toBe(true);
  });
});

describe("adopting the remaining keys", () => {
  it("registers one leaf per key for every group", () => {
    for (const [group, count] of [
      ["setup", 5],
      ["cast", 1],
      ["providers", 4],
      ["nav", 1],
      ["ui", 2],
      ["staleNoteDismissals", 1]
    ] as const) {
      expect(ADOPTION_SOURCES.filter((source) => source.group === group)).toHaveLength(count);
    }
  });

  it("takes a boolean stored as a string, both ways round", () => {
    const plan = planAdoption({}, device({ bobbinloom_show_play_nav_tabs: "false" }));
    expect(plan.write.nav).toEqual({ showPlayNavTabs: false });

    const other = planAdoption({}, device({ bobbinloom_setup_cast_show_tag_filters: "true" }));
    expect(other.write.setup).toEqual({ showTagFilters: true });
  });

  it("takes the dismissals record whole", () => {
    const record = { "chapter-1": "sig-1", "chapter-2": "sig-2" };
    const plan = planAdoption({}, device({ bobbinloom_chapter_stale_dismissed: JSON.stringify(record) }));
    // The group IS the record (its keys are chapter ids, not schema leaves), so it replaces the group.
    expect(plan.write.staleNoteDismissals).toEqual(record);
  });

  it("drops a dismissals key the server already holds", () => {
    const plan = planAdoption(
      { staleNoteDismissals: { "chapter-1": "sig-1" } },
      device({ bobbinloom_chapter_stale_dismissed: JSON.stringify({ "chapter-2": "sig-2" }) })
    );
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual(["bobbinloom_chapter_stale_dismissed"]);
  });

  it("keeps each provider kind's sort separate", () => {
    const plan = planAdoption(
      {},
      device({
        bobbinloom_provider_sort_by_text: "label",
        bobbinloom_provider_sort_dir_text: "asc",
        bobbinloom_provider_sort_by_image: "createdAt",
        bobbinloom_provider_sort_dir_image: "desc"
      })
    );
    expect(plan.write.providers).toEqual({
      sortByText: "label",
      sortDirText: "asc",
      sortByImage: "createdAt",
      sortDirImage: "desc"
    });
  });

  it("leaves anything unreadable where it is", () => {
    const cases: Record<string, string>[] = [
      { bobbinloom_show_play_nav_tabs: "yes" },
      { bobbinloom_setup_cast_sort_by: "size" },
      { bobbinloom_provider_sort_by_text: "name" },
      { bobbinloom_settings_tab: "nope" },
      { bobbinloom_chapter_stale_dismissed: JSON.stringify({ "chapter-1": 2 }) },
      { bobbinloom_chapter_stale_dismissed: JSON.stringify(["chapter-1"]) }
    ];
    for (const keys of cases) {
      const plan = planAdoption({}, device(keys));
      expect(plan.write).toEqual({});
      expect(plan.removeKeys).toEqual([]);
    }
  });
});
