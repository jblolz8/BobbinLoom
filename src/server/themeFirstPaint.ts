/**
 * The theme, painted into the HTML the server serves.
 *
 * The app kept a copy of the reader's theme in the browser — five localStorage keys — for one reason: to
 * paint the first frame before the appearance settings answered. That copy could only ever be stale (a
 * theme changed on another device painted wrong here until the fetch corrected it, which is a visible
 * flash), and it is now gone. The server already knows the settings, so it paints them INTO the shell:
 * `index.html` arrives with the reader's own tokens on the root, and the client's first paint is the
 * reader's theme rather than a correction of a guess.
 *
 * `themeMode: "system"` has no answer a server can compute, so the block carries BOTH schemes: the dark
 * resolution as the base and the light one inside `@media (prefers-color-scheme: light)`. A media query
 * cannot change the `data-theme` ATTRIBUTE, which the stylesheet also branches on, so that case ships a
 * one-line inline script that sets it from the same media query — derived fresh on every load, unlike the
 * cache it replaces.
 *
 * Both sides compile through `src/engine/theme.ts`, which is what keeps this frame and the hydrated frame
 * identical: a difference between them is worse than the flash this replaced.
 */
import { effectiveThemeMode, themeRootAttributes, themeShapeTokens, themeTokens } from "../engine/theme";
import type { AppSettings } from "../schemas";

/** Sets the mode attribute from the OS preference, for the one case the server cannot resolve. */
const SYSTEM_MODE_SCRIPT =
  `<script>(function(){try{if(window.matchMedia&&window.matchMedia("(prefers-color-scheme: light)").matches){` +
  `document.documentElement.setAttribute("data-theme","light");}}catch(e){}})();</script>`;

function declarations(settings: AppSettings, mode: "dark" | "light"): string {
  const tokens = {
    ...themeTokens(
      { themePreset: settings.themePreset, customThemeColors: settings.customThemeColors },
      mode
    ),
    ...themeShapeTokens({ avatarShape: settings.avatarShape, coverAspect: settings.coverAspect })
  };
  return Object.entries(tokens)
    .map(([property, value]) => `${property}:${value};`)
    .join("");
}

function escapeAttribute(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");
}

/** The `<style>` block and the root attributes for this instance's settings. */
export function themeFirstPaint(settings: AppSettings): { attributes: string; markup: string } {
  const mode = settings.themeMode ?? "dark";
  const system = mode === "system";
  const baseMode = system ? "dark" : effectiveThemeMode(mode, false);

  const attributes = Object.entries(
    themeRootAttributes({
      mode: baseMode,
      avatarShape: settings.avatarShape,
      coverAspect: settings.coverAspect
    })
  )
    .map(([name, value]) => `${name}="${escapeAttribute(value)}"`)
    .join(" ");

  const blocks = system
    ? `:root{${declarations(settings, "dark")}}@media (prefers-color-scheme: light){:root{${declarations(settings, "light")}}}`
    : `:root{${declarations(settings, baseMode)}}`;

  return {
    attributes,
    markup: `<style id="theme-first-paint">${blocks}</style>${system ? SYSTEM_MODE_SCRIPT : ""}`
  };
}

/**
 * The shell with the theme painted in. Applied per request rather than cached at startup: the settings can
 * change while the server runs, and the shell is a couple of kilobytes.
 */
export function injectThemeFirstPaint(html: string, settings: AppSettings): string {
  const paint = themeFirstPaint(settings);
  return html
    .replace(/<html([^>]*)>/, (_match, existing: string) => `<html${existing} ${paint.attributes}>`)
    .replace("</head>", `    ${paint.markup}\n  </head>`);
}
