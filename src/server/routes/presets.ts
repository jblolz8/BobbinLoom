import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { AvatarShapeSchema, EMPTY_MODULE_SET, PromptModuleSetSchema, TagTaxonomyConfigSchema, type PromptModuleSet, type PromptPreset } from "../../schemas";
import { loadPresets, savePresets, loadAppSettings, saveAppSettings, settingsDir } from "./helpers";

const CreatePresetBody = z.object({
  name: z.string().min(1),
  cloneFromId: z.string().optional()
});

const UpdatePresetBody = z.object({
  name: z.string().min(1).optional(),
  modules: PromptModuleSetSchema.optional()
});

const DefaultPresetBody = z.object({
  defaultPresetId: z.string().min(1)
});

export async function presetRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/prompt-presets", async () => {
    const presets = loadPresets();
    return presets.map(({ id, name, readonly, modules }) => ({
      id,
      name,
      readonly,
      moduleCount: modules.turn.length + modules.seed.length + modules.sheet.length + modules.summary.length
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
    if (body.cloneFromId) {
      const source = presets.find((p) => p.id === body.cloneFromId);
      if (!source) return reply.code(404).send({ error: "Source preset not found" });
      modules = {
        turn: source.modules.turn.map((m) => ({ ...m })),
        seed: source.modules.seed.map((m) => ({ ...m })),
        sheet: source.modules.sheet.map((m) => ({ ...m })),
        summary: source.modules.summary.map((m) => ({ ...m }))
      };
    }

    const id = `preset_${Date.now()}`;
    const preset: PromptPreset = { id, name: body.name, readonly: false, modules };
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

  app.get("/api/settings/default-preset", async () => {
    return { defaultPresetId: loadAppSettings(settingsDir).defaultPresetId ?? "default" };
  });

  app.put("/api/settings/default-preset", async (request) => {
    const body = DefaultPresetBody.parse(request.body ?? {});
    saveAppSettings(settingsDir, { defaultPresetId: body.defaultPresetId });
    return { defaultPresetId: body.defaultPresetId };
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

  app.get("/api/settings/appearance", async () => {
    const settings = loadAppSettings(settingsDir);
    return { avatarShape: settings.avatarShape ?? "rounded" };
  });

  app.put("/api/settings/appearance", async (request) => {
    const body = z.object({ avatarShape: AvatarShapeSchema }).parse(request.body ?? {});
    const updated = saveAppSettings(settingsDir, { avatarShape: body.avatarShape });
    return { avatarShape: updated.avatarShape ?? "rounded" };
  });
}
