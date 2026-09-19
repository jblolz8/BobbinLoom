import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import { z } from "zod";
import { ChapterOpeningModeSchema } from "../../schemas";
import type { ScenarioPreferences } from "../../schemas";
import { parseUserInput } from "../../engine/engine";
import { assembleTurnPrompt } from "../openAiCompatibleProvider";
import {
  CHARACTERS_DIR,
  createBlankPlaythroughRecord,
  createPlaythroughFromSeedRecord,
  createPlaythroughRecord,
  deletePlaythroughRecord,
  duplicatePlaythroughRecord,
  branchPlaythroughRecord,
  getPlaythroughRecord,
  listPlaythroughSummaries,
  listPlaythroughTimelines,
  promotePlaythroughBranchRecord,
  renamePlaythroughRecord,
  resolveCast,
  resolvePresetForGeneration,
  setPlaythroughCoverRecord,
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
import { imageFilePath, sweepOrphansInDataDir } from "../imageStore";
import { resolvePlaythroughCover } from "../coverResolver";
import { loadPromptConfig } from "../promptConfigStore";
import { abortOnClientDisconnect, dataDir as defaultDataDir, imagesDir as defaultImagesDir, providerManager, settingsDir } from "./helpers";
import type { ProviderManager } from "../providerManager";

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

/** A manual cover: the image's content-addressed file name. How the frame is shaped and
 *  filled is a display setting, not a property of the choice. */
const CoverBody = z.object({
  file: z.string()
});

const GenerateBody = z.object({
  name: z.string().min(1).default("New Adventure"),
  /** The text connection to generate with. Absent = the stored preference, then the
   *  active connection; an id that no longer resolves falls back the same way. */
  providerId: z.string().optional(),
  setting: z.string().optional(),
  personaId: z.string().optional(),
  castIds: z.array(z.string()).optional(),
  generateOpeningChoices: z.boolean().optional(),
  openingMode: z.enum(["quick", "fleshedOut"]).default("fleshedOut"),
  lorebookIds: z.array(z.string()).optional(),
  presetId: z.string().optional(),
});

const QuestActionBody = z.object({
  questId: z.string(),
  action: z.enum(["toggleTracking", "delete", "edit"]),
  name: z.string().optional(),
  summary: z.string().optional()
});

const CloseChapterBody = z.object({
  /** How the next chapter opens. Remembered by the client; absent means `continuation`. */
  openingMode: ChapterOpeningModeSchema.default("continuation"),
  /** The player's own message to open the new chapter with. It becomes the first message of that
   *  chapter — NOT part of the chapter being closed, and not part of its summary. */
  openingMessage: z.string().optional(),
  /** The text connection to close the chapter with (the summary AND the opening turn). Absent =
   *  the stored chapter preference, then the active connection. */
  providerId: z.string().optional()
});

/** Injectable seams (all defaulted) so the delete sweep can be exercised against
 *  a temp data directory — no test may touch the real store. */
export type PlaythroughRoutesOptions = FastifyPluginOptions & {
  dataDir?: string;
  imagesDir?: string;
  /** The character library, read for a cast-collage cover. Same seam idea as `dataDir`. */
  charactersDir?: string;
  /** Injectable so a test can hand this plugin connections of its own (as the image and
   *  provider route plugins already allow). Falls back to the shared singleton. */
  manager?: ProviderManager;
};

export const playthroughRoutes: FastifyPluginAsync<PlaythroughRoutesOptions> = async (app, options = {}) => {
  const dataDir = options.dataDir ?? defaultDataDir;
  const imagesDir = options.imagesDir ?? defaultImagesDir;
  const charactersDir = options.charactersDir ?? CHARACTERS_DIR;
  const manager = options.manager ?? providerManager;

  app.get("/api/playthroughs", async (request) => {
    const query = z.object({ includeBranches: z.string().optional() }).parse(request.query ?? {});
    const includeTimelineBranches = query.includeBranches === "true";
    // Summaries, not whole documents: the list only renders cards, and a document carries
    // messages, snapshots and catalogs the cards never read (measured at ~750 KB for five
    // playthroughs). Full documents stay behind listPlaythroughRecords for the sweep and the
    // timeline listing, which really do walk the state.
    // The cover resolver is injected (see `PlaythroughSummaryOptions`): it needs the image
    // store, which imports the store back, so the wiring lives here rather than in the store.
    return listPlaythroughSummaries(dataDir, {
      includeTimelineBranches,
      resolveCover: (p) => resolvePlaythroughCover(p, { imagesDir, charactersDir })
    });
  });

  app.post("/api/playthroughs", async (request, reply) => {
    const body = CreatePlaythroughBody.parse(request.body ?? {});
    // No preset is bound at creation: the prompt configuration is global and
    // read at generation time, so a playthrough carries none of its own.
    const playthrough = body.blank
      ? createBlankPlaythroughRecord(dataDir, body.name, body.personaId, body.castIds ?? [], body.lorebookIds, body.setting)
      : createPlaythroughRecord(dataDir, body.name, body.personaId, body.castIds, body.lorebookIds, body.setting);
    return reply.code(201).send(playthrough);
  });

  app.delete("/api/playthroughs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = deletePlaythroughRecord(dataDir, params.id);
    if (!deleted) return reply.code(404).send({ error: "Playthrough not found" });
    // The record is gone, so any image only it referenced is now unreferenced.
    // The sweep scans EVERY playthrough with its timeline branches included, so
    // a content-addressed file still referenced by another playthrough or a
    // surviving branch stays on disk. Best-effort: a failed sweep leaves files
    // for the manual endpoint to clean and must never fail a successful delete.
    try {
      sweepOrphansInDataDir(dataDir, imagesDir);
    } catch (error) {
      console.warn(`[images] orphan sweep after deleting playthrough ${params.id} failed:`, error);
    }
    return { ok: true };
  });

  app.put("/api/playthroughs/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = RenameBody.parse(request.body ?? {});
    const updated = renamePlaythroughRecord(dataDir, params.id, body.name);
    if (!updated) return reply.code(404).send({ error: "Playthrough not found" });
    return updated;
  });

  // The manual cover: a pointer at an image that already lives in the content-addressed
  // store. Validated HERE rather than in the store — the check needs the image module, which
  // imports the store back (cycle), and `imageFilePath` also guarantees the name is hash-shaped
  // before anything touches the disk.
  app.post("/api/playthroughs/:id/cover", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = CoverBody.parse(request.body ?? {});
    if (!imageFilePath(body.file, imagesDir)) {
      return reply.code(400).send({ error: "Unknown image file" });
    }
    const updated = setPlaythroughCoverRecord(dataDir, params.id, { file: body.file });
    if (!updated) return reply.code(404).send({ error: "Playthrough not found" });
    // The whole document, like the rename route: the client already treats that response as
    // the authoritative record.
    return updated;
  });

  // Clearing hands the card back to the automatic chain (latest image → present cast →
  // placeholder). Idempotent: clearing a cover that is already absent still returns the record.
  app.delete("/api/playthroughs/:id/cover", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const updated = setPlaythroughCoverRecord(dataDir, params.id, null);
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

    // ONE resolution for the whole request. The seed, the opening turn and the token budget
    // must all come from the same connection: resolving per call site is how a chosen provider
    // ends up writing only part of the story, with the budget computed for a different model.
    const providerId = body.providerId ?? manager.generationTextProviderId() ?? undefined;
    const provider = manager.getProvider(providerId);
    const contextWindow = manager.getContextWindow(providerId);

    try {
      const seed = await provider.generateScenarioSeed(preferences, body.lorebookIds, controller.signal, preset?.characterFormat);
      if (controller.signal.aborted) return;

      const openingMode = body.openingMode ?? "fleshedOut";

      if (openingMode === "quick") {
        // Single first message = seed.openingText (createPlaythroughFromSeedRecord seeds it by default).
        const playthrough = createPlaythroughFromSeedRecord(dataDir, body.name, seed, body.personaId, body.castIds, body.lorebookIds, body.setting);
        updatePlaythroughRecord(dataDir, playthrough);
        return reply.code(201).send({
          state: playthrough, tokenUsage: null, rawInput: null, rawOutput: null, finishReason: null,
        });
      }

      // fleshedOut: create WITHOUT seeding the opening text, then run a setting-aware opening turn.
      const fleshed = createPlaythroughFromSeedRecord(dataDir, body.name, seed, body.personaId, body.castIds, body.lorebookIds, body.setting, /* includeOpening */ false);
      const openingChoices = body.generateOpeningChoices ?? false;
      const result = await executeTurn(
        fleshed,
        buildOpeningPrompt(body.setting, seed),
        provider,
        openingChoices,
        contextWindow,
        { signal: controller.signal },
        loadPromptConfig(settingsDir).promptConfig
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

    // Same query text generateTurn uses, so the meter measures the prompt that
    // would actually be sent rather than a keyword-only approximation. embedTexts
    // swallows its own errors and returns [] on failure, which degrades to
    // keyword-only scoring — a failed embedding must never fail this read-only route.
    const queryMessages = playthrough.messages.filter((m) => !m.hidden).slice(-4);
    const queryText = queryMessages.map((m) => m.content).join("\n");
    const [queryEmbedding = []] = queryText ? await manager.getProvider().embedTexts([queryText]) : [[]];

    const { promptUsage } = assembleTurnPrompt(parseUserInput(""), playthrough, query.choices !== "false", queryEmbedding, {
      contextWindow: manager.getContextWindow(),
      reserveOutputTokens: manager.getMaxTokens(),
      calibration: playthrough.tokenCalibration
    }, loadPromptConfig(settingsDir).promptConfig);
    return {
      estimated: promptUsage.estimated,
      contextWindow: manager.getContextWindow(),
      breakdown: promptUsage.breakdown,
      castPresence: {
        present: playthrough.characters.filter((c) => c.currentLocationId === playthrough.locationId).length,
        absent: playthrough.characters.filter((c) => c.currentLocationId !== playthrough.locationId).length,
      }
    };
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
    const result = await promoteNpcAction(dataDir, id, npcId, manager.getProvider(), body.content, manager.getMaxTokens(), controller.signal, loadPromptConfig(settingsDir).promptConfig);
    if (controller.signal.aborted) return;
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });

  app.post("/api/playthroughs/:id/npcs/:npcId/promote/draft", async (request, reply) => {
    const { id, npcId } = z.object({ id: z.string(), npcId: z.string() }).parse(request.params);

    const controller = abortOnClientDisconnect(reply);
    const result = await promoteNpcDraftAction(dataDir, id, npcId, manager.getProvider(), manager.getMaxTokens(), controller.signal, loadPromptConfig(settingsDir).promptConfig);
    if (controller.signal.aborted) return;
    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return { npc: result.npc, content: result.content, storyContext: result.storyContext };
  });

  app.post("/api/playthroughs/:id/close-chapter", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const parsedBody = CloseChapterBody.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      const reason = parsedBody.error.issues
        .map((issue) => `${issue.path.join(".") || "body"} ${issue.message}`)
        .join("; ");
      return reply.code(400).send({ error: `Invalid close-chapter request: ${reason}` });
    }
    const body = parsedBody.data;
    // `custom` means the player's own message IS the opening: silently downgrading it to
    // `continuation` would throw away the only thing that mode promises.
    if (body.openingMode === "custom" && !body.openingMessage?.trim()) {
      return reply.code(400).send({ error: "The Custom mode needs a message to open the chapter with" });
    }

    const playthrough = getPlaythroughRecord(dataDir, params.id);
    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    // The transcript is the messages of the chapter being closed, and nothing else. The player's
    // opening message for the NEXT chapter is deliberately absent: the summary describes the past,
    // and the transition is what the new chapter opens from.
    const chapterMsgs = playthrough.messages.filter(m => !m.hidden && !m.chapterId);
    const transcript = chapterMsgs.map(m => m.role.toUpperCase() + ": " + m.content).join("\n");

    // ONE resolution for the whole operation. This handler touches the connection four times —
    // the summary call, the opening turn (provider AND context window), the memory embedding, and
    // the post-close meter's budget — and an override applied to only some of them writes the
    // summary with one model, the opening with another, and measures with a third, silently.
    const providerId = body.providerId ?? manager.chapterTextProviderId() ?? undefined;
    const provider = manager.getProvider(providerId);
    const contextWindow = manager.getContextWindow(providerId);
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

    const result = await closeChapterAction(
      dataDir,
      params.id,
      summary,
      provider,
      true,
      contextWindow,
      controller.signal,
      summaryDurationMs,
      loadPromptConfig(settingsDir).promptConfig,
      {
        openingMode: body.openingMode,
        ...(body.openingMessage?.trim() ? { openingMessage: body.openingMessage } : {})
      }
    );

    if (controller.signal.aborted) return;

    if (!result.ok) return reply.code(result.status).send({ error: result.error });

    // Measure the state AFTER the chapter closes; mirrors generateTurn's query
    // embedding so the reported memory selection matches the real turn.
    const queryMessages = result.state.messages.filter((m) => !m.hidden).slice(-4);
    const queryText = queryMessages.map((m) => m.content).join("\n");
    const [queryEmbedding = []] = queryText ? await provider.embedTexts([queryText]) : [[]];

    const { promptUsage } = assembleTurnPrompt(parseUserInput(""), result.state, true, queryEmbedding, {
      contextWindow,
      reserveOutputTokens: manager.getMaxTokens(providerId),
      calibration: result.state.tokenCalibration
    }, loadPromptConfig(settingsDir).promptConfig);
    return {
      state: result.state,
      tokenUsage: {
        estimated: promptUsage.estimated,
        contextWindow,
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

    // The chapter preference, not the active connection: re-summarizing is the same meta call on
    // the same surface, and it has no dialog to ask in.
    const result = await resummarizeChapterAction(dataDir, params.id, params.chapterId, manager.getProvider(manager.chapterTextProviderId() ?? undefined), controller.signal);
    if (controller.signal.aborted) return;

    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });
}
