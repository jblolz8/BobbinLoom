---
title: Image generation
section: Providers
order: 120
---

# Image generation

How an assistant message becomes a stored image file: the three image-provider dialects, the text → image-prompt call, the review modal, and the content-addressed store that holds the bytes.

Source of truth: `src/server/routes/images.ts` (the endpoints), `src/server/imageProvider/` (`index.ts`, `types.ts`, `shared.ts`, `openaiImagesProvider.ts`, `veniceImageProvider.ts`, `a1111Provider.ts`), `src/server/httpAuth.ts` (the key→header rule), `src/server/imageProgress.ts` (the live progress registry), `src/server/provider/imagePrompt.ts` (the prompt side call), `src/server/imageStore.ts` (content-addressed storage + orphan sweep), `src/server/provider/imageContext.ts` (the context blocks: state, cast, history, the reference answer), `src/engine/imageDefaults.ts` and `data/prompt-presets.json` (preset prompt config, and the POV/Scene instruction swap), `src/client/components/views/PlayView/` (the chat surface), `src/client/components/modals/PresetEditor.tsx` (the Image Generation tab), `src/client/engine/displayFormat.ts` (the image caption, shared with the full-screen viewer). Cover art — which image a playthrough card wears — lives in `src/server/coverResolver.ts`, `src/client/components/base/CoverArt.tsx` and `src/client/components/modals/GalleryModal.tsx`; see [`playthroughs.md`](playthroughs.md). Related: [`provider-setup.md`](provider-setup.md) (connection registry v2), [`prompt-architecture.md`](prompt-architecture.md) (why the prompt call is a side call).

---

## What it does

An image is generated **per assistant message**. Two connections are involved and they are independent:

- a **text connection** writes the image prompt (this is the connection's own `/chat/completions` call, a *side call* — see below), and
- an **image connection** renders the image (its `apiStyle` picks the dialect, see below).

Only assistant messages can carry images (`images attach to assistant messages only`). Generated images are stored as content-addressed files under `data/images/` and referenced from the message, so the playthrough record only carries file names and metadata — never the bytes.

Nothing about image generation runs during a turn. The prompt call is not part of the turn message array and does not touch the turn counter, snapshots, world state, or the token meter. See [`prompt-architecture.md`](prompt-architecture.md) → *Side calls*.

**The writer's context is preset-owned and configurable**: how many messages of history it sees, which perspective its instruction is read in (POV or Scene), and whether it is shown one earlier answer as a shape reference. The first two change what the writer knows about the scene; the third changes what it imitates. All three live in the image block (see [*Preset-owned prompt configuration*](#preset-owned-prompt-configuration)) and none of them is a per-device setting — they decide what the server sends, not what this browser does.

---

## The three connection dialects

Image connections are plain entries in the provider registry (`data/providers.json`, `schemaVersion: 2`) with `kind: "image"`. They carry the shared connection fields (`baseUrl`, `apiKey`, `model`, …) plus the image-only fields below. `apiStyle` selects the dialect — `"openai"`, `"venice"` or `"a1111"`; absent means `openai`.

| Field | Values | Meaning |
|---|---|---|
| `apiStyle` | `"openai"` (default) \| `"venice"` \| `"a1111"` | Endpoint dialect. Absent = `openai`, the conservative default — it never sends a field the endpoint might reject. `"a1111"` talks to a local AUTOMATIC1111 / Forge WebUI over its own `/sdapi/v1/*` API (see below). |
| `safeMode` | boolean, absent = `false` | Ask the provider to blur/moderate adult content. Off by default: this is an adult-content project and the blur is a footgun. Venice (`safe_mode`) and the OpenAI-compatible `moderation` field only — never sent on `a1111`. |
| `size` | `"auto"` \| `"1024x1024"` \| `"1536x1024"` \| … | `openai` sends it verbatim as `size` (`"auto"` included); `venice` parses it into `width`/`height` and **drops it entirely** when it is `"auto"` or unparseable — the provider then picks. `a1111` parses it into `width`/`height` and sends **neither** for `"auto"` or an unparseable value, so the WebUI's own canvas size applies. |
| `aspectRatio` | string, e.g. `"3:2"` | Venice only. Used **instead of** `size` for models that reject `width`/`height` (the qwen-image family). |
| `promptProviderId` | text connection id, or `null` | Which text connection writes the prompt. Absent/null = the current active text connection. A dangling id falls back to the active text connection rather than erroring. |
| `stylePreset` | a value the provider itself lists, e.g. `"Anime"` | Venice only. Sent as `style_preset`. **Case-sensitive and title-cased upstream**: `anime` is a 400 (`Invalid style requested`). The list comes from the keyless `GET {baseUrl}/image/styles`, and the connection editor fills a select from it (with **None** and a **Custom…** escape hatch). An **empty value is omitted** from the body rather than sent. |
| `hideWatermark` | boolean | Venice only. Sent as `hide_watermark: true` (only when on). |
| `variants` | integer 1–4 | How many images one request renders. Every returned variant is kept. On `a1111` it means **batch size** (`batch_size`), so one call renders the whole batch. |
| `seed` | integer, absent = random | **Venice:** sent as `seed` with **every** generation this connection makes, so re-rolls of the same prompt are comparable. **Absent (or `0`, which Venice documents as "pick one at random") means the provider picks** — and then the stored image carries no seed at all. **a1111:** sent as `seed`, where **`-1` means random and `0` is a legitimate deterministic seed** — the opposite of Venice. A blank field is sent as `-1`, so typing `0` genuinely pins the first image. The OpenAI-compatible dialect has no seed field, so a seed set here is simply ignored by it. Editable in the connection editor next to Variants; an emptied field **clears** the stored value rather than storing `0`. |
| `steps` | integer 1–150, absent = not sent | a1111 only. Sent as `steps`. **Empty omits the field**, so the WebUI's own default applies — which is what a user who already tuned their WebUI expects. |
| `cfgScale` | number 0–30, absent = not sent | a1111 only. Sent as `cfg_scale`. |
| `sampler` | string, absent = not sent | a1111 only. Sent as `sampler_name`. Free text; the editor suggests the names the WebUI itself listed (`GET /sdapi/v1/samplers`), because a fork may ship names BobbinLoom was never told. |
| `scheduler` | string, absent = not sent | a1111 only. Sent as `scheduler`. Free text, suggestions from `GET /sdapi/v1/schedulers`. |
| `timeoutMs` | integer ms, absent = dialect default | a1111 only. One image's budget. Precedence: connection `timeoutMs` > `BOBBINLOOM_IMAGE_TIMEOUT_MS` > dialect default (**600000 ms** for a1111, 180000 otherwise). The editor takes seconds and stores milliseconds. |
| `regionsEnabled` | boolean, absent = **on** | a1111 only. Whether a prompt with two or more characters in frame (three or more groups) may be split into per-character regions. Absence is "on" because the split is invisible when it cannot happen: it also needs the extension installed and two or more prompt groups. `false` pins this connection to today's single-prompt render. See [*Multi-character regions*](#multi-character-regions-forge-couple). |
| `regionDirection` | `"Horizontal"` (default) \| `"Vertical"` | a1111 only. How the character boxes divide the canvas: Horizontal gives each one a column (left → right, in group order), Vertical a band (top → bottom). It travels as the mapping's geometry, not as the extension's own `direction`. |

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
  "negative_prompt": "lowres, worst quality, low quality, normal quality, blurry, out of focus, jpeg artifacts, bad anatomy, deformed, bad proportions, poorly drawn face, long neck, malformed limbs, missing limbs, extra limbs, extra arms, extra legs, bad hands, extra fingers, extra digits, fewer digits, missing fingers, fused fingers, mutated hands, duplicate, text, dialogue, speech bubble, thought bubble, caption, subtitles, comic, comic panel, panel layout, multiple views, 4koma, storyboard, split screen, collage, border, watermark, signature, username, artist name, logo, web address, patreon username, twitter username, stamp, photorealistic, realistic, 3d, cgi",
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
| `negative_prompt` | composed negative | Only sent when non-empty; clamped to the dialect cap (**7500**) alone — the preset's `promptCharacterLimit` does not apply to the negative (see *The negative has its own ceiling*). |
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

### `a1111` — AUTOMATIC1111 / Forge (local)

Talks to a locally hosted AUTOMATIC1111 or Forge WebUI over the WebUI's **own** `/sdapi/v1/*` API — not an OpenAI-compatible surface. The WebUI must be started with `--api`; without it every route below answers 404 (see [`provider-setup.md`](provider-setup.md) → *Local AUTOMATIC1111 / Forge*).

| Endpoint | Purpose |
|---|---|
| `POST {baseUrl}/sdapi/v1/txt2img` | Render. One request renders the whole batch. |
| `GET {baseUrl}/sdapi/v1/sd-models` | The checkpoint list (**Fetch models**), plus the WebUI's sampler/scheduler lists. |
| `GET {baseUrl}/sdapi/v1/script-info` | Read once per base URL to see whether **Forge Couple** is installed — the gate on per-character regions (see [*Multi-character regions*](#multi-character-regions-forge-couple)). Cached ~5 minutes; a failure means "not installed", never an error. |
| `GET {baseUrl}/sdapi/v1/progress?skip_current_image=true` | Polled while a render runs — the live readout. |
| `POST {baseUrl}/sdapi/v1/interrupt` | Cancel. Fired on abort. |

**The base URL is the WebUI ROOT** — `http://127.0.0.1:7860`, with **no `/v1` suffix**. Every other dialect normalizes to an OpenAI-style `/v1`; this one deliberately does not, because `/v1/sdapi/v1/txt2img` is not a route. Trailing slashes are still stripped (that is the whole of `normalizeImageBaseUrl` for this dialect).

```json
{
  "prompt": "anime style rain-slick cobblestones, a lone figure under a flickering neon sign, wide shot, night",
  "negative_prompt": "lowres, worst quality, low quality, …",
  "width": 1024,
  "height": 1024,
  "steps": 28,
  "cfg_scale": 6.5,
  "sampler_name": "DPM++ 2M Karras",
  "scheduler": "Karras",
  "seed": -1,
  "n_iter": 1,
  "batch_size": 1,
  "override_settings": { "sd_model_checkpoint": "sd_xl_base_1.0.safetensors" },
  "override_settings_restore_afterwards": true
}
```

| Body field | Source | Notes |
|---|---|---|
| `prompt` | composed prompt | Clamped to **10000** characters (`A1111_IMAGE_PROMPT_CAP`) — a sanity ceiling, not a trim. |
| `negative_prompt` | composed negative | Only sent when non-empty; the same 10000-character ceiling. |
| `width` / `height` | parsed from `size` | `"auto"`, absent and unparseable all send **neither**, so the WebUI's own canvas size applies. |
| `steps` | connection `steps` | 1–150. **Omitted when the connection does not set it**, so the WebUI's own default applies. |
| `cfg_scale` | connection `cfgScale` | 0–30. Omitted when unset. |
| `sampler_name` | connection `sampler` | Free text. Omitted when unset. |
| `scheduler` | connection `scheduler` | Free text. Omitted when unset. |
| `seed` | request `seed` → connection `seed` → `-1` | **`-1` means random on this dialect.** `0` is a **legitimate deterministic seed** here — the opposite of Venice, where `0` is the random sentinel. A blank field is sent as `-1`; a `0` in the body is a real pin. |
| `n_iter` | constant `1` | |
| `batch_size` | `req.variants ?? 1`, clamped to 1–4 | `variants` means **batch size** on this dialect: one call renders the whole batch. |
| `override_settings.sd_model_checkpoint` | connection `model` | Sent only when the model field is non-empty. |
| `override_settings_restore_afterwards` | constant `true` | |

**Checkpoint switching is per request, and it never becomes a settings change.** The connection's checkpoint travels in `override_settings.sd_model_checkpoint`, applied to **one** request. The adapter never calls `POST /sdapi/v1/options`, because that mutates the user's own WebUI state — which is not BobbinLoom's to change. `override_settings_restore_afterwards: true` is sent **explicitly** whenever `override_settings` is sent, so "one request only" never depends on a fork's default.

**Every sampling field is optional, on purpose.** A1111 accepts any *subset* of its parameters and fills the rest from the WebUI's own settings, so the adapter sends `steps`, `cfg_scale`, `sampler_name` and `scheduler` **only when the connection sets them**. An absent `steps` means "the number the user already set in their WebUI"; overriding it with a hardcoded 20 would silently ignore their tuning.

**Fields that do NOT apply.** `stylePreset`, `safeMode` and `hideWatermark` are never sent — the WebUI has no `style_preset`, `safe_mode` or `hide_watermark` — and `aspectRatio` is unused, because sizing on this dialect is `width`/`height` only. The connection editor **hides all four controls** for an `a1111` connection rather than showing a field that would send nothing.

**Cancel really cancels.** On abort the adapter fires `POST /sdapi/v1/interrupt` — best effort, exactly once per signal, with its own 5 s budget (`A1111_INTERRUPT_TIMEOUT_MS`) and every error swallowed, so a failed interrupt can never turn the user's cancel into an error. An abandoned fetch alone would leave the WebUI sampling and the GPU busy. A successful (un-aborted) generation issues no interrupt at all.

**Response shape** — `{ images: [base64…], info: "<JSON string>" }`. Every entry in `images` becomes a stored image, and an empty or missing `images` array is an error (`Image provider returned no image data`). The **MIME comes from the bytes** (magic-byte sniffed): the WebUI hands back bare base64 with no filename and no format field, so trusting a reported type would put a mislabelled file in the content-addressed store. The **seed stored on the ref is the one the WebUI actually used**, read out of `info` (`seed`, falling back to `all_seeds[0]`, and tolerating a fork that stringifies the numbers). This matters here more than on any other dialect: a random request sent `-1`, which nobody can reproduce from, so reporting back what was asked for would be a lie. A missing, truncated or non-JSON `info` yields **no seed** and never throws — the image is still perfectly usable.

#### Multi-character regions (Forge Couple)

A two-character prompt is **one** conditioning vector, so hair, eye colour and clothing bleed between the people in frame. When the local WebUI has the **Forge Couple** extension installed, the `a1111` adapter sends that extension's own `alwayson_scripts` entry for a prompt with two or more characters in frame, and each character's group is conditioned on its own region of the canvas instead. Installing it is a WebUI-side step — see [`provider-setup.md`](provider-setup.md) → *Forge Couple (per-character regions)*.

**Three conditions, and every one of them has to hold.** Regions engage only when:

- the connection has regions **on** — `regionsEnabled`, absent = on — **and**
- the WebUI really has the extension: `GET {baseUrl}/sdapi/v1/script-info` lists an alwayson script whose name is `forge couple` (matched case-insensitively, exactly — a build that merely starts with that name is a different script). The answer is cached per base URL for **~5 minutes**, so a render does not pay for the probe every time, and the `alwayson_scripts` key is the **server's own spelling of the title**, because A1111 looks that key up by exact name — **and**
- the composed prompt carries **three or more non-empty groups** (split on `|`, each trimmed, empties dropped — a stray separator must not invent a character). Three, because the first group is the shared scene: two groups means **one** character in frame, nothing to separate, and only a halved scene weight for the trouble.

Miss any one of them and the request body is **byte-identical to a render from before this feature existed**. Detection is not politeness: A1111 answers **HTTP 422 `always on script <name> not found`** for an `alwayson_scripts` key it does not know, so the payload can never be sent blind. A refused, malformed or timed-out `script-info` call means **not detected** — never an error, never a blocked render, and never a silent retry storm (the probe has its own 5 s budget).

**The writer decides how many people are in frame.** The instruction's MULTIPLE CHARACTERS rule turns the scene into one group per visible character, with the shared scene first; the writer's count tags (`1girl`, `1boy 1girl`, `2girls`, in the line's first group) are how it says who is visible. A character who is in the room but out of frame is simply not in the tag list, so the prompt holds **one group** and no regions engage — the cast stays the writer's business, the geometry stays the renderer's. And if the writer ignores the rule, the same fallback applies: one group, today's behaviour.

**The first group is the shared scene, and it keeps the whole frame.** In the mapping the adapter sends, group one gets a **full-frame box at weight 0.5** — the same effect the extension's own `background: "First Line"` global effect has, expressed in geometry we control — while every group after it is a character and gets an equal slice of the canvas. That is exactly where the preset's `positivePrefix` lands (it is prefixed to the composed prompt, i.e. into group one), which is why `anime style` reaches every region instead of being confined to one of them. It is also why the shared scene goes first in the instruction: put a character first and the style prefix ends up conditioning that character's region alone.

**Horizontal by default, Vertical on request.** `regionDirection` (absent = `Horizontal`) decides how the character boxes divide the canvas: **Horizontal** gives each one a column, left → right, in group order; **Vertical** gives each one a band, top → bottom. A scene whose composition fights the left/right split — two people stacked instead of side by side, a wide room with someone behind the other — is what the switch is for. The adapter rebuilds the prompt from the trimmed groups joined by that same ` | `, so the string it splits on is literally the string it hands the extension as `separator` — a prompt normalized one way and advertised another way would silently be a single region.

**Advanced mode — and Basic mode is not an option.** Basic mode looked like the simpler choice, and it is what this feature first shipped; it is unusable here. Its handler (`scripts/forge_couple.py`) rejects any prompt with fewer than **three** lines (`len(couples) < 3 - int(background == "None")`) and derives its geometry from the WebUI's own persisted UI state, so a two-group prompt — a shared scene plus one character, i.e. any POV scene where the viewer is never named — died on a live WebUI with `[Forge Couple] ERROR - Not Enough Lines in Prompt... [2 / 3]`. Advanced mode instead validates `len(couples) == len(mapping)` and takes its boxes **from us**, which is the only stateless, deterministic version of this. The remaining honest limitation is that those boxes are an even split: a composition the split does not match (two people lying down, one behind the other) is still the direction switch's problem, and a hand-placed box editor — or Mask mode, which wants a painted mask this app cannot produce — would be the next upgrade.

**What the extension says about itself.** Its own README warns that effectiveness depends on how well the checkpoint follows prompts, and that a checkpoint which cannot compose two people to begin with will not be rescued by regions. That matches this app's own advice: the models these presets target (`WAI`/`Illustrious`-class danbooru-tag checkpoints, or CLIP SDXL finetunes) are the ones worth trying.

#### The live progress readout

A local render takes minutes, so this dialect reports where it is:

- **The adapter polls** `GET {baseUrl}/sdapi/v1/progress?skip_current_image=true` every **600 ms** (`A1111_PROGRESS_POLL_MS`) while the `txt2img` POST is in flight, each poll with its own **3 s** budget (`A1111_PROGRESS_TIMEOUT_MS`) so a hung read cannot stack up behind the next one. It starts the first poll as soon as the request is away (not one interval later, or a short generation would report nothing at all), and a `settled` flag makes a late response a no-op — a progress sample for a finished job must not move the bar backwards. It reads `progress` (0..1), `state.sampling_step`, `state.sampling_steps` and `eta_relative`, and reports `{ progress, step, steps, etaSeconds }`. Every field is optional: a number the WebUI did not report is **omitted, never zeroed**. Every poll error is swallowed — an old build with no `/progress` route, or one that answers non-JSON, is never a reason to fail a generation that is otherwise fine.
- **The route** is `GET /api/images/progress?connectionId=…`, answered from an in-memory registry keyed by the **image connection id**. The snapshot is `{ active: true, progress?, step?, steps?, etaSeconds? }`, or `{ active: false }` when nothing is running on that connection (a poll that races the start or the end of a generation must answer, never throw). Without the parameter it is `400 {"error":"connectionId is required"}`. The entry is published from the adapter's `onProgress` and cleared in the generate route's `finally`, so a **failed** render clears it too — a crashed generation must not leave a permanent phantom progress bar in the footer.
- **The client polls** that endpoint every **700 ms** (`IMAGE_PROGRESS_POLL_MS` in `usePlaythrough.ts`) while an image generation is in flight **and** the active connection is `a1111`; any other dialect starts no polling at all. The loop stops when the generation settles — success, failure or cancel — which also nulls the readout, and a failed read is swallowed (it keeps the last readout and tries again next tick) so a progress blip can never disturb the generation.
- **The footer shows** `Sampling 12/28 · 43%`, built from whatever has actually been reported: the step pair when both numbers are present, and a percentage from `progress` (falling back to `step / steps`). A job that is still queued, or a build that reports nothing, simply shows no readout.

#### The prompt is chunked, never trimmed

Stable Diffusion's text encoder consumes the prompt in **75-token CLIP chunks** and weights everything past the first chunk less, so the tail of a long tag list quietly loses emphasis. BobbinLoom does **not** cut the prompt to compensate:

- `A1111_IMAGE_PROMPT_CAP` is **10000** characters and it is a **sanity ceiling so a runaway string cannot be posted — not a trim**. A 2000-character prompt is sent unchanged.
- Instead, the review modal (on an `a1111` connection only) shows an estimate — `About N tokens — M CLIP chunks of 75` — and, when the prompt spills past the first chunk, a warning that the tags past it are **weighted less** and that **the text is sent unchanged — nothing is trimmed, reordered or dropped**. The estimate is ~4 characters per token: an approximation, not a tokenizer (a real CLIP vocabulary would be a new dependency), and it is advisory — it changes nothing about what is posted. It is computed from the **draft**, so it updates as the user edits.
- The preset's `promptCharacterLimit` (1200 shipped) still applies to the composed prompt — the server clamps to `min(preset limit, 10000)`, which is what the modal's counter shows. That soft limit, **not** the 10000 ceiling, is the only thing that can cut an `a1111` prompt.

### Timeouts and retries

Image requests get their own budget, because local diffusion queues and Venice's image lane both blow past the 120 s text default:

```env
BOBBINLOOM_IMAGE_TIMEOUT_MS=180000
BOBBINLOOM_IMAGE_MAX_RETRIES=1
```

Defaults are **180000 ms** and **1** retry — except on `a1111`, where the timeout default is **600000 ms (10 minutes)** because a 1024x1024 SDXL batch at 30 steps takes minutes, and the connection can carry its own `timeoutMs` on top (precedence: connection → `BOBBINLOOM_IMAGE_TIMEOUT_MS` → dialect default). The `a1111` adapter does not retry at all: it sends one `txt2img` POST and reports whatever comes back, because a 60-second generation is not something to repeat. Only the image provider calls use this budget — the prompt-writing call is a text call and uses `BOBBINLOOM_TIMEOUT_MS` / `BOBBINLOOM_MAX_RETRIES`. For the retrying dialects, retryable statuses are 429, 500, 502, 503 and 504; retries are capped deliberately low for the same reason.

---

## The pipeline: button to stored file

| Endpoint | Purpose |
|---|---|
| `GET /api/images/:file` | Serve stored bytes. The file name *is* the hash, so the response is `Cache-Control: public, max-age=31536000, immutable`. A name that does not match `^[a-f0-9]{64}\.(png\|jpg\|webp)$` is a 404 before any filesystem call. |
| `POST /api/playthroughs/:id/messages/:messageId/image/prompt` | Dry run: compose the prompt, generate nothing. |
| `POST /api/playthroughs/:id/messages/:messageId/image` | Compose (or take) the prompt, render the image, store it, append the ref. |
| `GET /api/images/progress?connectionId=…` | The live readout for a generation in flight. `{ active: true, progress?, step?, steps?, etaSeconds? }`, or `{ active: false }` when nothing is running; `400 {"error":"connectionId is required"}` without the parameter. In-memory and keyed by image connection; only the `a1111` adapter publishes to it (see *The live progress readout*). |
| `DELETE /api/playthroughs/:id/messages/:messageId/images/:file` | Drop one image ref, then sweep. Idempotent. |
| `PATCH /api/playthroughs/:id/messages/:messageId/images/:file` | Replace one image's stored request body — the editor's **Save**. Generates nothing: the image, its bytes and the message are untouched, and the body becomes what the next re-send posts. |
| `POST /api/settings/images/sweep` | Manual orphan sweep. |
| `GET /api/prompt-config` · `PATCH /api/prompt-config` · `PUT /api/prompt-config/active` | The one **global prompt config** every playthrough generates from. Not image routes: they live in `src/server/routes/promptConfig.ts` — see [*Resolution order*](#resolution-order). |

The generate body is `z.object({ imageProviderId?, promptOverride?, negativeOverride?, seed?, promptDurationMs?, writerPrompt?, writerNegative?, rawRequest?, replaceFile? })` — all optional. The last three are the review path's echo: the dry run measured the text call and holds the writer's answer, and this request makes no text call of its own, so the client hands them back for the ref to store (see [*The previous-answer reference*](#the-previous-answer-reference)). A request `seed` wins over the connection's `seed`; with neither, the provider picks at random and the ref stores nothing. `rawRequest` and `replaceFile` are the re-send path — see [*Editing and re-sending a stored request body*](#editing-and-re-sending-a-stored-request-body). The response is:

```json
{
  "playthrough": { "...": "the updated record" },
  "image": { "file": "<sha256>.png", "prompt": "…", "negativePrompt": "…", "providerId": "…", "model": "…", "seed": 1234, "durationMs": 8123, "request": "{\"model\":\"…\",\"prompt\":\"…\"}", "promptRequest": "{\"model\":\"…\",\"max_tokens\":12000,\"response_format\":{\"type\":\"json_object\"}}", "promptResponse": "{\"choices\":[{\"message\":{\"content\":\"…\"}}]}", "createdAt": "2026-09-12T00:00:00.000Z" },
  "promptUsed": "anime style …",
  "negativeUsed": "lowres, worst quality, …"
}
```

The `image` object also carries `writerPrompt` / `writerNegative` — the writer's own answer, un-composed — when a text call produced one or the client echoed it back, and the prompt fillip fields are unchanged otherwise. `writerPrompt` is absent on an older client's both-overrides path.

`promptUsed` / `negativeUsed` are exactly the strings the route handed to the image provider — already prefix-composed, and already clamped: the **prompt** to the preset's soft limit **and** the dialect's hard cap, the **negative** to the dialect's hard cap alone. `image` is the first variant when `variants > 1`; the rest are appended to the message in the same order.

### Preview ON — the default path

`Settings → Chat → Review Image Prompt Before Generating` is **on by default**. The pipeline is two requests:

1. **Footer button** → `POST …/image/prompt` with `{ imageProviderId? }`. The server runs the text → image-prompt call exactly once, persists nothing, generates nothing, and answers `{ "prompt": "…", "negativePrompt": "…", "warnings": [], "promptDurationMs": 3100, "writerPrompt": "…", "writerNegative": "…", "context": { "historyMessages": 6, "instructionMode": "pov" } }` — already composed and clamped, so what the modal shows is byte-for-byte what the generate call will send. `warnings` are the prompt call's advisory notes (see below); the modal shows them above the editable prompt. `writerPrompt` / `writerNegative` are the model's own answer, and `context` reports what the writer was actually given: the number of messages the history window CARRIED (not the number the preset asks for — they differ on a chat's first message) and the perspective in force.
2. **`ImagePromptModal`** ("Review Image Prompt") shows both fields for editing, with **Generate**, **Cancel** and **Re-run text call** (the last replaces the drafts with a fresh text-model draft, staying inside the modal). Any warnings from the prompt call appear above the fields, warn-styled, so a suspected refusal or a key-less JSON answer is seen **before** the image call is paid for.
3. **Generate** → `POST …/image` with **both** `promptOverride` and `negativeOverride` set to the reviewed text. Because both are present, the server **skips the text call entirely** and sends the user's text — the text model is never asked twice, and edits are never discarded.

The in-flight state is a per-message `Writing image prompt…` status with **Cancel** while the dry run is in flight (the hook owns the request and the modal only owns the text, so closing the modal mid-flight aborts the call instead of leaving a stuck spinner); then a `Generating image…` status with **Cancel** during the image call.

### Preview OFF

One request: `POST …/image` with no overrides. The server runs the prompt call and then the image call in the same request, and no modal appears.

### The override rule

| `promptOverride` | `negativeOverride` | What runs |
|---|---|---|
| present | present | **Text call skipped.** Both sides are the overrides: the prompt is clamped to the preset's limit and the dialect cap, the negative to the dialect cap alone. This is the reviewed-prompt path. |
| present | absent | Text call runs; only the negative side comes from the model. The prompt side is the override. |
| absent | present | Text call runs; only the prompt side comes from the model. The negative side is the override. |
| absent | absent | Both sides come from the text model. |

"Present" means the field is a **string** — an empty string counts as present. The server sniffs `typeof body.promptOverride === "string"`.

### Editing and re-sending a stored request body

Every image's ref carries the exact JSON body that rendered it (`request`), and two controls under the
image work with it: **Edit request** opens it as JSON and **saves** it (nothing is generated), and
**Retry** sends it to the image provider **without a text call** and replaces the image it came from.
Together they are the fourth path through the generate endpoint — the one that composes nothing:
`rawRequest` is the body, `replaceFile` names the image it replaces.

#### Editing a stored request body

**Save is a write, not a render.** It replaces `request` on the ref — stored the way every other request
on a record is, as one line serialized from the parsed object — and touches nothing else. The image, its
bytes and the message are all left alone; the old image stays on screen, and its file is still referenced
by the same ref. No provider call of any kind happens, which is why saving works with **no image
connection at all** and why an unavailable connection does not disable it.

**What deliberately does not change.** `prompt`, `negativePrompt`, `seed`, `model`, `durationMs` and the
provenance fields keep describing the image that is actually there. Only `request` becomes the recipe —
what the next Retry will post. A saved-then-not-yet-sent body therefore means the ref's `request` and its
`prompt` disagree, on purpose: the caption, the alt text and the full-screen viewer describe what was
rendered, and the body describes what will be. That disagreement lasts until the retry lands, at which
point the new ref carries both from the same render.

**Errors.** The FIFTH row of the table below: a body that is not a JSON object, and a missing `request`
field, are both 400s; a ref, message or playthrough that does not resolve is a 404 (a ref that is gone
means the client is looking at a stale record — a branch, a replay, another window — so nothing is
silently created).

**Closing with unsaved edits asks first.** Cancel, the X and Escape all route through the same check, and
a dirty editor asks *Discard your edits?* — naming what is NOT lost, because "discard" otherwise reads like
it might throw the stored body away too. Saving closes the editor; a FAILED save keeps it open with the
text intact, with the reason under the field.

**The body is sent as it stands.** No clamping, no field added or removed, and — for the fields the
connection would otherwise supply — the body wins: `model`, `seed`, `size`, `style_preset`, `variants`,
`safe_mode` and (a1111) `override_settings.sd_model_checkpoint` are whatever the body says. That is what
makes a re-send worth having: the stored body carries the seed, checkpoint and size that were **actually
used**, so a fixed seed plus one changed tag nudges the same frame instead of rolling a new one. The
practical consequence to know: the body is **frozen in time**, so a retry renders with the checkpoint and
settings the body names — the original render's, or whatever an edit since replaced them with — and never
with the connection's current ones.

**The prompt side of the body is read back onto the ref.** `prompt` and `negative_prompt` are parsed out
of the sent body so the caption, the full-screen viewer, alt text and the previous-answer reference all
describe the render that actually exists. For the same reason the body's own model is what the ref
reports: a connection whose checkpoint has changed since must not relabel the image.

**What the re-send does not carry.** No text call runs, so the ref has no `promptRequest` / `promptResponse`
(the `prompt call` disclosure stays absent), no `promptDurationMs`, and no `writerPrompt` /
`writerNegative` — those fields mean "the prompt call's own answer", and a re-issued body has none. A later
image's previous-answer reference skips such a ref silently, exactly as it skips any answerless ref.

**It needs no text connection at all.** The image connection is the only requirement; a body can be
re-sent with no text provider configured.

**Where the body goes.** The re-send targets the connection the image was **made with** (`providerId` on the
ref), never the active one — a body was composed for one dialect and one endpoint. If that connection has
since been deleted the request is refused (`The image connection this request body belongs to no longer
exists.`) rather than aimed at whatever is active now, and the editor says so before you send. Note the
dialect of the CURRENT connection decides how the body is sent and how the response is parsed, so changing
a connection's `apiStyle` after the fact makes an old body a mismatch: the provider's own error is the
answer.

**The replacement is atomic, and only on success.** The new ref(s) are appended and the replaced ref is
dropped in the **same write**, so a failed, refused or cancelled render leaves the message exactly as it
was. The old bytes are swept afterwards only if nothing else references them. A `replaceFile` that no
longer matches anything still appends (a branch or a replay can have moved the ref).

**Every returned variant is kept.** The body decides how many images one call renders (Venice `variants`,
a1111 `batch_size`), so a re-sent body asking for four appends four and drops the one it replaced.

**Errors, in place of the composed path's vocabulary:**

| Status | Body | Cause |
|---|---|---|
| 400 | `{"error":"Send either a raw request body or prompt overrides, not both."}` | A request carrying both `rawRequest` and a prompt override: both are authoritative, so one of them has to be the source |
| 400 | `{"error":"The request body must be a JSON object."}` | `rawRequest` (or a save's `request`) was not JSON, or parsed to an array, string, number or `null`. The FIELDS are the provider's business; the SHAPE is this route's |
| 400 | `{"error":"The image connection this request body belongs to no longer exists."}` | `imageProviderId` named a connection that is gone (the ordinary path falls back to the active connection; a re-sent body cannot) |
| 400 | `{"error":"A request body string is required."}` | A **save** with no `request` field, or one that is not a string |
| 404 | `{"error":"Image not found"}` | A **save** naming a ref that is not on that message — a stale client, never a new ref |

### What the text call receives

`generateImagePrompt` sends one `/chat/completions` request with `temperature: 0.7`, `max_tokens: <the connection's own maxTokens>`, `response_format: { "type": "json_object" }`, and exactly two messages: the preset's `instruction` as `system`, and one `user` message built from:

```
PREVIOUS MESSAGES (what happened BEFORE the scene text below — continuity only,
NOT the frame to render):
<buildImageHistoryBlock — the last N prose messages behind this one, oldest
 first, labelled User:/Assistant:. Skipped: system messages, hidden (state-only)
 user messages, empty ones. Capped at 6000 characters by dropping whole OLD
 messages first; one message bigger than the whole budget keeps its TAIL, with a
 leading marker. Absent when the count is 0 or there is nothing behind the
 message. Present only when the preset's historyMessages > 0>

PREVIOUS IMAGE PROMPT (ONE earlier answer, for SHAPE only — its content belongs
to that earlier moment; do not copy its scene, clothing, pose or place):
<the newest PRIOR image's writerPrompt, plus a Negative: line when it carried
 one. Absent on the first image, on refs that stored no answer, and when
 includePreviousAnswer is off. Present only when that flag is on>

SCENE TEXT:
<the assistant message content>

PLAYER'S LAST ACTION:
<the nearest visible (non-hidden) user message before it — OMITTED whenever the
 history window already carries that same message, so the prose is never sent
 twice>

CURRENT STATE:
<buildImageStateBlock(playthrough) — the place, plus the player's VISIBLE physical
 state. Not summarizePlaythrough: that is the turn block (inventory, quests,
 allowed ids, reachable locations, absent characters, per-character memory) and it
 also carried the player's description, appearance and wardrobe>

PRESENT CHARACTERS:
<buildImageCastBlock(playthrough) — the player as THE CAMERA (never tag their
 stored appearance or clothing), then each character at the current location:
 their instance line (clothing/mood/conditions) plus their stable sheet identity>

Return ONE line of comma-separated tags describing this moment. Return JSON only: {"prompt": "…", "negative": "…"}
```

**The connection governs the budget.** `max_tokens` is the connection's own `maxTokens` — the prompt call has no ceiling of its own and no floor. A connection whose `maxTokens` is low will spend it on preamble before the answer starts and can return empty content at `finish_reason: "length"`, so give the text connection used for image prompts room to answer.

**The JSON contract is enforced, not merely requested.** `response_format: { "type": "json_object" }` is sent on every call, matching the turn path (`src/server/openAiCompatibleProvider.ts`). It is safe on a model or proxy that does not implement structured output: `requestWithRetry` (`src/server/provider/openaiClient.ts`) already retries **once, without** `response_format`, when the endpoint rejects the body with a 400/422/404. Nothing about the parsing below depends on the field being honoured — a model that ignores it and answers in prose still works.

Every block is omitted when empty (an empty header invites the model to invent one), and each is gated by its own field: `includeState` / `includeCast` for the two original context blocks, `historyMessages > 0` for the history window, `includePreviousAnswer` for the reference. **All non-current material is grouped AHEAD of `SCENE TEXT`**, deliberately: an example placed at the end of the message sits closest to the model's own output and anchors hardest. The blocks come from `src/server/provider/imageContext.ts`, and each one withholds more than it carries — the state block leaves out every turn-only category (inventory, quests, reachable locations, absent characters, per-character memory), and the cast block leaves out the player's wardrobe for the reason above.

The dry run and the generate call build this input in **one** place (`buildImagePromptInput` in `src/server/routes/images.ts`). That is what makes the review modal a review of what will actually be sent, and a test asserts the two requests' user messages are byte-identical.

#### The history window

`buildImageHistoryBlock` walks **backwards** from the frame for `historyMessages` messages and renders them oldest-first as one block, labelled `User:` / `Assistant:`. The selection rules:

- **Skipped**: system messages, hidden (state-only) user messages, and empty ones — the same material the turn prompt keeps out of a frame's view. A chapter-opening assistant message is ordinary prose and stays.
- **Budget: 6000 characters** (`IMAGE_HISTORY_CHARS`). Whole **older** messages are dropped first — half a sentence of an older beat is worse than not having it, and the nearest beats are the ones that carry continuity. A single message larger than the whole budget keeps its **TAIL**, with a leading `…[earlier text omitted]` marker: the end of an earlier message is the state it left the scene in, which is the part the writer needs. Nothing else is ever cut mid-sentence.
- It returns `messageIds`, and the caller uses them to **drop the `PLAYER'S LAST ACTION` block** whenever the window already carries that message — the same prose twice in one user message is waste, and the window is the only place it is needed. The block survives only when the window could not reach back that far.
- It is a **pure read**: nothing about image generation touches the turn counter, snapshots, or the token meter.
- **Cost:** the shipped instruction is ~15.5K characters (~3.6K tokens at the app's own ~4-chars/token estimate), so the window is a fraction of a call that is already paid for once per image, and it is capped.

#### The previous-answer reference

`includePreviousAnswer` gives the writer **one** earlier answer as an example. It is off by default, and the reason is the feature's own cost: an in-context example dominates a tag model — output converges on its framing, pose pairings and scene vocabulary, and because the example describes a *different* instant it can re-introduce clothing or positions the current frame has moved past. Exactly one example, never more.

- **Source: the prompt call's OWN answer** (`writerPrompt` / `writerNegative` on the ref), not the composed/sent prompt — the composed text carries `positivePrefix` (`anime style`), which would contradict the instruction's own "no style tags" rule and invite the writer to emit it, after which the composer prefixes it again.
- **Stored at write time, not re-derived.** `promptResponse` holds the answer *fenced inside a provider envelope* (every stored response in the live data is ```` ```json ````-fenced and unparseable by a plain `JSON.parse`), so reading it back would mean re-parsing a string we already had. The ref carries the parsed answer instead, capped by the same `clampStoredPromptResponse` as the response body.
- **`previousWriterAnswer` walks backwards from the target inclusive**, so every ref already on the target message is prior — a re-roll of the same frame is the closest reference there is — then earlier messages. It **never looks forward**: a later message's answer must not reach an earlier image, or a branch or a replay would see context the first run did not. Refs with no stored answer are skipped silently.
- **The echo is load-bearing.** On the review path the dry run writes the answer and the generate request makes no text call, so the client echoes `writerPrompt` / `writerNegative` back exactly like `promptDurationMs`. Without it, the reference would apply to every image *except* the reviewed ones — the likeliest to be "desirable".
- The block is labelled `PREVIOUS IMAGE PROMPT (ONE earlier answer, for SHAPE only — …)`, carries a `Negative:` line when the earlier answer had one, and sits with the history **ahead of the frame**. The instruction carries the matching rule: the example shows the SHAPE, its content belongs to an earlier moment, and when it disagrees with this frame, this frame wins. The answer is parsed as JSON — `prompt` and `negative` are the fields asked for (a model that still answers the legacy `negative_prompt` spelling is parsed the same way); if the model returns prose instead, the whole content is used as the prompt and the negative side falls back to the preset's negative prefix.

**The contract is two fields, and the negative is comma-joined onto the shipped list.** The ask is `{"prompt": "…", "negative": "…"}` — one line of booru-style tags for the prompt, and a scene-tuned set of negative tags on the negative side. A model that answers only `{"prompt": "…"}` still works (the negative side then falls back to the preset's shipped list alone). The two sides are composed differently: the negative is **comma-joined** — the preset's `negativePrefix` list first, then the model's tags — because both are comma-separated strings and a space join would splice two lists into one undifferentiated run. The **wrong-shape warning** fires when the JSON parsed as an object and carried **no string `prompt`** (a lone `negative` or `negative_prompt` included), since the fallback would otherwise leak the raw blob into the image prompt.

### The cast block carries each character's STABLE identity

`PRESENT CHARACTERS` describes every character at the current location **twice**: the instance line (`name — wearing white shirt, wet, wary`) and, when their sheet resolves, an identity line read from the character template:

```
Mira — wearing white shirt, wet, wary
Mira's hair — long brown hair, ponytail
Mira's sheet — Species: Human | Body: Height: 168 cm; Build: slim, athletic | Appearance: Hair: long brown hair, ponytail; Eyes: blue eyes
```

- The template is found in `playthrough.characterTemplates` by the instance's `templateId`, falling back to a template with the same **name** when the id does not resolve.
- The sections are read with the engine's own parser (`pickSections` / `isStubSection` in `src/engine/characterSections.ts`), in the order `Species`, `Gender`, `Body`, `Appearance`. Missing sections and stubs (`(not established)`, empty) are skipped.
- **`Clothing` is deliberately excluded**: the character *instance*'s clothing is the authoritative current state and already rides on the instance line. A sheet's starting outfit must not be re-imposed on a scene where the character has undressed.
- The injected identity is capped per character (`CAST_IDENTITY_CHARS`, **600**) so one long sheet cannot crowd out the scene. It was 320, and 320 starved `[Appearance]`: a sheet puts `[Body]` first and it runs 130-205 characters, so the clamp landed inside `[Appearance]` and cut its LATER bullets — where `Hair` usually sits. A live generation rendered a character with no hair at all while her sheet carried `- Hair: Long light brown, messy, often in a loose ponytail`; the writer's tags mirrored exactly the text that survived the cut.
- **Hair gets a line of its own, before the sheet line** (`<name>'s hair — …`), extracted by LABEL (`Hair:`, `Hair style:`, `Hair colour:`) from anywhere in the sheet and clamped separately at 120 characters. Label-anchored on purpose: a sheet may also describe ear-tufts "acting as hair" under the Ears bullet, and matching any line containing "hair" would headline the wrong feature. The headline is what makes the feature un-losable — the identity budget can trim the sheet line, it cannot touch this one.

The point is tag **consistency**: without it, the writer scrapes hair/eye/skin out of scene prose and the same character comes out looking different in every image.

**The player is the opposite case: nothing about them rides along.** The block opens with `THE CAMERA (the player — the scene is seen through this person; never tag their stored appearance or clothing, and never give them a " | " group)`, followed by the player's name and the **first sentence of their description only** — enough for gender and pronouns, which the count tag (`1boy`) and every `his`/`her` attribution depend on. The rest of a persona's prose, and all of their `appearance` / `bodyType` / `clothing`, are withheld. That is not tidiness: a per-image analysis of three stored generations found the persona's own wardrobe coming back as tags (`fair skin, black hair, black eyes, glasses, white long sleeve shirt, necktie, black slacks`), twice inside the SHARED group — which Forge Couple paints across the whole frame at weight 0.5 — and once as a third ` | ` group, which hands half the canvas to the player's wardrobe. Removing the text at the source is what makes the instruction's `THE PLAYER IS NOT A CHARACTER` rules enforceable rather than merely stated.

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

#### Four advisory warnings

The call also FLAGS three answers it still returns (never blocks — the review modal is where the user fixes them):

| Condition | Warning |
|---|---|
| The prose fallback was used **and** the text opens like a refusal | It opened with `"i can't"` (or `i cannot`, `i'm unable`, `i am unable`, `i won't`, `i will not`, `as an ai`, `sorry, but`, `i must decline`, `can't help with`, `cannot help with`, `cannot assist`) instead of describing an image, and that text is now the prompt. Matched case-insensitively against the **first 200 characters** only, so refusal-shaped words inside a real prompt are not misread. Typographic apostrophes (`I can’t`) match the same patterns. |
| The JSON parsed as an object but carried **no string `prompt`** | The raw JSON blob would become the image prompt, so the warning names the keys it did find. A lone `negative_prompt` counts as a wrong shape. |
| The `prompt` value is itself **JSON**, or **reads as prose** | `{"prompt": "{\"prompt\": \"One naked woman…\"}"}` is a real stored shape: the outer object parses, `obj.prompt` is a string, so nothing else caught it and the JSON rendered as the image prompt. Detected by a leading `{` / a nested `"prompt"` key, or — for prose — by a sentence-shaped answer (a copula beside sentence punctuation in the first 200 characters, no tag separator in the first 60 on a text over 120 characters, or over 600 characters with fewer than 6 commas). Deliberately conservative: a **terse** answer (`a woman in the rain`) is NOT flagged, because nagging on every short tag line trains the user to ignore the panel. Suppressed entirely when the no-`prompt`-field warning already fired (one cause, one warning) and when a refusal was flagged (a refusal *is* prose). |
| The **composed prompt was cut** at the character limit — in the prompt side call (`promptCharacterLimit`) or by the dry-run route's `min(preset limit, dialect cap)` clamp | *"The composed prompt is longer than the N-character limit, so it was cut at the end — where the action and physical-state tags sit. Move the essential tags earlier in the list, or raise the character limit on the Image Generation tab."* The cut is silent otherwise, and the END of a tag list is exactly where the action and physical-state tags live. The clamped text is still what the modal shows and what the image call sends. Tied to the **positive** only: the negative is a fixed shipped list with its own ceiling (the dialect cap), and a negative that somehow exceeded that cap is cut silently. |

A clean JSON answer, a fenced JSON block, a terse tag line and a two-group tag line produce no warnings. `ImagePromptOutput.warnings` carries them; the dry-run route returns them and the review modal shows them above the editable prompt. The truncation warning is added by the **dry-run route only** — the generate path has no UI surface, so the reviewed text it sends is unaffected (`promptUsed` / `negativeUsed` are byte-identical either way).

The two sides are then composed and clamped — by **different** budgets:

```
prompt         = clamp(composePrompt(positivePrefix, modelPrompt),   min(preset.promptCharacterLimit, dialectCap))
negativePrompt = clamp(composePrompt(negativePrefix, modelNegative), dialectCap)
```

`composePrompt` joins with a single space and drops an empty prefix so the composed text never starts with a stray space. For the **prompt**, the limit is `min(preset.promptCharacterLimit, dialectCap)`; a preset limit of **0 reads as unlimited** (the schema allows it) and is ignored as a limit. The prompt side call also clamps to `promptCharacterLimit` on its own (that is what makes the returned `prompt` "already composed and clamped"), which is why the truncation signal is reported as `ImagePromptOutput.promptTruncated` and not inferred from a length comparison in one place.

#### The negative has its own ceiling

The two texts are unrelated budgets, so they no longer share one:

- The **positive** is a model-written tag list that the preset sizes. It keeps `promptCharacterLimit` (1200 shipped), clamped against the dialect's hard cap — that is what the modal's character counter shows, and what the truncation warning is about.
- The **negative** is the shipped list plus the model's scene-tuned tags, **comma-joined** (the shipped list always comes first). Neither side of it is scene-shaped by the preset, so the preset's limit must not cut it: it is clamped by the **dialect cap alone** (`VENICE_IMAGE_PROMPT_CAP` = 7500, `OPENAI_IMAGE_PROMPT_CAP` = 1500), read from the same `dialectPromptCap` helper the prompt's clamp uses. One cap source, not two.

In practice that makes the shipped negative unclampable: the Default list is **649 characters** (689 with the NSFW censorship suffix), comfortably inside both caps. A ceiling sized for a 40–70-tag model answer would silently delete the *end* of the list — which is where the clauses that fight photoreal drift and censoring sit (`photorealistic, realistic, 3d, cgi`, and the NSFW `censored, mosaic censoring, bar censor`) — and nothing is gained by cutting a curated list.

The change lives in the route, because the route is where the dialect is known: the dry-run `/api/…/image/prompt` route, the generate route's compose path, and **both** override branches (the both-overrides reviewed path and the one-override path) all clamp the negative through `clampNegative`. A negative that somehow exceeded the dialect cap is still cut there, silently — the truncation warning names the prompt's action/state tags and stays tied to the positive. And note again that the **OpenAI-compatible dialect sends no negative prompt at all** (line 40): its 1500-character cap governs the prompt only, and a negative is only ever sent on the Venice-native dialect.

One seam remains worth knowing: the prompt-writing side call composes the model's `negative` (or the legacy `negative_prompt`) under `promptCharacterLimit` on its own, because it holds no connection and therefore no dialect to ask. The shipped list, which is the first half of the negative in practice, reaches the provider whole; an override (either branch) never passes through that call.

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
| `seed` | optional — **the seed that was actually used**, so a later re-roll with the same prompt and seed is comparable. On `a1111` it is read back out of the WebUI's `info` string (the authoritative value — the request sent `-1` when the seed was random); on Venice it is what we sent. Absent when the provider picked one (Venice's `0`, a1111 whose `info` said nothing, or the OpenAI-compatible dialect, which has no seed field at all) — `0` is never stored as if it were a seed. |
| `durationMs` | optional — the RENDER time (`model · render 25.9s`). |
| `promptDurationMs` | optional — the **text provider's** measured time for the prompt that produced this image: the other half of the same story, and measured on whichever request ran the call (the dry run's, echoed back on the review path). |
| `writerPrompt` | optional — the prompt call's **own answer**, before `positivePrefix` and clamping were composed onto it. The composed text stays on `prompt`. Stored at write time so a later image can be handed one earlier answer as a shape reference, and so the raw answer is readable without re-parsing the fenced JSON inside `promptResponse`. Absent when no text call ran and the client echoed nothing. |
| `writerNegative` | optional — the same, for the model's own negative tags. |
| `request` | optional — the **JSON body that was sent to the image provider** for this image (diagnostic provenance), and the body **Retry** re-sends / **Edit request** rewrites (see [*Editing and re-sending a stored request body*](#editing-and-re-sending-a-stored-request-body)). An image generated before the field existed has no such controls — there is nothing to re-send. A body saved since the render is a *recipe*: `prompt` and the rest still describe the image that is there |
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

- `PromptPreset.imageGeneration` (optional) carries the `ImageGenerationSettings` shape.
- A preset with no block falls back to `DEFAULT_IMAGE_GENERATION_SETTINGS`. The field is `.optional()` with **no default**, so a preset written without it keeps parsing.
- The **inner** fields carry defaults, so a *partial* block always parses to a complete one — but note that a partial block's missing prefixes default to `""`, not to the shipped `anime style`.

| Field | Schema default | Meaning |
|---|---|---|
| `instruction` | the shipped instruction | The `system` message for the prompt call. |
| `positivePrefix` | `""` (shipped presets: `anime style`) | Prepended to the model's prompt. |
| `negativePrefix` | `""` (shipped presets: the 53-tag list below) | Prepended to the model's negative prompt. Clamped by the **dialect cap alone** — `promptCharacterLimit` does not apply to this side. |
| `promptCharacterLimit` | `1200` (`IMAGE_PROMPT_CHARACTER_LIMIT`, for a *partial* block as well as the shipped fallback) | Soft limit, clamped against the dialect's hard cap. `0` = unlimited. |
| `includeState` | `true` | Send `CURRENT STATE` to the prompt writer. |
| `includeCast` | `true` | Send `PRESENT CHARACTERS` to the prompt writer. |
| `instructionMode` | `"pov"` | Which perspective the instruction is read in. `pov` is the shipped document unchanged; `scene` swaps four perspective passages for their third-person counterparts **and** makes the player a character in the cast block, with an instance line and an identity line of their own. See [*Instruction modes*](#instruction-modes-pov--scene). |
| `historyMessages` | `6` (`IMAGE_HISTORY_MESSAGES`; max `12`) | How many messages behind the frame the writer sees. `0` = off. The **read-time** default is the shipped value, like the two flags above — so a config written before this field existed gains history on its next image, with no other change. |
| `includePreviousAnswer` | `false` | Give the writer ONE earlier answer as a shape reference. Off by default: an in-context example anchors a tag model. See [*The previous-answer reference*](#the-previous-answer-reference). |

### Resolution order

```
global promptConfig.imageGeneration   (the live global config — wins)
  → DEFAULT_IMAGE_GENERATION_SETTINGS  (src/engine/imageDefaults.ts)
```

The block is parsed through `ImageGenerationSettingsSchema`, so a partial block always resolves to a complete one. `resolveImageSettings` in `src/server/routes/images.ts` is the only read site.

### The global config

There is **one** prompt configuration — `promptConfig` (+ `activePresetId`) in `data/user-settings.json` — and every playthrough generates from it. Editing the block in Settings → Prompt Configuration → Image Generation applies to the next generation **everywhere, immediately**: there is no per-playthrough snapshot and nothing to refresh.

- `PUT /api/prompt-config/active` copies a preset's config over the global one and points `activePresetId` at it (404s an unknown preset). The preset editor calls it for both **switching** and **Load/Reload** — the two are the same operation, and both discard unsaved edits.
- `PATCH /api/prompt-config` merges one or more sections, leaving the others untouched (400s an invalid block with the reason, and writes nothing).
- **Save** writes the working config back to the backing preset through `PUT /api/prompt-presets/:id` (a read-only preset 403s — use "Save as New…").

### Instruction modes (POV / Scene)

`instructionMode` is a **swap, not a second document**. The shipped instruction is one text; four of its passages state the POV contract, and each is held in `PERSPECTIVE_PAIRS` (`src/engine/imageDefaults.ts`) as a literal POV/Scene pair:

| Passage | POV | Scene |
|---|---|---|
| the perspective rules block | `THE PLAYER IS NOT A CHARACTER` (the wardrobe-leak rules, and what the player may contribute to the shared group) | `THE PLAYER IS A CHARACTER IN THIS FRAME` (the player is tag material — appearance, clothing, position — but never `pov` / `viewer's` tags, and they get their own group in a crowded frame) |
| `CHARACTER REFERENCE`'s first bullet | "…and the camera block for the player" | "the CAST block for everyone in frame, the player included" |
| the `SD FORGE COUPLE` POV bullet | the player's body tags go in the first group | the player is grouped the way a character is |
| the camera section | `THE PLAYER (POV scenes)` | `CAMERA AND FRAMING`, plus the count-tag rule (one player and one character is `1boy, 1girl`) |

`applyInstructionMode(text, mode)` swaps whichever side of each pair it finds, which makes it **its own inverse** (pov → scene → pov round-trips the document byte for byte) and a **no-op on an instruction that carries neither side** — a hand-written one. The editor says so when that is the case ("this instruction carries neither the POV nor the Scene perspective rules, so the mode does not change it"). The swap is applied **twice** on purpose: the preset editor rewrites the instruction field when the dropdown changes (so the textarea never shows a document other than the one that will be sent), and the side call applies it again, idempotently, so the system message can never disagree with the block that gates the cast.

**Presets written under an earlier wording still switch.** `LEGACY_SCENE_SIDES` holds the four Scene passages from before the current POV/Scene split. A preset that contains them still switches: the swap rewrites what is *in* the document rather than what we would write today, and without them that preset would go inert and the mode would stop changing anything. The mapping is **by index**, aligned with `PERSPECTIVE_PAIRS` and asserted; the legacy pass runs in the **`pov` direction only**, so a document switched back to Scene gets today's text.

**The mode's other half is context, not text.** The cast block follows the mode, because the instruction alone cannot supply a fact the context withheld: in `scene` mode `buildImageCastBlock` gives the player the **same two lines any character gets** — an instance line (`Anon — wearing White Long Sleeve Shirt, Necktie, Black Slacks, handcuffed`, or `clothing unspecified` when the persona brings none) and an identity line built by `playerIdentity()` from the persona's **first sentence** + `bodyType` + `appearance`, clamped to the same 600 characters a character's sheet gets.

The first sentence is the load-bearing part: it is what carries gender and pronouns, which the count tag and every `his` / `her` attribution depend on. The **rest** of a persona's description is deliberately left out — that prose is the wardrobe material that leaked onto a character in the first place — and a persona has no sheet **sections**, so there is no template to read instead. Those three fields are the persona editor's own answer to "what is stable about this person". POV keeps the player-as-subject rule: a camera line and **no** wardrobe, because there the character is the subject of a lens the player is holding the wrong way.

`tests/settings.test.ts` is the drift guard for all of it: every POV side must be a **verbatim substring** of the shipped constant (or the swap silently stops matching), every Scene side must be absent from it, both shipped presets must round-trip scene → pov unchanged, and the derived NSFW document must survive the swap.

### The two shipped presets

`data/prompt-presets.json` ships **Default** and **Default (NSFW)**, both `readonly: true` (read-only in the UI — use **Save as New…** for an editable copy). Both set:

| | Default | Default (NSFW) |
|---|---|---|
| `positivePrefix` | `anime style` | `anime style` |
| `negativePrefix` | `lowres, worst quality, low quality, normal quality, blurry, out of focus, jpeg artifacts, bad anatomy, deformed, bad proportions, poorly drawn face, long neck, malformed limbs, missing limbs, extra limbs, extra arms, extra legs, bad hands, extra fingers, extra digits, fewer digits, missing fingers, fused fingers, mutated hands, duplicate, text, dialogue, speech bubble, thought bubble, caption, subtitles, comic, comic panel, panel layout, multiple views, 4koma, storyboard, split screen, collage, border, watermark, signature, username, artist name, logo, web address, patreon username, twitter username, stamp, photorealistic, realistic, 3d, cgi` | …the same list, plus `, censored, mosaic censoring, bar censor` |
| `promptCharacterLimit` | `1200` | `1200` |
| `includeState` / `includeCast` | `true` / `true` | `true` / `true` |
| `instruction` | the shipped instruction | the shipped instruction, with the **rating bullet replaced** by the NSFW one and an **`EXPLICIT SCENES`** block inserted immediately before the final Return-JSON-only line |

**The negative prefix is a 53-tag suppression list, shipped whole.** It is ordered the way a booru negative should be: quality and artifact tags first (`lowres, worst quality, low quality, normal quality, blurry, out of focus, jpeg artifacts`), then anatomy (`bad anatomy, deformed, bad proportions, poorly drawn face, long neck, malformed limbs, missing limbs, extra limbs, extra arms, extra legs, bad hands, extra fingers, extra digits, fewer digits, missing fingers, fused fingers, mutated hands, duplicate`), then text and comic-page artifacts (`text, dialogue, speech bubble, thought bubble, caption, subtitles, comic, comic panel, panel layout, multiple views, 4koma, storyboard, split screen, collage, border`), then provenance marks (`watermark, signature, username, artist name, logo, web address, patreon username, twitter username, stamp`), and last the photoreal-drift pair that the anime prefixes need (`photorealistic, realistic, 3d, cgi`).

Three omissions are deliberate and are asserted by `tests/settings.test.ts`: **`manga` is absent** (it names a drawing style as well as a medium, and these presets are anime-prefixed), **`cropped` / `out of frame` are absent** (tight close-ups must stay available), and **no character-count negative appears anywhere** (`multiple girls`, `extra person`) because scenes routinely have two people in them. `extra fingers` is kept *and* `extra digits` / `fewer digits` / `missing fingers` alongside it — different tag models respond to different spellings. The preset's `promptCharacterLimit` never cuts it: the negative answers to the dialect cap alone (**The negative has its own ceiling** above). `Default (NSFW)` ships the same list with the censorship suffix appended — `censored, mosaic censoring, bar censor`.

**The instruction deliberately forbids style keywords** (`No style or quality tags (anime style, masterpiece, best quality) — a style prefix is added separately.`), because `positivePrefix` is the single place art direction lives: a preset can be restyled without touching the instruction text. The instruction asks for a **booru-style tag list**, not a prose sentence, because the target models are tag-trained (`WAI`/`Illustrious` are danbooru-tag models) or CLIP finetunes (`Lustify`). Three rules in it exist because prose kept leaking back through: **every item is a tag, not a clause** (no articles, no copula, no joining words), carrying a WRONG/RIGHT counter-example taken from a real failure; **one frame, one instant**, so a movement chain like *"gripping him while arching her back"* becomes `gripping his shoulders, back arched`; and **`her`/`his` attribution only when a tag could belong to either person** — in a two-character scene the model otherwise has no way to know whose hair, eyes or clothing it is describing. A fourth rule, **MULTIPLE CHARACTERS**, exists for the renderer rather than for the encoder: each person's tags stay together in one ` | `-separated group with the shared scene first, so a two-character prompt can be split into per-character regions (see [*Multi-character regions*](#multi-character-regions-forge-couple)), while a one-character scene has no separator at all. The order is written for the encoder too: rating, count, framing, place and pose all land inside the first ~300 characters, which is the first CLIP chunk and the part that always reaches the model at full strength.

`Default` — the instruction, by section (not copied here):

The instruction text lives in `DEFAULT_IMAGE_PROMPT_INSTRUCTION`, and `tests/settings.test.ts` pins the shipped preset to it **byte for byte**. It is not reproduced here — this page describes it by section instead, so there is only one copy to keep current.

Its sections, in order, each a rule rather than prose:

| Section | What it decides |
|---|---|
| opening paragraph + `FORMAT` | JSON only, one line of tags, the 40–70 count, the rating tag first, the ~300-character weighting (the first CLIP chunk), no style keywords, "only what the message shows", and the tag discipline rules (no filler to reach a count, no invisible qualities, no compound action sentences) |
| `DISTINGUISHING NAMES FROM TAGS` | story names never; species/race/franchise tags always |
| `SPECIES AND NON-HUMAN CHARACTERS` | the species tag anchors the model's template — traits alone produce a human with fur and ear-tufts |
| `THE PLAYER IS NOT A CHARACTER` | the persona's wardrobe must not become the character's tags. A **perspective passage** — the Scene side replaces it with `THE PLAYER IS A CHARACTER IN THIS FRAME` |
| `CHARACTER REFERENCE` | the core identity tags that must appear every time a character is in frame, read from the cast block |
| `WRONG / RIGHT` | the prose-leak counter-example, taken from a real failure |
| `TAG ORDER` | rating, count, species, framing, scene, pose, appearance, expression, clothing, physical state |
| `WHO IS WHO` | `her ponytail` / `his black hair` attribution in a two-character scene |
| `MULTIPLE CHARACTERS` | one group per character, separated by a pipe, the shared scene first |
| `SD FORGE COUPLE / REGIONAL PROMPTING` | why the grouping exists, and what the player contributes to it. Partly a **perspective passage** |
| `THE PLAYER (POV scenes)` | the POV camera rules. The **perspective section** |
| `VOCABULARY` | preferred tag shapes, so a detail is omitted rather than invented |
| `NEGATIVE PROMPT` | what to counter for this scene, under 20 tags |
| `BEFORE OUTPUTTING` | the internal checklist, never output |
| `EXAMPLES` | one-group, two-group and two-group-with-POV shapes |

`Default (NSFW)` is that same document with exactly two mechanical changes, asserted as a **string equality** against the core constant so the two cannot drift apart:

- the **two** rating bullets are replaced (`... — nsfw or explicit when the scene is sexual, safe or sensitive when it is not, never a blend.`);
- an `EXPLICIT SCENES` block — three bullets: tag the act plainly at the same explicitness, keep established appearance/clothing/arousal consistent, never censor or sanitise — is inserted immediately **before `BEFORE OUTPUTTING`**, not before the `Return JSON only:` line, which is where it was described before that was true.

The Image Generation tab in the preset editor exposes **nine** fields in this order: instruction mode, instruction, positive prefix, negative prefix, character limit, the `include current state` and `include present characters` toggles, the history count, and the `include previous image prompt response` toggle. Changing the mode rewrites the instruction field in place, so the textarea always shows the document that will be sent.

---

## The chat surface

`src/client/components/views/PlayView/ChatPanel.tsx`, `usePlaythrough.ts`, `ImagePromptModal.tsx`, `src/client/engine/displayFormat.ts` (the caption and `formatDuration`).

- Every **assistant** message gets a footer button: **Generate Image**, or **Generate another** once it has images. It is disabled when there is no image connection, with a tooltip explaining why (`No image provider configured — add one in Settings → Provider → Images`), and while another action is in progress.
- Generated images stack **inside the same message container, newest last**. Each is a figure with the image, a remove control (`Remove this image` — the tooltip and the confirm dialog both say *the file is deleted if nothing else uses it*), and a caption of `model · prompt 3.4s · render 25.9s · seed N`. Every part is omitted when absent: a Venice random seed (`0`) shows no seed, and a ref written before `promptDurationMs` existed keeps the unlabelled caption it had. The two times are labelled **only when both exist**, so the label never lies about which half a single number is. `shortModelName` drops the extension and hash tag (`waiANINSFWPONYXL_v140`), and the caption **wraps**: it carries the model, both times and the seed, which does not fit one line in a phone-width panel, and an ellipsis was hiding the seed. The formatter and the caption itself live in `src/client/engine/displayFormat.ts` — pure functions, unit-tested without a React renderer, and shared with the full-screen viewer so the two can never disagree. Clicking the image opens it full screen (`common/ImageViewer` — a shared component, not chat-specific): Escape, a backdrop click or its close button dismiss it, and it carries the same caption the thumbnail does.
- Every generated image carries a compact collapsed **`request`** disclosure under it (inside the same message container and the same figure) revealing the pretty-printed JSON body that went to the image provider — diagnostic provenance, not content, so it is small, muted, monospace, height-capped and horizontally scrollable, with a **Copy** button. A ref stored before the field existed shows no disclosure at all (no empty box).
- Above that disclosure, the same ref gets **Retry** and **Edit request** — the body's own two controls, and they exist only where a stored body does. **Retry** re-sends it (it asks first: the image it replaces goes away when the new one arrives); **Edit request** opens it as editable JSON with **Save**, **Reset** (back to the stored body) and **Copy**. Saving renders nothing — the image stays, and the editor closes; a failed save keeps it open with the text intact and the reason under the field. Cancel, the X and Escape all ask *Discard your edits?* when there are unsaved changes, so no close path can drop a hand-edit silently. They sit in the block under the artwork rather than floating on it, and they go quiet while anything else is in flight for the message.
- Next to it, a second collapsed **`prompt call`** disclosure shows the *prompt-writing* side call: its request body and the text provider's response, labelled `Request` / `Response`, same quiet treatment and also collapsed by default, each block with its **own** Copy button (independent copied state — one affordance per block, not one per panel). It is absent when the prompt came from the user's own edits (both overrides), because no text call ran for that image.
- In-flight states are per message, each with a **live elapsed counter** beside it and a **Cancel** button: `Writing image prompt… 4.2s` (the dry run) then `Generating image… 1m 03s` (the render). The counters are driven by phase stamps the HOOK sets once (`imagePromptStartedAt` / `imageGeneratingStartedAt`) and tick from `performance.now()` at both ends — deriving them from a message id or a progress payload would restart the clock every 700 ms, and `Date.now()` minus a `performance.now()` stamp is the machine's uptime. `formatDuration` is minute-aware (`1m 23s`), because a local render is minutes and `110.0s` is not a number anyone reads at a glance. Cancelling reports `Image prompt cancelled.` or `Image generation cancelled.`; a failure reports `Image generation failed — nothing was changed.`
- `Settings → Chat` is grouped into **Chat Message / Image Generation / Debugging**. The Image Generation group holds `Review Image Prompt Before Generating` (default **on**) — which decides whether the modal appears at all: on, dry run first, then the reviewed prompt posted back as both overrides; off, one request and no modal — `Generate Image right after AI Response` (per-device, default **off**), and `Always Discard Old Image on Re-send` (per-device, default **off**). The second fires from the two places a turn's state lands (`handleSend`, which covers Continue, and `confirmRetry`), and skips **silently** whatever it cannot do: chapter openings, a message that already has images, another phase in flight, and — resolved before any state is touched — a user with no image connection, who would otherwise get a failure notice after every turn. Review still wins, so the modal appears for confirmation. It costs one text call plus a render per turn, which is why it is opt-in and why the toggle's own description says so. The third is the only image switch that skips a confirmation instead of changing what is generated: with it off, a re-send asks before replacing the image (and the confirmation's own *Always discard old image* checkbox turns it on for you); with it on, re-sending goes straight through.
- The image provider caption in the modal is `<label> · <model>` of the image connection the request will use, and beneath it sits the **context line** the dry run reports: `Context: 6 previous messages · POV instruction` (or `Context: this message only`, or `· Scene instruction (third-person)`). It names what the writer was actually given, because a prompt that looks wrong for a reason that has nothing to do with the model — an empty window on a first message, a scene instruction in force — is otherwise indistinguishable from a bad answer, and the alternative is paying for a render to find out.

---

## Using an image as a playthrough cover

Every image the story generates is also a candidate cover for its card on the playthrough shelf,
and the shelf picks one by itself: your own pick first, then the newest image in the story, then
a collage of the present cast, then the placeholder mark. Nothing has to be generated or chosen
for a card to have art — the latest image is the cover until you say otherwise.

The pick is made in **Gallery Media** (the play view's Journal tab, under **Media**), which
lists every image the story has produced, newest first, with the chapter and turn each one came
from.

Archived chapters are included, and the list is sectioned by chapter — the running chapter first,
then closed chapters newest-first — so a long story stays navigable. The automatic cover draws
from a smaller set on purpose: the newest image of the chapter you are playing. **Use as cover** sets the pick, stored on the
playthrough as a reference to the image's content-addressed file, so it costs no extra bytes and
survives a duplicate or a timeline branch. **Clear custom cover** returns the card to the
automatic chain.

A cover fills its frame; the frame's shape is the **Cover Art** display setting (Portrait, 1:1
Square or Landscape). Collage tiles are the one exception — each shows the whole portrait over a
blurred copy of itself.

Deleting an image that is the current cover removes the choice with it; that confirm says so
before it acts, and the card falls back to the latest remaining image.

[`playthroughs.md`](playthroughs.md) owns the shelf and the priority order.

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
| 502 | `{"error":"A1111 image provider error <status>: <body> — the WebUI must be started with --api — without it every /sdapi/v1/* route answers 404"}` | The WebUI call failed (a1111 dialect). A **404** means the WebUI is missing `--api` (the hint names it); a **401/403** means `--api-auth` / `--api-key` is on and the key field disagrees — a key with a colon is sent as HTTP Basic, anything else as Bearer (see [`provider-setup.md`](provider-setup.md) → *Local AUTOMATIC1111 / Forge*). |
| 502 | `{"error":"Image provider returned no image data"}` | The image response carried no usable payload (e.g. a plain `http` URL instead of a data URL) |
| 500 | `{"error":"Image sweep failed"}` (or the thrown message) | `POST /api/settings/images/sweep` failed |

**400 vs 502.** A 400 means the request cannot be attempted as configured — wrong message role, or a missing connection. Nothing was charged and nothing changed. A 502 means a provider call was attempted and failed; the playthrough is unchanged (the write happens only after the bytes are stored), and the error text carries the upstream status and body.

### The near-1500-character compat cap

The OpenAI-compatible `/images/generations` endpoint rejects prompts over 1500 characters with a 400. The route clamps the **composed** prompt (prefix + body) to the dialect cap, and the adapter clamps again, so a long prefix or an over-long edit in the modal is truncated rather than rejected. The truncation is a plain `slice(0, limit).trimEnd()`. The preset's `promptCharacterLimit` (1200 for both shipped presets) is the *soft* limit and the one the modal's character counter shows; the hard cap is 1500 for `openai` and 7500 for `venice`. A preset limit of 0 means unlimited **up to the dialect cap**.

This whole section is about the **prompt**. The negative has its own ceiling — the dialect cap alone, never the preset's soft limit — so none of the soft-limit arithmetic above applies to it (see *The negative has its own ceiling*). It is also worth restating here that the `openai` dialect sends **no `negative_prompt` at all**: this cap is the only clamp the negative could ever meet on that dialect, and it never meets it because the field is not sent.

**The `a1111` ceiling is a sanity cap, not a trim.** The WebUI publishes no prompt cap at all — it chunks the prompt at **75 CLIP tokens** and simply weights everything past the first chunk less — so cutting at the ceiling would silently delete the tail tags the user was explicitly warned about in the review modal instead. `A1111_IMAGE_PROMPT_CAP` is **10000** characters, sized so a runaway string cannot be posted; a 2000-character prompt is sent unchanged. The signal moves to the modal instead: on an `a1111` connection the review modal shows a chunk estimate (`About N tokens — M CLIP chunks of 75`) and, past the first chunk, that the tail tags are weighted less and that **the text is sent unchanged**. The preset's `promptCharacterLimit` still applies to the composed prompt — the server clamps to `min(preset limit, 10000)` — and it is the only thing that can cut an `a1111` prompt below the ceiling. See *The prompt is chunked, never trimmed*.

Soft-limit cuts are reported: the dry run adds a **truncation warning** to its `warnings` array (shown in the review modal) whenever the composed prompt was cut, at either ceiling. That matters here — a tag list puts its most disposable tags last and its action/physical-state tags at the end, so a cut removes exactly the part the instruction insists on. The reviewed generate call still sends the identical clamped text; only the dry run reports. The negative is deliberately not part of this warning: it is a curated list, not a model answer, and its only ceiling is the dialect cap.

### Re-sending: four ways a body surprises you

- **An identical body and seed can produce identical bytes** — the same hash, so the same stored file, and the message then looks unchanged. Nothing is broken (the file is still referenced and the sweep keeps it); a re-send is only worth pressing when something about the request differs, or the dialect has no deterministic seed to pin.
- **A body that names a script the WebUI no longer has is a 422.** An a1111 body carries the Forge Couple entry only when regions engaged at the time, and a re-send does not re-detect the extension — uninstalling it turns that one retry into A1111's own `always on script <name> not found`, reported verbatim.
- **An over-long prompt is now the provider's error, not a clamp.** The re-send path sends the body as it stands, so an edited body over the OpenAI-compatible dialect's 1500-character cap comes back as the provider's 400 instead of being quietly cut. That is the point — the review modal's counter and the truncation warning belong to the composed path, where BobbinLoom owns the text.
- **The connection's `apiStyle` decides how the body is sent**, and the body's dialect is not recorded on the ref. Editing a connection from `venice` to `a1111` (or the reverse) after an image was rendered leaves that image's body aimed at an endpoint that never composed it; the provider's rejection is the answer.

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

- Pixel models take `width`/`height` (from `size`); **aspect-ratio models (the qwen-image family) reject them**. Set **Aspect Ratio** on the connection instead — the adapter then sends `aspect_ratio` and **drops the connection's `size` entirely**, because the two are mutually exclusive upstream.
- `size: "auto"` (and any unparseable value) means "the provider picks".
- `GET /models?type=image` reports each model's `model_spec.constraints` — the prompt cap, the step range, `widthHeightDivisor`, and either a list of `aspectRatios` (a ratio model) or no ratios at all (a pixel model). It is the only place a provider publishes what a checkpoint accepts, so it is the only honest way to answer *which sizing parameter does this model take?*
- A plain `http` URL in an image response is not fetched — the adapter only accepts inline base64 or a data URL.

### The editor shows what the selected model accepts

`POST /api/settings/providers/models` parses that response twice over: the id list (`models`, unchanged — deduped and sorted) and a per-model capability map (`modelSpecs`, keyed by id) read from the **same** body, so surfacing a model's constraints costs no second request. The probe's shape is `{ ok, models, modelSpecs, status, message, latencyMs }`; `testProviderConnection` still answers only `{ ok, status, message, latencyMs }`.

The map is tolerant by construction, because it is an optional convenience and never a reason to fail a call:

- every capability field is optional — an omitted one simply says nothing;
- a model with **no `model_spec`** has no entry at all (never an empty object);
- `resolution` is collected structurally (a flat list of tiers or an object keyed by aspect ratio) and flattened to strings;
- a malformed body, a non-2xx status, or a rejected request all yield `{}` — never a throw.

The image editor renders it **read-only** under the Model field whenever the listing knows the model: the prompt character limit, the step range, and the sizing rule *with the numbers that matter* — `width/height in multiples of 8`, or `aspect_ratio, one of 1:1, 3:2, 16:9 (default 1:1) — it does not take width/height`. Nothing renders when the model is unknown to the listing or the probe failed.

That block is the answer to the sizing confusion above: `aspect_ratio` and `width`/`height` are mutually exclusive upstream, so a model silently ignores whichever one it does not take (and the connection's `size` is dropped the moment an aspect ratio is set), and only the provider's own listing says which one a given checkpoint wants.
