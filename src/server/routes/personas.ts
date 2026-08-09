import type { FastifyInstance } from "fastify";
import { z } from "zod";
import {
  createPersonaRecord,
  deletePersonaRecord,
  getPersona,
  listPersonas,
  setDefaultPersonaRecord,
  updatePersonaRecord
} from "../store";

export async function personaRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/personas", async () => {
    return listPersonas();
  });

  app.get("/api/personas/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const persona = getPersona(params.id);
    if (!persona) return reply.code(404).send({ error: "Persona not found" });
    return persona;
  });

  app.post("/api/personas", async (request, reply) => {
    const body = z.object({ name: z.string().min(1), cloneFromId: z.string().optional() }).parse(request.body ?? {});
    const persona = createPersonaRecord(body.name, body.cloneFromId);
    return reply.code(201).send(persona);
  });

  app.put("/api/personas/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({
      name: z.string().min(1).optional(),
      description: z.string().optional(),
      bodyType: z.string().optional(),
      appearance: z.string().optional(),
      initialClothing: z.array(z.object({
        slot: z.string(),
        name: z.string(),
        state: z.string().optional(),
      })).optional(),
    }).parse(request.body ?? {});

    const updated = updatePersonaRecord(params.id, body);
    if (!updated) return reply.code(404).send({ error: "Persona not found" });
    return updated;
  });

  app.delete("/api/personas/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = deletePersonaRecord(params.id);
    if (!deleted) return reply.code(400).send({ error: "Cannot delete persona. It may be the last one or not found." });
    return { ok: true };
  });

  app.post("/api/personas/:id/set-default", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const persona = setDefaultPersonaRecord(params.id);
    if (!persona) return reply.code(404).send({ error: "Persona not found" });
    return persona;
  });
}
