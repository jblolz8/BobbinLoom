import { join } from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { loadAppSettings } from "./src/server/appSettingsStore";
import { injectThemeFirstPaint } from "./src/server/themeFirstPaint";

const settingsDir = join(process.cwd(), "data");

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    {
      name: "bobbinloom-theme-first-paint",
      apply: "serve",
      transformIndexHtml(html) {
        return injectThemeFirstPaint(html, loadAppSettings(settingsDir));
      }
    }
  ],
  server: {
    port: 5173,
    watch: {
      ignored: ["**/data/**", "**/*.bak"]
    },
    proxy: {
      "/api": "http://localhost:8787"
    }
  }
});
