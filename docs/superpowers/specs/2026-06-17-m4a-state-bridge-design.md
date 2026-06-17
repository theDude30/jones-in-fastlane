# M4a — State Bridge & App Shell Design

## Summary

M4 ("Rendering + UI + audio") bundles several independent subsystems per the
original [design spec](2026-06-15-jones-in-the-fast-lane-design.md#jonesgame--rendering--ui-req-1):
a state bridge, the PixiJS board, React action-screens/HUD, responsive/mobile
layout, and audio. Like M3, M4 is decomposed into sub-milestones built one at
a time:

- **M4a (this spec) — State bridge & app shell**
- M4b — Board rendering (PixiJS)
- M4c — HUD & action screens (React/DOM)
- M4d — Responsive & mobile layout
- M4e — Audio system
- M4f — Game flow & polish (player setup, hotseat/AI seats, win screen) — completes the MVP

M4a is the **first code in `packages/game`** (nothing exists there yet). Its
only goal: prove the UI → command → `reduce` → re-render loop works
end-to-end for a human player, with zero visual investment. No board art,
no styled screens, no AI, no persistence — those are later sub-milestones'
jobs.

## Goals / Requirements

1. A real Vite + React + TypeScript app boots in `packages/game`.
2. A "New Game" action creates a single human player via
   `createInitialGame` and starts rendering raw game state.
3. A small fixed set of buttons can dispatch the core's `Command` types
   through the real `@jones/core` `reduce` function — no mocking, no
   shortcut state mutation.
4. State updates flow back through a single store and re-render the screen.
5. `InvalidAction` events (and any other returned events) are visible, not
   swallowed or crash-inducing.
6. The bridge (store) is unit-testable independent of any rendered UI.

## Non-Goals (deferred to later M4 sub-milestones)

- Board/Pixi rendering, building sprites, movement animation — **M4b**.
- Styled HUD, in-building action screens (Work/Study/Buy/Bank/etc. lists) — **M4c**.
- Responsive breakpoints, touch/mobile input, safe-area handling — **M4d**.
- Audio — **M4e**.
- Real player-setup form (name/goals/player count), AI seat wiring
  (`@jones/ai`), hotseat turn handoff, win/lose screen, save/load
  persistence — **M4f**.

## Architecture

### Package layout

```
packages/game/
  package.json        — @jones/game; deps: react, react-dom, zustand,
                         @jones/core, @jones/config (workspace:*);
                         devDeps: vite, @vitejs/plugin-react,
                         @testing-library/react, @testing-library/jest-dom,
                         jsdom
  vite.config.ts       — React plugin; vitest config (jsdom environment)
  tsconfig.json         — extends ../../tsconfig.base.json
  index.html
  src/
    main.tsx            — React root, mounts <App />
    App.tsx             — renders <NewGameScreen /> when store.state is null,
                           else <DebugGameScreen />
    store/
      gameStore.ts       — the only module that imports from @jones/core/config
    screens/
      NewGameScreen.tsx  — single "New Game" button
      DebugGameScreen.tsx — debug panel described below
  test/
    gameStore.test.ts
    DebugGameScreen.test.tsx
```

`packages/game` joins the existing `pnpm test`/`pnpm typecheck` root scripts
(Vitest already auto-discovers `packages/**/test/**/*.test.ts`; the root
`typecheck` script gains `packages/game`).

### `gameStore.ts` — the single bridge

```ts
import { create } from "zustand";
import { createInitialGame, reduce } from "@jones/core";
import type { Command, GameEvent, GameState } from "@jones/core";
import { defaultConfig } from "@jones/config";
import type { GameConfig } from "@jones/config";

const DEBUG_SEED = 1;
const DEBUG_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

interface GameStore {
  config: GameConfig;
  state: GameState | null;
  lastEvents: GameEvent[];
  startGame(): void;
  dispatch(command: Command): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  config: defaultConfig,
  state: null,
  lastEvents: [],
  startGame() {
    const state = createInitialGame(get().config, DEBUG_SEED, [
      { name: "You", isAI: false, goals: DEBUG_GOALS },
    ]);
    set({ state, lastEvents: [] });
  },
  dispatch(command) {
    const { state, config } = get();
    if (!state || state.status !== "playing") return;
    const { state: next, events } = reduce(state, command, config);
    set({ state: next, lastEvents: events });
  },
}));
```

This is the **only** module in `packages/game` that imports `@jones/core` or
`@jones/config` directly. Every component reads/writes game state only
through `useGameStore` — this is what keeps the later board/HUD/audio
sub-milestones decoupled from the engine: they all consume the same store,
never `reduce` directly.

### `DebugGameScreen.tsx`

Shows, with no styling beyond legibility:

- Current player's `week`, `cash`, `locationId`, `insideBuilding`,
  `hoursRemaining`.
- A winner/game-over banner when `state.status !== "playing"`.
- A fixed button list: `TravelTo` for each of the 13 `defaultConfig.locations`,
  `EnterBuilding`, `ExitBuilding`, `Work`, `ApplyForJob`, `EndTurn`. (Buttons
  are unconditionally rendered — clicking one that's currently illegal is
  expected to surface an `InvalidAction` event, not be hidden. Smarter
  context-sensitive action lists are M4c's job.)
- `lastEvents` rendered as a short inline list (so `InvalidAction` and other
  events are visible after each click).
- A `<pre>` dump of `JSON.stringify(state, null, 2)` for full-state
  inspection.

### Data flow

```
button onClick
  → useGameStore.dispatch(command)
    → reduce(state, command, config)   [@jones/core, unmodified]
      → { state: next, events }
    → set({ state: next, lastEvents: events })
  → Zustand notifies subscribers → React re-renders DebugGameScreen
```

One-way flow, matching the design spec: the UI never mutates `GameState`
directly, and Pixi (added in M4b) will read from the same store rather than
owning any truth.

### Error handling

`dispatch` does not throw on `InvalidAction` — that's a normal, expected
event the reducer already models. The store always sets the returned state
(even if a command was rejected, since `reduce` returns the prior state
unchanged in that case) and the returned events, which the debug screen
renders. A `dispatch` call when `state` is `null` or the game has ended is a
silent no-op (guarded in the store, not surfaced as an error — there is
nothing actionable for a human to do about it before M4c's smarter UI exists).

## Testing Strategy

- **`gameStore.test.ts` (Vitest, no DOM):**
  - `startGame()` initializes `state` with one player named "You" and the
    debug goals, using `defaultConfig` and the fixed seed.
  - `dispatch()` before `startGame()` is a no-op (`state` stays `null`).
  - `dispatch()` after game-over (`status !== "playing"`) is a no-op.
  - A real multi-command sequence (e.g. `EnterBuilding` → `Work` →
    `EndTurn`) chains correctly through the unmodified `reduce` — asserts
    against real state changes (hours, cash, week), not mocks.
  - An intentionally illegal command (e.g. `Work` while outside) returns an
    `InvalidAction` event in `lastEvents` and leaves `state` unchanged.
- **`DebugGameScreen.test.tsx` (Vitest + React Testing Library, jsdom):**
  - Renders `<NewGameScreen />` initially; clicking "New Game" switches to
    the debug panel.
  - Clicking "End Turn" updates the displayed week.
  - An `InvalidAction` event renders inline instead of crashing the component.

## Open Questions

None — all scope and behavior decisions were resolved during brainstorming
(see this spec's Non-Goals for what's explicitly deferred).
