# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Video Speed Controller — a Manifest V3 Chrome extension that controls `playbackRate` (and seek/markers) of any HTML5 `<video>`/`<audio>`, bundled with esbuild into `dist/`.

## Commands

```sh
npm run build              # esbuild → dist/ (load unpacked from dist/ in chrome://extensions)
npm run dev                # watch build
npm test                   # vitest: tests/unit + tests/integration (jsdom)
npx vitest run tests/unit/core/arbiter.test.js     # single file
npx vitest run -t "name substring"                 # single test by name
npm run test:tlc           # TLA+ model check of specs/*.tla (needs Java 11+, downloads pinned TLC to ~/.cache/videospeed/tlc)
npm run build && node tests/e2e/run-e2e.js <youtube|basic|settings|display|arbitration|lifecycle|all>   # Puppeteer e2e
```

- **Lint on Windows**: `npm run lint` fails here (single-quoted globs aren't stripped by cmd.exe → "No files matching"). Use `npx eslint "src/**/*.js" "tests/**/*.js"` instead.
- Prettier config lives in `package.json` (single quotes, 100 cols, trailing commas es5). Husky pre-commit runs lint-staged; pre-push runs lint + tests.
- CI (`.github/workflows/ci.yml`): `npm audit`, lint, `build:release`, `npm test`, `test:tlc`, package.
- `manifest.json` keeps `"version": "0.0.0"`; the build injects the version from `package.json`. Release steps: `docs/release.md`.

## Architecture

### Two worlds, one bridge

The content side runs as two scripts per frame (see `manifest.json`):

- **`src/entries/content-bridge.js`** — ISOLATED world, `document_start`. The only content code with `chrome.*` access. Reads `chrome.storage.sync`, applies enable/blacklist/`siteRules` gating, and relays popup messages.
- **`src/entries/inject-entry.js` → `inject.js`** — MAIN world, `document_idle`. All real logic. No `chrome.*` APIs.

They talk only via `CustomEvent`s on `document.documentElement`: `VSC_REQUEST_SETTINGS` / `VSC_SETTINGS_READY` (settings handshake; `{abort: true}` disables the page), `VSC_WRITE_STORAGE` (page → bridge writes, validated against speed limits duplicated in the bridge), `VSC_STORAGE_CHANGED`, and `VSC_MESSAGE` (popup → `chrome.tabs.sendMessage` → bridge → page, including `VSC_TEARDOWN`). `StorageManager` is context-aware: real `chrome.storage` in extension pages, the event bridge in MAIN world.

`src/background.js` (service worker) only handles icon state and storage migration. Popup/options live in `src/ui/popup` and `src/ui/options`.

### `window.VSC` global namespace (no ES exports)

MAIN-world modules are side-effect imports that register classes/singletons on `window.VSC` (e.g. `window.VSC.VideoController`, `window.VSC.videoSpeedConfig`, `window.VSC.siteHandlerManager`) and usually guard against double registration. **Load order matters** and is defined in `src/entries/inject-entry.js`; `tests/helpers/module-loader.js` mirrors that order. When adding a MAIN-world module, add it to both. `src/content/inject.js` (`VideoSpeedExtension`) must load last — it wires config, observers, `ActionHandler`, `EventManager` and `VideoController`s together.

`vitest-setup.js` installs a chrome mock and pre-loads all modules once; tests share `window.VSC`, so vitest runs single-worker (`maxWorkers: 1`).

### Key subsystems

- **Speed arbitration** (`src/core/arbiter.js` pure decision core, `intent-classifier.js` heuristic gesture evidence, `speed-arbitration.js` DOM adapter) decides who owns `playbackRate` when user, site player, and VSC all write it (fight-back, adoption of native changes, per-media conflict records, authority epochs). Contract: `docs/speed-arbitration.md`; formal model: `specs/SpeedArbiter.tla`; differential tests in `tests/integration/*differential*`.
- **Controller visibility** (`src/core/controller-visibility.js`) is a layered state machine (override AUTO/SHOW/HIDE, autohide, feedback timers, CSS precedence). Contract: `docs/controller-visibility.md`; model: `specs/ControllerVisibility.tla`.
- **Floating controller** (`src/ui/floating-controller.js`) — one viewport-anchored toolbar per document following the last played video; embedded frames delegate UI to the top document; position persisted per origin in `localStorage`.
- **Site handlers** (`src/site-handlers/`) — per-site quirks (seek APIs, ignored videos, gesture rules, special video discovery) for YouTube, Netflix, Facebook, Amazon, Apple, extending `base-handler.js`, selected by `index.js`. They no longer position the controller: every controller host is the floating toolbar mounted on `<html>`. See `docs/custom-player-handler.md`.
- **Observers** (`src/observers/`) discover media via mutation observation and shadow-DOM traversal.

## Rules for changing behavior (from CONTRIBUTING.md)

- Anything that changes how `playbackRate` is decided must identify the affected transition-table cell(s) in `docs/speed-arbitration.md`, keep `specs/SpeedArbiter.tla` in sync, and run `npm test` + `npm run test:tlc`. Classifier heuristics must cite the motivating issue. Shared/local arbitration or controller lifecycle changes should also run `node tests/e2e/run-e2e.js arbitration`.
- Controller visibility changes (override, autohide, feedback timers, CSS precedence, broadcast actions, teardown) must name the changed transition/precedence rule in `docs/controller-visibility.md` and run `npm test`, `npm run test:tlc`, `npm run build`, `node tests/e2e/run-e2e.js display`.
- `VideoController.remove()` must call `SpeedArbitration.release(video)` to clear per-media timers/records.
