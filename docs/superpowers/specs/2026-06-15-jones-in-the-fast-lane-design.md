# Jones in the Fast Lane — Modern Remake Design

**Date:** 2026-06-15
**Status:** Approved design (pre-implementation)

## Summary

A modern, cross-platform remake of *Jones in the Fast Lane*. We **port the game
logic** from the existing Java port ([`dimidd/openjones`](https://github.com/dimidd/openjones))
to TypeScript and **rebuild the presentation** with PixiJS + React. The original
Sierra DOS game is used as **design and melody reference only** (not as an asset
source — see "Source Material").

The first deliverable (MVP) is a **full local game loop**: the complete game
playable solo-vs-AI and local hotseat (2–4 players), responsive across mobile /
tablet / PC, with clean placeholder art authored at a 4K-ready layout and a
drop-in audio system. Mobile app-store packaging and online play are designed-for
but built in later phases.

## Goals / Requirements

1. **High-res visuals** — final art at 4K; built with clean placeholders now, on a
   4K-ready layout so final art drops in without rework.
2. **Stack** — React + TypeScript with **PixiJS** as the 2D rendering engine.
3. **Native platforms** — easy iOS/Android store submission via Capacitor wrapping
   the web build.
4. **Future online play** — internet players and AI-agent-as-player added later as
   an additive layer; the core is designed to support it from day one.
5. **Maintain the logic, configurable** — faithful port of the original mechanics,
   with weights, economy, and AI algorithm exposed as data/config.
6. **Custom audio** — the Java port has **no audio**; the user supplies all music
   and SFX. The audio system is built for drop-in files.

## Source Material

- **Original DOS game** (`/Users/tbergman/dos_games/Jones-in-the-Fast-Lane_DOS_EN`):
  a Sierra **SCI1.1** game (VGA 320×200, 256 colors). Assets live in proprietary
  `resource.001/.002` archives. Audio is **MIDI-style sequence data** (for
  MT-32/AdLib/SoundBlaster synths), not recorded audio. **Decision: keep the
  original as reference only** — do not extract or ship its assets (copyright +
  low fidelity). Mechanics, prices, layout, and melodies may inform our originals.
- **Java port** (`dimidd/openjones`): a clean reimplementation of the **game
  logic** — used as the **code skeleton/structure**. We port `jones.*` to TypeScript
  and discard its Swing/Batik rendering and placeholder art. Key packages mapped:
  `jones.general` (Game/PlayerState/turn loop), `jones.measures` (Goals + stats),
  `jones.map` (locations, grid, A\* routing), `jones.actions`, `jones.possessions`,
  `jones.jobs`, `jones.agents` (39 files of plan-based AI players), and the
  pluggable `EconomyManager`. The port is a *reinterpretation* and has inaccuracies
  vs the original — so it is the structure, not the authoritative numbers.
- **Game-logic reference (authoritative)**:
  [`2026-06-15-jones-game-logic-reference.md`](./2026-06-15-jones-game-logic-reference.md),
  extracted and reconciled from all 143 articles of the
  [Jones in the Fast Lane Wiki](https://jonesinthefastlane.fandom.com/). This is the
  **source of truth** for all rules, formulas, tables, and messages. Where it
  conflicts with the Java port, the reference wins. All numeric tables in it seed
  `@jones/config`.

### Canonical constants (authoritative — from the logic reference)

- `MAX_PLAYERS = 4`, **60 Hours per turn**, `INITIAL_CASH` per original.
- **Win goals: FOUR goals**, each set per player to 10–100; win when all four are met
  at the start of a turn:
  - **Wealth** = `floor(Liquid Assets / 100)` (100-goal ⇒ $10,000)
  - **Happiness** = Happiness stat
  - **Education** = `1 + (9 × Degrees)` (100-goal ⇒ all 11 Degrees)
  - **Career** = `1.25 × Dependibility`, **0 if unemployed** (100-goal ⇒ 80 Dep + a job)
- **Note — port discrepancies corrected here:** the Java port adds a fifth **Health**
  goal and uses `TIMEUNITS_PER_WEEK=600` / a different Career formula (target 850).
  We follow the original: **4 goals (no Health), 60-Hour turns, Career = 1.25×Dep**.
  See §13 of the logic reference for the full discrepancy list.

## Key Decisions

- **MVP scope:** full local game loop (logic port + PixiJS board + responsive UI;
  solo-vs-AI and hotseat; placeholder 4K-ready art; audio hooks). No mobile build
  or online in the MVP.
- **Art strategy:** clean placeholders now, authored at the final 4K layout, swapped
  for final art later with no layout change.
- **Online-ready core:** deterministic, serializable, command-driven state machine
  from day one, even though the MVP is local.
- **Architecture:** Approach A — monorepo with a pure-logic core, a PixiJS/React
  shell, config-as-data, and a Capacitor wrapper layer.
- **Responsive:** adaptive layout (not just scaling) across phone / tablet / PC,
  with touch + mouse + keyboard input parity.

## Architecture

### Repo & packages (npm/pnpm workspaces monorepo)

```
jones-in-fastlane/
├─ packages/
│  ├─ core/     @jones/core   — pure TS game logic, zero rendering/DOM deps
│  ├─ config/   @jones/config — game data & tunables: map, prices, jobs, goals,
│  │                            economy params, AI weights (JSON/TS)
│  ├─ game/     @jones/game   — PixiJS rendering + React UI (the playable app)
│  └─ ai/       @jones/ai     — AI players (ported planner agents); depends on core
├─ apps/
│  └─ mobile/   Capacitor project wrapping the built web app (later phase)
├─ assets/      source art (4K-ready) + audio drop-in folders
└─ docs/superpowers/specs/...
```

- **Tooling:** Vite + TypeScript, Vitest, ESLint/Prettier.
- **Dependency rule (enforced):** `core` and `ai` never import from `game`.
  `game` imports `core`, `ai`, `config`. Keeps logic reusable for a future server.

### `@jones/core` — the logic core

A faithful TS port of `jones.*`, restructured as a deterministic command-driven
state machine.

- **State:** one serializable `GameState` (plain JSON data, no methods) holding
  `players[]` — each with cash, bank balance, stocks, happiness, dependibility,
  experience, relaxation, degrees, job, position, possessions, clothing weeks, rent
  state, loan state, clock(hours)/weeks. (Per the logic reference: **no Health
  stat**; Career is derived from Dependibility.) Serializable for save/load and
  future networking.
- **Commands:** every action is an explicit command object — `Move`,
  `EnterBuilding`, `Work`, `Study`, `BuyClothes`, `RentHouse`, `ApplyForJob`,
  `Relax`, `EndTurn`, etc. (mirrors `jones.actions`).
- **Reducer:** `reduce(state, command, config, rng) → { state, events[] }` — a pure
  function. `events[]` are semantic things UI/audio react to (`RentDue`, `GotJob`,
  `WeekEnded`, `PlayerWon`, …).
- **Determinism:** all randomness flows through a **seeded RNG** passed in. Same
  seed + same commands ⇒ identical game. Enables online play, replay, and testing.
- **Systems ported:** the ordered start-of-turn sequence, clock/hours loop, A\*
  pathfinding (`Route`/Grid → TS), economy step (Index/Reading), goals/win-check,
  work/hire/raise/fire, study/graduate, money systems (bank/loans/stocks/lottery/
  pawn), rent/garnishment, clothes/food, and random events — all per the logic
  reference (§2–§12).
- **Validation:** scenario tests assert the **logic reference's formulas/tables**
  (the authoritative spec), with the Java port used only as a structural cross-check.

### `@jones/config` — configuration (req #5)

Everything tunable lives as **data, not code**:

- **Map config:** buildings, grid positions, actions each offers.
- **Economy config:** prices, wages per rank, rent tiers, clothing values, stock
  behavior. Swappable models (`ConstantEconomy`, `DynamicEconomy`) chosen by config.
- **Goals config:** the five win thresholds.
- **AI config:** planner type (`greedy` / `random` / `search`) + per-goal scoring
  weights; difficulty levels are config presets.
- Loaded at game start; overridable via external JSON / a future tuning screen
  without recompiling.

### `@jones/game` — rendering & UI (req #1)

React owns DOM/UI; PixiJS owns the board; a thin bridge syncs them with the core.

- **PixiJS canvas (v8, WebGL/WebGPU):** the top-down 2D city board — building
  sprites, player tokens, movement animation, clock/day visuals. Matches the
  original's structure (locations as building tiles you walk between).
- **React/DOM overlay:** menus, in-building action screens (Work/Study/Buy lists),
  HUD (cash, clock, week, goal meters), dialogs, settings, player setup —
  form/list-heavy UI that DOM does well.
- **State flow:** `GameState` in a React store (Zustand). UI dispatches **commands**
  → core reducer → new state + events → React re-renders and a Pixi "view" syncs
  sprites. One-way data flow; Pixi never owns game truth.
- **4K-ready discipline:** board laid out in **logical units** in a fixed virtual
  design space (e.g. 3840×2160), scaled to fit any screen. Assets referenced via an
  **asset manifest** (logical name → texture); swapping placeholder → final art is a
  manifest edit. Texture atlases for performance; `@2x/@4x` variants supported.
- **Placeholder art:** clean flat building cards + simple player tokens, composed at
  the final layout so the game already "reads" correctly.

### Responsive design (app-wide)

- **Adaptive layout, not just scaling.** Board scales from the virtual design space;
  the React UI **reflows by breakpoint and orientation**:
  - PC / landscape tablet: board centered, HUD + panels docked to the sides.
  - Phone / portrait: board fills the top; panels become bottom sheets / full-screen
    modals; menus stack vertically.
- **Single layout engine:** CSS flex/grid + container queries; a `useViewport` hook
  exposes size/orientation as one source of truth for React and the Pixi view.
  Live re-layout on resize/rotate (no reload).
- **Input parity:** touch + mouse + keyboard for every interaction. Tap = click;
  optional drag/pinch board pan-zoom on small screens; keyboard nav for
  accessibility and desktop.
- **Mobile correctness:** safe-area insets (notches), `dvh` viewport height, ≥44px
  touch targets. Capacitor builds inherit this since they wrap the same web app.
- **Validation sizes:** phone portrait (~390×844), tablet (~820×1180), desktop
  (≥1440px).

### Audio system (req #6)

Built for drop-in, since the user supplies all audio.

- **Engine:** Howler.js behind a small `AudioService` (swappable). Robust
  cross-browser + mobile, works under Capacitor.
- **Drop-in layout:** `assets/audio/music/*` and `assets/audio/sfx/*` with an
  **audio manifest** mapping logical cues (`bgm.main`, `sfx.cashRegister`,
  `sfx.gotJob`, `sfx.rentDue`, `ui.click`) → files. Add a file + manifest line.
- **Event-driven:** core emits semantic `events[]`; an audio layer maps events →
  cues (so "sound on rent due" is config, not buried logic). Formats `.mp3/.ogg/.m4a`;
  per-channel volume + mute, persisted.

### `@jones/ai` — AI players (reqs #4 & #5)

Port the Java planner framework, driven through the **same command interface** as
humans.

- **Interface:** an `Agent` produces the next `Command` given a read-only
  `GameState` + AI config — identical to the human UI's command dispatch and a
  future remote player's messages. Seat types (local human, local AI, remote human,
  remote AI) are interchangeable.
- **Ported strategies:** `GreedyPlanner` (improve weakest goal — the smart default),
  `RandomPlanner`, search/ordered planners; the weekly "plan" concept
  (`StudyAllWeekPlan`, `WorkAllWeekPlan`, …) carries over. Selected/weighted via
  `@jones/config`.
- **Difficulty = config.** New algorithm = new module implementing `Agent`, no core
  change.
- **Future LLM/external agent (req #4):** because agents only see serialized state
  and emit commands, an external agent drops in as just another `Agent`.

## Future Phases (designed-for, not in MVP)

- **Mobile packaging (`apps/mobile`):** Capacitor wraps the built web app into
  signed iOS/Android binaries (`.ipa` / `.aab`) for store submission. Native plugins
  as needed (status bar, safe-area, haptics, audio session, storage); saves via
  Capacitor Preferences/filesystem.
- **Online play (`@jones/server`):** server-authoritative — validates commands
  against the same core reducer, broadcasts state/events. Seat types interchangeable.
  No core rewrite required.

## Testing Strategy

- **Core:** unit tests per system + seeded scenario tests with expected outcomes,
  cross-checked against the Java port. Correctness lives here.
- **AI:** agents play full seeded games headlessly (fast) to catch regressions and
  tune weights.
- **UI:** component tests for key screens; smoke/e2e flows (start → play a turn →
  win) across the three breakpoints.

## Milestones (MVP build order)

1. **M1 — Logic core + config:** seed `@jones/config` from the logic reference's
   tables (jobs, degrees, items, economy, goals, locations, action costs), implement
   the core systems/turn sequence (§2–§12), deterministic and tested headlessly
   against the reference's formulas. Playable via a test harness, no graphics.
2. **M2 — AI players:** ported planners run full games headlessly; difficulty via
   config.
3. **M3 — Rendering + UI:** PixiJS board + responsive React UI + audio system, wired
   to core. **End of M3 = MVP:** full local game loop, solo-vs-AI and hotseat,
   responsive (mobile/tablet/PC), placeholder 4K-ready art.
4. **M4 (later) — Mobile packaging:** Capacitor iOS/Android builds.
5. **M5 (future) — Online play.**

## Non-Goals (for the MVP)

- Online / networked multiplayer (designed-for, not built).
- App-store packaging (M4).
- Final/commissioned 4K art (placeholders authored at 4K-ready layout).
- Extracting or shipping any original Sierra assets.
