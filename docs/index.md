---
title: BobbinLoom
section: Overview
order: 1
---

# BobbinLoom

BobbinLoom is a roleplay story engine. You describe a scenario, it builds a world, and from
there you play it as a conversation: you write what your character does, the model narrates the
world and everyone in it, and the application keeps the world's state in your local files.

Everything runs on your machine. There is no account and no bundled model — you connect your
own text and image providers. See [Provider Connections](provider-setup.md).

## Running the app

Node.js 20 or newer is the only requirement.

| Mode | Command | What happens |
|---|---|---|
| Launcher | `start.bat` (Windows) / `./start.sh` | Checks dependencies and the client build, fixes what's stale, then serves |
| Update | `update.bat` / `./update.sh` | Same, but forces both a dependency install and a client rebuild |
| Development | `npm run dev` | API on `:8787` (tsx watch) plus the Vite dev UI on `:5173` with hot reload |
| Production | `npm run build && npm start` | Vite builds to `dist/`, then one Fastify server serves the UI and the API on a single port |

`HOST` and `PORT` control where the server binds (see `.env.example`). The default is
`0.0.0.0:8787`, which is reachable from your network or VPN.

> **There is no authentication.** Anyone who can reach the port can use the app and spend
> your provider credits. Set `HOST=127.0.0.1` for local-only access, and only expose it on a
> network you trust.

## Where your data lives

Everything is a file under `data/`, and playthroughs are one JSON document each.

| Path | Holds |
|---|---|
| `data/playthroughs/<id>.json` | One playthrough — its world, cast, messages, chapters, snapshots |
| `data/characters/<slug>/` | The character library: card JSON, versions, CCv2 sidecar, avatars |
| `data/personas/<slug>/` | Player personas |
| `data/lorebooks/<id>.json` | Lorebooks in SillyTavern World Info format |
| `data/prompt-presets.json` | The shipped prompt presets |
| `data/settings.json` | The committed defaults template — never written by the app |
| `data/user-settings.json` | Your runtime overrides: active preset, prompt configuration, taxonomy, theme |
| `data/providers.json` | Provider connections |
| `data/.providers-key` | Your API keys, encrypted |

## Feature index

**Playing**
- [Playthroughs](playthroughs.md) — creating, scenario generation, blank starts, drafts, duplication
- [Turns & the chat surface](turns-and-chat.md) — the turn loop, message actions, choices, images, debug
- [Chapters & memory](chapters-and-memory.md) — chapter save points, the memory event pipeline, Story So Far
- [Timelines](timelines.md) — branching from any message, internal vs standalone branches

**World**
- [World state](world-state.md) — locations and the map, quests, inventory, flags, NPCs
- [Lorebooks](lorebooks.md) — keyword-activated world info
- [Player character & personas](player-and-personas.md) — the player's own sheet and reusable templates

**Characters**
- [Character format](character-format.md) — the sheet, its sections, structured clothing, presence gating
- [Character library](character-library.md) — storage, tags, versions, CCv2 import, AI assist

**Prompting**
- [Prompt architecture](prompt-architecture.md) — the message array, the token budget, memory selection
- [Prompt modules](prompt-modules.md) — preset-owned modules, the shipped presets, the sheet format
- Context meter — see [Prompt architecture](prompt-architecture.md#measuring-estimate-vs-measured)

**Providers**
- [Provider connections](provider-setup.md) — text and image providers, keys, models
- [Image generation](image-generation.md) — dialects, the prompt pipeline, storage

**Interface**
- [Settings & interface](settings-and-interface.md) — settings tabs, theme, taxonomy, the responsive layout

## The shape of the project

The application is a TypeScript monorepo in one process tree:

```
src/schemas/    Zod types — the single source of truth for every persisted shape
src/engine/     Pure functions: state patches, factory, sections, budgeting, taxonomy
src/server/     Fastify: routes, stores, migrations, prompt assembly, providers
src/client/     React: views, modals, library surfaces, design-system primitives
tests/          Vitest — engine, server and provider behaviour
```

Two rules run through the whole codebase:

- **The engine is pure.** Every world mutation is a `StatePatch` op applied by
  `applyStatePatch`, which returns a fresh state and never mutates its argument.
- **The model proposes, the engine decides.** Field values the model generates are stored as
  free-form strings and validated only where a wrong value would break the app.

This documentation describes what the application does today. It is the reference for how
features work, kept alongside the code it describes.
