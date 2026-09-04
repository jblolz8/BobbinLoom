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
  branchPlaythroughRecord,
  getPlaythroughRecord,
  listPlaythroughRecords,
  listPlaythroughTimelines,
  promotePlaythroughBranchRecord,
  renamePlaythroughRecord,
  resolveCast,
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
import { buildOpeningPrompt, executeTurn } from "../turnActions";
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

const DraftBody = z.object({ content: z.string() });

const GenerateBody = z.object({
  name: z.string().min(1).default("New Adventure"),
  setting: z.string().optional(),
  personaId: z.string().optional(),
  castIds: z.array(z.string()).optional(),
  generateOpeningChoices: z.boolean().optional(),
  openingMode: z.enum(["quick", "fleshedOut"]).default("fleshedOut"),
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
  app.get("/api/playthroughs", async (request) => {
    const query = z.object({ includeBranches: z.string().optional() }).parse(request.query ?? {});
    const includeTimelineBranches = query.includeBranches === "true";
    return listPlaythroughRecords(dataDir, { includeTimelineBranches });
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

  // Per-playthrough input draft. The client sends this debounced while typing;
  // the server stamps the timestamp so a newer-wins compare vs the client's
  // localStorage copy can pick the freshest text on open. Empty content clears.
  app.put("/api/playthroughs/:id/draft", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = DraftBody.parse(request.body ?? {});
    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });
    playthrough.draft = body.content;
    playthrough.draftUpdatedAt = new Date().toISOString();
    updatePlaythroughRecord(dataDir, playthrough);
    return { ok: true, draftUpdatedAt: playthrough.draftUpdatedAt };
  });

  app.post("/api/playthroughs/:id/duplicate", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const clone = duplicatePlaythroughRecord(dataDir, params.id);
    if (!clone) return reply.code(404).send({ error: "Playthrough not found" });
    return reply.code(201).send(clone);
  });

  app.post("/api/playthroughs/:id/branch", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      messageId: z.string().min(1),
      name: z.string().optional(),
      asStandalone: z.boolean().optional(),
    }).parse(request.body ?? {});
    const branched = branchPlaythroughRecord(dataDir, params.id, body.messageId, body.name, body.asStandalone);
    if (!branched) return reply.code(404).send({ error: "Playthrough or message not found" });
    return reply.code(201).send(branched);
  });

  app.get("/api/playthroughs/:id/timelines", async (request) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const timelines = listPlaythroughTimelines(dataDir, params.id);
    return { timelines };
  });

  app.post("/api/playthroughs/:id/promote", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const promoted = promotePlaythroughBranchRecord(dataDir, params.id);
    if (!promoted) return reply.code(404).send({ error: "Playthrough not found" });
    return reply.code(200).send(promoted);
  });

  app.post("/api/playthroughs/generate", async (request, reply) => {
    const body = GenerateBody.parse(request.body ?? {});
    const preset = resolvePresetForGeneration(body.presetId);
    if (body.presetId && !preset) return reply.code(404).send({ error: "Preset not found" });
    const preferences: ScenarioPreferences = {
      name: body.name,
      setting: body.setting,
    };
    if (body.castIds && body.castIds.length) {
      const castTemplates = resolveCast(body.castIds) ?? [];
      preferences.cast = castTemplates.map((t) => ({ name: t.name, summary: t.summary }));
    }

    const controller = abortOnClientDisconnect(reply);

    try {
      const seed = await providerManager.getProvider().generateScenarioSeed(preferences, body.lorebookIds, controller.signal, preset?.characterFormat);
      if (controller.signal.aborted) return;

      const openingMode = body.openingMode ?? "fleshedOut";

      if (openingMode === "quick") {
        // Single first message = seed.openingText (createPlaythroughFromSeedRecord seeds it by default).
        const playthrough = createPlaythroughFromSeedRecord(dataDir, body.name, seed, body.personaId, body.castIds, body.lorebookIds, body.setting, preset ?? undefined);
        updatePlaythroughRecord(dataDir, playthrough);
        return reply.code(201).send({
          state: playthrough, tokenUsage: null, rawInput: null, rawOutput: null, finishReason: null,
        });
      }

      // fleshedOut: create WITHOUT seeding the opening text, then run a setting-aware opening turn.
      const fleshed = createPlaythroughFromSeedRecord(dataDir, body.name, seed, body.personaId, body.castIds, body.lorebookIds, body.setting, preset ?? undefined, /* includeOpening */ false);
      const openingChoices = body.generateOpeningChoices ?? false;
      const result = await executeTurn(
        fleshed,
        buildOpeningPrompt(body.setting, seed),
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
        turn: preset.modules.turn.map((m) => ({ ...m }))
      },
      characterFormat: preset.characterFormat ? JSON.parse(JSON.stringify(preset.characterFormat)) : undefined,
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
    let summaryDurationMs: number | undefined;
    try {
      const summaryStartTime = performance.now();
      summary = await provider.summarizeChapter(transcript, controller.signal);
      summaryDurationMs = Math.round(performance.now() - summaryStartTime);
    } catch (error) {
      if (controller.signal.aborted) return;
      const message = error instanceof Error ? error.message : "Chapter summarization failed";
      return reply.code(502).send({ error: message });
    }

    if (controller.signal.aborted) return;

    const result = await closeChapterAction(dataDir, params.id, summary, provider, true, providerManager.getContextWindow(), controller.signal, summaryDurationMs);

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
