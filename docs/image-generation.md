# BobbinLoom — Image Generation

How an assistant message becomes a stored image file: the two image-provider dialects, the text → image-prompt call, the review modal, and the content-addressed store that holds the bytes.

Source of truth: `src/server/routes/images.ts` (the endpoints), `src/server/imageProvider/` (`index.ts`, `types.ts`, `shared.ts`, `openaiImagesProvider.ts`, `veniceImageProvider.ts`), `src/server/provider/imagePrompt.ts` (the prompt side call), `src/server/imageStore.ts` (content-addressed storage + orphan sweep), `src/engine/imageDefaults.ts` and `data/prompt-presets.json` (preset prompt config), `src/client/components/views/PlayView/` (the chat surface). Related: [`provider-setup.md`](provider-setup.md) (connection registry v2), [`prompt-architecture.md`](prompt-architecture.md) (why the prompt call is a side call).

---

## What it does

An image is generated **per assistant message**. Two connections are involved and they are independent:

- a **text connection** writes the image prompt (this is the connection's own `/chat/completions` call, a *side call* — see below), and
- an **image connection** renders the image (its `apiStyle` picks the dialect, see below).

Only assistant messages can carry images (`images attach to assistant messages only`). Generated images are stored as content-addressed files under `data/images/` and referenced from the message, so the playthrough record only carries file names and metadata — never the bytes.

Nothing about image generation runs during a turn. The prompt call is not part of the turn message array and does not touch the turn counter, snapshots, world state, or the token meter. See [`prompt-architecture.md`](prompt-architecture.md) → *Side calls*.

---

## The two connection dialects

Image connections are plain entries in the provider registry (`data/providers.json`, `schemaVersion: 2`) with `kind: "image"`. They carry the shared connection fields (`baseUrl`, `apiKey`, `model`, …) plus the image-only fields below. `apiStyle` selects the dialect; absent means `openai`.

| Field | Values | Meaning |
|---|---|---|
| `apiStyle` | `"openai"` (default) \| `"venice"` | Endpoint dialect. Absent = `openai`, the conservative default — it never sends a field the endpoint might reject. |
| `safeMode` | boolean, absent = `false` | Ask the provider to blur/moderate adult content. Off by default: this is an adult-content project and the blur is a footgun. |
| `size` | `"auto"` \| `"1024x1024"` \| `"1536x1024"` \| … | `openai` sends it verbatim as `size` (`"auto"` included); `venice` parses it into `width`/`height` and **drops it entirely** when it is `"auto"` or unparseable — the provider then picks. |
| `aspectRatio` | string, e.g. `"3:2"` | Venice only. Used **instead of** `size` for models that reject `width`/`height` (the qwen-image family). |
| `promptProviderId` | text connection id, or `null` | Which text connection writes the prompt. Absent/null = the current active text connection. A dangling id falls back to the active text connection rather than erroring. |
| `stylePreset` | a value the provider itself lists, e.g. `"Anime"` | Venice only. Sent as `style_preset`. **Case-sensitive and title-cased upstream**: `anime` is a 400 (`Invalid style requested`). The list comes from the keyless `GET {baseUrl}/image/styles`, and the connection editor fills a select from it (with **None** and a **Custom…** escape hatch). An **empty value is omitted** from the body rather than sent. |
| `hideWatermark` | boolean | Venice only. Sent as `hide_watermark: true` (only when on). |
| `variants` | integer 1–4 | How many images one request renders. Every returned variant is kept. |
| `seed` | integer, absent = random | Venice only. Sent as `seed` with **every** generation this connection makes, so re-rolls of the same prompt are comparable. **Absent (or `0`, which Venice documents as "pick one at random") means the provider picks** — and then the stored image carries no seed at all. The OpenAI-compatible dialect has no seed field, so a seed set here is simply ignored by it. Editable in the connection editor next to Variants; an emptied field **clears** the stored value rather than storing `0`. |

### `openai` — OpenAI-compatible

`POST {baseUrl}/images/generations` (`baseUrl` is normalized with a trailing `/v1` when missing). One image per request; no negative prompt — that is the whole reason the Venice-native dialect exists.

```json
{
  "model": "flux-dev",
  "prompt": "anime style rain-slick cobblestones, a lone figure under a flickering neon sign, wide shot, night",
  "size": "1024x1024",
  "response_format": "b64_json",
  "output_format": "png",
  "moderation": "auto",
  "n": 1
}
```

| Body field | Source | Notes |
|---|---|---|
| `model` | connection | |
| `prompt` | composed prompt | Clamped to **1500** characters (`OPENAI_IMAGE_PROMPT_CAP`). Applied to the *composed* text so a long prefix or a long edit can never 400 the call. |
| `size` | `req.size ?? connection.size ?? "auto"` | |
| `response_format` | constant `"b64_json"` | |
| `output_format` | constant `"png"` | |
| `moderation` | `safeMode ? "auto" : "low"` | Venice maps `"low"` → no adult-content blur; OpenAI ignores the field. |
| `n` | constant `1` | |

**Response shape** — the bytes come from `data[0].b64_json`, or from a data URL in `data[0].url`. A plain `http(s)` URL is treated as **no image data** (the adapter does not chase remote URLs). The returned bytes are magic-byte sniffed for the extension (`image/png`, `image/jpeg`, `image/webp`, falling back to `image/png`).

### `venice` — Venice-native

`POST {baseUrl}/image/generate`. This dialect exists for `negative_prompt`, and adds seed, variants, style preset and safe mode passthroughs.

```json
{
  "model": "flux-dev",
  "prompt": "anime style rain-slick cobblestones, a lone figure under a flickering neon sign, wide shot, night",
  "negative_prompt": "lowres, bad anatomy, bad hands, extra fingers, extra limbs, deformed, poorly drawn face, bad proportions, watermark, signature, text, jpeg artifacts",
  "format": "png",
  "return_binary": false,
  "variants": 1,
  "seed": 0,
  "safe_mode": false,
  "style_preset": "anime",
  "hide_watermark": true,
  "aspect_ratio": "3:2"
}
```

| Body field | Source | Notes |
|---|---|---|
| `prompt` | composed prompt | Clamped to **7500** characters (`VENICE_IMAGE_PROMPT_CAP`). |
| `negative_prompt` | composed negative | Only sent when non-empty; also clamped to 7500. |
| `format` | constant `"png"` | |
| `return_binary` | constant `false` | Base64 in JSON, not raw bytes. |
| `variants` | `req.variants ?? connection.variants ?? 1` | |
| `seed` | request `seed` → connection `seed` → none | **`0` means random** (documented). A connection `seed` therefore makes every generation reproducible; with neither, the body still carries `0` and the adapter reports **no seed**, so the stored ref never claims `0` as a seed. |
| `safe_mode` | connection `safeMode` | Absent = `false`. |
| `style_preset` | connection | Only sent when set — an empty value is omitted, never sent as `""`. A value the provider does not list is rejected with a 400 that lands **after** the prompt call has already been paid for, which is why the connection editor offers the provider's own list instead of free text. |
| `hide_watermark` | connection | Only sent as `true` when on. |
| `aspect_ratio` | connection | Optional. **Mutually exclusive with `width`/`height` upstream** — sending both is what a 400 from the qwen-image family looks like, so the adapter sends one or the other. |
| `width` / `height` | parsed from `size` | Only when no `aspectRatio` is set and `size` parses as `NNNxNNN`. |

**Response shape** — `images`, an array of base64 strings (one per variant), plus a `timing` object; `timing.total` is used as the reported duration when it is a number. An empty or missing `images` array is an error (`Image provider returned no image data`).

### Timeouts and retries

Image requests get their own budget, because local diffusion queues and Venice's image lane both blow past the 120 s text default:

```env
BOBBINLOOM_IMAGE_TIMEOUT_MS=180000
BOBBINLOOM_IMAGE_MAX_RETRIES=1
```

Defaults are **180000 ms** and **1** retry. Only the image provider calls use this budget — the prompt-writing call is a text call and uses `BOBBINLOOM_TIMEOUT_MS` / `BOBBINLOOM_MAX_RETRIES`. Retryable statuses are 429, 500, 502, 503 and 504; retries are capped deliberately low because a 60-second generation is not something to repeat twice.

---

## The pipeline: button to stored file

| Endpoint | Purpose |
|---|---|
| `GET /api/images/:file` | Serve stored bytes. The file name *is* the hash, so the response is `Cache-Control: public, max-age=31536000, immutable`. A name that does not match `^[a-f0-9]{64}\.(png\|jpg\|webp)$` is a 404 before any filesystem call. |
| `POST /api/playthroughs/:id/messages/:messageId/image/prompt` | Dry run: compose the prompt, generate nothing. |
| `POST /api/playthroughs/:id/messages/:messageId/image` | Compose (or take) the prompt, render the image, store it, append the ref. |
| `DELETE /api/playthroughs/:id/messages/:messageId/images/:file` | Drop one image ref, then sweep. Idempotent. |
| `POST /api/settings/images/sweep` | Manual orphan sweep. |

The generate body is `z.object({ imageProviderId?, promptOverride?, negativeOverride?, seed? })` — all optional. A request `seed` wins over the connection's `seed`; with neither, the provider picks at random and the ref stores nothing. The response is:

```json
{
  "playthrough": { "...": "the updated record" },
  "image": { "file": "<sha256>.png", "prompt": "…", "negativePrompt": "…", "providerId": "…", "model": "…", "seed": 1234, "durationMs": 8123, "request": "{\"model\":\"…\",\"prompt\":\"…\"}", "promptRequest": "{\"model\":\"…\",\"max_tokens\":12000,\"response_format\":{\"type\":\"json_object\"}}", "promptResponse": "{\"choices\":[{\"message\":{\"content\":\"…\"}}]}", "createdAt": "2026-09-12T00:00:00.000Z" },
  "promptUsed": "anime style …",
  "negativeUsed": "lowres, bad anatomy, …"
}
```

`promptUsed` / `negativeUsed` are exactly the strings the route handed to the image provider — already prefix-composed, already clamped to the preset's soft limit **and** the dialect's hard cap. `image` is the first variant when `variants > 1`; the rest are appended to the message in the same order.

### Preview ON — the default path

`Settings → Chat → Review Image Prompt Before Generating` is **on by default**. The pipeline is two requests:

1. **Footer button** → `POST …/image/prompt` with `{ imageProviderId? }`. The server runs the text → image-prompt call exactly once, persists nothing, generates nothing, and answers `{ "prompt": "…", "negativePrompt": "…", "warnings": [] }` — already composed and clamped, so what the modal shows is byte-for-byte what the generate call will send. `warnings` are the prompt call's advisory notes (see below); the modal shows them above the editable prompt.
2. **`ImagePromptModal`** ("Review Image Prompt") shows both fields for editing, with **Generate**, **Cancel** and **Re-run text call** (the last replaces the drafts with a fresh text-model draft, staying inside the modal). Any warnings from the prompt call appear above the fields, warn-styled, so a suspected refusal or a key-less JSON answer is seen **before** the image call is paid for.
3. **Generate** → `POST …/image` with **both** `promptOverride` and `negativeOverride` set to the reviewed text. Because both are present, the server **skips the text call entirely** and sends the user's text — the text model is never asked twice, and edits are never discarded.

The in-flight state is a per-message `Writing image prompt…` status with **Cancel** while the dry run is in flight (the hook owns the request and the modal only owns the text, so closing the modal mid-flight aborts the call instead of leaving a stuck spinner); then a `Generating image…` status with **Cancel** during the image call.

### Preview OFF

One request: `POST …/image` with no overrides. The server runs the prompt call and then the image call in the same request, and no modal appears.

### The override rule

| `promptOverride` | `negativeOverride` | What runs |
|---|---|---|
| present | present | **Text call skipped.** Both sides are the overrides (clamped). This is the reviewed-prompt path. |
| present | absent | Text call runs; only the negative side comes from the model. The prompt side is the override. |
| absent | present | Text call runs; only the prompt side comes from the model. The negative side is the override. |
| absent | absent | Both sides come from the text model. |

"Present" means the field is a **string** — an empty string counts as present. The server sniffs `typeof body.promptOverride === "string"`.

### What the text call receives

`generateImagePrompt` sends one `/chat/completions` request with `temperature: 0.7`, `max_tokens: <the connection's own maxTokens>`, `response_format: { "type": "json_object" }`, and exactly two messages: the preset's `instruction` as `system`, and one `user` message built from:

```
SCENE TEXT:
<the assistant message content>

PLAYER'S LAST ACTION:
<the nearest visible (non-hidden) user message before it>

CURRENT STATE:
<summarizePlaythrough(playthrough)>

PRESENT CHARACTERS:
<player appearance + each character at the current location — their instance line
 (clothing/mood/conditions) plus their stable sheet identity>

Return ONE line of comma-separated tags describing this moment. Return JSON only: {"prompt": "…"}
```

**The connection governs the budget.** `max_tokens` is the connection's own `maxTokens` — the prompt call has no ceiling of its own and no floor. It used to send `min(maxTokens, 600)`, and that 600-token cap is what made an otherwise healthy connection answer with empty content and `finish_reason: "length"` (a reasoning model or one that writes a preamble spends the whole budget before the answer starts), which surfaced as the old `The text provider returned no image prompt.` — with no clue which of the two had happened.

**The JSON contract is enforced, not merely requested.** `response_format: { "type": "json_object" }` is sent on every call, matching the turn path (`src/server/openAiCompatibleProvider.ts`). It is safe on a model or proxy that does not implement structured output: `requestWithRetry` (`src/server/provider/openaiClient.ts`) already retries **once, without** `response_format`, when the endpoint rejects the body with a 400/422/404. Nothing about the parsing below depends on the field being honoured — a model that ignores it and answers in prose still works.

The `PLAYER'S LAST ACTION`, `CURRENT STATE` and `PRESENT CHARACTERS` blocks are omitted when empty (an empty header invites the model to invent one), and the last two are gated by the preset's `includeState` / `includeCast` flags. The answer is parsed as JSON — `prompt` is the one field asked for, and a volunteer `negative_prompt` is still read when a model supplies one; if the model returns prose instead, the whole content is used as the prompt and the negative side falls back to the preset's negative prefix.

**The contract is one field now, but a volunteer negative is still honoured.** The ask is `{"prompt": "…"}` — one line of booru-style tags — because a negative prompt is a property of the model, not of the scene, and the shipped presets already carry a full one in `negativePrefix`. A model that answers with a `negative_prompt` anyway is still parsed and still composed with `negativePrefix`, exactly as before; nothing about that branch changed. What changed is the **wrong-shape warning**: it fires when the JSON parsed as an object and carried **no string `prompt`** (a lone `negative_prompt` included), since the fallback would otherwise leak the raw blob into the image prompt.

### The cast block carries each character's STABLE identity

`PRESENT CHARACTERS` describes every character at the current location **twice**: the instance line (`name — wearing white shirt, wet, wary`) and, when their sheet resolves, an identity line read from the character template:

```
Mira — wearing white shirt, wet, wary
Mira's sheet — Species: Human | Body: Height: 168 cm; Build: slim, athletic | Appearance: Hair: long brown hair, ponytail; Eyes: blue eyes
```

- The template is found in `playthrough.characterTemplates` by the instance's `templateId`, falling back to a template with the same **name** when the id does not resolve.
- The sections are read with the engine's own parser (`pickSections` / `isStubSection` in `src/engine/characterSections.ts`), in the order `Species`, `Gender`, `Body`, `Appearance`. Missing sections and stubs (`(not established)`, empty) are skipped.
- **`Clothing` is deliberately excluded**: the character *instance*'s clothing is the authoritative current state and already rides on the instance line. A sheet's starting outfit must not be re-imposed on a scene where the character has undressed.
- The injected identity is capped per character (`CAST_IDENTITY_CHARS`, 320) so one long sheet cannot crowd out the scene.

The point is tag **consistency**: without it, the writer scrapes hair/eye/skin out of scene prose and the same character comes out looking different in every image. The player is unchanged — their `appearance` already rides along.

#### Empty content is an immediate, fully-diagnosed failure

When `choices[0].message.content` is empty or whitespace (or `choices` is empty), the call **fails immediately** — no retry and no deterministic fallback prompt — with one error that carries everything needed to diagnose it without a second round trip:

- the **`finish_reason`** (`length` names the exhausted-budget case directly; `absent` / `absent — the response carried no choices` name the other two),
- **whether a reasoning field was present**, i.e. `reasoning_content` or `reasoning` on the message, or a content block typed as reasoning/thinking — the "the model spent its output budget thinking" signal, called out explicitly when `content` is empty beside it,
- a **truncated quote** of the raw response body (the first 400 characters, never the whole body).

```
The text provider returned no image prompt (finish_reason: length; the message carried
reasoning_content while content was empty — the model spent its output budget on reasoning
instead of writing the prompt (raise the connection's maxTokens, or use a connection that
answers directly)). Raw response (truncated): {"id":"…","choices":[{"finish_reason":"length",…
```

#### Three advisory warnings

The call also FLAGS three answers it still returns (never blocks — the review modal is where the user fixes them):

| Condition | Warning |
|---|---|
| The prose fallback was used **and** the text opens like a refusal | It opened with `"i can't"` (or `i cannot`, `i'm unable`, `i am unable`, `i won't`, `i will not`, `as an ai`, `sorry, but`, `i must decline`, `can't help with`, `cannot help with`, `cannot assist`) instead of describing an image, and that text is now the prompt. Matched case-insensitively against the **first 200 characters** only, so refusal-shaped words inside a real prompt are not misread. Typographic apostrophes (`I can’t`) match the same patterns. |
| The JSON parsed as an object but carried **no string `prompt`** | The raw JSON blob would become the image prompt, so the warning names the keys it did find. A lone `negative_prompt` counts as a wrong shape. |
| The **composed prompt was cut** at the character limit — in the prompt side call (`promptCharacterLimit`) or by the dry-run route's `min(preset limit, dialect cap)` clamp | *"The composed prompt is longer than the N-character limit, so it was cut at the end — where the action and physical-state tags sit. Move the essential tags earlier in the list, or raise the character limit on the Image Generation tab."* The cut is silent otherwise, and the END of a tag list is exactly where the action and physical-state tags live. The clamped text is still what the modal shows and what the image call sends. |

A clean JSON answer, a fenced JSON block and ordinary prose produce no warnings. `ImagePromptOutput.warnings` carries them; the dry-run route returns them and the review modal shows them above the editable prompt. The truncation warning is added by the **dry-run route only** — the generate path has no UI surface, so the reviewed text it sends is unaffected (`promptUsed` / `negativeUsed` are byte-identical either way).

The two sides are then composed and clamped:

```
prompt         = clamp(composePrompt(positivePrefix, modelPrompt),   limit)
negativePrompt = clamp(composePrompt(negativePrefix, modelNegative), limit)
```

`composePrompt` joins with a single space and drops an empty prefix so the composed text never starts with a stray space. `limit` is `min(preset.promptCharacterLimit, dialectCap)`; a preset limit of **0 reads as unlimited** (the schema allows it) and is ignored as a limit. The prompt side call also clamps to `promptCharacterLimit` on its own (that is what makes the returned `prompt` "already composed and clamped"), which is why the truncation signal is reported as `ImagePromptOutput.promptTruncated` and not inferred from a length comparison in one place.

---

## Storage and the orphan sweep

Bytes are **content-addressed** at `data/images/<sha256>.<png|jpg|webp>` — the SHA-256 of the bytes, with the extension derived from the sniffed MIME type (unknown → `png`). Identical bytes are one file on disk: a re-roll that reproduces the same image, or a branch that copies a message reference, shares the file instead of copying megabytes. `data/images/` is **gitignored** (`.gitignore`: `# Generated images — content-addressed, adult content, never commit.`).

A message reference is a `MessageImage`:

| Field | Notes |
|---|---|
| `file` | `"<sha256>.<ext>"` — never a path |
| `prompt` | what was sent, default `""` |
| `negativePrompt` | optional |
| `providerId`, `model` | provenance, default `""` |
| `seed` | optional — **the seed that was actually sent**, so a later re-roll with the same prompt and seed is comparable. Absent when the provider picked one (Venice's `0`, or the OpenAI-compatible dialect, which has no seed field at all) — `0` is never stored as if it were a seed. |
| `durationMs` | optional |
| `request` | optional — the **JSON body that was sent to the image provider** for this image (diagnostic provenance) |
| `promptRequest` | optional — the **JSON body that was sent to the TEXT provider** that wrote this prompt (diagnostic provenance) |
| `promptResponse` | optional — the text provider's **response** to that call, body only, truncated (see below) |
| `createdAt` | ISO timestamp |

`request` is the exact string the adapter handed upstream, so a stored image can answer *what did we actually send?* — which is the only way to tell "the model ignored `style_preset`" from "we never sent it". It is the request **body only**: never headers, never the API key (`tests/imageRequestProvenance.test.ts` fails if either ever leaks in). Every variant of one call stores the same string, and the raw **response** is deliberately *not* stored — it carries the base64 payload and would bloat the record.

`promptRequest` / `promptResponse` are the same idea one step earlier in the pipeline: the prompt-writing side call's request body and the provider's response, so a stored image can also answer *why does this prompt look like that?* — the 600-token ceiling bug, a refusal, or a `finish_reason: "length"` is visible in the record instead of costing a round trip. Both are **body only** (never headers or keys — the credential scan in `tests/imageRequestProvenance.test.ts` covers them with the same pattern set as `request`) and both are shared by every variant of one call. `promptResponse` is **truncated at 4000 characters** with a trailing `…[truncated]` marker, so a verbose reasoning model cannot bloat the playthrough record; `promptRequest` is stored verbatim because it is bounded by the preset instruction plus the scene context. Neither field is written when the prompt call did not run — the reviewed-prompt path (both overrides) makes no text call, so there is nothing to record.

All three provenance fields are `optional`, so refs written before they existed still parse and simply show no disclosure. Nothing else about a reference is new: `file`, `prompt`, `negativePrompt`, `providerId`, `model`, `seed`, `durationMs` and `createdAt` are unchanged.

Because bytes are *shared*, never owned, deletion cannot be unlink-on-delete. Instead `collectReferencedImages` walks every message of every playthrough and collects the set of live file names, and the sweep deletes only hash-named files that are not in that set (anything else in the directory is left alone — the store does not own that namespace). Raced unlinks are counted as neither success nor failure.

**The sweep scans with `includeTimelineBranches: true`.** A timeline branch is excluded from the default playthrough list, so a sweep that skipped branches would delete a surviving branch's images the moment its parent was deleted.

| Trigger | Call site | Failure behavior |
|---|---|---|
| Playthrough deleted (`DELETE /api/playthroughs/:id`) | `src/server/routes/playthroughs.ts` | **Best-effort** — logs a warning, never fails the delete |
| Chat truncated (`truncateChat`) | `src/server/turnActions.ts` | **Best-effort** — logs a warning, never fails the truncate |
| One image ref removed (`DELETE …/images/:file`) | `src/server/routes/images.ts` | Runs unguarded inside the handler |
| Manual (`POST /api/settings/images/sweep`) | `src/server/routes/images.ts` | **Reported** — answers `{ "removed": <count> }`, or 500 |

The truncate sweep runs **after** the record is persisted, deliberately: the truncated messages took their image refs with them, so sweeping before the write would delete files the on-disk record still points at. The manual endpoint is the user asking for a sweep, so a failure is reported instead of swallowed; no UI control calls it today (it is an API/Debug-level endpoint).

`DELETE …/images/:file` is idempotent: removing a ref that is already gone still returns `{ "playthrough": … }`, and the sweep only runs when a ref actually matched.

---

## Preset-owned prompt configuration

The image-prompt config is **not a prompt module** — the module set stays turn-only. It is a block owned by the preset, exactly like the character format:

- `PromptPreset.imageGeneration` (optional) and `PlaythroughPromptSettings.imageGeneration` (optional) carry the same `ImageGenerationSettings` shape.
- A preset with no block falls back to `DEFAULT_IMAGE_GENERATION_SETTINGS`. The field is `.optional()` with **no default**, so every preset and playthrough written before this feature keeps parsing.
- The **inner** fields carry defaults, so a *partial* block always parses to a complete one — but note that a partial block's missing prefixes default to `""`, not to the shipped `anime style`.

| Field | Schema default | Meaning |
|---|---|---|
| `instruction` | the shipped instruction | The `system` message for the prompt call. |
| `positivePrefix` | `""` (shipped presets: `anime style`) | Prepended to the model's prompt. |
| `negativePrefix` | `""` (shipped presets: the tag list below) | Prepended to the model's negative prompt. |
| `promptCharacterLimit` | `900` (schema default for a *partial* block; the shipped fallback `DEFAULT_IMAGE_GENERATION_SETTINGS` and all three shipped/user presets use `1200`) | Soft limit, clamped against the dialect's hard cap. `0` = unlimited. |
| `includeState` | `true` | Send `CURRENT STATE` to the prompt writer. |
| `includeCast` | `true` | Send `PRESENT CHARACTERS` to the prompt writer. |

### Resolution order

```
playthrough.promptSettings.imageGeneration   (the snapshot — wins)
  → preset.imageGeneration                    (the preset currently selected)
    → DEFAULT_IMAGE_GENERATION_SETTINGS       (src/engine/imageDefaults.ts)
```

Each step is parsed through `ImageGenerationSettingsSchema`, so a partial block always resolves to a complete one.

### Snapshot semantics

A playthrough **snapshots** the block when its preset is applied — the same way it snapshots the prompt modules and the character format. Editing a preset's instruction therefore affects **new** playthroughs only; an existing playthrough must have its preset re-selected to pick up the new text. (The preset editor says so on the Image Generation tab.)

### The two shipped presets

`data/prompt-presets.json` ships **Default** and **Default (NSFW)**, both `readonly: true` (read-only in the UI — use **Save as New…** for an editable copy). Both set:

| | Default | Default (NSFW) |
|---|---|---|
| `positivePrefix` | `anime style` | `anime style` |
| `negativePrefix` | `lowres, bad anatomy, bad hands, extra fingers, extra limbs, deformed, poorly drawn face, bad proportions, watermark, signature, text, jpeg artifacts` | …the same list, plus `, censored, mosaic censoring, bar censor` |
| `promptCharacterLimit` | `1200` | `1200` |
| `includeState` / `includeCast` | `true` / `true` | `true` / `true` |
| `instruction` | the shipped instruction | the shipped instruction, with the **rating bullet replaced** by the NSFW one and an **`EXPLICIT SCENES`** block inserted immediately before the final Return-JSON-only line |

**The instruction deliberately forbids style keywords** (`No style or quality tags (anime style, masterpiece, best quality) — a style prefix is added separately.`), because `positivePrefix` is the single place art direction lives: a preset can be restyled without touching the instruction text. The instruction asks for a **booru-style tag list**, not a prose sentence, because the target models are tag-trained (`WAI`/`Illustrious` are danbooru-tag models) or CLIP finetunes (`Lustify`).

`Default` — instruction, verbatim:

```
You convert story scenes into image-generation tag lists.

The roleplay is paused. You are not narrating. You read the scene and output ONE line of comma-separated booru-style tags describing a single still frame of the current moment. A tag list is the only acceptable output — sentences, narration, dialogue and commentary are failures.

FORMAT
- One line. Lowercase. Comma-separated. Spaces inside a tag (long hair, blue eyes) — never underscores.
- No prose verbs, no "she is", no connecting words.
- 40-70 tags. Most important tags FIRST: the list is cut from the END if it runs long, so never put essential detail last.
- Never output a character's name or a place name from the story. Names are invisible to an image model — use the visible traits instead.
- First tag is the rating that matches what is actually happening: safe, sensitive, nsfw, or explicit. A tame scene stays tame.
- No style or quality tags (anime style, masterpiece, best quality) — a style prefix is added separately.

TAG ORDER
1. Rating, then character count: 1girl, 2girls, 1boy 1girl ...
2. Scene: location, time of day, lighting, camera framing
3. Appearance: hair length and colour, eye colour, skin tone, build, notable features
4. Expression and pose
5. Clothing item by item, with its state — white shirt (open), black skirt (hiked up), panties (around one ankle); naked / topless / bottomless when that is the scene
6. Action and physical state last — what the bodies are doing, sweat, tears, injuries

CAMERA
- Use pov, from viewer perspective, viewer's hands visible ONLY when the scene is seen through the player's eyes and the player is present in it.
- Otherwise use a neutral camera tag: wide shot, medium shot, close-up, from above, from below, dutch angle.

VOCABULARY (prefer these shapes; it is better to omit a detail than to invent a phrase)
- hair: long hair, short hair, ponytail, twin tails, messy hair, blonde hair, brown hair
- eyes: blue eyes, amber eyes, half-closed eyes, teary eyes
- body: petite, tall, large breasts, slim waist, muscular, pale skin, dark skin
- expression: smiling, laughing, crying, flushed face, parted lips, open mouth, closed eyes
- gaze: looking at viewer, looking away, looking down
- pose: sitting, kneeling, lying on back, standing, hugging, spread legs, arms crossed
- clothing state: white shirt (open), black skirt (hiked up), naked, topless, undressed
- place/light: dim lighting, neon lighting, sunlight, bedroom, alley, office, tavern

EXAMPLE (shape only, not content)
safe, 1girl, bedroom, night, dim lighting, medium shot, long brown hair, ponytail, blue eyes, pale skin, slim waist, sitting on bed, looking at viewer, flushed face, white t-shirt, grey panties, arms crossed

Return JSON only:
{"prompt": "<the tag line>"}
```

`Default (NSFW)` is that same document with exactly two mechanical changes: the rating bullet

```
- First tag is the rating that matches what is actually happening: safe, sensitive, nsfw, or explicit. A tame scene stays tame.
```

becomes

```
- First tag is the rating: nsfw or explicit when the scene is sexual, safe or sensitive when it is not.
```

and this block is inserted immediately before the `Return JSON only:` line (followed by one blank line):

```
EXPLICIT SCENES
- When the scene is sexually explicit, tag it at the same explicitness, plainly and without euphemism: the act, the position, what is exposed, what the bodies are doing, visible physical state (sweat, fluids, trembling, flushed skin).
- Keep the characters' established appearance, clothing state and arousal consistent with what the scene says. Do not add acts, partners or undress the scene did not describe.
- Never censor, blur, fade or sanitise what the scene describes, and never add safety, boilerplate or refusals. If the scene is not explicit, do not invent explicit content.
```

`tests/settings.test.ts` asserts that derivation **as a string equality** against the core constant: the `default` preset's instruction is byte-identical to `DEFAULT_IMAGE_PROMPT_INSTRUCTION`, and `default-nsfw`'s is exactly `core.replace(ratingBullet, nsfwRatingBullet).replace("Return JSON only:", explicitScenes + "\n\nReturn JSON only:")`. Editing one without the other fails the suite — that is the drift guard.

The Image Generation tab in the preset editor exposes all six fields in this order: instruction, positive prefix, negative prefix, character limit, then the `include current state` and `include present characters` toggles.

---

## The chat surface

`src/client/components/views/PlayView/ChatPanel.tsx`, `usePlaythrough.ts`, `ImagePromptModal.tsx`.

- Every **assistant** message gets a footer button: **Generate Image**, or **Generate another** once it has images. It is disabled when there is no image connection, with a tooltip explaining why (`No image provider configured — add one in Settings → Provider → Images`), and while another action is in progress.
- Generated images stack **inside the same message container, newest last**. Each is a figure with the image, a remove control (`Remove this image` — the tooltip and the confirm dialog both say *the file is deleted if nothing else uses it*), and a caption of `model · <seconds>s · seed <seed>`. The duration and seed parts are omitted when absent — a Venice random seed (`0`) therefore shows no seed.
- Every generated image carries a compact collapsed **`request`** disclosure under it (inside the same message container and the same figure) revealing the pretty-printed JSON body that went to the image provider — diagnostic provenance, not content, so it is small, muted, monospace, height-capped and horizontally scrollable. A ref stored before the field existed shows no disclosure at all (no empty box).
- Next to it, a second collapsed **`prompt call`** disclosure shows the *prompt-writing* side call: its request body and the text provider's response, labelled `Request` / `Response`, same quiet treatment and also collapsed by default. It is absent when the prompt came from the user's own edits (both overrides), because no text call ran for that image.
- In-flight states are per message: `Writing image prompt…` (the dry run) and `Generating image…` (the render), each with a **Cancel** button. Cancelling reports `Image prompt cancelled.` or `Image generation cancelled.`; a failure reports `Image generation failed — nothing was changed.`
- `Settings → Chat → Review Image Prompt Before Generating` (default **on**) decides whether the modal appears. On: dry run first, then the reviewed prompt posted back as both overrides. Off: one request, no modal.
- The image provider caption in the modal is `<label> · <model>` of the image connection the request will use.

---

## Troubleshooting

### Error strings

| Status | Body | Cause |
|---|---|---|
| 404 | `{"error":"Playthrough not found"}` | Unknown playthrough id |
| 404 | `{"error":"Message not found"}` | Unknown message id in that playthrough |
| 404 | `{"error":"Image not found"}` | `GET /api/images/:file` — malformed name or missing file |
| 400 | `{"error":"Images attach to assistant messages only"}` | The target message is a user or system message |
| 400 | `{"error":"No image provider configured — add one in Settings → Provider → Images."}` | No image connection (no active one, and no explicit `imageProviderId` that resolves to an image connection) |
| 400 | `{"error":"No text provider available to write the image prompt."}` | No text connection at all, so no prompt writer |
| 502 | `{"error":"Image prompt provider error <status>: <body>"}` | The text provider failed while writing the prompt |
| 502 | `{"error":"The text provider returned a non-JSON response while writing the image prompt."}` | The text provider's response envelope was not JSON |
| 502 | `{"error":"The text provider returned no image prompt (finish_reason: …). Raw response (truncated): …"}` | The model's `content` was empty (or the response carried no choices). The message names the `finish_reason`, whether a reasoning field was present, and quotes the raw body — see *Empty content is an immediate, fully-diagnosed failure* above. `finish_reason: length` + a reasoning field means the connection's budget was spent thinking: raise `maxTokens` or use a connection that answers directly. |
| 502 | `{"error":"Image provider error <status>: <body>"}` | The image provider returned a non-OK status |
| 502 | `{"error":"Image provider returned no image data"}` | The image response carried no usable payload (e.g. a plain `http` URL instead of a data URL) |
| 500 | `{"error":"Image sweep failed"}` (or the thrown message) | `POST /api/settings/images/sweep` failed |

**400 vs 502.** A 400 means the request cannot be attempted as configured — wrong message role, or a missing connection. Nothing was charged and nothing changed. A 502 means a provider call was attempted and failed; the playthrough is unchanged (the write happens only after the bytes are stored), and the error text carries the upstream status and body.

### The near-1500-character compat cap

The OpenAI-compatible `/images/generations` endpoint rejects prompts over 1500 characters with a 400. The route clamps the **composed** prompt (prefix + body) to the dialect cap, and the adapter clamps again, so a long prefix or an over-long edit in the modal is truncated rather than rejected. The truncation is a plain `slice(0, limit).trimEnd()`. The preset's `promptCharacterLimit` (1200 for both shipped presets) is the *soft* limit and the one the modal's character counter shows; the hard cap is 1500 for `openai` and 7500 for `venice`. A preset limit of 0 means unlimited **up to the dialect cap**.

Soft-limit cuts are no longer silent: the dry run adds a **truncation warning** to its `warnings` array (shown in the review modal) whenever the composed prompt was cut, at either ceiling. That matters here more than it used to — a tag list puts its most disposable tags last and its action/physical-state tags at the end, so a cut removes exactly the part the instruction insists on. The reviewed generate call still sends the identical clamped text; only the dry run reports.

### Safe mode and the adult-content blur

`safeMode` is off by default, and that is a deliberate default for this project. When it is off, the `openai` dialect sends `moderation: "low"`, which is what disables Venice's upstream adult-content blur; when it is on it sends `moderation: "auto"`. The `venice` dialect sends `safe_mode` directly. If images come back blurred or censored, safe mode is the first thing to check — and note that the NSFW preset's negative prefix already fights censoring tokens (`censored, mosaic censoring, bar censor`).

### Style presets are a closed, case-sensitive list

`style_preset` is not free text: Venice validates it against its own list and rejects anything else with a **400 `Invalid style requested`**. The values are **title-cased** (`Anime`, never `anime`) and the check is case-sensitive — a lowercase value is the exact bug this control was redesigned for.

The failure is costly in one specific way, and it is not the image: the **prompt call has already run** (and been paid for) by the time the image endpoint answers. The playthrough itself is unchanged.

The list is read from `GET {baseUrl}/image/styles`, which is **public** — no key is required, so BobbinLoom proxies it keyless (`POST /api/settings/providers/image-styles`, which attaches the key only when one is available). The connection editor loads it when a Venice connection is opened, in the provider's own order, and offers:

- **None** — nothing is sent. `style_preset` is **omitted** from the body, not sent empty.
- every listed style, verbatim.
- **Custom…** — reveals a plain text field, so a self-hosted or future endpoint that does not implement the listing stays usable.

A connection whose **stored** value is not in the fetched list is flagged in the editor, naming the 400 and offering the case-insensitive nearest match — that is precisely the state an older, free-text configuration is left in.

**Venice publishes no per-model style-preset support flag.** `GET /models?type=image` reports per-model constraints such as the prompt cap and sizes, but nothing that says which styles a given checkpoint honours. So a model may **accept** `style_preset` (no 400, the call succeeds) and still render no visible change — the request is what succeeded, not the style. That ambiguity is why the sent body is stored on the ref and shown under the image in the chat: open the `request` disclosure and look for `style_preset` to confirm what actually left the client before concluding the model ignored it.

**The model-agnostic lever is the preset's `positivePrefix`.** Venice gates `style_preset` per model and publishes no support list — neither the Image Models docs page nor `GET /models?type=image` carries a flag saying which checkpoints honour it — so a preset is a request, not a guarantee. The positive prefix, by contrast, is text prepended to the prompt by BobbinLoom itself, so it reaches every model regardless. When a style must land whatever model is selected, put the style keywords there (Settings → Presets → Image Generation → Positive Prefix). The connection editor's Style Preset helper says the same thing next to the control.

### Sizes are model-dependent

There is no one size that works everywhere, and the failure is a 400 from the provider, not from BobbinLoom:

- Pixel models take `width`/`height` (from `size`); **aspect-ratio models (the qwen-image family) reject them**. Set **Aspect Ratio** on the connection instead — the adapter then sends `aspect_ratio` and omits `width`/`height`, because the two are mutually exclusive upstream.
- `size: "auto"` (and any unparseable value) means "the provider picks".
- `GET /models?type=image` reports the per-model constraints, including `model_spec.constraints.promptCharacterLimit`, so the model listing is the fastest way to check what a checkpoint accepts.
- A plain `http` URL in an image response is not fetched — the adapter only accepts inline base64 or a data URL.
