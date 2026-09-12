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
| `seed` | request seed, else `0` | **`0` means random** (documented). |
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

The generate body is `z.object({ imageProviderId?, promptOverride?, negativeOverride?, seed? })` — all optional. The response is:

```json
{
  "playthrough": { "...": "the updated record" },
  "image": { "file": "<sha256>.png", "prompt": "…", "negativePrompt": "…", "providerId": "…", "model": "…", "seed": 1234, "durationMs": 8123, "request": "{\"model\":\"…\",\"prompt\":\"…\"}", "createdAt": "2026-09-12T00:00:00.000Z" },
  "promptUsed": "anime style …",
  "negativeUsed": "lowres, bad anatomy, …"
}
```

`promptUsed` / `negativeUsed` are exactly the strings the route handed to the image provider — already prefix-composed, already clamped to the preset's soft limit **and** the dialect's hard cap. `image` is the first variant when `variants > 1`; the rest are appended to the message in the same order.

### Preview ON — the default path

`Settings → Chat → Review Image Prompt Before Generating` is **on by default**. The pipeline is two requests:

1. **Footer button** → `POST …/image/prompt` with `{ imageProviderId? }`. The server runs the text → image-prompt call exactly once, persists nothing, generates nothing, and answers `{ "prompt": "…", "negativePrompt": "…" }` — already composed and clamped, so what the modal shows is byte-for-byte what the generate call will send.
2. **`ImagePromptModal`** ("Review Image Prompt") shows both fields for editing, with **Generate**, **Cancel** and **Re-run text call** (the last replaces the drafts with a fresh text-model draft, staying inside the modal).
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

`generateImagePrompt` sends one `/chat/completions` request with `temperature: 0.7`, `max_tokens: min(connection.maxTokens, 600)`, and exactly two messages: the preset's `instruction` as `system`, and one `user` message built from:

```
SCENE TEXT:
<the assistant message content>

PLAYER'S LAST ACTION:
<the nearest visible (non-hidden) user message before it>

CURRENT STATE:
<summarizePlaythrough(playthrough)>

PRESENT CHARACTERS:
<player appearance + each character at the current location, clothing/mood/conditions>

Write ONE image prompt for this moment. Return JSON: {"prompt": "…", "negative_prompt": "…"}
```

The `PLAYER'S LAST ACTION`, `CURRENT STATE` and `PRESENT CHARACTERS` blocks are omitted when empty (an empty header invites the model to invent one), and the last two are gated by the preset's `includeState` / `includeCast` flags. The answer is parsed as JSON (`prompt`, `negative_prompt`); if the model returns prose instead, the whole content is used as the prompt and the negative side falls back to the preset's negative prefix. No prompt at all is an error (`The text provider returned no image prompt.`).

The two sides are then composed and clamped:

```
prompt         = clamp(composePrompt(positivePrefix, modelPrompt),   limit)
negativePrompt = clamp(composePrompt(negativePrefix, modelNegative), limit)
```

`composePrompt` joins with a single space and drops an empty prefix so the composed text never starts with a stray space. `limit` is `min(preset.promptCharacterLimit, dialectCap)`; a preset limit of **0 reads as unlimited** (the schema allows it) and is ignored as a limit.

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
| `seed` | optional — a Venice random (`0`) generation has none |
| `durationMs` | optional |
| `request` | optional — the **JSON body that was sent to the image provider** for this image (diagnostic provenance) |
| `createdAt` | ISO timestamp |

`request` is the exact string the adapter handed upstream, so a stored image can answer *what did we actually send?* — which is the only way to tell "the model ignored `style_preset`" from "we never sent it". It is the request **body only**: never headers, never the API key (`tests/imageRequestProvenance.test.ts` fails if either ever leaks in). Every variant of one call stores the same string, and the raw **response** is deliberately *not* stored — it carries the base64 payload and would bloat the record. The field is `optional`, so refs written before it existed still parse and simply show no request.

Nothing else about a reference is new: `file`, `prompt`, `negativePrompt`, `providerId`, `model`, `seed`, `durationMs` and `createdAt` are unchanged.

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
| `promptCharacterLimit` | `900` | Soft limit, clamped against the dialect's hard cap. `0` = unlimited. |
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
| `promptCharacterLimit` | `900` | `900` |
| `includeState` / `includeCast` | `true` / `true` | `true` / `true` |
| `instruction` | the shipped instruction | the shipped instruction **plus** an `Explicit scenes:` section inserted before the final Return-JSON-only line |

**The instruction deliberately forbids style keywords** (`Do not add quality tags, artist names, or style keywords — a style prefix is added separately.`), because `positivePrefix` is the single place art direction lives: a preset can be restyled without touching the instruction text.

`Default` — instruction, verbatim:

```
You write image-generation prompts for an interactive story.

Given a scene from the story, describe ONE still image of the current moment — a single frame, not a sequence. In this order, cover: the subject or subjects and how many; their visible appearance (build, hair, eyes, skin, notable features); what they are wearing, or not wearing; pose and action; facial expression; the setting and background; lighting and time of day; camera framing and angle.

Rules:
- Describe only what a camera would see. No narration, no dialogue, no thoughts, no story mechanics (no turn numbers, no state names, no character-sheet labels).
- Concrete nouns and adjectives beat mood words: "rain-slick cobblestones under a flickering neon sign" is better than "a moody atmosphere".
- Include only characters who are actually in the scene, and no more than three. Match each one's established look from the scene text.
- Do not add quality tags, artist names, or style keywords — a style prefix is added separately.
- Keep the prompt under 600 characters.

Return JSON only: {"prompt": "<the image prompt>", "negative_prompt": "<what to avoid in this specific image, or an empty string>"}
```

`Default (NSFW)` adds this section between `Keep the prompt under 600 characters.` and the Return-JSON-only line:

```
Explicit scenes:
- When the scene text is sexually explicit, depict it at the same explicitness. Name the act, the
  position, what is exposed, and the visible physical state — plainly, without euphemism, matching
  the playthrough's Explicit Content module.
- Keep anatomy, clothing state, and arousal consistent with what the scene text establishes. Do not
  add acts, participants, or undress the scene did not describe.
- Never sanitize, blur, censor, fade, or omit what the scene describes, and never add safety,
  consent, or policy boilerplate. If the scene is not explicit, do not invent explicit content.
```

The Image Generation tab in the preset editor exposes all six fields in this order: instruction, positive prefix, negative prefix, character limit, then the `include current state` and `include present characters` toggles.

---

## The chat surface

`src/client/components/views/PlayView/ChatPanel.tsx`, `usePlaythrough.ts`, `ImagePromptModal.tsx`.

- Every **assistant** message gets a footer button: **Generate Image**, or **Generate another** once it has images. It is disabled when there is no image connection, with a tooltip explaining why (`No image provider configured — add one in Settings → Provider → Images`), and while another action is in progress.
- Generated images stack **inside the same message container, newest last**. Each is a figure with the image, a remove control (`Remove this image` — the tooltip and the confirm dialog both say *the file is deleted if nothing else uses it*), and a caption of `model · <seconds>s · seed <seed>`. The duration and seed parts are omitted when absent — a Venice random seed (`0`) therefore shows no seed.
- Every generated image carries a compact collapsed **`request`** disclosure under it (inside the same message container and the same figure) revealing the pretty-printed JSON body that went to the image provider — diagnostic provenance, not content, so it is small, muted, monospace, height-capped and horizontally scrollable. A ref stored before the field existed shows no disclosure at all (no empty box).
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
| 502 | `{"error":"The text provider returned no image prompt."}` | The model produced neither JSON nor prose |
| 502 | `{"error":"Image provider error <status>: <body>"}` | The image provider returned a non-OK status |
| 502 | `{"error":"Image provider returned no image data"}` | The image response carried no usable payload (e.g. a plain `http` URL instead of a data URL) |
| 500 | `{"error":"Image sweep failed"}` (or the thrown message) | `POST /api/settings/images/sweep` failed |

**400 vs 502.** A 400 means the request cannot be attempted as configured — wrong message role, or a missing connection. Nothing was charged and nothing changed. A 502 means a provider call was attempted and failed; the playthrough is unchanged (the write happens only after the bytes are stored), and the error text carries the upstream status and body.

### The near-1500-character compat cap

The OpenAI-compatible `/images/generations` endpoint rejects prompts over 1500 characters with a 400. The route clamps the **composed** prompt (prefix + body) to the dialect cap, and the adapter clamps again, so a long prefix or an over-long edit in the modal is truncated rather than rejected. The truncation is a plain `slice(0, limit).trimEnd()`. The preset's `promptCharacterLimit` (900 for both shipped presets) is the *soft* limit and the one the modal's character counter shows; the hard cap is 1500 for `openai` and 7500 for `venice`. A preset limit of 0 means unlimited **up to the dialect cap**.

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

### Sizes are model-dependent

There is no one size that works everywhere, and the failure is a 400 from the provider, not from BobbinLoom:

- Pixel models take `width`/`height` (from `size`); **aspect-ratio models (the qwen-image family) reject them**. Set **Aspect Ratio** on the connection instead — the adapter then sends `aspect_ratio` and omits `width`/`height`, because the two are mutually exclusive upstream.
- `size: "auto"` (and any unparseable value) means "the provider picks".
- `GET /models?type=image` reports the per-model constraints, including `model_spec.constraints.promptCharacterLimit`, so the model listing is the fastest way to check what a checkpoint accepts.
- A plain `http` URL in an image response is not fetched — the adapter only accepts inline base64 or a data URL.
