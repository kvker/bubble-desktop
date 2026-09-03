# Bubble Desktop Pet

> [中文文档](README.md)

A transparent desktop companion widget that sits in the corner of your screen. Don't think of it as a game — it keeps you company while you type. Two little bubble dragons spin a wheel in sync with your keystrokes; press Space to fire a bubble along the wheel's angle. Bubbles pop and recycle automatically when they fly too far, so they never pile up.

Built with **Electron + PixiJS + uiohook-napi** (PixiJS handles all rendering with no DOM animation overhead). macOS is the development prototype platform; Windows is the primary release battlefield.

## Features

- Transparent always-on-desktop widget, draggable with position memory
- Global keyboard capture:

  | Your action | Widget reaction |
  | --- | --- |
  | Press any key on the left half (G/T/V and left, incl. 1–5) | Wheel turns left, left dragon steps, scroll sound |
  | Press any key on the right half (H/Y/B and right, incl. 6–0) | Wheel turns right, right dragon steps, scroll sound |
  | Press Space | Fires a bubble along the wheel angle (launch sound); pointer auto re-centers |
  | Arrow keys ← / → | Turn the wheel left / right (only these two special keys) |
  | Any letter / digit key | The pressed character fades in at the bubble's center (white text, black outline, shadow) |
  | `Cmd/Ctrl + Shift + B` | Show / Hide (global shortcut) |

- Bubbles pop and recycle on hitting the top — nothing accumulates
- Tray menu: show / hide, always-on-top, sound toggle, independent scroll / fire volume levels (10%–100%, persisted), restore / disable click-through, stats panel, launch at login, quit; "Grant Access" entry shown when not authorized
- Stats panel: daily star-collection scores for the last 7 days, plus per-key click counts (26 letters, digits 0–9, left/right arrows) for the last 7 days

Keyboard listening is **global**: the wheel reacts even while the widget isn't focused and you type in another app.

## Quick Start

Requirements: Node.js and pnpm. macOS needs an Accessibility permission for first run (see below).

```bash
pnpm install    # first install (postinstall generates vendor runtime)
pnpm start      # run the widget (pnpm dev is the same)
```

Checks and packaging:

```bash
pnpm verify       # syntax check + automated tests + skin validation
pnpm run dist     # build installer
```

Automated tests use Node's built-in test runner with no extra dev dependencies.

## macOS First Run: Permission

Global keyboard capture requires the Accessibility permission. When not granted, the tray menu shows a "Grant Access" entry that opens the system permission flow (or go to System Settings → Privacy & Security → Accessibility and enable this app). **Restart the app after granting.**

Fallback when not authorized: the widget only reacts to keys while its window is focused.

No permission is needed on Windows.

## Packaging (macOS)

```bash
pnpm run dist   # outputs dmg and zip in dist/ (Apple Silicon, unsigned)
```

Notes:

- After packaging it's a standalone app; grant Accessibility separately (does not share the dev-time Electron grant), then restart.
- Unsigned apps get blocked by Gatekeeper on other Macs on first open — right-click → Open works.
- App icon is an original AI-generated logo; the tray icon uses a system template image (auto-adapts to dark/light).

## Skin System (JSON driven)

Characters are driven by `skins/<id>/character.json` instead of fixed sprites. A skin declares `type: "text" | "image"` and shares one animation pipeline (overall morphing across `fire` / `walk` / `idle` states):

- **text skin**: a character made of text; styling (size, weight, fill, outline, shadow) comes from `style` with a system font stack — no font files are bundled, zero font-licensing burden.
- **image skin**: one static PNG per state, swapped by state.
- Animations support scale, skew and position via `sine` / `pulse` waves; adding a character only needs one skin file plus a line in `skins/index.mjs` — zero animation code changes.
- `pnpm validate:character` fully validates skin fields and is part of `pnpm verify`.

Extending skins is the basis for future commercialization (free core + paid skins); the resource layout follows the `skins/<id>/` convention.

## Tech Stack

- **Electron**: desktop shell and main-process capabilities (global keyboard, tray, IPC, global shortcut)
- **PixiJS**: renderer scene and per-frame orchestration
- **uiohook-napi**: N-API global keyboard listener (no Electron rebuilds needed)

## Directory Layout

```text
main.js                    Main-process entry and desktop orchestration
├── main/keyboard-hook.js  Global keyboard capture: only emits key:down / key:up facts
├── main/window-state.js   Window position persistence and display validation
├── main/score-stats.js    Daily star-score persistence and reporting
└── main/desktop-ipc.js    IPC trust boundary and window dragging

preload.js                 Minimal renderer API
src/game.js                PixiJS scene, input and per-frame orchestration
├── src/game/domain.mjs    Pure domain rules with no runtime deps
└── src/features/          Autonomous gameplay features (stars, scoring, event contract)
```

## License

MIT License — see [LICENSE](LICENSE).
