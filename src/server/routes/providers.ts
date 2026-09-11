import type { FastifyPluginAsync, FastifyPluginOptions } from "fastify";
import { z } from "zod";
import { ImageApiStyleSchema, ProviderKindSchema } from "../../schemas";
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
  model: z.string().min(1),
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
  variants: z.number().int().min(1).max(4).optional()
});

const ProviderIdParam = z.object({ id: z.string() });

const TestConnectionBody = z.object({
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
  type: z.string().optional()
});

export const providerRoutes: FastifyPluginAsync<ProviderRoutesOptions> = async (app, options = {}) => {
  const manager = options.manager ?? providerManager;

  app.get("/api/settings/providers", async () => {
    return manager.listConnections();
  });

  app.post("/api/settings/providers", async (request) => {
    const body = ProviderConnectionBody.parse(request.body ?? {});
    return manager.createConnection(body);
  });

  app.put("/api/settings/providers/:id", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    const body = ProviderConnectionBody.parse(request.body ?? {});
    return manager.updateConnection(id, body);
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

  app.post("/api/settings/providers/:id/duplicate", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return manager.duplicateConnection(id);
  });

  app.get("/api/settings/providers/:id/key", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return manager.getApiKey(id);
  });
};
