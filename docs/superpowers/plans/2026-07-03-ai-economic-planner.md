# AI Economic Planner (BudgetPlanner) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@jones/ai`'s `GreedyPlanner` with a `BudgetPlanner` — a budgeted priority ladder that reliably wins the game (eats, pays rent, maintains health, holds a job, finishes 2 degrees, and grows wealth) instead of starving and drowning in rent debt.

**Architecture:** Every `nextCommand` call re-derives a `TurnBudget` (cash reservations for rent/food/uniform) from the current `GameState`, then walks a fixed, ordered list of "rung" functions — each a pure `(ctx: TurnContext) => Command | null` — returning the first non-null command. No plan is stored between calls, so the planner self-heals after shocks (garnishment, doctor visits, denied applications) for free.

**Tech Stack:** TypeScript, Vitest, pnpm workspaces (`@jones/config`, `@jones/core`, `@jones/ai`).

## Global Constraints

- Spec: `docs/superpowers/specs/2026-07-03-ai-economic-planner-design.md`. Follow it exactly; this plan implements it task-by-task.
- Success bar: hard preset (`epsilon: 0`), solo game, default goals `{ wealth: 30, happiness: 30, education: 19, career: 30 }` → **≥ 90% of 40 seeds end via a `PlayerWon` event**, median winning week ≤ 80. Verified in Task 9.
- Essentials-only repertoire: `TravelTo`, `EnterBuilding`, `ExitBuilding`, `Work`, `ApplyForJob`, `Enroll`, `Study`, `BuyItem`, `PayRent`, `Relax`, `EndTurn`, plus the inherited emergency fallback (`PawnItem` / `SellTBill` / `SellStock` via `OpenBroker`). Never emit `RequestRaise`, `QuitJob`, `Deposit`, `Withdraw`, `ApplyLoan`, `PayLoan`, `BuyStock`, `BuyTBill`, `BuyLotteryTickets`, `RequestRentExtension`, `SwitchApartment`, `RedeemItem`, `BuyPawnedItem`.
- `GreedyPlanner` is deleted. Presets become: easy = `{ planner: "random", epsilon: 0 }`, medium = `{ planner: "budget", epsilon: 0.15 }`, hard = `{ planner: "budget", epsilon: 0 }`. `weights`/`GoalWeights` are removed from `@jones/config` entirely.
- Determinism: the planner's only internal state is a mistake-roll RNG seed. Same seed twice → identical event streams.
- Key constants (`packages/config/src/constants.ts`): `hoursPerTurn: 60`, `weeksPerMonth: 4`, `initialCash: 200`, `initialDependibility: 20`, `initialCasualWeeks: 6`, `dependibilityDecayPerWeek: 3`, `homeLocationId: "lowCostHousing"` (`baseRent: 325`), `starvationHoursLost: 20`, `doctorHoursLost: 10`, `maxWeeks: 156`.
- Action costs (`packages/config/src/actionCosts.ts`): `enterLocation: 2`, `work: 6`, `relax: 6`, `study: 6`, `applyJob: 4`.
- Goal formulas (`packages/core/src/goals.ts`): `wealth = floor((cash + bank) / 100)`; `happiness` is the raw stat (ratchets — no weekly decay); `education = 1 + 9 * degrees.length`; `career = jobId === null ? 0 : floor(1.25 * dependibility)`.
- Run tests with `pnpm --filter @jones/ai test` / `pnpm --filter @jones/config test` from the repo root, or the root `pnpm test` for the whole workspace. Typecheck with the root `pnpm typecheck`.

---

### Task 1: Shared AI test helper + navigation extraction (`nav.ts`)

**Files:**
- Create: `packages/ai/test/testHelpers.ts`
- Create: `packages/ai/src/nav.ts`
- Create: `packages/ai/test/nav.test.ts`
- Modify: `packages/ai/test/selectors.test.ts` (use the shared helper instead of its local `solo()`)

**Interfaces:**
- Produces: `solo(config: GameConfig, goals?: GoalTargets): GameState` (test helper); `navigateInto(p: PlayerState, locationId: string, config: GameConfig): Command | null`; `goBuy(p: PlayerState, locationId: string, itemId: ItemId, config: GameConfig): Command | null`.

- [ ] **Step 1: Write the shared test helper**

```typescript
// packages/ai/test/testHelpers.ts
import type { GameConfig } from "@jones/config";
import { createInitialGame } from "@jones/core";
import type { GameState, GoalTargets } from "@jones/core";

const DEFAULT_GOALS: GoalTargets = { wealth: 100, happiness: 100, education: 100, career: 100 };

/**
 * A fresh solo game, reset to a pristine turn-1 baseline. createInitialGame
 * runs one start-of-turn pass (decay, food/health) on seat 0 at creation, so
 * this restores exactly what that pass can touch — including the RNG state,
 * whose Doctor Visit roll can consume a draw that would otherwise shift any
 * seed-calibrated luck roll a test makes afterward.
 */
export function solo(config: GameConfig, goals: GoalTargets = DEFAULT_GOALS): GameState {
  const g = createInitialGame(config, 1, [{ name: "A", isAI: true, goals }]);
  const c = config.constants;
  const p = g.players[0];
  p.hoursRemaining = c.hoursPerTurn;
  p.happiness = 0;
  p.cash = c.initialCash;
  p.relaxation = c.initialRelaxation;
  p.dependibility = c.initialDependibility;
  p.clothing = { casual: c.initialCasualWeeks, dress: 0, business: 0 };
  g.rng = { seed: 1 };
  return g;
}
```

- [ ] **Step 2: Write the failing nav.ts tests**

```typescript
// packages/ai/test/nav.test.ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { reduce } from "@jones/core";
import { navigateInto, goBuy } from "../src/nav.js";
import { solo } from "./testHelpers.js";

describe("navigateInto", () => {
  it("returns TravelTo when outside and at a different location", () => {
    const s = solo(defaultConfig);
    expect(navigateInto(s.players[0], "zMart", defaultConfig)).toEqual({ type: "TravelTo", locationId: "zMart" });
  });

  it("returns EnterBuilding once at the location but outside", () => {
    const s = solo(defaultConfig);
    const { state } = reduce(s, { type: "TravelTo", locationId: "zMart" }, defaultConfig);
    expect(navigateInto(state.players[0], "zMart", defaultConfig)).toEqual({ type: "EnterBuilding" });
  });

  it("returns null once inside the target location", () => {
    const s = solo(defaultConfig);
    let state = reduce(s, { type: "TravelTo", locationId: "zMart" }, defaultConfig).state;
    state = reduce(state, { type: "EnterBuilding" }, defaultConfig).state;
    expect(navigateInto(state.players[0], "zMart", defaultConfig)).toBeNull();
  });

  it("exits first when inside a different building than the target", () => {
    const s = solo(defaultConfig);
    let state = reduce(s, { type: "TravelTo", locationId: "zMart" }, defaultConfig).state;
    state = reduce(state, { type: "EnterBuilding" }, defaultConfig).state;
    expect(navigateInto(state.players[0], "bank", defaultConfig)).toEqual({ type: "ExitBuilding" });
  });

  it("returns null when there aren't enough hours to travel", () => {
    const s = solo(defaultConfig);
    s.players[0].hoursRemaining = 0;
    expect(navigateInto(s.players[0], "bank", defaultConfig)).toBeNull();
  });
});

describe("goBuy", () => {
  it("navigates first, then buys once at the location and inside", () => {
    const s = solo(defaultConfig);
    let state = s;
    let cmd = goBuy(state.players[0], "zMart", "casualClothesZMart", defaultConfig);
    expect(cmd).toEqual({ type: "TravelTo", locationId: "zMart" });
    state = reduce(state, cmd!, defaultConfig).state;

    cmd = goBuy(state.players[0], "zMart", "casualClothesZMart", defaultConfig);
    expect(cmd).toEqual({ type: "EnterBuilding" });
    state = reduce(state, cmd!, defaultConfig).state;

    cmd = goBuy(state.players[0], "zMart", "casualClothesZMart", defaultConfig);
    expect(cmd).toEqual({ type: "BuyItem", itemId: "casualClothesZMart" });
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- nav.test.ts`
Expected: FAIL — `Cannot find module '../src/nav.js'`

- [ ] **Step 4: Implement nav.ts**

```typescript
// packages/ai/src/nav.ts
import { travelHours } from "@jones/core";
import type { Command, PlayerState } from "@jones/core";
import type { GameConfig, ItemId } from "@jones/config";
import { atLocation, hasHours, isInside } from "./selectors.js";

/**
 * Returns the next navigation command needed to be INSIDE `locationId`,
 * or null when already inside it. Returns null (infeasible) when a required
 * step can't be afforded.
 */
export function navigateInto(p: PlayerState, locationId: string, config: GameConfig): Command | null {
  if (!atLocation(p, locationId)) {
    if (isInside(p)) return { type: "ExitBuilding" };
    const cost = travelHours(config, p.locationId, locationId);
    if (!hasHours(p, cost)) return null;
    return { type: "TravelTo", locationId };
  }
  if (!isInside(p)) {
    if (!hasHours(p, config.actionCosts.enterLocation)) return null;
    return { type: "EnterBuilding" };
  }
  return null;
}

/** Navigate to `locationId`, then buy `itemId` once inside. */
export function goBuy(p: PlayerState, locationId: string, itemId: ItemId, config: GameConfig): Command | null {
  const nav = navigateInto(p, locationId, config);
  if (nav) return nav;
  if (!atLocation(p, locationId) || !isInside(p)) return null;
  return { type: "BuyItem", itemId };
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- nav.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 6: Point selectors.test.ts at the shared helper**

In `packages/ai/test/selectors.test.ts`, replace the local `solo()` function and its import with the shared one:

```typescript
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { reduce } from "@jones/core";
import type { GameState, PlayerState } from "@jones/core";
import { findPlayer, weakestGoal, canAfford, hasHours, atLocation, isInside, legalCommands } from "../src/selectors.js";
import { solo } from "./testHelpers.js";
```

Delete the old `import { createInitialGame } from "@jones/core";` line and the old `function solo(): GameState { ... }` block (lines 3 and 7–26 in the original file) — both are replaced by the imports above. Replace every call-site `solo()` with `solo(defaultConfig)`. Delete the now-redundant `import { legalCommands } from "../src/selectors.js";` / `import { reduce } from "@jones/core";` lines further down the file (already covered by the merged imports above).

- [ ] **Step 7: Run the full ai test suite to verify nothing broke**

Run: `pnpm --filter @jones/ai test`
Expected: PASS, same test count as before plus the 6 new `nav.test.ts` tests

- [ ] **Step 8: Commit**

```bash
git add packages/ai/test/testHelpers.ts packages/ai/src/nav.ts packages/ai/test/nav.test.ts packages/ai/test/selectors.test.ts
git commit -m "feat(ai): extract navigateInto/goBuy and a shared test helper

Prep for the BudgetPlanner rewrite: pulls the navigation logic greedy.ts
already had correct out into its own module, and de-duplicates the
per-file solo() test fixture."
```

---

### Task 2: Turn budget (`budget.ts`)

**Files:**
- Create: `packages/ai/src/budget.ts`
- Create: `packages/ai/test/budget.test.ts`

**Interfaces:**
- Consumes: `canAfford`, `hasHours` from `./selectors.js` (unchanged); `ownsDurableType`, `findJob` from `@jones/core`.
- Produces: `PLANNER_TUNING` (const object with `weeklyBuffer`, `happinessBuffer`, `wageUpgradeThreshold`, `relaxationThreshold`, `rentPayHorizonWeeks`, `rentReserveHorizonWeeks`, `fridgeLowWaterWeeks`, `clothingLowWaterWeeks`); `adjustedItemPrice(item: ItemDef, state: GameState, economy: Economy): number`; `affordableItems(p: PlayerState, state: GameState, config: GameConfig, economy: Economy, predicate: (item: ItemDef) => boolean): Array<{ item: ItemDef; price: number }>`; `TurnBudget` interface (`rentReserve`, `foodReserve`, `uniformReserve`, `cashFloor`, `discretionary`, all `number`); `computeBudget(p: PlayerState, state: GameState, config: GameConfig, economy: Economy): TurnBudget`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/ai/test/budget.test.ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { makeEconomy } from "@jones/core";
import { computeBudget, adjustedItemPrice, affordableItems, PLANNER_TUNING } from "../src/budget.js";
import { solo } from "./testHelpers.js";

const economy = makeEconomy(defaultConfig);

describe("adjustedItemPrice", () => {
  it("returns the base price at reading 0 (fresh game)", () => {
    const item = defaultConfig.items.find((i) => i.id === "fries")!;
    const s = solo(defaultConfig);
    expect(adjustedItemPrice(item, s, economy)).toBe(65);
  });
});

describe("affordableItems", () => {
  it("filters by predicate and affordability, at fresh-game cash ($200)", () => {
    const s = solo(defaultConfig);
    const casual = affordableItems(s.players[0], s, defaultConfig, economy, (it) => it.clothingCategory === "casual");
    expect(casual.map((c) => c.item.id).sort()).toEqual(["casualClothesQT", "casualClothesZMart"]);
  });

  it("excludes items the player can't afford", () => {
    const s = solo(defaultConfig);
    s.players[0].cash = 30; // below even the cheapest casual (casualClothesZMart, $35)
    const casual = affordableItems(s.players[0], s, defaultConfig, economy, (it) => it.clothingCategory === "casual");
    expect(casual).toEqual([]);
  });
});

describe("computeBudget", () => {
  it("fresh game: no rent reserve (due in 3 weeks), cheapest fastFood + casual uniform reserved", () => {
    const s = solo(defaultConfig);
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    // rentDueWeek starts at 4, week is 1 -> 4-1=3 > rentReserveHorizonWeeks (2) -> no reserve
    expect(budget.rentReserve).toBe(0);
    expect(budget.foodReserve).toBe(65); // cheapest fastFood: fries
    expect(budget.uniformReserve).toBe(35); // cheapest casual: casualClothesZMart
    expect(budget.cashFloor).toBe(0 + 65 + 35 + PLANNER_TUNING.weeklyBuffer); // 150
    expect(budget.discretionary).toBe(50); // cash 200 - cashFloor 150
  });

  it("reserves rent once due within the reserve horizon", () => {
    const s = solo(defaultConfig);
    s.week = 3; // rentDueWeek (4) - week (3) = 1 <= horizon (2)
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    expect(budget.rentReserve).toBe(325);
  });

  it("reserves the cheapest fresh-food restock once a fridge is owned", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    expect(budget.foodReserve).toBe(55); // cheapest freshFood: freshFood1Wk
  });

  it("reserves the job's uniform level instead of casual once employed", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "zMart.assistantManager"; // uniform: "dress"
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    expect(budget.uniformReserve).toBe(90); // cheapest dress: dressClothesZMart
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- budget.test.ts`
Expected: FAIL — `Cannot find module '../src/budget.js'`

- [ ] **Step 3: Implement budget.ts**

```typescript
// packages/ai/src/budget.ts
import { ownsDurableType, findJob } from "@jones/core";
import type { Economy, GameState, PlayerState } from "@jones/core";
import type { GameConfig, ItemDef, UniformLevel } from "@jones/config";
import { canAfford } from "./selectors.js";

export const PLANNER_TUNING = {
  weeklyBuffer: 50,
  happinessBuffer: 2,
  wageUpgradeThreshold: 2,
  relaxationThreshold: 12,
  rentPayHorizonWeeks: 1,
  rentReserveHorizonWeeks: 2,
  fridgeLowWaterWeeks: 1,
  clothingLowWaterWeeks: 1,
} as const;

export function adjustedItemPrice(item: ItemDef, state: GameState, economy: Economy): number {
  return item.fixedPrice ? item.basePrice : economy.adjustedPrice(item.basePrice, state.economy.reading);
}

export function affordableItems(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  predicate: (item: ItemDef) => boolean,
): Array<{ item: ItemDef; price: number }> {
  return config.items
    .filter(predicate)
    .map((item) => ({ item, price: adjustedItemPrice(item, state, economy) }))
    .filter(({ price }) => canAfford(p, price));
}

export interface TurnBudget {
  rentReserve: number;
  foodReserve: number;
  uniformReserve: number;
  cashFloor: number;
  discretionary: number;
}

export function computeBudget(p: PlayerState, state: GameState, config: GameConfig, economy: Economy): TurnBudget {
  const rentReserve =
    p.rentDueWeek - state.week <= PLANNER_TUNING.rentReserveHorizonWeeks ? p.currentRent : 0;

  const hasFridge = ownsDurableType(p, config, "refrigerator");
  const foodCandidates = hasFridge
    ? affordableItems(p, state, config, economy, (it) => it.category === "freshFood")
    : affordableItems(p, state, config, economy, (it) => it.category === "fastFood");
  const foodReserve = foodCandidates.length > 0 ? Math.min(...foodCandidates.map((c) => c.price)) : 0;

  const requiredLevel: UniformLevel = p.jobId !== null ? findJob(config, p.jobId).uniform : "casual";
  const uniformCandidates = affordableItems(p, state, config, economy, (it) => it.clothingCategory === requiredLevel);
  const uniformReserve = uniformCandidates.length > 0 ? Math.min(...uniformCandidates.map((c) => c.price)) : 0;

  const cashFloor = rentReserve + foodReserve + uniformReserve + PLANNER_TUNING.weeklyBuffer;
  const discretionary = Math.max(0, p.cash - cashFloor);

  return { rentReserve, foodReserve, uniformReserve, cashFloor, discretionary };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- budget.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/budget.ts packages/ai/test/budget.test.ts
git commit -m "feat(ai): add TurnBudget — cash reservations for rent/food/uniform"
```

---

### Task 3: Emergency liquidity fallback (`fallback.ts`)

**Files:**
- Create: `packages/ai/src/fallback.ts`
- Create: `packages/ai/test/fallback.test.ts`

**Interfaces:**
- Consumes: `navigateInto` from `./nav.js`; `atLocation`, `isInside` from `./selectors.js`.
- Produces: `emergencyLiquidity(p: PlayerState, state: GameState, config: GameConfig): Command | null`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/ai/test/fallback.test.ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { emergencyLiquidity } from "../src/fallback.js";
import { solo } from "./testHelpers.js";

describe("emergencyLiquidity", () => {
  it("returns null with nothing to liquidate", () => {
    const s = solo(defaultConfig);
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toBeNull();
  });

  it("navigates to the pawn shop first when a durable is owned but not there yet", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "TravelTo", locationId: "pawnShop" });
  });

  it("pawns the durable once at the pawn shop", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "PawnItem", itemId: "refrigeratorSocket" });
  });

  it("skips a durable type that's already pawned state-wide, falls through to T-bills", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    s.pawnedItems = [
      { itemId: "refrigeratorZMart", durableType: "refrigerator", pricePaid: 650, pawnedByPlayerId: "p1", pawnedWeek: 1 },
    ];
    s.players[0].tBills = 2;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "TravelTo", locationId: "bank" });
  });

  it("opens the broker before selling a T-bill", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].tBills = 1;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "OpenBroker" });
  });

  it("sells a T-bill once the broker is open", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].brokerMenuOpen = true;
    s.players[0].tBills = 2;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "SellTBill" });
  });

  it("sells a stock when there's nothing to pawn and no T-bills", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].brokerMenuOpen = true;
    s.players[0].stocks.gold = 3;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "SellStock", stockId: "gold" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- fallback.test.ts`
Expected: FAIL — `Cannot find module '../src/fallback.js'`

- [ ] **Step 3: Implement fallback.ts**

```typescript
// packages/ai/src/fallback.ts
import type { Command, GameState, PlayerState } from "@jones/core";
import type { GameConfig } from "@jones/config";
import { atLocation, isInside } from "./selectors.js";
import { navigateInto } from "./nav.js";

/**
 * Last resort, tried only when no rung on the ladder returns a command:
 * raise emergency cash by pawning a durable, else selling a T-bill, else
 * selling a stock. Returns null when there's truly nothing left to
 * liquidate.
 */
export function emergencyLiquidity(p: PlayerState, state: GameState, config: GameConfig): Command | null {
  const pawnable = p.durables.find((d) => {
    const durableType = config.items.find((i) => i.id === d.itemId)?.durableType;
    return durableType !== undefined && !state.pawnedItems.some((pi) => pi.durableType === durableType);
  });
  if (pawnable) {
    const nav = navigateInto(p, "pawnShop", config);
    if (nav) return nav;
    if (!atLocation(p, "pawnShop") || !isInside(p)) return null;
    return { type: "PawnItem", itemId: pawnable.itemId };
  }

  if (p.tBills > 0) {
    const nav = navigateInto(p, "bank", config);
    if (nav) return nav;
    if (!atLocation(p, "bank") || !isInside(p)) return null;
    if (!p.brokerMenuOpen) return { type: "OpenBroker" };
    return { type: "SellTBill" };
  }

  const ownedStock = config.stocks.find((s) => p.stocks[s.id] > 0);
  if (ownedStock) {
    const nav = navigateInto(p, "bank", config);
    if (nav) return nav;
    if (!atLocation(p, "bank") || !isInside(p)) return null;
    if (!p.brokerMenuOpen) return { type: "OpenBroker" };
    return { type: "SellStock", stockId: ownedStock.id };
  }

  return null;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- fallback.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/fallback.ts packages/ai/test/fallback.test.ts
git commit -m "feat(ai): add emergencyLiquidity fallback (pawn/sell)"
```

---

### Task 4: Ladder part A — survival rungs (eat, rent, clothes, health)

**Files:**
- Create: `packages/ai/src/rungs.ts`
- Create: `packages/ai/test/rungs.test.ts`

**Interfaces:**
- Consumes: `TurnBudget`, `PLANNER_TUNING`, `adjustedItemPrice` from `./budget.js`; `goBuy`, `navigateInto` from `./nav.js`; `atLocation`, `isInside`, `hasHours`, `canAfford` from `./selectors.js`; `ownsDurableType`, `bestUniform`, `meetsUniform`, `findJob` from `@jones/core`.
- Produces: `TurnContext` interface (`state: GameState`, `player: PlayerState`, `config: GameConfig`, `economy: Economy`, `budget: TurnBudget`); rung functions `eatRung`, `rentRung`, `clothesRung`, `healthRung`, each `(ctx: TurnContext) => Command | null`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/ai/test/rungs.test.ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { makeEconomy } from "@jones/core";
import type { GameState } from "@jones/core";
import { computeBudget } from "../src/budget.js";
import { eatRung, rentRung, clothesRung, healthRung } from "../src/rungs.js";
import type { TurnContext } from "../src/rungs.js";
import { solo } from "./testHelpers.js";

const economy = makeEconomy(defaultConfig);

function ctxFor(state: GameState): TurnContext {
  return { state, player: state.players[0], config: defaultConfig, economy, budget: computeBudget(state.players[0], state, defaultConfig, economy) };
}

describe("eatRung", () => {
  it("buys fries when unfridged and out of fast food", () => {
    const s = solo(defaultConfig);
    expect(eatRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "monolithBurgers" });
  });

  it("does nothing once fast food is stocked", () => {
    const s = solo(defaultConfig);
    s.players[0].fastFood = 1;
    expect(eatRung(ctxFor(s))).toBeNull();
  });

  it("restocks the 4-week fresh-food pack when fridged and low", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    s.players[0].freshFood = 0;
    s.players[0].locationId = "blacksMarket";
    s.players[0].insideBuilding = true;
    expect(eatRung(ctxFor(s))).toEqual({ type: "BuyItem", itemId: "freshFood4Wk" });
  });

  it("does nothing once fresh food is above the low-water mark", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    s.players[0].freshFood = 4;
    expect(eatRung(ctxFor(s))).toBeNull();
  });
});

describe("rentRung", () => {
  it("does nothing when rent isn't due soon", () => {
    const s = solo(defaultConfig); // rentDueWeek=4, week=1
    expect(rentRung(ctxFor(s))).toBeNull();
  });

  it("pays rent once due within the pay horizon and cash covers it", () => {
    const s = solo(defaultConfig);
    s.week = 3; // rentDueWeek(4) - week(3) = 1 <= horizon(1)
    expect(rentRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "rentOffice" });
  });

  it("pays once at the rent office", () => {
    const s = solo(defaultConfig);
    s.week = 3;
    s.players[0].locationId = "rentOffice";
    s.players[0].insideBuilding = true;
    expect(rentRung(ctxFor(s))).toEqual({ type: "PayRent" });
  });

  it("does nothing when due soon but unaffordable", () => {
    const s = solo(defaultConfig);
    s.week = 3;
    s.players[0].cash = 100;
    expect(rentRung(ctxFor(s))).toBeNull();
  });
});

describe("clothesRung", () => {
  it("does nothing with fresh starting casual clothing (6 weeks)", () => {
    const s = solo(defaultConfig);
    expect(clothesRung(ctxFor(s))).toBeNull();
  });

  it("buys the cheapest casual outfit once clothing is low, unemployed", () => {
    const s = solo(defaultConfig);
    s.players[0].clothing = { casual: 1, dress: 0, business: 0 };
    expect(clothesRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" });
  });

  it("targets the job's required uniform level once employed", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "zMart.assistantManager"; // uniform: "dress"
    s.players[0].clothing = { casual: 6, dress: 0, business: 0 };
    expect(clothesRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // dressClothesZMart, $90
  });
});

describe("healthRung", () => {
  it("enters the apartment first when at home but outside, relaxation at or below the threshold", () => {
    const s = solo(defaultConfig); // initialRelaxation=10 <= threshold 12; at lowCostHousing, outside
    expect(healthRung(ctxFor(s))).toEqual({ type: "EnterBuilding" });
  });

  it("relaxes once inside its own apartment", () => {
    const s = solo(defaultConfig);
    s.players[0].insideBuilding = true; // at lowCostHousing, inside
    expect(healthRung(ctxFor(s))).toEqual({ type: "Relax" });
  });

  it("does nothing once relaxation is above the threshold", () => {
    const s = solo(defaultConfig);
    s.players[0].relaxation = 20;
    expect(healthRung(ctxFor(s))).toBeNull();
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- rungs.test.ts`
Expected: FAIL — `Cannot find module '../src/rungs.js'`

- [ ] **Step 3: Implement rungs.ts (part A)**

```typescript
// packages/ai/src/rungs.ts
import { bestUniform, findJob, meetsUniform, ownsDurableType } from "@jones/core";
import type { Command, Economy, GameState, PlayerState } from "@jones/core";
import type { GameConfig, UniformLevel } from "@jones/config";
import { canAfford, hasHours } from "./selectors.js";
import { goBuy, navigateInto } from "./nav.js";
import { adjustedItemPrice, PLANNER_TUNING, type TurnBudget } from "./budget.js";

export interface TurnContext {
  state: GameState;
  player: PlayerState;
  config: GameConfig;
  economy: Economy;
  budget: TurnBudget;
}

/** Weeks left on whichever clothing category currently satisfies a uniform check. */
function uniformWeeksLeft(p: PlayerState): number {
  const best = bestUniform(p);
  return best === null ? 0 : p.clothing[best];
}

/** Rung 1: keep a week of food in reserve so the next start-of-week check doesn't starve. */
export function eatRung(ctx: TurnContext): Command | null {
  const { player: p, state, config, economy } = ctx;
  const hasFridge = ownsDurableType(p, config, "refrigerator");

  if (hasFridge) {
    if (p.freshFood > PLANNER_TUNING.fridgeLowWaterWeeks) return null;
    const candidates = config.items
      .filter((it) => it.category === "freshFood")
      .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
      .filter(({ price }) => canAfford(p, price))
      .sort((a, b) => (b.it.freshFoodWeeks ?? 0) - (a.it.freshFoodWeeks ?? 0) || a.price - b.price);
    if (candidates.length === 0) return null;
    return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
  }

  if (p.fastFood > 0) return null;
  const candidates = config.items
    .filter((it) => it.category === "fastFood")
    .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
    .filter(({ price }) => canAfford(p, price))
    .sort((a, b) => a.price - b.price);
  if (candidates.length === 0) return null;
  return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
}

/** Rung 2: pay rent proactively once its due date is within the pay horizon. */
export function rentRung(ctx: TurnContext): Command | null {
  const { player: p, state, config } = ctx;
  if (p.rentDueWeek - state.week > PLANNER_TUNING.rentPayHorizonWeeks) return null;
  if (!canAfford(p, p.currentRent)) return null;
  const nav = navigateInto(p, "rentOffice", config);
  if (nav) return nav;
  if (p.locationId !== "rentOffice" || !p.insideBuilding) return null;
  return { type: "PayRent" };
}

/** Rung 3: replace a lapsing uniform (job's required level, or casual if unemployed). */
export function clothesRung(ctx: TurnContext): Command | null {
  const { player: p, state, config, economy } = ctx;
  const requiredLevel: UniformLevel = p.jobId !== null ? findJob(config, p.jobId).uniform : "casual";
  if (meetsUniform(p, requiredLevel) && uniformWeeksLeft(p) > PLANNER_TUNING.clothingLowWaterWeeks) return null;

  const candidates = config.items
    .filter((it) => it.clothingCategory === requiredLevel)
    .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
    .filter(({ price }) => canAfford(p, price))
    .sort((a, b) => a.price - b.price);
  if (candidates.length === 0) return null;
  return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
}

/** Rung 4: relax at home before Relaxation bottoms out (which raises Doctor Visit odds). */
export function healthRung(ctx: TurnContext): Command | null {
  const { player: p, config } = ctx;
  if (p.relaxation > PLANNER_TUNING.relaxationThreshold) return null;
  const nav = navigateInto(p, p.apartmentId, config);
  if (nav) return nav;
  if (p.locationId !== p.apartmentId || !p.insideBuilding) return null;
  if (!hasHours(p, config.actionCosts.relax)) return null;
  return { type: "Relax" };
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- rungs.test.ts`
Expected: PASS (14 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/rungs.ts packages/ai/test/rungs.test.ts
git commit -m "feat(ai): ladder part A — eat, rent, clothes, health rungs"
```

---

### Task 5: Ladder part B — employment and work rungs

**Files:**
- Modify: `packages/ai/src/rungs.ts`
- Modify: `packages/ai/test/rungs.test.ts`

**Interfaces:**
- Consumes: `eligibleJobs` from `./selectors.js`; everything from Task 4.
- Produces: `employmentRung`, `depMaintenanceWorkRung`, `cashFloorWorkRung` (each `(ctx: TurnContext) => Command | null`); a module-private `workCommand(p: PlayerState, config: GameConfig): Command | null` helper shared by the two work rungs (and reused again in Task 6 by `wealthSweepRung`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/ai/test/rungs.test.ts`:

```typescript
import { employmentRung, depMaintenanceWorkRung, cashFloorWorkRung } from "../src/rungs.js";

describe("employmentRung", () => {
  it("applies for the best-paying eligible job when unemployed", () => {
    const s = solo(defaultConfig); // week 1: dep gate off, exp=10 qualifies several jobs
    // Best-paying eligible job at week 1, exp 10, no degrees: factory.janitor ($7/hr).
    expect(employmentRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "factory" });
  });

  it("applies once at the employment office", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "employmentOffice";
    s.players[0].insideBuilding = true;
    expect(employmentRung(ctxFor(s))).toEqual({ type: "ApplyForJob", jobId: "factory.janitor" });
  });

  it("does nothing when already employed and no worthwhile upgrade is eligible", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "factory.generalManager"; // top wage, nothing higher exists
    s.players[0].wage = 25;
    expect(employmentRung(ctxFor(s))).toBeNull();
  });
});

describe("depMaintenanceWorkRung", () => {
  it("does nothing without a job", () => {
    const s = solo(defaultConfig);
    expect(depMaintenanceWorkRung(ctxFor(s))).toBeNull();
  });

  it("does nothing when dependibility is already at its cap", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.maxDependibility = p.dependibility; // already at cap
    expect(depMaintenanceWorkRung(ctxFor(s))).toBeNull();
  });

  it("works toward the cap once employed and below it", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk"; // reqDependibility 10 -> maxDependibility becomes 20+10+0=30
    p.maxDependibility = 30;
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    expect(depMaintenanceWorkRung(ctxFor(s))).toEqual({ type: "Work" });
  });

  it("won't Work if the uniform isn't met (leaves it to clothesRung)", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.maxDependibility = 30;
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    p.clothing = { casual: 0, dress: 0, business: 0 };
    expect(depMaintenanceWorkRung(ctxFor(s))).toBeNull();
  });
});

describe("cashFloorWorkRung", () => {
  it("does nothing without a job", () => {
    const s = solo(defaultConfig);
    expect(cashFloorWorkRung(ctxFor(s))).toBeNull();
  });

  it("does nothing when cash already covers the floor", () => {
    const s = solo(defaultConfig); // cash 200, floor ~150 (see budget.test.ts)
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    expect(cashFloorWorkRung(ctxFor(s))).toBeNull();
  });

  it("works when cash is below the floor", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    p.cash = 50; // below the ~150 floor
    expect(cashFloorWorkRung(ctxFor(s))).toEqual({ type: "Work" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- rungs.test.ts`
Expected: FAIL — `employmentRung is not a function` (and similarly for the other two)

- [ ] **Step 3: Implement rungs.ts (part B)**

Append to `packages/ai/src/rungs.ts` (add the import first):

```typescript
import { eligibleJobs } from "./selectors.js";
```

```typescript
function uniformAffordable(ctx: TurnContext, level: UniformLevel): boolean {
  const { player: p, state, config, economy } = ctx;
  if (meetsUniform(p, level)) return true;
  return config.items.some(
    (it) => it.clothingCategory === level && canAfford(p, adjustedItemPrice(it, state, economy)),
  );
}

/** Rung 5: hold a job — apply when unemployed, or upgrade to a meaningfully better one. */
export function employmentRung(ctx: TurnContext): Command | null {
  const { player: p, state, config } = ctx;

  if (p.jobId === null) {
    const jobs = eligibleJobs(p, state, config);
    if (jobs.length === 0) return null;
    const best = jobs.reduce((a, b) => (b.baseWage > a.baseWage ? b : a));
    return applyForBest(p, config, best.id);
  }

  const current = findJob(config, p.jobId);
  const upgrade = eligibleJobs(p, state, config)
    .filter((j) => j.baseWage >= current.baseWage + PLANNER_TUNING.wageUpgradeThreshold)
    .filter((j) => uniformAffordable(ctx, j.uniform))
    .sort((a, b) => b.baseWage - a.baseWage)[0];
  if (!upgrade) return null;
  return applyForBest(p, config, upgrade.id);
}

function applyForBest(p: PlayerState, config: GameConfig, jobId: string): Command | null {
  const nav = navigateInto(p, "employmentOffice", config);
  if (nav) return nav;
  if (p.locationId !== "employmentOffice" || !p.insideBuilding) return null;
  if (!hasHours(p, config.actionCosts.applyJob)) return null;
  return { type: "ApplyForJob", jobId };
}

/** Shared by every work-issuing rung: navigate to the workplace and Work, or null if infeasible. */
function workCommand(p: PlayerState, config: GameConfig): Command | null {
  const job = findJob(config, p.jobId as string);
  if (!meetsUniform(p, job.uniform)) return null; // clothesRung owns fixing this
  const nav = navigateInto(p, job.locationId, config);
  if (nav) return nav;
  if (p.locationId !== job.locationId || !p.insideBuilding) return null;
  if (p.hoursRemaining <= 0) return null;
  if (p.dependibility < job.reqDependibility - 5) return null; // would just get fired
  return { type: "Work" };
}

/** Rung 6: offset the weekly dependibility decay so the career goal (needs dep >= 24) stays reachable. */
export function depMaintenanceWorkRung(ctx: TurnContext): Command | null {
  const { player: p, config } = ctx;
  if (p.jobId === null) return null;
  if (p.dependibility >= p.maxDependibility) return null;
  return workCommand(p, config);
}

/** Rung 7: earn back up to the cash floor before spending on tuition/happiness/wealth. */
export function cashFloorWorkRung(ctx: TurnContext): Command | null {
  const { player: p, config, budget } = ctx;
  if (p.jobId === null) return null;
  if (p.cash >= budget.cashFloor) return null;
  return workCommand(p, config);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- rungs.test.ts`
Expected: PASS (24 tests total)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/rungs.ts packages/ai/test/rungs.test.ts
git commit -m "feat(ai): ladder part B — employment and work rungs"
```

---

### Task 6: Ladder part C — education, happiness, wealth rungs

**Files:**
- Modify: `packages/ai/src/rungs.ts`
- Modify: `packages/ai/test/rungs.test.ts`

**Interfaces:**
- Consumes: `enrollableDegrees` from `./selectors.js`; `workCommand` (module-private, from Task 5); everything else from Tasks 4–5.
- Produces: `educationRung`, `happinessRung`, `wealthSweepRung` (each `(ctx: TurnContext) => Command | null`).

- [ ] **Step 1: Write the failing tests**

Append to `packages/ai/test/rungs.test.ts`:

```typescript
import { educationRung, happinessRung, wealthSweepRung } from "../src/rungs.js";

describe("educationRung", () => {
  it("does nothing once education 19 (2 degrees) is already met", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].degrees = ["juniorCollege", "tradeSchool"];
    expect(educationRung(ctxFor(s))).toBeNull();
  });

  it("heads to the university to enroll when below the education goal", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].cash = 5000;
    expect(educationRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "hiTechU" });
  });

  it("enrolls in a prereq-free degree once at the university", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].cash = 5000;
    s.players[0].locationId = "hiTechU";
    s.players[0].insideBuilding = true;
    expect(educationRung(ctxFor(s))).toEqual({ type: "Enroll", degreeId: "juniorCollege" });
  });

  it("studies an existing enrollment instead of enrolling again", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].locationId = "hiTechU";
    s.players[0].insideBuilding = true;
    s.players[0].enrollments = [{ degreeId: "juniorCollege", lessonsRemaining: 10 }];
    expect(educationRung(ctxFor(s))).toEqual({ type: "Study", degreeId: "juniorCollege" });
  });
});

describe("happinessRung", () => {
  it("does nothing once happiness already clears goal + buffer", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 10, education: 0, career: 0 });
    s.players[0].happiness = 13; // 10 + buffer(2) + 1
    expect(happinessRung(ctxFor(s))).toBeNull();
  });

  it("buys the microwave first (cheapest un-owned durable pump) when discretionary cash allows", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 30, education: 0, career: 0 });
    s.players[0].cash = 1000; // discretionary well above $220
    expect(happinessRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // microwaveZMart $220 < socketCity's $330
  });

  it("falls through to tickets once both durables are owned", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 30, education: 0, career: 0 });
    const p = s.players[0];
    p.cash = 1000;
    p.durables = [
      { itemId: "microwaveZMart", pricePaid: 220 },
      { itemId: "refrigeratorZMart", pricePaid: 650 },
    ];
    expect(happinessRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // tickets sold at zMart
  });

  it("does nothing when discretionary cash can't cover any happiness purchase", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 30, education: 0, career: 0 });
    s.players[0].cash = 0;
    expect(happinessRung(ctxFor(s))).toBeNull();
  });
});

describe("wealthSweepRung", () => {
  it("does nothing without a job", () => {
    const s = solo(defaultConfig, { wealth: 30, happiness: 0, education: 0, career: 0 });
    expect(wealthSweepRung(ctxFor(s))).toBeNull();
  });

  it("does nothing once the wealth goal is met", () => {
    const s = solo(defaultConfig, { wealth: 1, happiness: 0, education: 0, career: 0 });
    s.players[0].jobId = "zMart.clerk";
    expect(wealthSweepRung(ctxFor(s))).toBeNull(); // floor(200/100)=2 >= 1
  });

  it("works every remaining hour toward an unmet wealth goal", () => {
    const s = solo(defaultConfig, { wealth: 30, happiness: 0, education: 0, career: 0 });
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    expect(wealthSweepRung(ctxFor(s))).toEqual({ type: "Work" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- rungs.test.ts`
Expected: FAIL — `educationRung is not a function` (and similarly for the other two)

- [ ] **Step 3: Implement rungs.ts (part C)**

Append to `packages/ai/src/rungs.ts` (add the import first):

```typescript
import { enrollableDegrees } from "./selectors.js";
import type { DurableType } from "@jones/config";
```

```typescript
/** Rung 8: enroll/study toward the education goal (2 degrees by default). */
export function educationRung(ctx: TurnContext): Command | null {
  const { player: p, state, config, economy } = ctx;
  const eduScore = 1 + 9 * p.degrees.length;
  if (eduScore >= p.goals.education) return null;

  const nav = navigateInto(p, "hiTechU", config);
  if (nav) return nav;
  if (p.locationId !== "hiTechU" || !p.insideBuilding) return null;
  if (!hasHours(p, config.actionCosts.study)) return null;

  if (p.enrollments.length > 0) return { type: "Study", degreeId: p.enrollments[0].degreeId };

  const options = enrollableDegrees(p, state, config, economy);
  if (options.length === 0) return null;
  const preferred = options.find((id) => config.degrees.find((d) => d.id === id)!.prereqs.length === 0) ?? options[0];
  return { type: "Enroll", degreeId: preferred };
}

/** Rung 9: pump happiness (from discretionary cash only) toward goal + buffer. */
export function happinessRung(ctx: TurnContext): Command | null {
  const { player: p, state, config, economy, budget } = ctx;
  if (p.happiness >= p.goals.happiness + PLANNER_TUNING.happinessBuffer) return null;

  const durableTypes: DurableType[] = ["microwave", "refrigerator"];
  for (const durableType of durableTypes) {
    if (ownsDurableType(p, config, durableType)) continue;
    const candidates = config.items
      .filter((it) => it.durableType === durableType)
      .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
      .filter(({ price }) => price <= budget.discretionary)
      .sort((a, b) => a.price - b.price);
    if (candidates.length > 0) return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
  }

  const ticketCandidates = config.items
    .filter((it) => it.category === "ticket")
    .filter((it) => !it.happinessGroup || !p.happyGroupsThisTurn.includes(it.happinessGroup))
    .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
    .filter(({ price }) => price <= budget.discretionary)
    .sort((a, b) => (b.it.happinessOnBuy ?? 0) - (a.it.happinessOnBuy ?? 0) || a.price - b.price);
  if (ticketCandidates.length > 0) return goBuy(p, ticketCandidates[0].it.locationId, ticketCandidates[0].it.id, config);

  return null;
}

/** Rung 10: once survival/career/education/happiness are covered, work every remaining hour toward wealth. */
export function wealthSweepRung(ctx: TurnContext): Command | null {
  const { player: p, config } = ctx;
  if (p.jobId === null) return null;
  const wealthScore = Math.floor((p.cash + p.bank) / 100);
  if (wealthScore >= p.goals.wealth) return null;
  if (p.hoursRemaining <= 0) return null;
  return workCommand(p, config);
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- rungs.test.ts`
Expected: PASS (35 tests total)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/rungs.ts packages/ai/test/rungs.test.ts
git commit -m "feat(ai): ladder part C — education, happiness, wealth rungs"
```

---

### Task 7: BudgetPlanner (`planner.ts`)

**Files:**
- Create: `packages/ai/src/planner.ts`
- Create: `packages/ai/test/planner.test.ts`

**Interfaces:**
- Consumes: all 10 rung functions + `TurnContext` from `./rungs.js`; `computeBudget` from `./budget.js`; `emergencyLiquidity` from `./fallback.js`; `legalCommands`, `findPlayer` from `./selectors.js`; `Agent` from `./types.js`; `makeEconomy`, `nextFloat`, `nextInt` from `@jones/core`.
- Produces: `BudgetPlanner` class implementing `Agent`, constructed as `new BudgetPlanner(seed: number, preset: AIDifficultyPreset, config: GameConfig)`.

- [ ] **Step 1: Write the failing tests**

```typescript
// packages/ai/test/planner.test.ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import type { AIDifficultyPreset } from "@jones/config";
import { reduce } from "@jones/core";
import { BudgetPlanner } from "../src/planner.js";
import { solo } from "./testHelpers.js";

const HARD: AIDifficultyPreset = { planner: "budget", epsilon: 0 };

describe("BudgetPlanner", () => {
  // Note: survival rungs (eat/rent/clothes/health) and the employment rung
  // are unconditional safety nets — they fire regardless of whether the four
  // scored goals are already met (a met goal doesn't mean "stop eating").
  // "ends the turn" therefore requires every rung's own precondition to be
  // satisfied, not just the four goals.
  it("ends the turn when every rung's precondition is already satisfied", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.jobId = "factory.generalManager"; // wage far above anything eligibleJobs (at actual stats) could beat
    p.wage = 999;
    p.maxDependibility = p.dependibility; // at cap
    p.clothing = { casual: 0, dress: 0, business: 5 }; // meets the business uniform, above the low-water mark
    p.fastFood = 1; // fed for next week (no fridge owned)
    p.rentDueWeek = s.week + 10; // rent nowhere near due
    p.relaxation = 20; // above the relax threshold
    p.happiness = 5; // clears goal(0) + buffer(2)
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "EndTurn" });
  });

  it("secures food first from a fresh game", () => {
    const s = solo(defaultConfig);
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "TravelTo", locationId: "monolithBurgers" });
  });

  it("never produces InvalidAction over a full turn", () => {
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    let s = solo(defaultConfig);
    for (let i = 0; i < 40; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
      if (cmd.type === "EndTurn") break;
    }
  });

  it("epsilon=1 always takes a legal random action", () => {
    const preset: AIDifficultyPreset = { planner: "budget", epsilon: 1 };
    const planner = new BudgetPlanner(5, preset, defaultConfig);
    let s = solo(defaultConfig);
    for (let i = 0; i < 20; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = new BudgetPlanner(11, { planner: "budget", epsilon: 0.15 }, defaultConfig);
    const b = new BudgetPlanner(11, { planner: "budget", epsilon: 0.15 }, defaultConfig);
    const s = solo(defaultConfig);
    for (let i = 0; i < 20; i++) expect(a.nextCommand(s, "p0")).toEqual(b.nextCommand(s, "p0"));
  });

  it("falls back to emergency liquidity when every rung is dormant but a durable can be pawned", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.jobId = "factory.generalManager";
    p.wage = 999;
    p.maxDependibility = p.dependibility;
    p.clothing = { casual: 0, dress: 0, business: 5 };
    p.rentDueWeek = s.week + 10;
    p.relaxation = 20;
    p.happiness = 5;
    // Owning the refrigerator flips eatRung to fridge mode — keep it dormant
    // via freshFood, not fastFood.
    p.freshFood = 5;
    p.locationId = "pawnShop";
    p.insideBuilding = true;
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "PawnItem", itemId: "refrigeratorSocket" });
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `pnpm --filter @jones/ai test -- planner.test.ts`
Expected: FAIL — `Cannot find module '../src/planner.js'`

- [ ] **Step 3: Implement planner.ts**

```typescript
// packages/ai/src/planner.ts
import { makeEconomy, nextFloat, nextInt } from "@jones/core";
import type { Command, GameState, RngState } from "@jones/core";
import type { GameConfig, AIDifficultyPreset } from "@jones/config";
import type { Agent } from "./types.js";
import { findPlayer, legalCommands } from "./selectors.js";
import { computeBudget } from "./budget.js";
import { emergencyLiquidity } from "./fallback.js";
import {
  eatRung,
  rentRung,
  clothesRung,
  healthRung,
  employmentRung,
  depMaintenanceWorkRung,
  cashFloorWorkRung,
  educationRung,
  happinessRung,
  wealthSweepRung,
} from "./rungs.js";
import type { TurnContext } from "./rungs.js";

const LADDER: Array<(ctx: TurnContext) => Command | null> = [
  eatRung,
  rentRung,
  clothesRung,
  healthRung,
  employmentRung,
  depMaintenanceWorkRung,
  cashFloorWorkRung,
  educationRung,
  happinessRung,
  wealthSweepRung,
];

/** Budgeted priority ladder: re-derives a TurnBudget every call, walks a fixed rung order. */
export class BudgetPlanner implements Agent {
  private rng: RngState;
  constructor(
    seed: number,
    private readonly preset: AIDifficultyPreset,
    private readonly config: GameConfig,
  ) {
    this.rng = { seed };
  }

  nextCommand(state: GameState, playerId: string): Command {
    const p = findPlayer(state, playerId);

    if (this.preset.epsilon > 0) {
      const r = nextFloat(this.rng);
      this.rng = r.state;
      if (r.value < this.preset.epsilon) return this.randomLegal(state, playerId);
    }

    const economy = makeEconomy(this.config);
    const budget = computeBudget(p, state, this.config, economy);
    const ctx: TurnContext = { state, player: p, config: this.config, economy, budget };

    for (const rung of LADDER) {
      const cmd = rung(ctx);
      if (cmd) return cmd;
    }

    const liquidity = emergencyLiquidity(p, state, this.config);
    if (liquidity) return liquidity;
    return { type: "EndTurn" };
  }

  private randomLegal(state: GameState, playerId: string): Command {
    const legal = legalCommands(state, playerId, this.config);
    const r = nextInt(this.rng, 0, legal.length - 1);
    this.rng = r.state;
    return legal[r.value];
  }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `pnpm --filter @jones/ai test -- planner.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/planner.ts packages/ai/test/planner.test.ts
git commit -m "feat(ai): add BudgetPlanner — walks the rung ladder, falls back to emergency liquidity"
```

---

### Task 8: Cutover — wire BudgetPlanner into presets, delete GreedyPlanner

**Files:**
- Modify: `packages/config/src/types.ts` (remove `GoalWeights`, update `AIDifficultyPreset`)
- Modify: `packages/config/src/ai.ts`
- Modify: `packages/config/test/ai.test.ts`
- Modify: `packages/ai/src/agent.ts`
- Modify: `packages/ai/src/index.ts`
- Modify: `packages/ai/src/selectors.ts` (remove weights-dependent dead code)
- Modify: `packages/ai/test/selectors.test.ts` (remove the now-deleted `weakestGoal` coverage)
- Modify: `packages/ai/test/runner.test.ts` (fix the one `GreedyPlanner` assertion)
- Delete: `packages/ai/src/greedy.ts`
- Delete: `packages/ai/test/greedy.test.ts`

**Interfaces:**
- Produces: `aiDifficulty.medium/hard` now build `BudgetPlanner`s; `makeAgent` no longer references `GreedyPlanner`.

- [ ] **Step 1: Update `packages/config/src/types.ts`**

Remove the `GoalWeights` interface (lines 163–168) and replace the `AIDifficultyPreset` interface:

```typescript
export interface AIDifficultyPreset {
  planner: "budget" | "random";
  epsilon: number; // 0..1 mistake rate (budget only; ignored by random)
}
```

- [ ] **Step 2: Update `packages/config/src/ai.ts`**

```typescript
import type { AIDifficultyPreset } from "./types.js";

export const aiDifficulty: Record<"easy" | "medium" | "hard", AIDifficultyPreset> = {
  easy: { planner: "random", epsilon: 0 },
  medium: { planner: "budget", epsilon: 0.15 },
  hard: { planner: "budget", epsilon: 0 },
};
```

- [ ] **Step 3: Update `packages/config/test/ai.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { aiDifficulty } from "../src/index.js";

describe("aiDifficulty presets", () => {
  it("defines easy/medium/hard", () => {
    expect(Object.keys(aiDifficulty).sort()).toEqual(["easy", "hard", "medium"]);
  });

  it("easy is random, hard is budget with no mistakes", () => {
    expect(aiDifficulty.easy.planner).toBe("random");
    expect(aiDifficulty.hard.planner).toBe("budget");
    expect(aiDifficulty.hard.epsilon).toBe(0);
  });

  it("medium is budget with a positive mistake rate", () => {
    expect(aiDifficulty.medium.planner).toBe("budget");
    expect(aiDifficulty.medium.epsilon).toBeGreaterThan(0);
    expect(aiDifficulty.medium.epsilon).toBeLessThan(1);
  });
});
```

- [ ] **Step 4: Update `packages/ai/src/agent.ts`**

```typescript
import type { GameConfig, AIDifficultyPreset } from "@jones/config";
import type { Agent } from "./types.js";
import { RandomPlanner } from "./random.js";
import { BudgetPlanner } from "./planner.js";

/** Build an agent for a seat, deterministically seeded from the game seed + seat index. */
export function makeAgent(
  preset: AIDifficultyPreset,
  config: GameConfig,
  gameSeed: number,
  seatIndex: number,
): Agent {
  const seed = gameSeed * 1000 + seatIndex;
  return preset.planner === "random"
    ? new RandomPlanner(seed, config)
    : new BudgetPlanner(seed, preset, config);
}
```

- [ ] **Step 5: Update `packages/ai/src/index.ts`**

```typescript
export * from "./types.js";
export * from "./selectors.js";
export { RandomPlanner } from "./random.js";
export { BudgetPlanner } from "./planner.js";
export { makeAgent } from "./agent.js";
export { playGame } from "./runner.js";
export type { Seat, RunResult, RunOptions } from "./runner.js";
```

- [ ] **Step 6: Remove weights-dependent dead code from `packages/ai/src/selectors.ts`**

Delete the `GoalKey`/`GOAL_KEYS` declarations and the `rankedUnmetGoals`/`weakestGoal` functions (lines 6–7 and 15–31 in the original file). The file's `import { goalScores, ... }` line loses the now-unused `goalScores` import along with `GoalWeights` from `@jones/config`. The top of the file becomes:

```typescript
import { makeEconomy, travelHours, findJob, meetsUniform } from "@jones/core";
import type { GameState, PlayerState, Command, Economy } from "@jones/core";
import type { GameConfig } from "@jones/config";

export function findPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p;
}

export const canAfford = (p: PlayerState, cost: number): boolean => p.cash >= cost;
export const hasHours = (p: PlayerState, cost: number): boolean => p.hoursRemaining >= cost;
export const atLocation = (p: PlayerState, locationId: string): boolean => p.locationId === locationId;
export const isInside = (p: PlayerState): boolean => p.insideBuilding;

// ... legalCommands, eligibleJobs, enrollableDegrees unchanged below ...
```

Everything from `legalCommands` onward in the original file (starting at the `/** A conservative set of commands ... */` comment) is unchanged.

- [ ] **Step 7: Remove the deleted `weakestGoal` coverage from `packages/ai/test/selectors.test.ts`**

Delete the `import { ... weakestGoal ... }` reference (already merged in Task 1's Step 6 edit — just drop `weakestGoal` from that import list) and delete the entire `describe("weakestGoal", ...)` block.

- [ ] **Step 8: Fix the one `GreedyPlanner` assertion in `packages/ai/test/runner.test.ts`**

```typescript
describe("makeAgent", () => {
  it("builds a random agent for the easy preset and a budget agent otherwise", () => {
    const easy = makeAgent(aiDifficulty.easy, defaultConfig, 1, 0);
    const hard = makeAgent(aiDifficulty.hard, defaultConfig, 1, 0);
    expect(easy.constructor.name).toBe("RandomPlanner");
    expect(hard.constructor.name).toBe("BudgetPlanner");
  });
});
```

- [ ] **Step 9: Delete greedy.ts and its test**

```bash
git rm packages/ai/src/greedy.ts packages/ai/test/greedy.test.ts
```

- [ ] **Step 10: Typecheck and run the full test suite**

Run: `pnpm typecheck`
Expected: PASS, no errors

Run: `pnpm test`
Expected: PASS. (The pre-existing `integration.ai.test.ts` "poverty spiral" test may now fail or behave differently since it targeted `GreedyPlanner`'s specific starvation bug — this is expected and is fixed in Task 9, which rewrites that file. If any other pre-existing test in `integration.ai.test.ts` fails at this step, note it and proceed to Task 9, which replaces the whole file.)

- [ ] **Step 11: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/ai.ts packages/config/test/ai.test.ts \
        packages/ai/src/agent.ts packages/ai/src/index.ts packages/ai/src/selectors.ts \
        packages/ai/test/selectors.test.ts packages/ai/test/runner.test.ts
git commit -m "feat(ai): cut over medium/hard presets to BudgetPlanner, delete GreedyPlanner

weights/GoalWeights removed from AIDifficultyPreset — they were a
greedy-only concept; the rung ladder has fixed priorities, not weights."
```

---

### Task 9: Integration tests — the success bar

**Files:**
- Modify: `packages/ai/test/integration.ai.test.ts` (full rewrite)

**Interfaces:**
- Consumes: `makeAgent`, `playGame` from `../src/index.js`; `createInitialGame`, `goalScores` from `@jones/core`; `aiDifficulty`, `defaultConfig`, `constantEconomyConfig` from `@jones/config`.

- [ ] **Step 1: Replace the full contents of `packages/ai/test/integration.ai.test.ts`**

```typescript
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig, aiDifficulty } from "@jones/config";
import { createInitialGame, goalScores } from "@jones/core";
import type { GameState, GameEvent } from "@jones/core";
import { makeAgent, playGame } from "../src/index.js";

// Constant economy: removes RNG-driven price/crash/boom noise so these tests
// isolate planner behavior rather than economy luck (matching this file's
// pre-existing convention).
const config = { ...defaultConfig, economy: constantEconomyConfig };
const DEFAULT_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

function newGame(seed: number, goals = DEFAULT_GOALS): GameState {
  return createInitialGame(config, seed, [{ name: "AI", isAI: true, goals }]);
}

function invalidCount(events: GameEvent[]): number {
  return events.filter((e) => e.type === "InvalidAction").length;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe("AI full-game integration", () => {
  it("a budget game never crashes and emits no storm of InvalidAction", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 1, 0) };
    const result = playGame(config, newGame(1), [seat], { maxWeeks: 200 });
    expect(invalidCount(result.events)).toBeLessThan(5);
    expect(["playing", "ended"]).toContain(result.state.status);
  });

  it("terminates (winner or week cap)", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 2, 0) };
    const result = playGame(config, newGame(2), [seat], { maxWeeks: 300 });
    expect(result.weeks).toBeLessThanOrEqual(300);
  });

  it("is deterministic — same seed twice yields identical final state and winner", () => {
    const run = (s: number) =>
      playGame(config, newGame(s), [{ playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, s, 0) }], { maxWeeks: 150 });
    const a = run(7);
    const b = run(7);
    expect(a.winnerId).toBe(b.winnerId);
    expect(a.weeks).toBe(b.weeks);
    expect(a.state.players[0]).toEqual(b.state.players[0]);
  });

  it("a budget agent out-progresses a random agent over the same horizon", () => {
    const horizon = 60;
    const progress = (preset: typeof aiDifficulty.hard, seed: number) => {
      const r = playGame(config, newGame(seed, { wealth: 999, happiness: 999, education: 999, career: 999 }), [
        { playerId: "p0", agent: makeAgent(preset, config, seed, 0) },
      ], { maxWeeks: horizon });
      const s = goalScores(r.state.players[0]);
      return s.wealth + s.happiness + s.education + s.career;
    };
    const budget = progress(aiDifficulty.hard, 3);
    const random = progress(aiDifficulty.easy, 3);
    expect(budget).toBeGreaterThan(random);
  });

  it("always terminates with exactly one winner under a small core cap (multiple seeds)", () => {
    const capped = { ...config, constants: { ...config.constants, maxWeeks: 10 } };
    for (const seed of [1, 2, 3, 42, 99]) {
      const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, capped, seed, 0) };
      const result = playGame(capped, createInitialGame(capped, seed, [
        { name: "AI", isAI: true, goals: DEFAULT_GOALS },
      ]), [seat], { maxWeeks: 100 });
      expect(result.state.status).toBe("ended");
      expect(result.state.winners).toHaveLength(1);
      expect(result.state.week).toBeLessThanOrEqual(11); // cap 10 -> ends when week becomes 11
    }
  });

  it("regression economics: no starvation after week 2, rent debt bounded, dependibility maintained from week 6 (seed 7)", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 7, 0) };
    let state = newGame(7);

    for (let w = 0; w < 120 && state.status === "playing"; w++) {
      const before = state.week;
      const r = playGame(config, state, [seat], { maxWeeks: before + 1 });
      state = r.state;

      if (before > 2) {
        expect(r.events.some((e) => e.type === "PlayerStarved")).toBe(false);
      }
      expect(state.players[0].rentDebt).toBeLessThanOrEqual(state.players[0].currentRent);
      if (before >= 6) {
        expect(state.players[0].dependibility).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("hard AI reliably wins: >=90% of 40 seeds finish via PlayerWon, median <=80 weeks", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const winWeeks: number[] = [];
    let wins = 0;

    for (const seed of seeds) {
      const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, seed, 0) };
      const result = playGame(config, newGame(seed), [seat], { maxWeeks: 200 });
      const won = result.events.some((e) => e.type === "PlayerWon");
      if (won) {
        wins++;
        winWeeks.push(result.weeks);
      }
    }

    expect(wins / seeds.length).toBeGreaterThanOrEqual(0.9);
    expect(median(winWeeks)).toBeLessThanOrEqual(80);
  }, 60000);
});
```

- [ ] **Step 2: Run the integration suite**

Run: `pnpm --filter @jones/ai test -- integration.ai.test.ts`
Expected: PASS, all 7 tests. The last test may take several seconds (40 headless games); the 60s timeout accommodates this.

If the win-rate or median assertion fails, this is a planner-tuning problem, not a test problem — per the spec ("if 90% proves flaky at 40 seeds, tune the planner, not the threshold"). Revisit `PLANNER_TUNING` in `packages/ai/src/budget.ts` (Task 2): likely candidates are `weeklyBuffer` (too low → cash-strapped stalls; too high → slow wealth accumulation), `relaxationThreshold` (too low → doctor-visit spiral), or `wageUpgradeThreshold` (too aggressive upgrading burns hours applying instead of working). Re-run the full `rungs.test.ts` + `planner.test.ts` suites after any tuning change to confirm no regressions, then re-run this test.

If the regression-economics test fails on the dependibility assertion specifically, check that `depMaintenanceWorkRung` (Task 5) is actually reachable — i.e., that `cashFloorWorkRung` and higher-priority rungs aren't perpetually consuming all 60 hours before rung 6 gets a turn.

- [ ] **Step 3: Run the full workspace test suite and typecheck one more time**

Run: `pnpm test`
Expected: PASS across every package.

Run: `pnpm typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/test/integration.ai.test.ts
git commit -m "test(ai): rewrite AI integration suite for BudgetPlanner

Replaces the GreedyPlanner-specific poverty-spiral reproduction with the
budget planner's success-bar test (>=90% legitimate wins across 40
seeds, median <=80 weeks) plus a standing regression-economics check
(no starvation after week 2, bounded rent debt, dependibility
maintained from week 6)."
```

---

## Post-implementation

After Task 9 passes, update the project memory note (`project_ai_planner_overhaul.md`) to mark Sub-project 2 as done, mirroring how Sub-project 1 was recorded. This is a memory-write, not a code task — do it via the memory system, not a file edit in this repo.
