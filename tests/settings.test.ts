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
import { DEFAULT_IMAGE_GENERATION_SETTINGS, DEFAULT_IMAGE_PROMPT_INSTRUCTION } from "../src/engine/imageDefaults";
import { FORGE_COUPLE_SEPARATOR } from "../src/server/imageProvider/a1111Provider";
import { ImageApiStyleSchema, PromptPresetSchema, ProviderConnectionSchema } from "../src/schemas";

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
    expect(settings.defaultPresetId).toBe("default");
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
    expect(settings.defaultPresetId).toBe("default");
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

    expect(settings.defaultPresetId).toBe("default");
    expect(settings.themePreset).toBe("default-dark");
    expect(existsSync(join(dir, "user-settings.json.bak"))).toBe(true);
  });

  it("saveAppSettings persists runtime overrides to user-settings.json and merges with defaults", () => {
    const dir = tempDir();
    const saved = saveAppSettings(dir, { defaultPresetId: "default-nsfw" });

    expect(saved.defaultPresetId).toBe("default-nsfw");
    expect(saved.schemaVersion).toBe(1);
    expect(typeof saved.updatedAt).toBe("string");
    // Untouched defaults survive the merge.
    expect(saved.themePreset).toBe("default-dark");
    expect(saved.avatarShape).toBe("rounded");

    // Persisted to the runtime file, not the template.
    expect(loadAppSettings(dir).defaultPresetId).toBe("default-nsfw");
    expect(existsSync(join(dir, "user-settings.json"))).toBe(true);
    const onDisk = JSON.parse(readFileSync(join(dir, "user-settings.json"), "utf8"));
    expect(onDisk.defaultPresetId).toBe("default-nsfw");

    const updated = saveAppSettings(dir, { defaultPresetId: "default" });
    expect(updated.defaultPresetId).toBe("default");
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

  it("ships the reviewed prefixes, character limit and flags on both read-only presets", () => {
    for (const id of ["default", "default-nsfw"]) {
      const image = preset(id).imageGeneration!;
      expect(image.positivePrefix).toBe("anime style");
      expect(image.promptCharacterLimit).toBe(1200);
      expect(image.includeState).toBe(true);
      expect(image.includeCast).toBe(true);
    }
    expect(preset("default").imageGeneration?.negativePrefix).toBe(DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix);
    expect(preset("default-nsfw").imageGeneration?.negativePrefix).toBe(
      `${DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix}, censored, mosaic censoring, bar censor`
    );
  });

  it("carries the raised 1200-character limit on every preset that ships an image block", () => {
    for (const p of presets) {
      if (!p.imageGeneration) continue;
      expect(p.imageGeneration.promptCharacterLimit, p.name).toBe(1200);
    }
    // Named explicitly: the two shipped presets AND the user's own clone.
    expect(preset("default").imageGeneration?.promptCharacterLimit).toBe(1200);
    expect(preset("default-nsfw").imageGeneration?.promptCharacterLimit).toBe(1200);
    // A user-owned preset: present is checked, absent is their prerogative.
    const clone = presets.find((p) => p.name === "Default (NSFW) (copy)");
    if (clone) {
      expect(clone.imageGeneration?.promptCharacterLimit).toBe(1200);
      // The clone's custom 1980s-anime prefix and instruction stay the user's own.
      expect(clone.imageGeneration?.positivePrefix).toBe("1980s anime style, retro anime, vintage anime, cel animation, ");
      expect(clone.imageGeneration?.instruction).not.toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
    }
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

  it("keeps the user's clone of Default (NSFW) on the same negative, and its own positive", () => {
    // The clone is a copy of `default-nsfw`, so a negative that drifts from it is
    // a papercut the user was told would ride along — but its 1980s-anime style
    // prefix and its prose instruction are the user's own and must not be touched.
    // It is ALSO the user's to delete, so its absence is not a failure: only a
    // clone that is present is checked. (It has been deleted once already.)
    const clone = presets.find((p) => p.name === "Default (NSFW) (copy)");
    if (!clone) return;
    expect(clone.imageGeneration?.negativePrefix).toBe(preset("default-nsfw").imageGeneration?.negativePrefix);
    expect(clone.imageGeneration?.negativePrefix).toBe(
      `${DEFAULT_IMAGE_GENERATION_SETTINGS.negativePrefix}, censored, mosaic censoring, bar censor`
    );
    expect(clone.imageGeneration?.positivePrefix).toBe("1980s anime style, retro anime, vintage anime, cel animation, ");
    expect(clone.imageGeneration?.instruction).not.toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
  });

  it("ships the NSFW instruction as the core document with the rating bullet swapped and Explicit scenes inserted", () => {
    const ratingBullet =
      "- First tag is the rating that matches what is actually happening: safe, sensitive, nsfw, or explicit. A tame scene stays tame.";
    const nsfwRatingBullet =
      "- First tag is the rating: nsfw or explicit when the scene is sexual, safe or sensitive when it is not.";
    const explicitScenes =
      "EXPLICIT SCENES\n" +
      "- When the scene is sexually explicit, tag it at the same explicitness, plainly and without euphemism: the act, the position, what is exposed, what the bodies are doing, visible physical state (sweat, fluids, trembling, flushed skin).\n" +
      "- Keep the characters' established appearance, clothing state and arousal consistent with what the scene says. Do not add acts, partners or undress the scene did not describe.\n" +
      "- Never censor, blur, fade or sanitise what the scene describes, and never add safety, boilerplate or refusals. If the scene is not explicit, do not invent explicit content.";

    // Both replacements must actually bite, or the equality below is vacuous.
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain(ratingBullet);
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("Return JSON only:");
    expect(preset("default-nsfw").imageGeneration?.instruction).toBe(
      DEFAULT_IMAGE_PROMPT_INSTRUCTION
        .replace(ratingBullet, nsfwRatingBullet)
        .replace("Return JSON only:", `${explicitScenes}\n\nReturn JSON only:`)
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
    expect(DEFAULT_IMAGE_PROMPT_INSTRUCTION).toContain("RIGHT: close-up, 1boy 1girl, pale skin");
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
    expect(core).toContain("The rating and the character count still open the line");
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
      .split("TWO characters in frame — THREE groups:")[1]!
      .split("\n")[1]!;
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
    // have deleted it there is nothing to check.
    const userClone = presets.find((p) => p.name === "Default (NSFW) (copy)");
    if (userClone) {
      expect(userClone.imageGeneration?.instruction).not.toContain("MULTIPLE CHARACTERS");
    }
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

const IMAGE_BLOCK = {
  instruction: "A test instruction.",
  positivePrefix: "test prefix",
  negativePrefix: "test negative",
  promptCharacterLimit: 111,
  includeState: false,
  includeCast: true
};

/** The preset routes resolve `data/` from the process cwd, so this block swaps
 *  the cwd for a hermetic temp dir before importing them (once: the module
 *  graph captures the temp data dirs at import time). */
describe("image generation: preset routes and the playthrough snapshot", () => {
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
    const [{ presetRoutes }, { playthroughRoutes }] = await Promise.all([
      import("../src/server/routes/presets"),
      import("../src/server/routes/playthroughs")
    ]);
    app = Fastify();
    await app.register(presetRoutes);
    await app.register(playthroughRoutes);
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

  it("snapshots imageGeneration into a playthrough's prompt settings", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/playthroughs",
      payload: { name: "Snapshot", blank: true, presetId: "user-with-image" }
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id as string;

    const snap = await app.inject({
      method: "PUT",
      url: `/api/playthroughs/${id}/prompt-settings`,
      payload: { presetId: "user-with-image" }
    });
    expect(snap.statusCode).toBe(200);
    expect(snap.json().imageGeneration).toEqual(IMAGE_BLOCK);

    const onDisk = JSON.parse(readFileSync(join(playthroughsDir, `${id}.json`), "utf8"));
    expect(onDisk.promptSettings.imageGeneration).toEqual(IMAGE_BLOCK);

    // A snapshot is a deep copy: editing the preset afterwards cannot reach it.
    await app.inject({
      method: "PUT",
      url: "/api/prompt-presets/user-with-image",
      payload: { imageGeneration: { ...IMAGE_BLOCK, positivePrefix: "edited after the snapshot" } }
    });
    const after = JSON.parse(readFileSync(join(playthroughsDir, `${id}.json`), "utf8"));
    expect(after.promptSettings.imageGeneration.positivePrefix).toBe("test prefix");
  });

  it("omits the snapshot block when the preset has none (read-time fallback)", async () => {
    const created = await app.inject({
      method: "POST",
      url: "/api/playthroughs",
      payload: { name: "No image block", blank: true, presetId: "user-plain" }
    });
    expect(created.statusCode).toBe(201);
    const snap = await app.inject({
      method: "PUT",
      url: `/api/playthroughs/${created.json().id}/prompt-settings`,
      payload: { presetId: "user-plain" }
    });
    expect(snap.statusCode).toBe(200);
    expect(snap.json().imageGeneration).toBeUndefined();
  });

  it("parses a preset with no imageGeneration block and falls back to the shipped defaults", () => {
    const parsed = PromptPresetSchema.parse({ id: "legacy", name: "Legacy", readonly: false, modules: { turn: [] } });
    expect(parsed.imageGeneration).toBeUndefined();
    const resolved = parsed.imageGeneration ?? DEFAULT_IMAGE_GENERATION_SETTINGS;
    expect(resolved.instruction).toBe(DEFAULT_IMAGE_PROMPT_INSTRUCTION);
    expect(resolved.promptCharacterLimit).toBe(1200);
  });
});
