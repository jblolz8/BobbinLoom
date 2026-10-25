/**
 * The theme compiler: presets, the custom-property resolution they feed, and the two shape values that
 * ride along with them.
 *
 * Shared, not client-only, because the FIRST FRAME is painted by the server (see
 * `src/server/themeFirstPaint.ts`): `index.html` arrives with the reader's tokens already in it, so the
 * app no longer has to guess a theme from a device cache and correct it after the fetch. Both callers
 * resolve through the functions below, which is what keeps the painted frame and the hydrated frame
 * identical — a difference between them is worse than the flash this replaced.
 */
import type { AvatarShape, CoverAspect, CustomThemeColors, ThemeMode } from "../schemas";

export interface ThemePreset {
  id: string;
  name: string;
  description: string;
  mode: ThemeMode;
  /** Paired opposite-mode preset id (Dark <-> Light counterpart). */
  counterpartId?: string;
  colors: Record<string, string>;
}

export const THEME_PRESETS: ThemePreset[] = [
  // Pair 1: Bobbin Classic Dark <-> Studio Light
  {
    id: "default-dark",
    name: "Bobbin Classic Dark",
    description: "The signature sleek dark slate roleplay theme",
    mode: "dark",
    counterpartId: "default-light",
    colors: {
      "--text-primary": "#eceff4",
      "--story-text": "#e4eaf2",
      "--story-emphasis": "#bcd8ff",
      "--story-quote": "#e5be73",
      "--story-italic": "#b4c3d8",
      "--story-blockquote-border": "#e5be73",
      "--story-blockquote-bg": "rgba(229, 190, 115, 0.06)",
      "--story-blockquote-text": "#b4c3d8",
      "--chat-ai-text": "#e4eaf2",
      "--chat-user-text": "#e4eaf2",
    },
  },
  {
    id: "default-light",
    name: "Studio Light",
    description: "Clean, high-contrast light mode for daytime reading",
    mode: "light",
    counterpartId: "default-dark",
    colors: {
      "--bg-app": "#eef2f6",
      "--bg-panel": "#f8fafc",
      "--bg-surface-elevated": "#ffffff",
      "--bg-surface-hover": "#e2e8f0",
      "--text-primary": "#0f172a",
      "--story-text": "#1e293b",
      "--story-emphasis": "#163f73",
      "--story-quote": "#b45309",
      "--story-italic": "#4a5d78",
      "--story-blockquote-border": "#d97706",
      "--story-blockquote-bg": "rgba(245, 158, 11, 0.08)",
      "--story-blockquote-text": "#334155",
      "--chat-ai-bg": "#ffffff",
      "--chat-ai-border": "#e2e8f0",
      "--chat-ai-text": "#1e293b",
      "--chat-user-bg": "#e6effa",
      "--chat-user-border": "#bdd4f2",
      "--chat-user-text": "#1e293b",
    },
  },
  // Pair 2: Nord Frost <-> Polar Mist
  {
    id: "nord-frost",
    name: "Nord Frost",
    description: "Arctic, north-bluish palette with soft contrast",
    mode: "dark",
    counterpartId: "polar-mist",
    colors: {
      "--bg-app": "#2e3440",
      "--bg-panel": "#3b4252",
      "--bg-surface-elevated": "#434c5e",
      "--bg-surface-hover": "#4c566a",
      "--border-main": "#4c566a",
      "--border-subtle": "#3b4252",
      "--border-light": "#4c566a",
      "--border-focus": "#88c0d0",
      "--text-primary": "#eceff4",
      "--text-secondary": "#d8dee9",
      "--text-muted": "#aeb7c4",
      "--accent-base": "#4b6e96",
      "--accent-hover": "#5e81ac",
      "--accent-active": "#3f5d80",
      "--accent-highlight": "#88c0d0",
      "--accent-translucent": "rgba(136, 192, 208, 0.16)",
      "--chat-user-bg": "#3f4d63",
      "--chat-user-border": "#526480",
      "--chat-user-text": "#e3ecf2",
      "--chat-ai-bg": "#3b4252",
      "--chat-ai-border": "#434c5e",
      "--chat-ai-text": "#e3ecf2",
      "--story-text": "#e3ecf2",
      "--story-emphasis": "#b8e4f0",
      "--story-quote": "#ebcb8b",
      "--story-italic": "#adc2d1",
      "--story-blockquote-border": "#ebcb8b",
      "--story-blockquote-bg": "rgba(235, 203, 139, 0.08)",
      "--story-blockquote-text": "#c8d5e0",
      "--chat-system-bg": "#353c4a",
      "--chat-system-border": "#4c566a",
      "--chat-system-text": "#d8dee9",
      "--timeline-node-bg": "#353c4a",
      "--timeline-node-border": "#4c566a",
      "--timeline-node-active-bg": "#2e3440",
      "--timeline-node-active-border": "#88c0d0",
      "--timeline-node-active-glow": "rgba(136, 192, 208, 0.28)",
      "--ai-accent": "#b48ead",
      "--ai-accent-hover": "#d8dee9",
      "--ai-accent-translucent": "rgba(180, 142, 173, 0.18)",
      "--ai-bubble-bg": "#2e3440",
      "--ai-bubble-border": "#4c566a",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#4c566a",
      "--scrollbar-thumb-hover": "#88c0d0",
      "--scrollbar-thumb-active": "#81a1c1",
      "--btn-warning-bg": "#393328",
      "--btn-warning-border": "#6e5d3c",
      "--btn-warning-text": "#ebcb8b",
      "--btn-warning-hover": "#474032",
      "--input-bg": "#2e3440",
      "--input-filled-bg": "#353c4a",
      "--input-border": "#4c566a",
      "--input-text": "#eceff4",
      "--input-placeholder": "#768296",
      "--input-focus-border": "#88c0d0",
      "--input-focus-ring": "rgba(136, 192, 208, 0.25)",
    },
  },
  {
    id: "polar-mist",
    name: "Polar Mist",
    description: "Crisp glacial light paper with razor-sharp arctic fjord accents",
    mode: "light",
    counterpartId: "nord-frost",
    colors: {
      "--bg-app": "#eaf0f6",
      "--bg-panel": "#f4f8fb",
      "--bg-surface-elevated": "#ffffff",
      "--bg-surface-hover": "#e2ebf3",
      "--border-main": "#cbd5e1",
      "--border-subtle": "#e2e8f0",
      "--border-light": "#94a3b8",
      "--border-focus": "#0284c7",
      "--text-primary": "#0f172a",
      "--text-secondary": "#475569",
      "--text-muted": "#64748b",
      "--accent-base": "#0284c7",
      "--accent-hover": "#0369a1",
      "--accent-active": "#075985",
      "--accent-highlight": "#0284c7",
      "--accent-translucent": "rgba(2, 132, 199, 0.12)",
      "--chat-user-bg": "#e0f2fe",
      "--chat-user-border": "#bae6fd",
      "--chat-user-text": "#082f49",
      "--chat-ai-bg": "#ffffff",
      "--chat-ai-border": "#e2e8f0",
      "--chat-ai-text": "#182836",
      "--story-text": "#182836",
      "--story-emphasis": "#0b4f6c",
      "--story-quote": "#a35908",
      "--story-italic": "#436178",
      "--story-blockquote-border": "#0284c7",
      "--story-blockquote-bg": "rgba(2, 132, 199, 0.08)",
      "--story-blockquote-text": "#334155",
      "--chat-system-bg": "#e9eff6",
      "--chat-system-border": "#cbd5e1",
      "--chat-system-text": "#475569",
      "--timeline-node-bg": "#ffffff",
      "--timeline-node-border": "#cbd5e1",
      "--timeline-node-active-bg": "#e0f2fe",
      "--timeline-node-active-border": "#0284c7",
      "--timeline-node-active-glow": "rgba(2, 132, 199, 0.25)",
      "--ai-accent": "#6366f1",
      "--ai-accent-hover": "#4f46e5",
      "--ai-accent-translucent": "rgba(99, 102, 241, 0.12)",
      "--ai-bubble-bg": "#f5f7ff",
      "--ai-bubble-border": "#c7d2fe",
      "--ai-bubble-text": "#1e1b4b",
      "--input-bg": "#ffffff",
      "--input-filled-bg": "#f0f4f8",
      "--input-border": "#cbd5e1",
      "--input-text": "#0f172a",
      "--input-placeholder": "#94a3b8",
      "--input-focus-border": "#0284c7",
      "--input-focus-ring": "rgba(2, 132, 199, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(220, 38, 38, 0.1)",
      "--status-danger-border": "rgba(220, 38, 38, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(22, 163, 74, 0.12)",
      "--status-success-border": "rgba(22, 163, 74, 0.3)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(217, 119, 6, 0.12)",
      "--status-warning-border": "rgba(217, 119, 6, 0.3)",
      "--btn-danger-bg": "#fee2e2",
      "--btn-danger-border": "#fca5a5",
      "--btn-danger-text": "#991b1b",
      "--btn-danger-hover": "#fecaca",
      "--btn-warning-bg": "#fef3c7",
      "--btn-warning-border": "#fcd34d",
      "--btn-warning-text": "#92400e",
      "--btn-warning-hover": "#fde68a",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#cbd5e1",
      "--scrollbar-thumb-hover": "#0284c7",
      "--scrollbar-thumb-active": "#0369a1",
      "--code-inline-bg": "#e2e8f0",
      "--code-inline-border": "#cbd5e1",
      // accent-base on its own inline chip measures 3.3:1 — too low for code.
      "--code-inline-text": "#0369a1",
    },
  },
  // Pair 3: Amber Hearth <-> Warm Parchment
  {
    id: "amber-hearth",
    name: "Amber Hearth",
    description: "Cozy candlelit espresso slate with glowing honey amber accents",
    mode: "dark",
    counterpartId: "warm-parchment",
    colors: {
      "--bg-app": "#13110e",
      "--bg-panel": "#1b1713",
      "--bg-surface-elevated": "#241f1a",
      "--bg-surface-hover": "#2f2821",
      "--border-main": "#3b3228",
      "--border-subtle": "#2c251e",
      "--border-light": "#4b3f32",
      "--border-focus": "#d97706",
      "--text-primary": "#f5ebe0",
      "--text-secondary": "#d5c3a5",
      "--text-muted": "#a6957c",
      "--accent-base": "#b45309",
      "--accent-hover": "#d97706",
      "--accent-active": "#92400e",
      "--accent-highlight": "#f59e0b",
      "--accent-translucent": "rgba(217, 119, 6, 0.16)",
      "--chat-user-bg": "#2b2218",
      "--chat-user-border": "#443625",
      "--chat-user-text": "#f5ebe0",
      "--chat-ai-bg": "#221d17",
      "--chat-ai-border": "#342b20",
      "--chat-ai-text": "#f5ebe0",
      "--story-text": "#f5ebe0",
      "--story-emphasis": "#ffd6a5",
      "--story-quote": "#f5b851",
      "--story-italic": "#d6c1ab",
      "--story-blockquote-border": "#f59e0b",
      "--story-blockquote-bg": "rgba(245, 158, 11, 0.08)",
      "--story-blockquote-text": "#d6c1ab",
      "--chat-system-bg": "#171410",
      "--chat-system-border": "#3b3228",
      "--chat-system-text": "#d5c3a5",
      "--timeline-node-bg": "#1b1713",
      "--timeline-node-border": "#3b3228",
      "--timeline-node-active-bg": "#241f1a",
      "--timeline-node-active-border": "#f59e0b",
      "--timeline-node-active-glow": "rgba(245, 158, 11, 0.28)",
      "--ai-accent": "#f97316",
      "--ai-accent-hover": "#fb923c",
      "--ai-accent-translucent": "rgba(249, 115, 22, 0.16)",
      "--ai-bubble-bg": "#251c14",
      "--ai-bubble-border": "#4d3722",
      "--ai-bubble-text": "#f5ebe0",
      "--input-bg": "#15120f",
      "--input-filled-bg": "#1d1914",
      "--input-border": "#3b3228",
      "--input-text": "#f5ebe0",
      "--input-placeholder": "#7a6c58",
      "--input-focus-border": "#d97706",
      "--input-focus-ring": "rgba(217, 119, 6, 0.25)",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#3b3228",
      "--scrollbar-thumb-hover": "#d97706",
      "--scrollbar-thumb-active": "#f59e0b",
      "--btn-warning-bg": "#31230e",
      "--btn-warning-border": "#694b1a",
      "--btn-warning-text": "#f5b851",
      "--btn-warning-hover": "#402e12",
      "--code-inline-bg": "rgba(19, 17, 14, 0.8)",
      "--code-inline-border": "#3b3228",
      "--code-inline-text": "#f59e0b",
    },
  },
  {
    id: "warm-parchment",
    name: "Warm Parchment",
    description: "Soft sepia book aesthetic that goes easy on the eyes",
    mode: "light",
    counterpartId: "amber-hearth",
    colors: {
      "--bg-app": "#ede3d5",
      "--bg-panel": "#f6efe5",
      "--bg-surface-elevated": "#fcf9f4",
      "--bg-surface-hover": "#e6dac9",
      "--border-main": "#d8ccbe",
      "--border-subtle": "#e6ded4",
      "--border-light": "#cbbdac",
      "--border-focus": "#965938",
      "--text-primary": "#2d221b",
      "--text-secondary": "#635347",
      "--text-muted": "#8a7565",
      "--chat-user-bg": "#eadbc8",
      "--chat-user-border": "#d5c0a7",
      "--chat-user-text": "#2d221b",
      "--chat-ai-bg": "#fcf9f4",
      "--chat-ai-border": "#e3dacf",
      "--chat-ai-text": "#2d221b",
      "--story-text": "#2d221b",
      "--story-emphasis": "#6e260e",
      "--story-quote": "#a84b08",
      "--story-italic": "#695242",
      "--story-blockquote-border": "#965938",
      "--story-blockquote-bg": "rgba(150, 89, 56, 0.08)",
      "--story-blockquote-text": "#695242",
      "--chat-system-bg": "#efe6d8",
      "--chat-system-border": "#d8ccbe",
      "--chat-system-text": "#635347",
      "--timeline-node-bg": "#fcf9f4",
      "--timeline-node-border": "#d8ccbe",
      "--timeline-node-active-bg": "#f6efe5",
      "--timeline-node-active-border": "#965938",
      "--timeline-node-active-glow": "rgba(150, 89, 56, 0.22)",
      "--accent-base": "#965938",
      "--accent-hover": "#7c4424",
      "--accent-active": "#663619",
      "--accent-highlight": "#965938",
      "--accent-translucent": "rgba(150, 89, 56, 0.14)",
      "--ai-accent": "#b45309",
      "--ai-accent-hover": "#92400e",
      "--ai-accent-active": "#78350f",
      "--ai-accent-translucent": "rgba(180, 83, 9, 0.14)",
      "--ai-bubble-bg": "#fbf3e6",
      "--ai-bubble-border": "#e8cfa8",
      "--ai-bubble-text": "#2d221b",
      "--input-bg": "#fcf9f4",
      "--input-filled-bg": "#f2e9dc",
      "--input-border": "#d8ccbe",
      "--input-text": "#2d221b",
      "--input-placeholder": "#8c7a6b",
      "--input-focus-border": "#965938",
      "--input-focus-ring": "rgba(150, 89, 56, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(185, 28, 28, 0.1)",
      "--status-danger-border": "rgba(185, 28, 28, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(21, 128, 61, 0.1)",
      "--status-success-border": "rgba(21, 128, 61, 0.28)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(180, 83, 9, 0.12)",
      "--status-warning-border": "rgba(180, 83, 9, 0.3)",
      "--btn-danger-bg": "#fdf0ef",
      "--btn-danger-border": "#f3b7b2",
      "--btn-danger-text": "#9b1c1c",
      "--btn-danger-hover": "#fce2e0",
      "--btn-warning-bg": "#fcf4e8",
      "--btn-warning-border": "#f0cf9e",
      "--btn-warning-text": "#854d0e",
      "--btn-warning-hover": "#f7e8cf",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#cbbdac",
      "--scrollbar-thumb-hover": "#965938",
      "--scrollbar-thumb-active": "#7c4424",
      "--code-inline-bg": "#ede3d5",
      "--code-inline-border": "#d8ccbe",
      "--code-inline-text": "#7c4424",
    },
  },
  // Pair 4: Emerald Archive <-> Matcha & Cream
  {
    id: "emerald-archive",
    name: "Emerald Archive",
    description: "Phosphor-green CRT terminal slate with luminous matrix accents",
    mode: "dark",
    counterpartId: "matcha-cream",
    colors: {
      "--bg-app": "#080f0a",
      "--bg-panel": "#0d1710",
      "--bg-surface-elevated": "#122117",
      "--bg-surface-hover": "#192d1f",
      "--border-main": "#203a28",
      "--border-subtle": "#172a1d",
      "--border-light": "#2c5037",
      "--border-focus": "#22c55e",
      "--text-primary": "#d9f7e0",
      "--text-secondary": "#94bfa0",
      "--text-muted": "#648c70",
      "--accent-base": "#15803d",
      "--accent-hover": "#16a34a",
      "--accent-active": "#166534",
      "--accent-highlight": "#4ade80",
      "--accent-translucent": "rgba(74, 222, 128, 0.16)",
      "--chat-user-bg": "#152a1d",
      "--chat-user-border": "#254932",
      "--chat-user-text": "#d9f7e0",
      "--chat-ai-bg": "#122117",
      "--chat-ai-border": "#1f3827",
      "--chat-ai-text": "#d9f7e0",
      "--story-text": "#d9f7e0",
      "--story-emphasis": "#86efac",
      "--story-quote": "#bef264",
      "--story-italic": "#8fb99a",
      "--story-blockquote-border": "#4ade80",
      "--story-blockquote-bg": "rgba(74, 222, 128, 0.08)",
      "--story-blockquote-text": "#94bfa0",
      "--chat-system-bg": "#0b140e",
      "--chat-system-border": "#203a28",
      "--chat-system-text": "#94bfa0",
      "--timeline-node-bg": "#0d1710",
      "--timeline-node-border": "#203a28",
      "--timeline-node-active-bg": "#122117",
      "--timeline-node-active-border": "#4ade80",
      "--timeline-node-active-glow": "rgba(74, 222, 128, 0.28)",
      "--ai-accent": "#22c55e",
      "--ai-accent-hover": "#4ade80",
      "--ai-accent-translucent": "rgba(52, 211, 153, 0.16)",
      "--ai-bubble-bg": "#0f2216",
      "--ai-bubble-border": "#1f472e",
      "--ai-bubble-text": "#d9f7e0",
      "--input-bg": "#0a130d",
      "--input-filled-bg": "#101d14",
      "--input-border": "#203a28",
      "--input-text": "#d9f7e0",
      "--input-placeholder": "#4f735a",
      "--input-focus-border": "#22c55e",
      "--input-focus-ring": "rgba(34, 197, 94, 0.25)",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#203a28",
      "--scrollbar-thumb-hover": "#16a34a",
      "--scrollbar-thumb-active": "#4ade80",
      "--btn-warning-bg": "#242810",
      "--btn-warning-border": "#525e1e",
      "--btn-warning-text": "#bef264",
      "--btn-warning-hover": "#303615",
      "--code-inline-bg": "rgba(8, 15, 10, 0.85)",
      "--code-inline-border": "#203a28",
      "--code-inline-text": "#4ade80",
    },
  },
  {
    id: "matcha-cream",
    name: "Matcha & Cream",
    description: "Warm steamed cream paper with ceremonial matcha and roasted hojicha accents",
    mode: "light",
    counterpartId: "emerald-archive",
    colors: {
      "--bg-app": "#ebf0e6",
      "--bg-panel": "#f5f7f0",
      "--bg-surface-elevated": "#fcfcf7",
      "--bg-surface-hover": "#e2eadc",
      "--border-main": "#c7d4c2",
      "--border-subtle": "#dbe3d6",
      "--border-light": "#b2c3ac",
      "--border-focus": "#356848",
      "--text-primary": "#1c281e",
      "--text-secondary": "#425947",
      "--text-muted": "#6a826f",
      "--accent-base": "#356848",
      "--accent-hover": "#285238",
      "--accent-active": "#1c3b28",
      "--accent-highlight": "#356848",
      "--accent-translucent": "rgba(53, 104, 72, 0.14)",
      "--chat-user-bg": "#dfead8",
      "--chat-user-border": "#bfd1b4",
      "--chat-user-text": "#1c281e",
      "--chat-ai-bg": "#fcfcf7",
      "--chat-ai-border": "#d2ded0",
      "--chat-ai-text": "#1c281e",
      "--story-text": "#1c281e",
      "--story-emphasis": "#1b4d2e",
      "--story-quote": "#9c4a24",
      "--story-italic": "#4d6653",
      "--story-blockquote-border": "#356848",
      "--story-blockquote-bg": "rgba(53, 104, 72, 0.08)",
      "--story-blockquote-text": "#425947",
      "--chat-system-bg": "#e4ece0",
      "--chat-system-border": "#c7d4c2",
      "--chat-system-text": "#425947",
      "--timeline-node-bg": "#fcfcf7",
      "--timeline-node-border": "#c7d4c2",
      "--timeline-node-active-bg": "#dfead8",
      "--timeline-node-active-border": "#356848",
      "--timeline-node-active-glow": "rgba(53, 104, 72, 0.22)",
      "--ai-accent": "#8c3b52",
      "--ai-accent-hover": "#732d41",
      "--ai-accent-active": "#5c2233",
      "--ai-accent-translucent": "rgba(140, 59, 82, 0.14)",
      "--ai-bubble-bg": "#faf2f4",
      "--ai-bubble-border": "#e2c6ce",
      "--ai-bubble-text": "#2b161d",
      "--input-bg": "#fcfcf7",
      "--input-filled-bg": "#ebf0e6",
      "--input-border": "#c7d4c2",
      "--input-text": "#1c281e",
      "--input-placeholder": "#78917d",
      "--input-focus-border": "#356848",
      "--input-focus-ring": "rgba(53, 104, 72, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(185, 28, 28, 0.1)",
      "--status-danger-border": "rgba(185, 28, 28, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(21, 128, 61, 0.1)",
      "--status-success-border": "rgba(21, 128, 61, 0.28)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(180, 83, 9, 0.12)",
      "--status-warning-border": "rgba(180, 83, 9, 0.3)",
      "--btn-danger-bg": "#fdf0ef",
      "--btn-danger-border": "#f3b7b2",
      "--btn-danger-text": "#9b1c1c",
      "--btn-danger-hover": "#fce2e0",
      "--btn-warning-bg": "#fcf4e8",
      "--btn-warning-border": "#f0cf9e",
      "--btn-warning-text": "#854d0e",
      "--btn-warning-hover": "#f7e8cf",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#b2c3ac",
      "--scrollbar-thumb-hover": "#356848",
      "--scrollbar-thumb-active": "#285238",
      "--code-inline-bg": "#e4ece0",
      "--code-inline-border": "#c7d4c2",
      "--code-inline-text": "#285238",
    },
  },
  // Pair 5: Midnight Violet <-> Sakura Blossom
  {
    id: "midnight-purple",
    name: "Midnight Violet",
    description: "Deep amethyst night theme with glowing accents",
    mode: "dark",
    counterpartId: "sakura-blossom",
    colors: {
      "--bg-app": "#0e0d16",
      "--bg-panel": "#171524",
      "--bg-surface-elevated": "#221e35",
      "--bg-surface-hover": "#2c2742",
      "--border-main": "#312a4c",
      "--border-subtle": "#25203b",
      "--border-light": "#3d345f",
      "--border-focus": "#9353d3",
      "--text-primary": "#f1ecf9",
      "--text-secondary": "#d4c5e9",
      "--text-muted": "#a092b8",
      "--accent-base": "#7c3aed",
      "--accent-hover": "#8b5cf6",
      "--accent-active": "#6d28d9",
      "--accent-highlight": "#c084fc",
      "--accent-translucent": "rgba(147, 83, 211, 0.18)",
      "--chat-user-bg": "#1e1b4b",
      "--chat-user-border": "#3f2e6b",
      "--chat-user-text": "#f1ecf9",
      "--chat-ai-bg": "#201c32",
      "--chat-ai-border": "#2d2746",
      "--chat-ai-text": "#f1ecf9",
      "--story-text": "#f1ecf9",
      "--story-emphasis": "#f0c4ff",
      "--story-quote": "#f3be8a",
      "--story-italic": "#c7b6e0",
      "--story-blockquote-border": "#c084fc",
      "--story-blockquote-bg": "rgba(192, 132, 252, 0.09)",
      "--story-blockquote-text": "#c7b6e0",
      "--chat-system-bg": "#151322",
      "--chat-system-border": "#312a4c",
      "--chat-system-text": "#a092b8",
      "--timeline-node-bg": "#171524",
      "--timeline-node-border": "#312a4c",
      "--timeline-node-active-bg": "#221e35",
      "--timeline-node-active-border": "#c084fc",
      "--timeline-node-active-glow": "rgba(192, 132, 252, 0.3)",
      "--ai-accent": "#c084fc",
      "--ai-accent-translucent": "rgba(192, 132, 252, 0.18)",
      "--ai-bubble-bg": "#1e1932",
      "--ai-bubble-border": "#413763",
      "--ai-bubble-text": "#f1ecf9",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#312a4c",
      "--scrollbar-thumb-hover": "#7c3aed",
      "--scrollbar-thumb-active": "#8b5cf6",
      "--btn-warning-bg": "#2e2014",
      "--btn-warning-border": "#684820",
      "--btn-warning-text": "#f3be8a",
      "--btn-warning-hover": "#3d2b1b",
      "--input-bg": "#151322",
      "--input-filled-bg": "#1a1728",
      "--input-border": "#312a4c",
      "--input-text": "#f1ecf9",
      "--input-placeholder": "#6b6285",
      "--input-focus-border": "#9353d3",
      "--input-focus-ring": "rgba(147, 83, 211, 0.25)",
    },
  },
  {
    id: "sakura-blossom",
    name: "Sakura Blossom",
    description: "Soft cherry-blossom paper with rosewood & orchid accents",
    mode: "light",
    counterpartId: "midnight-purple",
    colors: {
      "--bg-app": "#f5e8ee",
      "--bg-panel": "#faf2f6",
      "--bg-surface-elevated": "#fffbfd",
      "--bg-surface-hover": "#eedbe4",
      "--border-main": "#dfc6d2",
      "--border-subtle": "#ead9e1",
      "--border-light": "#cfb0bf",
      "--border-focus": "#be185d",
      "--text-primary": "#2a1220",
      "--text-secondary": "#5e364c",
      "--text-muted": "#875b73",
      "--accent-base": "#be185d",
      "--accent-hover": "#9d174d",
      "--accent-active": "#831843",
      "--accent-highlight": "#be185d",
      "--accent-translucent": "rgba(190, 24, 93, 0.12)",
      "--chat-user-bg": "#f3dce6",
      "--chat-user-border": "#dfbccc",
      "--chat-user-text": "#2a1220",
      "--chat-ai-bg": "#fffbfd",
      "--chat-ai-border": "#e8d2dc",
      "--chat-ai-text": "#2a1220",
      "--story-text": "#2a1220",
      "--story-emphasis": "#691036",
      "--story-quote": "#9e3b24",
      "--story-italic": "#5e364c",
      "--story-blockquote-border": "#be185d",
      "--story-blockquote-bg": "rgba(190, 24, 93, 0.08)",
      "--story-blockquote-text": "#5e364c",
      "--chat-system-bg": "#f2e2ea",
      "--chat-system-border": "#dfc6d2",
      "--chat-system-text": "#5e364c",
      "--timeline-node-bg": "#fffbfd",
      "--timeline-node-border": "#dfc6d2",
      "--timeline-node-active-bg": "#f3dce6",
      "--timeline-node-active-border": "#be185d",
      "--timeline-node-active-glow": "rgba(190, 24, 93, 0.22)",
      "--ai-accent": "#9333ea",
      "--ai-accent-hover": "#7e22ce",
      "--ai-accent-translucent": "rgba(147, 51, 234, 0.12)",
      "--ai-bubble-bg": "#faf3ff",
      "--ai-bubble-border": "#e2ccf2",
      "--ai-bubble-text": "#2a1220",
      "--input-bg": "#fffbfd",
      "--input-filled-bg": "#f5e8ee",
      "--input-border": "#dfc6d2",
      "--input-text": "#2a1220",
      "--input-placeholder": "#966d83",
      "--input-focus-border": "#be185d",
      "--input-focus-ring": "rgba(190, 24, 93, 0.2)",
      "--status-danger": "#b91c1c",
      "--status-danger-bg": "rgba(185, 28, 28, 0.1)",
      "--status-danger-border": "rgba(185, 28, 28, 0.28)",
      "--status-success": "#15803d",
      "--status-success-bg": "rgba(21, 128, 61, 0.1)",
      "--status-success-border": "rgba(21, 128, 61, 0.28)",
      "--status-warning": "#b45309",
      "--status-warning-bg": "rgba(180, 83, 9, 0.12)",
      "--status-warning-border": "rgba(180, 83, 9, 0.3)",
      "--btn-danger-bg": "#fdf0ef",
      "--btn-danger-border": "#f3b7b2",
      "--btn-danger-text": "#9b1c1c",
      "--btn-danger-hover": "#fce2e0",
      "--btn-warning-bg": "#fcf4e8",
      "--btn-warning-border": "#f0cf9e",
      "--btn-warning-text": "#854d0e",
      "--btn-warning-hover": "#f7e8cf",
      "--scrollbar-track": "transparent",
      "--scrollbar-thumb": "#cfb0bf",
      "--scrollbar-thumb-hover": "#be185d",
      "--scrollbar-thumb-active": "#9d174d",
      "--code-inline-bg": "#f2e2ea",
      "--code-inline-border": "#dfc6d2",
      "--code-inline-text": "#9d174d",
    },
  },
];


const BASE_SCHEME_TOKENS: Record<"dark" | "light", Record<string, string>> = {
  dark: {
    "--bg-app": "#101216",
    "--bg-panel": "#151923",
    "--bg-surface-elevated": "#1c2230",
    "--bg-surface-hover": "#242d3f",
    "--border-subtle": "#232d3d",
    "--border-main": "#2a303d",
    "--border-light": "#3a4150",
    "--border-focus": "#3b69a8",
    "--text-primary": "#eceff4",
    "--text-secondary": "#8a93a5",
    "--text-muted": "#8092a5",
    "--accent-base": "#2b4b7b",
    "--accent-hover": "#345a8a",
    "--accent-highlight": "#5a8fd4",
    "--accent-translucent": "rgba(43, 75, 123, 0.2)",
    "--chat-ai-bg": "#1c2230",
    "--chat-ai-border": "#2a303d",
    "--story-text": "#e4eaf2",
    "--story-quote": "#e5be73",
    "--story-italic": "#b4c3d8",
    "--story-emphasis": "#bcd8ff",
  },
  light: {
    "--bg-app": "#eef2f6",
    "--bg-panel": "#f8fafc",
    "--bg-surface-elevated": "#ffffff",
    "--bg-surface-hover": "#e2e8f0",
    "--border-subtle": "#e2e8f0",
    "--border-main": "#cbd5e1",
    "--border-light": "#94a3b8",
    "--border-focus": "#3b82f6",
    "--text-primary": "#0f172a",
    "--text-secondary": "#475569",
    "--text-muted": "#64748b",
    "--accent-base": "#2563eb",
    "--accent-hover": "#1d4ed8",
    "--accent-highlight": "#2563eb",
    "--accent-translucent": "rgba(37, 99, 235, 0.12)",
    "--chat-ai-bg": "#ffffff",
    "--chat-ai-border": "#e2e8f0",
    "--story-text": "#1e293b",
    "--story-quote": "#b45309",
    "--story-italic": "#4a5d78",
    "--story-emphasis": "#163f73",
  },
};

/**
 * Self-contained custom-property map for a single preset card so the card
 * renders in its OWN theme (surfaces, borders, text, accent, and story tokens)
 * regardless of which theme is currently active on the page.
 */
export function presetCardTokens(preset: ThemePreset): Record<string, string> {
  const scheme = preset.mode === "light" ? "light" : "dark";
  return {
    ...BASE_SCHEME_TOKENS[scheme],
    ...themeTokens({ themePreset: preset.id }, scheme),
  };
}

/** The frame shape each setting means, in CSS `aspect-ratio` terms. */
export const COVER_ASPECT_VALUES: Record<CoverAspect, string> = {
  portrait: "2 / 3",
  square: "1 / 1",
  landscape: "16 / 9"
};

function hexToAlpha(hex: string, alpha: number): string {
  let clean = hex.trim().replace(/^#/, "");
  if (clean.length === 3) {
    clean = clean.split("").map((c) => c + c).join("");
  }
  if (clean.length !== 6) return `rgba(150, 89, 56, ${alpha})`;
  const r = parseInt(clean.slice(0, 2), 16);
  const g = parseInt(clean.slice(2, 4), 16);
  const b = parseInt(clean.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** The badge radius each avatar shape means. */
export function avatarBadgeRadius(shape: AvatarShape): string {
  return shape === "circle" ? "50%" : shape === "square" ? "2px" : "8px";
}

/**
 * Dark or light, resolved. `system` has no answer the SERVER can compute, which is why the caller passes
 * the preference in: the client asks `matchMedia`, and the server emits both schemes (the dark one as the
 * base, the light one inside `@media (prefers-color-scheme: light)`).
 */
export function effectiveThemeMode(mode: ThemeMode, prefersLight: boolean): "dark" | "light" {
  if (mode === "system") return prefersLight ? "light" : "dark";
  return mode;
}

/** The preset a mode falls back to when the reader has not chosen one. */
export function themePresetFor(mode: "dark" | "light", presetId?: string): ThemePreset {
  const chosen = presetId ? THEME_PRESETS.find((p) => p.id === presetId) : undefined;
  if (chosen) return chosen;
  const fallbackId = mode === "light" ? "default-light" : "default-dark";
  return THEME_PRESETS.find((p) => p.id === fallbackId) ?? THEME_PRESETS[0];
}

/**
 * Resolves the paired counterpart preset ID when switching between Dark and Light modes.
 * If the current preset already matches `targetMode`, it is kept as-is; otherwise its
 * `counterpartId` (or the target mode's default preset) is returned.
 */
export function counterpartPresetId(presetId: string, targetMode: "dark" | "light"): string {
  const current = THEME_PRESETS.find((p) => p.id === presetId);
  if (!current) {
    return targetMode === "light" ? "default-light" : "default-dark";
  }
  if (current.mode === targetMode) {
    return current.id;
  }
  return current.counterpartId ?? (targetMode === "light" ? "default-light" : "default-dark");
}

/**
 * Every custom property a scheme resolves to, customised: the preset's colours, the reader's overrides on
 * top, then the derivations the stylesheet relies on (the translucent accents, the focus ring, the story
 * typography). This is the compiler both the server's first frame and the client's live apply run.
 */
export function themeTokens(
  settings: { themePreset?: string; customThemeColors?: CustomThemeColors },
  mode: "dark" | "light"
): Record<string, string> {
  const combinedColors: Record<string, string> = { ...themePresetFor(mode, settings.themePreset).colors };

  if (settings.customThemeColors) {
    for (const [key, value] of Object.entries(settings.customThemeColors)) {
      if (value) combinedColors[key] = value;
    }
  }

  // If --accent-base is set but --accent-translucent is not explicitly supplied, derive it.
  if (combinedColors["--accent-base"] && !combinedColors["--accent-translucent"] && combinedColors["--accent-base"].startsWith("#")) {
    combinedColors["--accent-translucent"] = hexToAlpha(combinedColors["--accent-base"], 0.14);
  }
  // --accent-highlight is guaranteed for every preset and custom palette.
  if (!combinedColors["--accent-highlight"] && combinedColors["--accent-base"]) {
    combinedColors["--accent-highlight"] = combinedColors["--accent-base"];
  }
  // An explicitly customised --accent-base also drives the input focus border and ring.
  if (settings.customThemeColors?.["--accent-base"]) {
    if (!combinedColors["--input-focus-border"]) {
      combinedColors["--input-focus-border"] = combinedColors["--accent-base"];
    }
    if (!combinedColors["--input-focus-ring"] && combinedColors["--accent-base"].startsWith("#")) {
      combinedColors["--input-focus-ring"] = hexToAlpha(combinedColors["--accent-base"], 0.25);
    }
  }
  // If --ai-accent is set but --ai-accent-translucent is not explicitly supplied, derive it.
  if (combinedColors["--ai-accent"] && !combinedColors["--ai-accent-translucent"] && combinedColors["--ai-accent"].startsWith("#")) {
    combinedColors["--ai-accent-translucent"] = hexToAlpha(combinedColors["--ai-accent"], 0.14);
  }
  // Story text, interface text and chat typography stay consistent.
  if (!combinedColors["--story-text"]) {
    combinedColors["--story-text"] = combinedColors["--text-primary"] || (mode === "light" ? "#0f172a" : "#eceff4");
  }
  if (!combinedColors["--text-primary"]) {
    combinedColors["--text-primary"] = combinedColors["--story-text"] || (mode === "light" ? "#0f172a" : "#eceff4");
  }
  if (!combinedColors["--chat-ai-text"]) {
    combinedColors["--chat-ai-text"] = combinedColors["--story-text"];
  }
  if (!combinedColors["--chat-user-text"]) {
    combinedColors["--chat-user-text"] = combinedColors["--story-text"];
  }
  if (!combinedColors["--story-emphasis"]) {
    combinedColors["--story-emphasis"] = mode === "light" ? "#163f73" : "#bcd8ff";
  }
  return combinedColors;
}

/** The root attributes the first frame carries, so the stylesheet can branch on them before React runs. */
export function themeRootAttributes(settings: {
  mode: "dark" | "light";
  avatarShape?: AvatarShape;
  coverAspect?: CoverAspect;
}): Record<string, string> {
  return {
    "data-theme": settings.mode,
    "data-avatar-shape": settings.avatarShape ?? "rounded",
    "data-cover-aspect": settings.coverAspect ?? "landscape"
  };
}

/** The two shape values, as custom properties the stylesheet reads. */
export function themeShapeTokens(settings: {
  avatarShape?: AvatarShape;
  coverAspect?: CoverAspect;
}): Record<string, string> {
  return {
    "--avatar-badge-radius": avatarBadgeRadius(settings.avatarShape ?? "rounded"),
    "--cover-art-aspect": COVER_ASPECT_VALUES[settings.coverAspect ?? "landscape"]
  };
}
