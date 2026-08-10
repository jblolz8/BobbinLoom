import { describe, expect, it } from "vitest";
import { expandMacros } from "../src/engine/macros";

describe("expandMacros", () => {
  it("expands {{char}} and {{user}}", () => {
    expect(expandMacros("{{char}} talks to {{user}}", "Mira", "Anon")).toBe("Mira talks to Anon");
  });

  it("expands mixed-case macros ({{Char}}/{{User}})", () => {
    expect(expandMacros("{{Char}} greets {{User}} warmly.", "Mira", "Anon")).toBe("Mira greets Anon warmly.");
  });

  it("passes text without macros through unchanged", () => {
    expect(expandMacros("plain sheet text", "Mira", "Anon")).toBe("plain sheet text");
  });

  it("returns empty text unchanged", () => {
    expect(expandMacros("", "Mira", "Anon")).toBe("");
  });

  it("expands {{user}} to the player name (e.g. Anon)", () => {
    expect(expandMacros("{{user}} enters the room.", "Mira", "Anon")).toBe("Anon enters the room.");
  });

  it("expands multiple occurrences of the same macro", () => {
    expect(expandMacros("{{char}} and {{char}} love {{user}}", "Mira", "Anon")).toBe("Mira and Mira love Anon");
  });

  it("does not modify the source text (runtime-only expansion)", () => {
    const source = "{{char}} eyes {{user}}.";
    const out = expandMacros(source, "Mira", "Anon");
    expect(out).toBe("Mira eyes Anon.");
    expect(source).toBe("{{char}} eyes {{user}}.");
  });
});
