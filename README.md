# Jones in the Fast Lane

A modern, cross-platform remake of Sierra's 1990 life-simulation board game
*Jones in the Fast Lane*. Move around a town, work, study, shop, and invest to be
the first to reach your life goals — Wealth, Happiness, Education, and Career.

This project rebuilds the game with a clean, testable architecture: the original
game logic is reimplemented in TypeScript and rendered with **PixiJS + React**, so
the same codebase runs in the browser and ships to iOS/Android via Capacitor.

## Goals

1. **High-resolution visuals** — final art authored at 4K; built first with clean
   placeholders on a 4K-ready layout so final art drops in without rework.
2. **Modern stack** — React + TypeScript with **PixiJS** as the 2D rendering engine.
3. **Native platforms** — easy iOS/Android store submission via Capacitor wrapping
   the web build.
4. **Online-ready** — internet and AI-agent opponents are a future, additive layer;
   the core is built deterministic and command-driven from day one.
5. **Faithful but configurable** — the original rules are preserved, with weights,
   economy, and AI algorithm exposed as data/config.
6. **Custom audio** — the audio system is built for drop-in music and SFX.

## Source material

- **Original DOS game** — used as a **design and melody reference only** (assets are
  Sierra's proprietary, low-resolution SCI resources; not extracted or shipped).
- **Java port** ([`dimidd/openjones`](https://github.com/dimidd/openjones)) — used as
  the **code skeleton/structure** for the logic port.
- **Game-logic reference** — all rules, formulas, tables, and messages were extracted
  and reconciled from the
  [Jones in the Fast Lane Wiki](https://jonesinthefastlane.fandom.com/) into
  [`docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md`](docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md).
  This is the **authoritative source of truth**; where it conflicts with the Java
  port, the reference wins.

## Architecture

A monorepo with clearly separated packages. The logic core has zero rendering
dependencies, so it is reusable by the UI, the AI, and a future server.

```
packages/
  core/     @jones/core   — pure game logic: serializable GameState +
                            reduce(state, command, config) → { state, events }
  config/   @jones/config — all tunable game data (map, jobs, economy, goals,
                            AI weights) as typed plain data
  game/     @jones/game   — PixiJS rendering + responsive React UI (the app)
  ai/       @jones/ai     — AI players (ported planner agents) [later phase]
apps/
  mobile/   Capacitor project wrapping the web build [later phase]
assets/     source art (4K-ready) + drop-in audio folders
docs/superpowers/
  specs/    design + authoritative game-logic reference
  plans/    task-by-task implementation plans
```

**Key principles:** deterministic seeded RNG (same seed + same commands ⇒ identical
game), one-way data flow (UI dispatches commands; the core owns game truth), and
adaptive responsive layout across phone / tablet / PC.

## Development phases

The MVP is a **full local game loop** (milestones M1–M3). Mobile packaging and online
play are designed-for and built afterward.

| Phase | Status | Description |
|------|--------|-------------|
| **M1 — Logic core + config** | Complete | Deterministic, headless, fully-tested TypeScript core: seeded RNG, movement, work, win-check, goals. |
| **M2 — Economy & Hiring** | Complete | Dynamic economy model (weekly index/reading, crash/boom events) and hiring commands (ApplyForJob, RequestRaise, QuitJob). |
| **M3a — Education** | Complete | Degree enrollment and study mechanics: 11 degrees with prereq chains, enrollment fee, graduation bonuses. |
| **M3b — Items & Shopping** | Complete | All purchasable items: fast food, clothes, durables, books, tickets, newspaper. BuyItem command with 40 item types. |
| **M3c — Financial** | Complete | Banking (deposit/withdraw), loans, stock & T-bill trading via broker, lottery tickets. 9 commands, 10 events. |
| **M3d — Housing & Pawn** | Complete | Rent payment, extension requests, apartment switching, wage garnishment, and a shared pawn shop (pawn/redeem/buy). 6 commands, 8 events. |
| **M3e — Rent & Loan Due** | Complete | Loan repayment (PayLoan) and automatic start-of-turn due-date processing: unpaid rent becomes Rent Debt (driving wage garnishment), unpaid loans default. 1 command, 3 events. |
| **M3 — AI players** | Complete | `@jones/ai` package: `RandomPlanner` + `BudgetPlanner` (a budgeted priority-ladder agent) play full games headlessly through the existing `reduce` interface. Difficulty presets (easy/medium/hard) via config. Hard-difficulty `BudgetPlanner` legitimately wins 40/40 headless test seeds. |
| **M3f — Food & Health** | Complete | Cooking Bonus, Hot Tub relaxation exemption, Spoiled Food, Starvation, Doctor Visit, and the new `Relax` command — fills in the start-of-turn sequence's food/health cluster. |
| **Guaranteed termination** | Complete | A `maxWeeks` cap (default 156) ends any game that hasn't produced a goals-based winner, awarding it on points — every headless game now provably terminates. |
| **M4a — State bridge & app shell** | Complete | `@jones/game` package: Zustand store bridges the UI to `@jones/core`'s `reduce`; a minimal debug screen proves the full human command-dispatch loop end-to-end. |
| **M4c — Action screens** | Complete | Real per-location screens (stores, bank/broker, pawn shop, university, employment office, rent office, home) replacing the debug screen's generic button list — every `@jones/core` command is now reachable from the UI. |
| **M4 — PixiJS board + AI wiring** | Complete | A clickable PixiJS board (13 locations on an illustrated town backdrop with a drawn road loop, per-player car tokens with travel animation) wired to `@jones/game`'s human/AI seats — solo-vs-AI is fully playable end-to-end, one click travels to and enters a building. The board fills the full viewport responsively and shows an on-board status plaque (time left, cash, week, work location) with an End Turn button. |
| **M4 — Placeholder art, audio, hotseat** | In progress | Employment Office and Hi-Tech U have illustrated buildings and bespoke redesigned action screens (a LinkedIn-style job board with an animated hiring-manager reaction, and a futuristic university tablet); the other 11 locations are still flat-colored placeholder cards, not final 4K-ready assets. Player tokens are illustrated cars (tinted per seat), but no other character art exists. No audio (`howler.js` is a planned dependency, not yet added). Only one human seat is supported today (`gameStore.ts` always creates exactly one `isAI: false` player) — hotseat (multiple human players on one device) isn't implemented. **These are what's left before M4/MVP is done.** |
| **M5 — Mobile packaging** | Future | Capacitor iOS/Android builds for the App Store / Play Store. |
| **M6 — Online play** | Future | Server-authoritative networked multiplayer + AI-agent-as-player, added on the existing command-driven core. |

M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), M3f, guaranteed termination, M4a, M4c, and the
PixiJS board + AI wiring are complete. Plans are in
[`docs/superpowers/plans/`](docs/superpowers/plans/).

## Documentation

- **Design spec:** [`docs/superpowers/specs/2026-06-15-jones-in-the-fast-lane-design.md`](docs/superpowers/specs/2026-06-15-jones-in-the-fast-lane-design.md)
- **Game-logic reference (authoritative):** [`docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md`](docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Tech stack

TypeScript (strict) · pnpm workspaces · Vitest · PixiJS v8 · React · Zustand ·
Howler.js (audio) · Capacitor (mobile) · Vite.

## Running locally

**Prerequisites:** Node.js 20+ and [pnpm](https://pnpm.io) 9+.

```bash
pnpm install        # install all workspace packages
pnpm test           # run the full test suite (logic packages + @jones/game)
pnpm typecheck      # type-check every package
```

**The app (`@jones/game`):** a Vite + React dev server rendering a clickable,
responsive PixiJS board (13 locations on an illustrated town backdrop, car tokens,
travel animation, an on-board status plaque with an End Turn button) plus
per-location action screens for every game command. Solo-vs-AI is fully playable
end-to-end. Employment Office and Hi-Tech U have illustrated buildings and
redesigned screens; the other 11 locations, and all character art besides the car
and hiring-manager, are still flat-colored placeholders — final art, audio, and
hotseat (multiple human players) are the remaining M4 work.

```bash
pnpm --filter @jones/game dev    # starts the dev server (prints the local URL)
pnpm --filter @jones/game build  # production build, output to packages/game/dist
```

**Running a single package's tests** (useful while iterating):

```bash
pnpm test -- --project=logic                       # @jones/config, @jones/core, @jones/ai
pnpm test -- --project=game                         # @jones/game (jsdom)
pnpm test -- packages/core/test/finance.test.ts     # one file, any package
```

## Status

M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), M3f, guaranteed termination, M4a, M4c, and the
PixiJS board + AI wiring are complete — 40 item types, full financial subsystem,
rent/housing mechanics, wage garnishment, a shared pawn shop, loan repayment, automatic
rent/loan due-date processing, a headless AI opponent (`BudgetPlanner`, winning 40/40
test seeds) that's also playable live on a clickable board, Cooking Bonus/Starvation/
Spoiled Food/Doctor Visit/Relax, and a `@jones/game` app with real per-location action
screens covering every command. 412 tests passing.

The board is now an illustrated town backdrop with a drawn road loop, per-player car
tokens, and travel animation; it fills the full viewport responsively at any screen
size, with an on-board status plaque (time left, cash, week, work location) and an
End Turn button — the earlier fixed-size board and debug screen below it are gone.
Employment Office and Hi-Tech U have illustrated buildings and bespoke redesigned
screens (a LinkedIn-style job board with an animated hiring-manager reaction, and a
futuristic university tablet with in-place job actions).

Remaining before M4/MVP is done: final 4K-ready art for the other 11 buildings and
all character art besides the car and hiring-manager, audio, and hotseat (multiple
human players on one device).
