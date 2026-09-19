import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import { z } from "zod";
import { getPlaythroughRecord, updatePlaythroughRecord } from "../store";
import { editChatMessage, executeTurn, retryAssistantTurn, revertAction, truncateChat, type TurnExecution } from "../turnActions";
import type { RevertAnchor } from "../../engine/chapterRevert";
import { loadPromptConfig } from "../promptConfigStore";
import { abortOnClientDisconnect, dataDir as defaultDataDir, providerManager, settingsDir } from "./helpers";

const TurnBody = z.object({
  playthroughId: z.string(),
  input: z.string(),
  suggestedChoicesEnabled: z.boolean().default(true),
  /** Keep the synthetic user message out of the visible chat (used by the
   *  client's "Continue" flow, which sends a hidden continuation instruction
   *  so the model replies to the player's last visible message). */
  hideUserMessage: z.boolean().default(false)
});

const RetryBody = z.object({
  messageId: z.string(),
  suggestedChoicesEnabled: z.boolean().default(true)
});

const EditMessageBody = z.object({
  content: z.string()
});

const TruncateBody = z.object({
  messageId: z.string()
});

/** Where a revert starts. The union is deliberate: "revert to this chapter" and "revert from this
 *  response" are one operation, and the discriminator is the only thing that differs. */
const RevertBody = z.object({
  anchor: z.discriminatedUnion("kind", [
    z.object({ kind: z.literal("chapter"), id: z.string() }),
    z.object({ kind: z.literal("message"), id: z.string() })
  ])
});

export type TurnRoutesOptions = FastifyPluginOptions & {
  /** Injectable seam, like every other route plugin: a test points these routes at a temp
   *  directory so nothing it does can reach the real records. */
  dataDir?: string;
};

export const turnRoutes: FastifyPluginAsync<TurnRoutesOptions> = async (app, options = {}) => {
  const dataDir = options.dataDir ?? defaultDataDir;

  app.post("/api/turn", async (request, reply) => {
    const body = TurnBody.parse(request.body);
    const playthrough = getPlaythroughRecord(dataDir, body.playthroughId);

    if (!playthrough) return reply.code(404).send({ error: "Playthrough not found" });

    const controller = abortOnClientDisconnect(reply);

    let result: TurnExecution;
    try {
      result = await executeTurn(
        playthrough,
        body.input,
        providerManager.getProvider(),
        body.suggestedChoicesEnabled,
        providerManager.getContextWindow(),
        { signal: controller.signal, hideUserMessage: body.hideUserMessage },
        loadPromptConfig(settingsDir).promptConfig
      );
    } catch (error) {
      if (controller.signal.aborted) return;
      throw error;
    }

    if (controller.signal.aborted) return;

    updatePlaythroughRecord(dataDir, result.state);

    return {
      narrative: result.narrative,
      choices: result.choices,
      state: result.state,
      applied: result.applied,
      rejected: result.rejected,
      warnings: result.warnings,
      tokenUsage: result.tokenUsage,
      rawInput: result.rawInput,
      rawOutput: result.rawOutput,
      finishReason: result.finishReason
    };
  });

  app.post("/api/playthroughs/:id/retry", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = RetryBody.parse(request.body);
    const controller = abortOnClientDisconnect(reply);

    const result = await retryAssistantTurn(
      dataDir,
      params.id,
      body.messageId,
      providerManager.getProvider(),
      body.suggestedChoicesEnabled,
      providerManager.getContextWindow(),
      controller.signal,
      loadPromptConfig(settingsDir).promptConfig
    );

    if (controller.signal.aborted) return;

    if (!result.ok) return reply.code(result.status).send({ error: result.error });

    return {
      narrative: result.narrative,
      choices: result.choices,
      state: result.state,
      applied: result.applied,
      rejected: result.rejected,
      warnings: result.warnings,
      tokenUsage: result.tokenUsage,
      rawInput: result.rawInput,
      rawOutput: result.rawOutput,
      finishReason: result.finishReason
    };
  });

  app.put("/api/playthroughs/:id/messages/:messageId", async (request, reply) => {
    const params = z.object({ id: z.string(), messageId: z.string() }).parse(request.params);
    const body = EditMessageBody.parse(request.body);

    const result = editChatMessage(dataDir, params.id, params.messageId, body.content);

    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });

  app.post("/api/playthroughs/:id/truncate", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = TruncateBody.parse(request.body);

    const result = truncateChat(dataDir, params.id, body.messageId);

    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });

  /** Reverts to an archived chapter or an archived response. Nothing generates, so there is no
   *  provider to resolve and no partial failure to clean up: the state comes back whole. */
  app.post("/api/playthroughs/:id/revert", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const parsedBody = RevertBody.safeParse(request.body ?? {});
    if (!parsedBody.success) {
      const reasons = parsedBody.error.issues.map((issue) => issue.message).join("; ");
      return reply.code(400).send({ error: `Invalid revert request: ${reasons}` });
    }

    const { kind, id } = parsedBody.data.anchor;
    // The wire shape is one generic `id`; the engine's anchor is two distinct fields, so the
    // discriminator is mapped here and nowhere else.
    const anchor: RevertAnchor =
      kind === "chapter" ? { kind: "chapter", chapterId: id } : { kind: "message", messageId: id };
    const result = revertAction(dataDir, params.id, anchor);

    if (!result.ok) return reply.code(result.status).send({ error: result.error });
    return result.state;
  });
}
