import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { CharacterFormatSchema, ImageGenerationSettingsSchema, PromptModuleSetSchema, type PromptConfig } from "../../schemas";
import { loadPresets, settingsDir } from "./helpers";
import { loadPromptConfig, persistPromptConfig, promptConfigFromPreset } from "../promptConfigStore";

const PatchPromptConfigBody = z.object({
  modules: PromptModuleSetSchema.optional(),
  characterFormat: CharacterFormatSchema.optional(),
  imageGeneration: ImageGenerationSettingsSchema.optional(),
});

const ActivePresetBody = z.object({
  presetId: z.string().min(1),
});

export async function promptConfigRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/prompt-config", async () => loadPromptConfig(settingsDir));

  // Merge one or more sections into the global config. Everything else is left
  // untouched — a text edit to the image instruction must never clobber the turn
  // modules or the sheet format.
  app.patch("/api/prompt-config", async (request, reply) => {
    // safeParse, not parse: an invalid block must be a 400 WITH the reason rather
    // than the 500 a thrown ZodError would produce, and nothing may be written.
    const parsed = PatchPromptConfigBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      const reason = parsed.error.issues.map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`).join("; ");
      return reply.code(400).send({ error: `Invalid prompt config patch: ${reason}` });
    }
    const patch = parsed.data;
    const current = loadPromptConfig(settingsDir);
    const next: PromptConfig = {
      modules: patch.modules ?? current.promptConfig.modules,
      ...(patch.characterFormat !== undefined || current.promptConfig.characterFormat !== undefined
        ? { characterFormat: patch.characterFormat ?? current.promptConfig.characterFormat }
        : {}),
      ...(patch.imageGeneration !== undefined || current.promptConfig.imageGeneration !== undefined
        ? { imageGeneration: patch.imageGeneration ?? current.promptConfig.imageGeneration }
        : {}),
    };
    return persistPromptConfig(settingsDir, current.activePresetId, next);
  });

  // Switch to a preset (and, when called with the CURRENT preset id, reload it).
  // Both mean the same thing: copy the preset's config over the global one and
  // point `activePresetId` at it — discarding any unsaved edits.
  app.put("/api/prompt-config/active", async (request, reply) => {
    const parsed = ActivePresetBody.safeParse(request.body ?? {});
    if (!parsed.success) return reply.code(400).send({ error: "presetId is required" });
    const preset = loadPresets().find((p) => p.id === parsed.data.presetId);
    if (!preset) return reply.code(404).send({ error: "Preset not found" });
    const promptConfig = promptConfigFromPreset(preset);
    return persistPromptConfig(settingsDir, preset.id, promptConfig);
  });
}
