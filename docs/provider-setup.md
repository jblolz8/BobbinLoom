# BobbinLoom — Provider Connections

---

## Overview

BobbinLoom stores **named provider connections** — each connection bundles a
label, base URL, API key, model, and generation parameters (temperature, max tokens,
context window). You can keep many connections configured (e.g. DeepSeek, Kimi, a local
LM Studio/Ollama server) and switch which one is **active** at any time.

- Every connection carries a **`kind`** — `text` or `image` — and each kind has its own
  active slot. The active **text** connection is the one the engine uses for all text
  generation; the active **image** connection is the one that renders pictures.
  Activating a connection fills the slot matching its kind, so a text connection can
  never take the image slot or vice versa. Image connections have their own fields and
  endpoints — see [`image-generation.md`](image-generation.md).
- Fresh installs start with **no connections** — there are no built-in seeds.
  Everything is user-created in Settings → Provider.
- The frontend never sees full API keys. Keys are stored server-side and shown only
  as a masked value (`••••1234`) in the UI.

---

## Where things live

- **Connections + active selection:** `data/providers.json` (created empty on first
  run; gitignored — never commit it). The file is at **`schemaVersion: 2`**: two
  independent active slots (`activeTextProviderId`, `activeImageProviderId`) and a
  `kind` (`text` / `image`) on every connection. A v0/v1 file is migrated on read — the
  original is archived to `.bak`, the old single `activeProviderId` becomes
  `activeTextProviderId`, `activeImageProviderId` starts empty, and every connection is
  stamped `kind: "text"`. An unreadable file is quarantined to `.bak`; a schema-invalid
  one is salvaged (valid connections kept, invalid dropped) with a warning banner in
  Settings.
- **App settings:** `DEFAULT_APP_SETTINGS` (`src/server/appSettingsStore.ts`) is the
  fresh-install source of truth; the committed `data/settings.json` is only a matching
  template, and user changes (`defaultPresetId`, theme, avatar shape, `tagTaxonomy`)
  are written to the gitignored `data/user-settings.json` and merged over the defaults
  on read. Legacy provider fields were removed; a bare legacy settings file is ignored
  rather than migrated.

---

## Getting started

Fresh installs start with an **empty registry** — no connections are pre-seeded.
Open **Settings → Provider** and click **+ Add connection** to create your first
one, then **Activate** it. Until a connection exists, the engine falls back to the
built-in **Mock provider** (no API key, no network).

Every connection — including any you create — can be edited, **duplicated**
(an editable copy with the same base URL, model, and stored API key), or
**deleted** at any time, including the active one (deleting it just drops the app
back to the Mock provider until you add another).

## Adding your own connection

In **Settings → Provider → Add connection**, provide:

- **Name** — a label (e.g. `Local LM Studio`). The connection id is derived from it.
- **Base URL** — e.g. `http://localhost:1234/v1`. A trailing `/v1` is appended
  automatically if missing.
- **API Key** — optional (some local servers need none). Stored server-side,
  masked by default. Click **Show** to reveal the full stored key (fetched on
  demand); **Hide** clears it from the form again. **Clear stored key** removes it.
- **Model** — the model id the server serves. Use **Fetch models** to pull the
  available model list from the server (via `GET <baseUrl>/models`) and pick one
  from the dropdown — it fills the field automatically. The list is also loaded
  automatically when you edit an existing connection or after a successful
  **Test connection**. The field stays free-text if you'd rather type the id.
- **Temperature / Max Tokens / Context Window** — generation defaults.

Click **Test connection** to verify reachability + auth: BobbinLoom issues a
`GET <baseUrl>/models` request and reports success/failure and latency. This is a
lightweight check that does **not** spend a generation turn.

JSON output is handled automatically: every generation request asks the model for
JSON (`response_format`), and if the server rejects that parameter, BobbinLoom
retries the request once without it — no configuration needed.

Press **Save** to store it, then **Activate** to make it the active connection.

You can also **Edit**, **Duplicate** (creates an editable copy with the same base
URL, model, and stored API key), or **Delete** any connection — including the
active one and the last remaining one (deleting just drops the app back to the
Mock provider until you add another).

### API key storage

Stored API keys are **encrypted at rest** (AES-256-GCM) inside `data/providers.json`,
using a per-machine key in `data/.providers-key` (created on first use, gitignored).
The full key is only ever sent to the client when you explicitly click **Show**.
If the vault key file is lost or corrupt, stored keys become unreadable — you'll
need to re-enter them (the connections themselves are unaffected).

---

## Image providers

Image generation (see [`image-generation.md`](image-generation.md)) uses its own
**image connections**, configured under **Settings → Provider → Image Providers**. They
are ordinary registry entries with `kind: "image"` — a name, base URL, API key and model
id, plus the image-only fields below. The same **+ Add connection** / **Edit** /
**Duplicate** / **Delete** / **Activate** actions apply as for text connections, and an
image connection is never used for a text turn (the kind filter is mandatory on every
accessor).

| Field | What it does |
|---|---|
| **API Style** | The endpoint dialect. **OpenAI-compatible** (the default) posts to `<baseUrl>/images/generations`; **Venice** posts to `<baseUrl>/image/generate`. Venice sends negative prompts, seeds, variants and style presets; OpenAI-compatible sends none of them. |
| **Image Size** | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `1024x1792`, `1792x1024`, or a value you type. `auto` lets the provider choose. |
| **Aspect Ratio** | Used **instead of** Image Size for models that reject `width`/`height` (the Venice qwen-image family). Leave empty to send the size. |
| **Style Preset** | Venice only. Sent as `style_preset`. |
| **Variants** | 1–4. Every rendered variant is kept on the message. |
| **Hide Watermark** | Venice only. Requests results without the Venice watermark. |
| **Safe Mode** | Ask the provider to blur adult content. Off by default; leave it off for this project. |
| **Prompt writer** | Which **text** connection writes the image prompt. Defaults to the current active text provider (stored as `null`); a dangling id also falls back to the active text provider. A prompt writer is required — with no text connection at all, image generation answers 400. |

**Model listing.** **Fetch models** works on an image connection too, and asks for the
*image* model family (`GET <baseUrl>/models?type=image`) — that is how image checkpoints
are listed on providers exposing more than one family. **Test connection** still issues a
plain `GET <baseUrl>/models` reachability + auth check.

Image connections store every shared field (name, base URL, model, temperature, max
tokens, context window) plus the ones above; the image-only fields are simply absent on
text rows.

---

## Environment variables (optional)

```env
BOBBINLOOM_MAX_RETRIES=1
BOBBINLOOM_TIMEOUT_MS=120000
BOBBINLOOM_IMAGE_MAX_RETRIES=1
BOBBINLOOM_IMAGE_TIMEOUT_MS=180000
```

`BOBBINLOOM_MAX_RETRIES` and `BOBBINLOOM_TIMEOUT_MS` tune request behaviour for every
**text** connection — including the image-prompt side call, which is a text call.
`BOBBINLOOM_IMAGE_MAX_RETRIES` (default 1) and `BOBBINLOOM_IMAGE_TIMEOUT_MS` (default
180000) tune the **image** render calls only, which get their own budget because a local
diffusion queue or an image lane routinely blows past the 120 s text default. All other
provider configuration (base URL, model, API key, params)
lives in the connection itself — the legacy env-var path (`BOBBINLOOM_PROVIDER`,
`DEEPSEEK_API_KEY`, `KIMI_API_KEY`, `CUSTOM_OPENAI_API_KEY`, `BOBBINLOOM_MODEL`,
`BOBBINLOOM_BASE_URL`, etc.) was removed Aug 2026.

---

## Output contract

The provider asks the model to return JSON:

```json
{
  "narrative": "Story text shown to the user.",
  "choices": ["Optional choice"],
  "statePatch": {
    "flagsAdd": [],
    "inventoryAdd": [],
    "questUpdate": []
  }
}
```

The engine still validates `statePatch`. The provider does not apply state changes
directly. If the provider returns invalid JSON, BobbinLoom falls back to showing the
raw text as narrative and ignores the state patch for that turn.

---

## Provider interface surface

Beyond turn generation, the active provider implements a **broader interface**
(`src/server/provider.ts`, `TurnProvider`). All of these are routed through the
active connection (or the built-in Mock provider, which throws "not available"
for the AI-only ones):

| Method | Used by |
|---|---|
| `generateTurn` | Main turn generation (state patch + narrative) |
| `generateScenarioSeed` | Scenario generation (setup "Generate Scenario") |
| `summarizeChapter` | Chapter summarization |
| `compactStorySoFar` | Story-so-far compaction (rolling meta-summary) |
| `embedTexts` | Memory event embeddings (semantic retrieval; falls back to keyword when empty) |
| `generateCharacterSheet` | NPC promotion / sheet drafting |
| `refineCharacterSheet` | Targeted sheet edits from user feedback |
| `suggestCharacterTags` | **AI tag suggestion** in the character library (`POST /api/characters/suggest-tags`) |
| `brainstormCharacter` | **AI brainstorming assistant** for character cards (`POST /api/characters/brainstorm`) |

The two library features (tag suggestion and brainstorming) are documented in
`character-library.md`.

Image generation is deliberately **not** part of this interface: it is a separate
`ImageProvider` (`src/server/imageProvider/types.ts`) chosen per image connection, so
adding it never forces a stub into every turn mock. See
[`image-generation.md`](image-generation.md).

### Scenario opening modes

"Generate New Scenario" offers two opening modes (Setup form):

- **Quick start** — one model call: the scenario seed is created and the seed's
  `openingText` becomes the single first message. Faster/cheaper, less fleshed out.
- **Fleshed-out opening** (default) — two calls: the scenario is generated, then a
  setting-aware opening turn (`buildOpeningPrompt(setting, seed)` + `executeTurn`)
  writes a richer first scene. Both modes produce exactly **one** first message.

When a cast is selected, the seed generation receives the chosen characters
(`preferences.cast`) so it doesn't invent a conflicting lead, and the selected
library card is reused as the lead rather than cloned.

---

## Current limitations

- non-streaming only
- chat completions only
- no provider-specific tool calling
- no image inputs (vision input; image *generation* is an output feature — see
  [`image-generation.md`](image-generation.md))
- one active connection per kind — one text, one image (per-playthrough selection is a
  future feature)
