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
| **M1 — Logic core + config** | In progress | Port the rules to a deterministic, headless, fully-tested TypeScript core, seeded from the logic reference. No graphics. |
| **M2 — AI players** | Planned | Port the plan-based AI agents; they play full games headlessly. Difficulty via config. |
| **M3 — Rendering + UI + audio** | Planned | PixiJS board + responsive React UI + drop-in audio, wired to the core. **End of M3 = MVP:** full local game, solo-vs-AI and hotseat, responsive, placeholder 4K-ready art. |
| **M4 — Mobile packaging** | Future | Capacitor iOS/Android builds for the App Store / Play Store. |
| **M5 — Online play** | Future | Server-authoritative networked multiplayer + AI-agent-as-player, added on the existing command-driven core. |

The current M1 work is decomposed into bite-sized, test-driven tasks. The first
executable slice (monorepo, config, deterministic state machine, and a runnable
turn loop with movement/work/win-check) is described in
[`docs/superpowers/plans/2026-06-15-m1-core-foundation.md`](docs/superpowers/plans/2026-06-15-m1-core-foundation.md).

## Documentation

- **Design spec:** [`docs/superpowers/specs/2026-06-15-jones-in-the-fast-lane-design.md`](docs/superpowers/specs/2026-06-15-jones-in-the-fast-lane-design.md)
- **Game-logic reference (authoritative):** [`docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md`](docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md)
- **Implementation plans:** [`docs/superpowers/plans/`](docs/superpowers/plans/)

## Tech stack

TypeScript (strict) · pnpm workspaces · Vitest · PixiJS v8 · React · Zustand ·
Howler.js (audio) · Capacitor (mobile) · Vite.

## Status

Early development. The design, an authoritative game-logic reference, and the first
implementation plan are complete; the logic core is being built next.
