import { describe, it, expect } from "vitest";
import { cleanStateAfterSave, isConnectionDirty } from "../src/client/utils/connectionDraft";
import type { ProviderConnectionPayload } from "../src/client/api";

/** The shape the predicate actually sees: one flat payload, image-only fields
 *  simply absent on a text row. */
function textForm(overrides: Partial<ProviderConnectionPayload> = {}): ProviderConnectionPayload {
  return {
    kind: "text",
    label: "Local LM Studio",
    baseUrl: "http://localhost:1234/v1",
    model: "llama-3",
    apiKey: "sk-abc",
    temperature: 0.8,
    maxTokens: 1200,
    contextWindow: 32768,
    ...overrides
  };
}

describe("isConnectionDirty", () => {
  it("is false for an untouched form", () => {
    expect(isConnectionDirty(textForm(), textForm())).toBe(false);
  });

  it("is true when a single field changes", () => {
    expect(isConnectionDirty(textForm({ model: "llama-4" }), textForm())).toBe(true);
  });

  it("treats undefined, null and \"\" as the same absence", () => {
    const baseline = textForm({ apiKey: null });
    expect(isConnectionDirty(textForm({ apiKey: "" }), baseline)).toBe(false);
    expect(isConnectionDirty(textForm({ apiKey: undefined }), baseline)).toBe(false);
  });

  it("does NOT collapse a real 0 into absence", () => {
    expect(isConnectionDirty(textForm({ maxTokens: 0 }), textForm())).toBe(true);
  });

  it("reports a changed api key as dirty", () => {
    expect(isConnectionDirty(textForm({ apiKey: "sk-other" }), textForm())).toBe(true);
  });

  it("compares image-only fields", () => {
    const base = textForm({ kind: "image", aspectRatio: "3:2", stylePreset: "Anime" });
    const same = textForm({ kind: "image", aspectRatio: "3:2", stylePreset: "Anime" });
    const changed = textForm({ kind: "image", aspectRatio: "3:2", stylePreset: "Cinematic" });
    expect(isConnectionDirty(same, base)).toBe(false);
    expect(isConnectionDirty(changed, base)).toBe(true);
  });

  it("is dirty when a key exists on only one side", () => {
    // `seed` is the field the editor CLEARS to null rather than deleting, so the
    // baseline can hold `undefined` while the form holds a real number.
    const base = textForm({ seed: undefined });
    expect(isConnectionDirty(textForm({ seed: 42 }), base)).toBe(true);
    expect(isConnectionDirty(textForm({ seed: null }), base)).toBe(false);
  });
});

/** The form's clean state after a save. `storedForm` is what the caller got back
 *  from re-mapping the saved row — the public row, so it never carries the key. */
describe("cleanStateAfterSave", () => {
  it("produces a state the form is NOT dirty against — the whole point of it", () => {
    const form = textForm({ label: "Renamed" });
    const clean = cleanStateAfterSave(textForm({ label: "Renamed" }), form, true);

    // Against itself, and against the form that was just saved: both clean, so
    // closing the editor (and the modal) stops asking to discard stored work.
    expect(isConnectionDirty(clean, clean)).toBe(false);
    expect(isConnectionDirty(form, clean)).toBe(false);
  });

  it("keeps the form's key, which the stored row cannot carry", () => {
    const form = textForm({ apiKey: "sk-test-secret" });
    // The public row has no secret at all; the mapper yields an empty key. Taking
    // the clean key from the ROW would leave the form dirty on the key field and
    // the bug would survive its own fix.
    const clean = cleanStateAfterSave(textForm({ apiKey: "" }), form, true);

    expect(clean.apiKey).toBe("sk-test-secret");
    expect(isConnectionDirty(form, clean)).toBe(false);
  });

  it("spends a pending key CLEAR once the save has happened", () => {
    // `null` means "clear the stored key on the next Save". The row now reports no
    // key, so the intent is spent and the clean state holds none either.
    const form = textForm({ apiKey: null });
    const clean = cleanStateAfterSave(textForm({ apiKey: "" }), form, false);

    expect(clean.apiKey).toBe("");
    expect(isConnectionDirty(form, clean)).toBe(false);
  });

  it("keeps the form's key when the row still has one", () => {
    // A clear the server did not act on leaves the key stored, so the form keeps
    // the only copy of it — and stays clean, because it is unchanged.
    const form = textForm({ apiKey: "sk-test-secret" });
    const clean = cleanStateAfterSave(textForm({ apiKey: "" }), form, true);
    expect(clean.apiKey).toBe("sk-test-secret");
  });

  it("takes every other field from the stored row, so the form snaps to what was saved", () => {
    const form = textForm({ label: "Renamed", baseUrl: "http://localhost:9999/v1" });
    const stored = textForm({ label: "Renamed", baseUrl: "http://localhost:9999/v1" });
    const clean = cleanStateAfterSave(stored, form, true);

    expect(clean.label).toBe("Renamed");
    expect(clean.baseUrl).toBe("http://localhost:9999/v1");
    expect(clean.model).toBe(stored.model);
  });

  it("still reports a form edited AGAIN after the save as dirty", () => {
    // The guard is not weakened by this: it only stops lying about work that is
    // already stored.
    const clean = cleanStateAfterSave(textForm(), textForm(), true);
    expect(isConnectionDirty(textForm({ model: "llama-5" }), clean)).toBe(true);
  });

  it("does not mutate the form it was given", () => {
    const form = textForm({ label: "Renamed", apiKey: "sk-test-secret" });
    const snapshot = { ...form };
    cleanStateAfterSave(textForm({ apiKey: "" }), form, false);
    expect(form).toEqual(snapshot);
  });
});
