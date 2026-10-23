import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { describe, expect, it } from "vitest";
import { Badge, Button, Header, Stack, Text } from "../src/client/components/base";
import { ChatSettingsPanel } from "../src/client/components/modals/ChatSettingsPanel";
import { TextConnectionEditor } from "../src/client/components/modals/providers/TextConnectionEditor";
import { AppHeader } from "../src/client/components/navigation/AppHeader";
import { buildTextSamplingParams, resolveConnectionConfig } from "../src/server/providerConfig";
import { testProviderResponse } from "../src/server/providerRegistry";

const noop = () => {};

describe("AppHeader and base primitives (Header, Text, Stack, Button)", () => {
  it("renders AppHeader in home view using Header, Tabs, and Button primitives without legacy wrapper classes", () => {
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(AppHeader, {
          view: "home",
          activeHomeTab: "characters",
          onSelectHomeTab: noop,
          onOpenModal: noop,
          onGoHome: noop,
          onNewPlaythrough: noop,
          onOpenSettings: noop,
          onOpenDocs: noop,
        })
      )
    );

    expect(html).toContain("base-header base-header--app");
    expect(html).toContain("base-header__brand");
    expect(html).toContain("base-header__nav");
    expect(html).toContain("base-tabs--segmented");
    expect(html).toContain("base-header__actions");
    expect(html).not.toContain("header-brand-group");
    expect(html).not.toContain("nav-tab-btn");
    expect(html).not.toContain("btn-label");
    expect(html).not.toContain("btn-icon");
    // In wide Home view, button labels ("New Playthrough", "Settings") are visible so tooltips stay disabled
    expect(html).not.toContain('data-state="closed"');
  });

  it("renders active playthrough Badge and enables icon-only action tooltips in compact play view", () => {
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(AppHeader, {
          view: "play",
          activeHomeTab: "playthroughs",
          activePlaythroughName: "Chronicles of Amber",
          isMobile: true,
          onSelectHomeTab: noop,
          onOpenModal: noop,
          onGoHome: noop,
          onNewPlaythrough: noop,
          onOpenSettings: noop,
          onOpenDocs: noop,
        })
      )
    );

    expect(html).toContain("base-header--compact");
    expect(html).toContain("base-badge--accent");
    expect(html).toContain("base-badge--pill");
    expect(html).toContain("Chronicles of Amber");
    expect(html).toContain("base-btn--collapse-always");
    // In compact play view, Home, New Playthrough, Settings, and Nav are icon-only and all have active tooltip triggers
    expect(html).toMatch(/aria-label="Return to Home"[^>]*data-state="closed"/);
    expect(html).toMatch(/aria-label="New Playthrough"[^>]*data-state="closed"/);
    expect(html).toMatch(/aria-label="Settings"[^>]*data-state="closed"/);
    expect(html).toMatch(/aria-label="Toggle navigation bar"[^>]*data-state="closed"/);
  });

  it("renders Header page variant with structured title, subtitle, and actions", () => {
    const html = renderToStaticMarkup(
      createElement(Header, {
        variant: "page",
        title: "Character Library",
        subtitle: "Manage character templates for scenario generation.",
        actions: createElement(Button, { variant: "primary", size: "sm" }, "Create"),
      })
    );

    expect(html).toContain("base-header base-header--page");
    expect(html).toContain('<h2 class="base-text base-header__title">');
    expect(html).toContain("Character Library");
    expect(html).toContain("Manage character templates for scenario generation.");
    expect(html).toContain("base-header__actions");
  });

  it("renders polymorphic Text and Stack primitives with theme-token classes", () => {
    const html = renderToStaticMarkup(
      createElement(
        Stack,
        { direction: "row", align: "center", gap: "sm" },
        createElement(
          Text,
          { as: "p", size: "sm", tone: "secondary", weight: "semibold", truncate: true },
          "Theme-aware text"
        )
      )
    );

    expect(html).toContain("base-stack base-stack--row base-stack--align-center base-stack--gap-sm");
    expect(html).toContain(
      '<p class="base-text base-text--size-sm base-text--tone-secondary base-text--weight-semibold base-text--truncate">Theme-aware text</p>'
    );
  });

  it("supports IconName strings directly on Button and Badge leftIcon/rightIcon with size-mapped icons", () => {
    const html = renderToStaticMarkup(
      createElement(
        Stack,
        { gap: "sm" },
        createElement(Badge, { variant: "accent", size: "sm", leftIcon: "BookOpen" }, "Story"),
        createElement(Button, { variant: "primary", size: "md", leftIcon: "Plus", rightIcon: "ArrowRight" }, "New")
      )
    );

    expect(html).toContain('class="base-badge__icon base-badge__icon--left"><svg');
    expect(html).toContain('width="14" height="14"');
    expect(html).toContain('class="base-btn__icon base-btn__icon--left"><svg');
    expect(html).toContain('class="base-btn__icon base-btn__icon--right"><svg');
    expect(html).toContain('width="16" height="16"');
  });

  it("renders ChatSettingsPanel using Card, Badge, Header, FormGrid, and SwitchRow primitives", () => {
    const html = renderToStaticMarkup(
      createElement(ChatSettingsPanel, {
        choicesEnabled: true,
        setChoicesEnabled: noop,
        showDebug: false,
        setShowDebug: noop,
        showContextUsage: true,
        setShowContextUsage: noop,
        autoScrollBehavior: "start",
      })
    );

    expect(html).toContain("base-header base-header--section");
    expect(html).toContain("base-card base-card--elevated base-card--pad-xs base-card--active base-card--hoverable");
    expect(html).toContain("base-badge base-badge--accent base-badge--xs");
    expect(html).toContain("Top of Message");
    expect(html).not.toContain("autoscroll-option-card");
    expect(html).not.toContain("chat-settings-section");
  });

  it("renders TextConnectionEditor with source-filtered Slider controls and model capability chips", () => {
    const apiKeyProps = {
      value: "",
      onChange: noop,
      showKey: false,
      onToggleShowKey: noop,
      keyBusy: false,
      isKeyCleared: false,
      isStoredKeyActive: false,
      onClearKey: noop,
      onRestoreKey: noop,
    };

    const deepseekHtml = renderToStaticMarkup(
      createElement(TextConnectionEditor, {
        mode: "create",
        editing: null,
        form: {
          kind: "text",
          label: "DeepSeek Cloud",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          textSource: "deepseek",
          temperature: 0.8,
          maxTokens: 2048,
          contextWindow: 65536,
        },
        setForm: noop as never,
        apiKey: apiKeyProps,
        models: ["deepseek-chat"],
        modelSpecs: {},
        modelsStatus: null,
        fetchingModels: false,
        onFetchModels: noop,
        testStatus: null,
        busy: false,
        dirty: false,
        onSubmit: noop as never,
        onTest: noop as never,
        onCancel: noop,
        onDelete: noop,
      })
    );

    expect(deepseekHtml).toContain("base-slider");
    expect(deepseekHtml).toContain('aria-label="Temperature slider"');
    expect(deepseekHtml).toContain('aria-label="Top P slider"');
    expect(deepseekHtml).toContain('aria-label="Frequency Penalty slider"');
    expect(deepseekHtml).toContain('aria-label="Presence Penalty slider"');
    // DeepSeek does not render extended local sampler sliders
    expect(deepseekHtml).not.toContain('aria-label="Top K slider"');
    expect(deepseekHtml).not.toContain('aria-label="Min P slider"');
    expect(deepseekHtml).not.toContain('aria-label="Top A slider"');
    expect(deepseekHtml).not.toContain('aria-label="Repetition Penalty slider"');

    const openrouterHtml = renderToStaticMarkup(
      createElement(TextConnectionEditor, {
        mode: "edit",
        editing: null,
        form: {
          kind: "text",
          label: "OpenRouter",
          baseUrl: "https://openrouter.ai/api/v1",
          model: "anthropic/claude-3.7-sonnet",
          textSource: "openrouter",
          temperature: 0.8,
          topA: 0.1,
          minP: 0.05,
          maxTokens: 4096,
          contextWindow: 128000,
        },
        setForm: noop as never,
        apiKey: apiKeyProps,
        models: ["anthropic/claude-3.7-sonnet"],
        modelSpecs: {
          "anthropic/claude-3.7-sonnet": {
            contextLength: 200000,
            maxCompletionTokens: 16384,
          },
        },
        modelsStatus: null,
        fetchingModels: false,
        onFetchModels: noop,
        testStatus: null,
        busy: false,
        dirty: false,
        onSubmit: noop as never,
        onTest: noop as never,
        onCancel: noop,
        onDelete: noop,
      })
    );

    expect(openrouterHtml).toContain("Top K");
    expect(openrouterHtml).toContain("Min P");
    expect(openrouterHtml).toContain("Top A");
    expect(openrouterHtml).toContain("Repetition Penalty");
    expect(openrouterHtml).toContain("Model max context:");
    expect(openrouterHtml).toContain("200,000");
    expect(openrouterHtml).toContain("Model max output:");
    expect(openrouterHtml).toContain("16,384");
  });

  it("filters unsupported sampling parameters on the wire per Chat Completion Source", () => {
    const baseConn = {
      id: "test",
      kind: "text" as const,
      label: "Test",
      baseUrl: "https://api.deepseek.com/v1",
      model: "deepseek-chat",
      temperature: 0.7,
      maxTokens: 1000,
      contextWindow: 32768,
      topP: 0.9,
      minP: 0.05,
      topA: 0.1,
      topK: 40,
      frequencyPenalty: 0.2,
      presencePenalty: 0.3,
      repetitionPenalty: 1.1,
    };

    const deepseekParams = buildTextSamplingParams(
      resolveConnectionConfig({ ...baseConn, textSource: "deepseek" })
    );
    expect(deepseekParams).toEqual({
      top_p: 0.9,
      frequency_penalty: 0.2,
      presence_penalty: 0.3,
    });

    const openrouterParams = buildTextSamplingParams(
      resolveConnectionConfig({ ...baseConn, baseUrl: "https://openrouter.ai/api/v1", textSource: "openrouter" })
    );
    expect(openrouterParams).toEqual({
      top_p: 0.9,
      min_p: 0.05,
      top_a: 0.1,
      top_k: 40,
      frequency_penalty: 0.2,
      presence_penalty: 0.3,
      repetition_penalty: 1.1,
    });
  });

  it("renders unified compact footer status, Test response button, and Global Test Prompt drawer with response metadata", () => {
    const apiKeyProps = {
      value: "",
      onChange: noop,
      showKey: false,
      onToggleShowKey: noop,
      keyBusy: false,
      isKeyCleared: false,
      isStoredKeyActive: false,
      onClearKey: noop,
      onRestoreKey: noop,
    };

    const html = renderToStaticMarkup(
      createElement(TextConnectionEditor, {
        mode: "edit",
        editing: null,
        form: {
          kind: "text",
          label: "DeepSeek Cloud",
          baseUrl: "https://api.deepseek.com/v1",
          model: "deepseek-chat",
          textSource: "deepseek",
          temperature: 0.7,
          maxTokens: 1200,
          contextWindow: 65536,
        },
        setForm: noop as never,
        apiKey: apiKeyProps,
        models: ["deepseek-chat"],
        modelSpecs: {},
        modelsStatus: { kind: "ok", text: "1 model loaded." },
        fetchingModels: false,
        onFetchModels: noop,
        testStatus: { kind: "ok", text: "Response received (312ms)." },
        onDismissStatus: noop,
        testDrawerOpen: true,
        onToggleTestDrawer: noop,
        testPrompt: "Say hello in one sentence.",
        onTestPromptChange: noop,
        onSaveTestPrompt: noop,
        testResponseResult: {
          ok: true,
          latencyMs: 312,
          model: "deepseek-chat",
          reply: "Hello! Systems are online and ready.",
          usage: {
            promptTokens: 12,
            completionTokens: 8,
            totalTokens: 20,
          },
        },
        busy: false,
        dirty: false,
        onSubmit: noop as never,
        onTest: noop as never,
        onTestResponse: noop as never,
        onCancel: noop,
        onDelete: noop,
      })
    );

    expect(html).toContain("conn-inline-status ok");
    expect(html).toContain("1 model loaded.");
    expect(html).toContain("conn-test-drawer");
    expect(html).toContain("Test Response Prompt");
    expect(html).toContain("Say hello in one sentence.");
    expect(html).toContain("Hello! Systems are online and ready.");
    expect(html).toContain("312ms");
    expect(html).toContain("12 in · 8 out");
    expect(html).toContain("conn-footer-status ok");
    expect(html).toContain("Response received (312ms).");
    expect(html).toContain("Test response");
  });

  it("executes testProviderResponse against /chat/completions with source-filtered parameters", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = (async (url: string | URL | Request, init?: RequestInit) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          model: "deepseek-chat",
          choices: [{ message: { content: "Online and ready!" } }],
          usage: { prompt_tokens: 14, completion_tokens: 5, total_tokens: 19 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }) as typeof fetch;

    const result = await testProviderResponse(
      {
        baseUrl: "https://api.deepseek.com/v1",
        apiKey: "sk-test",
        model: "deepseek-chat",
        textSource: "deepseek",
        prompt: "Ping test",
        temperature: 0.6,
        topP: 0.9,
        topK: 50, // Unsupported by DeepSeek — should be stripped on the wire
      },
      mockFetch
    );

    expect(capturedUrl).toBe("https://api.deepseek.com/v1/chat/completions");
    expect(capturedBody.model).toBe("deepseek-chat");
    expect(capturedBody.temperature).toBe(0.6);
    expect(capturedBody.top_p).toBe(0.9);
    expect(capturedBody.top_k).toBeUndefined();
    expect(result.ok).toBe(true);
    expect(result.reply).toBe("Online and ready!");
    expect(result.model).toBe("deepseek-chat");
    expect(result.usage).toEqual({
      promptTokens: 14,
      completionTokens: 5,
      totalTokens: 19,
    });
  });
});
