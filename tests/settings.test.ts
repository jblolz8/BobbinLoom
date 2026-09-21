import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import Fastify from "fastify";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { ProviderManager } from "../src/server/providerManager";
import { MockProvider } from "../src/server/provider";
import { loadAppSettings, saveAppSettings } from "../src/server/appSettingsStore";
import { seedRegistry } from "../src/server/providerRegistry";
import { DEFAULT_IMAGE_GENERATION_SETTINGS, DEFAULT_IMAGE_PROMPT_INSTRUCTION, LEGACY_SCENE_SIDES, PERSPECTIVE_PAIRS, applyInstructionMode, instructionModeApplies } from "../src/engine/imageDefaults";
import { FORGE_COUPLE_SEPARATOR } from "../src/server/imageProvider/a1111Provider";
import { ImageApiStyleSchema, ImageGenerationSettingsSchema, PromptPresetSchema, ProviderConnectionSchema } from "../src/schemas";

const tempDirs: string[] = [];

function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), "bobbinloom-settings-"));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length) {
    const dir = tempDirs.pop();
    if (dir) rmSync(dir, { recursive: true, force: true });
  }
});

describe("app settings store", () => {
  it("returns shipped defaults when user-settings.json is missing", () => {
    const dir = tempDir();
    const settings = loadAppSettings(dir);
    expect(settings.activePresetId).toBe("default");
    expect(settings.themePreset).toBe("default-dark");
    expect(settings.themeMode).toBe("dark");
    expect(settings.avatarShape).toBe("rounded");
  });

  it("reads legacy v0 settings.json only as a defaults template, not runtime state", () => {
    // The committed settings.json is a pure defaults template and is no longer
    // read as runtime state. A v0 file with provider fields is ignored in favor
    // of the shipped defaults (start fresh — no adoption of prior runtime prefs).
    const dir = tempDir();
    writeFileSync(
      join(dir, "settings.json"),
      JSON.stringify({
        providerId: "kimi",
        model: "kimi-k3",
        baseUrl: "https://api.moonshot.ai/v1",
        apiKey: "sk-legacy",
        temperature: 0.9,
        maxTokens: 1800,
        contextWindow: 131072,
        defaultPresetId: "default-nsfw",
        themePreset: "emerald-archive"
      }),
      "utf8"
    );

    const settings = loadAppSettings(dir);

    // Runtime now lives in user-settings.json; a bare settings.json template is ignored.
    expect(settings.activePresetId).toBe("default");
    expect(settings.themePreset).toBe("default-dark");
    expect(settings.themeMode).toBe("dark");
    expect(settings.avatarShape).toBe("rounded");
    // No migration side-effects: no .bak is written, the template file is untouched.
    expect(existsSync(join(dir, "settings.json.bak"))).toBe(false);
    expect(existsSync(join(dir, "user-settings.json"))).toBe(false);
  });

  it("quarantines a corrupt user-settings.json and returns defaults", () => {
    const dir = tempDir();
    writeFileSync(join(dir, "user-settings.json"), "{ nope", "utf8");

    const settings = loadAppSettings(dir);

    expect(settings.activePresetId).toBe("default");
    expect(settings.themePreset).toBe("default-dark");
    expect(existsSync(join(dir, "user-settings.json.bak"))).toBe(true);
  });

  it("adopts a legacy defaultPresetId as activePresetId", () => {
    const dir = tempDir();
    // Pre-global-config files stored the chosen preset as `defaultPresetId`. The
    // schema no longer has that field, so without an explicit adoption a user whose
    // preset was Default (NSFW) would silently revert to the vanilla Default.
    writeFileSync(
      join(dir, "user-settings.json"),
      JSON.stringify({ schemaVersion: 1, defaultPresetId: "default-nsfw", themeMode: "dark" }),
      "utf8"
    );

    const settings = loadAppSettings(dir);
    expect(settings.activePresetId).toBe("default-nsfw");
    // Everything else still merges over the shipped defaults.
    expect(settings.themeMode).toBe("dark");
    expect(settings.avatarShape).toBe("rounded");

    // A file that ALREADY carries the new field wins — the legacy one never overrides it.
    writeFileSync(
      join(dir, "user-settings.json"),
      JSON.stringify({ schemaVersion: 1, defaultPresetId: "default-nsfw", activePresetId: "user-preset" }),
      "utf8"
    );
    expect(loadAppSettings(dir).activePresetId).toBe("user-preset");
  });

  it("saveAppSettings persists runtime overrides to user-settings.json and merges with defaults", () => {
    const dir = tempDir();
    const saved = saveAppSettings(dir, { activePresetId: "default-nsfw" });

    expect(saved.activePresetId).toBe("default-nsfw");
    expect(saved.schemaVersion).toBe(1);
    expect(typeof saved.updatedAt).toBe("string");
    // Untouched defaults survive the merge.
    expect(saved.themePreset).toBe("default-dark");
    expect(saved.avatarShape).toBe("rounded");

    // Persisted to the runtime file, not the template.
    expect(loadAppSettings(dir).activePresetId).toBe("default-nsfw");
    expect(existsSync(join(dir, "user-settings.json"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "user-settings.json"), "utf8"));
    expect(onDisk.activePresetId).toBe("default-nsfw");

    const updated = saveAppSettings(dir, { activePresetId: "default" });
    expect(updated.activePresetId).toBe("default");
  });

  it("saveAppSettings persists avatarShape and persists updates", () => {
    const dir = tempDir();
    const saved = saveAppSettings(dir, { avatarShape: "circle" });
    expect(saved.avatarShape).toBe("circle");
    expect(loadAppSettings(dir).avatarShape).toBe("circle");

    const updated = saveAppSettings(dir, { avatarShape: "square" });
    expect(updated.avatarShape).toBe("square");
    expect(loadAppSettings(dir).avatarShape).toBe("square");
  });

  it("defaults the panel swipe on, and persists it off", () => {
    // A file written before the switch existed must read as ON: the gesture behaves that way today,
    // so an absent field cannot start meaning "off" for everyone who upgrades.
    const dir = tempDir();
    writeFileSync(join(dir, "user-settings.json"), JSON.stringify({ schemaVersion: 1, themeMode: "dark" }), "utf8");
    expect(loadAppSettings(dir).paneSwipeEnabled).toBe(true);

    const saved = saveAppSettings(dir, { paneSwipeEnabled: false });
    expect(saved.paneSwipeEnabled).toBe(false);
    expect(loadAppSettings(dir).paneSwipeEnabled).toBe(false);
    expect(JSON.parse(readFileSync(join(dir, "user-settings.json"), "utf8")).paneSwipeEnabled).toBe(false);

    // And back on, so the switch is not a one-way door.
    expect(saveAppSettings(dir, { paneSwipeEnabled: true }).paneSwipeEnabled).toBe(true);
    expect(loadAppSettings(dir).paneSwipeEnabled).toBe(true);
  });
});

// ── Wave 1: the a1111 image dialect's connection fields ──

/** A minimal image connection — every field the schema REQUIRES, nothing else,
 *  so an absence assertion ("this key is not in the parsed row") is meaningful. */
const A1111_CONNECTION = {
  id: "a1111_local",
  kind: "image" as const,
  label: "Local SD",
  baseUrl: "http://127.0.0.1:7860",
  model: "sd_xl_base_1.0.safetensors",
  temperature: 0.8,
  maxTokens: 1200,
  contextWindow: 32768,
  apiStyle: "a1111" as const
};

describe("A1111 image connection schema", () => {
  it("lists a1111 among the image API styles", () => {
    expect(ImageApiStyleSchema.options).toContain("a1111");
  });

  it("round-trips the sampling controls and the per-connection timeout", () => {
    const parsed = ProviderConnectionSchema.safeParse({
      ...A1111_CONNECTION,
      steps: 28,
      cfgScale: 6.5,
      sampler: "DPM++ 2M Karras",
      scheduler: "Karras",
      timeoutMs: 600_000
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    expect(parsed.data.apiStyle).toBe("a1111");
    expect(parsed.data.steps).toBe(28);
    expect(parsed.data.cfgScale).toBe(6.5);
    expect(parsed.data.sampler).toBe("DPM++ 2M Karras");
    expect(parsed.data.scheduler).toBe("Karras");
    expect(parsed.data.timeoutMs).toBe(600_000);
  });

  it("parses a connection without them unchanged — no key is invented", () => {
    const parsed = ProviderConnectionSchema.safeParse(A1111_CONNECTION);
    expect(parsed.success).toBe(true);
    if (!parsed.success) return;
    for (const field of ["steps", "cfgScale", "sampler", "scheduler", "timeoutMs"] as const) {
      expect(field in parsed.data).toBe(false);
    }
  });

  it("rejects sampling controls outside their published range", () => {
    expect(ProviderConnectionSchema.safeParse({ ...A1111_CONNECTION, steps: 0 }).success).toBe(false);
    expect(ProviderConnectionSchema.safeParse({ ...A1111_CONNECTION, steps: 151 }).success).toBe(false);
    expect(ProviderConnectionSchema.safeParse({ ...A1111_CONNECTION, steps: 28.5 }).success).toBe(false);
    expect(ProviderConnectionSchema.safeParse({ ...A1111_CONNECTION, cfgScale: 31 }).success).toBe(false);
    expect(ProviderConnectionSchema.safeParse({ ...A1111_CONNECTION, cfgScale: -1 }).success).toBe(false);
    expect(ProviderConnectionSchema.safeParse({ ...A1111_CONNECTION, timeoutMs: 999 }).success).toBe(false);
  });
});

describe("provider manager registry integration", () => {
  it("getProvider() uses the active connection (mock by default)", () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    expect(manager.getProvider()).toBeInstanceOf(MockProvider);
  });
  it("getContextWindow()/getMaxTokens() resolve from the active connection", () => {
    const dir = tempDir();
    seedRegistry(dir);
    const manager = new ProviderManager(dir, {});
    expect(typeof manager.getContextWindow()).toBe("number");
    expect(typeof manager.getMaxTokens()).toBe("number");
  });
  it("exposes list / create / update / delete / set-active / test", async () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    const list = manager.listConnections();
    expect(Array.isArray(list.connections)).toBe(true);
    const created = manager.createConnection({
      label: "LMO",
      baseUrl: "http://l:1234",
      model: "m",
      temperature: 0.8,
      maxTokens: 1200,
      contextWindow: 32768
    });
    expect(created.id).toBe("lmo");
    expect(manager.setActiveConnection(created.id).activeTextProviderId).toBe(created.id);
    const updated = manager.updateConnection(created.id, {
      label: "LMO2",
      baseUrl: "http://l:1234",
      model: "m",
      temperature: 0.8,
      maxTokens: 1200,
      contextWindow: 32768
    });
    expect(updated.label).toBe("LMO2");
    const tested = await manager.testConnection({ baseUrl: "http://localhost:1" });
    expect(typeof tested.ok).toBe("boolean");
    // Deleting the (now active) connection is allowed; active id clears.
    const afterDelete = manager.deleteConnection(created.id);
    expect(afterDelete.activeTextProviderId).toBe("");
  });

  it("testConnection/fetchModels with an id use the STORED connection key and base URL", async () => {
    const dir = tempDir();
    const fetchImpl = vi.fn(async () =>
      new Response(JSON.stringify({ data: [{ id: "m1" }, { id: "m2" }] }), { status: 200 })
    );
    const manager = new ProviderManager(dir, {}, fetchImpl as unknown as typeof fetch);

    const created = manager.createConnection({
      label: "DS",
      baseUrl: "https://api.deepseek.com",
      model: "deepseek-chat",
      apiKey: "sk-stored"
    });

    const models = await manager.fetchModels({ id: created.id });
    expect(models.ok).toBe(true);
    expect(models.models).toEqual(["m1", "m2"]);
    expect(fetchImpl).toHaveBeenCalledWith(
      "https://api.deepseek.com/v1/models",
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: "Bearer sk-stored" })
      })
    );

    const tested = await manager.testConnection({ id: created.id });
    expect(tested.ok).toBe(true);
  });

  it("fetchModels with an unknown id throws", async () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    await expect(manager.fetchModels({ id: "nope" })).rejects.toThrow(/not found/i);
  });

  it("getApiKey returns the stored key for a connection and rejects unknown ids", () => {
    const dir = tempDir();
    const manager = new ProviderManager(dir, {});
    const created = manager.createConnection({
      label: "DS", baseUrl: "https://api.deepseek.com", model: "m", apiKey: "sk-test-1234"
    });
    expect(manager.getApiKey(created.id)).toEqual({ apiKey: "sk-test-1234" });
    expect(() => manager.getApiKey("nope")).toThrow(/not found/i);
  });
});

// ── Wave 4: preset-owned image prompt configuration ──

/** The shipped file, resolved from this test file rather than the cwd, so the
 *  drift guard still reads the real repo file while a route test has swapped
 *  the cwd for a hermetic data dir. */
const PRESETS_FILE = fileURLToPath(new URL("../data/prompt-presets.json", import.meta.url));

describe("image generation: shipped preset configs", () => {
  const raw = readFileSync(PRESETS_FILE, "utf8");
  const presets = JSON.parse(raw) as Array<{
    id: string;
    name: string;
    readonly: boolean;
    imageGeneration?: Record<string, unknown>;
  }>;
  const preset = (id: string) => presets.find((p) => p.id === id)!;

  it("keeps CRLF line endings and no LF-only lines", () => {
    expect(raw).toContain("\r\n");
    expect(raw.replace(/\r\n/g, "")).not.toContain("\n");
  });

  it("ships the default preset's instruction byte-identical to the code constant", () => {
    expect(preset("default").imageGeneration?.instruction).toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
  });

  it("swaps both read-only presets' perspective rules without touching their own parts", () => {
    for (const id of ["default", "default-nsfw"]) {
      const shipped = preset(id).imageGeneration!.instruction as string;
      const scene = applyInstructionMode(shipped, "scene");
      expect(scene, id).toContain("THE PLAYER IS A CHARACTER IN THIS FRAME");
      expect(scene, id).not.toContain("THE PLAYER (POV scenes)");
      // And back: the swap is its own inverse on the shipped documents too.
      expect(applyInstructionMode(scene, "pov"), id).toBe(shipped);
    }
    // The NSFW-only block is not perspective text, so it survives the swap.
    const nsfwScene = applyInstructionMode(preset("default-nsfw").imageGeneration!.instruction as string, "scene");
    expect(nsfwScene).toContain("EXPLICIT SCENES");
  });

  it("ships the reviewed prefixes, character limit and flags on both read-only presets", () => {
    for (const id of ["default", "default-nsfw"]) {
      const image = preset(id).imageGeneration!;
      expect(image.positivePrefix).toBe("anime style");
      expect(image.promptCharacterLimit).toBe(1200);
      expect(image.includeState).toBe(true);
      expect(image.includeCast).toBe(true);
      // POV is what these documents ARE, so the shipped mode matches the text.
      expect(image.instructionMode).toBe("pov");
      expect(image.historyMessages).toBe(6);
      expect(image.includePreviousAnswer).toBe(false);
    }
    expect(preset("default").imageGeneration?.negativePrefix).toBe(DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix);
    expect(preset("default-nsfw").imageGeneration?.negativePrefix).toBe(
      `${DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix}, censored, mosaic censoring, bar censor`
    );
  });

  it("carries the raised 1200-character limit on every preset that ships an image block", () => {
    for (const p of presets) {
      // SHIPPED only: a user-owned preset's limit is the user's to change, and
      // asserting it here is the same coupling that broke on their last clone.
      if (!p.imageGeneration || !p.readonly) continue;
      expect(p.imageGeneration.promptCharacterLimit, p.name).toBe(1200);
    }
    // Named explicitly: the two SHIPPED presets. A user-owned preset is not checked
    // here — its prefix, instruction and limits are the user's own, and pinning
    // them is exactly how this file went red when they re-made their clone from
    // Default (NSFW) instead of the old 1980s-anime copy.
    expect(preset("default").imageGeneration?.promptCharacterLimit).toBe(1200);
    expect(preset("default-nsfw").imageGeneration?.promptCharacterLimit).toBe(1200);
  });

  it("ships the user-approved negative tag set byte-for-byte, in order", () => {
    // The reviewed list, reproduced here so a silent edit to the constant OR to
    // the JSON fails instead of shipping. Order is part of the contract: the list
    // goes out exactly as written.
    const approved = [
      "lowres",
      "worst quality",
      "low quality",
      "normal quality",
      "blurry",
      "out of focus",
      "jpeg artifacts",
      "bad anatomy",
      "deformed",
      "bad proportions",
      "poorly drawn face",
      "long neck",
      "malformed limbs",
      "missing limbs",
      "extra limbs",
      "extra arms",
      "extra legs",
      "bad hands",
      "extra fingers",
      "extra digits",
      "fewer digits",
      "missing fingers",
      "fused fingers",
      "mutated hands",
      "duplicate",
      "text",
      "dialogue",
      "speech bubble",
      "thought bubble",
      "caption",
      "subtitles",
      "comic",
      "comic panel",
      "panel layout",
      "multiple views",
      "4koma",
      "storyboard",
      "split screen",
      "collage",
      "border",
      "watermark",
      "signature",
      "username",
      "artist name",
      "logo",
      "web address",
      "patreon username",
      "twitter username",
      "stamp",
      "photorealistic",
      "realistic",
      "3d",
      "cgi"
    ].join(", ");

    expect(DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix).toBe(approved);
    expect(preset("default").imageGeneration?.negativePrefix).toBe(approved);

    // Deliberate omissions, each for a reason: `manga` names a drawing style as
    // well as a medium and these presets are anime-prefixed; `cropped` and
    // `out of frame` would fight the tight close-ups that are wanted; a
    // character-count negative would fight every two-person scene.
    for (const omitted of ["manga", "cropped", "out of frame", "multiple girls", "extra person"]) {
      expect(approved).not.toContain(omitted);
    }
  });

  it("treats a user-owned preset as opaque: only that it parses", () => {
    // A preset the USER owns is theirs to edit, rename or delete. Pinning its text,
    // prefix or limit is how this file went red when they re-made their clone from
    // Default (NSFW) — the shipped presets are ours to pin, theirs is not.
    for (const p of presets) {
      if (p.readonly) continue;
      expect(PromptPresetSchema.safeParse(p).success, p.name).toBe(true);
    }
  });

  it("ships the NSFW instruction as the core document with the rating bullets swapped and Explicit scenes inserted", () => {
      const fmtRating =
        "- First tag is the rating, exactly one word from safe, sensitive, nsfw, explicit — the one that matches what is actually happening. Never a blend of two, never a new word, never more than one rating tag. A tame scene stays tame.";
      const nsfwFmtRating =
        "- First tag is the rating, exactly one word from safe, sensitive, nsfw, explicit — nsfw or explicit when the scene is sexual, safe or sensitive when it is not. Never a blend of two, never a new word, never more than one rating tag.";
      const tagRating = "1. Rating: one word from safe, sensitive, nsfw, explicit — never a blend, never more than one. A tame scene stays tame.";
      const nsfwTagRating = "1. Rating: one word from safe, sensitive, nsfw, explicit — nsfw or explicit when the scene is sexual, safe or sensitive when it is not, never a blend.";
      const explicitScenes =
        "EXPLICIT SCENES\n" +
        "- When the scene is sexually explicit, tag it at the same explicitness, plainly and without euphemism: the act, the position, what is exposed, what the bodies are doing, visible physical state (sweat, fluids, trembling, flushed skin).\n" +
        "- Keep the characters' established appearance, clothing state and arousal consistent with what the scene says. Do not add acts, partners or undress the scene did not describe.\n" +
        "- Never censor, blur, fade or sanitise what the scene describes, and never add safety, boilerplate or refusals. If the scene is not explicit, do not invent explicit content.";

      // Each replacement must actually bite, or the equality below is vacuous.
      expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain(fmtRating);
      expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain(tagRating);
      expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).not.toContain(nsfwFmtRating);
      expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("Return JSON only:");
      expect(preset("default-nsfw").imageGeneration?.instruction).toBe(
        DEFAULT_IMAGE_PROMPT_INSTRUCTION
          .replace(fmtRating, nsfwFmtRating)
          .replace(tagRating, nsfwTagRating)
          .replace("BEFORE OUTPUTTING", `${explicitScenes}\n\nBEFORE OUTPUTTING`)
      );
    });

  it("keeps the rules that stop prose, and the two-character attribution rule", () => {
    // Each of these exists because something leaked through in a real generation:
    // a sentence with articles and a copula, a chained movement, and a
    // two-character scene where nothing said whose hair or eyes were whose.
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("Every item is a TAG, not a clause");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("NEVER write articles (a, an, the)");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("ONE FRAME, ONE INSTANT");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain('WRONG: "A medium close-up shot of');
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("RIGHT: safe, 1boy 1girl, close-up, pale skin");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("WHO IS WHO (two or more characters)");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("prefix it: her ponytail, his black hair");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("In a one-person scene never use those prefixes");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("THE PLAYER (POV scenes)");
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain(
      "No style or quality tags (anime style, masterpiece, best quality)"
    );
    // It is ordered for the encoder: the frame-defining tags sit in the first chunk.
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("The FIRST ~300 CHARACTERS carry the most weight");
    expect(preset("default").imageGeneration?.instruction).toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
  });

  it("pins the MULTIPLE CHARACTERS grouping rule the region splitter depends on", () => {
    // Two characters in one frame is the whole reason character regions exist:
    // the writer has to hand back one group per person, separated by the SAME
    // ` | ` the adapter splits on and passes to the extension as its separator,
    // with the shared scene first (that group becomes the background line, where
    // the preset's style prefix lands). A one-character scene must produce ONE
    // group — a stray separator would invent a region for nobody.
    const core = DEFAULT_IMAGE_PROMPT_INSTRUCTION;
    expect(core).toContain("MULTIPLE CHARACTERS");
    expect(core).toContain('separate the groups with " | "');
    expect(core).toContain("Still ONE line");
    expect(core).toContain("The FIRST group holds what is shared");
    expect(core).toContain("then one group per character, in the order they appear");
    expect(core).toContain("The FIRST group holds what is shared (rating, character count");
    expect(core).toContain('A scene with ONE character has no " | " at all');
    // The separator the prose asks for IS the one the code splits on: one string
    // constant, so the rule can never describe a separator nothing looks for.
    expect(FORGE_COUPLE_SEPARATOR).toBe(" | ");
    expect(core).toContain(FORGE_COUPLE_SEPARATOR);
    // Both shipped presets carry it — `default` byte-identically, NSFW by the
    // same derivation the drift guard above asserts.
    for (const id of ["default", "default-nsfw"]) {
      expect(preset(id).imageGeneration?.instruction, id).toContain("MULTIPLE CHARACTERS");
      expect(preset(id).imageGeneration?.instruction, id).toContain('separate the groups with " | "');
    }
    // The examples teach the distinction that kept tripping the writer: GROUP
    // COUNT, not people. One character in frame is ONE group with no separator;
    // two characters in frame is THREE groups — the shared scene, then one
    // group per person, in the order they appear.
    const oneGroupExample = core
      .split('ONE character in frame — ONE group, no " | " at all:\n')[1]!
      .split("\n")[0]!;
    expect(oneGroupExample).toContain("1girl");
    expect(oneGroupExample).not.toContain("|");

    const twoGroupExample = core
      .split("TWO characters, no POV:\n")[1]!
      .split("\n")[0]!;
    const exampleGroups = twoGroupExample.split("|").map((group) => group.trim());
    expect(exampleGroups).toHaveLength(3);
    expect(exampleGroups[0]).toContain("1boy 1girl");
    expect(exampleGroups[1]).toContain("her ");
    expect(exampleGroups[2]).toContain("his ");
    // …and the POV rule behind the confusion is stated outright: the player is
    // the camera in a POV frame, so the player is never a group of its own.
    expect(core).toContain("the PLAYER is never a group");
    expect(core).toContain("One girl in a POV frame is still ONE group");
    // The user's own clone is theirs: the rule never reached it, and if they
    // have deleted it there is nothing to check. Nothing about its text is
    // asserted — a preset the user owns is opaque to these pins.
  });

  it("leaves a user-owned preset without a block, so it exercises the read-time fallback", () => {
    // A user-owned preset carrying no imageGeneration block is what exercises
    // the read-time fallback. Which presets the user keeps is theirs to decide
    // (both extra ones were deleted from this file), and the resolution itself
    // is covered by the synthetic case at the end of this block — so absence is
    // asserted as absence rather than failing on a preset nobody shipped.
    const userOwned = presets.find((p) => !p.readonly && !p.imageGeneration);
    if (!userOwned) {
      expect(presets.some((p) => !p.readonly && !p.imageGeneration)).toBe(false);
      return;
    }
    expect(userOwned.readonly).toBe(false);
    expect(userOwned.imageGeneration).toBeUndefined();
  });
});

describe("image prompt: the instruction mode", () => {
  const pov = DEFAULT_IMAGE_PROMPT_INSTRUCTION;

  it("defaults a partial image block to POV mode, 6 history messages and no reference", () => {
    const parsed = ImageGenerationSettingsSchema.parse({ instruction: "x" });
    expect(parsed.instructionMode).toBe("pov");
    expect(parsed.historyMessages).toBe(6);
    expect(parsed.includePreviousAnswer).toBe(false);
  });

  it("rejects an unknown mode and an out-of-range history count", () => {
    expect(ImageGenerationSettingsSchema.safeParse({ instructionMode: "third" }).success).toBe(false);
    expect(ImageGenerationSettingsSchema.safeParse({ historyMessages: 13 }).success).toBe(false);
    expect(ImageGenerationSettingsSchema.safeParse({ historyMessages: -1 }).success).toBe(false);
  });

  it("swaps the perspective passages both ways", () => {
    const scene = applyInstructionMode(pov, "scene");
    expect(scene).toContain("THE PLAYER IS A CHARACTER IN THIS FRAME");
    expect(scene).toContain("CAMERA AND FRAMING");
    expect(scene).not.toContain("THE PLAYER IS NOT A CHARACTER");
    expect(scene).not.toContain("THE PLAYER (POV scenes)");
    // Symmetrical: switching back restores the shipped document byte for byte.
    expect(applyInstructionMode(scene, "pov")).toBe(pov);
    // Idempotent: applying the mode the text is already in changes nothing.
    expect(applyInstructionMode(scene, "scene")).toBe(scene);
    expect(applyInstructionMode(pov, "pov")).toBe(pov);
  });

  it("leaves a hand-written instruction alone, and says the mode does not apply", () => {
    const custom = "Write one line of tags, nothing else.";
    expect(applyInstructionMode(custom, "scene")).toBe(custom);
    expect(instructionModeApplies(custom)).toBe(false);
    expect(instructionModeApplies(pov)).toBe(true);
  });

  it("keeps every pov passage a verbatim substring of the shipped instruction", () => {
    // The swap searches for these literally: if the shipped wording moves, this
    // fails here rather than silently disabling the mode.
    for (const [povSide] of PERSPECTIVE_PAIRS) {
      expect(pov, povSide.slice(0, 40)).toContain(povSide);
    }
  });

  it("keeps every scene passage out of the shipped instruction", () => {
    for (const [, sceneSide] of PERSPECTIVE_PAIRS) {
      expect(pov, sceneSide.slice(0, 40)).not.toContain(sceneSide);
    }
  });

  it("still switches a preset saved with the legacy Scene wording", () => {
    // Verbatim as it shipped while a third-person frame meant "no player at all".
    // A document written then must not go inert: the swap has to rewrite what is IN
    // the document, not what we would write today.
    const legacy = `NO CAMERA — THE PLAYER IS NOT IN THIS FRAME
- This frame is NOT seen through the player's eyes and the player is NOT in it. Nothing about the player may enter the tag line: no appearance, no wardrobe, no position.
- NEVER tag pov, male pov, female pov, viewer's hands, viewer's chest visible or viewer's waistband. Those tags belong to a POV frame only.
- No player block is provided for this frame. Do not infer one and do not invent one.
- Every person the frame shows is a CHARACTER: their own tags, and in a multi-character scene their own " | " group.`;
    const saved = ["HEAD", legacy, "TAIL"].join("\n");

    expect(instructionModeApplies(saved)).toBe(true);
    const asPov = applyInstructionMode(saved, "pov");
    expect(asPov).not.toContain("NO CAMERA");
    expect(asPov).toContain("THE PLAYER IS NOT A CHARACTER");
    expect(asPov.startsWith("HEAD")).toBe(true);
    expect(asPov.endsWith("TAIL")).toBe(true);
    // Switching back to scene gives TODAY's wording, not the old text: the legacy
    // pass is one-way.
    const backToScene = applyInstructionMode(asPov, "scene");
    expect(backToScene).toContain("THE PLAYER IS A CHARACTER IN THIS FRAME");
    expect(backToScene).not.toContain("NO CAMERA");
  });

  it("rewrites every legacy Scene passage, and keeps one per pair", () => {
    // The mapping is by INDEX: a pair added without its legacy entry would silently
    // stop rewriting that passage, so both halves of that are asserted.
    expect(LEGACY_SCENE_SIDES).toHaveLength(PERSPECTIVE_PAIRS.length);

    const saved = ["HEAD", ...LEGACY_SCENE_SIDES, "TAIL"].join("\n");
    const asPov = applyInstructionMode(saved, "pov");
    for (const [povSide] of PERSPECTIVE_PAIRS) {
      expect(asPov, povSide.slice(0, 40)).toContain(povSide);
    }
    for (const old of LEGACY_SCENE_SIDES) {
      expect(asPov, old.slice(0, 40)).not.toContain(old);
    }
    expect(asPov.startsWith("HEAD")).toBe(true);
    expect(asPov.endsWith("TAIL")).toBe(true);

    const backToScene = applyInstructionMode(asPov, "scene");
    for (const [, sceneSide] of PERSPECTIVE_PAIRS) {
      expect(backToScene, sceneSide.slice(0, 40)).toContain(sceneSide);
    }
    for (const old of LEGACY_SCENE_SIDES) {
      expect(backToScene, old.slice(0, 40)).not.toContain(old);
    }
  });
});

const IMAGE_BLOCK = {
  instruction: "A test instruction.",
  // Non-default on purpose: create/read/update/snapshot all deep-equal this block,
  // so these three only pass if they survive every hop.
  instructionMode: "scene",
  positivePrefix: "test prefix",
  negativePrefix: "test negative",
  promptCharacterLimit: 111,
  includeState: false,
  includeCast: true,
  historyMessages: 3,
  includePreviousAnswer: true
};

/** The preset routes resolve `data/` from the process cwd, so this block swaps
 *  the cwd for a hermetic temp dir before importing them (once: the module
 *  graph captures the temp data dirs at import time). */
describe("image generation: preset routes and the global prompt config", () => {
  let app: ReturnType<typeof Fastify>;
  let dir: string;
  let playthroughsDir: string;
  let startedIn: string;

  const presetsFile = () => join(dir, "data", "prompt-presets.json");
  const readPresets = () => JSON.parse(readFileSync(presetsFile(), "utf8")) as Array<{ id: string; imageGeneration?: unknown }>;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), "bobbinloom-preset-routes-"));
    playthroughsDir = join(dir, "data", "playthroughs");
    mkdirSync(playthroughsDir, { recursive: true });
    writeFileSync(
      presetsFile(),
      JSON.stringify(
        [
          { id: "shipped", name: "Shipped", readonly: true, modules: { turn: [] }, imageGeneration: { ...IMAGE_BLOCK } },
          { id: "user-no-image", name: "User (no image)", readonly: false, modules: { turn: [] } },
          { id: "user-plain", name: "User (plain)", readonly: false, modules: { turn: [] } },
          { id: "user-with-image", name: "User (image)", readonly: false, modules: { turn: [] }, imageGeneration: { ...IMAGE_BLOCK } }
        ],
        null,
        1
      ),
      "utf8"
    );

    startedIn = process.cwd();
    process.chdir(dir);
    const [{ presetRoutes }, { playthroughRoutes }, { promptConfigRoutes }] = await Promise.all([
      import("../src/server/routes/presets"),
      import("../src/server/routes/playthroughs"),
      import("../src/server/routes/promptConfig")
    ]);
    app = Fastify();
    await app.register(presetRoutes);
    await app.register(playthroughRoutes);
    await app.register(promptConfigRoutes);
    await app.ready();
  });

  afterAll(async () => {
    await app?.close();
    process.chdir(startedIn);
    rmSync(dir, { recursive: true, force: true });
  });

  it("round-trips imageGeneration through the preset PUT route", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/prompt-presets/user-no-image",
      payload: { imageGeneration: { positivePrefix: "photorealistic, 35mm film" } }
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    // Inner fields carry defaults, so a partial block arrives complete.
    expect(body.imageGeneration.positivePrefix).toBe("photorealistic, 35mm film");
    expect(body.imageGeneration.instruction).toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
    expect(body.imageGeneration.promptCharacterLimit).toBe(DEFAULT_IMAGE_GENERATION_SETTINGS.promptCharacterLimit);
    expect(body.imageGeneration.includeState).toBe(true);
    expect(body.imageGeneration.includeCast).toBe(true);
    // Persisted, not merely echoed.
    expect(readPresets().find((p) => p.id === "user-no-image")!.imageGeneration).toEqual(body.imageGeneration);
  });

  it("returns the stored block from the preset GET route", async () => {
    const res = await app.inject({ method: "GET", url: "/api/prompt-presets/user-with-image" });
    expect(res.statusCode).toBe(200);
    expect(res.json().imageGeneration).toEqual(IMAGE_BLOCK);
  });

  it("copies a preset's image block into the global config and persists it", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/prompt-config/active",
      payload: { presetId: "user-with-image" }
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().activePresetId).toBe("user-with-image");
    expect(res.json().promptConfig.imageGeneration).toEqual(IMAGE_BLOCK);
    expect(res.json().promptConfig.modules).toEqual({ turn: [] });

    // Persisted to the runtime settings file, not merely echoed.
    const onDisk = JSON.parse(readFileSync(join(dir, "data", "user-settings.json"), "utf8"));
    expect(onDisk.activePresetId).toBe("user-with-image");
    expect(onDisk.promptConfig.imageGeneration).toEqual(IMAGE_BLOCK);
  });

  it("omits the block when the preset ships none (read-time fallback)", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/prompt-config/active",
      payload: { presetId: "user-plain" }
    });
    expect(res.statusCode).toBe(200);
    // Undefined, not a copy of nothing: the read sites then fall back to
    // DEFAULT_IMAGE_GENERATION_SETTINGS, which is the current shipped text.
    expect(res.json().promptConfig.imageGeneration).toBeUndefined();
  });

  it("404s a switch to a preset that does not exist", async () => {
    const res = await app.inject({
      method: "PUT",
      url: "/api/prompt-config/active",
      payload: { presetId: "nope" }
    });
    expect(res.statusCode).toBe(404);
  });

  it("patches ONE field of the image block, leaving the rest", async () => {
    const before = (await app.inject({
      method: "PUT",
      url: "/api/prompt-config/active",
      payload: { presetId: "user-with-image" }
    })).json().promptConfig.imageGeneration;

    const res = await app.inject({
      method: "PATCH",
      url: "/api/prompt-config",
      payload: { imageGeneration: { ...before, instructionMode: "pov" } }
    });
    expect(res.statusCode).toBe(200);
    // One field changed, every other one survived the merge…
    expect(res.json().promptConfig.imageGeneration).toEqual({ ...before, instructionMode: "pov" });
    // …and the turn modules are untouched by an image-only patch.
    expect(res.json().promptConfig.modules).toEqual({ turn: [] });
  });

  it("400s an invalid image block, with the reason, and writes nothing", async () => {
    const file = join(dir, "data", "user-settings.json");
    const before = existsSync(file) ? readFileSync(file, "utf8") : null;

    for (const payload of [{ imageGeneration: { instructionMode: "third" } }, { imageGeneration: { historyMessages: 99 } }]) {
      const res = await app.inject({ method: "PATCH", url: "/api/prompt-config", payload });
      expect(res.statusCode, JSON.stringify(payload)).toBe(400);
      expect(res.json().error).toContain("Invalid prompt config patch");
    }
    // A 400 with the reason, rather than the 500 a thrown ZodError would produce —
    // and no half-written config behind it.
    const after = existsSync(file) ? readFileSync(file, "utf8") : null;
    expect(after).toBe(before);
  });

  it("rejects a write to a read-only preset and leaves the file untouched", async () => {
    const before = readFileSync(presetsFile(), "utf8");
    const res = await app.inject({
      method: "PUT",
      url: "/api/prompt-presets/shipped",
      payload: { imageGeneration: { positivePrefix: "nope" } }
    });
    expect(res.statusCode).toBe(403);
    expect(readFileSync(presetsFile(), "utf8")).toBe(before);
  });

  it("deep-copies the block when creating a preset from a source", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/prompt-presets",
      payload: { name: "Clone", cloneFromId: "user-with-image" }
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().imageGeneration).toEqual(IMAGE_BLOCK);

    // Editing the source afterwards must not reach the clone.
    const edited = await app.inject({
      method: "PUT",
      url: "/api/prompt-presets/user-with-image",
      payload: { imageGeneration: { ...IMAGE_BLOCK, positivePrefix: "changed after the clone" } }
    });
    expect(edited.statusCode).toBe(200);
    const reread = await app.inject({ method: "GET", url: `/api/prompt-presets/${created.json().id}` });
    expect(reread.json().imageGeneration).toEqual(IMAGE_BLOCK);

    // Restore the source for the tests below.
    await app.inject({
      method: "PUT",
      url: "/api/prompt-presets/user-with-image",
      payload: { imageGeneration: IMAGE_BLOCK }
    });
  });

  it("parses a preset with no imageGeneration block and falls back to the shipped defaults", () => {
    const parsed = PromptPresetSchema.parse({ id: "legacy", name: "Legacy", readonly: false, modules: { turn: [] } });
    expect(parsed.imageGeneration).toBeUndefined();
    const resolved = parsed.imageGeneration ?? DEFAULT_IMAGE_GENERATION_SETTINGS;
    expect(resolved.instruction).toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
    expect(resolved.promptCharacterLimit).toBe(1200);
  });

  it("round-trips the brainstorm settings, one field at a time", async () => {
    const initial = await app.inject({ method: "GET", url: "/api/settings/brainstorm" });
    expect(initial.statusCode).toBe(200);
    // New sections are allowed out of the box; the other two default to off and to the active connection.
    expect(initial.json()).toEqual({ includeOriginalCard: false, textProviderId: null, allowNewSections: true });

    // Each control saves as it changes, so a patch carries only what moved.
    const toggled = await app.inject({
      method: "PUT",
      url: "/api/settings/brainstorm",
      payload: { includeOriginalCard: true }
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json()).toEqual({ includeOriginalCard: true, textProviderId: null, allowNewSections: true });

    const pointed = await app.inject({
      method: "PUT",
      url: "/api/settings/brainstorm",
      payload: { textProviderId: "beta" }
    });
    expect(pointed.json()).toEqual({ includeOriginalCard: true, textProviderId: "beta", allowNewSections: true });

    const restricted = await app.inject({
      method: "PUT",
      url: "/api/settings/brainstorm",
      payload: { allowNewSections: false }
    });
    expect(restricted.json()).toEqual({ includeOriginalCard: true, textProviderId: "beta", allowNewSections: false });

    // And back to following the active connection.
    const cleared = await app.inject({
      method: "PUT",
      url: "/api/settings/brainstorm",
      payload: { textProviderId: null }
    });
    expect(cleared.json()).toEqual({ includeOriginalCard: true, textProviderId: null, allowNewSections: false });

    const reread = await app.inject({ method: "GET", url: "/api/settings/brainstorm" });
    expect(reread.json()).toEqual({ includeOriginalCard: true, textProviderId: null, allowNewSections: false });

    const rejected = await app.inject({
      method: "PUT",
      url: "/api/settings/brainstorm",
      payload: { includeOriginalCard: "yes" }
    });
    expect(rejected.statusCode).toBe(400);
  });

  it("round-trips the chapter opening mode, defaulting to continuation and rejecting an unknown value", async () => {
    // A chapter-lifecycle preference beside the appearance ones; a fresh install must not need a
    // write to get a sane default.
    const initial = await app.inject({ method: "GET", url: "/api/settings/chapter-opening-mode" });
    expect(initial.statusCode).toBe(200);
    expect((initial.json() as { chapterOpeningMode?: string }).chapterOpeningMode).toBe("continuation");

    const saved = await app.inject({
      method: "PUT",
      url: "/api/settings/chapter-opening-mode",
      payload: { openingMode: "longJump" }
    });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as { chapterOpeningMode?: string }).chapterOpeningMode).toBe("longJump");

    const reread = await app.inject({ method: "GET", url: "/api/settings/chapter-opening-mode" });
    expect((reread.json() as { chapterOpeningMode?: string }).chapterOpeningMode).toBe("longJump");

    const rejected = await app.inject({
      method: "PUT",
      url: "/api/settings/chapter-opening-mode",
      payload: { openingMode: "teleport" }
    });
    expect(rejected.statusCode).toBe(400);
  });

  it("round-trips the cover art shape, defaulting to landscape and rejecting an unknown value", async () => {
    // The shape is a display preference, but it lives in the appearance settings beside the
    // avatar shape (which is why this rides in the preset-routes harness).
    const initial = await app.inject({ method: "GET", url: "/api/settings/appearance" });
    expect(initial.statusCode).toBe(200);
    // A fresh install must not need a write to get a sane frame.
    expect((initial.json() as { coverAspect?: string }).coverAspect).toBe("landscape");

    const saved = await app.inject({
      method: "PUT",
      url: "/api/settings/appearance",
      payload: { coverAspect: "square" }
    });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as { coverAspect?: string }).coverAspect).toBe("square");

    const reread = await app.inject({ method: "GET", url: "/api/settings/appearance" });
    expect((reread.json() as { coverAspect?: string }).coverAspect).toBe("square");

    const rejected = await app.inject({
      method: "PUT",
      url: "/api/settings/appearance",
      payload: { coverAspect: "cinema" }
    });
    expect(rejected.statusCode).toBe(400);
  });

  it("round-trips the panel swipe switch, defaulting to on and rejecting a non-boolean", async () => {
    // Display, like the cover shape beside it — and the one appearance value the play view ACTS on,
    // which is why it has to survive a round trip through the same route.
    const initial = await app.inject({ method: "GET", url: "/api/settings/appearance" });
    expect((initial.json() as { paneSwipeEnabled?: boolean }).paneSwipeEnabled).toBe(true);

    // A neighbouring appearance value, so the "leaves the rest alone" check below does not depend on
    // another test having written one.
    await app.inject({
      method: "PUT",
      url: "/api/settings/appearance",
      payload: { coverAspect: "portrait" }
    });

    const saved = await app.inject({
      method: "PUT",
      url: "/api/settings/appearance",
      payload: { paneSwipeEnabled: false }
    });
    expect(saved.statusCode).toBe(200);
    expect((saved.json() as { paneSwipeEnabled?: boolean }).paneSwipeEnabled).toBe(false);

    const reread = await app.inject({ method: "GET", url: "/api/settings/appearance" });
    expect((reread.json() as { paneSwipeEnabled?: boolean }).paneSwipeEnabled).toBe(false);

    // A switch is a boolean: a truthy string must be a 400 with a reason, and write nothing.
    const rejected = await app.inject({
      method: "PUT",
      url: "/api/settings/appearance",
      payload: { paneSwipeEnabled: "yes" }
    });
    expect(rejected.statusCode).toBe(400);
    expect(JSON.stringify(rejected.json())).toContain("paneSwipeEnabled");

    const afterRejection = await app.inject({ method: "GET", url: "/api/settings/appearance" });
    expect((afterRejection.json() as { paneSwipeEnabled?: boolean }).paneSwipeEnabled).toBe(false);

    // …and neither PUT disturbed the value beside it.
    expect((afterRejection.json() as { coverAspect?: string }).coverAspect).toBe("portrait");
  });

});

/** The global config's bootstrap path: a fresh install (or a pre-change
 *  user-settings.json) has no promptConfig, so the first read seeds it from the
 *  active preset and persists it. Without this a fresh install would generate
 *  with an empty module set. */
describe("global prompt config seeding", () => {
  it("seeds and persists from the active preset when nothing is stored yet", async () => {
    const root = mkdtempSync(join(tmpdir(), "bobbinloom-seed-"));
    const startedIn = process.cwd();
    try {
      mkdirSync(join(root, "data"), { recursive: true });
      writeFileSync(
        join(root, "data", "prompt-presets.json"),
        JSON.stringify([
          {
            id: "default",
            name: "Default",
            readonly: true,
            modules: {
              turn: [{ id: "mod_seed", name: "Seed module", description: "d", content: "SEEDED", order: 1, enabled: true }]
            },
            imageGeneration: { ...IMAGE_BLOCK }
          }
        ]),
        "utf8"
      );
      process.chdir(root);
      const { loadPromptConfig } = await import("../src/server/promptConfigStore");
      const state = loadPromptConfig(join(root, "data"));
      expect(state.activePresetId).toBe("default");
      expect(state.promptConfig.modules.turn).toHaveLength(1);
      expect(state.promptConfig.modules.turn[0].content).toBe("SEEDED");
      expect(state.promptConfig.imageGeneration).toEqual(IMAGE_BLOCK);
      // Persisted, so the next read returns the same thing rather than re-seeding.
      expect(existsSync(join(root, "data", "user-settings.json"))).toBe(true);
    } finally {
      process.chdir(startedIn);
      rmSync(root, { recursive: true, force: true });
    }
  });
});


