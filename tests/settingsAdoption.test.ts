import { describe, expect, it } from "vitest";
import { planAdoption, type LocalAdoptionSource } from "../src/client/api/settingsAdoption";

/** Two sample keys, standing in for a migrated group (the real registry fills up as groups move). */
const SOURCES: readonly LocalAdoptionSource[] = [
  { key: "bobbinloom_chat_settings", group: "chat", leaf: "showDebug", parse: (raw) => (raw === "true" ? true : raw === "false" ? false : undefined) },
  { key: "bobbinloom_page_size", group: "library", leaf: "pageSize", parse: (raw) => (/^\d+$/.test(raw) ? Number(raw) : undefined) }
];

const device = (values: Record<string, string | null>) => (key: string) => values[key] ?? null;

describe("preference adoption", () => {
  it("adopts a device value the server has nothing for", () => {
    const plan = planAdoption({}, device({ bobbinloom_chat_settings: "false" }), SOURCES);
    expect(plan.write).toEqual({ chat: { showDebug: false } });
    expect(plan.removeKeys).toEqual(["bobbinloom_chat_settings"]);
  });

  it("lets the server win, and still drops the dead key", () => {
    const plan = planAdoption(
      { chat: { showDebug: true } },
      device({ bobbinloom_chat_settings: "false" }),
      SOURCES
    );
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual(["bobbinloom_chat_settings"]);
  });

  it("ignores a key the device never had", () => {
    const plan = planAdoption({}, device({}), SOURCES);
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual([]);
  });

  it("leaves an unreadable value alone instead of writing junk", () => {
    const plan = planAdoption(
      {},
      device({ bobbinloom_chat_settings: "maybe", bobbinloom_page_size: "50" }),
      SOURCES
    );
    expect(plan.write).toEqual({ library: { pageSize: 50 } });
    expect(plan.removeKeys).toEqual(["bobbinloom_page_size"]);
  });

  it("adopts several groups in one pass", () => {
    const plan = planAdoption(
      {},
      device({ bobbinloom_chat_settings: "true", bobbinloom_page_size: "25" }),
      SOURCES
    );
    expect(plan.write).toEqual({ chat: { showDebug: true }, library: { pageSize: 25 } });
    expect(plan.removeKeys).toHaveLength(2);
  });

  it("does nothing at all when the registry is empty", () => {
    // The state the code ships in until a group is migrated: adoption must be inert, not eager.
    const plan = planAdoption({}, device({ bobbinloom_chat_settings: "false" }), []);
    expect(plan).toEqual({ write: {}, removeKeys: [] });
  });
});
