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
};
```

- `content` is a **text blob** with `[Section]` headers. Canonical sections (display order):
  `Species, Gender, Body, Appearance, Clothing, Personality, Communication - Public, Communication - Private, Likes, Dislikes, Sexual Capabilities`.
  **Any additional headers are allowed** — models invent `[Voice]`/`[Quirks]` and that richness is a feature. `splitContentSections`/`joinContentSections` are exact inverses.
- `summary` is a real field because the absent one-liner needs a stable line; fallback for old templates is the first non-stub `[Personality]` bullet (`summaryFromContent`).
- Templates are **never mutated during play**. Each playthrough keeps a private clone in `characterTemplates[]`; in-play sheet edits touch the clone, and the library copy only changes on explicit **Save to Library** (`saveToLibraryAction`, update = upsert by id in `data/characters/<slug>/<slug>.json`, newVersion = new id + `version = max + 1` saved as `<slug>.v<N>.json` under the same `lineageId`).
- **Seed sync:** the committed library seed `data/characters/mira/mira.json` and the code-level `DEMO_TEMPLATE` (`src/engine/demoData.ts`, used as the default cast for fresh playthroughs) must be kept identical — update both when changing Mira's sheet.

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
- Model patches: `characterClothingAdd` (one item per slot), `characterClothingRemove` (by slot), `characterClothingSetState`, `characterClothingSet` (whole outfit). `characterSectionUpdate` with section `"Clothing"` is **redirected** into a full structured replace.
- Save to Library stores the current outfit as `startingClothing` with transient `state` cleared.

## 4. Presence gating — the scene rule

A cast character is **present** iff `instance.currentLocationId === playthrough.locationId` (exact match — no "nearby" tier; the location string IS the information).

- **Present** → full sheet + `[RUNTIME STATE]` (location, mood, toward player, clothing line, conditions, flags, memory) injected verbatim.
- **Absent** → one-liner under `ABSENT CHARACTERS (full sheets withheld — not at the current location):`
  `- Name (id) [towardPlayer] — summary; at LocationName (locId), conditions`
  (towardPlayer only when non-neutral; conditions only when non-empty; block omitted when nobody is away).
- **Gating is prompt-view only.** The `Allowed IDs` roster lists every instance id every turn, and all patches (`characterMood`, `characterConditions*`, `characterFlags*`, `characterMemory`, `characterLocation`, `characterClothing*`, `characterSectionUpdate`) work on absent characters. Engine state is always complete.
- Off-screen evolution is **model-driven**: the system prompt permits the model to evolve absent characters' mood/conditions/flags via patches; no engine timers.
- Background NPCs render one line each regardless of location; stale ones (never named in a chapter's messages or memory events, never at a visited location) are pruned at chapter close with a visible "faded from the story" note. Background NPCs can be promoted to main cast via the `npcPromote` patch (or UI action), creating a new template and instance while seeding `memorySummary` from their personality.

## 5. Memory model

- **Episodic:** playthrough-wide `memoryEvents` with `characterInstanceId` tags, retrieved per turn by semantic query (embedding) with keyword fallback (`retrieveMemoriesVector`), layered into `recent`/`compressed`. Retrieval is probabilistic — events surface only when relevant to the recent context.
- **Anchor:** `instance.memorySummary` is deliberately **kept** as the always-on relationship line (the retrieval system can't guarantee a character's current stance is recalled). Mood + towardPlayer do the same job more cheaply in the absent one-liner.
- Tagging rule for the model: always tag events with character names and location IDs — untagged events won't be recalled in the right context.

## 6. Prompting model

Injection order per character: template sheet (present only) → runtime state → memory anchor → (absent: one-liner). The full template, full memory log, and relationship history are never injected every turn. The state summary is built by `summarizePlaythrough`; the estimator prices present characters at full-sheet cost and absent characters as a capped one-liner, with `castPresence {present, absent}` exposed on `TokenUsage` for the Debug tab.
