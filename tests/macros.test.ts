import { describe, expect, it } from "vitest";
import { expandMacros, expandUserMacro } from "../src/engine/macros";

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

  it("tolerates internal whitespace inside the braces", () => {
    expect(expandMacros("{{ char }} meets {{ user }}", "Mira", "Anon")).toBe("Mira meets Anon");
  });

  it("expands both macros on every occurrence, not just the first", () => {
    expect(expandMacros("{{user}} {{user}} {{char}} {{char}}", "Mira", "Anon")).toBe("Anon Anon Mira Mira");
  });

  it("leaves lookalike brace text alone", () => {
    const text = "{not a macro} {{chars}} {{character}} {{user-name}}";
    expect(expandMacros(text, "Mira", "Anon")).toBe(text);
  });
});

describe("expandUserMacro", () => {
  it("substitutes {{user}} and leaves {{char}} literal", () => {
    // A shared/ownerless surface has no character to name: guessing one would
    // substitute a wrong name, so {{char}} is deliberately preserved.
    expect(expandUserMacro("{{char}} guards {{user}}", "Anon")).toBe("{{char}} guards Anon");
  });

  it("is case-insensitive and tolerates internal whitespace", () => {
    expect(expandUserMacro("{{USER}} and {{ user }}", "Anon")).toBe("Anon and Anon");
  });

  it("leaves lookalike brace text alone (no {{char}} name match)", () => {
    const text = "{{chars}} {{character}} {char}";
    expect(expandUserMacro(text, "Anon")).toBe(text);
  });
});
