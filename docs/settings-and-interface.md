---
title: Settings & interface
section: Interface
order: 130
---

# Settings & interface

Settings opens from the header and is available from anywhere — the home screen and inside a
playthrough alike. It has six tabs in a split sidebar layout, and panels stay mounted after their
first visit so switching tabs never discards an in-progress draft.

| Tab | What it holds |
|---|---|
| **Providers** | *Text Providers*, *Image Providers*, and *Provider Overrides* (per-workflow connection routing) |
| **Prompts** | The active preset's turn modules, character-sheet format and image prompt block |
| **Tags & Taxonomy** | The tag categories and colours the character library uses |
| **Chat** | The switches and auto-scroll behaviour that control what the chat displays and how turns run |
| **Interface** | Workspace content width (`50%–100%`), avatar badge shape, cover art frame ratio, and narrow-screen panel swipe |
| **Appearance** | Theme mode, 5 paired Dark ↔ Light theme presets, custom palette overrides, live story & markdown preview, and the active token showcase |

## Chat

| Switch | Effect |
|---|---|
| Show Choices | Whether responses offer suggested next actions |
| Display Response Generation Time | The stopwatch on each assistant message |
| Display Chat Message Timestamps | The timestamp on each message |
| Display AI Model Name | The model badge on each response |
| Show Message Numbers | Displays turn numbers (`#0`, `#1`, `#2`...) on both user and assistant message bubbles |
| AI Response Auto-Scroll | Auto-scroll behavior on response arrival: *Scroll to Start of Message* (default), *Scroll to Bottom*, or *No Auto-Scroll* |
| Show Context Usage | The context meter below the input |
| Review Image Prompt Before Generating | Whether the image prompt opens for review before the image call |
| Generate Image right after AI Response | Chains an image generation onto each response |
| Always Discard Old Image on Re-send | Whether re-sending an image's request body asks before replacing it |
| Show Debug Accordion | The per-turn debug panel in the chat |

Letting the image prompt be reviewed is the default; turning the review off lets the call run
straight through.

**Always Discard Old Image on Re-send** is off by default, and it is the one image switch that
skips a confirmation rather than changing what is generated. Re-sending an image's request body
replaces the image it came from, so it asks first — switching this on stops the asking, and the
confirmation's own *Always discard old image* checkbox turns it on for you. Editing a request body
does not ask and does not replace anything: that is a save, and it leaves the image alone. See
[Image generation](image-generation.md) → *Editing and re-sending a stored request body*.

## Interface

- **Workspace Content Width** — A clamped slider and number field (`50% – 100%`, default `80%`)
  that controls how much horizontal screen space the Home workspace tabs (**Playthroughs**,
  **Characters**, **Lorebooks**, **Personas**, and **Documentation**) occupy on wide screens
  (`> 1100px`). Below `1100px`, workspace pages automatically expand to `100%` of the viewport.
- **Avatar Badge Shape** — How entity identity badges are framed across the Player tab, Main Cast
  compact roster, Background NPCs, and Persona selectors: *Square* (`2px`), *Rounded Corner Square*
  (`8px`, default), or *Circle* (`50%`).
- **Cover Art** — The frame aspect ratio of every cover on the playthrough shelf: *Landscape*
  (`16:9`, default), *1:1 Square*, or *Portrait* (`2:3`).
- **Mobile Panels** — **Swipe Between Panels**, whether a horizontal drag moves between the play
  view's panels on narrow screens (`<= 1100px`). On by default, and offered only on viewports where
  the single-panel layout is active; the bottom tab bar works either way.

## Appearance

- **Theme Mode & Paired Presets** — *Dark Mode*, *Light Mode*, or *Follow System*. The ten shipped
  presets are arranged as five **Dark ↔ Light counterpart pairs** in a two-column grid, and
  switching between Dark and Light modes automatically flips the active preset to its counterpart:

| Dark Preset | Light Counterpart | Character |
|---|---|---|
| **Bobbin Classic Dark** | **Studio Light** | Deep slate navy ↔ crisp daylight slate & royal blue |
| **Nord Frost** | **Polar Mist** | Arctic slate & frost cyan ↔ cool glacier daylight |
| **Amber Hearth** | **Warm Parchment** | Candlelit espresso & amber ↔ sunlit cream vellum & terracotta |
| **Emerald Archive** | **Matcha & Cream** | Phosphor CRT terminal green ↔ botanical sage & warm clay |
| **Midnight Violet** | **Sakura Blossom** | Obsidian plum & neon orchid ↔ soft petal blush & plum rose |

- **Self-Contained Preset Cards** — Every preset card scopes its own surface, border, text, accent,
  `"Quotes"`, and `**Bold**` tokens, so light presets preview accurately while in dark mode and
  vice versa.
- **Custom Palette Tweaks** — A collapsible drawer for overriding individual CSS tokens on top of
  the active preset across Core Surfaces, Typography & Story Markdown (`--story-text`,
  `--story-emphasis`, `--story-italic`, `--story-quote`), Accents, and Chat Bubbles, with per-token
  and full reset actions.
- **Live Story & Markdown Preview** — Renders sample assistant and player chat bubbles with
  headings, bold emphasis, italics, strikethrough, `"spoken dialogue"`, blockquotes, lists, inline
  code, and fenced code blocks using the active palette.
- **Theme Color Palette (Active Tokens)** — An always-visible visual reference of all active theme
  tokens grouped into seven functional sections (*Background Surfaces*, *Borders & Dividers*,
  *Typography & Hierarchy*, *Story & Markdown Highlights*, *Accents & Semantic Status*, *Chat
  Bubbles & Timeline*, and *Inputs & Code Blocks*), each with a full-width preview stage.
- **First-Frame Server Paint** — Theme tokens, `data-theme`, `data-avatar-shape`,
  `data-cover-aspect`, and `--workspace-max-width` are compiled through `src/engine/theme.ts` and
  injected into `index.html` (`#theme-first-paint`) on every request, so reloads paint the exact
  active theme and layout width on the very first frame without flicker.

### Cast and Character Manager

Preferences on the PlayView's Chars tab are saved per profile and remembered across sessions:

- **Cast view mode** — Portrait card view or Compact profile view
- **Context scope** — Story context fed to the Character Manager (`Current Chapter (All)`, `Timeline Highlights`, or `Recent Messages`)
- **Recent message count** — When using the *Recent Messages* scope, how many recent messages to include (default: 8, up to 50)

Everything here applies immediately and is stored with your other runtime settings.

## Prompts (Prompt Configuration) is global

There is one prompt configuration, not one per playthrough. The **Prompts** tab edits that single
config; switching presets copies the preset over it. A playthrough does not keep its own snapshot,
so an edit reaches every playthrough's next turn. The tab also works from the home screen, where
there is no playthrough at all.

Details of the modules themselves are in [Prompt modules](prompt-modules.md).

## The layout

The app is a single shell: a header, then a three-panel play view — scene on the left, chat in
the middle, character and journal panels on the right.

Everything is designed to collapse at one breakpoint, **1100px**:

- the header's navigation tabs collapse to a row below the brand
- panel labels become icons
- the home workspace pages expand from `--workspace-max-width` (`50%–100%`) to `100%` of the viewport
- the play view switches to one panel at a time, chosen by a compact tab bar at the bottom of the
  screen (icon beside the panel name, 44px plus the safe area)
- panels that are not selected are hidden rather than unmounted, so scroll position and
  in-progress edits survive a tab switch
- an action whose result lives in another panel brings that panel forward: **View Transcript**
  in the Journal opens the chat panel, because on a phone the transcript would otherwise be
  written into a panel that is not on screen
- **Panels can be swiped** — left for the next one (Scene → Chat → Info), right for the previous,
  stopping at the ends rather than wrapping. The drag has to be clearly sideways before it counts as
  one — about twice as horizontal as it is vertical, and past a short travel — and if it turns
  vertical after that it goes back to being a scroll. Once it counts, the panel follows your finger
  and the neighbour comes in behind it; releasing past about 40% of the panel, or throwing it, lands
  on that panel, and a short or slow drag springs back. Tapping a tab swaps panels with a 150ms
  slide. A panel's own horizontal controls keep the gesture: a swipe starting on a code block, on the
  info panel's tab strip, or on the screen's left edge does what it would normally do. With
  **reduced motion** set, panels do not follow the finger — a swipe still changes the panel, without
  the movement. **Swipe Between Panels** in Settings turns the gesture off entirely, and the bottom
  tab bar is how panels are chosen then; it is always there, switched on or off

Full-screen dialogs on small screens use the dynamic viewport height so the browser's own
chrome can't crop them, and the scrollable region inside a dialog is the only thing that
scrolls — the header and action bars stay put.

## Interaction conventions

A few patterns are consistent across every surface:

- **Destructive actions confirm** in the app's own dialog, never the browser's — deleting a
  playthrough, a character, a preset or an image all ask first
- **Every dialog follows one contract** — a labelled `role="dialog"` with `aria-modal`, Escape and
  the backdrop to dismiss it (the backdrop only on a press that starts there, so a drag out of a
  field does not throw the dialog away), Tab contained inside it, and focus handed to the dialog's
  first stop — which in a destructive dialog is the safe action, and in the rename dialog is the
  name field. When it closes, focus goes back to whatever opened it. Its action row reads the same
  everywhere, too: the confirming action first, any secondary actions beside it (**Duplicate as
  backup** in the revert and retry dialogs), and **Cancel last** — at the right end of the row on a
  desktop, and the last full-width button once the row stacks on a phone. Dialogs may **stack** (a
  discard guard over the character sheet): only the top one traps focus, answers Escape and lets its
  backdrop dismiss it, and the ones beneath stay inert. Below 680px the character sheet and Settings
  are full-screen sheets — `100dvh` with a pinned header, a scrolling body and the action row in reach.
- **A gesture works everywhere it appears** — the ⋮ menu on a playthrough card is the same menu
  in the save/load list; the same pager component drives every paginated list
- **Compact controls are real controls** — inline remove buttons, tag chips and menu triggers
  keep their hitbox and support keyboard activation
- **Tag and category colours** come from the taxonomy, so a tag looks the same in the library,
  the picker and the filter row
