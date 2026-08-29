# BobbinLoom — Character Format

---

## Core principle

A character is a **stable prose sheet** (template) plus a **thin runtime state** (instance). The engine owns all state; the LLM narrates changes and proposes patches.

Three tracks, by weight:

| Track | Shape | Where it lives | Prompt treatment |
|---|---|---|---|
| **Main cast** | `CharacterTemplate` (static sheet) + `CharacterInstance` (runtime state) | Playthrough (templates also mirrored in the library `data/characters/<slug>/<slug>.json`, with older versions as `<slug>.v<N>.json`) | Full sheet when **present**, one-line when **absent** |
| **Player** | `PlayerCharacter` (flat, no template/instance split) | Playthrough | Always full |
| **Background NPCs** | `SimpleNPC` (one-liners) | Playthrough | One line each, always visible |

---

## 1. Character Template — the stable sheet

```ts
type CharacterTemplate = {
  id: string;
  lineageId?: string;   // version-family key for Save to Library (newVersion)
  name: string;
  version: number;
  content: string;      // the [Section] prose blob (below)
  summary: string;      // one-line "who they are" — powers the absent representation
  startingClothing: ClothingItem[]; // base outfit (transient states cleared on save)
  // — library / CCv2 metadata (all optional) —
  spec?: string;        // "bobbinloom_chara" for BL-native records
  creatorNotes?: string;
  creator?: string;
  tags?: string[];      // library tags, e.g. "species:fox", "rating:nsfw" (see character-library.md)
  extensions?: Record<string, unknown>;
  format?: "ccv2";      // present while backed by an un-converted CCv2 card
  cardRef?: { file: string; kind: "png" | "json" };
  cardVersion?: string;
  scenario?: string;
  ccv2Content?: string;        // original card content (kept after conversion)
  ccv2CreatorNotes?: string;
  ccv2Tags?: string[];
};
```

- `content` is a **text blob** with `[Section]` headers. The canonical sections are defined by the active preset's **character format** (see §1a below) — the shipped Default is `Species, Gender, Body, Appearance, Clothing, Personality, Communication - Public, Communication - Private, Likes, Dislikes` (10 sections); Default (NSFW) adds `Sexual Capabilities`. **Any additional headers are allowed** — models invent `[Voice]`/`[Quirks]` and that richness is a feature. `splitContentSections`/`joinContentSections` are exact inverses.
- `summary` is a real field because the absent one-liner needs a stable line; fallback for old templates is the first non-stub `[Personality]` bullet (`summaryFromContent`).
- Templates are **never mutated during play**. Each playthrough keeps a private clone in `characterTemplates[]`; in-play sheet edits touch the clone, and the library copy only changes on explicit **Save to Library** (`saveToLibraryAction`, update = upsert by id in `data/characters/<slug>/<slug>.json`, newVersion = new id + `version = max + 1` saved as `<slug>.v<N>.json` under the same `lineageId`).
- **Library storage is folder-per-entity** — `data/characters/<slug>/<slug>.json` plus optional avatar, versioned siblings, and a transient `<slug>.bl.json` sidecar for imported-but-unconverted CCv2 cards. See `character-library.md`.
- **Seed sync:** the committed library seed `data/characters/mira/mira.json` and the code-level `DEMO_TEMPLATE` (`src/engine/demoData.ts`, used as the default cast for fresh playthroughs) must be kept identical — update both when changing Mira's sheet.

## 1a. Character format — the preset-owned sheet contract

What a sheet looks like is **configurable per preset**, not hardcoded. Each preset carries a `characterFormat`:

```ts
type CharacterFormat = { sections: CharacterFormatSection[] };
type CharacterFormatSection = {
  name: string;             // the [Header] text
  order: number;            // display order (1-based); generated sheets follow it
  instruction: string;      // guidance to the model for this section's content
  examples: string[];       // optional example bodies (first one is used in prompts)
  inline: boolean;          // true → rendered `[Name]: value` on one line; false → block form
};
```

- **The list is open, never a whitelist.** Sheets may contain any extra headers; the format drives defaults, order, stubbing, and generation guidance. `ensureAllSections`/`missingFormatSections`/`isFormatAligned` operate over it without touching non-format sections.
- **Generation is format-driven.** `generateCharacterSheet`/`refineCharacterSheet`/`reformatCharacterSheet` build their example blob and section rules from the resolved format (`buildFormatExample`/`buildFormatRules`) instead of a static example.
- **Stubbing follows the format.** `ensureAllSections(content, format)` guarantees every format section exists in format order, stubbing absent ones as `(not established)` using the section's `inline` flag, preserving extra sections at the end. Used after NPC promotion and library conversion so drafts always match the target format.
- **Fallback.** A preset or playthrough snapshot without a `characterFormat` resolves to the shipped 10-section `DEFAULT_CHARACTER_FORMAT` (so old data keeps working; no migration needed). Playthroughs snapshot the format at creation exactly like modules.
- **Editing the format** happens in Settings → Prompt Configuration → Character Sheet tab (add/remove/rename/reorder sections, toggle `inline`, set instruction + example). Reorder by dragging the ⋮⋮ grip — the pointer-based drag works on both mouse and touch. The Examples field types freely and normalizes (trim + collapse blank lines, one example per line) on blur. Read-only presets must be forked with "Save as New…".
- **Migrating existing sheets.** The library's **"Update into Newer Format with AI"** button (visible in a card's edit view when its sheet doesn't match the selected format) restructures a stored BL sheet into the target format with a preview/accept diff — it never overwrites blindly. "Convert to BL" for CCv2 cards also targets the selected format (defaults to the active preset).

## 2. Character Instance — the runtime state

```ts
type CharacterInstance = {
  id: string;
  templateId: string;
  playthroughId: string;
  branchId: string;
  name: string;
  currentLocationId: string;   // presence is exact match against the player's location
  mood: string;                // default "neutral"
  towardPlayer: string;        // default "neutral" — the always-on relationship anchor
  memorySummary: string;       // kept deliberately (see Memory model)
  conditions: string[];        // e.g. "🤕 wounded" — carried into the absent one-liner
  flags: string[];             // story truth switches
  clothing: ClothingItem[];    // runtime outfit (see Structured clothing)
  createdAt: string;
  updatedAt: string;
};
```

Instantiation (`instantiateTemplate`) seeds `clothing` from `template.startingClothing`, falling back to parsing the `[Clothing]` section of `content`. Mood/towardPlayer start `"neutral"`; memorySummary defaults to a neutral line (promoted NPCs seed from their first personality bullet).

## 3. Structured clothing — single source of truth

`ClothingItem = { slot: string; name: string; state?: string }` (same shape as the player's).

- **Structured clothing is authoritative.** The `[Clothing]` section in `content` is only a *generation scaffold*: the sheet generator writes slot bullets, the engine parses them into data on ingest, and the **prompt never injects the raw section** when structured clothing exists — it renders a derived `Clothing: Top: torn blouse (wet); …` line instead (same format as the player).
- **In-play editing is a plain content field.** The Info Panel character editor treats the whole sheet as one content blob — no per-section widgets. On save the engine re-parses `[Clothing]` slot bullets back into structured clothing, so editing the sheet is always the honest way to change the outfit.
- Model patches: `characterClothingAdd` (one item per slot), `characterClothingRemove` (by slot), `characterClothingSetState`, `characterClothingSet` (whole outfit). `characterSectionUpdate` with section `"Clothing"` is **redirected** into a full structured replace.
- Save to Library stores the current outfit as `startingClothing` with transient `state` cleared.

## 4. Presence gating — the scene rule

A cast character is **present** iff `instance.currentLocationId === playthrough.locationId` (exact match — no "nearby" tier; the location string IS the information).

- **Present** → full sheet + `[RUNTIME STATE]` (location, mood, toward player, clothing line, conditions, flags, memory) injected verbatim.
- **Absent** → one-liner under `ABSENT CHARACTERS (full sheets withheld — not at the current location):`
  `- Name (id) [towardPlayer] — summary; at LocationName (locId), conditions`
  (towardPlayer only when non-neutral; conditions only when non-empty; block omitted when nobody is away).
- **Gating is prompt-view only.** The `Allowed IDs` roster lists every instance id every turn, and all patches (`characterMood`, `characterConditions*`, `characterFlags*`, `characterMemory`, `characterLocation`, `characterClothing*`, `characterSectionUpdate`, `characterSectionRemove`, `characterSectionRename`) work on present AND absent characters. Engine state is always complete.
- **Incremental sheet edits are present-gated.** The bullet-level patch actions `characterSectionItemAdd` / `characterSectionItemRemove` / `characterSectionItemReplace` mutate individual bullets of a section (add a discovered Like, remove a no-longer-true trait, evolve a personality bullet) and are **gated to present characters** — an absent character's sections aren't in context, so item-level edits reject.
- **Whole-section ops work anywhere, on any header.** `characterSectionUpdate` inserts/rewrites a whole section (used for full rewrites, freeform `Communication` sections, and absent characters) — any header is accepted, not just the format's. `characterSectionRemove` deletes a whole section (removing `[Clothing]` also clears structured clothing). `characterSectionRename` renames a header while preserving its body (renaming *to* `[Clothing]` re-derives structured clothing from the renamed body). All section/Clothing edits reject read-only CCv2 sheets; `Clothing` item routes through the structured `characterClothing*` pipeline.
- Off-screen evolution is **model-driven**: the system prompt permits the model to evolve absent characters' mood/conditions/flags via patches; no engine timers.
- Background NPCs render one line each regardless of location; stale ones (never named in a chapter's messages or memory events, never at a visited location) are pruned at chapter close with a visible "faded from the story" note. Background NPCs can be promoted to main cast via the `npcPromote` patch (or UI action), creating a new template and instance while seeding `memorySummary` from their personality.

## 5. Memory model

- **Episodic:** playthrough-wide `memoryEvents` with `characterInstanceId` tags, retrieved per turn by semantic query (embedding) with keyword fallback (`retrieveMemoriesVector`), layered into `recent`/`compressed`. Retrieval is probabilistic — events surface only when relevant to the recent context.
- **Anchor:** `instance.memorySummary` is deliberately **kept** as the always-on relationship line (the retrieval system can't guarantee a character's current stance is recalled). Mood + towardPlayer do the same job more cheaply in the absent one-liner.
- Tagging rule for the model: always tag events with character names and location IDs — untagged events won't be recalled in the right context.

## 6. Prompting model

Injection order per character: template sheet (present only) → runtime state → memory anchor → (absent: one-liner). The full template, full memory log, and relationship history are never injected every turn. The state summary is built by `summarizePlaythrough`; the estimator prices present characters at full-sheet cost and absent characters as a capped one-liner, with `castPresence {present, absent}` exposed on `TokenUsage` for the Debug tab.
