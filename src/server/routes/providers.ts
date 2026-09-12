import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import { z } from "zod";
import { ImageApiStyleSchema, ProviderKindSchema, RegionDirectionSchema } from "../../schemas";
import type { ProviderManager } from "../providerManager";
import { providerManager } from "./helpers";

/** Injectable manager (defaulted) so the routes can be exercised against a temp
 *  data directory with a stub fetch — no test may touch the real store. */
export type ProviderRoutesOptions = FastifyPluginOptions & {
  manager?: ProviderManager;
};

const ProviderConnectionBody = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().nullable().optional(),
  /** NOT `.min(1)`: an IMAGE connection may legitimately have NO model. On the
   *  a1111 dialect an empty model means "whatever checkpoint the WebUI already
   *  has loaded" (the adapter then omits `override_settings` entirely), and the
   *  WebUI's checkpoint list is not always populated — demanding one made a
   *  valid local connection unsaveable with a 500. Text connections still
   *  require a model: see the superRefine on this schema. */
  model: z.string().optional(),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  contextWindow: z.number().optional(),
  // ── registry v2 + image-only fields ──
  // These MUST be on the body schema: zod strips unknown keys, so without them
  // an image connection created through the API would silently become a text
  // connection (and lose every image setting).
  kind: ProviderKindSchema.optional(),
  apiStyle: ImageApiStyleSchema.optional(),
  safeMode: z.boolean().optional(),
  size: z.string().optional(),
  aspectRatio: z.string().optional(),
  promptProviderId: z.string().nullable().optional(),
  stylePreset: z.string().optional(),
  hideWatermark: z.boolean().optional(),
  variants: z.number().int().min(1).max(4).optional(),
  /** Venice `seed` for every generation this connection makes. On the body
   *  schema or zod strips it and the saved connection silently loses it.
   *  `null` clears a stored seed (the editor's emptied field). */
  seed: z.number().int().nullable().optional(),
  /** A1111 sampling controls and its per-connection timeout. On the body
   *  schema for the same reason as every field above: zod strips what is not
   *  declared, so an undeclared field is a setting the editor can never save. */
  steps: z.number().int().min(1).max(150).optional(),
  cfgScale: z.number().min(0).max(30).optional(),
  sampler: z.string().optional(),
  scheduler: z.string().optional(),
  timeoutMs: z.number().int().min(1000).optional(),
  /** Forge Couple regions (a1111 only). On the body schema for the same reason
   *  as every field above: zod strips what is not declared, so an undeclared
   *  field is a setting the editor can never save. */
  regionsEnabled: z.boolean().optional(),
  regionDirection: RegionDirectionSchema.optional()
}).superRefine((value, ctx) => {
  // A text connection cannot work without a model id. An image connection can
  // (see `model` above). `kind` is always sent by the client; a body with no
  // kind but an apiStyle is still an image connection, and a body with neither
  // keeps the pre-existing rule so nothing that used to validate now sneaks by.
  const isText = (value.kind ?? (value.apiStyle ? "image" : "text")) === "text";
  if (isText && !value.model?.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ["model"],
      message: "A text connection needs a model id."
    });
  }
});

const ProviderIdParam = z.object({ id: z.string() });

const TestConnectionBody = z.object({
  id: z.string().optional(),
  baseUrl: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  /** Same dialect rule as the models probe: a saved `id` wins, a draft states
   *  its own style so an unsaved a1111 connection is not tested against
   *  `/v1/models`. */
  apiStyle: ImageApiStyleSchema.optional()
});

/** Body of POST /api/settings/providers/image-styles. Every field is optional,
 *  because the styles endpoint is public and has a documented default host —
 *  the same target resolution as the models probe otherwise (a saved `id` uses
 *  the STORED key). */
const ImageStylesBody = z.object({
  id: z.string().optional(),
  baseUrl: z.string().min(1).optional(),
  apiKey: z.string().optional()
});

const ModelsBody = z.object({
  id: z.string().optional(),
  baseUrl: z.string().min(1).optional(),
  apiKey: z.string().optional(),
  /** Optional model-list flavor, forwarded upstream as `?type=` — image
   *  endpoints (Venice) list image checkpoints under `type=image`. */
  type: z.string().optional(),
  /** The connection's dialect: an a1111 probe must reach `/sdapi/v1/sd-models`
   *  instead of the OpenAI-compatible `/v1/models`. A saved `id` uses the
   *  STORED style (authoritative); this covers the unsaved draft. */
  apiStyle: ImageApiStyleSchema.optional()
});

export const providerRoutes: FastifyPluginAsync<ProviderRoutesOptions> = async (app, options = {}) => {
  const manager = options.manager ?? providerManager;

  app.get("/api/settings/providers", async () => {
    return manager.listConnections();
  });

  app.post("/api/settings/providers", async (request) => {
    const body = ProviderConnectionBody.parse(request.body ?? {});
    // `model` is optional ON THE BODY (an image connection may have none) but
    // required by the registry's input type, which stamps a string field. An
    // absent model is therefore normalised to "" here — the same value the
    // editor's empty form uses, and what the adapters treat as "send nothing".
    return manager.createConnection({ ...body, model: body.model ?? "" });
  });

  app.put("/api/settings/providers/:id", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    const body = ProviderConnectionBody.parse(request.body ?? {});
    return manager.updateConnection(id, { ...body, model: body.model ?? "" });
  });

  app.delete("/api/settings/providers/:id", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return manager.deleteConnection(id);
  });

  app.put("/api/settings/providers/:id/active", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return manager.setActiveConnection(id);
  });

  app.post("/api/settings/providers/test", async (request) => {
    const body = TestConnectionBody.parse(request.body ?? {});
    return manager.testConnection(body);
  });

  app.post("/api/settings/providers/models", async (request) => {
    const body = ModelsBody.parse(request.body ?? {});
    return manager.fetchModels(body);
  });

  // Venice's style list is PUBLIC (no key needed), so every field here is
  // optional — the probe falls back to the documented Venice host when the
  // caller sends no base URL. Same body shape as the models probe otherwise.
  app.post("/api/settings/providers/image-styles", async (request) => {
    const body = ImageStylesBody.parse(request.body ?? {});
    return manager.fetchImageStyles(body);
  });

  app.post("/api/settings/providers/:id/duplicate", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return manager.duplicateConnection(id);
  });

  app.get("/api/settings/providers/:id/key", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return manager.getApiKey(id);
  });
};
