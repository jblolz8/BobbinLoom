import "dotenv/config";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import { existsSync, readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { loadAppSettings } from "./appSettingsStore";
import { injectThemeFirstPaint } from "./themeFirstPaint";
import { settingsDir } from "./routes/helpers";

import { characterRoutes } from "./routes/characters";
import { docsRoutes } from "./routes/docs";
import { imageRoutes } from "./routes/images";
import { lorebookRoutes } from "./routes/lorebooks";
import { personaRoutes } from "./routes/personas";
import { playthroughRoutes } from "./routes/playthroughs";
import { presetRoutes } from "./routes/presets";
import { promptConfigRoutes } from "./routes/promptConfig";
import { providerRoutes } from "./routes/providers";
import { turnRoutes } from "./routes/turns";

const app = Fastify({ logger: true });

app.get("/api/health", async () => ({ ok: true, name: "bobbinloom" }));

async function main(): Promise<void> {
  await app.register(cors, { origin: true });

  // Register domain route plugins
  await app.register(presetRoutes);
  await app.register(promptConfigRoutes);
  await app.register(personaRoutes);
  await app.register(characterRoutes);
  await app.register(providerRoutes);
  await app.register(lorebookRoutes);
  await app.register(playthroughRoutes);
  await app.register(turnRoutes);
  await app.register(imageRoutes);
  await app.register(docsRoutes);

  // Serve the production build (dist/) from the same origin as the API.
  const __dirname = dirname(fileURLToPath(import.meta.url));
  const distPath = join(__dirname, "..", "..", "dist");
  if (existsSync(distPath)) {
    // `index: false` and the `allowedPath` predicate together keep BOTH a bare `/` and a direct
    // `/index.html` from being answered straight off disk: the shell has to pass through the first-paint
    // injection, and a direct hit would otherwise hand out the unpainted copy with a cacheable header.
    await app.register(fastifyStatic, {
      root: distPath,
      index: false,
      allowedPath: (pathname: string) => pathname !== "/index.html" && pathname !== "/"
    });
    const shellPath = join(distPath, "index.html");
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/")) {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      // Read and paint per request: the settings can change while the server runs, and the shell is a
      // couple of kilobytes. `no-store`, because the HTML now carries this instance's own theme.
      let shell: string;
      try {
        shell = readFileSync(shellPath, "utf8");
      } catch {
        reply.code(404).send({ error: "Not found" });
        return;
      }
      reply
        .header("cache-control", "no-store")
        .type("text/html")
        .send(injectThemeFirstPaint(shell, loadAppSettings(settingsDir)));
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
