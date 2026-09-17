# BobbinLoom — Prompt Modules

---

## Core idea

Prompt behavior is configured through **presets** — named collections of prompt modules that can be toggled, reordered, and edited — but what generation actually reads is one **global prompt configuration**: a working copy of a preset's modules, character format, and image block that lives in `data/user-settings.json` and applies to **every** playthrough. Editing the config in Settings applies immediately, saved or not; a preset is a named save/load point for it, not a per-playthrough binding.

Modules are **scoped to the turn context** — the only module surface. The seed, sheet, and summary module contexts were **removed (Aug 2026)**: scenario generation, character-sheet generation, and chapter summarization now use hardcoded prompts (with a fixed neutral tone) rather than user-editable modules. The PresetEditor shows three tabs: **Turn** (modules), **Character Sheet** (the format), and **Image Generation** (the image prompt block).

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

**Context is structural, not a per-module field.** Modules belong to the Turn context — the only context. (The earlier per-module `contexts` array, the decorative `tags` field, and the seed/sheet/summary contexts were removed Aug 2026.) Legacy presets/snapshots that stored modules as a flat array load with the whole array treated as `turn` modules.

**The Character Sheet tab is a sections editor, not a module list.** Sheet structure — which sections exist, their order, their inline vs. block layout, and the instruction/examples the model gets — is owned by `characterFormat`, edited row-by-row in the Character Sheet tab. The former `sheet` module context was removed (Aug 2026); the format is the sheet's authoritative contract.

---

## Default presets

`data/prompt-presets.json` ships with **two** readonly presets — **Default** and **Default (NSFW)** — whose turn modules mirror each other. Default has the content modules off; Default (NSFW) has them on. Both are `readonly: true` and cannot be overwritten via the UI; use "Save as New…" to customize. Their image-generation blocks DO differ: Default (NSFW) adds an explicit-content section to the prompt instruction and extra tokens to its negative prefix — see [`image-generation.md`](image-generation.md).

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

### Hardcoded seed & summary tone (removed Aug 2026)

The former **Seed Tone** and **Summary Tone** modules were removed along with the `seed`/`summary` module contexts. Scenario generation and chapter summarization now use a fixed **neutral tone** inlined into their prompts — no longer user-configurable. This is intended to be revisited when scenario/summary prompting is redesigned.

> **Character sheet guidance lives in the format.** The former `sheet` module "Sheet Content Boundaries" was removed: the sections themselves — including whether `[Sexual Capabilities]` exists — are now defined by the preset's `characterFormat`, and the per-section instructions/examples carry the guidance. Default's format is the 10-section set (no `[Sexual Capabilities]`); Default (NSFW)'s format adds it as the 11th section.

The Default/NSFW difference is the content lever: **the preset you use IS the content control** (per-playthrough `contentRating` was removed Aug 2026). The global prompt config decides the turn-module guidance and sheet format every playthrough gets — switching presets (Settings → Prompt Configuration) or editing the config re-scopes future generations everywhere at once.

---

## How to configure

1. Open **Settings** → **Prompt Configuration** tab
2. Select a preset from the dropdown, or create a new one via "Save as New…"
3. Pick a tab — **Turn** (modules) or **Character Sheet** (sections)
4. Toggle Turn modules on/off with checkboxes
5. Reorder modules with ↑↓ arrows
6. Edit module name, content, and metadata (✎ button)
7. Add new modules with "+ Add Module" — they land in the Turn context
8. On the **Character Sheet** tab: edit the section list — name, `inline` checkbox (renders `[Name]: value` on one line vs. block form), model instruction, and optional example body. **Reorder sections by dragging the ⋮⋮ grip** — the pointer-based drag works on both mouse and touch. The order shown IS the order generated sheets must follow. The Examples field is freeform while typing and normalizes (trim + collapse blank lines, one example per line) on blur.
9. Click **Save** to write the config back to the preset (read-only presets cannot be saved — use "Save as New…" instead). Every edit already applies to generation immediately, saved or not; **Load/Reload** discards the unsaved edits and re-copies the preset.
10. Switching presets copies that preset's config over the global one (with a confirm when there are unsaved edits)

> Read-only presets (Default, Default NSFW) are fully editable as a working config; they just cannot be overwritten. Use "Save as New…" to keep your changes under a name.

---

## Data files

- `data/prompt-presets.json` — the named presets (create/edit via UI; git-tracked)
- `data/user-settings.json` — the **global prompt config** (`activePresetId` + `promptConfig`) plus the other runtime overrides; gitignored

---

## Design principles

- **Presets own their modules and their format.** Each preset has its own copy of every module's content, order, and enabled state, plus its own `characterFormat` defining the sheet structure.
- **The global config is the source of truth.** Generation reads `promptConfig` from app settings, never the playthrough. There is exactly one prompt configuration for every playthrough, and any edit in Settings reaches all of them on the next generation — that is the point: no per-playthrough variance to hunt down.
- **Default is immutable.** The shipped presets cannot be overwritten. Users create copies to customize.
- **Modules are passive text.** No variables, conditionals, or logic — just text blocks the model interprets.
- **Output format is driven by the format, not modules.** The sheet contract (sections, order, inline layout) comes from `characterFormat`; turn/seed/summary JSON contracts are always appended after the enabled modules. Modules tune rules and prose — they never redefine the sheet structure.
