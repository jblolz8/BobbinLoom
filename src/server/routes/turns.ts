import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { getPlaythroughRecord, updatePlaythroughRecord } from "../store";
import { editChatMessage, executeTurn, retryAssistantTurn, type TurnExecution } from "../turnActions";
import { abortOnClientDisconnect, dataDir, providerManager } from "./helpers";

const TurnBody = z.object({
  playthroughId: z.string(),
  input: z.string(),
  suggestedChoicesEnabled: z.boolean().default(true)
});

const RetryBody = z.object({
  messageId: z.string(),
  suggestedChoicesEnabled: z.boolean().default(true)
});

const EditMessageBody = z.object({
  content: z.string()
});

export async function turnRoutes(app: FastifyInstance): Promise<void> {
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
        { signal: controller.signal }
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
      controller.signal
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
}
