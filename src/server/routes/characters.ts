import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReadStream } from "node:fs";
import {
  createCharacterTemplateRecord,
  deleteCharacterTemplateRecord,
  getCharacterAvatarPath,
  getCharacterTemplate,
  getPlaythroughRecord,
  importCharacterCard,
  listCharacterTemplates,
  removeCharacterImportRecord,
  removeCharacterProfileAvatar,
  restoreCharacterOriginalAvatar,
  saveCharacterAvatar,
  updateCharacterTemplateRecord,
  updatePlaythroughRecord
} from "../store";
import { parseCard } from "../characterCards/parseCard";
import { convertCardApply, convertCardGenerate } from "../characterCards/convertCard";
import { resolveCharacterFormat } from "../../engine/characterFormat";
import { PNG_SIG } from "../characterCards/pngText";
import { saveToLibraryAction } from "../stateActions";
import { abortOnClientDisconnect, dataDir, providerManager } from "./helpers";
import type { CharacterFormat } from "../../schemas";

const UpdateCharacterBody = z.object({
  name: z.string().min(1).optional(),
  content: z.string().optional(),
  creatorNotes: z.string().optional(),
  tags: z.array(z.string()).optional(),
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

  // Import a CCv2 card (PNG with embedded `chara` JSON, or standalone JSON).
  // Route-level bodyLimit override: Fastify 4 only honors the TOP-LEVEL option,
  // so multi-MB card PNGs are accepted here even though the default is 1MB.
  app.post("/api/characters/import", { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const body = z.object({
      fileName: z.string().min(1),
      dataBase64: z.string().min(1),   // base64 of the raw PNG or JSON file
    }).parse(request.body ?? {});
    const bytes = Buffer.from(body.dataBase64, "base64");
    const kind = bytes.length >= 8 && bytes.subarray(0, 8).equals(PNG_SIG) ? "png" : "json";
    try {
      const card = parseCard(body.fileName, bytes);

      // Check if a BL-converted record with matching name+creator already exists.
      // Importing a CCv2 card that was already converted would be a no-op.
      const existingConverted = listCharacterTemplates().find(
        (t) => t.name === card.name && t.format !== "ccv2" && t.ccv2Content !== undefined
      );
      if (existingConverted) {
        return reply.code(200).send({
          record: existingConverted,
          created: false,
          notice: "already_converted",
          existingRecord: existingConverted,
        });
      }

      const result = importCharacterCard(card, bytes, kind);
      return reply.code(result.created ? 201 : 200).send({ record: result.record, created: result.created });
    } catch (e) {
      return reply.code(400).send({ error: e instanceof Error ? e.message : "Import failed." });
    }
  });

  // Serve character avatar (portrait / profile / original)
  app.get("/api/characters/:id/avatar", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ type: z.enum(["portrait", "profile", "original"]).optional() }).parse(request.query ?? {});
    const file = getCharacterAvatarPath(params.id, query.type ?? "portrait");
    if (!file) return reply.code(404).send({ error: "No avatar" });
    const ext = file.split(".").pop()?.toLowerCase();
    const mime = ext === "jpg" || ext === "jpeg" ? "image/jpeg" : ext === "webp" ? "image/webp" : "image/png";
    return reply.type(mime).send(createReadStream(file));
  });

  // Upload custom portrait or 1:1 profile image
  const UploadAvatarBody = z.object({
    type: z.enum(["portrait", "profile"]),
    dataBase64: z.string().min(1),
    fileName: z.string().optional(),
  });

  app.post("/api/characters/:id/avatar", { bodyLimit: 10 * 1024 * 1024 }, async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = UploadAvatarBody.parse(request.body ?? {});
    const bytes = Buffer.from(body.dataBase64, "base64");
    const ext = body.fileName?.split(".").pop() || "png";
    const updated = saveCharacterAvatar(params.id, body.type, bytes, ext);
    if (!updated) return reply.code(404).send({ error: "Character not found" });
    return { record: updated };
  });

  // Restore original CCv2 card portrait
  app.post("/api/characters/:id/avatar/restore", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const updated = restoreCharacterOriginalAvatar(params.id);
    if (!updated) return reply.code(404).send({ error: "Character not found" });
    return { record: updated };
  });

  // Delete custom 1:1 profile avatar (falling back to portrait)
  app.delete("/api/characters/:id/avatar/profile", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const updated = removeCharacterProfileAvatar(params.id);
    if (!updated) return reply.code(404).send({ error: "Character not found" });
    return { record: updated };
  });

  // ── CCv2 → BL conversion ──
  const ConvertActionBody = z.object({
    action: z.enum(["generate", "apply"]),
    content: z.string().optional(),        // required for "apply"
    currentContent: z.string().optional(), // active draft for targeted retry "generate"
    feedback: z.string().optional(),       // optional retry feedback for "generate"
    format: z.record(z.any()).optional(),  // target character format (from the active preset)
  });

  app.post("/api/characters/:id/convert", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = ConvertActionBody.parse(request.body ?? {});

    if (body.action === "apply" && !body.content) {
      return reply.code(400).send({ error: "content is required for apply action" });
    }

    const template = getCharacterTemplate(params.id);
    if (!template) return reply.code(404).send({ error: "Character not found" });
    if (template.format !== "ccv2") {
      return reply.code(400).send({ error: "Only CCv2 cards can be converted" });
    }

    if (body.action === "generate") {
      try {
        const controller = abortOnClientDisconnect(reply);
        const provider = providerManager.getProvider();
        const result = await convertCardGenerate(provider, {
          template,
          feedback: body.feedback,
          currentContent: body.currentContent,
          format: body.format as CharacterFormat | undefined,
        }, controller.signal);
        return {
          content: result.content,
          originalContent: template.content,
          record: template,
        };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("abort")) {
          return reply.code(499).send({ error: "Request aborted" });
        }
        return reply.code(502).send({ error: `Conversion failed: ${message}` });
      }
    }

    // action === "apply"
    const updates = convertCardApply({ template, content: body.content! });
    const updated = updateCharacterTemplateRecord(params.id, updates);
    if (!updated) return reply.code(404).send({ error: "Character not found" });
    // The converted record now lives at <slug>.json; drop the stale CCv2 import
    // record (.bl.json) so the library reads exactly one record for the card.
    removeCharacterImportRecord(params.id);
    return { record: updated };
  });

  // ── Reformat an existing BL sheet into a target character format ──
  const ReformatActionBody = z.object({
    action: z.enum(["generate", "apply"]),
    content: z.string().optional(),        // required for "apply"
    format: z.record(z.any()).optional(),  // target character format
    currentContent: z.string().optional(), // source sheet for retry-with-feedback
    feedback: z.string().optional(),       // user guidance for a retry
  });

  app.post("/api/characters/:id/reformat", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = ReformatActionBody.parse(request.body ?? {});

    if (body.action === "apply" && !body.content) {
      return reply.code(400).send({ error: "content is required for apply action" });
    }

    const template = getCharacterTemplate(params.id);
    if (!template) return reply.code(404).send({ error: "Character not found" });
    if (template.format === "ccv2") {
      return reply.code(400).send({ error: "Read-only CCv2 sheets cannot be reformatted — convert to BL format first" });
    }

    if (body.action === "generate") {
      try {
        const controller = abortOnClientDisconnect(reply);
        const provider = providerManager.getProvider();
        const format = resolveCharacterFormat(body.format as CharacterFormat | undefined);
        // On retry the client sends the previously-generated sheet plus feedback.
        const source = body.currentContent ?? template.content;
        const content = await provider.reformatCharacterSheet(source, format, undefined, controller.signal, body.feedback);
        return { content, originalContent: template.content, record: template };
      } catch (e) {
        const message = e instanceof Error ? e.message : String(e);
        if (message.includes("abort")) {
          return reply.code(499).send({ error: "Request aborted" });
        }
        return reply.code(502).send({ error: `Reformat failed: ${message}` });
      }
    }

    // action === "apply"
    const updated = updateCharacterTemplateRecord(params.id, { content: body.content! });
    if (!updated) return reply.code(404).send({ error: "Character not found" });
    return { record: updated };
  });

  const SuggestTagsBody = z.object({
    name: z.string().default(""),
    content: z.string().default(""),
    creatorNotes: z.string().optional(),
    currentTags: z.array(z.string()).optional(),
    guidance: z.string().optional(),
    libraryTags: z.array(z.string()).optional(),
  });

  app.post("/api/characters/suggest-tags", async (request, reply) => {
    const body = SuggestTagsBody.parse(request.body ?? {});
    const controller = abortOnClientDisconnect(reply);
    const provider = providerManager.getProvider();
    try {
      const tags = await provider.suggestCharacterTags(
        {
          name: body.name,
          content: body.content,
          creatorNotes: body.creatorNotes,
          currentTags: body.currentTags,
          guidance: body.guidance,
        },
        body.libraryTags ?? [],
        controller.signal
      );
      return { tags };
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("abort")) {
        return reply.code(499).send({ error: "Request aborted" });
      }
      return reply.code(502).send({ error: `Tag suggestion failed: ${message}` });
    }
  });

  const BrainstormCharacterBody = z.object({
    character: z.object({
      name: z.string().default(""),
      content: z.string().default(""),
      creatorNotes: z.string().optional(),
      tags: z.array(z.string()).optional(),
      ccv2Content: z.string().optional(),
    }),
    chatHistory: z.array(
      z.object({
        role: z.enum(["user", "assistant"]),
        content: z.string(),
      })
    ).default([]),
    userMessage: z.string().min(1),
    includeOriginalCard: z.boolean().optional(),
    format: z.record(z.any()).optional(),
  });

  app.post("/api/characters/brainstorm", async (request, reply) => {
    const body = BrainstormCharacterBody.parse(request.body ?? {});
    const controller = abortOnClientDisconnect(reply);
    const provider = providerManager.getProvider();
    try {
      const result = await provider.brainstormCharacter(
        {
          character: body.character,
          chatHistory: body.chatHistory,
          userMessage: body.userMessage,
          includeOriginalCard: body.includeOriginalCard,
          format: body.format as CharacterFormat | undefined,
        },
        controller.signal
      );
      return result;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (message.includes("abort")) {
        return reply.code(499).send({ error: "Request aborted" });
      }
      return reply.code(502).send({ error: `Brainstorming failed: ${message}` });
    }
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

    // CCv2 sheets are read-only (D9/C3): the PUT route applies content/clothing
    // edits directly, bypassing applyStatePatch, so guard here — but only the
    // sheet fields. Name and runtime fields (mood, towardPlayer, memorySummary,
    // conditions, flags, currentLocationId) remain editable.
    const template = playthrough.characterTemplates.find((t) => t.id === character.templateId);
    const attemptsSheetEdit =
      body.content !== undefined || body.startingClothing !== undefined || body.clothing !== undefined;
    if (template?.format === "ccv2" && attemptsSheetEdit) {
      return reply.code(400).send({
        error: "Character has a read-only CCv2 sheet — content/clothing edits are not allowed."
      });
    }

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
      const tpl = template;
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
