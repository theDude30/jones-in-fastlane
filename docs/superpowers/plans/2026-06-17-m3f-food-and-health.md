# M3f — Food & Health Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the missing food/health cluster of the start-of-turn sequence (Cooking Bonus, Hot Tub relaxation exemption, Spoiled Food, Starvation, Doctor Visit) and the entirely-missing `Relax` player command, fixing the `happyGroupsThisTurn`-never-resets bug that the new code depends on, all in `@jones/core`/`@jones/config` only.

**Architecture:** A new `packages/core/src/health.ts` module holds all new logic: a small `ownsDurableType` helper, the `applyFoodAndHealth` start-of-turn step (called from `turn.ts`'s `advanceTurn`, after the win check, same place `applyDueDates` is already called), and the new `relax` command handler (wired into `reduce.ts`'s switch). `turn.ts`'s existing `applyStartOfWeek` (which runs *before* the win check) gains three new lines for the bug fix + Cooking Bonus + Hot Tub exemption.

**Tech Stack:** TypeScript (strict, `moduleResolution: Bundler`), pnpm workspaces, Vitest. Run `pnpm test` and `pnpm typecheck` from the repo root.

## Global Constraints

- This plan touches `packages/config` and `packages/core` only — no `@jones/ai` or `@jones/game` changes (see design spec's Non-Goals).
- `config.actionCosts.relax` **already exists** (value `6`) — added when `ActionCosts` was first scaffolded, never consumed until now. Do not add a new "relax hours" constant; use this existing field.
- New `GameConstants` fields (exact names/values, all in `packages/config/src/types.ts` + `packages/config/src/constants.ts`): `relaxAmount: 3`, `maxRelaxation: 50`, `freshFoodFridgeCapacity: 6`, `freshFoodFreezerBonus: 6` (total capacity with both Fridge+Freezer = 12), `starvationHoursLost: 20`, `doctorHoursLost: 10`.
- Doctor Visit trigger probabilities (exact, from the spec): Starvation 25% (`< 0.25`), Spoiled Food 50% (`< 0.5`), Relaxation exactly 10 → 20% (`< 0.2`). At most one visit per turn even if multiple conditions are eligible — roll only as many as needed (stop once one triggers; this is a deliberate implementation choice since the player-visible outcome is identical either way, documented in code).
- Doctor Visit cost tiers (exact, from the spec): `cash >= 500` → random `$30–$200`; `cash >= 50` (and `< 500`) → random `$30–$50`; `cash >= 31` (and `< 50`) → random `$30–cash`; `cash <= 30` (and `> 0`) → exactly `cash` (no roll). Visit requires `cash > 0`; if `cash === 0`, no visit even if a roll succeeds.
- RNG threading follows the existing pattern in `packages/core/src/hire.ts`: `const r = nextFloat(state.rng); state.rng = r.state;` (or `nextInt` for integer ranges) — never reuse a stale `RngState`.
- Durable-type checks key off the existing `DurableType` union (`"refrigerator" | "freezer" | "stove" | "microwave" | "hotTub" | ...`) and the existing already-owned-durable lookup pattern in `packages/core/src/shopping.ts:25-30` (`config.items.find((i) => i.id === d.itemId)?.durableType`).
- `Relax` is legal only when `p.insideBuilding && p.locationId === p.apartmentId` (the player's *actual* current apartment — this is correct regardless of the separate, already-filed `locationId`/`apartmentId` reset bug, since `Relax`'s check compares against `apartmentId` directly, not the buggy reset value).

---

## File map

| Action | File | Responsibility |
|--------|------|-----------------|
| Modify | `packages/config/src/types.ts` | add 6 new `GameConstants` fields |
| Modify | `packages/config/src/constants.ts` | set the 6 new constants' values |
| Modify | `packages/config/test/constants.test.ts` (or create if absent) | verify the new constants exist with correct values |
| Create | `packages/core/src/health.ts` | `ownsDurableType`, `applyFoodAndHealth`, `relax` |
| Modify | `packages/core/src/turn.ts` | `happyGroupsThisTurn` reset, Cooking Bonus, Hot Tub exemption (in `applyStartOfWeek`); wire `applyFoodAndHealth` into `advanceTurn` |
| Modify | `packages/core/src/types.ts` | add `Relax` Command variant; add `FoodSpoiled`/`PlayerStarved`/`DoctorVisited`/`Relaxed` GameEvent variants |
| Modify | `packages/core/src/reduce.ts` | wire `case "Relax"` |
| Modify | `packages/core/src/index.ts` | add `export * from "./health.js";` |
| Create | `packages/core/test/food-health.test.ts` | all new unit + integration tests |
| Modify | `packages/core/test/turn.test.ts` | one-line fix for a regression Starvation introduces in an existing test |

---

## Task 1: Config constants

**Files:**
- Modify: `packages/config/src/types.ts`
- Modify: `packages/config/src/constants.ts`
- Modify or create: `packages/config/test/constants.test.ts`

**Interfaces:**
- Produces: `GameConstants.relaxAmount: number`, `GameConstants.maxRelaxation: number`, `GameConstants.freshFoodFridgeCapacity: number`, `GameConstants.freshFoodFreezerBonus: number`, `GameConstants.starvationHoursLost: number`, `GameConstants.doctorHoursLost: number`. Tasks 2–5 read these via `config.constants.<name>`.

- [ ] **Step 1: Check whether `packages/config/test/constants.test.ts` already exists**

Run: `ls packages/config/test/`

If it exists, read it first so your new test fits the existing file's style; if not, you'll create it fresh in Step 3.

- [ ] **Step 2: Add the six new fields to `GameConstants` in `packages/config/src/types.ts`**

Find the `GameConstants` interface (it ends with `rentExtensionChances: number[];`). Add these six lines immediately before the interface's closing `}`:

```ts
  relaxAmount: number;            // 3   §2 — Relax action: +3 Relaxation per use
  maxRelaxation: number;          // 50  §12 — Relaxation cap (decay floor is separately 10)
  freshFoodFridgeCapacity: number; // 6  §11 — Fresh Food storage with a Refrigerator
  freshFoodFreezerBonus: number;   // 6  §11 — +6 capacity (total 12) if a Freezer is also owned
  starvationHoursLost: number;     // 20 §12 — Starvation start-of-turn Hours penalty
  doctorHoursLost: number;         // 10 §12 — Doctor Visit start-of-turn Hours penalty
```

- [ ] **Step 3: Write the failing test in `packages/config/test/constants.test.ts`**

If the file doesn't exist, create it with this content. If it exists, append the `describe` block.

```ts
import { describe, it, expect } from "vitest";
import { constants } from "../src/constants.js";

describe("food & health constants (M3f)", () => {
  it("defines the new constants with the spec's exact values", () => {
    expect(constants.relaxAmount).toBe(3);
    expect(constants.maxRelaxation).toBe(50);
    expect(constants.freshFoodFridgeCapacity).toBe(6);
    expect(constants.freshFoodFreezerBonus).toBe(6);
    expect(constants.starvationHoursLost).toBe(20);
    expect(constants.doctorHoursLost).toBe(10);
  });
});
```

- [ ] **Step 4: Run the test to confirm it fails**

Run: `pnpm test -- packages/config/test/constants.test.ts 2>&1 | tail -15`
Expected: FAIL — `constants.relaxAmount` is `undefined` (or a TypeScript compile error if the field doesn't exist on the type yet, which is also an acceptable "fails" signal here since Step 2 only added the type, not the value).

- [ ] **Step 5: Add the six new values to `packages/config/src/constants.ts`**

Add these six lines to the `constants` object (anywhere among the existing fields — e.g. right after `rentExtensionChances: [1.0, 0.75, 0.5, 0.25],`):

```ts
  relaxAmount: 3,
  maxRelaxation: 50,
  freshFoodFridgeCapacity: 6,
  freshFoodFreezerBonus: 6,
  starvationHoursLost: 20,
  doctorHoursLost: 10,
```

- [ ] **Step 6: Run the test and typecheck**

Run: `pnpm test -- packages/config/test/constants.test.ts 2>&1 | tail -10`
Expected: test passes.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/constants.ts packages/config/test/constants.test.ts
git commit -m "feat(config): add food & health constants for M3f"
```

---

## Task 2: `happyGroupsThisTurn` reset, Cooking Bonus, Hot Tub exemption

**Files:**
- Create: `packages/core/src/health.ts`
- Modify: `packages/core/src/turn.ts`
- Modify: `packages/core/src/index.ts`
- Create: `packages/core/test/food-health.test.ts`

**Interfaces:**
- Consumes: nothing new from Task 1 in this task (Cooking Bonus and Hot Tub don't need the new constants).
- Produces: `ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean`, exported from `packages/core/src/health.ts`. Tasks 3 and 4 import and reuse this exact function.

This is the most safety-critical task to get the *order* right: all three changes go inside `applyStartOfWeek`, which runs **before** the win check in `advanceTurn` (so a happiness gain here can complete a goal and win that same turn — this is spec-mandated, not incidental).

- [ ] **Step 1: Write the failing tests in `packages/core/test/food-health.test.ts`**

These tests call `applyStartOfWeek` directly (not through `reduce`/`EndTurn`) — it's a pure, already-exported function with no RNG involvement, so testing it in isolation avoids any dependency on turn-wrapping or randomness. (Later tasks add `describe` blocks to this same file that *do* need the full `reduce` pipeline — those are introduced in Tasks 3–5.)

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { applyStartOfWeek } from "../src/turn.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function soloGame(): GameState {
  return createInitialGame(testConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
}

describe("happyGroupsThisTurn reset (bug fix)", () => {
  it("resets to empty every start-of-week so a happiness-group item can grant its bonus again next turn", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happyGroupsThisTurn = ["fastFood"];
    applyStartOfWeek(p, testConfig);
    expect(p.happyGroupsThisTurn).toEqual([]);
  });
});

describe("Cooking Bonus", () => {
  it("grants +1 happiness if a Stove is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    p.durables = [{ itemId: "stoveZMart", pricePaid: 490 }];
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(6);
  });

  it("grants +1 happiness if a Microwave is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    p.durables = [{ itemId: "microwaveZMart", pricePaid: 220 }];
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(6);
  });

  it("caps at +1 total even if both Stove and Microwave are owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    p.durables = [
      { itemId: "stoveZMart", pricePaid: 490 },
      { itemId: "microwaveZMart", pricePaid: 220 },
    ];
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(6);
  });

  it("does not apply with no Stove or Microwave owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(5);
  });
});

describe("Hot Tub relaxation exemption", () => {
  it("relaxation does not decay below its current value when a Hot Tub is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.relaxation = 30;
    p.durables = [{ itemId: "hotTubSocket", pricePaid: 1255 }];
    applyStartOfWeek(p, testConfig);
    expect(p.relaxation).toBe(30);
  });

  it("relaxation still decays (floored at 10) without a Hot Tub", () => {
    const g = soloGame();
    const p = g.players[0];
    p.relaxation = 30;
    applyStartOfWeek(p, testConfig);
    expect(p.relaxation).toBe(29);
  });
});
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -30`
Expected: FAIL — `happyGroupsThisTurn` is not reset, Cooking Bonus doesn't exist, Hot Tub doesn't prevent decay (the "still decays without a Hot Tub" test currently passes already since that's existing behavior — only the Hot Tub-exemption and Cooking Bonus and reset tests should fail).

- [ ] **Step 3: Create `packages/core/src/health.ts`**

```ts
import type { DurableType, GameConfig } from "@jones/config";
import type { PlayerState } from "./types.js";

/** True if the player owns any durable of the given type (any store variant). */
export function ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean {
  return p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === durableType);
}
```

- [ ] **Step 4: Modify `packages/core/src/turn.ts`**

Add this import at the top of the file (alongside the existing imports):

```ts
import { ownsDurableType } from "./health.js";
```

Replace the `applyStartOfWeek` function body:

```ts
export function applyStartOfWeek(p: PlayerState, config: GameConfig): void {
  p.happyGroupsThisTurn = [];
  if (ownsDurableType(p, config, "stove") || ownsDurableType(p, config, "microwave")) {
    p.happiness += 1;
  }
  if (!ownsDurableType(p, config, "hotTub")) {
    p.relaxation = Math.max(10, p.relaxation - 1);
  }
  p.dependibility = Math.max(0, p.dependibility - config.constants.dependibilityDecayPerWeek);
  p.clothing.casual = Math.max(0, p.clothing.casual - 1);
  p.clothing.dress = Math.max(0, p.clothing.dress - 1);
  p.clothing.business = Math.max(0, p.clothing.business - 1);
  p.locationId = config.constants.homeLocationId;
  p.insideBuilding = false;
  p.brokerMenuOpen = false;
  p.hoursRemaining = config.constants.hoursPerTurn;
  p.rentExtensionUsedThisTurn = false;
}
```

- [ ] **Step 5: Add the export to `packages/core/src/index.ts`**

Add this line (anywhere among the existing `export * from` lines, e.g. at the end):

```ts
export * from "./health.js";
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -20`
Expected: all 7 tests pass.

Run: `pnpm test 2>&1 | tail -15`
Expected: the full suite still passes (no regressions in `packages/core/test/turn.test.ts` or elsewhere — that file's existing assertions don't involve durables, so Cooking Bonus/Hot Tub don't change its outcomes).

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/health.ts packages/core/src/turn.ts packages/core/src/index.ts packages/core/test/food-health.test.ts
git commit -m "fix(core): reset happyGroupsThisTurn per turn; add Cooking Bonus and Hot Tub relaxation exemption"
```

---

## Task 3: Spoiled Food, Starvation, and Doctor Visit

**Files:**
- Modify: `packages/core/src/health.ts`
- Modify: `packages/core/src/turn.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/test/food-health.test.ts`
- Modify: `packages/core/test/turn.test.ts` (fixes a guaranteed regression — see Step 6)

**Interfaces:**
- Consumes: `config.constants.freshFoodFridgeCapacity`, `freshFoodFreezerBonus`, `starvationHoursLost`, `doctorHoursLost` (Task 1); `ownsDurableType` (Task 2).
- Produces: `applyFoodAndHealth(p: PlayerState, state: GameState, config: GameConfig, events: GameEvent[]): void`, exported from `packages/core/src/health.ts`, called from `turn.ts`'s `advanceTurn`. New `GameEvent` variants `FoodSpoiled`, `PlayerStarved`, `DoctorVisited`.

This is the core of M3f. All three steps run together as one function, called **after** the win check (a player whose goals were already met before this turn's penalties apply still wins first).

- [ ] **Step 1: Add the new `GameEvent` variants to `packages/core/src/types.ts`**

Find the `GameEvent` union (it ends with `| { type: "LoanDefaulted"; ... }`). Add these three lines immediately before the union's closing `;`:

```ts
  | { type: "FoodSpoiled"; playerId: string; excess?: number }
  | { type: "PlayerStarved"; playerId: string; hoursLost: number }
  | { type: "DoctorVisited"; playerId: string; hoursLost: number; happinessCost: number; cost: number };
```

(Remove the semicolon from the previous last line, `LoanDefaulted`, since it's no longer the terminator — the new last line carries the `;`.)

- [ ] **Step 2: Write the failing tests — append to `packages/core/test/food-health.test.ts`**

Append these imports to the top of the file (alongside the existing ones):

```ts
import { reduce } from "../src/reduce.js";
import { applyFoodAndHealth } from "../src/health.js";
import type { GameEvent } from "../src/types.js";
```

**Spoiled Food and Starvation tests call `applyFoodAndHealth` directly** (not through `reduce`/`EndTurn`), for the same isolation reason as Task 2 — but `applyFoodAndHealth` *does* touch `state.rng` internally (for the Doctor Visit roll), and by default every test player is unfed with `relaxation === 10` (the initial value), so a Doctor Visit could otherwise randomly fire and contaminate the happiness/hours assertions these tests are making. Each test below sets `p.cash = 0` to neutralize this deterministically: Doctor Visit's `cash > 0` gate blocks every visible effect regardless of whether its internal roll succeeds, so these tests stay exact and seed-independent. (The dedicated "Doctor Visit" tests further down are the ones that *want* a visit, and use a seed-finder against the real `reduce`/`EndTurn` pipeline instead.)

Append these `describe` blocks at the end of the file:

```ts
describe("Spoiled Food", () => {
  it("loses all Fresh Food and -2 happiness with no Refrigerator", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 3;
    p.happiness = 10;
    p.cash = 0;
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.freshFood).toBe(0);
    expect(p.happiness).toBe(8);
    expect(events.some((e) => e.type === "FoodSpoiled")).toBe(true);
  });

  it("does not spoil within capacity (6) when a Refrigerator is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 5;
    p.happiness = 10;
    p.cash = 0;
    p.durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    // 1 unit consumed by Starvation-prevention afterward, but no spoilage/over-capacity loss.
    expect(p.happiness).toBe(10);
    expect(events.some((e) => e.type === "FoodSpoiled")).toBe(false);
  });

  it("loses excess over capacity (-1 happiness) when over a Refrigerator's 6-unit cap", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 9;
    p.happiness = 10;
    p.cash = 0;
    p.durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.happiness).toBe(9);
    expect(events.some((e) => e.type === "FoodSpoiled" && e.excess === 3)).toBe(true);
  });

  it("capacity is 12 with both Refrigerator and Freezer", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 11;
    p.happiness = 10;
    p.cash = 0;
    p.durables = [
      { itemId: "refrigeratorZMart", pricePaid: 650 },
      { itemId: "freezerSocket", pricePaid: 513 },
    ];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    // 11 is within the 12-unit cap, no over-capacity loss; 1 consumed by Starvation-prevention.
    expect(p.happiness).toBe(10);
    expect(events.some((e) => e.type === "FoodSpoiled")).toBe(false);
  });
});

describe("Starvation", () => {
  it("loses 20 hours and -2 happiness when not fed (no fast or fresh food)", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 10;
    p.cash = 0;
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.hoursRemaining).toBe(40);
    expect(p.happiness).toBe(8);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(true);
  });

  it("is prevented by Fast Food bought last turn, which is then cleared", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 10;
    p.cash = 0;
    p.fastFood = 1;
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.hoursRemaining).toBe(60);
    expect(p.happiness).toBe(10);
    expect(p.fastFood).toBe(0);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(false);
  });

  it("is prevented by Fresh Food + Refrigerator, consuming 1 unit", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 10;
    p.cash = 0;
    p.freshFood = 2;
    p.durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.hoursRemaining).toBe(60);
    expect(p.freshFood).toBe(1);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(false);
  });
});

/**
 * Finds the first game seed in 0..999 where a Doctor Visit fires within
 * `maxTurns` turns of a single-player game that never buys food. Used
 * because the RNG draws for Doctor Visit are conditional (only rolled
 * when a trigger condition is true), so seed-finding must simulate real
 * turns via `reduce`, not a single nextFloat call.
 */
function findSeedForDoctorVisitWithin(maxTurns: number): number {
  for (let s = 0; s <= 999; s++) {
    let g: GameState = createInitialGame(testConfig, s, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    for (let t = 0; t < maxTurns; t++) {
      const { state, events } = reduce(g, { type: "EndTurn" }, testConfig);
      g = state;
      if (events.some((e) => e.type === "DoctorVisited")) return s;
    }
  }
  throw new Error(`no seed found producing a Doctor Visit within ${maxTurns} turns`);
}

/** Finds a game seed where turn 1 alone (full reduce/EndTurn pipeline) produces no Doctor Visit, for a "no visit" negative test. */
function findSeedForNoDoctorVisit(): number {
  for (let s = 0; s <= 999; s++) {
    const g: GameState = createInitialGame(testConfig, s, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const { events } = reduce(g, { type: "EndTurn" }, testConfig);
    if (!events.some((e) => e.type === "DoctorVisited")) return s;
  }
  throw new Error("no seed found avoiding a Doctor Visit on turn 1");
}

describe("Doctor Visit", () => {
  it("triggers within a few turns of never eating (relaxation sits at the decay floor of 10)", () => {
    const seed = findSeedForDoctorVisitWithin(10);
    const g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const startingHappiness = g.players[0].happiness; // 0 by default (createInitialGame)
    let visited = false;
    let lastState = g;
    for (let t = 0; t < 10 && !visited; t++) {
      const { state, events } = reduce(lastState, { type: "EndTurn" }, testConfig);
      lastState = state;
      if (events.some((e) => e.type === "DoctorVisited")) visited = true;
    }
    expect(visited).toBe(true);
    // Happiness actually eroded from its starting value (Starvation -2/turn, Doctor Visit -4)
    // — not just "is below some arbitrary number," since happiness starts at 0, not 20.
    expect(lastState.players[0].happiness).toBeLessThan(startingHappiness);
  });

  it("never visits when cash is 0, even though a trigger condition is eligible", () => {
    const seed = findSeedForDoctorVisitWithin(1); // a seed where turn-1 alone would trigger a visit
    const g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    g.players[0].cash = 0;
    const { events } = reduce(g, { type: "EndTurn" }, testConfig);
    expect(events.some((e) => e.type === "DoctorVisited")).toBe(false);
  });

  it("can avoid a visit on turn 1 for at least one seed (rolls aren't unconditional)", () => {
    const seed = findSeedForNoDoctorVisit();
    const g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const { events } = reduce(g, { type: "EndTurn" }, testConfig);
    expect(events.some((e) => e.type === "DoctorVisited")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -40`
Expected: FAIL — `applyFoodAndHealth` doesn't exist yet; Spoiled Food/Starvation/Doctor Visit tests all fail (Starvation's hours-loss assertions will see `60` instead of `40`, etc.).

- [ ] **Step 4: Append `applyFoodAndHealth` to `packages/core/src/health.ts`**

Add these imports at the top of the file (replacing the existing import lines with this expanded set):

```ts
import type { DurableType, GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { nextFloat, nextInt } from "./rng.js";
```

Append this function at the end of the file:

```ts
/**
 * Start-of-turn food/health processing (§12), called after the win check.
 * Order: Spoiled Food, then Starvation, then Doctor Visit (each can feed
 * into the next: spoilage can cause starvation; either can trigger a
 * Doctor Visit, alongside Relaxation sitting at its decay floor of 10).
 */
export function applyFoodAndHealth(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
): void {
  // Spoiled Food.
  let spoiledThisTurn = false;
  if (!ownsDurableType(p, config, "refrigerator")) {
    if (p.freshFood > 0) {
      p.freshFood = 0;
      p.happiness -= 2;
      spoiledThisTurn = true;
      events.push({ type: "FoodSpoiled", playerId: p.id });
    }
  } else {
    const capacity =
      config.constants.freshFoodFridgeCapacity +
      (ownsDurableType(p, config, "freezer") ? config.constants.freshFoodFreezerBonus : 0);
    if (p.freshFood > capacity) {
      const excess = p.freshFood - capacity;
      p.freshFood = capacity;
      p.happiness -= 1;
      events.push({ type: "FoodSpoiled", playerId: p.id, excess });
    }
  }

  // Starvation: fed via a fridge-stored fresh food unit, or via fast food bought last turn.
  let fed = false;
  if (ownsDurableType(p, config, "refrigerator") && p.freshFood > 0) {
    p.freshFood -= 1;
    fed = true;
  } else if (p.fastFood > 0) {
    fed = true;
  }
  let starvedThisTurn = false;
  if (!fed) {
    p.hoursRemaining = Math.max(0, p.hoursRemaining - config.constants.starvationHoursLost);
    p.happiness -= 2;
    starvedThisTurn = true;
    events.push({ type: "PlayerStarved", playerId: p.id, hoursLost: config.constants.starvationHoursLost });
  }
  p.fastFood = 0;

  // Doctor Visit: up to three independent rolls; at most one visit. Rolls
  // only as many conditions as needed — stops once one triggers, since
  // the player-visible outcome (one visit, or none) is the same either way.
  let triggered = false;
  if (starvedThisTurn) {
    const r = nextFloat(state.rng);
    state.rng = r.state;
    if (r.value < 0.25) triggered = true;
  }
  if (!triggered && spoiledThisTurn) {
    const r = nextFloat(state.rng);
    state.rng = r.state;
    if (r.value < 0.5) triggered = true;
  }
  if (!triggered && p.relaxation === 10) {
    const r = nextFloat(state.rng);
    state.rng = r.state;
    if (r.value < 0.2) triggered = true;
  }

  if (triggered && p.cash > 0) {
    p.hoursRemaining = Math.max(0, p.hoursRemaining - config.constants.doctorHoursLost);
    p.happiness -= 4;
    let cost: number;
    if (p.cash >= 500) {
      const r = nextInt(state.rng, 30, 200);
      state.rng = r.state;
      cost = r.value;
    } else if (p.cash >= 50) {
      const r = nextInt(state.rng, 30, 50);
      state.rng = r.state;
      cost = r.value;
    } else if (p.cash >= 31) {
      const r = nextInt(state.rng, 30, p.cash);
      state.rng = r.state;
      cost = r.value;
    } else {
      cost = p.cash;
    }
    p.cash -= cost;
    events.push({
      type: "DoctorVisited",
      playerId: p.id,
      hoursLost: config.constants.doctorHoursLost,
      happinessCost: 4,
      cost,
    });
  }
}
```

- [ ] **Step 5: Wire `applyFoodAndHealth` into `turn.ts`'s `advanceTurn`**

Change the import line added in Task 2:

```ts
import { ownsDurableType } from "./health.js";
```

to:

```ts
import { applyFoodAndHealth, ownsDurableType } from "./health.js";
```

Find this block at the end of `advanceTurn`:

```ts
  } else {
    applyDueDates(upNext, state, config, events);
  }
```

Replace it with:

```ts
  } else {
    applyDueDates(upNext, state, config, events);
    applyFoodAndHealth(upNext, state, config, events);
  }
```

- [ ] **Step 6: Fix a guaranteed regression in `packages/core/test/turn.test.ts`**

That file's existing "advances the week and applies per-week effects when wrapping" test never gives player A any food, so once `applyFoodAndHealth` is wired in, Starvation will now fire for player A on the wrap turn (`hoursRemaining` would become `40`, not the currently-asserted `60`). Fix the test's setup, not the new logic — Starvation firing there is the new, correct behavior; the test just needs to declare that player A ate.

Find this test:

```ts
  it("advances the week and applies per-week effects when wrapping", () => {
    const g = soloGame();
    g.players[0].relaxation = 10;
    g.players[0].dependibility = 20;
    g.players[0].clothing.casual = 6;
```

Add one line so it reads:

```ts
  it("advances the week and applies per-week effects when wrapping", () => {
    const g = soloGame();
    g.players[0].relaxation = 10;
    g.players[0].dependibility = 20;
    g.players[0].clothing.casual = 6;
    g.players[0].fastFood = 1; // avoid Starvation so this test's other assertions stay isolated
```

Nothing else in that test needs to change: `fastFood` is consumed and cleared by `applyFoodAndHealth` exactly once (during the wrap), and the test doesn't assert on `fastFood`, `happiness`, or any other field this touches.

- [ ] **Step 7: Run the tests and typecheck**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -40`
Expected: all tests in the file pass (7 from Task 2 + the new Spoiled Food / Starvation / Doctor Visit tests).

Run: `pnpm test 2>&1 | tail -15`
Expected: the full suite still passes, including the now-fixed `packages/core/test/turn.test.ts`.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/health.ts packages/core/src/turn.ts packages/core/src/types.ts packages/core/test/food-health.test.ts packages/core/test/turn.test.ts
git commit -m "feat(core): add Spoiled Food, Starvation, and Doctor Visit start-of-turn processing"
```

---

## Task 4: The `Relax` command

**Files:**
- Modify: `packages/core/src/health.ts`
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/reduce.ts`
- Modify: `packages/core/test/food-health.test.ts`

**Interfaces:**
- Consumes: `config.actionCosts.relax` (already exists), `config.constants.relaxAmount`/`maxRelaxation` (Task 1).
- Produces: `relax(state: GameState, config: GameConfig, events: GameEvent[]): void`, exported from `packages/core/src/health.ts`, wired into `reduce.ts` as `case "Relax"`. New `Command` variant `{ type: "Relax" }`, new `GameEvent` variant `Relaxed`.

- [ ] **Step 1: Add the `Relax` Command variant and `Relaxed` GameEvent variant to `packages/core/src/types.ts`**

Find the `Command` union (it ends with `| { type: "PayLoan" };`). Change that line's terminator and add the new variant:

```ts
  | { type: "PayLoan" }
  | { type: "Relax" };
```

Find the `GameEvent` union (it now ends with the `DoctorVisited` line you added in Task 3). Change that line's terminator and add the new variant:

```ts
  | { type: "DoctorVisited"; playerId: string; hoursLost: number; happinessCost: number; cost: number }
  | { type: "Relaxed"; playerId: string; relaxation: number; happinessGained: number };
```

- [ ] **Step 2: Write the failing tests — append to `packages/core/test/food-health.test.ts`**

```ts
describe("Relax command", () => {
  it("restores relaxation (capped at 50) and costs 6 hours at the player's own apartment", () => {
    const g = soloGame();
    g.players[0].locationId = g.players[0].apartmentId;
    g.players[0].insideBuilding = true;
    g.players[0].relaxation = 10;
    const { state, events } = reduce(g, { type: "Relax" }, testConfig);
    expect(state.players[0].relaxation).toBe(13);
    expect(state.players[0].hoursRemaining).toBe(54);
    expect(events.some((e) => e.type === "Relaxed")).toBe(true);
  });

  it("caps relaxation at 50", () => {
    const g = soloGame();
    g.players[0].locationId = g.players[0].apartmentId;
    g.players[0].insideBuilding = true;
    g.players[0].relaxation = 49;
    const { state } = reduce(g, { type: "Relax" }, testConfig);
    expect(state.players[0].relaxation).toBe(50);
  });

  it("is illegal outside the player's own apartment", () => {
    const g = soloGame();
    g.players[0].locationId = "zMart";
    g.players[0].insideBuilding = true;
    const { events } = reduce(g, { type: "Relax" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("is illegal when not inside a building", () => {
    const g = soloGame();
    g.players[0].locationId = g.players[0].apartmentId;
    g.players[0].insideBuilding = false;
    const { events } = reduce(g, { type: "Relax" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("grants +2 happiness only the first time per turn", () => {
    const g = soloGame();
    g.players[0].locationId = g.players[0].apartmentId;
    g.players[0].insideBuilding = true;
    g.players[0].happiness = 5;
    const first = reduce(g, { type: "Relax" }, testConfig);
    expect(first.state.players[0].happiness).toBe(7);
    const second = reduce(first.state, { type: "Relax" }, testConfig);
    expect(second.state.players[0].happiness).toBe(7); // no further gain this turn
  });

  it("emits NotEnoughTime when hours are insufficient", () => {
    const g = soloGame();
    g.players[0].locationId = g.players[0].apartmentId;
    g.players[0].insideBuilding = true;
    g.players[0].hoursRemaining = 5;
    const { events } = reduce(g, { type: "Relax" }, testConfig);
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });
});
```

- [ ] **Step 3: Run the tests to confirm they fail**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -30`
Expected: FAIL — `Relax` is unhandled (falls through `reduce.ts`'s `default` case, producing `InvalidAction` with reason `unhandled command Relax`, so the legality tests may accidentally pass for the wrong reason — focus on the relaxation/happiness/hours assertions, which will fail since nothing changes).

- [ ] **Step 4: Append `relax` to `packages/core/src/health.ts`**

```ts
/** §2 Relax — only at the player's own apartment; restores Relaxation, first-per-turn happiness. */
export function relax(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];

  if (!p.insideBuilding || p.locationId !== p.apartmentId) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "must be at your own apartment" });
    return;
  }
  if (config.actionCosts.relax > p.hoursRemaining) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "Relax" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.relax;
  p.relaxation = Math.min(config.constants.maxRelaxation, p.relaxation + config.constants.relaxAmount);

  let happinessGained = 0;
  if (!p.happyGroupsThisTurn.includes("relax")) {
    happinessGained = 2;
    p.happiness += happinessGained;
    p.happyGroupsThisTurn.push("relax");
  }

  events.push({ type: "Relaxed", playerId: p.id, relaxation: p.relaxation, happinessGained });
}
```

- [ ] **Step 5: Wire `case "Relax"` into `packages/core/src/reduce.ts`**

Add `relax` to the existing health import (added in earlier tasks via `index.ts`'s re-export — but `reduce.ts` imports directly from specific modules, matching its existing style, so add a new import line):

```ts
import { relax } from "./health.js";
```

Find the `case "Work":` block (it ends with `break;\n    }` after the line `events.push({ type: "Worked", playerId: p.id, earned });`). Immediately after that block's closing `}`, insert:

```ts
    case "Relax": {
      relax(next, config, events);
      break;
    }
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -30`
Expected: all tests in the file pass.

Run: `pnpm test 2>&1 | tail -15`
Expected: the full suite still passes.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/health.ts packages/core/src/types.ts packages/core/src/reduce.ts packages/core/test/food-health.test.ts
git commit -m "feat(core): add the Relax command"
```

---

## Task 5: Integration verification, AI re-check, and README update

**Files:**
- Modify: `packages/core/test/food-health.test.ts`
- Modify: `README.md`

- [ ] **Step 1: Append an integration test to `packages/core/test/food-health.test.ts`**

```ts
describe("Food & Health integration", () => {
  it("a player who never eats erodes hours/happiness over several turns and eventually sees a Doctor Visit", () => {
    const seed = findSeedForDoctorVisitWithin(10);
    let g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const startingHappiness = g.players[0].happiness;
    let sawStarvation = false;
    let sawDoctorVisit = false;
    let state = g;
    for (let t = 0; t < 10; t++) {
      const r = reduce(state, { type: "EndTurn" }, testConfig);
      state = r.state;
      if (r.events.some((e) => e.type === "PlayerStarved")) sawStarvation = true;
      if (r.events.some((e) => e.type === "DoctorVisited")) sawDoctorVisit = true;
    }
    expect(sawStarvation).toBe(true);
    expect(sawDoctorVisit).toBe(true);
    expect(state.players[0].happiness).toBeLessThan(startingHappiness);
  });
});
```

- [ ] **Step 2: Run the new test and the full suite**

Run: `pnpm test -- packages/core/test/food-health.test.ts 2>&1 | tail -10`
Expected: all tests in the file pass.

Run: `pnpm test 2>&1 | tail -20`
Expected: every test passes. Note the exact `Tests` count from the output for Step 5.

- [ ] **Step 3: Re-verify `@jones/ai`'s long-horizon integration tests still pass unmodified**

Run: `pnpm test -- packages/ai/test/integration.ai.test.ts 2>&1 | tail -20`
Expected: all 4 tests still pass. These run 60–300 week headless games with `RandomPlanner`/`GreedyPlanner`, neither of which is taught to buy food or `Relax` in this plan — they'll now organically experience Starvation/Doctor Visits, which should not break determinism, termination, or the "greedy out-progresses random" comparison (none of those assertions depend on food/health specifically). If any of these 4 tests fail, do not weaken the assertions — investigate whether the new mechanics introduced a real bug (e.g. an unbounded loop, a negative stat) and fix the mechanic, not the test.

- [ ] **Step 4: Run typecheck**

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 5: Update `README.md`**

In the phase table, add a new row immediately after the `M3 — AI players` row:

```diff
 | **M3 — AI players** | Complete | `@jones/ai` package: `RandomPlanner` + `GreedyPlanner` agents play full games headlessly through the existing `reduce` interface. Difficulty presets (easy/medium/hard) via config. |
+| **M3f — Food & Health** | Complete | Cooking Bonus, Hot Tub relaxation exemption, Spoiled Food, Starvation, Doctor Visit, and the new `Relax` command — fills in the start-of-turn sequence's food/health cluster. |
 | **M4a — State bridge & app shell** | Complete | `@jones/game` package: Zustand store bridges the UI to `@jones/core`'s `reduce`; a minimal debug screen proves the full human command-dispatch loop end-to-end. No board art, AI, or styling yet. |
```

Update the sentence below the table:

```diff
-M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), and M4a are complete. Plans are in
+M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), M3f, and M4a are complete. Plans are in
 [`docs/superpowers/plans/`](docs/superpowers/plans/).
```

Update the `## Status` section, replacing the test count with the actual count from Step 2's `pnpm test` output:

```diff
-M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), and M4a are complete — 40 item types, full financial subsystem, rent/housing mechanics, wage garnishment, a shared pawn shop, loan repayment, automatic rent/loan due-date processing, headless AI opponents (random + greedy planners), and a working `@jones/game` state bridge with a debug command-dispatch loop. 248 tests passing.
+M1, M2, M3a, M3b, M3c, M3d, M3e, M3 (AI players), M3f, and M4a are complete — 40 item types, full financial subsystem, rent/housing mechanics, wage garnishment, a shared pawn shop, loan repayment, automatic rent/loan due-date processing, headless AI opponents (random + greedy planners), Cooking Bonus/Starvation/Spoiled Food/Doctor Visit/Relax, and a working `@jones/game` state bridge with a debug command-dispatch loop. <N> tests passing.
```

Replace `<N>` with the real count from Step 2.

- [ ] **Step 6: Commit**

```bash
git add packages/core/test/food-health.test.ts README.md
git commit -m "test(core): food & health integration test; docs: mark M3f complete in README"
```

---

## Self-review notes

- **Spec coverage:** Design spec's Goals 1–6 → Task 3 (Goals 1, 2, 5: Starvation/Spoiled Food/Doctor Visit), Task 2 (Goal 3: Cooking Bonus, Hot Tub; Goal 6: `happyGroupsThisTurn` reset), Task 4 (Goal 4: `Relax`). Non-Goals (Weekend/Lottery/Computer Profits/Wild Willy/Appliance Repair/Donations, AI changes, UI changes, the unrelated `locationId`/`apartmentId` bug) are respected by construction — no task touches `packages/ai`, `packages/game`, or those other mechanics.
- **Type consistency:** `applyFoodAndHealth(p, state, config, events)` signature is defined once in Task 3 and called identically from `turn.ts`. `relax(state, config, events)` matches the calling convention of every other `reduce.ts`-dispatched command handler (e.g. `payRent(state, config, events)` in `housing.ts`). `ownsDurableType(p, config, durableType)` is defined once in Task 2 and reused identically in Task 3 (twice) without redefinition.
- **No placeholders:** every step has complete code and exact commands with expected output, including the brute-force seed-finder tests for the conditional Doctor Visit RNG (following the existing `findSeedForRoll`-style pattern already used in `packages/core/test/hire.test.ts`).
- **Ordering correctness:** Cooking Bonus/Hot Tub/`happyGroupsThisTurn` reset are in `applyStartOfWeek` (pre-win-check); Spoiled Food/Starvation/Doctor Visit are in the new `applyFoodAndHealth` (post-win-check, alongside `applyDueDates`) — matching the spec's exact step ordering relative to the win check.
- **Test isolation fix (caught in self-review):** Task 2's and Task 3's unit tests call `applyStartOfWeek`/`applyFoodAndHealth` directly instead of routing through two `reduce`/`EndTurn` calls. The original draft used a two-player wraparound helper, which meant Task 2's Cooking Bonus/Hot Tub tests — and an *existing* test in `turn.test.ts` — would have silently broken once Task 3's Starvation (which fires by default, since no test player buys food) and Doctor Visit (which is live by default, since `relaxation` starts at the same value as its decay floor, 10) landed in the same code path. Direct calls plus an explicit `cash = 0` guard in the Spoiled Food/Starvation tests neutralize this without weakening any assertion; Task 3 Step 6 fixes the one pre-existing test that the new Starvation logic genuinely changes the behavior of.
