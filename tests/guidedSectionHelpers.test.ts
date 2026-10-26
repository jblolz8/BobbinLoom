import { describe, expect, it } from "vitest";
import {
  applyAutocompleteSuggestion,
  applyLineQuickFix,
  formatClothingToText,
  getAutocompleteContext,
  getSectionSuggestions,
  insertBulletKey,
  lintGuidedSectionText,
  parseClothingFromText,
} from "../src/engine/guidedSectionHelpers";
import { DEFAULT_CHARACTER_FORMAT } from "../src/engine/characterFormat";

describe("guidedSectionHelpers", () => {
  describe("formatClothingToText & parseClothingFromText", () => {
    it("round-trips clothing items with and without state", () => {
      const items = [
        { slot: "Top", name: "Simple linen shirt" },
        { slot: "Bottom", name: "Durable travel trousers", state: "rolled up" },
        { slot: "Feet", name: "Sturdy walking boots" },
      ];

      const text = formatClothingToText(items);
      expect(text).toBe(
        [
          "- Top: Simple linen shirt",
          "- Bottom: Durable travel trousers (rolled up)",
          "- Feet: Sturdy walking boots",
        ].join("\n"),
      );

      const parsed = parseClothingFromText(text);
      expect(parsed).toEqual(items);
    });

    it("deduplicates slots case-insensitively keeping the latest entry", () => {
      const text = [
        "- Top: White undershirt",
        "- Bottom: Jeans",
        "- top: Leather jacket",
      ].join("\n");

      const parsed = parseClothingFromText(text);
      expect(parsed).toEqual([
        { slot: "top", name: "Leather jacket" },
        { slot: "Bottom", name: "Jeans" },
      ]);
    });
  });

  describe("getSectionSuggestions", () => {
    it("marks already-used keys as used and includes CharacterFormat examples", () => {
      const text = "- Height: 5'10\"\n- Build: Athletic";
      const suggestions = getSectionSuggestions(
        "body",
        text,
        DEFAULT_CHARACTER_FORMAT,
      );

      const height = suggestions.find((s) => s.key === "Height");
      const build = suggestions.find((s) => s.key === "Build");
      const shoulders = suggestions.find((s) => s.key === "Shoulders");

      expect(height?.used).toBe(true);
      expect(build?.used).toBe(true);
      expect(shoulders?.used).toBe(false);
    });

    it("extracts clothing slots from CharacterFormat instruction and examples", () => {
      const suggestions = getSectionSuggestions(
        "clothing",
        "- Top: Shirt",
        DEFAULT_CHARACTER_FORMAT,
      );
      const keys = suggestions.map((s) => s.key);
      expect(keys).toContain("Head");
      expect(keys).toContain("Neck");
      expect(keys).toContain("Top");
      expect(keys).toContain("Bottom");
      expect(keys).toContain("Feet");
      expect(suggestions.find((s) => s.key === "Top")?.used).toBe(true);
      expect(suggestions.find((s) => s.key === "Bottom")?.used).toBe(false);
    });
  });

  describe("lintGuidedSectionText & applyLineQuickFix", () => {
    it("warns on clothing lines missing Slot: Garment format and provides a quick fix", () => {
      const text = "- Top: Simple linen shirt\n- Blue jeans";
      const diags = lintGuidedSectionText(text, "clothing");

      expect(diags).toHaveLength(1);
      expect(diags[0].line).toBe(2);
      expect(diags[0].severity).toBe("warning");
      expect(diags[0].quickFixLine).toBe("- Top: Blue jeans");

      const fixed = applyLineQuickFix(text, diags[0].line, diags[0].quickFixLine!);
      expect(fixed).toBe("- Top: Simple linen shirt\n- Top: Blue jeans");
    });

    it("warns on empty bullet values in body/appearance and clothing", () => {
      const bodyDiags = lintGuidedSectionText("- Height:\n- Build: Athletic", "body");
      expect(bodyDiags).toHaveLength(1);
      expect(bodyDiags[0].line).toBe(1);
      expect(bodyDiags[0].message).toContain("Height");
    });
  });

  describe("autocomplete context & insertion", () => {
    it("activates when typing a bullet prefix before a colon and filters unused first", () => {
      const text = "- Height: 5'10\"\n- ";
      const suggestions = getSectionSuggestions("body", text);
      const ctx = getAutocompleteContext(text, text.length, suggestions);

      expect(ctx.active).toBe(true);
      expect(ctx.lineNumber).toBe(2);
      // Unused keys come before used "Height"
      expect(ctx.matches[0].used).toBe(false);

      const applied = applyAutocompleteSuggestion(
        text,
        text.length,
        ctx.matches[0].key,
      );
      expect(applied.text).toBe(`- Height: 5'10"\n- ${ctx.matches[0].key}: `);
      expect(applied.caretOffset).toBe(applied.text.length);
    });

    it("deactivates once the caret is past the colon", () => {
      const text = "- Height: 5'10\"";
      const suggestions = getSectionSuggestions("body", text);
      const ctx = getAutocompleteContext(text, text.length, suggestions);
      expect(ctx.active).toBe(false);
    });

    it("insertBulletKey appends a new bullet or replaces a trailing empty bullet", () => {
      const fromEmpty = insertBulletKey("", "Top");
      expect(fromEmpty.text).toBe("- Top: ");

      const fromTrailingDash = insertBulletKey("- Top: Shirt\n- ", "Bottom");
      expect(fromTrailingDash.text).toBe("- Top: Shirt\n- Bottom: ");
    });
  });
});
