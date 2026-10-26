---
title: Prompt modules
section: Prompting
order: 100
---

# Prompt modules

Prompt behaviour is configured through **presets**: named collections of modules that can be
toggled, reordered and edited. What generation actually reads is the **global prompt
configuration** — a working copy of a preset's modules, character format and image block that
lives in your settings and applies to every playthrough. Editing the configuration in Settings
applies immediately, saved or not; a preset is a named save/load point for it.

One thing is not configurable: scenario generation, character-sheet generation and chapter
summarization run on fixed prompts, so the only module surface is the turn.

## The preset model

```ts
type PromptPreset = {
  id: string;
  name: string;
  readonly: boolean;
  modules: PromptModuleSet;
  characterFormat: CharacterFormat;      // the sheet structure
  imageGeneration: ImageGenerationSettings;
};

type PromptModuleSet = {
  turn: PromptPresetModule[];            // the turn system prompt
};

type PromptPresetModule = {
  id: string;
  name: string;
  description: string;
  content: string;
  order: number;
  enabled: boolean;
};
```

Modules belong to the turn — the context is structural, not a per-module field. Enabled
modules are sorted by `order` and joined into the leading system block, ahead of everything
else in the prompt. Module content is plain text.

## The shipped presets

Two readonly presets ship with the app:

| Preset | Turn modules | Character format |
|---|---|---|
| **Default** | Core narrative and style modules; explicit content modules off | Ten sections |
| **Default (NSFW)** | The same core modules plus *Gritty Style*, *Mature Content*, and *Explicit Content* | The same ten plus `[Sexual Capabilities]` |

Read-only means they can't be *overwritten* — every field is editable as your working
configuration, and **Save as New…** keeps your version under its own name. The preset you use
is the content control: its turn modules and sheet format decide what every playthrough is
asked to write. Their image blocks differ too; see [Image generation](image-generation.md).

### Default's turn modules

| Module | Purpose |
|---|---|
| Core GM | Establishes the narrator/GM role, that the model never speaks for you, and that it works from the state it is given |
| Response Format | Quotes for speech, backticks for thoughts, bold for emphasis |
| User Input Format | How to read what you send |
| Story Theme | Anchors the atmosphere, setting, and character dynamics to the playthrough's assigned tags via `{{playthroughTags}}` |
| Campaign Logic | Consequences, pacing, NPC agency |
| Conflict Narration | Resolve conflict through prose |
| Relationship Dynamics | Relationships move through actions, and a character's own details (wardrobe, likes, dislikes, appetites) change with the story and are recorded |
| Grounded Style | Vivid but controlled prose |

## Template macros (`{{...}}`)

Macros are expanded at prompt-build time only — stored presets, sheets, and lorebooks keep the
placeholders verbatim:

| Macro | Purpose / Resolves to | Supported in |
|---|---|---|
| `{{playthroughTags}}` | The playthrough's assigned tags sorted by category (e.g. `theme: dark romance, setting: modern day, and trope: femdom`), or `"determined by the scenario and story so far"` when no tags are assigned | Turn prompt modules |
| `{{user}}` | The player character's name | Turn prompt modules, character sheets & memory lines, player fields, lorebook entries, image cast block |
| `{{char}}` | The owning character's name (left literal on shared/ownerless surfaces like turn modules and lorebooks) | Character sheets, character memory lines, absent character one-liners |

## The character sheet format

The **Character Sheet** tab is a sections editor, not a module list. Sheet structure — which
sections exist, their order, whether each is inline or block, and the instruction and examples
the model gets — belongs to the preset's `characterFormat`, and that format is the sheet's
authoritative contract. Whether `[Sexual Capabilities]` exists is a property of the format.

See [Character format](character-format.md) for what the sections themselves mean.

## Configuring

1. Open **Settings → Prompts**
2. Pick a preset from the dropdown, or create one with **Save as New…**
3. On **Turn**: toggle modules, reorder them by dragging the grip, edit a module's name and content,
   or add a new one
4. On **Character Sheet**: edit the section list — name, `inline`, the model instruction and an
   optional example body — and reorder sections by dragging the grip
5. On **Image Generation**: edit the image instruction and its mode, the prefixes, the
   character limit, the history count and the inclusion flags
6. **Save** writes the configuration back to the preset; **Load/Reload** discards unsaved edits
   and re-copies the preset

Switching presets copies the chosen preset over the global configuration, and asks first if you
have unsaved edits.

## Where it is stored

```
data/prompt-presets.json       shipped read-only presets — tracked in the repo
data/user-prompt-presets.json  your saved custom presets — gitignored runtime data
data/user-settings.json        the global configuration: active preset id, prompt config,
                               and the rest of your runtime overrides
```

## Design principles

- **Presets own their modules and their format.** Each preset carries its own copy of every
  module's content, order and enabled state, plus its own sheet format and image block.
- **The global configuration is the source of truth.** Generation reads it, never the
  playthrough — one configuration for every story, and an edit reaches all of them on the next
  turn.
- **Shipped presets are immutable.** You copy them to customize.
- **Modules are passive text.** No variables beyond the runtime macros (`{{playthroughTags}}` and `{{user}}`), no conditionals, no logic.
- **Format drives structure, modules drive tone.** The sheet contract comes from
  `characterFormat`; the output contract is always appended after the enabled modules.
