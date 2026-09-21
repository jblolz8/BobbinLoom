import { describe, expect, it } from "vitest";
import { CHAT_PREFERENCE_DEFAULTS, resolveChatPreferences } from "../src/client/api/settings";
import { ADOPTION_SOURCES, planAdoption } from "../src/client/api/settingsAdoption";

/** A device blob shaped like the old `bobbinloom_chat_settings` value. */
const blob = (values: Record<string, boolean>) => JSON.stringify(values);

const device = (values: Record<string, string | null>) => (key: string) => values[key] ?? null;

describe("the chat toggles, resolved", () => {
  it("gives every leaf its default when nothing was ever chosen", () => {
    expect(resolveChatPreferences(undefined)).toEqual(CHAT_PREFERENCE_DEFAULTS);
    expect(resolveChatPreferences({})).toEqual(CHAT_PREFERENCE_DEFAULTS);
  });

  it("lets a stored false beat a default true", () => {
    // The spread order is the whole point of the resolver: this is the shape a reader who turned
    // something OFF has on the server, and a default-over-stored bug would silently turn it back on.
    const resolved = resolveChatPreferences({ chat: { showDebug: false } });
    expect(resolved.showDebug).toBe(false);
    expect(resolved.choicesEnabled).toBe(true);
  });

  it("lets a stored true beat a default false", () => {
    const resolved = resolveChatPreferences({ chat: { autoImageAfterTurn: true } });
    expect(resolved.autoImageAfterTurn).toBe(true);
    expect(resolved.alwaysDiscardOldImage).toBe(false);
  });

  it("ignores other groups while resolving the chat one", () => {
    const resolved = resolveChatPreferences({ library: { pageSize: 50 } });
    expect(resolved).toEqual(CHAT_PREFERENCE_DEFAULTS);
  });

  it("covers every leaf the chat blob used to hold", () => {
    // Nine, not three: the blob fed nine toggles and the schema must be able to carry all of them.
    expect(Object.keys(CHAT_PREFERENCE_DEFAULTS)).toHaveLength(9);
  });
});

describe("adopting the chat blob", () => {
  it("feeds every leaf it held, and schedules ONE deletion for the key", () => {
    const plan = planAdoption(
      {},
      device({
        bobbinloom_chat_settings: blob({ choicesEnabled: false, showDebug: false, autoImageAfterTurn: true })
      })
    );

    expect(plan.write).toEqual({
      chat: { choicesEnabled: false, showDebug: false, autoImageAfterTurn: true }
    });
    // Nine registry entries point at this key; the key must come out of the plan exactly once.
    expect(plan.removeKeys).toEqual(["bobbinloom_chat_settings"]);
  });

  it("adopts only the leaves the server does not already hold", () => {
    const plan = planAdoption(
      { chat: { showDebug: true } },
      device({ bobbinloom_chat_settings: blob({ choicesEnabled: false, showDebug: false }) })
    );

    expect(plan.write).toEqual({ chat: { choicesEnabled: false } });
    expect(plan.removeKeys).toEqual(["bobbinloom_chat_settings"]);
  });

  it("adopts the ONE leaf a partial blob holds, and drops the key", () => {
    // The real shape that matters: whatever the blob holds, an adoptable leaf takes the key with it.
    const plan = planAdoption({}, device({ bobbinloom_chat_settings: blob({ choicesEnabled: false }) }));
    expect(plan.write).toEqual({ chat: { choicesEnabled: false } });
    expect(plan.removeKeys).toEqual(["bobbinloom_chat_settings"]);
  });

  it("leaves a blob that holds no booleans where it is — there is nothing to migrate", () => {
    // A synthetic shape (the hook's writer always wrote all nine leaves): a blob with no readable
    // boolean holds no preference, so nothing is adopted and the key is not scheduled for removal.
    // Any leaf that IS readable brings the key with it, as the case above shows.
    const plan = planAdoption({}, device({ bobbinloom_chat_settings: blob({}) }));
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual([]);
  });

  it("leaves a corrupt blob alone", () => {
    const plan = planAdoption({}, device({ bobbinloom_chat_settings: "{not json" }));
    expect(plan.write).toEqual({});
    expect(plan.removeKeys).toEqual([]);
  });

  it("reads every leaf through the real registry", () => {
    // The registry is the contract with the hook: all nine leaves, one key.
    const chatSources = ADOPTION_SOURCES.filter((source) => source.group === "chat");
    expect(chatSources).toHaveLength(9);
    expect(new Set(chatSources.map((source) => source.key))).toEqual(new Set(["bobbinloom_chat_settings"]));
  });
});
