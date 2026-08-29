# BobbinLoom — Prompt Modules

---

## Core idea

Prompt behavior is configured through **presets** — named collections of prompt modules that can be toggled, reordered, and edited. Each playthrough stores a snapshot of its preset at creation time, so changing a preset doesn't retroactively affect existing games.

Modules are **scoped to a prompt context** — a module only feeds the prompts it is tagged for. The four contexts:

| Context | Prompts it feeds |
|---|---|
| `turn` | The main turn system prompt (the classic module surface) |
| `seed` | Scenario generation (the setup "Generate Scenario" call) |
| `sheet` | Character sheet generation (NPC promotion / sheet drafting) |
| `summary` | Chapter summarization + story-so-far compaction |

The **PresetEditor shows one tab per context** (Turn / New Scenario / Character Sheet / Summary).

---

## Preset model

```ts
type Preset = {
  id: string;
  name: string;
  readonly: boolean;
  modules: PromptModuleSet;
  characterFormat: CharacterFormat;  // the character sheet structure (see character-format.md)
};

type PromptModuleSet = {
  turn: PresetModule[];     // the main turn system prompt
  seed: PresetModule[];     // scenario generation
  sheet: PresetModule[];    // legacy character sheet modules (rarely used — see below)
  summary: PresetModule[];  // chapter summarization + compaction
};

type PresetModule = {
  id: string;
  name: string;
  description: string;
  content: string;
  order: number;
  enabled: boolean;
};
```

**Context is structural, not a per-module field.** The tab a module is edited under *is* its context — a module created on the Summary tab only ever feeds summary prompts, never the turn/seed/sheet configurations. (The earlier per-module `contexts` array and the decorative `tags` field were removed Aug 2026.) Legacy presets/snapshots that stored modules as a flat array load with the whole array treated as `turn` modules.

**The Character Sheet tab is a sections editor, not a module list.** Sheet structure — which sections exist, their order, their inline vs. block layout, and the instruction/examples the model gets — is owned by `characterFormat`, edited row-by-row in the Character Sheet tab. The old `sheet` module list still loads for backward compatibility but is empty in the shipped presets; the format is the sheet's authoritative contract.

---

## Default presets

`data/prompt-presets.json` ships with **two** readonly presets — **Default** and **Default (NSFW)** — mirror images of each other. Default has the content modules off; Default (NSFW) has them on. Both are `readonly: true` and cannot be overwritten via the UI; use "Save as New…" to customize.

### Turn modules (Default)

| Module | Status | Purpose |
|---|---|---|
| Core GM | On | Establish GM role, don't speak for user |
| Response Format | On | Quotes for speech, backticks for thoughts, bold for emphasis |
| User Input Format | On | How to interpret user messages |
| RPG State Awareness | On | Respect current state, don't invent |
| Campaign Logic | On | Consequences, pacing, NPC agency |
| Conflict Narration | On | Narrate conflict and uncertain outcomes through prose (no dice/stats) |
| Relationship Dynamics | On | Relationships evolve through actions |
| Grounded Style | On | Vivid but controlled prose |

### Scoped modules (added Aug 2026)

| Module | Context | Default | Default (NSFW) |
|---|---|---|---|
| Seed Tone | `seed` | Setting description carries genre/tone | Same, reflecting mature registers in atmosphere |
| Summary Tone | `summary` | Neutral, factual summaries | Factual, plain, no euphemism or judgment |

> **Character sheet guidance moved into the format.** The former `sheet` module "Sheet Content Boundaries" was removed in the format work: the sections themselves — including whether `[Sexual Capabilities]` exists — are now defined by the preset's `characterFormat`, and the per-section instructions/examples carry the guidance. Default's format is the 10-section set (no `[Sexual Capabilities]`); Default (NSFW)'s format adds it as the 11th section.

The Default/NSFW difference is the content lever: **the preset you use IS the content control** (per-playthrough `contentRating` was removed Aug 2026). The playthrough's snapshot decides the sheet/seed/summary guidance it gets — mid-story preset switches (Settings → Prompt Configuration → Apply) re-scope future generations.

---

## How to configure

1. Open **Settings** → **Prompt Configuration** tab
2. Select a preset from the dropdown, or create a new one via "Save as New…"
3. Pick a context tab — **Turn / New Scenario / Character Sheet / Summary**
4. Toggle modules on/off with checkboxes (Turn / New Scenario / Summary tabs)
5. Reorder modules with ↑↓ arrows
6. Edit module name, content, and metadata (✎ button)
7. Add new modules with "+ Add Module" — they land in the active tab's context
8. On the **Character Sheet** tab: edit the section list — name, `inline` checkbox (renders `[Name]: value` on one line vs. block form), model instruction, and optional example body. **Reorder sections by dragging the ⋮⋮ grip** — the pointer-based drag works on both mouse and touch. The order shown IS the order generated sheets must follow. The Examples field is freeform while typing and normalizes (trim + collapse blank lines, one example per line) on blur.
9. Click **Save** to persist changes to the preset
10. Switching presets auto-applies to the current playthrough

> Read-only presets (Default, Default NSFW) let you view but not edit; use "Save as New…" to fork one.

---

## Data files

- `data/prompt-presets.json` — all presets (create/edit via UI; git-tracked)
- Playthrough JSON files — each stores a module snapshot in `promptSettings`

---

## Design principles

- **Presets own their modules and their format.** Each preset has its own copy of every module's content, order, and enabled state, plus its own `characterFormat` defining the sheet structure.
- **Playthroughs are snapshots.** Creating a playthrough copies the current preset's modules *and* character format. Changing a preset doesn't affect existing games — sheets already in play are not retroactively restructured (use the library's "Update into Newer Format with AI" tool to migrate a stored sheet).
- **Default is immutable.** The shipped presets cannot be overwritten. Users create copies to customize.
- **Modules are passive text.** No variables, conditionals, or logic — just text blocks the model interprets.
- **Output format is driven by the format, not modules.** The sheet contract (sections, order, inline layout) comes from `characterFormat`; turn/seed/summary JSON contracts are always appended after the enabled modules. Modules tune rules and prose — they never redefine the sheet structure.
