import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PromptPreset, ScenarioPreferences } from "../../schemas";
import { parseUserInput } from "../../engine/engine";
import { assembleTurnPrompt } from "../openAiCompatibleProvider";
import {
  createBlankPlaythroughRecord,
  createPlaythroughFromSeedRecord,
  createPlaythroughRecord,
  deletePlaythroughRecord,
  duplicatePlaythroughRecord,
  getPlaythroughRecord,
  listPlaythroughRecords,
  renamePlaythroughRecord,
  resolvePresetForGeneration,
  updatePlaythroughRecord
} from "../store";
import {
  closeChapterAction,
  promoteNpcAction,
  promoteNpcDraftAction,
  questAction,
  resummarizeChapterAction
} from "../stateActions";
import { executeTurn } from "../turnActions";
import { abortOnClientDisconnect, dataDir, loadPresets, providerManager } from "./helpers";

const CreatePlaythroughBody = z.object({
  name: z.string().min(1).default("New Playthrough"),
  personaId: z.string().optional(),
  castIds: z.array(z.string()).optional(),
  blank: z.boolean().optional(),
  lorebookIds: z.array(z.string()).optional(),
  setting: z.string().optional(),
  presetId: z.string().optional(),
});

const RenameBody = z.object({ name: z.string().min(1) });

const GenerateBody = z.object({
  name: z.string().min(1).default("New Adventure"),
  setting: z.string().optional(),
  personaId: z.string().optional(),
  castIds: z.array(z.string()).optional(),
  generateOpeningChoices: z.boolean().optional(),
  lorebookIds: z.array(z.string()).optional(),
  presetId: z.string().optional(),
});

const PromptSettingsBody = z.object({
  presetId: z.string()
});

const QuestActionBody = z.object({
  questId: z.string(),
  action: z.enum(["toggleTracking", "delete", "edit"]),
  name: z.string().optional(),
  summary: z.string().optional()
});

const CloseChapterBody = z.object({
  addClosingMessage: z.boolean().default(false),
  closingMessage: z.string().optional()
});

export async function playthroughRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/playthroughs", async () => {
    return listPlaythroughRecords(dataDir);
  });

  app.post("/api/playthroughs", async (request, reply) => {
    const body = CreatePlaythroughBody.parse(request.body ?? {});
    let preset: PromptPreset | undefined;
    if (body.presetId) {
      preset = loadPresets().find((p) => p.id === body.presetId);
      if (!preset) return reply.code(404).send({ error: "Preset not found" });
    }
    const playthrough = body.blank
      ? createBlankPlaythroughRecord(dataDir, body.name, body.personaId, body.castIds ?? [], body.lorebookIds, body.setting, preset)
      : createPlaythroughRecord(dataDir, body.name, body.personaId, body.castIds, body.lorebookIds, body.setting, preset);
    return reply.code(201).send(playthrough);
  });

  app.delete("/api/playthroughs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = deletePlaythroughRecord(dataDir, params.id);
    if (!deleted) return reply.code(404).send({ error: "Playthrough not found" });
    return { ok: true };
  });

  app.put("/api/playthroughs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = RenameBody.parse(request.body ?? {});
    const updated = renamePlaythroughRecord(dataDir, params.id, body.name);
    if (!updated) return reply.code(404).send({ error: "Playthrough not found" });
    return updated;
  });

  app.post("/api/playthroughs/:id/duplicate", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const clone = duplicatePlaythroughRecord(dataDir, params.id);
    if (!clone) return reply.code(404).send({ error: "Playthrough not found" });
    return reply.code(201).send(clone);
  });

  app.post("/api/playthroughs/generate", async (request, reply) => {
    const body = GenerateBody.parse(request.body ?? {});
    const preset = resolvePresetForGeneration(body.presetId);
    if (body.presetId && !preset) return reply.code(404).send({ error: "Preset not found" });
    const preferences: ScenarioPreferences = {
      name: body.name,
      setting: body.setting,
    };

    const controller = abortOnClientDisconnect(reply);

    try {
      const seed = await providerManager.getProvider().generateScenarioSeed(preferences, body.lorebookIds, preset?.modules.seed, controller.signal);
      if (controller.signal.aborted) return;

      const playthrough = createPlaythroughFromSeedRecord(dataDir, body.name, seed, body.personaId, body.castIds, body.lorebookIds, body.setting, preset ?? undefined);

      const openingPrompt = "Begin the story. Introduce the world to the player character — describe their current location, the atmosphere, and any immediate surroundings. Write in second person. Do not take actions on behalf of the player. End by presenting the current moment as an invitation for the player to act.";
      const openingChoices = body.generateOpeningChoices ?? false;

      const result = await executeTurn(
        playthrough,
        openingPrompt,
        providerManager.getProvider(),
        openingChoices,
        providerManager.getContextWindow(),
        { signal: controller.signal }
      );

      if (controller.signal.aborted) return;

      result.state.messages = result.state.messages.filter((m) => m.role !== "user");
      result.state.snapshots = {};

      updatePlaythroughRecord(dataDir, result.state);
      return reply.code(201).send({
        state: result.state,
        tokenUsage: result.tokenUsage,
        rawInput: result.rawInput,
        rawOutput: result.rawOutput,
        finishReason: result.finishReason
      });
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Scenario generation failed";
      return reply.code(422).send({ error: message });
    }
  });

  app.get("/api/playthroughs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });
    return playthrough;
  });

  app.get("/api/playthroughs/:id/context-usage", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z.object({ choices: z.enum(["true", "false"]).optional() }).parse(request.query ?? {});
    const playthrough = getPlaythroughRecord(dataDir, params.id);

    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const { promptUsage } = assembleTurnPrompt(parseUserInput(""), playthrough, query.choices !== "false");
    return {
      estimated: promptUsage.estimated,
      contextWindow: providerManager.getContextWindow(),
      breakdown: promptUsage.breakdown,
      castPresence: {
        present: playthrough.characters.filter((c) => c.currentLocationId === playthrough.locationId).length,
        absent: playthrough.characters.filter((c) => c.currentLocationId !== playthrough.locationId).length,
      }
    };
  });

  app.put("/api/playthroughs/:id/prompt-settings", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const playthrough = getPlaythroughRecord(dataDir, params.id);

    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const body = PromptSettingsBody.parse(request.body);
    const preset = loadPresets().find((p) => p.id === body.presetId);
    if (!preset) return reply.code(404).send({ error: "Preset not found" });

    playthrough.promptSettings = {
      presetId: preset.id,
      presetName: preset.name,
      modules: {
        turn: preset.modules.turn.map((m) => ({ ...m })),
        seed: preset.modules.seed.map((m) => ({ ...m })),
        sheet: preset.modules.sheet.map((m) => ({ ...m })),
        summary: preset.modules.summary.map((m) => ({ ...m }))
      }
    };
    updatePlaythroughRecord(dataDir, playthrough);

    return playthrough.promptSettings;
  });

  app.post("/api/playthroughs/:id/quest-action", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = QuestActionBody.parse(request.body);
    const result = questAction(dataDir, params.id, body.questId, body.action, body.name, body.summary);
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });

  app.post("/api/playthroughs/:id/npcs/:npcId/promote", async (request, reply) => {
    const { id, npcId } = z.object({ id: z.string(), npcId: z.string() }).parse(request.params);
    const body = z.object({ content: z.string().optional() }).parse(request.body ?? {});

    const controller = abortOnClientDisconnect(reply);
    const result = await promoteNpcAction(dataDir, id, npcId, providerManager.getProvider(), body.content, providerManager.getMaxTokens(), controller.signal);
    if (controller.signal.aborted) return;
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });

  app.post("/api/playthroughs/:id/npcs/:npcId/promote/draft", async (request, reply) => {
    const { id, npcId } = z.object({ id: z.string(), npcId: z.string() }).parse(request.params);

    const controller = abortOnClientDisconnect(reply);
    const result = await promoteNpcDraftAction(dataDir, id, npcId, providerManager.getProvider(), providerManager.getMaxTokens(), controller.signal);
    if (controller.signal.aborted) return;
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { npc: result.npc, content: result.content, storyContext: result.storyContext };
  });

  app.post("/api/playthroughs/:id/close-chapter", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = CloseChapterBody.parse(request.body ?? {});

    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const chapterMsgs = playthrough.messages.filter(m => !m.hidden && !m.chapterId);
    let transcript = chapterMsgs.map(m => m.role.toUpperCase() + ": " + m.content).join("\n");

    if (body.addClosingMessage && body.closingMessage) {
      transcript += "\nUSER: " + body.closingMessage;
    }

    const provider = providerManager.getProvider();
    const controller = abortOnClientDisconnect(reply);

    let summary: { name: string; shortDescription: string; fullSummary: string };
    try {
      summary = await provider.summarizeChapter(transcript, playthrough.promptSettings?.modules.summary, controller.signal);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Chapter summarization failed";
      return reply.code(502).send({ error: message });
    }

    if (controller.signal.aborted) return;

    const result = await closeChapterAction(dataDir, params.id, summary, provider, true, providerManager.getContextWindow(), controller.signal);

    if (controller.signal.aborted) return;

    if (!result.ok) return reply.code(result.status).send({ error: result.error });

    const { promptUsage } = assembleTurnPrompt(parseUserInput(""), result.state, true);
    return {
      state: result.state,
      tokenUsage: {
        estimated: promptUsage.estimated,
        contextWindow: providerManager.getContextWindow(),
        breakdown: promptUsage.breakdown,
        castPresence: {
          present: result.state.characters.filter((c) => c.currentLocationId === result.state.locationId).length,
          absent: result.state.characters.filter((c) => c.currentLocationId !== result.state.locationId).length,
        }
      }
    };
  });

  app.post("/api/playthroughs/:id/chapters/:chapterId/resummarize", async (request, reply) => {
    const params = z.object({ id: z.string(), chapterId: z.string() }).parse(request.params);
    const controller = abortOnClientDisconnect(reply);

    const result = await resummarizeChapterAction(dataDir, params.id, params.chapterId, providerManager.getProvider(), controller.signal);
    if (controller.signal.aborted) return;

    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });
}
