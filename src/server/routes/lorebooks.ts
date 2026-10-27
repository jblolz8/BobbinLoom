import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { LorebookEntrySchema, type LorebookEntry } from "../../schemas";
import {
  deleteLorebook,
  getLorebook,
  listLorebooks,
  saveLorebook,
  uniqueLorebookId,
} from "../store";

function normalizeImportedEntries(
  rawEntries: Record<string, unknown>,
): Record<string, LorebookEntry> {
  const normalized: Record<string, LorebookEntry> = {};
  let fallbackUid = 1;
  for (const [key, raw] of Object.entries(rawEntries)) {
    if (!raw || typeof raw !== "object") continue;
    const obj = raw as Record<string, unknown>;
    const numericKey = Number(key);
    const uid =
      typeof obj.uid === "number" && Number.isFinite(obj.uid)
        ? obj.uid
        : Number.isFinite(numericKey) && numericKey >= 0
          ? numericKey
          : fallbackUid;
    fallbackUid = Math.max(fallbackUid, uid + 1);
    const parsed = LorebookEntrySchema.safeParse({
      ...obj,
      uid,
    });
    if (parsed.success) {
      normalized[String(parsed.data.uid)] = parsed.data;
    }
  }
  return normalized;
}

export async function lorebookRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/lorebooks", async () => {
    return listLorebooks();
  });

  app.get("/api/lorebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const lb = getLorebook(params.id);
    if (!lb) return reply.code(404).send({ error: "Lorebook not found" });
    return lb;
  });

  app.post("/api/lorebooks", async (request, reply) => {
    const body = z
      .object({
        name: z.string().min(1).max(200),
        data: z.object({}).passthrough().optional(),
      })
      .parse(request.body ?? {});
    const id = uniqueLorebookId(body.name);
    const rawData = body.data as Record<string, unknown> | undefined;
    const rawEntries =
      rawData && typeof rawData.entries === "object" && rawData.entries !== null
        ? (rawData.entries as Record<string, unknown>)
        : {};
    const lorebook = {
      name: body.name,
      scanDepth:
        typeof rawData?.scanDepth === "number" ? rawData.scanDepth : 2,
      caseSensitive: Boolean(rawData?.caseSensitive),
      matchWholeWords: Boolean(rawData?.matchWholeWords),
      entries: normalizeImportedEntries(rawEntries),
    };
    saveLorebook(id, lorebook);
    return reply.code(201).send({ ...getLorebook(id), id });
  });

  app.put("/api/lorebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({})
      .passthrough()
      .parse(request.body ?? {});
    const existing = getLorebook(params.id);
    if (!existing) return reply.code(404).send({ error: "Lorebook not found" });
    const merged = { ...existing, ...body };
    saveLorebook(params.id, merged as any);
    return getLorebook(params.id);
  });

  app.delete("/api/lorebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const ok = deleteLorebook(params.id);
    if (!ok) return reply.code(404).send({ error: "Lorebook not found" });
    return { ok: true };
  });

  app.post("/api/lorebooks/import", async (request, reply) => {
    const body = z
      .object({
        filename: z.string().min(1),
        contents: z.object({}).passthrough(),
      })
      .parse(request.body ?? {});
    const data = body.contents as Record<string, unknown>;
    if (!data.entries || typeof data.entries !== "object") {
      return reply
        .code(400)
        .send({ error: "Invalid lorebook: missing entries object" });
    }
    const cleanFilename = body.filename.replace(/\.json$/i, "");
    const resolvedName =
      typeof data.name === "string" && data.name.trim().length > 0
        ? data.name.trim()
        : cleanFilename;
    const id = uniqueLorebookId(cleanFilename);
    saveLorebook(id, {
      name: resolvedName,
      scanDepth: typeof data.scanDepth === "number" ? data.scanDepth : 2,
      caseSensitive: Boolean(data.caseSensitive),
      matchWholeWords: Boolean(data.matchWholeWords),
      entries: normalizeImportedEntries(
        data.entries as Record<string, unknown>,
      ),
    });
    return reply.code(201).send({ ...getLorebook(id), id });
  });
}
