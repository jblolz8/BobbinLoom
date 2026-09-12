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
| **API Style** | The endpoint dialect. **OpenAI-compatible** (the default) posts to `<baseUrl>/images/generations`; **Venice** posts to `<baseUrl>/image/generate`; **Automatic1111 / Forge (local)** posts to `<baseUrl>/sdapi/v1/txt2img`, the WebUI's own API — which must be started with `--api`. Venice sends negative prompts, seeds, variants and style presets; OpenAI-compatible sends none of them; Automatic1111 sends negative prompts, seeds, variants, steps/CFG/sampler/scheduler and a per-request checkpoint. |
| **Image Size** | `auto`, `1024x1024`, `1536x1024`, `1024x1536`, `1024x1792`, `1792x1024`, or a value you type. `auto` lets the provider choose. |
| **Aspect Ratio** | Used **instead of** Image Size for models that reject `width`/`height` (the Venice qwen-image family). Leave empty to send the size. |
| **Style Preset** | Venice only. Sent as `style_preset`. A select of the provider's own values (see **Style list** below) plus **None** (= send nothing) and a **Custom…** escape hatch. Values are **case-sensitive and title-cased** upstream — `anime` is rejected with a 400 — and a saved value the provider does not list is flagged in the editor. |
| **Variants** | 1–4. Every rendered variant is kept on the message. |
| **Hide Watermark** | Venice only. Requests results without the Venice watermark. |
| **Safe Mode** | Ask the provider to blur adult content. Off by default; leave it off for this project. |
| **Steps** | Automatic1111 only. 1–150, sent as `steps`. **Empty sends nothing**, so the WebUI's own default applies. |
| **CFG scale** | Automatic1111 only. 0–30, sent as `cfg_scale`. Empty sends nothing. |
| **Sampler** | Automatic1111 only. Sent as `sampler_name`. Free text, with the names the WebUI itself listed offered as suggestions — a fork's own names may be typed. |
| **Scheduler** | Automatic1111 only. Sent as `scheduler`. Free text, same rule as Sampler. |
| **Timeout (seconds)** | Automatic1111 only. How long one image may take, stored in milliseconds. Empty uses the dialect default — **10 minutes** — because a local render easily outlasts the global 180 s. |

**Aspect Ratio, Style Preset, Hide Watermark and Safe Mode are hidden** on an
`Automatic1111 / Forge` connection: the WebUI has no `aspect_ratio`, `style_preset`,
`hide_watermark` or `safe_mode` parameter, so the editor does not show a control that would
send nothing.
| **Prompt writer** | Which **text** connection writes the image prompt. Defaults to the current active text provider (stored as `null`); a dangling id also falls back to the active text provider. A prompt writer is required — with no text connection at all, image generation answers 400. |

**Model listing.** **Fetch models** works on an image connection too, and asks for the
*image* model family (`GET <baseUrl>/models?type=image`) — that is how image checkpoints
are listed on providers exposing more than one family. **Test connection** still issues a
plain `GET <baseUrl>/models` reachability + auth check.

**Style list.** On a Venice connection the **Style Preset** field is a select populated
from `GET <baseUrl>/image/styles`. That endpoint is **keyless** — BobbinLoom's
`POST /api/settings/providers/image-styles` sends the Authorization header only when a key
is available — so the list loads when the connection is opened, before anything is saved
(the store's key is used when there is one). **Fetch styles** re-runs it manually.

The values are the provider's own, in the provider's order, and they are **case-sensitive
and title-cased** (`Anime`, not `anime`). **None** sends no `style_preset` at all (an empty
value is omitted from the request body, never sent as `""`), and **Custom…** falls back to
the old free-text field for an endpoint that does not implement the listing. A connection
whose stored value is not in the fetched list is warned about in the editor, because that
value is a 400 waiting to happen — and by then the text call that wrote the prompt has
already run.

### Local AUTOMATIC1111 / Forge

A locally hosted AUTOMATIC1111 (or Forge) WebUI can render BobbinLoom's prompts over the
WebUI's **own** `/sdapi/v1/*` API. It is a different dialect from the other two — its base URL
is the **WebUI root**, not an OpenAI-style `/v1` — and it is the only dialect that reports live
progress and can actually interrupt a render.

**Start the WebUI with `--api`. It is mandatory.** Without that flag every `/sdapi/v1/*` route
answers **404**, which looks like a wrong URL rather than a missing flag — so BobbinLoom names
the cause in its own error text:

```
A1111 image provider error 404: <body> — the WebUI must be started with --api — without it every /sdapi/v1/* route answers 404
```

The same hint comes back from **Fetch models** and **Test connection**, which both probe
`GET /sdapi/v1/sd-models`.

```sh
# Linux / macOS
./webui.sh --api

# Windows — add --api to COMMANDLINE_ARGS in webui-user.bat
set COMMANDLINE_ARGS=--api
```

**`--listen` when BobbinLoom runs on another machine.** The WebUI binds `127.0.0.1` by
default, so only a BobbinLoom on the same host can reach it. Add `--listen` (plus `--port` if
you moved it) and enter that machine's address as the base URL. A same-machine install needs
neither flag.

**Auth is optional, and the key field carries both kinds.**

| WebUI flag | What to enter in **API Key** | What is sent |
|---|---|---|
| *(none — the default)* | leave blank | no `Authorization` header |
| `--api-auth user:pass` | `user:pass` — **with the colon** | `Authorization: Basic <base64>` |
| `--api-key <token>` (newer builds, Forge) | the token alone — **no colon** | `Authorization: Bearer <token>` |

The colon is the whole rule: an a1111 key containing a `:` is sent as HTTP Basic, anything
else as Bearer, because `user:pass` cannot be mistaken for a token and a token never contains
one. The models probe uses the same rule as the adapter, so testing and rendering can never
disagree about how a key is presented.

**No CORS configuration is needed.** BobbinLoom calls the WebUI from its **own server
process**, not from the browser, so the WebUI never sees a cross-origin request and its
`--cors-allow-origins` flag is irrelevant to this integration.

**The settings to enter** (Settings → Provider → Image Providers → Add connection):

| Field | Value |
|---|---|
| Name | anything, e.g. `Local A1111` |
| API Style | **Automatic1111 / Forge (local)** |
| Base URL | `http://127.0.0.1:7860` — the WebUI **root**, with **no `/v1`** (a `/v1` suffix turns every path into `/v1/sdapi/v1/…`, which 404s) |
| API Key | blank for a default local install |
| Checkpoint | **Fetch models** lists what `GET /sdapi/v1/sd-models` returns, in the WebUI's own order (recently used first). Leaving it **empty is fine** — the checkpoint is then not overridden at all and the WebUI renders with whatever it already has loaded (a text connection, by contrast, still requires a model) |
| Image Size | `auto` sends no size, so the WebUI's own canvas applies; anything else is parsed into `width`/`height` |
| Steps / CFG scale / Sampler / Scheduler | all optional — **an empty field is not sent at all**, so the WebUI's own tuning applies. Sampler and Scheduler are pickers: their options are the names the WebUI reports from `/sdapi/v1/samplers` and `/sdapi/v1/schedulers`, with a *WebUI default* choice that sends nothing. A build that lists neither falls back to a free-text field |
| Seed | blank = random (sent as `-1`). **`0` is a real seed here**, unlike Venice |
| Variants | batch size, 1–4: one request renders the whole batch |
| Timeout (seconds) | blank = **600 s (10 min)** for this dialect — the global 180 s would cut a healthy local render off mid-sampler |

**Test connection** runs the same `/sdapi/v1/sd-models` probe, so a missing `--api`, a wrong
port or a bad key surfaces there before anything is generated.

**The WebUI keeps its own copy of every image.** BobbinLoom stores the bytes it receives,
content-addressed, under `data/images/` — and it deliberately does **not** send
`do_not_save_samples`, so one render leaves a file in both `data/images/` and the WebUI's own
output folder. Removing an image from a message (or the orphan sweep) only ever touches
BobbinLoom's copy; delete freely on either side.

**Local model notes** (general SD advice, not BobbinLoom behaviour): Pony-derived checkpoints
(AutismMix and friends) expect their score tags (`score_9, score_8_up, score_7_up`) in the
prompt. v-prediction checkpoints (e.g. NoobAI-XL vPred) generally render better with CFG
**4–6** and an Euler-family sampler.

Image connections store every shared field (name, base URL, model, temperature, max
tokens, context window) plus the ones above; the image-only fields are simply absent on
text rows.

### Forge Couple (per-character regions)

**Optional — BobbinLoom renders without it.** [Forge Couple](https://github.com/Haoming02/sd-forge-couple)
is a WebUI extension that conditions each part of the canvas on its own line of the
prompt. That is what stops a two-character scene from mixing the two people's hair, eye
colour and clothing. BobbinLoom's image instruction already groups the characters for it
(see [`image-generation.md`](image-generation.md) → *Multi-character regions*); the
extension is what turns those groups into regions on the wire. **It is not a BobbinLoom
setting** — install it in the WebUI, or not at all.

**Install it** (WebUI side only):

1. Open the WebUI's **Extensions** tab → **Install from URL**.
2. Paste `https://github.com/Haoming02/sd-forge-couple` into *URL for extension's git
   repository* and click **Install**.
3. Go to the **Installed** tab and click **Apply and restart UI** — a plain **Reload UI**
   does not pick up a brand-new extension. Restarting the WebUI process works too, and so
   does `git clone` into its `extensions/` folder.
4. Nothing to configure. BobbinLoom finds the extension by itself through
   `GET /sdapi/v1/script-info`; the extension's own accordion in `txt2img` can stay
   untouched, because the request carries its settings explicitly.

**It is NOT installed on this instance yet, so nothing has changed.** Regions are
currently disabled in practice: on every render the adapter checks the extension first
(the image connection's **Regions** setting is on by default, but that switch alone engages
nothing), finds no listing, and sends exactly the body it sent before the feature existed
— same fields, no error, no failed or slower generation, and a one-character scene takes
that same path even with the extension installed. BobbinLoom re-checks a given WebUI at
most every **~5 minutes**, so a freshly installed extension may take that long to be
noticed; restarting BobbinLoom's server makes it immediate.

**Builds it is known to target.** The extension's own README covers the Forge WebUI (Forge
Classic / Forge Neo) and SD1/SDXL checkpoints. If a given build cannot load it, nothing
breaks: the payload is only ever sent when `/sdapi/v1/script-info` actually lists it, so
the failure mode is *no regions*, never a failed render (an `alwayson_scripts` key the
WebUI does not know is an HTTP **422**). See
[`image-generation.md`](image-generation.md) → *Multi-character regions* for what engages
regions, the Horizontal/Vertical direction and the background line.

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
diffusion queue or an image lane routinely blows past the 120 s text default. The image timeout default is **dialect-aware**: 180000 ms normally, **600000 ms (10 minutes) for an `Automatic1111 / Forge` connection**, whose editor also carries a per-connection **Timeout** field. Precedence is connection → env var → dialect default. All other
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
