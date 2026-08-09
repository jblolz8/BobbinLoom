# BobbinLoom — Provider Connections

---

## Overview

BobbinLoom stores **named provider connections** — each connection bundles a
label, base URL, API key, model, and generation parameters (temperature, max tokens,
context window). You can keep many connections configured (e.g. DeepSeek, Kimi, a local
LM Studio/Ollama server) and switch which one is **active** at any time.

- The **active** connection is the one the engine uses for all generation.
- Fresh installs start with **no connections** — there are no built-in seeds.
  Everything is user-created in Settings → Provider.
- The frontend never sees full API keys. Keys are stored server-side and shown only
  as a masked value (`••••1234`) in the UI.

---

## Where things live

- **Connections + active selection:** `data/providers.json` (created empty on first
  run; gitignored — never commit it). Versioned (`schemaVersion`); corrupt or
  invalid files are archived to `.bak` and either salvaged (valid connections
  kept) or reseeded, with a warning banner in Settings.
- **App settings** (`data/settings.json`): slim `{schemaVersion, defaultPresetId}`
  store — holds only the global default prompt preset. The old provider fields
  were removed from it; legacy files migrate in place on first read.

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

## Environment variables (optional)

```env
BOBBINLOOM_MAX_RETRIES=1
BOBBINLOOM_TIMEOUT_MS=120000
```

`BOBBINLOOM_MAX_RETRIES` and `BOBBINLOOM_TIMEOUT_MS` tune request behaviour for every
connection. All other provider configuration (base URL, model, API key, params)
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

## Current limitations

- non-streaming only
- chat completions only
- no provider-specific tool calling
- no image inputs
- one global active provider (per-playthrough selection is a future feature)
