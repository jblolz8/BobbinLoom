import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import * as RadixTooltip from "@radix-ui/react-tooltip";
import { describe, expect, it } from "vitest";
import {
  Badge,
  Button,
  Card,
  Checkbox,
  CheckboxRow,
  DragGhost,
  DragHandle,
  Header,
  SimpleSelect,
  Slider,
  Stack,
  SwitchRow,
  TagSidebar,
  Text,
  TextArea,
  TextInput,
} from "../src/client/components/base";
import { PlaythroughShelfContent } from "../src/client/components/library/PlaythroughLibrary";
import { SettingsModal } from "../src/client/components/modals/SettingsModal";
import { AppearanceSettingsPanel } from "../src/client/components/settings/AppearanceSettingsPanel";
import { ChatSettingsPanel } from "../src/client/components/settings/ChatSettingsPanel";
import { InterfaceSettingsPanel } from "../src/client/components/settings/InterfaceSettingsPanel";
import {
  formatEqual,
  imageEqual,
  PresetEditor,
  promptConfigDiffers,
} from "../src/client/components/settings/PresetEditor";
import { ProviderConnectionCard } from "../src/client/components/settings/providers/ProviderConnectionList";
import { ImageConnectionEditor } from "../src/client/components/settings/providers/ImageConnectionEditor";
import { TextConnectionEditor } from "../src/client/components/settings/providers/TextConnectionEditor";
import { AppHeader } from "../src/client/components/navigation/AppHeader";
import {
  buildTextSamplingParams,
  resolveConnectionConfig,
} from "../src/server/providerConfig";
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
        }),
      ),
    );

    expect(html).toContain("base-header base-header--app app-header");
    expect(html).toContain("base-header__brand");
    expect(html).toContain(
      '<h1 class="base-header__logo"><button type="button" class="base-header__logo-btn">',
    );
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
        }),
      ),
    );

    expect(html).toContain("base-header--compact");
    expect(html).toContain("base-badge--accent");
    expect(html).toContain("base-badge--pill");
    expect(html).toContain("Chronicles of Amber");
    expect(html).toContain("base-btn--collapse-always");
    // In compact play view, Home, New Playthrough, Settings, and Nav are icon-only and all have active tooltip triggers
    expect(html).toMatch(/aria-label="Return to Home"[^>]*data-state="closed"/);
    expect(html).toMatch(
      /aria-label="New Playthrough"[^>]*data-state="closed"/,
    );
    expect(html).toMatch(/aria-label="Settings"[^>]*data-state="closed"/);
    expect(html).toMatch(
      /aria-label="Toggle navigation bar"[^>]*data-state="closed"/,
    );
  });

  it("renders Header page variant with structured title, subtitle, and actions", () => {
    const html = renderToStaticMarkup(
      createElement(Header, {
        variant: "page",
        title: "Character Library",
        subtitle: "Manage character templates for scenario generation.",
        actions: createElement(
          Button,
          { variant: "primary", size: "sm" },
          "Create",
        ),
      }),
    );

    expect(html).toContain("base-header base-header--page");
    expect(html).toContain('<h2 class="base-text base-header__title">');
    expect(html).toContain("Character Library");
    expect(html).toContain(
      "Manage character templates for scenario generation.",
    );
    expect(html).toContain("base-header__actions");
  });

  it("renders polymorphic Text and Stack primitives with theme-token classes", () => {
    const html = renderToStaticMarkup(
      createElement(
        Stack,
        { direction: "row", align: "center", gap: "sm" },
        createElement(
          Text,
          {
            as: "p",
            size: "sm",
            tone: "secondary",
            weight: "semibold",
            truncate: true,
          },
          "Theme-aware text",
        ),
      ),
    );

    expect(html).toContain(
      "base-stack base-stack--row base-stack--align-center base-stack--gap-sm",
    );
    expect(html).toContain(
      '<p class="base-text base-text--size-sm base-text--tone-secondary base-text--weight-semibold base-text--truncate">Theme-aware text</p>',
    );
  });

  it("supports IconName strings directly on Button and Badge leftIcon/rightIcon with size-mapped icons", () => {
    const html = renderToStaticMarkup(
      createElement(
        Stack,
        { gap: "sm" },
        createElement(
          Badge,
          { variant: "accent", size: "sm", leftIcon: "BookOpen" },
          "Story",
        ),
        createElement(
          Button,
          {
            variant: "primary",
            size: "md",
            leftIcon: "Plus",
            rightIcon: "ArrowRight",
          },
          "New",
        ),
      ),
    );

    expect(html).toContain(
      'class="base-badge__icon base-badge__icon--left"><svg',
    );
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
      }),
    );

    expect(html).toContain("base-header base-header--section");
    expect(html).toContain("base-header__title-icon");
    expect(html).toContain("base-header__subtitle");
    expect(html).toContain(
      "Choose which badges, metadata, and interactive controls appear on chat turns.",
    );
    expect(html).toContain(
      "Control where the chat viewport scrolls when a new AI response arrives.",
    );
    expect(html).toContain(
      "Configure how scene renders are prompted, triggered, and replaced in chat.",
    );
    expect(html).toContain(
      "Inspect raw prompt payloads, model responses, and state patches.",
    );
    expect(html).toContain(
      "base-card base-card--elevated base-card--pad-xs base-card--active base-card--hoverable",
    );
    expect(html).toContain("base-badge base-badge--accent base-badge--xs");
    expect(html).toContain("Top of Message");
    expect(html).not.toContain("autoscroll-option-card");
    expect(html).not.toContain("chat-settings-section");
  });

  it("renders SettingsModal using Modal, Modal.Body, Modal.Content, and Tabs.Panel primitives without legacy layout classes", () => {
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(SettingsModal, {
          open: true,
          onClose: noop,
          choicesEnabled: true,
          setChoicesEnabled: noop,
          showDebug: false,
          setShowDebug: noop,
          showContextUsage: true,
          setShowContextUsage: noop,
        }),
      ),
    );

    expect(html).toContain(
      "base-modal-backdrop base-modal-backdrop--fullscreen-mobile",
    );
    expect(html).toContain(
      "base-modal base-modal--wide base-modal--fullscreen-mobile",
    );
    expect(html).toContain("base-modal__body base-modal__body--split");
    expect(html).toContain("base-modal__content");
    expect(html).toContain('role="tabpanel"');
    expect(html).toContain("base-tab-panel");
    expect(html).not.toContain("settings-modal-wide");
    expect(html).not.toContain("settings-modal-body");
    expect(html).not.toContain("settings-tab-content");
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
      createElement(
        RadixTooltip.Provider,
        null,
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
        }),
      ),
    );

    expect(deepseekHtml).toContain("base-slider");
    expect(deepseekHtml).toContain("base-tooltip-icon");
    expect(deepseekHtml).toContain('aria-label="Context Window slider"');
    expect(deepseekHtml).toContain('aria-label="Max Response Tokens slider"');
    expect(deepseekHtml).toContain("Default (32,768)");
    expect(deepseekHtml).toContain("Default (1,200)");
    expect(deepseekHtml).not.toContain("Stop Sequences");
    expect(deepseekHtml).not.toContain("Timeout (s)");
    expect(deepseekHtml).toContain('aria-label="Temperature slider"');
    expect(deepseekHtml).toContain('aria-label="Top P slider"');
    expect(deepseekHtml).toContain('aria-label="Frequency Penalty slider"');
    expect(deepseekHtml).toContain('aria-label="Presence Penalty slider"');
    // DeepSeek does not render extended local sampler sliders
    expect(deepseekHtml).not.toContain('aria-label="Top K slider"');
    expect(deepseekHtml).not.toContain('aria-label="Min P slider"');
    expect(deepseekHtml).not.toContain('aria-label="Top A slider"');
    expect(deepseekHtml).not.toContain(
      'aria-label="Repetition Penalty slider"',
    );

    const openrouterHtml = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
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
        }),
      ),
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
      resolveConnectionConfig({ ...baseConn, textSource: "deepseek" }),
    );
    expect(deepseekParams).toEqual({
      top_p: 0.9,
      frequency_penalty: 0.2,
      presence_penalty: 0.3,
    });

    const openrouterParams = buildTextSamplingParams(
      resolveConnectionConfig({
        ...baseConn,
        baseUrl: "https://openrouter.ai/api/v1",
        textSource: "openrouter",
      }),
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
      createElement(
        RadixTooltip.Provider,
        null,
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
        }),
      ),
    );

    expect(html).toContain("base-status base-status--inline base-status--ok");
    expect(html).toContain("1 model loaded.");
    expect(html).toContain("conn-test-drawer");
    expect(html).toContain("Test Response Prompt");
    expect(html).toContain("Say hello in one sentence.");
    expect(html).toContain("Hello! Systems are online and ready.");
    expect(html).toContain("312ms");
    expect(html).toContain("12 in · 8 out");
    expect(html).toContain("base-status base-status--banner base-status--ok");
    expect(html).toContain("Response received (312ms).");
    expect(html).toContain("Test response");
  });

  it("executes testProviderResponse against /chat/completions with source-filtered parameters", async () => {
    let capturedUrl = "";
    let capturedBody: Record<string, unknown> = {};

    const mockFetch = (async (
      url: string | URL | Request,
      init?: RequestInit,
    ) => {
      capturedUrl = String(url);
      capturedBody = JSON.parse(String(init?.body ?? "{}"));
      return new Response(
        JSON.stringify({
          model: "deepseek-chat",
          choices: [{ message: { content: "Online and ready!" } }],
          usage: { prompt_tokens: 14, completion_tokens: 5, total_tokens: 19 },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } },
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
      mockFetch,
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

  it("renders ProviderConnectionCard with full-width header, source badge, action row with timestamp, and natural wrapping spec chips", () => {
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(ProviderConnectionCard, {
          connection: {
            id: "conn-1",
            kind: "text",
            label: "OpenRouter — Claude 3.7 Sonnet",
            baseUrl: "https://openrouter.ai/api/v1",
            model: "anthropic/claude-3.7-sonnet",
            hasApiKey: true,
            apiKeyMasked: "••••9a",
            temperature: 0.8,
            maxTokens: 2048,
            contextWindow: 128000,
          },
          isActive: true,
          sortBy: "lastActiveAt",
          onActivate: noop,
          onEdit: noop,
          onDuplicate: noop,
          onRemove: noop,
          headerTags: createElement(
            Badge,
            { variant: "info", size: "xs", leftIcon: "MessageSquare" },
            "OpenRouter",
          ),
          detailTags: createElement(
            Badge,
            { variant: "neutral", size: "xs", leftIcon: "Timer" },
            "120s timeout",
          ),
          overrideTags: createElement(
            Badge,
            { variant: "accent", size: "xs", leftIcon: "Sparkles" },
            "New Story",
          ),
        }),
      ),
    );

    expect(html).toContain("OpenRouter — Claude 3.7 Sonnet");
    expect(html).toContain("OpenRouter");
    expect(html).toContain("Active now");
    expect(html).toContain("https://openrouter.ai/api/v1");
    expect(html).toContain("anthropic/claude-3.7-sonnet");
    expect(html).toContain("••••9a");
    expect(html).toContain("120s timeout");
    expect(html).toContain("New Story");
    expect(html).not.toContain("base-form-grid");
  });

  it("renders ImageConnectionEditor with vertical connection stack, SimpleSelect rightElement, SwitchRow tooltip, and A1111 Slider controls", () => {
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

    const veniceHtml = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(ImageConnectionEditor, {
          mode: "create",
          editing: null,
          form: {
            kind: "image",
            label: "Venice Images",
            baseUrl: "https://api.venice.ai/api/v1",
            model: "flux-dev",
            apiStyle: "venice",
            temperature: 0.7,
            maxTokens: 1200,
            contextWindow: 32768,
            size: "1024x1024",
            variants: 1,
            safeMode: false,
            hideWatermark: true,
          },
          setForm: noop as never,
          apiKey: apiKeyProps,
          models: ["flux-dev"],
          modelSpecs: {
            "flux-dev": {
              promptCharacterLimit: 1500,
              aspectRatios: ["1:1", "3:2"],
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
          textConnections: [],
        }),
      ),
    );

    expect(veniceHtml).toContain("API Style &amp; Connection");
    expect(veniceHtml).toContain("Connection Name");
    expect(veniceHtml).toContain("Style Preset");
    expect(veniceHtml).toContain("Fetch styles");
    expect(veniceHtml).toContain("Hide Watermark");
    expect(veniceHtml).toContain("base-tooltip-icon");
    expect(veniceHtml).toContain("Prompt limit: 1500 characters.");
    expect(veniceHtml).not.toContain('aria-label="Steps slider"');

    const a1111Html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(ImageConnectionEditor, {
          mode: "edit",
          editing: null,
          form: {
            kind: "image",
            label: "Local Forge SDXL",
            baseUrl: "http://127.0.0.1:7860",
            model: "sd_xl_base_1.0.safetensors",
            apiStyle: "a1111",
            temperature: 0.7,
            maxTokens: 1200,
            contextWindow: 32768,
            steps: 28,
            cfgScale: 6.5,
          },
          setForm: noop as never,
          apiKey: apiKeyProps,
          models: ["sd_xl_base_1.0.safetensors"],
          modelSpecs: {},
          dialectOptions: {
            samplers: ["DPM++ 2M", "Euler a"],
            schedulers: ["Automatic", "Karras"],
            forgeCouple: true,
          },
          modelsStatus: { kind: "ok", text: "1 checkpoint loaded." },
          fetchingModels: false,
          onFetchModels: noop,
          testStatus: null,
          busy: false,
          dirty: false,
          onSubmit: noop as never,
          onTest: noop as never,
          onCancel: noop,
          onDelete: noop,
          textConnections: [],
        }),
      ),
    );

    expect(a1111Html).toContain("Checkpoint");
    expect(a1111Html).toContain('aria-label="Steps slider"');
    expect(a1111Html).toContain('aria-label="CFG scale slider"');
    expect(a1111Html).toContain("Forge Couple detected in this WebUI");
    expect(a1111Html).not.toContain("Style Preset");
    expect(a1111Html).not.toContain("Hide Watermark");
  });

  it("renders PresetEditor and drag-and-drop Card / DragHandle / Checkbox / TextArea primitives without legacy settings.css classes", () => {
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(
          Stack,
          { direction: "column", gap: "sm" },
          createElement(PresetEditor),
          createElement(
            Card,
            {
              variant: "elevated",
              padding: "xs",
              dragging: true,
              dropTarget: true,
            },
            createElement(Checkbox, {
              label: "Core Rules",
              tooltip: "Always sent at the top of the prompt.",
              checked: true,
              onChange: noop,
            }),
            createElement(DragHandle),
            createElement(TextArea, {
              label: "Expected Content",
              tooltip: "One line per bullet.",
              value: "Example bullet",
              onChange: noop,
            }),
          ),
          createElement(DragGhost, { x: 120, y: 240, name: "Core Rules" }),
        ),
      ),
    );

    expect(html).toContain("base-stack--sticky");
    expect(html).toContain("Prompt Preset");
    expect(html).toContain("Turn Prompt Modules");
    expect(html).toContain("base-card--dragging");
    expect(html).toContain("base-card--drop-target");
    expect(html).toContain("base-drag-handle");
    expect(html).toContain("base-drag-ghost");
    expect(html).toContain("Core Rules");
    expect(html).toContain("base-tooltip-icon");
    expect(html).not.toContain("prompt-config-sticky");
    expect(html).not.toContain("preset-bar");
    expect(html).not.toContain("module-group");
  });

  it("compares CharacterFormatConfig and ImagePromptSettings independent of object property key order", () => {
    const formatFromZod = {
      intro: "Follow this layout.",
      closingRule: "End with tags.",
      sections: [
        {
          name: "Sexual Capabilities",
          order: 110,
          instruction: "Only include when relevant.",
          examples: ["Item 1", "Item 2"],
          exampleBody: "- Item 1\n- Item 2",
          inline: false,
        },
      ],
    };

    const formatFromRawJson = {
      closingRule: "End with tags.",
      intro: "Follow this layout.",
      sections: [
        {
          name: "Sexual Capabilities",
          order: 110,
          instruction: "Only include when relevant.",
          examples: ["Item 1", "Item 2"],
          inline: false,
          exampleBody: "- Item 1\n- Item 2",
        },
      ],
    };

    expect(formatEqual(formatFromZod, formatFromRawJson)).toBe(true);

    const imageA = {
      instruction: "Describe the scene.",
      instructionMode: "scene" as const,
      positivePrefix: "masterpiece",
      negativePrefix: "blurry",
      promptCharacterLimit: 1000,
      includeState: true,
      includeCast: true,
      historyMessages: 6,
      includePreviousAnswer: true,
    };

    const imageB = {
      includePreviousAnswer: true,
      historyMessages: 6,
      includeCast: true,
      includeState: true,
      promptCharacterLimit: 1000,
      negativePrefix: "blurry",
      positivePrefix: "masterpiece",
      instructionMode: "scene" as const,
      instruction: "Describe the scene.",
    };

    expect(imageEqual(imageA, imageB)).toBe(true);
    expect(
      promptConfigDiffers(
        {
          modules: { turn: [] },
          characterFormat: formatFromZod,
          imageGeneration: imageA,
        },
        {
          id: "default-nsfw",
          name: "Default NSFW",
          readonly: true,
          modules: { turn: [] },
          characterFormat: formatFromRawJson,
          imageGeneration: imageB,
        },
      ),
    ).toBe(false);
  });

  it("renders dirty warning highlights and Modified badges on Card, TextInput, TextArea, SimpleSelect, Slider, SwitchRow, and Checkbox", () => {
    const html = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(
          Stack,
          { direction: "column", gap: "sm" },
          createElement(
            Card,
            { variant: "elevated", padding: "xs", dirty: true },
            createElement(Checkbox, {
              label: "Core Rules",
              checked: true,
              dirty: true,
              onChange: noop,
            }),
            createElement(TextInput, {
              label: "Heading",
              value: "Modified Heading",
              dirty: true,
              onChange: noop,
            }),
            createElement(TextArea, {
              label: "Intro",
              value: "Modified intro",
              dirty: true,
              onChange: noop,
            }),
            createElement(SimpleSelect, {
              label: "Prompt Style",
              value: "natural",
              dirty: true,
              onChange: noop,
              options: [{ value: "natural", label: "Natural" }],
            }),
            createElement(Slider, {
              label: "Word Budget",
              value: 80,
              min: 20,
              max: 200,
              dirty: true,
              onChange: noop,
            }),
            createElement(SwitchRow, {
              title: "Enable Scene Image Prompts",
              checked: true,
              dirty: true,
              onChange: noop,
            }),
            createElement(CheckboxRow, {
              icon: "UserPlus",
              title: "Allow AI to invent additional characters",
              description:
                "Let the story introduce new characters organically.",
              checked: true,
              dirty: true,
              onChange: noop,
            }),
          ),
        ),
      ),
    );

    expect(html).toContain("base-card--dirty");
    expect(html).toContain("base-form-input--dirty");
    expect(html).toContain("base-select-trigger--dirty");
    expect(html).toContain("base-slider--dirty");
    expect(html).toContain("base-toggle-row--dirty");
    expect(html).toContain("base-toggle-row--checkbox");
    expect(html).toContain("base-toggle-row__checkbox-box");
    expect(html).toContain("base-badge base-badge--warning base-badge--xs");
    expect(html).toContain("Modified");
  });

  it("renders InterfaceSettingsPanel using Header, Separator, FormGrid, Card, Badge, CoverAspectPreview, and SwitchRow primitives without legacy classes", () => {
    const html = renderToStaticMarkup(createElement(InterfaceSettingsPanel));

    expect(html).toContain("base-header base-header--section");
    expect(html).toContain("Cast, NPCs &amp; Personas");
    expect(html).toContain("Playthrough Library");
    expect(html).toContain("Narrow Screens");
    expect(html).toContain("base-separator base-separator--horizontal");
    expect(html).toContain("base-form-grid base-form-grid--cols-3");
    expect(html).toContain(
      "base-card base-card--elevated base-card--pad-sm base-card--active base-card--hoverable",
    );
    expect(html).toContain("base-card base-card--panel base-card--pad-xs");
    expect(html).toContain("base-stack--mobile-only");
    expect(html).toContain("cover-aspect-preview");
    expect(html).toContain("Match Portrait &amp; Square Width in Landscape");
    expect(html).toContain("Show Full Playthrough Title");
    expect(html).toContain("Show Full List of Tags");
    expect(html).not.toContain("interface-preview-stage");
    expect(html).not.toContain("pane-swipe-setting");
    expect(html).not.toContain("shape-option-card");
    expect(html).not.toContain("avatar-shape-selector-grid");
    expect(html).not.toContain("shape-radio-indicator");
  });

  it("renders AppearanceSettingsPanel using Header, Tabs, FormGrid, Card, Badge, Separator, and Button primitives without legacy appearance classes", () => {
    const html = renderToStaticMarkup(createElement(AppearanceSettingsPanel));

    expect(html).toContain("base-header base-header--section");
    expect(html).toContain("base-tabs base-tabs--segmented");
    expect(html).toContain("base-form-grid base-form-grid--cols-2");
    expect(html).toContain("Dark Themes");
    expect(html).toContain("Light Counterparts");
    expect(html).toContain("Sakura Blossom");
    expect(html).toContain("Live Theme &amp; Typography Preview");
    expect(html).toContain("Theme Color Palette (Active Tokens)");
    expect(html).not.toContain("Custom Palette Tweaks");
    expect(html).not.toContain("appearance-settings-panel");
    expect(html).not.toContain("theme-mode-segmented-bar");
    expect(html).not.toContain("preset-card");
    expect(html).not.toContain("custom-color-grid");
    expect(html).not.toContain("appearance-live-preview-box");
  });

  it("renders TagSidebar and PlaythroughShelfContent with bottom-only Pagination on 1 page and top+bottom on multiple pages", () => {
    const sidebarHtml = renderToStaticMarkup(
      createElement(TagSidebar, {
        taxonomy: "playthrough",
        tagCounts: [
          { tag: "lovecraftian_horror", count: 3 },
          { tag: "workplace", count: 2 },
          { tag: "femdom", count: 1 },
        ],
        activeTags: ["workplace"],
        onToggleTag: noop,
        onClearTags: noop,
      }),
    );

    expect(sidebarHtml).toContain("base-tag-sidebar");
    expect(sidebarHtml).toContain("Theme &amp; Genre");
    expect(sidebarHtml).toContain("Setting &amp; Backdrop");
    expect(sidebarHtml).toContain("Tropes, Dynamics &amp; Kinks");
    expect(sidebarHtml).toContain("lovecraftian_horror");

    const sampleItem = {
      id: "play_1",
      name: "Shadows Over Innsmouth Corp",
      turn: 12,
      castCount: 3,
      chapterCount: 2,
      imageCount: 0,
      visibleMessageCount: 8,
      lastMessagePreview: "The fluorescent lights hummed overhead.",
      isTimelineBranch: false,
      cover: null,
      tags: [
        "lovecraftian_horror",
        "workplace",
        "femdom",
        "dark_fantasy",
        "mystery",
        "noir",
      ],
      updatedAt: "2026-03-01T00:00:00.000Z",
    };

    const singlePageHtml = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(PlaythroughShelfContent, {
          initialLoading: false,
          isFetching: false,
          total: 1,
          playthroughs: [sampleItem],
          search: "",
          selectedTags: [],
          viewMode: "grid",
          page: 1,
          pageSize: 12,
          onPageChange: noop,
          onPageSizeChange: noop,
          onClearSearch: noop,
          onToggleTag: noop,
          onSelect: noop,
          onRenameRequest: noop,
          onEditTagsRequest: noop,
          onDuplicated: noop,
          onDeleted: async () => {},
          onError: noop,
        }),
      ),
    );

    // 1 page: only 1 Pagination bar (bottom)
    expect(
      (singlePageHtml.match(/base-pagination__summary/g) ?? []).length,
    ).toBe(1);
    expect(singlePageHtml).toContain("base-separator");
    expect(singlePageHtml).toContain("base-form-grid--cols-cards");
    expect(singlePageHtml).toContain("base-card__title-btn");
    expect(singlePageHtml).toContain("base-card__interactive");
    expect(singlePageHtml).toContain("base-actions-menu");
    expect(singlePageHtml).toContain(
      "base-text--clamp-2 base-text--reserve-lines",
    );
    expect(singlePageHtml).toContain("base-tag-row");
    expect(singlePageHtml).toContain("base-tag-row__overflow-trigger");
    expect(singlePageHtml).toContain("+2");
    expect(singlePageHtml).toContain("2 chapters");
    expect(singlePageHtml).toContain("0 images");
    expect(singlePageHtml).toContain("cat-theme");
    expect(singlePageHtml).toContain("cat-setting");
    expect(singlePageHtml).toContain("cat-trope");
    expect(singlePageHtml).not.toContain("playthrough-card");
    expect(singlePageHtml).not.toContain("playthrough-grid");

    const multiPageHtml = renderToStaticMarkup(
      createElement(
        RadixTooltip.Provider,
        null,
        createElement(PlaythroughShelfContent, {
          initialLoading: false,
          isFetching: false,
          total: 25,
          playthroughs: [sampleItem],
          search: "",
          selectedTags: [],
          viewMode: "grid",
          showFullTitle: true,
          showAllTags: true,
          page: 1,
          pageSize: 12,
          onPageChange: noop,
          onPageSizeChange: noop,
          onClearSearch: noop,
          onToggleTag: noop,
          onSelect: noop,
          onRenameRequest: noop,
          onEditTagsRequest: noop,
          onDuplicated: noop,
          onDeleted: async () => {},
          onError: noop,
        }),
      ),
    );

    // >1 page: both top and bottom Pagination bars (2 total)
    expect(
      (multiPageHtml.match(/base-pagination__summary/g) ?? []).length,
    ).toBe(2);
    // When showAllTags is true, TagRow wraps all tags without (+N) overflow trigger
    expect(multiPageHtml).toContain("base-tag-row--wrap");
    expect(multiPageHtml).not.toContain("base-tag-row__overflow-trigger");
  });
});
