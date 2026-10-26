import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { createReadStream } from "node:fs";
import {
  createPersonaRecord,
  deletePersonaRecord,
  getPersona,
  getPersonaAvatarPath,
  listPersonas,
  removePersonaPortraitAvatar,
  removePersonaProfileAvatar,
  savePersonaAvatar,
  setDefaultPersonaRecord,
  updatePersonaRecord,
} from "../store";
import { transcodeToWebp } from "../imageTranscode";
import { exportPersonaPackage, importPersonaPackage } from "../personaCards";
import { ExportFormatSchema } from "../../schemas";

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
    const body = z
      .object({ name: z.string().min(1), cloneFromId: z.string().optional() })
      .parse(request.body ?? {});
    const persona = createPersonaRecord(body.name, body.cloneFromId);
    return reply.code(201).send(persona);
  });

  app.put("/api/personas/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const body = z
      .object({
        name: z.string().min(1).optional(),
        description: z.string().optional(),
        bodyType: z.string().optional(),
        appearance: z.string().optional(),
        initialClothing: z
          .array(
            z.object({
              slot: z.string(),
              name: z.string(),
              state: z.string().optional(),
            }),
          )
          .optional(),
      })
      .parse(request.body ?? {});

    const updated = updatePersonaRecord(params.id, body);
    if (!updated) return reply.code(404).send({ error: "Persona not found" });
    return updated;
  });

  app.delete("/api/personas/:id", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const deleted = deletePersonaRecord(params.id);
    if (!deleted)
      return reply
        .code(400)
        .send({
          error: "Cannot delete persona. It may be the last one or not found.",
        });
    return { ok: true };
  });

  app.post("/api/personas/:id/set-default", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const persona = setDefaultPersonaRecord(params.id);
    if (!persona) return reply.code(404).send({ error: "Persona not found" });
    return persona;
  });

  // Serve persona avatar (portrait / profile)
  app.get("/api/personas/:id/avatar", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z
      .object({ type: z.enum(["portrait", "profile"]).optional() })
      .parse(request.query ?? {});
    const file = getPersonaAvatarPath(params.id, query.type ?? "portrait");
    if (!file) return reply.code(404).send({ error: "No avatar" });
    const ext = file.split(".").pop()?.toLowerCase();
    const mime =
      ext === "jpg" || ext === "jpeg"
        ? "image/jpeg"
        : ext === "webp"
          ? "image/webp"
          : "image/png";
    return reply.type(mime).send(createReadStream(file));
  });

  // Upload custom portrait or 1:1 profile image
  const UploadAvatarBody = z.object({
    type: z.enum(["portrait", "profile"]),
    dataBase64: z.string().min(1),
    fileName: z.string().optional(),
  });

  app.post(
    "/api/personas/:id/avatar",
    { bodyLimit: 10 * 1024 * 1024 },
    async (request, reply) => {
      const params = z.object({ id: z.string() }).parse(request.params);
      const body = UploadAvatarBody.parse(request.body ?? {});
      const bytes = Buffer.from(body.dataBase64, "base64");
      const rawExt = body.fileName?.split(".").pop() || "png";
      const transcoded = await transcodeToWebp(bytes, rawExt);
      const updated = savePersonaAvatar(
        params.id,
        body.type,
        transcoded.bytes,
        transcoded.ext,
      );
      if (!updated)
        return reply.code(404).send({ error: "Persona not found" });
      return { record: updated };
    },
  );

  // Delete custom full portrait
  app.delete("/api/personas/:id/avatar/portrait", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const updated = removePersonaPortraitAvatar(params.id);
    if (!updated) return reply.code(404).send({ error: "Persona not found" });
    return { record: updated };
  });

  // Delete custom 1:1 profile avatar (falling back to portrait)
  app.delete("/api/personas/:id/avatar/profile", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const updated = removePersonaProfileAvatar(params.id);
    if (!updated) return reply.code(404).send({ error: "Persona not found" });
    return { record: updated };
  });

  // Export persona in .webp, .png, or .json format
  app.get("/api/personas/:id/export", async (request, reply) => {
    const params = z.object({ id: z.string() }).parse(request.params);
    const query = z
      .object({ format: ExportFormatSchema.optional() })
      .parse(request.query ?? {});
    const requestedFormat = query.format ?? "webp";
    const exported = await exportPersonaPackage(params.id, requestedFormat);
    if (!exported) return reply.code(404).send({ error: "Persona not found" });
    return reply
      .header(
        "Content-Disposition",
        `attachment; filename="${exported.fileName}"`,
      )
      .header("X-Export-Format", exported.actualFormat)
      .type(exported.mimeType)
      .send(exported.buffer);
  });

  // Import persona from .webp, .png, or .json file
  const ImportPersonaBody = z.object({
    fileName: z.string().optional(),
    dataBase64: z.string().min(1),
  });

  app.post(
    "/api/personas/import",
    { bodyLimit: 15 * 1024 * 1024 },
    async (request, reply) => {
      const body = ImportPersonaBody.parse(request.body ?? {});
      const bytes = Buffer.from(body.dataBase64, "base64");
      try {
        const record = await importPersonaPackage(bytes);
        return reply.code(201).send({ record });
      } catch (err) {
        const msg =
          err instanceof Error ? err.message : "Failed to import persona.";
        return reply.code(400).send({ error: msg });
      }
    },
  );
}
