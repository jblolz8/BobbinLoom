/** Guards the shipped presets in `data/prompt-presets.json`.
 *
 *  Unlike the docs tests — which never touch the real repo tree — this suite
 *  MUST read the real file: it is the artifact under guard. The presets are the
 *  product's voice (their modules are what every playthrough is asked to write)
 *  and its structural contract (ids and orders are what user configs and the
 *  editor key off), so a hand-edit that breaks either must fail here rather
 *  than in someone's story.
 */
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { PromptPresetSchema } from "../src/schemas";

const SHIPPED = new URL("../data/prompt-presets.json", import.meta.url);

interface ShippedModule {
  id: string;
  name: string;
  description: string;
  content: string;
  order: number;
  enabled: boolean;
}

const presets: Array<{ id: string; name: string; modules: { turn: ShippedModule[] } }> = JSON.parse(
  readFileSync(SHIPPED, "utf8")
);

describe("shipped prompt presets", () => {
  it("every preset satisfies the schema", () => {
    for (const preset of presets) {
      const result = PromptPresetSchema.safeParse(preset);
      expect(result.success ? null : result.error.issues.map((i) => `${i.path.join(".")}: ${i.message}`)).toBeNull();
    }
  });

  it("preset ids are unique and the two defaults ship", () => {
    const ids = presets.map((p) => p.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids).toContain("default");
    expect(ids).toContain("default-nsfw");
  });

  for (const preset of presets) {
    describe(`${preset.id}`, () => {
      const modules = preset.modules.turn;

      it("module ids are unique", () => {
        const ids = modules.map((m) => m.id);
        expect(new Set(ids).size).toBe(ids.length);
      });

      it("orders are contiguous from 1", () => {
        expect(modules.map((m) => m.order)).toEqual(modules.map((_, index) => index + 1));
      });

      it("every enabled module has a name and content", () => {
        for (const module of modules.filter((m) => m.enabled)) {
          expect(module.name.trim(), `${module.id} name`).not.toBe("");
          expect(module.content.trim(), `${module.id} content`).not.toBe("");
        }
      });

      it("does not describe the product or itself as an RPG", () => {
        for (const module of modules) {
          expect(`${module.name} ${module.content}`, module.id).not.toMatch(/\bRPG\b/i);
          expect(`${module.name} ${module.content}`, module.id).not.toContain("BobbinLoom");
        }
      });
    });
  }

  it("Core GM carries the grounding sentence and never names the product", () => {
    for (const preset of presets) {
      const core = preset.modules.turn.find((m) => m.id === "core-gm");
      expect(core, `${preset.id} has a core-gm module`).toBeDefined();
      expect(core!.content).toContain("hidden truths");
      expect(core!.content).not.toContain("BobbinLoom");
    }
  });
});
