import { useEffect, useState } from "react";
import type { AvatarShape, CoverAspect, CustomThemeColors, ThemeMode } from "../../../schemas";
import {
  applyAvatarShapeTheme,
  applyCoverAspect,
  applyTheme,
  getAppearanceSettings,
  THEME_PRESETS,
  updateAppearanceSettings,
  type ThemePreset
} from "../../api";
import { AvatarBadge, Icon, SwitchRow } from "../base";

const SHAPE_OPTIONS: Array<{
  id: AvatarShape;
  title: string;
  desc: string;
  badgePreviewShape: AvatarShape;
}> = [
  {
    id: "square",
    title: "Square",
    desc: "Crisp straight edges with minimal corner softening",
    badgePreviewShape: "square",
  },
  {
    id: "rounded",
    title: "Rounded Corner Square",
    desc: "Balanced modern rounded corners (Default)",
    badgePreviewShape: "rounded",
  },
  {
    id: "circle",
    title: "Circle",
    desc: "Smooth classic circular avatar badges",
    badgePreviewShape: "circle",
  },
];

/** The three cover frame shapes, in the order they are offered. Each previews its own ratio so
 *  the choice reads without knowing what "2:3" looks like. */
const ASPECT_OPTIONS: Array<{
  id: CoverAspect;
  title: string;
  desc: string;
}> = [
  {
    id: "landscape",
    title: "Landscape",
    desc: "16:9 — the widest banner; suits wide renders and keeps a long shelf compact (Default)",
  },
  {
    id: "square",
    title: "1:1 Square",
    desc: "Square — the shape most image models return, so nothing is cropped",
  },
  {
    id: "portrait",
    title: "Portrait",
    desc: "2:3 — tallest frame; suits character art",
  },
];

interface ThemeShowcaseItem {
  name: string;
  variable: string;
  desc: string;
  preview: "pill" | "swatch" | "text" | "input";
  badgeText?: string;
  icon?: string;
  style: React.CSSProperties;
}

interface ThemeShowcaseGroup {
  id: string;
  title: string;
  icon: string;
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

export function AppearanceSettingsPanel() {
  // Initial values are the shipped defaults: the server paints these tokens into the first frame and
  // the GET below fills the controls, so the device cache is gone (it desynced across devices).
  const [avatarShape, setAvatarShape] = useState<AvatarShape>("rounded");

  const [coverAspect, setCoverAspect] = useState<CoverAspect>("landscape");

  /** The play view's panel swipe. The panel is the switch's owner; the play view reads the same
   *  setting to decide whether the gesture exists. Nothing is cached locally — see the note on
   *  `AppearanceSettings.paneSwipeEnabled`. */
  const [paneSwipeEnabled, setPaneSwipeEnabled] = useState(true);

  const [themeMode, setThemeMode] = useState<ThemeMode>("dark");

  const [themePreset, setThemePreset] = useState<string>("default-dark");

  const [customColors, setCustomColors] = useState<CustomThemeColors>({});

  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  useEffect(() => {
    getAppearanceSettings()
      .then((res) => {
        if (res.avatarShape) {
          setAvatarShape(res.avatarShape);
          applyAvatarShapeTheme(res.avatarShape);
        }
        if (res.coverAspect) {
          setCoverAspect(res.coverAspect);
          applyCoverAspect(res.coverAspect);
        }
        if (res.themeMode) setThemeMode(res.themeMode);
        if (res.themePreset) setThemePreset(res.themePreset);
        if (res.customThemeColors) setCustomColors(res.customThemeColors);
        if (typeof res.paneSwipeEnabled === "boolean") setPaneSwipeEnabled(res.paneSwipeEnabled);

        applyTheme({
          themeMode: res.themeMode,
          themePreset: res.themePreset,
          customThemeColors: res.customThemeColors,
        });
      })
      .catch(() => {
        /* fallback to state defaults */
      });
  }, []);

  async function persistAppearance(updates: {
    avatarShape?: AvatarShape;
    coverAspect?: CoverAspect;
    themeMode?: ThemeMode;
    themePreset?: string;
    customThemeColors?: CustomThemeColors;
    paneSwipeEnabled?: boolean;
  }) {
    setSaving(true);
    setSaveStatus(null);
    try {
      await updateAppearanceSettings(updates);
      setSaveStatus("Saved");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch {
      setSaveStatus("Saved locally (server sync failed)");
      setTimeout(() => setSaveStatus(null), 3000);
    } finally {
      setSaving(false);
    }
  }

  function handleSelectShape(shape: AvatarShape) {
    setAvatarShape(shape);
    applyAvatarShapeTheme(shape);
    void persistAppearance({ avatarShape: shape });
  }

  function handleSelectAspect(aspect: CoverAspect) {
    setCoverAspect(aspect);
    applyCoverAspect(aspect);
    void persistAppearance({ coverAspect: aspect });
  }

  function handleTogglePaneSwipe(enabled: boolean) {
    setPaneSwipeEnabled(enabled);
    void persistAppearance({ paneSwipeEnabled: enabled });
  }

  function handleSelectMode(mode: ThemeMode) {
    setThemeMode(mode);
    const newPreset = mode === "light" && themePreset === "default-dark" ? "default-light" : themePreset;
    if (newPreset !== themePreset) setThemePreset(newPreset);
    applyTheme({
      themeMode: mode,
      themePreset: newPreset,
      customThemeColors: customColors,
    });
    void persistAppearance({ themeMode: mode, themePreset: newPreset });
  }

  function handleSelectPreset(preset: ThemePreset) {
    setThemePreset(preset.id);
    setThemeMode(preset.mode);
    // Clear conflicting custom colors on preset switch
    setCustomColors({});
    applyTheme({
      themeMode: preset.mode,
      themePreset: preset.id,
      customThemeColors: {},
    });
    void persistAppearance({
      themeMode: preset.mode,
      themePreset: preset.id,
      customThemeColors: {},
    });
  }



  return (
    <div className="appearance-settings-panel">
      {/* ── Theme Mode Section ── */}
      <div className="appearance-section-header">
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="SunMedium" size={17} />
            <span>Theme Mode</span>
          </h3>
          <p className="appearance-section-desc">
            Toggle between Dark, Light, or follow your System OS display settings.
          </p>
        </div>
        {saveStatus && <span className="appearance-save-status">{saveStatus}</span>}
      </div>

      <div className="theme-mode-segmented-bar">
        <button
          type="button"
          className={`theme-mode-btn ${themeMode === "dark" ? "active" : ""}`}
          onClick={() => handleSelectMode("dark")}
          disabled={saving}
        >
          <Icon name="Moon" size={15} />
          <span>Dark</span>
        </button>
        <button
          type="button"
          className={`theme-mode-btn ${themeMode === "light" ? "active" : ""}`}
          onClick={() => handleSelectMode("light")}
          disabled={saving}
        >
          <Icon name="Sun" size={15} />
          <span>Light</span>
        </button>
        <button
          type="button"
          className={`theme-mode-btn ${themeMode === "system" ? "active" : ""}`}
          onClick={() => handleSelectMode("system")}
          disabled={saving}
        >
          <Icon name="Monitor" size={15} />
          <span>System</span>
        </button>
      </div>

      {/* ── Theme Presets Section ── */}
      <div className="appearance-section-header" style={{ marginTop: "1.5rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Palette" size={17} />
            <span>Theme Presets</span>
          </h3>
          <p className="appearance-section-desc">
            Hand-crafted palettes calibrated for high contrast story reading and roleplay.
          </p>
        </div>
      </div>

      <div className="theme-presets-grid">
        {THEME_PRESETS.map((preset) => {
          const isSelected = themePreset === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={`preset-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => handleSelectPreset(preset)}
              disabled={saving}
            >
              <div className="preset-card-top">
                <strong className="preset-name">{preset.name}</strong>
                <span className="preset-badge">{preset.mode}</span>
              </div>
              <p className="preset-desc">{preset.description}</p>
            </button>
          );
        })}
      </div>

      {/* ── Theme Color Palette Showcase Section ── */}
      <div className="appearance-section-header" style={{ marginTop: "1.75rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Sliders" size={17} />
            <span>Theme Color Palette (Active Tokens)</span>
          </h3>
          <p className="appearance-section-desc">
            Live showcase of current theme tokens including default status colors, brand accents, and roleplay surfaces. These adapt in real time when switching Theme Modes or Presets.
          </p>
        </div>
      </div>

      <div className="theme-showcase-container">
        {THEME_SHOWCASE_GROUPS.map((group) => (
          <div key={group.id} className="theme-showcase-group">
            <div className="theme-showcase-group-header">
              <Icon name={group.icon} size={14} />
              <span>{group.title}</span>
            </div>

            <div className="theme-showcase-grid">
              {group.items.map((item) => (
                <div key={item.variable} className="theme-showcase-card">
                  <div className="theme-showcase-info">
                    <span className="theme-showcase-name">{item.name}</span>
                    <span className="theme-showcase-var">{item.variable}</span>
                    <span className="theme-showcase-desc">{item.desc}</span>
                  </div>

                  <div className="theme-showcase-preview-wrap">
                    {item.preview === "pill" && (
                      <span className="theme-showcase-preview-pill" style={item.style}>
                        {item.icon && <Icon name={item.icon} size={13} />}
                        <span>{item.badgeText}</span>
                      </span>
                    )}
                    {item.preview === "swatch" && (
                      <div className="theme-showcase-swatch" style={item.style} title={item.variable} />
                    )}
                    {item.preview === "text" && (
                      <span className="theme-showcase-text-sample" style={item.style}>
                        {item.badgeText}
                      </span>
                    )}
                    {item.preview === "input" && (
                      <input
                        type="text"
                        readOnly
                        value={item.badgeText ?? "Sample"}
                        className="theme-showcase-input-sample"
                        style={item.style}
                      />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {/* ── Avatar Badge Shape Section ── */}
      <div className="appearance-section-header" style={{ marginTop: "1.75rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Sparkles" size={17} />
            <span>Avatar Badge Shape</span>
          </h3>
          <p className="appearance-section-desc">
            Choose the shape for entity identity badges across the Player tab, Main Cast compact roster, Background NPCs, and Persona selectors.
          </p>
        </div>
      </div>

      <div className="avatar-shape-selector-grid">
        {SHAPE_OPTIONS.map((opt) => {
          const isSelected = avatarShape === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`shape-option-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => void handleSelectShape(opt.id)}
              disabled={saving}
            >
              <div className="shape-card-top">
                <div className="shape-card-preview">
                  <AvatarBadge
                    name="Mira"
                    size="lg"
                    shape={opt.badgePreviewShape}
                    className="shape-demo-avatar"
                  />
                </div>
                <div className="shape-radio-indicator">
                  <span className={`radio-dot ${isSelected ? "checked" : ""}`} />
                </div>
              </div>

              <div className="shape-card-body">
                <strong className="shape-title">{opt.title}</strong>
                <p className="shape-desc">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Cover Art Section ── */}
      <div className="appearance-section-header" style={{ marginTop: "1.75rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="Image" size={17} />
            <span>Cover Art</span>
          </h3>
          <p className="appearance-section-desc">
            Choose the shape of every cover on the playthrough shelf. A cover fills its frame, so
            picking the shape that matches the images your stories produce crops the least.
          </p>
        </div>
      </div>

      <div className="avatar-shape-selector-grid">
        {ASPECT_OPTIONS.map((opt) => {
          const isSelected = coverAspect === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              className={`shape-option-card ${isSelected ? "is-selected" : ""}`}
              onClick={() => handleSelectAspect(opt.id)}
              disabled={saving}
            >
              <div className="shape-card-top">
                <div className="shape-card-preview">
                  <span className="cover-aspect-preview" data-aspect={opt.id} />
                </div>
                <div className="shape-radio-indicator">
                  <span className={`radio-dot ${isSelected ? "checked" : ""}`} />
                </div>
              </div>

              <div className="shape-card-body">
                <strong className="shape-title">{opt.title}</strong>
                <p className="shape-desc">{opt.desc}</p>
              </div>
            </button>
          );
        })}
      </div>

      {/* ── Mobile Panels Section ──
          Offered only where the single-panel layout exists: above the app's breakpoint every panel is
          already on screen and the tab bar is gone, so the row is hidden by CSS rather than rendered
          conditionally — the panel keeps one markup path. */}
      <div className="appearance-section-header pane-swipe-setting" style={{ marginTop: "1.75rem" }}>
        <div>
          <h3 className="appearance-section-title flex items-center gap-2">
            <Icon name="MoveHorizontal" size={17} />
            <span>Mobile Panels</span>
          </h3>
          <p className="appearance-section-desc">
            How the play view moves between Scene, Chat and Info on a narrow screen.
          </p>
        </div>
      </div>

      <div className="pane-swipe-setting" style={{ marginBottom: "0.5rem" }}>
        <SwitchRow
          icon="MoveHorizontal"
          title="Swipe Between Panels"
          description="Drag horizontally to move between the panels. The bottom tab bar always works; turn this off if a scroll that drifts sideways keeps pulling a panel with it."
          checked={paneSwipeEnabled}
          onChange={(e) => handleTogglePaneSwipe(e.target.checked)}
          disabled={saving}
        />
      </div>

      {/* ── Live Interactive Story & UI Preview ── */}
      <div className="appearance-live-preview-box" style={{ marginTop: "1.75rem" }}>
        <div className="preview-box-header">
          <Icon name="Eye" size={14} />
          <span>Live Theme &amp; Typography Preview</span>
          <span className="preview-active-shape-tag">Mode: {themeMode}</span>
        </div>

        {/* Story Message Mockups */}
        <div className="preview-chat-container">
          {/* AI Response Preview */}
          <div className="preview-message-bubble preview-ai-bubble">
            <div className="preview-msg-header">
              <AvatarBadge name="Mira" size="sm" />
              <strong>Mira Vane</strong>
              <span className="preview-badge-role">AI</span>
            </div>
            <div className="preview-msg-body">
              <p>
                <span className="quote-text">"Welcome back to the BobbinLoom archives,"</span>{" "}
                <em>she whispers softly, tracing the worn leather edge of the parchment.</em>
              </p>
              <p>
                <strong>The ancient loom hums</strong> with subtle resonance as you step forward.
              </p>
            </div>
          </div>

          {/* User Response Preview */}
          <div className="preview-message-bubble preview-user-bubble">
            <div className="preview-msg-header">
              <AvatarBadge icon="User" name="You" size="sm" />
              <strong>You</strong>
            </div>
            <div className="preview-msg-body">
              <p>
                <span className="quote-text">"Show me the records of the latest chapter."</span>
              </p>
            </div>
          </div>

          {/* Accent Button Preview */}
          <div className="preview-interactive-row">
            <button type="button" className="primary-btn flex items-center gap-1.5" style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem" }}>
              <Icon name="Send" size={13} />
              <span>Primary Action</span>
            </button>
            <button type="button" style={{ fontSize: "0.82rem", padding: "0.35rem 0.75rem" }}>
              Neutral Button
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

