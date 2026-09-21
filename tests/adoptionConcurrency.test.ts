import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The read path is called by every surface that shows a preference, and several of them mount together.
 * Two concurrent calls must NOT produce two fetches: the second would land in the window between the
 * first call deleting the device's keys and its write arriving, resolve the reader's value to the
 * default, and then a writer would store that default over what the first call just adopted. That is a
 * real sequence — it happened on the Settings dialog and the home screen mounting together.
 */
const getViewPreferences = vi.fn();
const updateViewPreferences = vi.fn();

vi.mock("../src/client/api/settings", () => ({
  getViewPreferences: () => getViewPreferences(),
  updateViewPreferences: (patch: unknown) => updateViewPreferences(patch)
}));

const { adoptLocalPreferences, resetAdoptionCache } = await import("../src/client/api/settingsAdoption");

describe("the shared preferences read", () => {
  beforeEach(() => {
    resetAdoptionCache();
    getViewPreferences.mockReset();
    updateViewPreferences.mockReset();
    // No `window` in this suite, so the read is just "ask the server" — which is exactly the part that
    // must be shared.
    getViewPreferences.mockImplementation(async () => ({ chat: { showDebug: false } }));
  });

  afterEach(() => {
    resetAdoptionCache();
  });

  it("fetches once for surfaces that ask in the same tick", async () => {
    const [first, second] = await Promise.all([adoptLocalPreferences(), adoptLocalPreferences()]);

    expect(getViewPreferences).toHaveBeenCalledTimes(1);
    expect(second).toBe(first);
    expect(first.preferences).toEqual({ chat: { showDebug: false } });
  });

  it("reads fresh again once the shared read has settled", async () => {
    // A surface mounting later must not be handed an answer from before the reader's last change.
    await adoptLocalPreferences();
    await adoptLocalPreferences();

    expect(getViewPreferences).toHaveBeenCalledTimes(2);
  });

  it("shares the failure too, and recovers on the next read", async () => {
    getViewPreferences.mockRejectedValueOnce(new Error("offline"));

    await expect(adoptLocalPreferences()).rejects.toThrow("offline");
    await expect(adoptLocalPreferences()).resolves.toEqual({ preferences: { chat: { showDebug: false } }, changed: false });
    expect(getViewPreferences).toHaveBeenCalledTimes(2);
  });
});
