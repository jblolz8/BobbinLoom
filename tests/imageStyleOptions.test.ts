import { describe, it, expect } from "vitest";
import {
  CUSTOM_STYLE_OPTION,
  NONE_STYLE_OPTION,
  imageStyleDisplay,
  type ImageStyleDisplay
} from "../src/client/utils/imageStyleOptions";

/** The select's value must always be one of the options it is handed: this
 *  design system's select falls back to its placeholder when its value matches
 *  no option, which reads as "nothing is selected" — the other way a stored
 *  value can look lost. Asserted alongside every case below. */
function expectSelectValueIsAnOption(display: ImageStyleDisplay) {
  expect(display.options.map((o) => o.value)).toContain(display.selectValue);
}

const VENICE_STYLES = ["Anime", "Cinematic", "Photographic"];

describe("imageStyleDisplay", () => {
  it("renders a saved value as itself while the list is still empty (not fetched)", () => {
    const display = imageStyleDisplay({ value: "Anime", styles: [], customRequested: false });

    expect(display.selectValue).toBe("Anime");
    expect(display.selectValue).not.toBe(CUSTOM_STYLE_OPTION);
    expect(display.showCustomInput).toBe(false);
    expect(display.showWarning).toBe(false);
    expect(display.suggestion).toBeUndefined();
    // The stored value is offered as its own option so the select can render it.
    expect(display.options).toContainEqual({ value: "Anime", label: "Anime" });
    expectSelectValueIsAnOption(display);
  });

  it("keeps the empty list distinct from a loaded one: no warning, no suggestion", () => {
    const display = imageStyleDisplay({ value: "anime", styles: [], customRequested: false });

    expect(display.showWarning).toBe(false);
    expect(display.showCustomInput).toBe(false);
    expect(display.selectValue).toBe("anime");
  });

  it("keeps the None option and the Custom… escape hatch in the list while unfetched", () => {
    const display = imageStyleDisplay({ value: "Anime", styles: [], customRequested: false });

    expect(display.options[0]).toEqual({
      value: NONE_STYLE_OPTION,
      label: "None",
      description: "Send no style_preset"
    });
    expect(display.options.some((o) => o.value === CUSTOM_STYLE_OPTION)).toBe(true);
  });

  it("selects a value that is present in the loaded list normally", () => {
    const display = imageStyleDisplay({ value: "Anime", styles: VENICE_STYLES, customRequested: false });

    expect(display.selectValue).toBe("Anime");
    expect(display.showCustomInput).toBe(false);
    expect(display.showWarning).toBe(false);
    expect(display.suggestion).toBeUndefined();
    expect(display.options.map((o) => o.value)).toEqual([
      NONE_STYLE_OPTION,
      "Anime",
      "Cinematic",
      "Photographic",
      CUSTOM_STYLE_OPTION
    ]);
    expectSelectValueIsAnOption(display);
  });

  it("falls back to the escape hatch plus the warning once a loaded list proves the value absent", () => {
    const display = imageStyleDisplay({ value: "anime", styles: VENICE_STYLES, customRequested: false });

    expect(display.selectValue).toBe(CUSTOM_STYLE_OPTION);
    expect(display.showCustomInput).toBe(true);
    expect(display.showWarning).toBe(true);
    // Case-insensitive suggestion for a case-sensitive field.
    expect(display.suggestion).toBe("Anime");
    expectSelectValueIsAnOption(display);
  });

  it("warns without a suggestion when nothing in the list is close", () => {
    const display = imageStyleDisplay({ value: "Neon Noir", styles: VENICE_STYLES, customRequested: false });

    expect(display.showWarning).toBe(true);
    expect(display.suggestion).toBeUndefined();
    // The raw value is not a selectable option in this state: the custom input
    // is where it is corrected.
    expect(display.options.map((o) => o.value)).toEqual([
      NONE_STYLE_OPTION,
      "Anime",
      "Cinematic",
      "Photographic",
      CUSTOM_STYLE_OPTION
    ]);
    expectSelectValueIsAnOption(display);
  });

  it("treats a value differing only in case from a listed one as not listed", () => {
    const display = imageStyleDisplay({ value: "cinematic", styles: VENICE_STYLES, customRequested: false });

    expect(display.showWarning).toBe(true);
    expect(display.selectValue).toBe(CUSTOM_STYLE_OPTION);
    expect(display.suggestion).toBe("Cinematic");
  });

  it("renders an empty value as the None option", () => {
    const display = imageStyleDisplay({ value: "", styles: [], customRequested: false });

    expect(display.selectValue).toBe(NONE_STYLE_OPTION);
    expect(display.showCustomInput).toBe(false);
    expect(display.showWarning).toBe(false);
    expect(display.suggestion).toBeUndefined();
    expectSelectValueIsAnOption(display);
  });

  it("renders an empty value as the None option against a loaded list too", () => {
    const display = imageStyleDisplay({ value: "", styles: VENICE_STYLES, customRequested: false });

    expect(display.selectValue).toBe(NONE_STYLE_OPTION);
    expect(display.showWarning).toBe(false);
    expect(display.showCustomInput).toBe(false);
    expectSelectValueIsAnOption(display);
  });

  it("honours an explicit escape-hatch pick against a loaded list", () => {
    const display = imageStyleDisplay({ value: "Anime", styles: VENICE_STYLES, customRequested: true });

    expect(display.selectValue).toBe(CUSTOM_STYLE_OPTION);
    expect(display.showCustomInput).toBe(true);
    // The value itself is fine, so no warning: the user just wants to type.
    expect(display.showWarning).toBe(false);
    expect(display.suggestion).toBeUndefined();
    expectSelectValueIsAnOption(display);
  });

  it("honours an explicit escape-hatch pick while the list is unknown", () => {
    const display = imageStyleDisplay({ value: "Anime", styles: [], customRequested: true });

    expect(display.selectValue).toBe(CUSTOM_STYLE_OPTION);
    expect(display.showCustomInput).toBe(true);
    expect(display.showWarning).toBe(false);
    // Both the stored value and the hatch stay reachable.
    expect(display.options.map((o) => o.value)).toEqual([NONE_STYLE_OPTION, "Anime", CUSTOM_STYLE_OPTION]);
    expectSelectValueIsAnOption(display);
  });

  it("offers an escape-hatch pick with an empty value without inventing one", () => {
    const display = imageStyleDisplay({ value: "", styles: VENICE_STYLES, customRequested: true });

    expect(display.selectValue).toBe(CUSTOM_STYLE_OPTION);
    expect(display.showCustomInput).toBe(true);
    expect(display.showWarning).toBe(false);
    expectSelectValueIsAnOption(display);
  });

  it("does not duplicate an option a provider lists twice", () => {
    const display = imageStyleDisplay({
      value: "Anime",
      styles: ["Anime", "Anime", "Cinematic"],
      customRequested: false
    });

    expect(display.options.map((o) => o.value)).toEqual([
      NONE_STYLE_OPTION,
      "Anime",
      "Cinematic",
      CUSTOM_STYLE_OPTION
    ]);
  });
});
