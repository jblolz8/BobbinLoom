import { describe, expect, it } from "vitest";
import { ADOPTION_SOURCES, planAdoption } from "../src/client/api/settingsAdoption";

/** A device holding exactly these keys. */
const device = (values: Record<string, string>) => (key: string) => values[key] ?? null;

describe("adopting the five page sizes", () => {
  it("registers one leaf per list", () => {
    const leaves = ADOPTION_SOURCES.filter((source) => source.group === "pageSizes").map(
      (source) => source.leaf
    );
    expect(leaves).toEqual(["library", "lorebook", "persona", "setupCast", "home"]);
  });

  it("takes a number, the \"all\" sentinel, and the legacy numeric sentinel", () => {
    const plan = planAdoption(
      {},
      device({
        bobbinloom_library_page_size: "48",
        bobbinloom_lorebook_page_size: "all",
        bobbinloom_persona_page_size: "24",
        // The legacy "show everything" spelling, from before the sentinel became a string.
        bobbinloom_setup_cast_page_size: "1000",
        bobbinloom_home_page_size: "25"
      })
    );

    expect(plan.write.pageSizes).toEqual({
      library: 48,
      lorebook: "all",
      persona: 24,
      setupCast: "all",
      home: 25
    });
    expect(plan.removeKeys).toHaveLength(5);
  });

  it("leaves a size the UI cannot use where it is", () => {
    for (const junk of ["0", "-5", "wide", ""]) {
      const plan = planAdoption({}, device({ bobbinloom_library_page_size: junk }));
      expect(plan.write).toEqual({});
      expect(plan.removeKeys).toEqual([]);
    }
  });

  it("rounds a fractional size rather than writing it through", () => {
    const plan = planAdoption({}, device({ bobbinloom_library_page_size: "12.6" }));
    expect(plan.write.pageSizes).toEqual({ library: 13 });
  });

  it("drops a key the server has already chosen, without writing anything", () => {
    const plan = planAdoption(
      { pageSizes: { library: 12 } },
      device({ bobbinloom_library_page_size: "48" })
    );
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual(["bobbinloom_library_page_size"]);
  });
});
