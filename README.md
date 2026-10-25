# BobbinLoom 🧵

A local-first AI-Roleplay Story Engine. Story-first characters with thin runtime state, SillyTavern-compatible lorebooks, OpenAI-compatible providers, and a prompt-module preset system.

## Run

- **Windows:** double-click `start.bat` — builds the client bundle, starts the server, and opens the default browser automatically.
- **Linux / macOS / Android (Termux):** `./start.sh` — builds the client bundle, starts the server, and opens the default browser automatically.
- **To pull updates and install dependencies:** `update.bat` / `./update.sh` — runs `git pull --ff-only` and `npm install`.
- **To toggle LAN / network listen mode (`.env`):** `toggle_listen_server.bat` / `./toggle_listen_server.sh` — creates, edits, or removes `.env` (`HOST` and `PORT`, defaulting to `0.0.0.0:8787` on Enter).
- **Dev:** `npm run dev` — API server on port 8787 (see `.env.example`), Vite client on its default port.

## Documentation

- [`docs/character-format.md`](docs/character-format.md) — character sheet, instance, and runtime-state format
- [`docs/character-library.md`](docs/character-library.md) — Booru-style library, tags/taxonomy, CCv2 import, AI tag suggestion & brainstorming
- [`docs/prompt-modules.md`](docs/prompt-modules.md) — the prompt-module preset system
- [`docs/provider-setup.md`](docs/provider-setup.md) — provider connections, API keys, and the provider interface surface
- [`docs/image-generation.md`](docs/image-generation.md) — image providers and dialects, the generation pipeline, content-addressed storage, and the preset image-prompt config

### Termux (Android) setup

```sh
pkg install nodejs-lts git
git clone <repo-url> && cd bobbinloom
./start.sh
```

Then open `http://localhost:8787` in your phone's browser. To reach it from another device on the same network, set `HOST=0.0.0.0` in `.env` first, then use `http://<phone-LAN-IP>:8787`.

## License & Credits

[![License: AGPL-3.0](https://img.shields.io/badge/License-AGPL--3.0-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)

[AGPL-3.0](LICENSE) · [Credits](CREDITS.md) — inspired by [SillyTavern](https://github.com/SillyTavern/SillyTavern) and [Marinara Engine](https://github.com/Pasta-Devs/Marinara-Engine).
