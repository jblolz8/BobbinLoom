import "dotenv/config";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { characterRoutes } from "./routes/characters";
import { lorebookRoutes } from "./routes/lorebooks";
import { personaRoutes } from "./routes/personas";
import { playthroughRoutes } from "./routes/playthroughs";
import { presetRoutes } from "./routes/presets";
import { providerRoutes } from "./routes/providers";
import { turnRoutes } from "./routes/turns";

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true, name: "bobbinloom" }));

async function main(): Promise<void> {
  await app.register(cors, { origin: true });

  // Register domain route plugins
  await app.register(presetRoutes);
  await app.register(personaRoutes);
  await app.register(characterRoutes);
  await app.register(providerRoutes);
  await app.register(lorebookRoutes);
  await app.register(playthroughRoutes);
  await app.register(turnRoutes);

  // Serve the production build (dist/) from the same origin as the API.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const distPath = join(__dirname, "..", "..", "dist");
  if (existsSync(distPath)) {
    await app.register(fastifyStatic, { root: distPath });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
      } else {
        reply.sendFile("index.html");
      }
    });
  }

  const port = Number(process.env.PORT ?? 8787);
  const host = process.env.HOST ?? "127.0.0.1";
  await app.listen({ port, host });
  console.log(`BobbinLoom listening on http://${host}:${port}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
