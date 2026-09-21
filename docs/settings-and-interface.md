---
title: Settings & interface
section: Interface
order: 130
---

# Settings & interface

Settings opens from the header and is available from anywhere — the home screen and inside a
playthrough alike. It has five tabs.

| Tab | What it holds |
|---|---|
| **Provider** | Text and image connections, keys, models, per-connection parameters |
| **Prompt Configuration** | The active preset's turn modules, character-sheet format and image prompt block |
| **Tags & Taxonomy** | The tag categories and colours the character library uses |
| **Chat** | The switches that change how the chat behaves and what it displays |
| **Interface & Appearance** | Theme mode, theme preset, custom colours, avatar shape, cover art, and how the play view moves between panels on a narrow screen |

## Chat

| Switch | Effect |
|---|---|
| Show Choices | Whether responses offer suggested next actions |
| Display Response Generation Time | The stopwatch on each assistant message |
| Display Chat Message Timestamps | The timestamp on each message |
| Display AI Model Name | The model badge on each response |
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

## Interface & Appearance

- **Mode** — dark, light, or follow the system
- **Preset** — the theme family, with a live swatch preview of each one
- **Custom colours** — per-variable overrides on top of the preset
- **Avatar shape** — how portraits are framed throughout the app
- **Cover art** — the shape of every cover on the playthrough shelf: Portrait (2:3), 1:1 Square, or Landscape (16:9)
- **Mobile panels** — **Swipe Between Panels**, whether a horizontal swipe moves between the play
  view's panels. On by default, and offered on the layouts that have the gesture; the bottom tab bar
  works either way

Everything here applies immediately and is stored with your other runtime settings.

## Prompt Configuration is global

There is one prompt configuration, not one per playthrough. The Prompt Configuration tab edits
that single config; switching presets copies the preset over it. A playthrough does not keep
its own snapshot, so an edit reaches every playthrough's next turn. The tab also works from the
home screen, where there is no playthrough at all.

Details of the modules themselves are in [Prompt modules](prompt-modules.md).

## The layout

The app is a single shell: a header, then a three-panel play view — scene on the left, chat in
the middle, character and journal panels on the right.

Everything is designed to collapse at one breakpoint, **1100px**:

- the header's navigation tabs collapse to a row below the brand
- panel labels become icons
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
  name field. When it closes, focus goes back to whatever opened it
- **A gesture works everywhere it appears** — the ⋮ menu on a playthrough card is the same menu
  in the save/load list; the same pager component drives every paginated list
- **Compact controls are real controls** — inline remove buttons, tag chips and menu triggers
  keep their hitbox and support keyboard activation
- **Tag and category colours** come from the taxonomy, so a tag looks the same in the library,
  the picker and the filter row
