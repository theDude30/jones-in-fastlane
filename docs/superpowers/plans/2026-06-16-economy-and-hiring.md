# Economy & Hiring Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the §5 economy model (weekly RNG-driven index/reading, crash/boom events) and §6 hiring commands (`ApplyForJob`, `RequestRaise`, `QuitJob`) so players can earn income through a realistic job market.

**Architecture:** Pluggable `Economy` interface (`DynamicEconomy` for live play, `ConstantEconomy` for tests) created by `makeEconomy(config)`. Economy step fires at each week boundary inside `advanceTurn`. Three new reducer cases delegate to `hire.ts` functions that mutate the cloned state and push events.

**Tech Stack:** TypeScript strict, pnpm workspaces (`@jones/config`, `@jones/core`), Vitest, mulberry32 RNG (`nextFloat`/`nextInt` from `src/rng.ts`).

**Design spec:** `docs/superpowers/specs/2026-06-16-economy-and-hiring-design.md`

---

## File Structure

**`@jones/config`** — data/types only, no logic:
- `packages/config/src/types.ts` — add `EconomyConfig`, add `economy` field to `GameConfig`
- `packages/config/src/economyConfig.ts` *(new)* — `defaultEconomyConfig` and `constantEconomyConfig`
- `packages/config/src/defaultConfig.ts` — add `economy: defaultEconomyConfig`
- `packages/config/src/index.ts` — export new items

**`@jones/core`** — types, logic, tests:
- `packages/core/src/types.ts` — replace `economyReading: number` with `economy: { index, reading }`, add `raisesReceived` to `PlayerState`, add new `Command`/`GameEvent` variants
- `packages/core/src/setup.ts` — init `economy` and `raisesReceived`
- `packages/core/src/reduce.ts` — update `cloneState`, add `economy` construction, update `EndTurn` case, add three new hiring cases
- `packages/core/src/economy.ts` *(new)* — `Economy` interface, `DynamicEconomy`, `ConstantEconomy`, `makeEconomy`, `adjustedPrice`, `applyCrashEffects`
- `packages/core/src/hire.ts` *(new)* — `applyForJob`, `requestRaise`, `quitJob`
- `packages/core/src/turn.ts` — `advanceTurn` gains `economy` param, calls `economy.step` at week boundary
- `packages/core/src/index.ts` — export `economy` and `hire` modules
- `packages/core/test/economy.test.ts` *(new)*
- `packages/core/test/hire.test.ts` *(new)*
- `packages/core/test/integration.game.test.ts` — new employment integration test

---

## Task 1: Config — add EconomyConfig

**Files:**
- Modify: `packages/config/src/types.ts`
- Create: `packages/config/src/economyConfig.ts`
- Modify: `packages/config/src/defaultConfig.ts`
- Modify: `packages/config/src/index.ts`

No new test file for this task — pure data/types. Run `pnpm typecheck` to verify.

- [ ] **Step 1: Add `EconomyConfig` interface and update `GameConfig` in `packages/config/src/types.ts`**

  Append to the end of the file (after the closing `}` of `GameConfig`):

  ```ts
  export interface EconomyConfig {
    mode: "dynamic" | "constant";
    initialIndex: number;
    initialReading: number;
    eventStartWeek: number;
    crashReadingThreshold: number;
    crashProbabilityBase: number;
    boomProbabilityBase: number;
  }
  ```

  Update `GameConfig` to add the `economy` field:

  ```ts
  export interface GameConfig {
    constants: GameConstants;
    goalRanges: GoalRanges;
    actionCosts: ActionCosts;
    locations: LocationDef[];
    jobs: JobDef[];
    economy: EconomyConfig;
  }
  ```

- [ ] **Step 2: Create `packages/config/src/economyConfig.ts`**

  ```ts
  import type { EconomyConfig } from "./types.js";

  export const defaultEconomyConfig: EconomyConfig = {
    mode: "dynamic",
    initialIndex: 0,
    initialReading: 0,
    eventStartWeek: 8,
    crashReadingThreshold: 80,
    crashProbabilityBase: 30,
    boomProbabilityBase: 30,
  };

  /** Use in tests to avoid RNG-dependent economy behaviour. */
  export const constantEconomyConfig: EconomyConfig = {
    ...defaultEconomyConfig,
    mode: "constant",
  };
  ```

- [ ] **Step 3: Update `packages/config/src/defaultConfig.ts`**

  Full replacement:

  ```ts
  import type { GameConfig } from "./types.js";
  import { constants } from "./constants.js";
  import { goalRanges } from "./goals.js";
  import { actionCosts } from "./actionCosts.js";
  import { locations } from "./locations.js";
  import { jobs } from "./jobs.js";
  import { defaultEconomyConfig } from "./economyConfig.js";

  export const defaultConfig: GameConfig = {
    constants,
    goalRanges,
    actionCosts,
    locations,
    jobs,
    economy: defaultEconomyConfig,
  };
  ```

- [ ] **Step 4: Update `packages/config/src/index.ts`**

  Full replacement:

  ```ts
  export * from "./types.js";
  export { constants } from "./constants.js";
  export { goalRanges } from "./goals.js";
  export { actionCosts } from "./actionCosts.js";
  export { locations } from "./locations.js";
  export { jobs } from "./jobs.js";
  export { defaultConfig } from "./defaultConfig.js";
  export { defaultEconomyConfig, constantEconomyConfig } from "./economyConfig.js";
  ```

- [ ] **Step 5: Run typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 6: Commit**

  ```bash
  git add packages/config/src/types.ts packages/config/src/economyConfig.ts packages/config/src/defaultConfig.ts packages/config/src/index.ts
  git commit -m "feat(config): add EconomyConfig with dynamic/constant modes"
  ```

---

## Task 2: Core types — economy object, raisesReceived, new Commands/Events

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/setup.ts`
- Modify: `packages/core/src/reduce.ts` (cloneState only)

No new test file. After changes, all 31 existing tests must still pass.

- [ ] **Step 1: Update `packages/core/src/types.ts`**

  Replace the file contents with:

  ```ts
  import type { DegreeId, UniformLevel } from "@jones/config";
  import type { RngState } from "./rng.js";

  export interface GoalTargets {
    wealth: number;
    happiness: number;
    education: number;
    career: number;
  }

  export interface ClothingWeeks {
    casual: number;
    dress: number;
    business: number;
  }

  export interface PlayerState {
    id: string;
    name: string;
    isAI: boolean;
    cash: number;
    bank: number;
    happiness: number;
    dependibility: number;
    experience: number;
    relaxation: number;
    maxDependibility: number;
    maxExperience: number;
    degrees: DegreeId[];
    jobId: string | null;
    wage: number;
    raisesReceived: number;
    locationId: string;
    insideBuilding: boolean;
    clothing: ClothingWeeks;
    goals: GoalTargets;
    hoursRemaining: number;
  }

  export type GameStatus = "playing" | "ended";

  export interface GameState {
    week: number;
    currentPlayerIndex: number;
    players: PlayerState[];
    economy: { index: number; reading: number };
    rng: RngState;
    status: GameStatus;
    winners: string[];
  }

  export type Command =
    | { type: "TravelTo"; locationId: string }
    | { type: "EnterBuilding" }
    | { type: "ExitBuilding" }
    | { type: "Work" }
    | { type: "EndTurn" }
    | { type: "ApplyForJob"; jobId: string }
    | { type: "RequestRaise" }
    | { type: "QuitJob" };

  export type GameEvent =
    | { type: "Traveled"; playerId: string; toLocationId: string; hoursSpent: number }
    | { type: "EnteredBuilding"; playerId: string; locationId: string }
    | { type: "ExitedBuilding"; playerId: string; locationId: string }
    | { type: "Worked"; playerId: string; earned: number }
    | { type: "Fired"; playerId: string; jobId: string }
    | { type: "NotEnoughTime"; playerId: string; action: string }
    | { type: "InvalidAction"; playerId: string; reason: string }
    | { type: "TurnEnded"; playerId: string }
    | { type: "WeekAdvanced"; week: number }
    | { type: "PlayerWon"; playerId: string }
    | { type: "JobApplied"; playerId: string; jobId: string; wage: number }
    | { type: "JobDenied"; playerId: string; jobId: string; reason: "stats" | "luck" }
    | { type: "RaiseGranted"; playerId: string; newWage: number }
    | { type: "RaiseDenied"; playerId: string; reason: "stats" | "no-higher-offer" }
    | { type: "JobQuit"; playerId: string; jobId: string }
    | { type: "EconomyUpdated"; index: number; reading: number }
    | { type: "CrashOccurred"; severity: "minor" | "moderate" | "major"; week: number }
    | { type: "BoomOccurred"; week: number };

  export interface ReduceResult {
    state: GameState;
    events: GameEvent[];
  }
  ```

- [ ] **Step 2: Update `packages/core/src/setup.ts`**

  Replace the file contents with:

  ```ts
  import type { GameConfig } from "@jones/config";
  import type { GameState, GoalTargets, PlayerState } from "./types.js";

  export interface PlayerSetup {
    name: string;
    isAI: boolean;
    goals: GoalTargets;
  }

  export function createInitialGame(
    config: GameConfig,
    seed: number,
    setups: PlayerSetup[],
  ): GameState {
    const c = config.constants;
    if (setups.length < 1 || setups.length > c.maxPlayers) {
      throw new Error(`player count must be 1..${c.maxPlayers}`);
    }
    const players: PlayerState[] = setups.map((s, i) => ({
      id: `p${i}`,
      name: s.name,
      isAI: s.isAI,
      cash: c.initialCash,
      bank: 0,
      happiness: 0,
      dependibility: c.initialDependibility,
      experience: c.initialExperience,
      relaxation: c.initialRelaxation,
      maxDependibility: c.initialDependibility,
      maxExperience: c.initialExperience,
      degrees: [],
      jobId: null,
      wage: 0,
      raisesReceived: 0,
      locationId: c.homeLocationId,
      insideBuilding: false,
      clothing: { casual: c.initialCasualWeeks, dress: 0, business: 0 },
      goals: { ...s.goals },
      hoursRemaining: c.hoursPerTurn,
    }));
    return {
      week: 1,
      currentPlayerIndex: 0,
      players,
      economy: { index: config.economy.initialIndex, reading: config.economy.initialReading },
      rng: { seed },
      status: "playing",
      winners: [],
    };
  }
  ```

- [ ] **Step 3: Update `cloneState` in `packages/core/src/reduce.ts`**

  Find and replace only the `cloneState` function body (the rest of the file is unchanged):

  ```ts
  function cloneState(state: GameState): GameState {
    return {
      ...state,
      players: state.players.map((p) => ({ ...p, clothing: { ...p.clothing }, degrees: [...p.degrees], goals: { ...p.goals } })),
      rng: { ...state.rng },
      winners: [...state.winners],
      economy: { ...state.economy },
    };
  }
  ```

- [ ] **Step 4: Run the full test suite**

  ```bash
  pnpm test
  ```

  Expected: all 31 existing tests pass (0 failures).

- [ ] **Step 5: Commit**

  ```bash
  git add packages/core/src/types.ts packages/core/src/setup.ts packages/core/src/reduce.ts
  git commit -m "feat(core): update types — economy object, raisesReceived, hiring commands/events"
  ```

---

## Task 3: Economy module

**Files:**
- Create: `packages/core/test/economy.test.ts`
- Create: `packages/core/src/economy.ts`

TDD: write the failing tests first, then implement.

**Important implementation notes:**
- The index/reading random-walk algorithm is approximated here based on §5 and expected game behaviour. **Cross-check the exact formula against the Java port's `EconomyManager` class** before finalising. Observable properties to match: slow drift with occasional sharp moves, index clamped to [−3, +3], reading clamped to [−30, +90].
- `adjustedPrice` formula: `Math.round(base + base * reading / 60)`.
- For Boom: reading gets a +10% bonus, clamped to 90.

- [ ] **Step 1: Write `packages/core/test/economy.test.ts`**

  ```ts
  import { describe, it, expect } from "vitest";
  import { defaultConfig, constantEconomyConfig } from "@jones/config";
  import { makeEconomy, applyCrashEffects } from "../src/economy.js";
  import { nextFloat } from "../src/rng.js";
  import type { GameEvent, PlayerState } from "../src/types.js";
  import type { RngState } from "../src/rng.js";

  const dynamicConfig = defaultConfig;
  const constConfig = { ...defaultConfig, economy: constantEconomyConfig };
  const dynamic = makeEconomy(dynamicConfig);
  const constant = makeEconomy(constConfig);

  function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
    return {
      id: "p0", name: "Test", isAI: false, cash: 200, bank: 0, happiness: 0,
      dependibility: 20, experience: 10, relaxation: 10, maxDependibility: 20,
      maxExperience: 10, degrees: [], jobId: null, wage: 0, locationId: "lowCostHousing",
      insideBuilding: false, clothing: { casual: 6, dress: 0, business: 0 },
      goals: { wealth: 10, happiness: 10, education: 10, career: 10 },
      hoursRemaining: 60, raisesReceived: 0,
      ...overrides,
    };
  }

  /** Finds the first seed in 0..99999 where nextFloat produces a value matching predicate. */
  function findSeedForFloat(predicate: (v: number) => boolean): number {
    for (let s = 0; s <= 99999; s++) {
      if (predicate(nextFloat({ seed: s }).value)) return s;
    }
    throw new Error("no matching seed found in 0..99999");
  }

  describe("adjustedPrice", () => {
    it("returns base when reading=0", () => {
      expect(dynamic.adjustedPrice(100, 0)).toBe(100);
    });
    it("returns 150% of base when reading=30", () => {
      expect(dynamic.adjustedPrice(100, 30)).toBe(150);
    });
    it("returns 50% of base when reading=-30", () => {
      expect(dynamic.adjustedPrice(100, -30)).toBe(50);
    });
  });

  describe("ConstantEconomy", () => {
    it("step returns index=0, reading=0, no events, no playerUpdates", () => {
      const rng: RngState = { seed: 42 };
      const result = constant.step({ index: 5, reading: 30 }, 10, 0, 2, constConfig.economy, rng, []);
      expect(result.index).toBe(0);
      expect(result.reading).toBe(0);
      expect(result.events).toHaveLength(0);
      expect(result.playerUpdates).toHaveLength(0);
    });
    it("step does not advance RNG", () => {
      const rng: RngState = { seed: 42 };
      const result = constant.step({ index: 0, reading: 0 }, 1, 0, 1, constConfig.economy, rng, []);
      expect(result.rng.seed).toBe(42);
    });
    it("adjustedPrice returns base regardless of reading", () => {
      expect(constant.adjustedPrice(100, 50)).toBe(100);
      expect(constant.adjustedPrice(100, -20)).toBe(100);
    });
  });

  describe("DynamicEconomy step", () => {
    it("advances RNG (seed changes after step)", () => {
      const rng: RngState = { seed: 1 };
      const result = dynamic.step({ index: 0, reading: 0 }, 1, 0, 1, dynamicConfig.economy, rng, []);
      expect(result.rng.seed).not.toBe(1);
    });
    it("always emits EconomyUpdated", () => {
      const rng: RngState = { seed: 1 };
      const result = dynamic.step({ index: 0, reading: 0 }, 1, 0, 1, dynamicConfig.economy, rng, []);
      expect(result.events.some((e) => e.type === "EconomyUpdated")).toBe(true);
    });
    it("keeps index in [-3, +3] over 100 steps", () => {
      let rng: RngState = { seed: 7 };
      let economy = { index: 0, reading: 0 };
      for (let i = 0; i < 100; i++) {
        const r = dynamic.step(economy, 1, 0, 1, dynamicConfig.economy, rng, []);
        expect(r.index).toBeGreaterThanOrEqual(-3);
        expect(r.index).toBeLessThanOrEqual(3);
        economy = { index: r.index, reading: r.reading };
        rng = r.rng;
      }
    });
    it("keeps reading in [-30, +90] over 200 steps", () => {
      let rng: RngState = { seed: 3 };
      let economy = { index: 0, reading: 0 };
      for (let i = 0; i < 200; i++) {
        const r = dynamic.step(economy, 1, 0, 1, dynamicConfig.economy, rng, []);
        expect(r.reading).toBeGreaterThanOrEqual(-30);
        expect(r.reading).toBeLessThanOrEqual(90);
        economy = { index: r.index, reading: r.reading };
        rng = r.rng;
      }
    });
    it("does not emit crash/boom events before eventStartWeek=8", () => {
      const rng: RngState = { seed: 1 };
      const result = dynamic.step({ index: 3, reading: 85 }, 7, 0, 1, dynamicConfig.economy, rng, []);
      expect(result.events.some((e) => e.type === "CrashOccurred")).toBe(false);
      expect(result.events.some((e) => e.type === "BoomOccurred")).toBe(false);
    });
  });

  describe("applyCrashEffects", () => {
    it("major: fires all employed players and emits Fired events", () => {
      const players = [
        makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 5 }),
        makePlayer({ id: "p1", jobId: null }),
        makePlayer({ id: "p2", jobId: "bank.teller", wage: 8 }),
      ];
      const events: GameEvent[] = [];
      const { playerUpdates } = applyCrashEffects("major", 8, 0, players, events, { seed: 0 });
      expect(events.filter((e) => e.type === "Fired")).toHaveLength(2);
      expect(events.some((e) => e.type === "Fired" && e.playerId === "p0")).toBe(true);
      expect(events.some((e) => e.type === "Fired" && e.playerId === "p2")).toBe(true);
      const p0u = playerUpdates.find((u) => u.playerId === "p0")!;
      expect(p0u.fired).toBe(true);
      expect(p0u.happiness).toBe(-3);
    });
    it("major: does not consume RNG (firing is deterministic)", () => {
      const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 5 })];
      const events: GameEvent[] = [];
      const rng0: RngState = { seed: 42 };
      const { rng: rng1 } = applyCrashEffects("major", 8, 0, players, events, rng0);
      expect(rng1.seed).toBe(42);
    });
    it("moderate: consumes RNG for each employed player fire check", () => {
      const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 10 })];
      const events: GameEvent[] = [];
      const rng0: RngState = { seed: 0 };
      const { rng: rng1 } = applyCrashEffects("moderate", 8, 0, players, events, rng0);
      expect(rng1.seed).not.toBe(rng0.seed);
    });
    it("moderate: fires player when float < 0.5", () => {
      const FIRE_SEED = findSeedForFloat((v) => v < 0.5);
      const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 10 })];
      const events: GameEvent[] = [];
      const { playerUpdates } = applyCrashEffects("moderate", 8, 0, players, events, { seed: FIRE_SEED });
      expect(events.some((e) => e.type === "Fired" && e.playerId === "p0")).toBe(true);
      expect(playerUpdates.find((u) => u.playerId === "p0")!.fired).toBe(true);
    });
    it("moderate: survivor wage cut by 20% when float >= 0.5", () => {
      const SURVIVE_SEED = findSeedForFloat((v) => v >= 0.5);
      const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 10 })];
      const events: GameEvent[] = [];
      const { playerUpdates } = applyCrashEffects("moderate", 8, 0, players, events, { seed: SURVIVE_SEED });
      expect(events.filter((e) => e.type === "Fired")).toHaveLength(0);
      expect(playerUpdates.find((u) => u.playerId === "p0")!.wage).toBe(8); // floor(10 * 0.8)
    });
    it("minor: happiness -1 for turn player only, no Fired events", () => {
      const players = [
        makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 5 }),
        makePlayer({ id: "p1", jobId: "bank.teller", wage: 8 }),
      ];
      const events: GameEvent[] = [];
      const { playerUpdates } = applyCrashEffects("minor", 8, 0, players, events, { seed: 0 });
      expect(events.filter((e) => e.type === "Fired")).toHaveLength(0);
      const p0u = playerUpdates.find((u) => u.playerId === "p0");
      expect(p0u?.happiness).toBe(-1);
      const p1u = playerUpdates.find((u) => u.playerId === "p1");
      expect(p1u?.happiness).toBeUndefined();
    });
  });
  ```

- [ ] **Step 2: Run to verify tests fail**

  ```bash
  pnpm test --reporter=verbose 2>&1 | grep -E "FAIL|economy"
  ```

  Expected: economy.test.ts fails with "Cannot find module '../src/economy.js'".

- [ ] **Step 3: Create `packages/core/src/economy.ts`**

  ```ts
  import type { EconomyConfig, GameConfig } from "@jones/config";
  import { nextFloat, nextInt } from "./rng.js";
  import type { RngState } from "./rng.js";
  import type { GameEvent, PlayerState } from "./types.js";

  export interface EconomyStepResult {
    index: number;
    reading: number;
    events: GameEvent[];
    rng: RngState;
    playerUpdates: Array<{ playerId: string; wage?: number; fired?: boolean; happiness?: number }>;
  }

  export interface Economy {
    step(
      economy: { index: number; reading: number },
      week: number,
      currentPlayerIndex: number,
      numPlayers: number,
      config: EconomyConfig,
      rng: RngState,
      players: PlayerState[]
    ): EconomyStepResult;
    adjustedPrice(base: number, reading: number): number;
  }

  /**
   * Apply crash effects to the players array and collect Fired events.
   * Exported for isolated testing without going through the full economy step.
   *
   * NOTE: The exact fire probabilities and wage-cut rules are based on §5.
   * Cross-check Moderate fire logic (50%) against the Java port's EconomyManager.
   */
  export function applyCrashEffects(
    severity: "minor" | "moderate" | "major",
    _week: number,
    currentPlayerIndex: number,
    players: PlayerState[],
    events: GameEvent[],
    rng: RngState,
  ): { playerUpdates: Array<{ playerId: string; wage?: number; fired?: boolean; happiness?: number }>; rng: RngState } {
    const updates = new Map<string, { playerId: string; wage?: number; fired?: boolean; happiness?: number }>();

    // Happiness delta for the turn player (player who is about to act this week).
    const hapDelta = severity === "minor" ? -1 : severity === "moderate" ? -2 : -3;
    if (currentPlayerIndex < players.length) {
      const tp = players[currentPlayerIndex];
      updates.set(tp.id, { playerId: tp.id, happiness: hapDelta });
    }

    for (const player of players) {
      if (player.jobId === null) continue;

      if (severity === "major") {
        // All employed players fired (no RNG consumed).
        const existing = updates.get(player.id) ?? { playerId: player.id };
        updates.set(player.id, { ...existing, fired: true });
        events.push({ type: "Fired", playerId: player.id, jobId: player.jobId });
      } else if (severity === "moderate") {
        // 50% fire chance per employed player.
        const r = nextFloat(rng);
        rng = r.state;
        if (r.value < 0.5) {
          const existing = updates.get(player.id) ?? { playerId: player.id };
          updates.set(player.id, { ...existing, fired: true });
          events.push({ type: "Fired", playerId: player.id, jobId: player.jobId });
        } else {
          // Survivor: wage cut 20% (round down).
          const existing = updates.get(player.id) ?? { playerId: player.id };
          updates.set(player.id, { ...existing, wage: Math.floor(player.wage * 0.8) });
        }
      }
      // Minor: no employment effects; only the turn-player happiness delta above.
    }

    return { playerUpdates: Array.from(updates.values()), rng };
  }

  class ConstantEconomy implements Economy {
    step(
      _economy: { index: number; reading: number },
      _week: number,
      _currentPlayerIndex: number,
      _numPlayers: number,
      _config: EconomyConfig,
      rng: RngState,
      _players: PlayerState[],
    ): EconomyStepResult {
      return { index: 0, reading: 0, events: [], rng, playerUpdates: [] };
    }

    adjustedPrice(base: number, _reading: number): number {
      return base;
    }
  }

  class DynamicEconomy implements Economy {
    step(
      economy: { index: number; reading: number },
      week: number,
      currentPlayerIndex: number,
      numPlayers: number,
      config: EconomyConfig,
      rng: RngState,
      players: PlayerState[],
    ): EconomyStepResult {
      const events: GameEvent[] = [];
      let playerUpdates: EconomyStepResult["playerUpdates"] = [];

      // Step 1: Index — random walk [-1, 0, +1], clamped to [-3, +3].
      // NOTE: Cross-check exact step distribution against Java port EconomyManager.
      const r1 = nextInt(rng, -1, 1);
      rng = r1.state;
      const newIndex = Math.max(-3, Math.min(3, economy.index + r1.value));

      // Step 2: Reading — drifts toward newIndex * 15 with jitter [-5, +5],
      // clamped to [-30, +90].
      // NOTE: Cross-check drift target and jitter range against Java port.
      const r2 = nextInt(rng, -5, 5);
      rng = r2.state;
      const drift = Math.sign(newIndex * 15 - economy.reading);
      let newReading = Math.max(-30, Math.min(90, economy.reading + drift + r2.value));

      // Step 3: Crash check (only from eventStartWeek, only if reading >= threshold).
      let crashHappened = false;
      if (week >= config.eventStartWeek && newReading >= config.crashReadingThreshold) {
        const crashProb = 1 / (1 + config.crashProbabilityBase * numPlayers);
        const r3 = nextFloat(rng);
        rng = r3.state;
        if (r3.value < crashProb) {
          crashHappened = true;
          const r4 = nextInt(rng, 0, 2);
          rng = r4.state;
          const severity = (["minor", "moderate", "major"] as const)[r4.value];

          // Reading drop: Minor -5%, Moderate -10%, Major -15% (no re-clamp per spec).
          const pct = severity === "minor" ? 0.05 : severity === "moderate" ? 0.10 : 0.15;
          newReading -= Math.floor(newReading * pct);

          const crashResult = applyCrashEffects(severity, week, currentPlayerIndex, players, events, rng);
          rng = crashResult.rng;
          playerUpdates = crashResult.playerUpdates;

          events.push({ type: "CrashOccurred", severity, week });
        }
      }

      // Step 4: Boom check (only if no crash, and only from eventStartWeek).
      // NOTE: Spec mentions Boom threshold ≤ 120, but max reading is 90, so no threshold.
      // Cross-check against Java port whether a real reading threshold exists.
      if (!crashHappened && week >= config.eventStartWeek) {
        const boomProb = 1 / (1 + config.boomProbabilityBase * numPlayers);
        const r5 = nextFloat(rng);
        rng = r5.state;
        if (r5.value < boomProb) {
          newReading = Math.min(90, Math.floor(newReading * 1.10));
          events.push({ type: "BoomOccurred", week });
        }
      }

      // Step 5: Always emit EconomyUpdated.
      events.push({ type: "EconomyUpdated", index: newIndex, reading: newReading });

      return { index: newIndex, reading: newReading, events, rng, playerUpdates };
    }

    adjustedPrice(base: number, reading: number): number {
      return Math.round(base + base * reading / 60);
    }
  }

  export function makeEconomy(config: GameConfig): Economy {
    return config.economy.mode === "dynamic" ? new DynamicEconomy() : new ConstantEconomy();
  }
  ```

- [ ] **Step 4: Run tests to verify they pass**

  ```bash
  pnpm test packages/core/test/economy.test.ts --reporter=verbose
  ```

  Expected: all economy tests pass. If a `findSeedForFloat` call throws "no matching seed found", the predicate is wrong — check the comparison direction.

- [ ] **Step 5: Run full suite to confirm no regressions**

  ```bash
  pnpm test
  ```

  Expected: all tests pass (31 old + new economy tests).

- [ ] **Step 6: Commit**

  ```bash
  git add packages/core/src/economy.ts packages/core/test/economy.test.ts
  git commit -m "feat(core): add Economy module with DynamicEconomy, ConstantEconomy, and applyCrashEffects"
  ```

---

## Task 4: Wire economy step into the week-advance turn sequence

**Files:**
- Modify: `packages/core/src/turn.ts`
- Modify: `packages/core/src/reduce.ts`

No new test file. Existing tests must all pass after wiring (week < 8 in most tests, so no crash/boom fires).

- [ ] **Step 1: Update `packages/core/src/turn.ts`**

  Full replacement:

  ```ts
  import type { GameConfig } from "@jones/config";
  import type { GameEvent, GameState, PlayerState } from "./types.js";
  import type { Economy } from "./economy.js";
  import { hasWon } from "./goals.js";

  export function applyStartOfWeek(p: PlayerState, config: GameConfig): void {
    p.relaxation = Math.max(10, p.relaxation - 1);
    p.dependibility = Math.max(0, p.dependibility - config.constants.dependibilityDecayPerWeek);
    p.clothing.casual = Math.max(0, p.clothing.casual - 1);
    p.clothing.dress = Math.max(0, p.clothing.dress - 1);
    p.clothing.business = Math.max(0, p.clothing.business - 1);
    p.locationId = config.constants.homeLocationId;
    p.insideBuilding = false;
    p.hoursRemaining = config.constants.hoursPerTurn;
  }

  export function advanceTurn(
    state: GameState,
    config: GameConfig,
    events: GameEvent[],
    economy: Economy,
  ): void {
    const wasLast = state.currentPlayerIndex === state.players.length - 1;
    state.currentPlayerIndex = wasLast ? 0 : state.currentPlayerIndex + 1;

    if (wasLast) {
      state.week += 1;
      events.push({ type: "WeekAdvanced", week: state.week });

      // Economy step: runs once per week, before the first player's new turn.
      // currentPlayerIndex is now 0 (just wrapped); this is the "turn player" for
      // crash/boom happiness effects.
      const result = economy.step(
        state.economy,
        state.week,
        state.currentPlayerIndex,
        state.players.length,
        config.economy,
        state.rng,
        state.players,
      );
      state.economy = { index: result.index, reading: result.reading };
      state.rng = result.rng;

      // Apply player updates (wage cuts, fires, happiness deltas).
      for (const update of result.playerUpdates) {
        const player = state.players.find((p) => p.id === update.playerId);
        if (!player) continue;
        if (update.fired) {
          player.jobId = null;
          player.wage = 0;
          player.raisesReceived = 0;
        }
        if (update.wage !== undefined) player.wage = update.wage;
        if (update.happiness !== undefined) player.happiness += update.happiness;
      }

      events.push(...result.events);
    }

    const upNext = state.players[state.currentPlayerIndex];
    applyStartOfWeek(upNext, config);
    if (hasWon(upNext)) {
      if (!state.winners.includes(upNext.id)) state.winners.push(upNext.id);
      state.status = "ended";
      events.push({ type: "PlayerWon", playerId: upNext.id });
    }
  }
  ```

- [ ] **Step 2: Update `packages/core/src/reduce.ts` — add `makeEconomy` and pass it to `advanceTurn`**

  The three changes needed: (a) add `makeEconomy` import, (b) create economy instance once per `reduce` call, (c) pass it to `advanceTurn`. The `EndTurn` case and `cloneState` are already correct from Task 2.

  ```ts
  import type { GameConfig } from "@jones/config";
  import type { Command, GameEvent, GameState, PlayerState, ReduceResult } from "./types.js";
  import { travelHours } from "./travel.js";
  import { findJob, meetsUniform } from "./work.js";
  import { advanceTurn } from "./turn.js";
  import { makeEconomy } from "./economy.js";

  function current(state: GameState): PlayerState {
    return state.players[state.currentPlayerIndex];
  }

  function cloneState(state: GameState): GameState {
    return {
      ...state,
      players: state.players.map((p) => ({ ...p, clothing: { ...p.clothing }, degrees: [...p.degrees], goals: { ...p.goals } })),
      rng: { ...state.rng },
      winners: [...state.winners],
      economy: { ...state.economy },
    };
  }

  export function reduce(state: GameState, command: Command, config: GameConfig): ReduceResult {
    const events: GameEvent[] = [];
    const next = cloneState(state);
    const p = current(next);
    const economy = makeEconomy(config);

    switch (command.type) {
      case "TravelTo": {
        if (p.insideBuilding) {
          events.push({ type: "InvalidAction", playerId: p.id, reason: "must exit building before traveling" });
          break;
        }
        const hours = travelHours(config, p.locationId, command.locationId);
        if (hours > p.hoursRemaining) {
          events.push({ type: "NotEnoughTime", playerId: p.id, action: "TravelTo" });
          break;
        }
        p.hoursRemaining -= hours;
        p.locationId = command.locationId;
        events.push({ type: "Traveled", playerId: p.id, toLocationId: command.locationId, hoursSpent: hours });
        break;
      }
      case "EnterBuilding": {
        if (p.insideBuilding) {
          events.push({ type: "InvalidAction", playerId: p.id, reason: "already inside" });
          break;
        }
        const cost = config.actionCosts.enterLocation;
        if (cost > p.hoursRemaining) {
          events.push({ type: "NotEnoughTime", playerId: p.id, action: "EnterBuilding" });
          break;
        }
        p.hoursRemaining -= cost;
        p.insideBuilding = true;
        events.push({ type: "EnteredBuilding", playerId: p.id, locationId: p.locationId });
        break;
      }
      case "ExitBuilding": {
        if (!p.insideBuilding) {
          events.push({ type: "InvalidAction", playerId: p.id, reason: "not inside" });
          break;
        }
        p.insideBuilding = false;
        events.push({ type: "ExitedBuilding", playerId: p.id, locationId: p.locationId });
        break;
      }
      case "Work": {
        if (p.jobId === null) {
          events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
          break;
        }
        const job = findJob(config, p.jobId);
        if (!p.insideBuilding || p.locationId !== job.locationId) {
          events.push({ type: "InvalidAction", playerId: p.id, reason: "not at workplace" });
          break;
        }
        if (p.hoursRemaining <= 0) {
          events.push({ type: "NotEnoughTime", playerId: p.id, action: "Work" });
          break;
        }
        if (p.dependibility < job.reqDependibility - 5) {
          const firedJobId = p.jobId;
          p.jobId = null;
          p.wage = 0;
          events.push({ type: "Fired", playerId: p.id, jobId: firedJobId });
          break;
        }
        if (!meetsUniform(p, job.uniform)) {
          events.push({ type: "InvalidAction", playerId: p.id, reason: "missing uniform" });
          break;
        }
        const fullHours = config.actionCosts.work;
        const hours = Math.min(fullHours, p.hoursRemaining);
        const earned = Math.floor((config.constants.workWageMultiplier * p.wage * hours) / fullHours);
        p.cash += earned;
        p.hoursRemaining -= hours;
        if (p.experience < p.maxExperience) p.experience += 1;
        if (p.dependibility < p.maxDependibility) p.dependibility += 1;
        events.push({ type: "Worked", playerId: p.id, earned });
        break;
      }
      case "EndTurn": {
        events.push({ type: "TurnEnded", playerId: p.id });
        advanceTurn(next, config, events, economy);
        break;
      }
      default:
        events.push({ type: "InvalidAction", playerId: p.id, reason: `unhandled command ${(command as Command).type}` });
    }

    return { state: next, events };
  }
  ```

- [ ] **Step 3: Run the full test suite**

  ```bash
  pnpm test
  ```

  Expected: all existing tests still pass. The economy step now runs at week boundaries, but:
  - Most tests run at week 1–2 (below eventStartWeek=8), so no crash/boom fires.
  - DynamicEconomy consumes RNG at week boundary, but determinism is preserved (same seed → same output).

- [ ] **Step 4: Commit**

  ```bash
  git add packages/core/src/turn.ts packages/core/src/reduce.ts
  git commit -m "feat(core): wire economy step into week-advance turn sequence"
  ```

---

## Task 5: Hiring module — ApplyForJob, RequestRaise, QuitJob

**Files:**
- Create: `packages/core/test/hire.test.ts`
- Create: `packages/core/src/hire.ts`
- Modify: `packages/core/src/reduce.ts` (add three new cases)

TDD: write failing tests first, then implement `hire.ts`, then add reducer cases.

**Key field names to use (from `@jones/config`):**
- `job.baseWage` (not `job.wage`) — this is the pre-economy wage
- `job.reqDependibility`, `job.reqExperience`, `job.reqDegrees` — stat gates
- `job.alwaysApproved` — Cook skips luck roll
- `config.actionCosts.applyJob` = 4 (hours charged for ApplyForJob and RequestRaise)

**Luck formula (§6):** `30 + (10 + p.dependibility + p.experience + 8 × p.degrees.length) / 3`
Roll: `nextInt(next.rng, 1, 100)` — denied if roll > luck threshold.

**Stat-cap formula on hire (§4):**
- `p.maxDependibility = config.constants.initialDependibility + job.reqDependibility + 5 × p.degrees.length`
- `p.maxExperience = config.constants.initialExperience + job.reqExperience + 5 × p.degrees.length`

- [ ] **Step 1: Write `packages/core/test/hire.test.ts`**

  ```ts
  import { describe, it, expect } from "vitest";
  import { defaultConfig, constantEconomyConfig } from "@jones/config";
  import { createInitialGame } from "../src/setup.js";
  import { reduce } from "../src/reduce.js";
  import { nextInt } from "../src/rng.js";
  import type { GameState } from "../src/types.js";

  const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

  /** Player positioned inside the Employment Office with default stats. */
  function applyJobGame(): GameState {
    const g = createInitialGame(testConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
    g.players[0].locationId = "employmentOffice";
    g.players[0].insideBuilding = true;
    return g;
  }

  /**
   * Finds the first seed in 0..99999 where nextInt(rng, 1, 100) satisfies predicate.
   * Used to set game.rng.seed so the luck roll lands exactly where the test expects.
   */
  function findSeedForRoll(predicate: (roll: number) => boolean): number {
    for (let s = 0; s <= 99999; s++) {
      if (predicate(nextInt({ seed: s }, 1, 100).value)) return s;
    }
    throw new Error("no matching seed found in 0..99999");
  }

  describe("ApplyForJob", () => {
    it("Cook: approved (alwaysApproved=true), sets job/wage/experience/happiness", () => {
      const g = applyJobGame();
      const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
      const p = state.players[0];
      expect(p.jobId).toBe("monolithBurgers.cook");
      expect(p.wage).toBe(5);           // adjustedPrice(baseWage=5, reading=0) = 5
      expect(p.raisesReceived).toBe(0);
      expect(p.experience).toBe(12);    // 10 + 2 on hire
      expect(p.happiness).toBe(3);      // +3 on hire
      expect(p.hoursRemaining).toBe(56); // 60 - applyJob(4)
      expect(events.some((e) => e.type === "JobApplied" && e.jobId === "monolithBurgers.cook" && e.wage === 5)).toBe(true);
    });

    it("Cook: always approved even when luck roll would fail for other jobs", () => {
      // luck threshold for default player: 30 + (10+20+10+0)/3 ≈ 43.33
      // find a seed where roll > 43 (would fail luck for non-alwaysApproved)
      const BAD_LUCK_SEED = findSeedForRoll((r) => r > 43);
      const g = applyJobGame();
      g.rng = { seed: BAD_LUCK_SEED };
      const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
      expect(events.some((e) => e.type === "JobApplied")).toBe(true);
      expect(state.players[0].jobId).toBe("monolithBurgers.cook");
    });

    it("denied on stats: experience too low; hours deducted, happiness -1", () => {
      const g = applyJobGame();
      g.players[0].experience = 5; // reqExperience=10 for zMart.clerk
      const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "zMart.clerk" }, testConfig);
      expect(events.some((e) => e.type === "JobDenied" && e.reason === "stats")).toBe(true);
      expect(state.players[0].jobId).toBeNull();
      expect(state.players[0].happiness).toBe(-1);
      expect(state.players[0].hoursRemaining).toBe(56); // hours still charged
    });

    it("denied on luck: roll exceeds luck threshold; hours deducted, happiness -1", () => {
      // luck threshold for default player: floor(30 + (10+20+10)/3) = 43
      // denied if roll > 43
      const LUCK_FAIL_SEED = findSeedForRoll((r) => r > 43);
      const g = applyJobGame();
      g.rng = { seed: LUCK_FAIL_SEED };
      const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "zMart.clerk" }, testConfig);
      expect(events.some((e) => e.type === "JobDenied" && e.reason === "luck")).toBe(true);
      expect(state.players[0].jobId).toBeNull();
      expect(state.players[0].happiness).toBe(-1);
      expect(state.players[0].hoursRemaining).toBe(56);
    });

    it("weeks 1-4: dep gate suppressed; player hired even with dep below requirement", () => {
      const g = applyJobGame();
      g.players[0].dependibility = 5; // below reqDependibility=10 for Cook, but week=1
      // Cook is alwaysApproved so luck check is also skipped
      const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
      expect(events.some((e) => e.type === "JobApplied")).toBe(true);
      expect(state.players[0].jobId).toBe("monolithBurgers.cook");
    });

    it("guard: not inside Employment Office → InvalidAction, no hour cost", () => {
      const g = applyJobGame();
      g.players[0].insideBuilding = false;
      const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
      expect(state.players[0].hoursRemaining).toBe(60); // no cost
    });

    it("guard: not enough hours → NotEnoughTime", () => {
      const g = applyJobGame();
      g.players[0].hoursRemaining = 3; // below applyJob cost = 4
      const { events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
      expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
    });

    it("guard: unknown jobId → InvalidAction", () => {
      const g = applyJobGame();
      const { events } = reduce(g, { type: "ApplyForJob", jobId: "does.not.exist" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "unknown job")).toBe(true);
    });

    it("sets stat caps on hire: maxDep = initialDep + reqDep + 5*degrees", () => {
      const g = applyJobGame();
      const { state } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
      // Cook: reqDependibility=10, player has no degrees
      // maxDep = 20 + 10 + 5*0 = 30; maxExp = 10 + 0 + 5*0 = 10
      expect(state.players[0].maxDependibility).toBe(30);
      expect(state.players[0].maxExperience).toBe(10);
    });
  });

  describe("RequestRaise", () => {
    function raisedGame(overrides: { wage?: number; raisesReceived?: number; dep?: number } = {}): GameState {
      const g = applyJobGame();
      g.players[0].jobId = "monolithBurgers.cook";
      g.players[0].wage = overrides.wage ?? 3;       // below baseWage=5 so raise is offered
      g.players[0].raisesReceived = overrides.raisesReceived ?? 0;
      g.players[0].dependibility = overrides.dep ?? 20;
      return g;
    }

    it("granted: wage updated, raisesReceived incremented, happiness +3", () => {
      // offeredWage = adjustedPrice(baseWage=5, reading=0) = 5; p.wage=3 < 5 → raise approved
      // dep gate: 20 >= reqDep(10) + 5*raisesReceived(0) = 10 → passes
      const { state, events } = reduce(raisedGame(), { type: "RequestRaise" }, testConfig);
      const p = state.players[0];
      expect(p.wage).toBe(5);
      expect(p.raisesReceived).toBe(1);
      expect(p.happiness).toBe(3);
      expect(events.some((e) => e.type === "RaiseGranted" && e.newWage === 5)).toBe(true);
    });

    it("denied (no-higher-offer): offered wage ≤ current wage", () => {
      // wage=5, offeredWage=5 → not higher → denied
      const g = raisedGame({ wage: 5 });
      const { state, events } = reduce(g, { type: "RequestRaise" }, testConfig);
      expect(events.some((e) => e.type === "RaiseDenied" && e.reason === "no-higher-offer")).toBe(true);
      expect(state.players[0].wage).toBe(5); // unchanged
    });

    it("denied (stats): dep too low for nth raise, happiness -1", () => {
      // raisesReceived=1: dep must be >= reqDep(10) + 5*1 = 15; player dep=14 → fails
      const g = raisedGame({ wage: 3, raisesReceived: 1, dep: 14 });
      const { state, events } = reduce(g, { type: "RequestRaise" }, testConfig);
      expect(events.some((e) => e.type === "RaiseDenied" && e.reason === "stats")).toBe(true);
      expect(state.players[0].happiness).toBe(-1);
      expect(state.players[0].wage).toBe(3); // unchanged
    });

    it("guard: not inside Employment Office → InvalidAction", () => {
      const g = raisedGame();
      g.players[0].insideBuilding = false;
      const { events } = reduce(g, { type: "RequestRaise" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
    });

    it("guard: no job → InvalidAction", () => {
      const g = applyJobGame(); // no job
      const { events } = reduce(g, { type: "RequestRaise" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "no job")).toBe(true);
    });

    it("guard: not enough hours → NotEnoughTime", () => {
      const g = raisedGame();
      g.players[0].hoursRemaining = 3;
      const { events } = reduce(g, { type: "RequestRaise" }, testConfig);
      expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
    });
  });

  describe("QuitJob", () => {
    function employedGame(): GameState {
      const g = applyJobGame();
      g.players[0].jobId = "monolithBurgers.cook";
      g.players[0].wage = 5;
      g.players[0].raisesReceived = 2;
      return g;
    }

    it("clears job, wage, raisesReceived; happiness -2; emits JobQuit", () => {
      const { state, events } = reduce(employedGame(), { type: "QuitJob" }, testConfig);
      const p = state.players[0];
      expect(p.jobId).toBeNull();
      expect(p.wage).toBe(0);
      expect(p.raisesReceived).toBe(0);
      expect(p.happiness).toBe(-2);
      expect(events.some((e) => e.type === "JobQuit" && e.jobId === "monolithBurgers.cook")).toBe(true);
    });

    it("no location requirement — works from anywhere", () => {
      const g = employedGame();
      g.players[0].locationId = "zMart";
      g.players[0].insideBuilding = false;
      const { events } = reduce(g, { type: "QuitJob" }, testConfig);
      expect(events.some((e) => e.type === "JobQuit")).toBe(true);
    });

    it("guard: no job → InvalidAction", () => {
      const { events } = reduce(applyJobGame(), { type: "QuitJob" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "no job")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run to verify tests fail**

  ```bash
  pnpm test packages/core/test/hire.test.ts --reporter=verbose 2>&1 | head -20
  ```

  Expected: fails with "unhandled command ApplyForJob" (from the default case in reduce.ts).

- [ ] **Step 3: Create `packages/core/src/hire.ts`**

  ```ts
  import type { GameConfig } from "@jones/config";
  import type { Economy } from "./economy.js";
  import { nextInt } from "./rng.js";
  import type { GameEvent, GameState } from "./types.js";

  /** §6 ApplyForJob — location guard and hour deduction happen before any stat/luck gate. */
  export function applyForJob(
    jobId: string,
    state: GameState,
    config: GameConfig,
    economy: Economy,
    events: GameEvent[],
  ): void {
    const p = state.players[state.currentPlayerIndex];

    if (!p.insideBuilding || p.locationId !== "employmentOffice") {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "must be inside Employment Office" });
      return;
    }
    if (config.actionCosts.applyJob > p.hoursRemaining) {
      events.push({ type: "NotEnoughTime", playerId: p.id, action: "ApplyForJob" });
      return;
    }
    p.hoursRemaining -= config.actionCosts.applyJob;

    const job = config.jobs.find((j) => j.id === jobId);
    if (!job) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown job" });
      return;
    }

    // Stat gates (§6): experience, dependibility (suppressed weeks 1-4), degrees.
    const depGateActive = state.week > 4;
    const statsFail =
      p.experience < job.reqExperience ||
      (depGateActive && p.dependibility < job.reqDependibility) ||
      job.reqDegrees.some((d) => !p.degrees.includes(d));

    if (statsFail) {
      p.happiness -= 1;
      events.push({ type: "JobDenied", playerId: p.id, jobId, reason: "stats" });
      return;
    }

    // Luck roll (§6): skipped if alwaysApproved (e.g. Cook).
    if (!job.alwaysApproved) {
      const luck = 30 + (10 + p.dependibility + p.experience + 8 * p.degrees.length) / 3;
      const r = nextInt(state.rng, 1, 100);
      state.rng = r.state;
      if (r.value > luck) {
        p.happiness -= 1;
        events.push({ type: "JobDenied", playerId: p.id, jobId, reason: "luck" });
        return;
      }
    }

    // Approval.
    p.jobId = job.id;
    p.wage = economy.adjustedPrice(job.baseWage, state.economy.reading);
    p.raisesReceived = 0;
    p.maxDependibility = config.constants.initialDependibility + job.reqDependibility + 5 * p.degrees.length;
    p.maxExperience = config.constants.initialExperience + job.reqExperience + 5 * p.degrees.length;
    p.experience = Math.min(p.maxExperience, p.experience + 2);
    p.happiness += 3;
    events.push({ type: "JobApplied", playerId: p.id, jobId, wage: p.wage });
  }

  /** §6 RequestRaise — same location and hour cost as ApplyForJob. */
  export function requestRaise(
    state: GameState,
    config: GameConfig,
    economy: Economy,
    events: GameEvent[],
  ): void {
    const p = state.players[state.currentPlayerIndex];

    if (!p.insideBuilding || p.locationId !== "employmentOffice") {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "must be inside Employment Office" });
      return;
    }
    if (p.jobId === null) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
      return;
    }
    if (config.actionCosts.applyJob > p.hoursRemaining) {
      events.push({ type: "NotEnoughTime", playerId: p.id, action: "RequestRaise" });
      return;
    }
    p.hoursRemaining -= config.actionCosts.applyJob;

    const job = config.jobs.find((j) => j.id === p.jobId)!;
    const offeredWage = economy.adjustedPrice(job.baseWage, state.economy.reading);

    if (offeredWage <= p.wage) {
      events.push({ type: "RaiseDenied", playerId: p.id, reason: "no-higher-offer" });
      return;
    }

    // Dep gate: must meet reqDependibility + 5 × raisesReceived.
    if (p.dependibility < job.reqDependibility + 5 * p.raisesReceived) {
      p.happiness -= 1;
      events.push({ type: "RaiseDenied", playerId: p.id, reason: "stats" });
      return;
    }

    p.wage = offeredWage;
    p.raisesReceived += 1;
    p.happiness += 3;
    events.push({ type: "RaiseGranted", playerId: p.id, newWage: p.wage });
  }

  /** §6 QuitJob — free action, no location requirement. */
  export function quitJob(
    state: GameState,
    events: GameEvent[],
  ): void {
    const p = state.players[state.currentPlayerIndex];

    if (p.jobId === null) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
      return;
    }

    const quitJobId = p.jobId;
    p.jobId = null;
    p.wage = 0;
    p.raisesReceived = 0;
    p.happiness -= 2;
    events.push({ type: "JobQuit", playerId: p.id, jobId: quitJobId });
  }
  ```

  **Implementation note on `QuitJob` happiness:** §6 says only happiness is penalised for voluntary quit; the exact delta (−2) should be cross-checked against the Java port. Adjust if needed.

- [ ] **Step 4: Add `ApplyForJob`, `RequestRaise`, `QuitJob` cases to `packages/core/src/reduce.ts`**

  Add the import for `hire.ts` functions at the top of the file (after the `makeEconomy` import):

  ```ts
  import { applyForJob, requestRaise, quitJob } from "./hire.js";
  ```

  Add the three new cases to the switch statement (before the `default` case):

  ```ts
      case "ApplyForJob": {
        applyForJob(command.jobId, next, config, economy, events);
        break;
      }
      case "RequestRaise": {
        requestRaise(next, config, economy, events);
        break;
      }
      case "QuitJob": {
        quitJob(next, events);
        break;
      }
  ```

- [ ] **Step 5: Run hire tests**

  ```bash
  pnpm test packages/core/test/hire.test.ts --reporter=verbose
  ```

  Expected: all hire tests pass.

- [ ] **Step 6: Run full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests pass (no regressions).

- [ ] **Step 7: Commit**

  ```bash
  git add packages/core/src/hire.ts packages/core/test/hire.test.ts packages/core/src/reduce.ts
  git commit -m "feat(core): add ApplyForJob, RequestRaise, QuitJob commands and hire.ts"
  ```

---

## Task 6: Exports and integration test extension

**Files:**
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/integration.game.test.ts`

- [ ] **Step 1: Update `packages/core/src/index.ts`**

  Full replacement:

  ```ts
  export * from "./rng.js";
  export * from "./types.js";
  export * from "./setup.js";
  export * from "./goals.js";
  export * from "./travel.js";
  export * from "./reduce.js";
  export * from "./work.js";
  export * from "./turn.js";
  export * from "./economy.js";
  export * from "./hire.js";
  ```

- [ ] **Step 2: Add the employment integration test to `packages/core/test/integration.game.test.ts`**

  Add a new `describe` block after the existing `describe("headless game", ...)`:

  ```ts
  import { defaultConfig } from "@jones/config";
  import { createInitialGame } from "../src/setup.js";
  import { reduce } from "../src/reduce.js";
  import type { Command, GameState, GameEvent } from "../src/types.js";

  // (existing imports and describe block unchanged)

  describe("employment flow", () => {
    it("solo player can hire at Employment Office and earn money at work", () => {
      // Commands:
      //  TravelTo employmentOffice (ringIndex 7 from 0: steps=6, hours=6*(10/13)≈4.6)
      //  EnterBuilding (cost=2)
      //  ApplyForJob "monolithBurgers.cook" (alwaysApproved; cost=4)
      //  ExitBuilding (free)
      //  TravelTo monolithBurgers (ringIndex 3 from 7: steps=4, hours=4*(10/13)≈3.1)
      //  EnterBuilding (cost=2)
      //  Work (cost=6, earn 8*wage=8*5=40)
      //  EndTurn
      const cmds: Command[] = [
        { type: "TravelTo", locationId: "employmentOffice" },
        { type: "EnterBuilding" },
        { type: "ApplyForJob", jobId: "monolithBurgers.cook" },
        { type: "ExitBuilding" },
        { type: "TravelTo", locationId: "monolithBurgers" },
        { type: "EnterBuilding" },
        { type: "Work" },
        { type: "EndTurn" },
      ];

      let state = createInitialGame(defaultConfig, 42, [
        { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
      ]);
      const allEvents: GameEvent[] = [];
      for (const cmd of cmds) {
        const result = reduce(state, cmd, defaultConfig);
        state = result.state;
        allEvents.push(...result.events);
      }

      // Player has the Cook job and earned money.
      expect(state.players[0].jobId).toBe("monolithBurgers.cook");
      expect(state.players[0].cash).toBeGreaterThan(200);

      // Week advanced to 2 after EndTurn (solo game wraps immediately).
      expect(state.week).toBe(2);

      // DynamicEconomy fired at the week boundary: EconomyUpdated event was emitted.
      expect(allEvents.some((e) => e.type === "EconomyUpdated")).toBe(true);

      // JobApplied was emitted during the hiring step.
      expect(allEvents.some((e) => e.type === "JobApplied" && e.jobId === "monolithBurgers.cook")).toBe(true);
    });
  });
  ```

- [ ] **Step 3: Run the full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests pass including the new integration test.

- [ ] **Step 4: Typecheck both packages**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/core/src/index.ts packages/core/test/integration.game.test.ts
  git commit -m "feat(core): export economy/hire modules; add employment integration test"
  ```

---

## Self-Review

**Spec coverage check:**
- [x] §5 Economy state: `economy: { index, reading }` replaces `economyReading` → Task 2
- [x] EconomyConfig / defaultEconomyConfig / constantEconomyConfig → Task 1
- [x] DynamicEconomy adjustedPrice formula → Task 3
- [x] DynamicEconomy step: index walk, reading drift, crash check, boom check → Task 3
- [x] Crash effects: Minor/Moderate/Major, fire/wage-cut/happiness → Task 3 (`applyCrashEffects`)
- [x] ConstantEconomy: no RNG, no events, returns 0s → Task 3
- [x] Economy wired into `advanceTurn` at week boundary → Task 4
- [x] `raisesReceived` in PlayerState → Task 2
- [x] ApplyForJob: location guard, hour cost, stat gates (week 1–4 dep suppression), luck roll, hire effects → Task 5
- [x] RequestRaise: guards, no-higher-offer, dep gate, approval → Task 5
- [x] QuitJob: guard, clear job/wage/raises, happiness penalty → Task 5
- [x] New Command/GameEvent union variants → Task 2
- [x] Exports → Task 6
- [x] Integration test: hire + work + economy step → Task 6
- [x] `constantEconomyConfig` used in all hire tests → Task 5 (via `testConfig`)

**Open items for implementer (from design spec):**
1. Cross-check DynamicEconomy index/reading algorithm against Java port's `EconomyManager`
2. Cross-check `QuitJob` happiness penalty (−2) against Java port
3. Cross-check Boom check (no reading threshold) against Java port
