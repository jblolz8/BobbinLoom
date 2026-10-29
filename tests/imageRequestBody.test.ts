/** The request-body editor's one rule, and the seed-text formatting it shares
 *  with the `request` disclosure. Pure functions, so they are tested without a
 *  React renderer — the repo has no component test harness, and this is the part
 *  of the editor that can silently do the wrong thing. */
import { describe, expect, it } from "vitest";
import {
  checkImageRequestBody,
  formatImageRequestBody,
  updateImageRequestField,
  updateImageRequestFields,
} from "../src/client/utils/imageRequestBody";

describe("checkImageRequestBody", () => {
  it("accepts any JSON object, whatever fields it carries", () => {
    const result = checkImageRequestBody('{"model": "flux-dev", "seed": 7}');
    expect(result.ok).toBe(true);
    // The fields are the provider's business — nothing here inspects them.
    if (result.ok) expect(result.value).toEqual({ model: "flux-dev", seed: 7 });
  });

  it("accepts an empty object: an empty body is the provider's problem, not a shape error", () => {
    expect(checkImageRequestBody("{}").ok).toBe(true);
  });

  it("refuses text that is not JSON, naming the reason", () => {
    const result = checkImageRequestBody('{"model": "flux-dev",}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("not valid JSON");
  });

  it("refuses JSON that is not an object — the same rule the server enforces", () => {
    for (const bad of ["[]", '"a string"', "42", "null", "true"]) {
      const result = checkImageRequestBody(bad);
      expect(result.ok, bad).toBe(false);
      if (!result.ok)
        expect(result.error).toBe("The request body must be a JSON object.");
    }
  });

  it("refuses an empty or whitespace-only field", () => {
    for (const blank of ["", "   ", "\n\t"]) {
      const result = checkImageRequestBody(blank);
      expect(result.ok, JSON.stringify(blank)).toBe(false);
      if (!result.ok) expect(result.error).toBe("The request body is empty.");
    }
  });
});

describe("formatImageRequestBody", () => {
  it("pretty-prints a stored body so it can be read and edited", () => {
    expect(formatImageRequestBody('{"a":1,"b":[2,3]}')).toBe(
      '{\n  "a": 1,\n  "b": [\n    2,\n    3\n  ]\n}',
    );
  });

  it("hands back a body that does not parse, rather than blanking it", () => {
    // An unparseable stored body is exactly the one the user needs to see — the
    // editor must not reformat it away or empty the field.
    expect(formatImageRequestBody("not json")).toBe("not json");
  });

  it("round-trips: a formatted body still passes the check", () => {
    const formatted = formatImageRequestBody('{"model":"flux-dev","seed":3}');
    const check = checkImageRequestBody(formatted);
    expect(check.ok).toBe(true);
    if (check.ok) expect(check.value).toEqual({ model: "flux-dev", seed: 3 });
  });
});

describe("updateImageRequestField / updateImageRequestFields", () => {
  it("updates top-level fields while preserving unknown dialect keys untouched", () => {
    const original = JSON.stringify({
      prompt: "old prompt",
      negative_prompt: "blurry",
      steps: 28,
      alwayson_scripts: { "Forge Couple": { args: [true] } },
    });
    const updated = updateImageRequestField(original, "prompt", "new prompt");
    expect(JSON.parse(updated)).toEqual({
      prompt: "new prompt",
      negative_prompt: "blurry",
      steps: 28,
      alwayson_scripts: { "Forge Couple": { args: [true] } },
    });
  });

  it("removes a key when updated with undefined and leaves invalid JSON untouched", () => {
    const withSeed = '{"prompt":"tags","seed":42}';
    const withoutSeed = updateImageRequestFields(withSeed, {
      seed: undefined,
      steps: 30,
    });
    expect(JSON.parse(withoutSeed)).toEqual({ prompt: "tags", steps: 30 });
    expect("seed" in JSON.parse(withoutSeed)).toBe(false);

    expect(updateImageRequestField("not valid json", "prompt", "x")).toBe(
      "not valid json",
    );
  });
});
