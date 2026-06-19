# M4 Game Setup & AI Wiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire up solo-vs-AI play — a New Game screen that lets the human pick 1-3 AI opponents and a shared difficulty, and a `gameStore` that auto-plays AI turns via `@jones/ai`'s existing `makeAgent`/`playGame` until control returns to the human or the game ends.

**Architecture:** `gameStore.startGame(opponentCount, difficulty)` builds a multi-player `GameState` via `@jones/core`'s existing `createInitialGame` plus a parallel `seats: Seat[]` array (human seat 0 has `agent: null`; AI seats hold a `makeAgent(...)`-built agent). `dispatch()` runs the human's command through `reduce()` as today, then — if the resulting current player `isAI` — calls `playGame()` once, which already loops through every consecutive AI seat and stops at the next human turn or game end. `NewGameScreen` gets opponent-count/difficulty controls; `PlayScreen` gets a one-line "whose turn" label.

**Tech Stack:** React, TypeScript (strict), Zustand, Vitest + `@testing-library/react`, `@jones/ai` (`makeAgent`, `playGame`, `Seat`), `@jones/config` (`aiDifficulty`). Run `pnpm test` and `pnpm typecheck` from the repo root.

## Global Constraints

- No `@jones/core` or `@jones/ai` changes — both already expose everything needed (confirmed against `packages/ai/test/runner.test.ts`'s own `makeAgent`/`playGame` usage). All work is in `@jones/game`.
- `startGame`'s new parameters default to `(opponentCount = 0, difficulty = "medium")` — this is required, not optional polish: 12 existing M4c panel test files call `useGameStore.getState().startGame()` with zero arguments and expect today's single-human-player behavior. Defaulting `opponentCount` to `0` keeps every one of those files passing unmodified — do not edit any file under `packages/game/test/panels/` or `packages/game/test/LocationScreen.test.tsx` in this plan.
- Local relative imports inside `packages/game` use explicit `.js` extensions on `.ts`/`.tsx` files, matching the established M4a/M4c convention.
- Component/store tests exercise the real `reduce()`/`playGame()` (no mocking), matching the existing `gameStore.test.ts`/`App.test.tsx` pattern.
- AI turns auto-play instantly (no step-through animation) — `dispatch()` resolves the full AI sequence synchronously before returning, per the approved design.
- Every player (human and AI) uses the same fixed default goals: `{ wealth: 30, happiness: 30, education: 19, career: 30 }`. No per-player goal customization in this plan.

---

## File map

| Action | File | Responsibility |
|--------|------|-----------------|
| Modify | `packages/game/package.json` | add `@jones/ai` workspace dependency |
| Modify | `packages/game/tsconfig.json` | add `../ai` project reference |
| Modify | `packages/game/src/store/gameStore.ts` | random seed, multi-player setups, `seats`, AI auto-play in `dispatch` |
| Modify | `packages/game/test/gameStore.test.ts` | cover new `startGame` params and AI auto-play |
| Modify | `packages/game/src/screens/NewGameScreen.tsx` | opponent-count + difficulty controls, Start Game button |
| Create | `packages/game/test/NewGameScreen.test.tsx` | controls + dispatch-to-store wiring |
| Modify | `packages/game/src/screens/PlayScreen.tsx` | add `Player: {name}` HUD line |
| Modify | `packages/game/test/App.test.tsx` | update flow from "New Game" button to "Start Game" controls |

---

## Task 1: `gameStore` — seats, random seed, AI auto-play

**Files:**
- Modify: `packages/game/package.json`
- Modify: `packages/game/tsconfig.json`
- Modify: `packages/game/src/store/gameStore.ts`
- Modify: `packages/game/test/gameStore.test.ts`

**Interfaces:**
- Produces: `Difficulty` type (`"easy" | "medium" | "hard"`, named export from `gameStore.ts`); `GameStore.seats: Seat[]`; `GameStore.startGame(opponentCount?: number, difficulty?: Difficulty): void` (defaults `0`, `"medium"`). Consumed by Task 2's `NewGameScreen`.

- [ ] **Step 1: Add the `@jones/ai` workspace dependency**

In `packages/game/package.json`, change the `"dependencies"` block from:

```json
  "dependencies": {
    "@jones/config": "workspace:*",
    "@jones/core": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
```

to:

```json
  "dependencies": {
    "@jones/ai": "workspace:*",
    "@jones/config": "workspace:*",
    "@jones/core": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
```

- [ ] **Step 2: Add the `../ai` project reference**

In `packages/game/tsconfig.json`, change:

```json
  "references": [{ "path": "../config" }, { "path": "../core" }],
```

to:

```json
  "references": [{ "path": "../config" }, { "path": "../core" }, { "path": "../ai" }],
```

- [ ] **Step 3: Install the new workspace link**

Run: `pnpm install`
Expected: completes with no errors; `node_modules/@jones/ai` resolves to the workspace package.

- [ ] **Step 4: Write the failing/updated tests in `packages/game/test/gameStore.test.ts`**

Replace the entire file with:

```ts
import { describe, it, expect } from "vitest";
import { useGameStore } from "../src/store/gameStore.js";

function freshStore() {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
  return useGameStore.getState();
}

describe("gameStore", () => {
  it("startGame defaults to one human player with the debug goals and no AI opponents", () => {
    const store = freshStore();
    store.startGame();
    const { state, seats } = useGameStore.getState();
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(1);
    expect(state!.players[0].name).toBe("You");
    expect(state!.players[0].isAI).toBe(false);
    expect(state!.players[0].goals).toEqual({
      wealth: 30,
      happiness: 30,
      education: 19,
      career: 30,
    });
    expect(seats).toHaveLength(1);
    expect(seats[0].agent).toBeNull();
  });

  it("startGame builds the requested number of AI opponents with seated agents", () => {
    const store = freshStore();
    store.startGame(2, "hard");
    const { state, seats } = useGameStore.getState();
    expect(state!.players).toHaveLength(3);
    expect(state!.players.map((p) => p.name)).toEqual(["You", "AI 1", "AI 2"]);
    expect(state!.players[1].isAI).toBe(true);
    expect(state!.players[2].isAI).toBe(true);
    expect(seats).toHaveLength(3);
    expect(seats[0].agent).toBeNull();
    expect(seats[1].agent).not.toBeNull();
    expect(seats[2].agent).not.toBeNull();
  });

  it("dispatch is a no-op before startGame", () => {
    const store = freshStore();
    store.dispatch({ type: "EndTurn" });
    expect(useGameStore.getState().state).toBeNull();
  });

  it("dispatch chains a real multi-command sequence through reduce", () => {
    const store = freshStore();
    store.startGame();

    store.dispatch({ type: "EnterBuilding" });
    expect(useGameStore.getState().state!.players[0].insideBuilding).toBe(true);

    store.dispatch({ type: "EndTurn" });
    expect(useGameStore.getState().state!.week).toBe(2);
  });

  it("dispatch records InvalidAction and leaves state unchanged for an illegal command", () => {
    const store = freshStore();
    store.startGame();

    // Player starts outside with no job: Work is illegal.
    store.dispatch({ type: "Work" });
    const { state, lastEvents } = useGameStore.getState();
    expect(lastEvents.some((e) => e.type === "InvalidAction")).toBe(true);
    expect(state!.players[0].insideBuilding).toBe(false);
  });

  it("dispatch is a no-op once the game has ended", () => {
    const store = freshStore();
    store.startGame();
    useGameStore.setState((s) => ({ state: { ...s.state!, status: "ended" } }));
    const weekBefore = useGameStore.getState().state!.week;

    store.dispatch({ type: "EndTurn" });
    expect(useGameStore.getState().state!.week).toBe(weekBefore);
  });

  it("dispatch auto-plays AI seats until control returns to the human, merging events", () => {
    const store = freshStore();
    store.startGame(1, "easy");

    store.dispatch({ type: "EndTurn" });
    const { state, lastEvents } = useGameStore.getState();
    // The lone AI opponent (seat 1 of 2) is always the last seat, so its own
    // EndTurn wraps the turn order and advances the week — proving playGame
    // actually ran the AI's turn rather than stopping at the human's EndTurn.
    expect(state!.currentPlayerIndex).toBe(0);
    expect(state!.week).toBe(2);
    expect(lastEvents.some((e) => e.type === "WeekAdvanced")).toBe(true);
  });
});
```

- [ ] **Step 5: Run the tests to confirm the new/changed assertions fail**

Run: `pnpm test -- --project=game 2>&1 | tail -40`
Expected: FAIL on the two new tests (`seats` is `undefined` on the current store) and on the first test's new `seats` assertions; the four untouched tests (no-op before/after start, illegal action, ended) still pass.

- [ ] **Step 6: Implement the changes in `packages/game/src/store/gameStore.ts`**

Replace the entire file with:

```ts
import { create } from "zustand";
import { createInitialGame, reduce } from "@jones/core";
import type { Command, GameEvent, GameState } from "@jones/core";
import { defaultConfig, aiDifficulty } from "@jones/config";
import type { GameConfig } from "@jones/config";
import { makeAgent, playGame } from "@jones/ai";
import type { Seat } from "@jones/ai";

const DEFAULT_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

export type Difficulty = "easy" | "medium" | "hard";

export interface GameStore {
  config: GameConfig;
  state: GameState | null;
  lastEvents: GameEvent[];
  seats: Seat[];
  startGame(opponentCount?: number, difficulty?: Difficulty): void;
  dispatch(command: Command): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  config: defaultConfig,
  state: null,
  lastEvents: [],
  seats: [],
  startGame(opponentCount = 0, difficulty = "medium") {
    const { config } = get();
    const seed = Date.now();
    const setups = [
      { name: "You", isAI: false, goals: DEFAULT_GOALS },
      ...Array.from({ length: opponentCount }, (_, i) => ({
        name: `AI ${i + 1}`,
        isAI: true,
        goals: DEFAULT_GOALS,
      })),
    ];
    const state = createInitialGame(config, seed, setups);
    const seats: Seat[] = setups.map((s, i) => ({
      playerId: `p${i}`,
      agent: s.isAI ? makeAgent(aiDifficulty[difficulty], config, seed, i) : null,
    }));
    set({ state, seats, lastEvents: [] });
  },
  dispatch(command) {
    const { state, config, seats } = get();
    if (!state || state.status !== "playing") return;
    const { state: afterHuman, events: humanEvents } = reduce(state, command, config);
    let next = afterHuman;
    let events = humanEvents;
    if (next.status === "playing" && next.players[next.currentPlayerIndex].isAI) {
      const result = playGame(config, next, seats);
      next = result.state;
      events = [...events, ...result.events];
    }
    set({ state: next, lastEvents: events });
  },
}));
```

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm test -- --project=game 2>&1 | tail -40`
Expected: all 7 tests in `gameStore.test.ts` pass.

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes (this also re-confirms none of the 12 M4c panel test files regressed).

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/game/package.json packages/game/tsconfig.json packages/game/src/store/gameStore.ts packages/game/test/gameStore.test.ts pnpm-lock.yaml
git commit -m "feat(game): wire AI opponents into gameStore via @jones/ai"
```

---

## Task 2: `NewGameScreen` controls, `PlayScreen` player label

**Files:**
- Modify: `packages/game/src/screens/NewGameScreen.tsx`
- Create: `packages/game/test/NewGameScreen.test.tsx`
- Modify: `packages/game/src/screens/PlayScreen.tsx`
- Modify: `packages/game/test/App.test.tsx`

**Interfaces:**
- Consumes: `useGameStore().startGame(opponentCount?, difficulty?)` and the `Difficulty` type from Task 1.

- [ ] **Step 1: Write the failing tests in `packages/game/test/NewGameScreen.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewGameScreen } from "../src/screens/NewGameScreen.js";
import { useGameStore } from "../src/store/gameStore.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
});

describe("NewGameScreen", () => {
  it("starts a game with the default 1 AI opponent at medium difficulty", () => {
    render(<NewGameScreen />);
    fireEvent.click(screen.getByText("Start Game"));
    const { state, seats } = useGameStore.getState();
    expect(state!.players).toHaveLength(2);
    expect(state!.players[1].isAI).toBe(true);
    expect(seats).toHaveLength(2);
    expect(seats[1].agent).not.toBeNull();
  });

  it("starts a game with the selected opponent count and difficulty", () => {
    render(<NewGameScreen />);
    fireEvent.change(screen.getByLabelText("AI opponents"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "hard" } });
    fireEvent.click(screen.getByText("Start Game"));
    const { state } = useGameStore.getState();
    expect(state!.players).toHaveLength(4);
    expect(state!.players.map((p) => p.name)).toEqual(["You", "AI 1", "AI 2", "AI 3"]);
  });
});
```

- [ ] **Step 2: Update `packages/game/test/App.test.tsx`**

Replace the entire file with:

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App.js";
import { useGameStore } from "../src/store/gameStore.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
});

describe("App", () => {
  it("shows the New Game screen initially", () => {
    render(<App />);
    expect(screen.getByText("Jones in the Fast Lane")).toBeInTheDocument();
  });

  it("clicking Start Game switches to the play screen", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    expect(screen.getByText(/Week: 1/)).toBeInTheDocument();
  });

  it("clicking End Turn advances the displayed week", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    fireEvent.click(screen.getByText("End Turn"));
    expect(screen.getByText(/Week: 2/)).toBeInTheDocument();
  });

  it("renders an error event inline instead of crashing", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    useGameStore.setState((s) => {
      s.state!.players[0].hoursRemaining = 0;
      return { state: s.state };
    });
    fireEvent.click(screen.getByText("Enter Building")); // illegal: not enough hours
    expect(screen.getByText(/NotEnoughTime/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm test -- --project=game 2>&1 | tail -40`
Expected: FAIL — `NewGameScreen.test.tsx` can't find "Start Game" text (current screen still renders "New Game"); `App.test.tsx`'s updated assertions fail the same way.

- [ ] **Step 4: Implement `packages/game/src/screens/NewGameScreen.tsx`**

Replace the entire file with:

```tsx
import { useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import type { Difficulty } from "../store/gameStore.js";

export function NewGameScreen() {
  const startGame = useGameStore((s) => s.startGame);
  const [opponentCount, setOpponentCount] = useState(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  return (
    <div>
      <h1>Jones in the Fast Lane</h1>
      <div>
        <label htmlFor="opponent-count">AI opponents</label>
        <select
          id="opponent-count"
          value={opponentCount}
          onChange={(e) => setOpponentCount(Number(e.target.value))}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>
      <div>
        <label htmlFor="difficulty">Difficulty</label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <button onClick={() => startGame(opponentCount, difficulty)}>Start Game</button>
    </div>
  );
}
```

- [ ] **Step 5: Implement the `packages/game/src/screens/PlayScreen.tsx` HUD line**

Find this section:

```tsx
      <section>
        <p>Week: {state.week}</p>
        <p>Cash: {player.cash}</p>
        <p>Location: {player.locationId}</p>
        <p>Inside: {player.insideBuilding ? "yes" : "no"}</p>
        <p>Hours remaining: {player.hoursRemaining}</p>
      </section>
```

Replace it with:

```tsx
      <section>
        <p>Player: {player.name}</p>
        <p>Week: {state.week}</p>
        <p>Cash: {player.cash}</p>
        <p>Location: {player.locationId}</p>
        <p>Inside: {player.insideBuilding ? "yes" : "no"}</p>
        <p>Hours remaining: {player.hoursRemaining}</p>
      </section>
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm test -- --project=game 2>&1 | tail -40`
Expected: all tests pass, including `NewGameScreen.test.tsx` and the updated `App.test.tsx`.

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

Run: `pnpm --filter @jones/game build 2>&1 | tail -25`
Expected: Vite build completes successfully.

- [ ] **Step 7: Commit**

```bash
git add packages/game/src/screens/NewGameScreen.tsx packages/game/test/NewGameScreen.test.tsx packages/game/src/screens/PlayScreen.tsx packages/game/test/App.test.tsx
git commit -m "feat(game): add opponent-count/difficulty controls to NewGameScreen"
```

---

## Self-review notes

- **Spec coverage:** Section 1 (New Game screen) → Task 2 Steps 1, 4. Section 2 (`gameStore` seats/seed/auto-play) → Task 1. Section 3 (`PlayScreen` label + testing strategy) → Task 2 Steps 2, 5. Data flow diagram → realized exactly by Task 1's `startGame`/`dispatch` implementation. Non-goals (hotseat, per-opponent difficulty, goal customization, PixiJS, audio, responsive layout) respected by construction — no task touches them.
- **Type consistency:** `Difficulty` is defined once in `gameStore.ts` (Task 1) and imported, not redefined, in `NewGameScreen.tsx` (Task 2). `startGame(opponentCount?, difficulty?)`'s parameter names and defaults match between the spec, Task 1's implementation, and Task 2's call site (`startGame(opponentCount, difficulty)`).
- **No placeholders:** every step has complete, working code and exact verification commands.
- **Backward compatibility verified by construction:** Task 1's default parameters (`0`, `"medium"`) mean none of the 12 existing M4c panel test files or `LocationScreen.test.tsx` need any edit — confirmed by running the full `pnpm test` suite at the end of both tasks rather than just the `game` project subset.
