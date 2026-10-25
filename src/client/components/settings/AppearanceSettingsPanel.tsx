import { useEffect, useState } from "react";
import type { ThemeMode } from "../../../schemas";
import { counterpartPresetId, presetCardTokens } from "../../../engine/theme";
import {
  applyTheme,
  getAppearanceSettings,
  THEME_PRESETS,
  updateAppearanceSettings,
  type ThemePreset,
} from "../../api";
import {
  AvatarBadge,
  Badge,
  Button,
  Card,
  FormGrid,
  Header,
  Icon,
  Separator,
  Stack,
  Tabs,
  Text,
  type IconName,
  type TabItem,
} from "../base";

const THEME_MODE_TABS: TabItem<ThemeMode>[] = [
  { id: "dark", label: "Dark", icon: "Moon" },
  { id: "light", label: "Light", icon: "Sun" },
  { id: "system", label: "System", icon: "Monitor" },
];

interface ThemeShowcaseItem {
  name: string;
  variable: string;
  desc: string;
  preview: "pill" | "swatch" | "text" | "input";
  badgeText?: string;
  icon?: IconName;
  style: React.CSSProperties;
}

interface ThemeShowcaseGroup {
  id: string;
  title: string;
  icon: IconName;
  items: ThemeShowcaseItem[];
}

const THEME_SHOWCASE_GROUPS: ThemeShowcaseGroup[] = [
  {
    id: "status",
    title: "Status & Semantic Colors",
    icon: "CheckCircle2",
    items: [
      {
        name: "Success",
        variable: "--status-success",
        desc: "Ready confirmations, active badges, positive state",
        preview: "pill",
        badgeText: "Success / Active",
        icon: "CheckCircle2",
        style: {
          background: "var(--status-success-bg)",
          borderColor: "var(--status-success-border)",
          color: "var(--status-success)",
        },
      },
      {
        name: "Warning",
        variable: "--status-warning",
        desc: "Caution indicators, unsaved changes, warning notices",
        preview: "pill",
        badgeText: "Caution Notice",
        icon: "AlertTriangle",
        style: {
          background: "var(--status-warning-bg)",
          borderColor: "var(--status-warning-border)",
          color: "var(--status-warning)",
        },
      },
      {
        name: "Danger / Error",
        variable: "--status-danger",
        desc: "Destructive prompts, delete actions, system crash alerts",
        preview: "pill",
        badgeText: "Critical / Danger",
        icon: "AlertCircle",
        style: {
          background: "var(--status-danger-bg)",
          borderColor: "var(--status-danger-border)",
          color: "var(--status-danger)",
        },
      },
      {
        name: "Information",
        variable: "--status-info",
        desc: "Tooltips, guidance notices, active branch node highlight",
        preview: "pill",
        badgeText: "System Info",
        icon: "Info",
        style: {
          background: "var(--status-info-bg)",
          borderColor: "var(--status-info-border)",
          color: "var(--status-info)",
        },
      },
    ],
  },
  {
    id: "brand",
    title: "Brand & Interactive Accents",
    icon: "Sparkles",
    items: [
      {
        name: "Primary Accent",
        variable: "--accent-base",
        desc: "Primary buttons, active nav tabs, brand outlines",
        preview: "swatch",
        style: {
          background: "var(--accent-base)",
          borderColor: "var(--accent-hover)",
        },
      },
      {
        name: "Accent Highlight",
        variable: "--accent-highlight",
        desc: "Active tab underlines, badge outlines, and high-contrast text on dark surfaces",
        preview: "pill",
        badgeText: "Active Tab / Outline",
        icon: "Check",
        style: {
          background: "var(--accent-translucent)",
          borderColor: "var(--accent-highlight, var(--accent-base))",
          color: "var(--accent-highlight, var(--accent-base))",
        },
      },
      {
        name: "AI Assistant Accent",
        variable: "--ai-accent",
        desc: "AI brainstorm assistant, generator tools, suggestion sparkles",
        preview: "swatch",
        style: {
          background: "var(--ai-accent)",
          borderColor: "var(--ai-accent-hover, var(--ai-accent))",
        },
      },
    ],
  },
  {
    id: "story",
    title: "Story Dialogue & Prose",
    icon: "MessageSquare",
    items: [
      {
        name: "Main Story / Plain Text",
        variable: "--story-text",
        desc: "Base prose, narrative descriptions, and chat messages",
        preview: "text",
        badgeText: "The ancient gates creaked open...",
        style: {
          color: "var(--story-text)",
        },
      },
      {
        name: "Spoken Dialogue Quotes",
        variable: "--story-quote",
        desc: 'Text color for dialogue in quotation marks ("...")',
        preview: "text",
        badgeText: '"I am ready."',
        style: {
          color: "var(--story-quote)",
          fontWeight: 600,
        },
      },
      {
        name: "Italics & Actions",
        variable: "--story-italic",
        desc: "Italic prose: narrative actions and internal thoughts (*...*)",
        preview: "text",
        badgeText: "*whispers quietly*",
        style: {
          color: "var(--story-italic)",
          fontStyle: "italic",
        },
      },
      {
        name: "Emphasis & Bold Text",
        variable: "--story-emphasis",
        desc: "Bold prose emphasis and dramatic beats (**...**)",
        preview: "text",
        badgeText: "sudden strike",
        style: {
          color: "var(--story-emphasis)",
          fontWeight: 700,
        },
      },
    ],
  },
  {
    id: "docs",
    title: "Search Highlights",
    icon: "Highlighter",
    items: [
      {
        name: "Highlighted Term",
        variable: "--doc-hit-text",
        desc: "The searched word inside a documentation page",
        preview: "text",
        badgeText: "highlighted",
        style: {
          color: "var(--doc-hit-text)",
          background: "var(--doc-hit-bg)",
          padding: "0.1rem 0.35rem",
          borderRadius: "4px",
        },
      },
      {
        name: "Highlight Surface",
        variable: "--doc-hit-bg",
        desc: "The wash behind a highlighted term, in prose and in code",
        preview: "swatch",
        style: {
          background: "var(--doc-hit-bg)",
        },
      },
    ],
  },
  {
    id: "code",
    title: "Code & Technical Blocks",
    icon: "Code",
    items: [
      {
        name: "Inline Code Text",
        variable: "--code-inline-text",
        desc: "Backticked spans in prose, chat messages and documentation",
        preview: "text",
        badgeText: "inline code",
        style: {
          color: "var(--code-inline-text)",
          background: "var(--code-inline-bg)",
          border: "1px solid var(--code-inline-border)",
          padding: "0.1rem 0.35rem",
          borderRadius: "4px",
          fontFamily: "var(--font-mono, monospace)",
        },
      },
      {
        name: "Inline Code Surface",
        variable: "--code-inline-bg",
        desc: "The chip behind inline code",
        preview: "swatch",
        style: {
          background: "var(--code-inline-bg)",
          borderColor: "var(--code-inline-border)",
        },
      },
      {
        name: "Code Block Surface",
        variable: "--code-block-bg",
        desc: "Fenced blocks and raw payloads — chat, debug panel and the docs viewer",
        preview: "swatch",
        style: {
          background: "var(--code-block-bg)",
          borderColor: "var(--code-block-border)",
        },
      },
      {
        name: "Code Block Header",
        variable: "--code-block-header",
        desc: "The strip carrying the language label and the copy button",
        preview: "swatch",
        style: {
          background: "var(--code-block-header)",
          borderColor: "var(--code-block-border)",
        },
      },
      {
        name: "Code Block Border",
        variable: "--code-block-border",
        desc: "Outlines every code block",
        preview: "swatch",
        style: {
          background: "transparent",
          borderColor: "var(--code-block-border)",
        },
      },
      {
        name: "Language Label",
        variable: "--code-lang-label",
        desc: "The small uppercase language tag in a block's header",
        preview: "text",
        badgeText: "TYPESCRIPT",
        style: {
          color: "var(--code-lang-label)",
          fontWeight: 600,
          letterSpacing: "0.05em",
        },
      },
    ],
  },
  {
    id: "surfaces",
    title: "Surfaces & Chat Elements",
    icon: "Layers",
    items: [
      {
        name: "App Canvas Background",
        variable: "--bg-app",
        desc: "Main page window and backdrop canvas",
        preview: "swatch",
        style: {
          background: "var(--bg-app)",
          borderColor: "var(--border-main)",
        },
      },
      {
        name: "Elevated Surface / Panel",
        variable: "--bg-surface-elevated",
        desc: "Modals, floating cards, sidebar panels, and dropdowns",
        preview: "swatch",
        style: {
          background: "var(--bg-surface-elevated)",
          borderColor: "var(--border-main)",
        },
      },
      {
        name: "Primary Interface Text",
        variable: "--text-primary",
        desc: "Window labels, button text, headers, and form titles",
        preview: "text",
        badgeText: "Settings & Actions",
        style: {
          color: "var(--text-primary)",
          fontWeight: 600,
        },
      },
      {
        name: "User Chat Bubble",
        variable: "--chat-user-bg",
        desc: "Background fill for player input turns",
        preview: "swatch",
        style: {
          background: "var(--chat-user-bg)",
          borderColor: "var(--chat-user-border, var(--border-main))",
        },
      },
      {
        name: "AI Chat Bubble",
        variable: "--chat-ai-bg",
        desc: "Background fill for assistant roleplay turns",
        preview: "swatch",
        style: {
          background: "var(--chat-ai-bg)",
          borderColor: "var(--chat-ai-border, var(--border-main))",
        },
      },
      {
        name: "UI Border Divider",
        variable: "--border-main",
        desc: "Card borders, section headers, and partition lines",
        preview: "swatch",
        style: {
          background: "var(--border-main)",
          borderColor: "var(--border-light)",
        },
      },
    ],
  },
  {
    id: "inputs",
    title: "Form Controls & Inputs",
    icon: "SquarePen",
    items: [
      {
        name: "Base Input Canvas",
        variable: "--input-bg",
        desc: "Base background for standard inputs and focused fields",
        preview: "input",
        badgeText: "Base field",
        style: {
          backgroundColor: "var(--input-bg)",
          border: "1px solid var(--input-border)",
          color: "var(--input-text)",
        },
      },
      {
        name: "Filled Input Surface",
        variable: "--input-filled-bg",
        desc: "Resting background on provider forms and modal inputs",
        preview: "input",
        badgeText: "Provider field",
        style: {
          backgroundColor: "var(--input-filled-bg, var(--input-bg))",
          border: "1px solid var(--input-border)",
          color: "var(--input-text)",
        },
      },
      {
        name: "Input Border",
        variable: "--input-border",
        desc: "Framing border around text boxes, dropdowns, and textareas",
        preview: "swatch",
        style: {
          background: "var(--input-border)",
          borderColor: "var(--border-light)",
        },
      },
      {
        name: "Input Focus Ring",
        variable: "--input-focus-border",
        desc: "Active border and glowing ring when typing or focusing a field",
        preview: "input",
        badgeText: "Focused ring",
        style: {
          backgroundColor: "var(--input-bg)",
          border: "1px solid var(--input-focus-border)",
          boxShadow: "0 0 0 2px var(--input-focus-ring)",
          color: "var(--input-text)",
        },
      },
    ],
  },
];

function resolveSystemMode(): "dark" | "light" {
  return typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function AppearanceSettingsPanel() {
  // Initial values are the shipped defaults: the server paints these tokens into the first frame and
  // the GET below fills the controls, so the device cache is gone (it desynced across devices).
  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");
  const [themePreset, setThemePreset] = useState<string>("default-dark");

  useEffect(() => {
    getAppearanceSettings()
      .then((res) => {
        if (res.themeMode) setThemeMode(res.themeMode);
        if (res.themePreset) setThemePreset(res.themePreset);

        applyTheme({
          themeMode: res.themeMode,
          themePreset: res.themePreset,
        });
      })
      .catch(() => {
        /* fallback to state defaults */
      });
  }, []);

  async function persistAppearance(updates: {
    themeMode?: ThemeMode;
    themePreset?: string;
  }) {
    try {
      await updateAppearanceSettings(updates);
    } catch {
      /* Next read reconciles; local UI state is already applied immediately. */
    }
  }

  function handleSelectMode(mode: ThemeMode) {
    setThemeMode(mode);
    const targetScheme = mode === "system" ? resolveSystemMode() : mode;
    const newPreset = counterpartPresetId(themePreset, targetScheme);
    if (newPreset !== themePreset) setThemePreset(newPreset);
    applyTheme({
      themeMode: mode,
      themePreset: newPreset,
    });
    void persistAppearance({ themeMode: mode, themePreset: newPreset });
  }

  function handleSelectPreset(preset: ThemePreset) {
    setThemePreset(preset.id);
    setThemeMode(preset.mode);
    applyTheme({
      themeMode: preset.mode,
      themePreset: preset.id,
    });
    void persistAppearance({
      themeMode: preset.mode,
      themePreset: preset.id,
    });
  }

  const effectiveMode: "dark" | "light" =
    themeMode === "light"
      ? "light"
      : themeMode === "dark"
        ? "dark"
        : resolveSystemMode();

  const activePresetObj = THEME_PRESETS.find((p) => p.id === themePreset);
  const totalShowcaseTokens = THEME_SHOWCASE_GROUPS.reduce(
    (sum, g) => sum + g.items.length,
    0,
  );

  return (
    <Stack direction="column" align="stretch" gap="md">
      {/* ── Theme Mode Section ── */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="SunMedium"
          title="Theme Mode"
          subtitle="Toggle between Dark, Light, or follow your System OS display settings. Switching modes flips to the active preset's counterpart."
        />

        <Tabs<ThemeMode>
          tabs={THEME_MODE_TABS}
          activeTab={themeMode}
          onChange={handleSelectMode}
          variant="segmented"
          size="sm"
          fullWidth
          ariaLabel="Theme mode"
        />
      </Stack>

      <Separator spacing="none" />

      {/* ── Theme Presets Section (2-Column Dark <-> Light Counterparts) ── */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="Palette"
          title="Theme Presets"
          subtitle="Hand-crafted Dark (left) and Light (right) counterpart palettes calibrated for high-contrast story reading and roleplay."
        />

        <FormGrid cols={2} gap="xs">
          <Stack direction="row" align="center" gap="2xs">
            <Text as="span" tone="accent">
              <Icon name="Moon" size={13} />
            </Text>
            <Text as="strong" size="xs" weight="semibold" tone="secondary">
              Dark Themes
            </Text>
          </Stack>
          <Stack direction="row" align="center" gap="2xs">
            <Text as="span" tone="accent">
              <Icon name="Sun" size={13} />
            </Text>
            <Text as="strong" size="xs" weight="semibold" tone="secondary">
              Light Counterparts
            </Text>
          </Stack>
        </FormGrid>

        <FormGrid cols={2} gap="xs">
          {THEME_PRESETS.map((preset) => {
            const isSelected = themePreset === preset.id;
            const cardTokens = presetCardTokens(preset) as React.CSSProperties;
            return (
              <Card
                key={preset.id}
                as="button"
                type="button"
                variant="panel"
                padding="sm"
                active={isSelected}
                hoverable
                style={cardTokens}
                aria-pressed={isSelected}
                onClick={() => handleSelectPreset(preset)}
              >
                <Stack
                  direction="column"
                  align="stretch"
                  justify="between"
                  gap="xs"
                  fullHeight
                >
                  <Stack direction="column" align="stretch" gap="xs">
                    <Stack
                      direction="row"
                      align="center"
                      justify="between"
                      gap="xs"
                    >
                      <Text
                        as="strong"
                        size="sm"
                        weight="semibold"
                        tone="primary"
                      >
                        {preset.name}
                      </Text>
                      <Stack direction="row" align="center" gap="2xs">
                        <Badge
                          variant={isSelected ? "accent" : "neutral"}
                          size="xs"
                          leftIcon={preset.mode === "dark" ? "Moon" : "Sun"}
                        >
                          {preset.mode}
                        </Badge>
                        {isSelected && (
                          <Badge variant="accent" size="xs">
                            Active
                          </Badge>
                        )}
                      </Stack>
                    </Stack>

                    <Text as="p" variant="caption" tone="secondary">
                      {preset.description}
                    </Text>
                  </Stack>

                  <Card
                    variant="elevated"
                    padding="xs"
                    aria-hidden="true"
                    style={{
                      background: "var(--chat-ai-bg)",
                      borderColor: "var(--chat-ai-border)",
                    }}
                  >
                    <Text
                      as="p"
                      size="xs"
                      style={{ color: "var(--story-text)" }}
                    >
                      <Text
                        as="span"
                        weight="semibold"
                        style={{ color: "var(--story-quote)" }}
                      >
                        &ldquo;Hello,&rdquo;
                      </Text>{" "}
                      <Text
                        as="em"
                        style={{
                          color: "var(--story-italic)",
                          fontStyle: "italic",
                        }}
                      >
                        she whispers
                      </Text>{" "}
                      <Text
                        as="strong"
                        weight="bold"
                        style={{ color: "var(--story-emphasis)" }}
                      >
                        softly.
                      </Text>
                    </Text>
                  </Card>
                </Stack>
              </Card>
            );
          })}
        </FormGrid>
      </Stack>

      <Separator spacing="none" />

      {/* ── Live Interactive Story & UI Preview (Overview) ── */}
      <Stack direction="column" align="stretch" gap="xs">
        <Header
          variant="section"
          icon="Eye"
          title="Live Theme & Typography Preview"
          badge={
            <Badge variant="neutral" size="xs">
              {activePresetObj?.name ?? themePreset} · {effectiveMode}
            </Badge>
          }
          subtitle="Preview how spoken dialogue, italic actions, bold emphasis, blockquotes, and controls render in the active theme."
        />

        <Card variant="panel" padding="sm">
          <Stack direction="column" align="stretch" gap="xs">
            {/* AI Response Preview */}
            <Card
              variant="elevated"
              padding="sm"
              style={{
                background: "var(--chat-ai-bg)",
                borderColor: "var(--chat-ai-border)",
                color: "var(--chat-ai-text)",
              }}
            >
              <Stack direction="column" align="stretch" gap="xs">
                <Stack direction="row" align="center" gap="xs">
                  <AvatarBadge name="Mira" size="sm" />
                  <Text as="strong" size="sm" weight="semibold" tone="primary">
                    Mira Vane
                  </Text>
                  <Badge variant="accent" size="xs">
                    AI
                  </Badge>
                </Stack>

                <Stack direction="column" align="stretch" gap="2xs">
                  <Text as="p" size="sm" style={{ color: "var(--story-text)" }}>
                    <Text
                      as="span"
                      weight="semibold"
                      style={{ color: "var(--story-quote)" }}
                    >
                      &ldquo;Welcome back to the BobbinLoom archives,&rdquo;
                    </Text>{" "}
                    <Text
                      as="em"
                      style={{
                        color: "var(--story-italic)",
                        fontStyle: "italic",
                      }}
                    >
                      she whispers softly, tracing the worn leather edge of the
                      parchment.
                    </Text>
                  </Text>
                  <Text as="p" size="sm" style={{ color: "var(--story-text)" }}>
                    <Text
                      as="strong"
                      weight="bold"
                      style={{ color: "var(--story-emphasis)" }}
                    >
                      The ancient loom hums
                    </Text>{" "}
                    with subtle resonance as you step forward.
                  </Text>
                  <Card
                    as="blockquote"
                    variant="panel"
                    padding="xs"
                    style={{
                      margin: 0,
                      borderLeft:
                        "3px solid var(--story-blockquote-border, var(--accent-base))",
                      background: "var(--story-blockquote-bg, var(--bg-panel))",
                      color:
                        "var(--story-blockquote-text, var(--text-secondary))",
                      fontStyle: "italic",
                    }}
                  >
                    <Text as="span" size="xs">
                      &ldquo;Every thread remembers the hand that spun
                      it.&rdquo;
                    </Text>
                  </Card>
                </Stack>
              </Stack>
            </Card>

            {/* User Response Preview */}
            <Card
              variant="elevated"
              padding="sm"
              style={{
                background: "var(--chat-user-bg)",
                borderColor: "var(--chat-user-border)",
                color: "var(--chat-user-text)",
              }}
            >
              <Stack direction="column" align="stretch" gap="2xs">
                <Stack direction="row" align="center" gap="xs">
                  <AvatarBadge icon="User" name="You" size="sm" />
                  <Text as="strong" size="sm" weight="semibold" tone="primary">
                    You
                  </Text>
                </Stack>
                <Text as="p" size="sm" style={{ color: "var(--story-text)" }}>
                  <Text
                    as="span"
                    weight="semibold"
                    style={{ color: "var(--story-quote)" }}
                  >
                    &ldquo;Show me the records of the latest chapter.&rdquo;
                  </Text>
                </Text>
              </Stack>
            </Card>

            <Separator spacing="none" />

            {/* Accent Button Preview */}
            <Stack direction="row" align="center" gap="xs" wrap>
              <Button type="button" variant="primary" size="sm" leftIcon="Send">
                Primary Action
              </Button>
              <Button type="button" variant="secondary" size="sm">
                Neutral Button
              </Button>
            </Stack>
          </Stack>
        </Card>
      </Stack>

      <Separator spacing="none" />

      {/* ── Theme Color Palette Showcase Section ── */}
      <Stack direction="column" align="stretch" gap="sm">
        <Header
          variant="section"
          icon="Layers"
          title="Theme Color Palette (Active Tokens)"
          badge={
            <Badge variant="neutral" size="xs">
              {totalShowcaseTokens} tokens
            </Badge>
          }
          subtitle={`Live reference of all ${totalShowcaseTokens} active theme tokens across status badges, brand accents, and roleplay surfaces.`}
        />

        <Stack direction="column" align="stretch" gap="md">
          {THEME_SHOWCASE_GROUPS.map((group) => (
            <Stack key={group.id} direction="column" align="stretch" gap="xs">
              <Header variant="section" icon={group.icon} title={group.title} />

              <FormGrid cols={2} gap="xs">
                {group.items.map((item) => (
                  <Card key={item.variable} variant="elevated" padding="sm">
                    <Stack
                      direction="column"
                      align="stretch"
                      justify="between"
                      gap="xs"
                      fullHeight
                    >
                      <Stack direction="column" align="stretch" gap="2xs">
                        <Stack
                          direction="row"
                          align="center"
                          justify="between"
                          gap="xs"
                          wrap
                        >
                          <Text
                            as="strong"
                            size="xs"
                            weight="semibold"
                            tone="primary"
                          >
                            {item.name}
                          </Text>
                          <Text as="code" mono size="xs" tone="muted">
                            {item.variable}
                          </Text>
                        </Stack>
                        <Text as="p" variant="caption" tone="secondary">
                          {item.desc}
                        </Text>
                      </Stack>

                      {item.preview === "pill" && (
                        <Stack direction="row" align="center" justify="start">
                          <Badge
                            variant="outline"
                            size="sm"
                            leftIcon={item.icon}
                            style={item.style}
                          >
                            {item.badgeText}
                          </Badge>
                        </Stack>
                      )}
                      {item.preview === "swatch" && (
                        <span
                          title={item.variable}
                          style={{
                            display: "block",
                            width: "100%",
                            height: "28px",
                            flexShrink: 0,
                            borderRadius: "6px",
                            border: "1.5px solid var(--border-light)",
                            boxShadow: "0 1px 4px rgba(0, 0, 0, 0.2)",
                            boxSizing: "border-box",
                            ...item.style,
                          }}
                        />
                      )}
                      {item.preview === "text" && (
                        <Card
                          variant="panel"
                          padding="xs"
                          style={{
                            background: "var(--chat-ai-bg)",
                            borderColor: "var(--border-subtle)",
                          }}
                        >
                          <Text as="span" size="sm" style={item.style}>
                            {item.badgeText}
                          </Text>
                        </Card>
                      )}
                      {item.preview === "input" && (
                        <input
                          type="text"
                          readOnly
                          value={item.badgeText ?? "Sample"}
                          aria-label={item.name}
                          style={{
                            fontSize: "0.78rem",
                            padding: "0.3rem 0.6rem",
                            borderRadius: "6px",
                            width: "100%",
                            boxSizing: "border-box",
                            cursor: "default",
                            outline: "none",
                            fontFamily: "inherit",
                            ...item.style,
                          }}
                        />
                      )}
                    </Stack>
                  </Card>
                ))}
              </FormGrid>
            </Stack>
          ))}
        </Stack>
      </Stack>
    </Stack>
  );
}

export default AppearanceSettingsPanel;
