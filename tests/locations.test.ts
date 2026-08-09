import { describe, expect, it } from "vitest";
import { applyStatePatch, createInitialPlaythrough, takeTurnSnapshot } from "../src/engine/engine";

describe("locationAdd", () => {
  it("adds a location with auto-assigned coordinates near the connection parent", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationAdd: [{
        id: "loc_tavern",
        name: "The Tavern",
        description: "A cozy tavern.",
        state: "",
        icon: "🍺",
        connections: ["starter_town"],
      }],
    });

    expect(result.rejected).toEqual([]);
    const added = result.state.locationCatalog!.find(l => l.id === "loc_tavern");
    expect(added).toBeDefined();
    expect(added!.description).toBe("A cozy tavern.");
    expect(added!.icon).toBe("🍺");
    // Coordinates should be near starter_town (which is at 0,0)
    expect(Math.abs(added!.x)).toBeLessThan(100);
    expect(added!.y).toBeGreaterThan(0); // offset downward from parent
  });

  it("rejects a duplicate with a similar name", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationAdd: [{
        id: "loc_starter_town_v2",
        name: "Starter Town",
        description: "Another starter town.",
        connections: [],
      }],
    });

    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0]).toContain("similar location exists");
    expect(result.state.locationCatalog!.find(l => l.id === "loc_starter_town_v2")).toBeUndefined();
  });

  it("rejects a duplicate with a substring-similar name", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationAdd: [{
        id: "loc_my_apartment",
        name: "Your Apartment",
        description: "Where you live.",
        connections: [],
      }],
    });
    expect(result.applied.length).toBeGreaterThan(0);

    // Now try to add a similar name
    const result2 = applyStatePatch(result.state, {
      locationAdd: [{
        id: "loc_apartment",
        name: "Apartment",
        description: "Another apartment.",
        connections: [],
      }],
    });

    expect(result2.rejected.length).toBeGreaterThan(0);
    expect(result2.rejected[0]).toContain("similar location exists");
  });

  it("maintains bidirectional connections", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationAdd: [{
        id: "loc_docks",
        name: "The Docks",
        description: "Waterfront district.",
        connections: ["starter_town"],
      }],
    });

    const docks = result.state.locationCatalog!.find(l => l.id === "loc_docks");
    const town = result.state.locationCatalog!.find(l => l.id === "starter_town");

    expect(docks!.connections).toContain("starter_town");
    expect(town!.connections).toContain("loc_docks");
  });

  it("resolves connection targets by name", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationAdd: [{
        id: "loc_docks",
        name: "The Docks",
        description: "Waterfront.",
        connections: ["Starter Town"], // by name, not ID
      }],
    });

    expect(result.rejected).toEqual([]);
    const docks = result.state.locationCatalog!.find(l => l.id === "loc_docks");
    expect(docks!.connections).toContain("starter_town");
  });
});

describe("locationConnect", () => {
  it("creates bidirectional edge between two existing locations", () => {
    const playthrough = createInitialPlaythrough("Test");
    const added = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: [] }],
    });

    const result = applyStatePatch(added.state, {
      locationConnect: [{ locationId: "starter_town", targetId: "loc_docks" }],
    });

    const town = result.state.locationCatalog!.find(l => l.id === "starter_town");
    const docks = result.state.locationCatalog!.find(l => l.id === "loc_docks");

    expect(town!.connections).toContain("loc_docks");
    expect(docks!.connections).toContain("starter_town");
    expect(result.applied.some(a => a.includes("connection added"))).toBe(true);
  });

  it("resolves locations by name", () => {
    const playthrough = createInitialPlaythrough("Test");
    const added = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: [] }],
    });

    const result = applyStatePatch(added.state, {
      locationConnect: [{ locationId: "Starter Town", targetId: "The Docks" }],
    });

    const town = result.state.locationCatalog!.find(l => l.id === "starter_town");
    expect(town!.connections).toContain("loc_docks");
  });

  it("rejects self-connection", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationConnect: [{ locationId: "starter_town", targetId: "starter_town" }],
    });

    expect(result.rejected.length).toBeGreaterThan(0);
    expect(result.rejected[0]).toContain("cannot connect location to itself");
  });
});

describe("locationDisconnect", () => {
  it("removes edge from both sides", () => {
    const playthrough = createInitialPlaythrough("Test");
    const connected = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: ["starter_town"] }],
    });

    const result = applyStatePatch(connected.state, {
      locationDisconnect: [{ locationId: "starter_town", targetId: "loc_docks" }],
    });

    const town = result.state.locationCatalog!.find(l => l.id === "starter_town");
    const docks = result.state.locationCatalog!.find(l => l.id === "loc_docks");

    expect(town!.connections).not.toContain("loc_docks");
    expect(docks!.connections).not.toContain("starter_town");
  });
});

describe("locationUpdate", () => {
  it("updates state and description", () => {
    const playthrough = createInitialPlaythrough("Test");
    const added = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: [] }],
    });

    const result = applyStatePatch(added.state, {
      locationUpdate: [{ locationId: "loc_docks", state: "⚠️ on fire", description: "A burning waterfront." }],
    });

    const docks = result.state.locationCatalog!.find(l => l.id === "loc_docks");
    expect(docks!.state).toBe("⚠️ on fire");
    expect(docks!.description).toBe("A burning waterfront.");
  });

  it("resolves location by name", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationUpdate: [{ locationId: "Starter Town", state: "🎭 festival in progress" }],
    });

    const town = result.state.locationCatalog!.find(l => l.id === "starter_town");
    expect(town!.state).toBe("🎭 festival in progress");
  });
});

describe("locationId patch", () => {
  it("resolves by name (not just ID)", () => {
    const playthrough = createInitialPlaythrough("Test");
    const added = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: ["starter_town"] }],
    });

    const result = applyStatePatch(added.state, {
      locationId: "The Docks", // by name
    });

    expect(result.state.locationId).toBe("loc_docks");
    expect(result.applied[0]).toContain("The Docks");
  });
});

describe("characterLocation", () => {
  it("moves a character to a named location", () => {
    const playthrough = createInitialPlaythrough("Test");
    const added = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: ["starter_town"] }],
    });

    const charId = added.state.characters[0].id;
    const result = applyStatePatch(added.state, {
      characterLocation: [{ characterId: charId, locationId: "The Docks" }],
    });

    expect(result.state.characters[0].currentLocationId).toBe("loc_docks");
    expect(result.applied.some(a => a.includes("character moved"))).toBe(true);
  });

  it("rejects unknown character", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      characterLocation: [{ characterId: "nobody", locationId: "starter_town" }],
    });

    expect(result.rejected.length).toBeGreaterThan(0);
  });
});

describe("takeTurnSnapshot", () => {
  it("includes locationCatalog", () => {
    const playthrough = createInitialPlaythrough("Test");
    const added = applyStatePatch(playthrough, {
      locationAdd: [{ id: "loc_docks", name: "The Docks", description: "Waterfront.", connections: ["starter_town"] }],
    });

    const snapshot = takeTurnSnapshot(added.state);
    expect(snapshot.locationCatalog).toBeDefined();
    expect(snapshot.locationCatalog!.length).toBe(2);
    expect(snapshot.locationCatalog!.find(l => l.id === "loc_docks")).toBeDefined();
  });
});

describe("coordinate assignment", () => {
  it("falls back to origin jitter when no resolvable parent", () => {
    const playthrough = createInitialPlaythrough("Test");
    const result = applyStatePatch(playthrough, {
      locationAdd: [{
        id: "loc_isolated",
        name: "Isolated Place",
        description: "Nowhere near anything.",
        connections: ["loc_nonexistent"], // can't resolve
      }],
    });

    const added = result.state.locationCatalog!.find(l => l.id === "loc_isolated");
    expect(added).toBeDefined();
    expect(Math.abs(added!.x)).toBeLessThan(100);
    expect(Math.abs(added!.y)).toBeLessThan(100);
    // Degrade-and-warn: location is committed, unresolvable edge is dropped + warned (not rejected)
    expect(result.warnings.some(r => r.includes("skipped: unknown location"))).toBe(true);
    expect(result.rejected.some(r => r.includes("unknown connection target"))).toBe(false);
  });
});

describe("locationAdd degrade-and-warn", () => {
  it("keeps the location and valid edges, drops the bad edge, and warns", () => {
    const p = createInitialPlaythrough("Test");
    const r = applyStatePatch(p, {
      locationAdd: [{ id: "loc_x", name: "X", description: "d", connections: ["starter_town", "loc_ghost"] }],
    });
    const x = r.state.locationCatalog!.find(l => l.id === "loc_x");
    expect(x).toBeDefined();                                  // location committed
    expect(x!.connections).toContain("starter_town");         // valid edge kept
    expect(x!.connections).not.toContain("loc_ghost");        // bad edge dropped
    expect(r.warnings.some(w => w.includes("loc_ghost"))).toBe(true); // warned
    expect(r.applied.some(a => a.includes("location added"))).toBe(true);
  });

  it("does not register dropped connections as rejections", () => {
    const p = createInitialPlaythrough("Test");
    const r = applyStatePatch(p, {
      locationAdd: [{ id: "loc_x", name: "X", description: "d", connections: ["loc_ghost"] }],
    });
    expect(r.rejected.some(x => x.includes("unknown connection target"))).toBe(false);
  });
});

describe("locationId travel with travelVia (route validation)", () => {
  function threeLocPlaythrough() {
    // starter_town -> loc_road -> loc_forest
    const p = createInitialPlaythrough("T");
    const withRoad = applyStatePatch(p, {
      locationAdd: [{ id: "loc_road", name: "The Road", description: "path", connections: ["starter_town"] }],
    });
    return applyStatePatch(withRoad.state, {
      locationAdd: [{ id: "loc_forest", name: "Deep Forest", description: "woods", connections: ["loc_road"] }],
    }).state;
  }

  it("travels directly to a connected neighbor without via", () => {
    const pt = threeLocPlaythrough();
    const r = applyStatePatch(pt, { locationId: "The Road" });
    expect(r.rejected).toEqual([]);
    expect(r.state.locationId).toBe("loc_road");
  });

  it("travels a valid 2-hop via chain", () => {
    const pt = threeLocPlaythrough();
    const r = applyStatePatch(pt, { locationId: "loc_forest", travelVia: ["loc_road"] });
    expect(r.rejected).toEqual([]);
    expect(r.state.locationId).toBe("loc_forest");
  });

  it("rejects a non-adjacent target without a via route", () => {
    const pt = threeLocPlaythrough();
    const r = applyStatePatch(pt, { locationId: "loc_forest" });
    expect(r.rejected.some(x => x.toLowerCase().includes("not connected"))).toBe(true);
    expect(r.state.locationId).toBe("starter_town");
  });

  it("rejects an unknown via stop", () => {
    const pt = threeLocPlaythrough();
    const r = applyStatePatch(pt, { locationId: "loc_forest", travelVia: ["loc_ghost"] });
    expect(r.rejected.some(x => x.includes("unknown location in travelVia"))).toBe(true);
    expect(r.state.locationId).toBe("starter_town");
  });

  it("rejects travel to an unknown target", () => {
    const pt = threeLocPlaythrough();
    const r = applyStatePatch(pt, { locationId: "loc_nope" });
    expect(r.rejected.some(x => x.includes("unknown location"))).toBe(true);
  });

  it("rejects a self-loop / repeated stop", () => {
    const pt = threeLocPlaythrough();
    const r = applyStatePatch(pt, { locationId: "loc_road", travelVia: ["starter_town"] });
    expect(r.rejected.length).toBeGreaterThan(0);
    expect(r.state.locationId).toBe("starter_town");
  });

  it("adds a location and travels to it in the SAME patch", () => {
    const p = createInitialPlaythrough("T");
    const r = applyStatePatch(p, {
      locationAdd: [{ id: "loc_new", name: "New Place", description: "d", connections: ["starter_town"] }],
      locationId: "loc_new",
    });
    expect(r.rejected).toEqual([]);
    expect(r.applied.some(a => a.includes("location added"))).toBe(true);
    expect(r.state.locationId).toBe("loc_new");
  });
});
