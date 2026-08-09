import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createCharacterTemplateRecord,
  deleteCharacterTemplateRecord,
  getCharacterTemplate,
  getPlaythroughRecord,
  listCharacterTemplates,
  updateCharacterTemplateRecord,
  updatePlaythroughRecord
} from "../store";
import { saveToLibraryAction } from "../stateActions";
import { dataDir } from "./helpers";

const UpdateCharacterBody = z.object({
  name: z.string().min(1).optional(),
  content: z.string().optional(),
  startingClothing: z.array(z.object({
    slot: z.string(),
    name: z.string(),
    state: z.string().optional(),
  })).optional(),
});

const EditCharacterBody = z.object({
  mood: z.string().optional(),
  towardPlayer: z.string().optional(),
  memorySummary: z.string().optional(),
  conditions: z.array(z.string()).optional(),
  flags: z.array(z.string()).optional(),
  clothing: z.array(z.object({
    slot: z.string(),
    name: z.string(),
    state: z.string().optional(),
  })).optional(),
  currentLocationId: z.string().optional(),
  name: z.string().min(1).optional(),
  content: z.string().optional(),
  summary: z.string().optional(),
  startingClothing: z.array(z.object({
    slot: z.string(),
    name: z.string(),
    state: z.string().optional(),
  })).optional(),
});

export async function characterRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/characters", async () => {
    return listCharacterTemplates();
  });

  app.get("/api/characters/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const template = getCharacterTemplate(params.id);
    if (!template) return reply.code(404).send({ error: "Character not found" });
    return template;
  });

  app.post("/api/characters", async (request, reply) => {
    const body = z.object({ name: z.string().min(1) }).parse(request.body ?? {});
    const template = createCharacterTemplateRecord(body.name);
    return reply.code(201).send(template);
  });

  app.put("/api/characters/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = UpdateCharacterBody.parse(request.body ?? {});
    const updated = updateCharacterTemplateRecord(params.id, body);
    if (!updated) return reply.code(404).send({ error: "Character not found" });
    return updated;
  });

  app.delete("/api/characters/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = deleteCharacterTemplateRecord(params.id);
    if (!deleted) return reply.code(404).send({ error: "Character not found" });
    return { ok: true };
  });

  app.post("/api/playthroughs/:id/characters/:characterId/save-to-library", async (request, reply) => {
    const params = z.object({ id: z.string(), characterId: z.string() }).parse(request.params);
    const body = z.object({ mode: z.enum(["update", "newVersion"]).optional() }).parse(request.body ?? {});
    const result = saveToLibraryAction(dataDir, params.id, params.characterId, body.mode ?? "update");
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { template: result.template, created: result.created };
  });

  app.put("/api/playthroughs/:id/characters/:characterId", async (request, reply) => {
    const params = z.object({ id: z.string(), characterId: z.string() }).parse(request.params);
    const body = EditCharacterBody.parse(request.body ?? {});

    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const character = playthrough.characters.find((c) => c.id === params.characterId);
    if (!character) return reply.code(404).send({ error: "Character not found" });

    const updated = { ...character, updatedAt: new Date().toISOString() };

    if (body.mood !== undefined) updated.mood = body.mood;
    if (body.towardPlayer !== undefined) updated.towardPlayer = body.towardPlayer;
    if (body.memorySummary !== undefined) updated.memorySummary = body.memorySummary;
    if (body.conditions !== undefined) updated.conditions = body.conditions;
    if (body.flags !== undefined) updated.flags = body.flags;
    if (body.clothing !== undefined) updated.clothing = body.clothing;
    if (body.currentLocationId !== undefined) updated.currentLocationId = body.currentLocationId;

    playthrough.characters = playthrough.characters.map((c) =>
      c.id === params.characterId ? updated : c
    );

    const hasTemplateUpdate =
      body.name !== undefined || body.content !== undefined ||
      body.startingClothing !== undefined || body.summary !== undefined;

    if (hasTemplateUpdate) {
      const tpl = playthrough.characterTemplates.find((t) => t.id === updated.templateId);
      if (tpl) {
        if (body.name !== undefined) { tpl.name = body.name; updated.name = body.name; }
        if (body.content !== undefined) tpl.content = body.content;
        if (body.summary !== undefined) tpl.summary = body.summary;
        if (body.startingClothing !== undefined) tpl.startingClothing = body.startingClothing;
      }
    }

    playthrough.updatedAt = updated.updatedAt;
    updatePlaythroughRecord(dataDir, playthrough);

    return playthrough;
  });
}
