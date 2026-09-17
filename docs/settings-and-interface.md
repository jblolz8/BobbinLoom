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
| **Theme & Appearance** | Theme mode, theme preset, custom colours, avatar shape |

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
| Show Debug Accordion | The per-turn debug panel in the chat |

Letting the image prompt be reviewed is the default; turning the review off lets the call run
straight through.

## Theme & Appearance

- **Mode** — dark, light, or follow the system
- **Preset** — the theme family, with a live swatch preview of each one
- **Custom colours** — per-variable overrides on top of the preset
- **Avatar shape** — how portraits are framed throughout the app

Appearance applies immediately and is stored with your other runtime settings.

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
- the play view switches to one panel at a time, chosen by a tab bar at the bottom of the
  screen
- panels that are not selected are hidden rather than unmounted, so scroll position and
  in-progress edits survive a tab switch

Full-screen dialogs on small screens use the dynamic viewport height so the browser's own
chrome can't crop them, and the scrollable region inside a dialog is the only thing that
scrolls — the header and action bars stay put.

## Interaction conventions

A few patterns are consistent across every surface:

- **Destructive actions confirm** in the app's own dialog, never the browser's — deleting a
  playthrough, a character, a preset or an image all ask first
- **A gesture works everywhere it appears** — the ⋮ menu on a playthrough card is the same menu
  in the save/load list; the same pager component drives every paginated list
- **Compact controls are real controls** — inline remove buttons, tag chips and menu triggers
  keep their hitbox and support keyboard activation
- **Tag and category colours** come from the taxonomy, so a tag looks the same in the library,
  the picker and the filter row
