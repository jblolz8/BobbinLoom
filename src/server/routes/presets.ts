import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  AvatarShapeSchema,
  CoverAspectSchema,
  ChapterOpeningModeSchema,
  CharacterFormatSchema,
  CustomThemeColorsSchema,
  EMPTY_MODULE_SET,
  ImageGenerationSettingsSchema,
  PromptModuleSetSchema,
  TagTaxonomyConfigSchema,
  ThemeModeSchema,
  type PromptModuleSet,
  type PromptPreset
} from "../../schemas";
import { loadPresets, savePresets, loadAppSettings, saveAppSettings, settingsDir } from "./helpers";
import { DEFAULT_APP_SETTINGS } from "../appSettingsStore";

const CreatePresetBody = z.object({
  name: z.string().min(1),
  cloneFromId: z.string().optional()
});

const UpdatePresetBody = z.object({
  name: z.string().min(1).optional(),
  modules: PromptModuleSetSchema.optional(),
  characterFormat: CharacterFormatSchema.optional(),
  imageGeneration: ImageGenerationSettingsSchema.optional()
});

/** The appearance panel's writable fields. Declared once so the route can `safeParse` it and
 *  answer 400 with the reason, instead of letting a thrown ZodError become a 500. */
const AppearanceBody = z.object({
  avatarShape: AvatarShapeSchema.optional(),
  coverAspect: CoverAspectSchema.optional(),
  themeMode: ThemeModeSchema.optional(),
  themePreset: z.string().optional(),
  customThemeColors: CustomThemeColorsSchema.optional(),
  /** The panel swipe is display, not appearance — it lives here because this is the settings surface
   *  the play view already reads, and the panel that edits it is the one the user thinks of as
   *  "how the app behaves". */
  paneSwipeEnabled: z.boolean().optional()
});

export async function presetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/prompt-presets", async () => {
    const presets = loadPresets();
    return presets.map(({ id, name, readonly, modules }) => ({
      id,
      name,
      readonly,
      moduleCount: modules.turn.length
    }));
  });

  app.get("/api/prompt-presets/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const preset = loadPresets().find((p) => p.id === params.id);
    if (!preset) return reply.code(404).send({ error: "Preset not found" });
    return preset;
  });

  app.post("/api/prompt-presets", async (request, reply) => {
    const body = CreatePresetBody.parse(request.body ?? {});
    const presets = loadPresets();

    let modules: PromptModuleSet = EMPTY_MODULE_SET;
    let characterFormat: PromptPreset["characterFormat"];
    let imageGeneration: PromptPreset["imageGeneration"];
    if (body.cloneFromId) {
      const source = presets.find((p) => p.id === body.cloneFromId);
      if (!source) return reply.code(404).send({ error: "Source preset not found" });
      modules = {
        turn: source.modules.turn.map((m) => ({ ...m }))
      };
      characterFormat = source.characterFormat ? JSON.parse(JSON.stringify(source.characterFormat)) : undefined;
      imageGeneration = source.imageGeneration ? JSON.parse(JSON.stringify(source.imageGeneration)) : undefined;
    }

    const id = `preset_${Date.now()}`;
    const preset: PromptPreset = {
      id,
      name: body.name,
      readonly: false,
      modules,
      ...(characterFormat ? { characterFormat } : {}),
      ...(imageGeneration ? { imageGeneration } : {})
    };
    presets.push(preset);
    savePresets(presets);
    return reply.code(201).send(preset);
  });

  app.put("/api/prompt-presets/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = UpdatePresetBody.parse(request.body ?? {});
    const presets = loadPresets();
    const index = presets.findIndex((p) => p.id === params.id);
    if (index === -1) return reply.code(404).send({ error: "Preset not found" });
    if (presets[index].readonly) return reply.code(403).send({ error: "Cannot modify read-only preset" });

    if (body.name !== undefined) presets[index].name = body.name;
    if (body.modules !== undefined) presets[index].modules = body.modules;
    if (body.characterFormat !== undefined) presets[index].characterFormat = body.characterFormat;
    if (body.imageGeneration !== undefined) presets[index].imageGeneration = body.imageGeneration;
    savePresets(presets);
    return presets[index];
  });

  app.delete("/api/prompt-presets/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const presets = loadPresets();
    const index = presets.findIndex((p) => p.id === params.id);
    if (index === -1) return reply.code(404).send({ error: "Preset not found" });
    if (presets[index].readonly) return reply.code(403).send({ error: "Cannot delete read-only preset" });

    presets.splice(index, 1);
    savePresets(presets);
    return { ok: true };
  });

  app.get("/api/settings/tag-taxonomy", async () => {
    const settings = loadAppSettings(settingsDir);
    return {
      tagTaxonomy: settings.tagTaxonomy ?? { customCategories: [], tagOverrides: {} },
    };
  });

  app.put("/api/settings/tag-taxonomy", async (request) => {
    const body = TagTaxonomyConfigSchema.parse(request.body ?? {});
    const updated = saveAppSettings(settingsDir, { tagTaxonomy: body });
    return { tagTaxonomy: updated.tagTaxonomy ?? { customCategories: [], tagOverrides: {} } };
  });

  /** The last chapter-opening mode the player chose. Its own endpoint rather than a field on the
   *  appearance payload: it is not appearance, and that route hand-lists its response fields, which
   *  would silently drop it. */
  app.get("/api/settings/chapter-opening-mode", async () => {
    const settings = loadAppSettings(settingsDir);
    return { chapterOpeningMode: settings.chapterOpeningMode ?? DEFAULT_APP_SETTINGS.chapterOpeningMode };
  });

  app.put("/api/settings/chapter-opening-mode", async (request, reply) => {
    // safeParse, not parse: an invalid value must be a 400 WITH the reason rather than the 500 a
    // thrown ZodError would produce, and nothing may be written.
    const parsed = z.object({ openingMode: ChapterOpeningModeSchema }).safeParse(request.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`)
        .join("; ");
      return reply.code(400).send({ error: `Invalid chapter opening mode: ${reason}` });
    }
    const updated = saveAppSettings(settingsDir, { chapterOpeningMode: parsed.data.openingMode });
    return { chapterOpeningMode: updated.chapterOpeningMode ?? DEFAULT_APP_SETTINGS.chapterOpeningMode };
  });

  /** The brainstorm assistant's preferences: the original-card context, and which connection it
   *  thinks with. One endpoint with both fields optional, so each control saves as it changes. */
  app.get("/api/settings/brainstorm", async () => {
    const settings = loadAppSettings(settingsDir);
    return {
      includeOriginalCard: settings.brainstormIncludeOriginalCard ?? false,
      textProviderId: settings.brainstormTextProviderId ?? null,
      allowNewSections: settings.brainstormAllowNewSections ?? DEFAULT_APP_SETTINGS.brainstormAllowNewSections ?? true
    };
  });

  app.put("/api/settings/brainstorm", async (request, reply) => {
    // safeParse, so an invalid value is a 400 with the reason rather than a 500, and nothing is
    // written.
    const parsed = z
      .object({
        includeOriginalCard: z.boolean().optional(),
        textProviderId: z.string().nullable().optional(),
        allowNewSections: z.boolean().optional()
      })
      .safeParse(request.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`)
        .join("; ");
      return reply.code(400).send({ error: `Invalid brainstorm settings: ${reason}` });
    }
    const updated = saveAppSettings(settingsDir, {
      ...(parsed.data.includeOriginalCard !== undefined
        ? { brainstormIncludeOriginalCard: parsed.data.includeOriginalCard }
        : {}),
      ...(parsed.data.textProviderId !== undefined
        ? { brainstormTextProviderId: parsed.data.textProviderId }
        : {}),
      ...(parsed.data.allowNewSections !== undefined
        ? { brainstormAllowNewSections: parsed.data.allowNewSections }
        : {})
    });
    return {
      includeOriginalCard: updated.brainstormIncludeOriginalCard ?? false,
      textProviderId: updated.brainstormTextProviderId ?? null,
      allowNewSections: updated.brainstormAllowNewSections ?? DEFAULT_APP_SETTINGS.brainstormAllowNewSections ?? true
    };
  });

  app.get("/api/settings/appearance", async () => {
    const settings = loadAppSettings(settingsDir);
    return {
      avatarShape: settings.avatarShape ?? DEFAULT_APP_SETTINGS.avatarShape,
      coverAspect: settings.coverAspect ?? DEFAULT_APP_SETTINGS.coverAspect,
      themeMode: settings.themeMode ?? DEFAULT_APP_SETTINGS.themeMode,
      themePreset: settings.themePreset ?? DEFAULT_APP_SETTINGS.themePreset,
      customThemeColors: settings.customThemeColors ?? {},
      paneSwipeEnabled: settings.paneSwipeEnabled ?? DEFAULT_APP_SETTINGS.paneSwipeEnabled ?? true,
    };
  });

  app.put("/api/settings/appearance", async (request, reply) => {
    // safeParse, not parse: an invalid value must be a 400 WITH the reason rather than the 500 a
    // thrown ZodError would produce — and nothing may be written (same rule as promptConfig.ts).
    const parsed = AppearanceBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues
        .map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`)
        .join("; ");
      return reply.code(400).send({ error: `Invalid appearance settings: ${reason}` });
    }
    const updated = saveAppSettings(settingsDir, parsed.data);
    return {
      avatarShape: updated.avatarShape ?? DEFAULT_APP_SETTINGS.avatarShape,
      coverAspect: updated.coverAspect ?? DEFAULT_APP_SETTINGS.coverAspect,
      themeMode: updated.themeMode ?? DEFAULT_APP_SETTINGS.themeMode,
      themePreset: updated.themePreset ?? DEFAULT_APP_SETTINGS.themePreset,
      customThemeColors: updated.customThemeColors ?? {},
      paneSwipeEnabled: updated.paneSwipeEnabled ?? DEFAULT_APP_SETTINGS.paneSwipeEnabled ?? true,
    };
  });
}
