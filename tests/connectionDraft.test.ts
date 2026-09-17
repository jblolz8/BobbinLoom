import { describe, it, expect } from "vitest";
import { isConnectionDirty } from "../src/client/utils/connectionDraft";
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
