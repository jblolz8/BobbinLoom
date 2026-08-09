import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { providerManager } from "./helpers";

const ProviderConnectionBody = z.object({
  id: z.string().optional(),
  label: z.string().min(1),
  baseUrl: z.string().min(1),
  apiKey: z.string().nullable().optional(),
  model: z.string().min(1),
  temperature: z.number().optional(),
  maxTokens: z.number().optional(),
  contextWindow: z.number().optional()
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
  apiKey: z.string().optional()
});

export async function providerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/api/settings/providers", async () => {
    return providerManager.listConnections();
  });

  app.post("/api/settings/providers", async (request) => {
    const body = ProviderConnectionBody.parse(request.body ?? {});
    return providerManager.createConnection(body);
  });

  app.put("/api/settings/providers/:id", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    const body = ProviderConnectionBody.parse(request.body ?? {});
    return providerManager.updateConnection(id, body);
  });

  app.delete("/api/settings/providers/:id", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return providerManager.deleteConnection(id);
  });

  app.put("/api/settings/providers/:id/active", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return providerManager.setActiveConnection(id);
  });

  app.post("/api/settings/providers/test", async (request) => {
    const body = TestConnectionBody.parse(request.body ?? {});
    return providerManager.testConnection(body);
  });

  app.post("/api/settings/providers/models", async (request) => {
    const body = ModelsBody.parse(request.body ?? {});
    return providerManager.fetchModels(body);
  });

  app.post("/api/settings/providers/:id/duplicate", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return providerManager.duplicateConnection(id);
  });

  app.get("/api/settings/providers/:id/key", async (request) => {
    const { id } = ProviderIdParam.parse(request.params);
    return providerManager.getApiKey(id);
  });
}
