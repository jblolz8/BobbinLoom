import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { deleteLorebook, getLorebook, listLorebooks, saveLorebook } from "../store";

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
    const body = z.object({
      name: z.string().min(1).max(200),
      data: z.object({}).passthrough().optional(),
    }).parse(request.body ?? {});
    const sanitized = body.name.replace(/[^a-zA-Z0-9_\- ]/g, "_");
    const id = sanitized.toLowerCase().replace(/\s+/g, "-");
    const lorebook = body.data ?? { name: body.name, scanDepth: 2, caseSensitive: false, matchWholeWords: false, entries: {} };
    lorebook.name = body.name;
    saveLorebook(id, lorebook as any);
    return reply.code(201).send(getLorebook(id));
  });

  app.put("/api/lorebooks/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({}).passthrough().parse(request.body ?? {});
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
    const body = z.object({
      filename: z.string().min(1),
      contents: z.object({}).passthrough(),
    }).parse(request.body ?? {});
    const sanitized = body.filename.replace(/[^a-zA-Z0-9_\- ]/g, "_").replace(/\.json$/i, "");
    const id = sanitized.toLowerCase().replace(/\s+/g, "-");
    const data = body.contents as any;
    if (!data.entries || typeof data.entries !== "object") {
      return reply.code(400).send({ error: "Invalid lorebook: missing entries object" });
    }
    saveLorebook(id, { name: data.name || id, scanDepth: data.scanDepth ?? 2, caseSensitive: data.caseSensitive ?? false, matchWholeWords: data.matchWholeWords ?? false, entries: data.entries });
    return reply.code(201).send(getLorebook(id));
  });
}
