# BobbinLoom — Character Library, Tags & AI Assist

---

## Overview

The character library is a **Booru-style gallery** of reusable character cards —
browse/search by tag, view avatars, import cards from SillyTavern/CCv2 formats,
and run **AI-assisted** workflows on them: automatic **tag suggestion**, an
interactive **brainstorming assistant**, and **CCv2 → BL conversion**.

Everything here lives in the **library** (`data/characters/…`) — a persistent,
editable collection — as opposed to a *playthrough's* cast (which is a private
snapshot of templates). The two connect via **Save to Library** from the sheet UI.

---

## 1. Storage — folder-per-entity

Each character is a **folder** under `data/characters/<slug>/`:

```
data/characters/mira/
  mira.json        # the BL character template record
  mira.png         # optional avatar (shown in the gallery)
  mira.v2.json     # older versions kept under the same lineageId (Save to Library → newVersion)
```

- **`<slug>.json`** — the canonical BL record (see `character-format.md` schema).
- **`<slug>.bl.json`** — a *sidecar* written transiently when a **CCv2 card is
  imported** but not yet converted. On successful **apply**, the converted record
  becomes `<slug>.json` and the stale `.bl.json` sidecar is removed, so the
  library reads exactly **one** record per card.
- **`<slug>.png`** — avatar image for imported PNG cards / uploads.
- **`.bak` folders** — corrupt files are quarantined (renamed with a `.bak`
  suffix) rather than failing the whole load; deleted entities are quarantined
  to `<slug>.bak/` so nothing is silently lost.

The store tolerates a corrupt file inside a folder (quarantines it and loads the
rest) and reports the quarantine path in the log.

---

## 2. Tags

Tags are **`string[]`** stored on the character template. Two shapes:

| Shape | Example |
|---|---|
| Namespaced | `species:fox`, `rating:nsfw`, `theme:enchantress`, `copyright:pokemon` |
| Standalone | `nsfw`, `elf`, `adventurer`, `submissive` |

Tags drive the library's **search + sidebar filtering**, and each tag renders
with a **color derived from its category** (see below).

---

## 3. Tag taxonomy & color engine

`src/engine/tagTaxonomy.ts` resolves a raw tag string into a styled, categorized
`TagStyle` — namespace, category, label, and colors. **Built-in categories** ship
with prefix lists and hex colors:

| Category | Prefixes |
|---|---|
| Rating: NSFW | `rating` (+ standalone `nsfw`, `explicit`, `lewd`, `18+`, …) |
| Rating: SFW | `rating` (+ standalone `sfw`, `safe`, `general_audience`, …) |
| Copyright & Franchise | `copyright`, `franchise`, `series`, `origin`, `fandom`, `universe`, `anime`, `game`, `novel` |
| Character & Persona | `character`, `char`, `persona`, `who` |
| Species & Race | `species`, `race`, `monster`, `creature`, `beast`, `subspecies` |
| Artist & Creator | `artist`, `creator`, `author`, `illustrator`, `circle` |
| Theme & Class | `theme`, `class`, `role`, `element`, `genre`, `setting`, `job`, `archetype`, `style`, `magic` |
| Meta & System | `meta`, `source`, `status`, `version`, `bl`, `ccv2`, `format` |
| General | (no prefix) — catch-all |

**Resolution order** (`resolveTagStyle`): user **tag overrides** → namespaced
`rating:*` → standalone ratings → prefix match against **custom categories** →
prefix match against **built-in** categories → unrecognized prefix (dynamically
generated stable color) → General. A raw tag's `namespace` is the part before the
first `:`, its `value` the part after.

### Customization (Settings → Taxonomy)

The taxonomy is **user-configurable** and persisted in `data/settings.json`
under `tagTaxonomy`:

```ts
type TagTaxonomyConfig = {
  customCategories: Array<{ id; label; prefixes: string[]; color; description? }>;
  tagOverrides: Record<string, string>; // rawTag -> categoryId OR hex color
};
```

- **Custom categories** — define your own prefix sets with a color; matching tags
  group under them in the sidebar and filter UI.
- **Tag overrides** — pin a specific tag to a category id, or give it a custom
  hex color directly.
- The engine applies user config **before** built-in categories, so overrides and
  customs win.

---

## 4. CCv2 card import & conversion

Import accepts a **PNG with embedded `chara` JSON** (tEXt/iTXt chunk) or a
**standalone JSON** card (V1 flat or V2 structured). The route allows multi-MB
uploads (`bodyLimit: 10MB`) because card PNGs exceed the default 1MB.

- **Dedup:** importing a card whose name+creator already exists as a converted
  BL record is a no-op (`already_converted` notice).
- **Avatar:** the imported PNG is served as the character's avatar via
  `GET /api/characters/:id/avatar`; non-PNG / non-CCv2 records 404 and the
  client falls back to a letter placeholder. The path is resolved from the
  record, never the request, so the slug can't read arbitrary files.
- **Read-only sheets:** a character backed by an un-converted CCv2 card has a
  **read-only sheet** — `content`/`clothing` edits are rejected (both at the
  engine `applyStatePatch` level and the PUT route). Runtime fields (mood,
  towardPlayer, memorySummary, conditions, flags, location) and name remain
  editable.
- **Not cast-selectable:** CCv2 cards are **disabled in the Setup cast picker**
  (with a "Convert to BL first to be able to select" warning) and `resolveCast`
  skips them server-side, so they can never enter a playthrough cast. Convert the
  card to BL before you can start a scenario with it.

### Conversion (`POST /api/characters/:id/convert`)

Two actions, driven by the two-pane diff UI:

- `generate` — ask the LLM to draft the BL sheet from the CCv2 content, with
  optional `feedback` + `currentContent` for targeted retries. An optional
  `format` targets a specific character format (defaults to the active preset's).
- `apply` — commit a generated `content` (the diff's edited pane), update the
  record, and remove the stale `.bl.json` sidecar.

The UI shows a **true two-pane git-style side-by-side diff** (BL / Original /
Both tabs) before applying. A **format picker** beside the action lets you choose
which preset's sheet structure to target, defaulting to the active preset.

### Reformat (`POST /api/characters/:id/reformat`)

For **native BL records** whose sheet no longer matches the selected format, the
edit view shows **"Update into Newer Format with AI"**. It restructures the stored
sheet into the target format with the same preview/accept diff flow — never a
blind overwrite:

- `generate` — restructure the sheet into the target `format`; optional
  `feedback` + `currentContent` for targeted retries.
- `apply` — commit the accepted `content` to the record.

CCv2 sheets are rejected here ("convert to BL first").

---

## 5. AI tag suggestion

`POST /api/characters/suggest-tags` → `provider.suggestCharacterTags(...)`.

Takes the sheet (`name`, `content`), optional `creatorNotes`, `currentTags`,
`guidance`, and the **existing library taxonomy** (`libraryTags`) as context, and
returns `string[]` of suggested tags. The model proposes tags consistent with the
existing library vocabulary (so it doesn't invent wildly off-taxonomy tags).

---

## 6. AI character brainstorming assistant

`POST /api/characters/brainstorm` → `provider.brainstormCharacter(...)`.

An **interactive, chat-style** refinement session for a character card. Request:

```ts
{
  character: { name; content; creatorNotes?; tags?; ccv2Content? },
  chatHistory: [{ role: "user"|"assistant"; content }],  // for multi-turn context
  userMessage: string,
  includeOriginalCard?: boolean   // attach the raw CCv2 content for reference
}
```

Response:

```ts
{
  reply: string,   // prose answer / suggestions
  proposedChanges?: {
    sections?: ProposedSectionChange[];  // [{ header, body }] — editable sheet sections
    name?: string;
    creatorNotes?: string;
    tags?: string[];
    fullContent?: string;               // full-content replacement
  }
}
```

The assistant can propose **targeted section edits** (which the user can apply
one-by-one into the editor), tag changes, a rename, or a full-content rewrite.
When the character is CCv2-backed, `includeOriginalCard` lets the model ground
suggestions in the original card while the live sheet stays read-only until the
user applies changes.

---

## 7. API surface (character library)

| Method & path | Purpose |
|---|---|
| `GET /api/characters` | list templates |
| `GET/POST /api/characters`, `PUT/DELETE /api/characters/:id` | CRUD |
| `POST /api/characters/import` | import CCv2 PNG/JSON card (10MB bodyLimit) |
| `GET /api/characters/:id/avatar` | serve card avatar PNG |
| `POST /api/characters/:id/convert` | CCv2→BL `generate` / `apply` |
| `POST /api/characters/:id/reformat` | BL sheet → target format `generate` / `apply` |
| `POST /api/characters/suggest-tags` | AI tag suggestion |
| `POST /api/characters/brainstorm` | AI brainstorming assistant |
| `PUT /api/playthroughs/:id/characters/:characterId` | edit runtime/template fields (guards read-only CCv2 sheets) |
| `POST /api/playthroughs/:id/characters/:characterId/save-to-library` | Save to Library (`update`/`newVersion`) |

---

## Data files

- `data/characters/<slug>/` — library records, avatars, versioned templates.
- `data/settings.json` — `tagTaxonomy` (custom categories + tag overrides) lives here, alongside `defaultPresetId`.
