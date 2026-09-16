import { describe, expect, it } from "vitest";
import { formatDuration, imageCaption, shortModelName } from "../src/client/engine/displayFormat";

describe("formatDuration", () => {
  it("speaks seconds under a minute and minutes above it", () => {
    expect(formatDuration(4200)).toBe("4.2s");
    expect(formatDuration(25_900)).toBe("25.9s");
    expect(formatDuration(59_900)).toBe("59.9s");
    // A local render is minutes: `110.0s` is not a number anyone reads at a glance.
    expect(formatDuration(83_000)).toBe("1m 23s");
    expect(formatDuration(600_000)).toBe("10m 00s");
  });

  it("keeps the sub-100ms floor and the empty case", () => {
    expect(formatDuration(40)).toBe("<0.1s");
    expect(formatDuration(0)).toBe("<0.1s");
    expect(formatDuration(undefined)).toBe("");
    expect(formatDuration(null)).toBe("");
  });
});

describe("shortModelName", () => {
  it("drops the extension and the hash tag", () => {
    expect(shortModelName("waiANINSFWPONYXL_v140.safetensors [4817ae4643]")).toBe("waiANINSFWPONYXL_v140");
    expect(shortModelName("lustify-v8.ckpt")).toBe("lustify-v8");
    expect(shortModelName("some/model.gguf")).toBe("some/model");
  });

  it("leaves a name it cannot shorten alone, and never empties one", () => {
    expect(shortModelName("wai-Illustrious")).toBe("wai-Illustrious");
    expect(shortModelName("  .safetensors  ")).toBe(".safetensors");
  });
});

describe("imageCaption", () => {
  it("labels both providers' halves once the text side is known", () => {
    expect(imageCaption({ model: "waiANINSFWPONYXL_v140.safetensors [4817ae4643]", promptDurationMs: 3100, durationMs: 25_900, seed: 81 }))
      .toBe("waiANINSFWPONYXL_v140 · prompt 3.1s · render 25.9s · seed 81");
    // Shortening the model name is what keeps the caption near the 420px figure's
    // budget; wrapping (CSS) is what guarantees nothing is hidden either way.
    // Measured at 375px: 93 chars = 495px of text in a 311px box, 68 chars when
    // the extension and hash are dropped, and it wraps rather than ellipsizing.
    const full = imageCaption({ model: "waiANINSFWPONYXL_v140.safetensors [4817ae4643]", promptDurationMs: 7000, durationMs: 25_200, seed: 2790359849 });
    expect(full).toBe("waiANINSFWPONYXL_v140 · prompt 7.0s · render 25.2s · seed 2790359849");
    expect(full).not.toContain(".safetensors");
    expect(full.length).toBeLessThan(93);
  });

  it("keeps the old shape for a ref written before the field existed", () => {
    expect(imageCaption({ model: "wai-Illustrious", durationMs: 4242 })).toBe("wai-Illustrious · 4.2s");
    expect(imageCaption({ model: "wai-Illustrious", durationMs: 4242, seed: 12 })).toBe("wai-Illustrious · 4.2s · seed 12");
  });

  it("omits whatever is missing instead of leaving empty separators", () => {
    expect(imageCaption({ model: "m" })).toBe("m");
    expect(imageCaption({ model: "m", promptDurationMs: 1500 })).toBe("m · prompt 1.5s");
    expect(imageCaption({ model: "m", durationMs: 30_000 })).toBe("m · 30.0s");
  });
});
