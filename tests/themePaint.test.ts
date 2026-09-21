/** The shared theme compiler and the server's first-frame paint.
 *
 *  These are one unit: the client's live apply and the server's first frame both resolve their custom
 *  properties through `src/engine/theme.ts`, and any difference between the two resolutions is a visible
 *  flash on every reload. The compiler's purity matters for the same reason it is shared — `THEME_PRESETS`
 *  is a module singleton both callers read, so a call that wrote into it would poison the next caller.
 *
 *  Pure logic, no DOM: the markup the server emits is asserted as the string it is.
 */
import { describe, expect, it } from "vitest";
import type { AppSettings } from "../src/schemas";
import { AppSettingsSchema } from "../src/schemas";
import {
  COVER_ASPECT_VALUES,
  THEME_PRESETS,
  avatarBadgeRadius,
  effectiveThemeMode,
  themePresetFor,
  themeShapeTokens,
  themeTokens
} from "../src/engine/theme";
import { injectThemeFirstPaint, themeFirstPaint } from "../src/server/themeFirstPaint";

const SHELL = `<!doctype html><html lang="en"><head></head><body></body></html>`;

/** Built through the schema so the required/defaulted fields are the ones production would produce. */
function settings(overrides: Record<string, unknown> = {}): AppSettings {
  return AppSettingsSchema.parse({
    schemaVersion: 1,
    avatarShape: "circle",
    coverAspect: "square",
    themeMode: "light",
    themePreset: "default-light",
    ...overrides
  });
}

const TYPOGRAPHY = ["--story-text", "--text-primary", "--chat-ai-text", "--chat-user-text", "--story-emphasis"];

describe("effectiveThemeMode", () => {
  it('follows the device preference on "system", both ways', () => {
    expect(effectiveThemeMode("system", true)).toBe("light");
    expect(effectiveThemeMode("system", false)).toBe("dark");
  });

  it("ignores the device preference once the reader has named a scheme", () => {
    expect(effectiveThemeMode("dark", true)).toBe("dark");
    expect(effectiveThemeMode("light", false)).toBe("light");
  });
});

describe("themeTokens", () => {
  it("returns the preset's own colours", () => {
    const tokens = themeTokens({ themePreset: "nord-frost" }, "dark");

    expect(tokens["--bg-app"]).toBe("#2e3440");
    expect(tokens["--text-primary"]).toBe("#eceff4");
  });

  it("lets a custom colour override the preset's", () => {
    const tokens = themeTokens(
      { themePreset: "nord-frost", customThemeColors: { "--bg-app": "#123456", "--chat-ai-bg": "#abcdef" } },
      "dark"
    );

    expect(tokens["--bg-app"]).toBe("#123456");
    expect(tokens["--chat-ai-bg"]).toBe("#abcdef");
    expect(tokens["--text-primary"]).toBe("#eceff4");
  });

  it("derives the translucent accent, the highlight and the focus ring from a custom --accent-base", () => {
    // default-dark ships no accent at all, so every accent token here is a derivation.
    const tokens = themeTokens(
      { themePreset: "default-dark", customThemeColors: { "--accent-base": "#123456" } },
      "dark"
    );

    expect(tokens["--accent-base"]).toBe("#123456");
    expect(tokens["--accent-translucent"]).toBe("rgba(18, 52, 86, 0.14)");
    expect(tokens["--accent-highlight"]).toBe("#123456");
    expect(tokens["--input-focus-border"]).toBe("#123456");
    expect(tokens["--input-focus-ring"]).toBe("rgba(18, 52, 86, 0.25)");
  });

  it("derives --ai-accent-translucent from a custom --ai-accent", () => {
    const tokens = themeTokens(
      { themePreset: "default-dark", customThemeColors: { "--ai-accent": "#ff0000" } },
      "dark"
    );

    expect(tokens["--ai-accent-translucent"]).toBe("rgba(255, 0, 0, 0.14)");
  });

  it("keeps the translucent accents a preset already ships, rather than re-deriving them", () => {
    // nord-frost and emerald-archive spell out both accents and both focus values; the reader replacing
    // --accent-base must not drag them off the preset's palette.
    const tokens = themeTokens(
      { themePreset: "nord-frost", customThemeColors: { "--accent-base": "#123456" } },
      "dark"
    );

    expect(tokens["--accent-translucent"]).toBe("rgba(136, 192, 208, 0.16)");
    expect(tokens["--input-focus-border"]).toBe("#88c0d0");
    expect(tokens["--input-focus-ring"]).toBe("rgba(136, 192, 208, 0.25)");

    const emerald = themeTokens(
      { themePreset: "emerald-archive", customThemeColors: { "--ai-accent": "#ff0000" } },
      "dark"
    );

    expect(emerald["--ai-accent-translucent"]).toBe("rgba(52, 211, 153, 0.16)");
  });

  it("fills in the story, interface and chat typography a preset leaves out, per scheme", () => {
    // No shipped preset omits these, so the fallback branch is only reachable with a bare one.
    THEME_PRESETS.push({ id: "test-bare", name: "Bare", description: "", mode: "dark", colors: {} });
    try {
      const dark = themeTokens({ themePreset: "test-bare" }, "dark");
      const light = themeTokens({ themePreset: "test-bare" }, "light");

      for (const property of TYPOGRAPHY) {
        expect(dark[property], `${property} in dark`).toBeTruthy();
        expect(light[property], `${property} in light`).toBeTruthy();
        expect(dark[property], property).not.toBe(light[property]);
      }
    } finally {
      THEME_PRESETS.pop();
    }
  });

  it("is pure: the same input gives equal values and the preset is left untouched", () => {
    const presetColorsBefore = JSON.stringify(THEME_PRESETS[0].colors);
    const input = { themePreset: THEME_PRESETS[0].id, customThemeColors: { "--accent-base": "#123456" } };

    const first = themeTokens(input, "dark");
    const second = themeTokens(input, "dark");

    expect(second).toEqual(first);
    expect(JSON.stringify(THEME_PRESETS[0].colors)).toBe(presetColorsBefore);
    // A copy, not the preset's own map — the server spreads these straight into CSS.
    expect(themeTokens({ themePreset: THEME_PRESETS[0].id }, "dark")).not.toBe(THEME_PRESETS[0].colors);
  });
});

describe("themePresetFor", () => {
  it("returns the chosen preset, whatever the mode", () => {
    expect(themePresetFor("dark", "midnight-purple").id).toBe("midnight-purple");
    expect(themePresetFor("light", "nord-frost").id).toBe("nord-frost");
  });

  it("falls back per mode for an unknown id and for no id at all", () => {
    expect(themePresetFor("dark", "no-such-preset").id).toBe("default-dark");
    expect(themePresetFor("light", "no-such-preset").id).toBe("default-light");
    expect(themePresetFor("dark", undefined).id).toBe("default-dark");
    expect(themePresetFor("light").id).toBe("default-light");
    expect(themePresetFor("dark", "").mode).toBe("dark");
  });
});

describe("themeShapeTokens and avatarBadgeRadius", () => {
  it("maps each avatar shape to its badge radius", () => {
    expect(avatarBadgeRadius("circle")).toBe("50%");
    expect(avatarBadgeRadius("square")).toBe("2px");
    expect(avatarBadgeRadius("rounded")).toBe("8px");
  });

  it("defaults to the rounded badge and the landscape frame", () => {
    expect(themeShapeTokens({})).toEqual({
      "--avatar-badge-radius": avatarBadgeRadius("rounded"),
      "--cover-art-aspect": COVER_ASPECT_VALUES.landscape
    });
    expect(themeShapeTokens({})).toEqual({
      "--avatar-badge-radius": "8px",
      "--cover-art-aspect": "16 / 9"
    });
  });

  it("carries the chosen shape and aspect when there is one", () => {
    expect(themeShapeTokens({ avatarShape: "square", coverAspect: "portrait" })).toEqual({
      "--avatar-badge-radius": "2px",
      "--cover-art-aspect": "2 / 3"
    });
    expect(themeShapeTokens({ avatarShape: "circle", coverAspect: "square" })["--cover-art-aspect"]).toBe("1 / 1");
  });
});

describe("themeFirstPaint", () => {
  it("names the scheme, the shape and the aspect, and paints one :root block", () => {
    const { attributes, markup } = themeFirstPaint(settings());

    expect(attributes).toBe('data-theme="light" data-avatar-shape="circle" data-cover-aspect="square"');
    expect(markup).toContain('<style id="theme-first-paint">');
    expect(markup.match(/:root\{/g)).toHaveLength(1);
    expect(markup).toContain("--avatar-badge-radius:50%");
    expect(markup).toContain("--cover-art-aspect:1 / 1");
    expect(markup).toContain("--text-primary:#0f172a");
    // A fixed scheme needs neither the media query nor the attribute script.
    expect(markup).not.toContain("@media");
    expect(markup).not.toContain("<script");
  });

  it("paints the dark base when the reader has never chosen a mode", () => {
    const { attributes, markup } = themeFirstPaint(settings({ themeMode: undefined, themePreset: undefined }));

    expect(attributes).toContain('data-theme="dark"');
    expect(markup).toContain("--text-primary:#eceff4");
  });

  it('ships both schemes plus the attribute script for themeMode "system"', () => {
    // No preset, so each scheme resolves its own default and the two blocks are distinguishable.
    const { attributes, markup } = themeFirstPaint(
      settings({ themeMode: "system", themePreset: undefined, avatarShape: "rounded", coverAspect: "landscape" })
    );

    expect(attributes).toBe('data-theme="dark" data-avatar-shape="rounded" data-cover-aspect="landscape"');
    expect(markup.match(/:root\{/g)).toHaveLength(2);

    const [base, media] = markup.split("@media (prefers-color-scheme: light)");
    expect(media).toBeTruthy();
    // The dark resolution is the base, the light one lives inside the query — and both carry the shapes.
    expect(base).toContain("--text-primary:#eceff4");
    expect(media).toContain("--text-primary:#0f172a");
    expect(media).toContain("--avatar-badge-radius:8px");
    expect(base).toContain("--avatar-badge-radius:8px");
    expect(markup).toContain('<script>(function(){try{if(window.matchMedia');
    expect(markup).toContain('document.documentElement.setAttribute("data-theme","light")');
  });
});

describe("injectThemeFirstPaint", () => {
  it("adds the attributes to the html tag and the style block before </head>", () => {
    const html = injectThemeFirstPaint(SHELL, settings());

    expect(html.match(/<html/g)).toHaveLength(1);
    expect(html).toContain(
      '<html lang="en" data-theme="light" data-avatar-shape="circle" data-cover-aspect="square">'
    );
    expect(html.indexOf('<style id="theme-first-paint">')).toBeGreaterThan(-1);
    expect(html.indexOf('<style id="theme-first-paint">')).toBeLessThan(html.indexOf("</head>"));
    expect(html.match(/<\/head>/g)).toHaveLength(1);
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain("<body></body>");
  });

  it("returns a shell with no html tag or head unchanged, rather than mangling it", () => {
    const bare = `<div id="root"></div>`;

    expect(injectThemeFirstPaint(bare, settings())).toBe(bare);
  });

  it("leaves a document with no </head> alone apart from the attributes", () => {
    const headless = `<!doctype html><html lang="en"><body><div id="root"></div></body></html>`;

    const html = injectThemeFirstPaint(headless, settings());

    expect(html).toContain('data-theme="light"');
    expect(html).toContain('<body><div id="root"></div></body>');
    expect(html).not.toContain("<style");
  });
});
