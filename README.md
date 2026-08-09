# BobbinLoom 🧵

A local-first AI-Roleplay Story Engine. Story-first characters with thin runtime state, SillyTavern-compatible lorebooks, OpenAI-compatible providers, and a prompt-module preset system.

## Run

- **Windows:** double-click `start.bat` (build + serve), then open the printed URL.
- **Linux / macOS / Android (Termux):** `./start.sh` — first run installs dependencies and builds the client; later runs start instantly. Use `./start.sh --rebuild` after pulling updates.
- **Dev:** `npm run dev` — API server on port 8787 (see `.env.example`), Vite client on its default port.

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
