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
};

type PromptModuleSet = {
  turn: PresetModule[];     // the main turn system prompt
  seed: PresetModule[];     // scenario generation
  sheet: PresetModule[];    // character sheet generation
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
| Sheet Content Boundaries | `sheet` | Excludes `[Sexual Capabilities]` from generated sheets | Includes it, written to fit the character |
| Seed Tone | `seed` | Setting description carries genre/tone | Same, reflecting mature registers in atmosphere |
| Summary Tone | `summary` | Neutral, factual summaries | Factual, plain, no euphemism or judgment |

The Default/NSFW difference is the content lever: **the preset you use IS the content control** (per-playthrough `contentRating` was removed Aug 2026). The playthrough's snapshot decides the sheet/seed/summary guidance it gets — mid-story preset switches (Settings → Prompt Configuration → Apply) re-scope future generations.

---

## How to configure

1. Open **Settings** → **Prompt Configuration** tab
2. Select a preset from the dropdown, or create a new one via "Save as New…"
3. Pick a context tab — **Turn / New Scenario / Character Sheet / Summary**
4. Toggle modules on/off with checkboxes
5. Reorder modules with ↑↓ arrows
6. Edit module name, content, and metadata (✎ button)
7. Add new modules with "+ Add Module" — they land in the active tab's context
8. Click **Save** to persist changes to the preset
9. Switching presets auto-applies to the current playthrough

---

## Data files

- `data/prompt-presets.json` — all presets (create/edit via UI; git-tracked)
- Playthrough JSON files — each stores a module snapshot in `promptSettings`

---

## Design principles

- **Presets own their modules.** Each preset has its own copy of every module's content, order, contexts, and enabled state.
- **Playthroughs are snapshots.** Creating a playthrough copies the current preset's modules. Changing a preset doesn't affect existing games.
- **Default is immutable.** The shipped presets cannot be overwritten. Users create copies to customize.
- **Modules are passive text.** No variables, conditionals, or logic — just text blocks the model interprets.
- **Output format is non-negotiable.** The JSON output contracts (turn `statePatch`, scenario seed shape, sheet blob, summary JSON) are always appended after the enabled modules — modules tune rules and prose, never the machine contract.
