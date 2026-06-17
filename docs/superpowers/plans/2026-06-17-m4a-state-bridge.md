# M4a — State Bridge & App Shell Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up `packages/game` (a new Vite + React + TypeScript app) with a Zustand store that bridges the UI to `@jones/core`'s `reduce`/`createInitialGame`, plus a minimal debug screen proving the full command-dispatch loop works for a human player — zero board art, zero styling, zero AI.

**Architecture:** A single Zustand store (`gameStore.ts`) is the only module that imports `@jones/core`/`@jones/config`; every component reads/writes game state only through it (one-way: UI → `dispatch(command)` → `reduce` → re-render). `App.tsx` switches between `NewGameScreen` (no game yet) and `DebugGameScreen` (raw state + a fixed button list + a JSON dump) based on the store's `state`.

**Tech Stack:** Vite 5, React 18, Zustand 4, TypeScript (strict, `moduleResolution: Bundler`), Vitest 2 + `@testing-library/react` + `vitest-environment-jsdom`, pnpm workspaces. Run `pnpm test` and `pnpm typecheck` from the repo root.

## Global Constraints

- Package name: `@jones/game`, at `packages/game/`, joining the existing `packages/*` pnpm workspace pattern.
- Local relative imports inside `packages/game` use explicit `.js` extensions for `.ts`/`.tsx` files (e.g. `from "./App.js"`), matching the established convention already used in `packages/core`, `packages/config`, and `packages/ai` — this resolves correctly under Vite/Vitest exactly as it already does for those packages.
- `tsconfig.base.json` (strict, ES2022, `moduleResolution: Bundler`, `composite: true`) is inherited unchanged; `packages/game/tsconfig.json` adds only `jsx: "react-jsx"` and `lib: ["ES2022", "DOM", "DOM.Iterable"]`, with `references` to `../core` and `../config` and `include: ["src"]` (test files are not part of the `tsc -b` project graph, matching `packages/ai`'s existing pattern).
- Root `typecheck` script becomes `tsc -b packages/config packages/core packages/ai packages/game`.
- The existing single `vitest.config.ts` is replaced by `vitest.workspace.ts` with exactly two projects named `"logic"` (node environment, the existing `packages/config|core|ai` test globs, unchanged behavior) and `"game"` (jsdom environment via `vitest-environment-jsdom`, `packages/game/test/**/*.test.{ts,tsx}`, with `setupFiles: ["packages/game/test/setup.ts"]`). This isolates jsdom from the 238 existing logic tests, which keep running exactly as before.
- Debug game setup (used by `gameStore.startGame`): `createInitialGame(defaultConfig, 1, [{ name: "You", isAI: false, goals: { wealth: 30, happiness: 30, education: 19, career: 30 } }])` — seed `1`, one human player named `"You"`, these exact goal numbers (the same low/winnable target already used in `@jones/ai`'s integration tests).
- No persistence, no AI seats, no styling beyond legibility, no real player-setup form — all explicitly deferred to later M4 sub-milestones per the [design spec](../specs/2026-06-17-m4a-state-bridge-design.md)'s Non-Goals.

---

## File map

| Action | File | Responsibility |
|--------|------|-----------------|
| Modify | `package.json` (root) | add `vitest-environment-jsdom` devDependency; extend `typecheck` script |
| Create | `vitest.workspace.ts` | split test execution into `logic` (node) and `game` (jsdom) projects |
| Delete | `vitest.config.ts` | superseded by `vitest.workspace.ts` |
| Create | `packages/game/package.json` | `@jones/game` workspace package |
| Create | `packages/game/tsconfig.json` | composite project, references core + config |
| Create | `packages/game/vite.config.ts` | Vite + React plugin |
| Create | `packages/game/index.html` | Vite entry HTML |
| Create | `packages/game/src/main.tsx` | React root mount |
| Create | `packages/game/src/App.tsx` | app shell (Task 1: static placeholder; Task 3: real routing) |
| Create | `packages/game/test/smoke.test.tsx` | proves the Vite/React/Vitest/RTL toolchain works |
| Create | `packages/game/test/setup.ts` | jest-dom matchers + RTL `cleanup()` |
| Create | `packages/game/src/store/gameStore.ts` | the only module touching `@jones/core`/`@jones/config` |
| Create | `packages/game/test/gameStore.test.ts` | store unit tests |
| Create | `packages/game/src/screens/NewGameScreen.tsx` | "New Game" button |
| Create | `packages/game/src/screens/DebugGameScreen.tsx` | raw state + button list + JSON dump |
| Create | `packages/game/test/App.test.tsx` | routing + dispatch-loop component tests |
| Modify | `README.md` | add M4a row, update Status section |

---

## Task 1: Scaffold `@jones/game` (Vite + React + Vitest/RTL toolchain)

**Files:**
- Modify: `package.json` (root)
- Create: `vitest.workspace.ts`
- Delete: `vitest.config.ts`
- Create: `packages/game/package.json`
- Create: `packages/game/tsconfig.json`
- Create: `packages/game/vite.config.ts`
- Create: `packages/game/index.html`
- Create: `packages/game/src/main.tsx`
- Create: `packages/game/src/App.tsx`
- Create: `packages/game/test/setup.ts`
- Create: `packages/game/test/smoke.test.tsx`

**Interfaces:**
- Produces: `App` (named export, `packages/game/src/App.tsx`) — `export function App(): JSX.Element`. Task 3 will replace this file's body but must keep the `App` named export.

- [ ] **Step 1: Update root `package.json`**

Add `vitest-environment-jsdom` to `devDependencies` and extend `typecheck`:

```json
{
  "name": "jones-in-fastlane",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/config packages/core packages/ai packages/game"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0",
    "vitest-environment-jsdom": "^2.1.9"
  }
}
```

- [ ] **Step 2: Replace `vitest.config.ts` with `vitest.workspace.ts`**

Delete `vitest.config.ts` and create `vitest.workspace.ts`:

```ts
import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "logic",
      include: [
        "packages/config/test/**/*.test.ts",
        "packages/core/test/**/*.test.ts",
        "packages/ai/test/**/*.test.ts",
      ],
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: "game",
      include: ["packages/game/test/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["packages/game/test/setup.ts"],
      passWithNoTests: true,
    },
  },
]);
```

- [ ] **Step 3: Create `packages/game/package.json`**

```json
{
  "name": "@jones/game",
  "version": "0.0.0",
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build"
  },
  "dependencies": {
    "@jones/config": "workspace:*",
    "@jones/core": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
  "devDependencies": {
    "@testing-library/jest-dom": "^6.5.0",
    "@testing-library/react": "^16.0.1",
    "@types/react": "^18.3.12",
    "@types/react-dom": "^18.3.1",
    "@vitejs/plugin-react": "^4.3.3",
    "vite": "^5.4.10"
  }
}
```

- [ ] **Step 4: Create `packages/game/tsconfig.json`**

```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": {
    "outDir": "dist",
    "rootDir": "src",
    "jsx": "react-jsx",
    "lib": ["ES2022", "DOM", "DOM.Iterable"]
  },
  "references": [{ "path": "../config" }, { "path": "../core" }],
  "include": ["src"]
}
```

- [ ] **Step 5: Create `packages/game/vite.config.ts`**

```ts
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
});
```

- [ ] **Step 6: Create `packages/game/index.html`**

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Jones in the Fast Lane</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `packages/game/src/App.tsx`**

```tsx
export function App() {
  return <h1>Jones in the Fast Lane</h1>;
}
```

- [ ] **Step 8: Create `packages/game/src/main.tsx`**

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App.js";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

- [ ] **Step 9: Create `packages/game/test/setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => {
  cleanup();
});
```

- [ ] **Step 10: Create `packages/game/test/smoke.test.tsx`**

```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { App } from "../src/App.js";

describe("App smoke test", () => {
  it("renders the app shell", () => {
    render(<App />);
    expect(screen.getByText("Jones in the Fast Lane")).toBeInTheDocument();
  });
});
```

- [ ] **Step 11: Install so pnpm links the new workspace package and new devDependencies**

Run: `pnpm install`
Expected: completes; `@jones/game` linked into the workspace; `vitest-environment-jsdom`, `vite`, `react`, `zustand`, `@testing-library/*` resolved.

- [ ] **Step 12: Run the smoke test**

Run: `pnpm test -- --project=game 2>&1 | tail -15`
Expected: 1 test passes, in the `game` project (jsdom environment).

- [ ] **Step 13: Run the full suite to confirm the `logic` project is unaffected**

Run: `pnpm test 2>&1 | tail -20`
Expected: both `logic` and `game` projects run; all 239 tests pass (238 pre-existing + 1 new smoke test).

- [ ] **Step 14: Run typecheck**

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors (now also builds `packages/game`).

- [ ] **Step 15: Commit**

```bash
git add package.json vitest.workspace.ts packages/game/package.json packages/game/tsconfig.json packages/game/vite.config.ts packages/game/index.html packages/game/src/main.tsx packages/game/src/App.tsx packages/game/test/setup.ts packages/game/test/smoke.test.tsx pnpm-lock.yaml
git rm vitest.config.ts
git commit -m "feat(game): scaffold @jones/game package with Vite + React + Vitest/RTL"
```

---

## Task 2: `gameStore.ts` — the state bridge

**Files:**
- Create: `packages/game/src/store/gameStore.ts`
- Create: `packages/game/test/gameStore.test.ts`

**Interfaces:**
- Consumes: `createInitialGame(config, seed, players)`, `reduce(state, command, config)` from `@jones/core`; `defaultConfig` from `@jones/config`.
- Produces: `useGameStore` (named export, Zustand hook/store) with shape `{ config: GameConfig; state: GameState | null; lastEvents: GameEvent[]; startGame(): void; dispatch(command: Command): void }`. Task 3 consumes `useGameStore` exactly with this shape and these method names.

- [ ] **Step 1: Write the failing store tests in `packages/game/test/gameStore.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { useGameStore } from "../src/store/gameStore.js";

function freshStore() {
  useGameStore.setState({ state: null, lastEvents: [] });
  return useGameStore.getState();
}

describe("gameStore", () => {
  it("startGame initializes one human player with the debug goals", () => {
    const store = freshStore();
    store.startGame();
    const { state } = useGameStore.getState();
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
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test -- --project=game 2>&1 | tail -20`
Expected: FAIL — `../src/store/gameStore.js` does not exist.

- [ ] **Step 3: Create `packages/game/src/store/gameStore.ts`**

```ts
import { create } from "zustand";
import { createInitialGame, reduce } from "@jones/core";
import type { Command, GameEvent, GameState } from "@jones/core";
import { defaultConfig } from "@jones/config";
import type { GameConfig } from "@jones/config";

const DEBUG_SEED = 1;
const DEBUG_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

export interface GameStore {
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

- [ ] **Step 4: Run the tests**

Run: `pnpm test -- --project=game 2>&1 | tail -20`
Expected: all 6 `game` project tests pass (1 smoke + 5 store tests).

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/game/src/store/gameStore.ts packages/game/test/gameStore.test.ts
git commit -m "feat(game): add gameStore — the UI/core state bridge"
```

---

## Task 3: Screens & app wiring — the debug loop

**Files:**
- Create: `packages/game/src/screens/NewGameScreen.tsx`
- Create: `packages/game/src/screens/DebugGameScreen.tsx`
- Modify: `packages/game/src/App.tsx`
- Create: `packages/game/test/App.test.tsx`

**Interfaces:**
- Consumes: `useGameStore` from `../store/gameStore.js` exactly as defined in Task 2 (`config`, `state`, `lastEvents`, `startGame()`, `dispatch(command)`).
- Produces: `NewGameScreen` (named export, no props), `DebugGameScreen` (named export, no props) — both consumed only by `App.tsx`, not by any other file in this plan.

- [ ] **Step 1: Write the failing routing/dispatch-loop tests in `packages/game/test/App.test.tsx`**

```tsx
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App.js";
import { useGameStore } from "../src/store/gameStore.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("App", () => {
  it("shows the New Game screen initially", () => {
    render(<App />);
    expect(screen.getByText("New Game")).toBeInTheDocument();
  });

  it("clicking New Game switches to the debug panel", () => {
    render(<App />);
    fireEvent.click(screen.getByText("New Game"));
    expect(screen.getByText(/Week: 1/)).toBeInTheDocument();
  });

  it("clicking End Turn advances the displayed week", () => {
    render(<App />);
    fireEvent.click(screen.getByText("New Game"));
    fireEvent.click(screen.getByText("End Turn"));
    expect(screen.getByText(/Week: 2/)).toBeInTheDocument();
  });

  it("renders an InvalidAction event inline instead of crashing", () => {
    render(<App />);
    fireEvent.click(screen.getByText("New Game"));
    fireEvent.click(screen.getByText("Work")); // illegal: outside, no job yet
    expect(screen.getByText(/InvalidAction/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test -- --project=game 2>&1 | tail -25`
Expected: FAIL — `../src/screens/NewGameScreen.js` / `../src/screens/DebugGameScreen.js` do not exist, and `App` still renders only the static heading.

- [ ] **Step 3: Create `packages/game/src/screens/NewGameScreen.tsx`**

```tsx
import { useGameStore } from "../store/gameStore.js";

export function NewGameScreen() {
  const startGame = useGameStore((s) => s.startGame);
  return (
    <div>
      <h1>Jones in the Fast Lane</h1>
      <button onClick={startGame}>New Game</button>
    </div>
  );
}
```

- [ ] **Step 4: Create `packages/game/src/screens/DebugGameScreen.tsx`**

```tsx
import { useGameStore } from "../store/gameStore.js";
import type { Command } from "@jones/core";

export function DebugGameScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const dispatch = useGameStore((s) => s.dispatch);

  if (!state) return null;

  const player = state.players[state.currentPlayerIndex];
  const fire = (command: Command) => dispatch(command);

  return (
    <div>
      {state.status !== "playing" && (
        <div data-testid="game-over-banner">
          Game over — status: {state.status}
          {state.winners.length > 0 && ` — winner: ${state.winners.join(", ")}`}
        </div>
      )}
      <section>
        <p>Week: {state.week}</p>
        <p>Cash: {player.cash}</p>
        <p>Location: {player.locationId}</p>
        <p>Inside: {player.insideBuilding ? "yes" : "no"}</p>
        <p>Hours remaining: {player.hoursRemaining}</p>
      </section>
      <section>
        {config.locations.map((loc) => (
          <button key={loc.id} onClick={() => fire({ type: "TravelTo", locationId: loc.id })}>
            Travel to {loc.name}
          </button>
        ))}
        <button onClick={() => fire({ type: "EnterBuilding" })}>Enter Building</button>
        <button onClick={() => fire({ type: "ExitBuilding" })}>Exit Building</button>
        <button onClick={() => fire({ type: "Work" })}>Work</button>
        <button onClick={() => fire({ type: "ApplyForJob", jobId: config.jobs[0].id })}>
          Apply For Job
        </button>
        <button onClick={() => fire({ type: "EndTurn" })}>End Turn</button>
      </section>
      <section>
        <h2>Last events</h2>
        <ul>
          {lastEvents.map((e, i) => (
            <li key={i}>{JSON.stringify(e)}</li>
          ))}
        </ul>
      </section>
      <pre data-testid="state-dump">{JSON.stringify(state, null, 2)}</pre>
    </div>
  );
}
```

(The "Apply For Job" button intentionally always targets `config.jobs[0].id` — this is a debug-only convenience, not a real job-picker; that's M4c's job.)

- [ ] **Step 5: Replace `packages/game/src/App.tsx`**

```tsx
import { useGameStore } from "./store/gameStore.js";
import { NewGameScreen } from "./screens/NewGameScreen.js";
import { DebugGameScreen } from "./screens/DebugGameScreen.js";

export function App() {
  const state = useGameStore((s) => s.state);
  return state === null ? <NewGameScreen /> : <DebugGameScreen />;
}
```

- [ ] **Step 6: Run the tests**

Run: `pnpm test -- --project=game 2>&1 | tail -25`
Expected: all `game` project tests pass (6 from Tasks 1–2 + 4 new App tests = 10), including the pre-existing `smoke.test.tsx` (still passes: `NewGameScreen` renders the same heading text it asserted on).

- [ ] **Step 7: Run the full suite and typecheck**

Run: `pnpm test 2>&1 | tail -20`
Expected: 248 tests pass (238 pre-existing `logic` + 10 `game`).

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/game/src/screens/NewGameScreen.tsx packages/game/src/screens/DebugGameScreen.tsx packages/game/src/App.tsx packages/game/test/App.test.tsx
git commit -m "feat(game): add NewGameScreen/DebugGameScreen and wire App routing"
```

---

## Task 4: Final verification & README update

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Run the full test suite**

Run: `pnpm test 2>&1 | tail -20`
Expected: all tests pass (248: 238 `logic` + 10 `game`). Note the exact `Tests` line from the output for Step 4 below.

- [ ] **Step 2: Run typecheck**

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors across `packages/config`, `packages/core`, `packages/ai`, `packages/game`.

- [ ] **Step 3: Run a production build to verify the whole module graph bundles correctly**

Run: `pnpm --filter @jones/game build 2>&1 | tail -25`
Expected: Vite build completes successfully, producing `packages/game/dist/`. This is a deterministic, non-interactive check that every import (including the `.js`-extension-to-`.tsx` resolutions) actually resolves under Vite's bundler, not just under `tsc`/Vitest.

- [ ] **Step 4: Update `README.md`**

In the phase table, change the `M4 — Rendering + UI + audio` row's status to `In Progress` and add a new row immediately above it:

```diff
-| **M4 — Rendering + UI + audio** | Planned | PixiJS board + responsive React UI + drop-in audio, wired to the core. **End of M4 = MVP:** full local game, solo-vs-AI and hotseat, responsive, placeholder 4K-ready art. |
+| **M4a — State bridge & app shell** | Complete | `@jones/game` package: Zustand store bridges the UI to `@jones/core`'s `reduce`; a minimal debug screen proves the full human command-dispatch loop end-to-end. No board art, AI, or styling yet. |
+| **M4 — Rendering + UI + audio** | In Progress | PixiJS board + responsive React UI + drop-in audio, wired to the core. **End of M4 = MVP:** full local game, solo-vs-AI and hotseat, responsive, placeholder 4K-ready art. |
```

Update the sentence below the table:

```diff
-M1, M2, M3a, M3b, M3c, M3d, M3e, and M3 (AI players) are complete. Plans are in
+M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), and M4a are complete. Plans are in
 [`docs/superpowers/plans/`](docs/superpowers/plans/).
```

Update the `## Status` section, replacing the test count with the actual count from Step 1's `pnpm test` output:

```diff
-M1, M2, M3a, M3b, M3c, M3d, M3e, and M3 (AI players) are complete — 40 item types, full financial subsystem, rent/housing mechanics, wage garnishment, a shared pawn shop, loan repayment, automatic rent/loan due-date processing, and headless AI opponents (random + greedy planners). 236 tests passing.
+M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), and M4a are complete — 40 item types, full financial subsystem, rent/housing mechanics, wage garnishment, a shared pawn shop, loan repayment, automatic rent/loan due-date processing, headless AI opponents (random + greedy planners), and a working `@jones/game` state bridge with a debug command-dispatch loop. <N> tests passing.
```

Replace `<N>` with the real count from Step 1.

- [ ] **Step 5: Commit**

```bash
git add README.md
git commit -m "docs: mark M4a state bridge complete in README"
```

---

## Self-review notes

- **Spec coverage:** Spec's Goals 1–6 → Tasks 1 (Vite/React boots), 2 (`startGame`/store), 3 (button dispatch loop, re-render, `InvalidAction` visibility, store independently unit-tested in Task 2 without any rendered UI). Non-Goals are respected by construction — no task touches Pixi, styling, responsive layout, audio, real player setup, AI, or persistence.
- **Type consistency:** `useGameStore`'s shape (`config`, `state`, `lastEvents`, `startGame()`, `dispatch(command)`) is defined once in Task 2 and consumed identically in Task 3's `NewGameScreen`/`DebugGameScreen`/`App.test.tsx`. `App`'s named export is established in Task 1 and preserved (body replaced, export kept) in Task 3.
- **No placeholders:** every step has complete file contents and exact commands with expected output. The `config.jobs[0].id` choice for the debug "Apply For Job" button is a deliberate, explained simplification, not a TBD.
- **Known limitation (documented in the design spec):** this debug UI is intentionally throwaway-adjacent — M4b/M4c will likely replace `DebugGameScreen` entirely once real board/HUD screens exist. The store (`gameStore.ts`) is the durable piece later milestones build on.
