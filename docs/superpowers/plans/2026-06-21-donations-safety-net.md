# Donations Safety Net Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the original game's Donation mechanic — a player who has had no clothes at all for 2+ consecutive turns, with cash under $300 and Net Worth under $300, receives a cash grant — so a player with zero liquidatable assets (the gap the AI poverty-recovery fix's own verification exposed) has a real way out of the poverty spiral, matching every other player too.

**Architecture:** A new `applyDonation` function in `packages/core/src/health.ts`, following the exact same shape and RNG-threading pattern as the existing `applyFoodAndHealth` in the same file, wired into `turn.ts`'s `advanceTurn` right after it (matching the authoritative reference's step ordering) and into `setup.ts`'s existing seat-0 parity mirror. A new `netWorth` helper computes Donation eligibility per the reference's exact formula.

**Tech Stack:** TypeScript (strict), Vitest. Run `pnpm test` and `pnpm typecheck` from the repo root.

## Global Constraints

- No `@jones/ai`/`@jones/config` changes — this is a `@jones/core` rule, not AI behavior. Task 3 touches `@jones/ai`'s *test* file only (to fix an already-flagged vacuous regression test), no `@jones/ai` source changes.
- Trigger condition, copied verbatim from the authoritative reference (`docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md`): no clothes at all (`bestUniform(p) === null`) for 2+ **consecutive** turns, AND `cash < 300`, AND `netWorth(p, state) < 300`.
- Grant amount: if employed, the cheapest `config.items` entry whose `clothingCategory` matches the player's job's required uniform level (`basePrice`); if unemployed, a flat `$50`. Either way, plus a random `$1–100` rolled via `nextInt(state.rng, 1, 100)`, threading `state.rng` the same way every other RNG-using core function already does.
- Net Worth formula: `cash + bank + (current value of every owned stock) + (pricePaid summed over every entry in p.durables) + (pricePaid summed over every entry in state.pawnedItems owned by this player)`. This sums every durable holding directly rather than grouping by type and using only the "last unit's" price — a deliberate, documented simplification (see design spec) since the data model has no acquisition-order timestamp; in the normal case (at most one item per `durableType` at a time) the two formulas are identical.
- The consecutive-no-clothes counter resets to `0` whenever the player has any clothing, or immediately after a donation fires (so it can't re-trigger every single turn while still rebuilding).
- Every seat gets this symmetrically — wired into both `advanceTurn` (every seat's own turn) and `createInitialGame`'s existing seat-0 mirror block, matching the established pattern for every other start-of-turn mechanic in this codebase.
- Tests use real fixtures (`createInitialGame`, real `reduce()`/`playGame()`) — no mocking of game logic.

---

## File map

| Action | File | Responsibility |
|--------|------|-----------------|
| Modify | `packages/core/src/types.ts` | New `PlayerState.weeksWithoutClothes: number` field, new `DonationReceived` event |
| Modify | `packages/core/src/health.ts` | New `netWorth` and `applyDonation` functions |
| Modify | `packages/core/src/setup.ts` | Initialize `weeksWithoutClothes: 0` on every player; wire `applyDonation` into the existing seat-0 mirror block |
| Create | `packages/core/test/donation.test.ts` | Unit tests for `netWorth`/`applyDonation` |
| Modify | `packages/core/src/turn.ts` | Wire `applyDonation` into `advanceTurn`, right after `applyFoodAndHealth` |
| Modify | `packages/core/test/food-health.test.ts` | One new test confirming `applyDonation` fires via a real `EndTurn` dispatch |
| Modify | `packages/ai/test/integration.ai.test.ts` | Replace the vacuous poverty-spiral regression test with one that actually proves recovery, now that Donations exists |

---

## Task 1: `netWorth` and `applyDonation`

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/health.ts`
- Modify: `packages/core/src/setup.ts`
- Create: `packages/core/test/donation.test.ts`

**Interfaces:**
- Produces: `PlayerState.weeksWithoutClothes: number`; `GameEvent` variant `{ type: "DonationReceived"; playerId: string; amount: number }`; `netWorth(p: PlayerState, state: GameState): number`; `applyDonation(p: PlayerState, state: GameState, config: GameConfig, events: GameEvent[]): void`. Consumed by Task 2 (`turn.ts`/`setup.ts` wiring) and Task 3 (the AI regression test, indirectly via `reduce()`).

- [ ] **Step 1: Add the new field and event to `packages/core/src/types.ts`**

Find this field in the `PlayerState` interface:

```ts
  rentExtensionUsedThisTurn: boolean;
}
```

Replace it with:

```ts
  rentExtensionUsedThisTurn: boolean;
  weeksWithoutClothes: number;
}
```

Find this line (the last variant in the `GameEvent` union):

```ts
  | { type: "Relaxed"; playerId: string; relaxation: number; happinessGained: number };
```

Replace it with:

```ts
  | { type: "Relaxed"; playerId: string; relaxation: number; happinessGained: number }
  | { type: "DonationReceived"; playerId: string; amount: number };
```

- [ ] **Step 2: Initialize the new field in `packages/core/src/setup.ts`**

Find this field in the player-construction object (inside `setups.map((s, i) => ({ ... }))`):

```ts
    rentExtensionUsedThisTurn: false,
  }));
```

Replace it with:

```ts
    rentExtensionUsedThisTurn: false,
    weeksWithoutClothes: 0,
  }));
```

- [ ] **Step 3: Write the failing tests in `packages/core/test/donation.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { netWorth, applyDonation } from "../src/health.js";
import type { GameState, GameEvent } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function soloGame(): GameState {
  return createInitialGame(testConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
}

describe("netWorth", () => {
  it("sums cash, bank, stock value, owned durables, and this player's pawned items", () => {
    const g = soloGame();
    const p = g.players[0];
    p.cash = 100;
    p.bank = 50;
    p.stocks.gold = 2;
    g.stockPrices.gold = 25; // stock value = 50
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    g.pawnedItems = [
      { itemId: "stoveZMart", durableType: "stove", pricePaid: 490, pawnedByPlayerId: "p0", pawnedWeek: 1 },
      { itemId: "computerSocket", durableType: "computer", pricePaid: 1599, pawnedByPlayerId: "p1", pawnedWeek: 1 },
    ];
    // 100 + 50 + 50 + 876 + 490 (p0's own pawned item) = 1566; p1's pawned item excluded.
    expect(netWorth(p, g)).toBe(1566);
  });
});

describe("applyDonation", () => {
  it("does not donate (and does not increment the counter past 1) on the first clothesless turn", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    expect(p.weeksWithoutClothes).toBe(1);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(false);
  });

  it("donates a flat $50 + a $1-100 bonus when unemployed, broke, and clothesless for 2 consecutive turns", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events); // turn 1: counter -> 1, no donation
    applyDonation(p, g, testConfig, events); // turn 2: counter -> 2, donation fires
    const donation = events.find((e) => e.type === "DonationReceived");
    expect(donation).toBeDefined();
    expect((donation as { amount: number }).amount).toBeGreaterThanOrEqual(51);
    expect((donation as { amount: number }).amount).toBeLessThanOrEqual(150);
    expect(p.cash).toBe((donation as { amount: number }).amount);
    expect(p.weeksWithoutClothes).toBe(0);
  });

  it("donates the cheapest item price matching the job's uniform level, plus bonus, when employed", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    p.jobId = "zMart.clerk"; // requires "casual"; cheapest casual item is casualClothesZMart at $35
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    applyDonation(p, g, testConfig, events);
    const donation = events.find((e) => e.type === "DonationReceived");
    expect(donation).toBeDefined();
    expect((donation as { amount: number }).amount).toBeGreaterThanOrEqual(36);
    expect((donation as { amount: number }).amount).toBeLessThanOrEqual(135);
  });

  it("does not donate when cash is already >= $300, even after 2+ clothesless turns", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 300;
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    applyDonation(p, g, testConfig, events);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(false);
  });

  it("does not donate when net worth is >= $300 via an owned durable, even with $0 cash", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    applyDonation(p, g, testConfig, events);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(false);
  });

  it("resets the counter to 0 as soon as the player has any clothing again", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events); // counter -> 1
    p.clothing.casual = 5; // player got clothed again
    applyDonation(p, g, testConfig, events);
    expect(p.weeksWithoutClothes).toBe(0);
  });
});
```

- [ ] **Step 4: Run the tests to confirm they fail**

Run: `pnpm vitest run packages/core/test/donation.test.ts 2>&1 | tail -50`
Expected: FAIL — `netWorth`/`applyDonation` don't exist in `health.js` yet, and `weeksWithoutClothes` doesn't exist on `PlayerState` yet (TypeScript will also flag this at the `pnpm typecheck` step, but the test run itself fails first on the missing exports).

- [ ] **Step 5: Implement `netWorth` and `applyDonation` in `packages/core/src/health.ts`**

Find the top of the file:

```ts
import type { DurableType, GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { nextFloat, nextInt } from "./rng.js";

/** True if the player owns any durable of the given type (any store variant). */
export function ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean {
  return p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === durableType);
}
```

Replace it with (adds `StockId` to the import and a new `bestUniform`/`findJob` import, plus the new `netWorth` function):

```ts
import type { DurableType, GameConfig, StockId } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { nextFloat, nextInt } from "./rng.js";
import { bestUniform, findJob } from "./work.js";

/** True if the player owns any durable of the given type (any store variant). */
export function ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean {
  return p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === durableType);
}

/**
 * §4 Net Worth — used only for Donation eligibility. Liquid Assets (cash +
 * bank + current stock value) plus the value of every durable the player
 * holds, whether currently owned or currently pawned. Sums every holding's
 * own recorded pricePaid directly rather than grouping by durableType and
 * using only the "last unit's" price — the data model has no
 * acquisition-order timestamp on `durables` to determine "last," and in
 * the normal case (at most one item per durableType at a time) the two
 * formulas are identical.
 */
export function netWorth(p: PlayerState, state: GameState): number {
  const stockValue = (Object.keys(p.stocks) as StockId[]).reduce(
    (sum, id) => sum + p.stocks[id] * state.stockPrices[id],
    0,
  );
  const ownedDurableValue = p.durables.reduce((sum, d) => sum + d.pricePaid, 0);
  const pawnedDurableValue = state.pawnedItems
    .filter((pi) => pi.pawnedByPlayerId === p.id)
    .reduce((sum, pi) => sum + pi.pricePaid, 0);
  return p.cash + p.bank + stockValue + ownedDurableValue + pawnedDurableValue;
}
```

Then, find the closing brace of `applyFoodAndHealth` (right before the `relax` function):

```ts
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

/** §2 Relax — only at the player's own apartment; restores Relaxation, first-per-turn happiness. */
```

Replace it with (the existing closing brace, unchanged, plus the new `applyDonation` function inserted before `relax`):

```ts
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

/**
 * §2 step 17 / §12 Donation: a player with no clothing at all for 2+
 * consecutive turns, cash under $300, and Net Worth under $300 receives a
 * cash grant — enough for their job's required uniform (or $50 flat if
 * unemployed) plus a random $1-100. The counter resets to 0 whenever the
 * player has any clothing, or immediately after a donation.
 */
export function applyDonation(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
): void {
  if (bestUniform(p) !== null) {
    p.weeksWithoutClothes = 0;
    return;
  }
  p.weeksWithoutClothes += 1;
  if (p.weeksWithoutClothes < 2) return;
  if (p.cash >= 300 || netWorth(p, state) >= 300) return;

  let base: number;
  if (p.jobId === null) {
    base = 50;
  } else {
    const job = findJob(config, p.jobId);
    const candidates = config.items
      .filter((it) => it.clothingCategory === job.uniform)
      .sort((a, b) => a.basePrice - b.basePrice);
    base = candidates[0]?.basePrice ?? 50;
  }

  const roll = nextInt(state.rng, 1, 100);
  state.rng = roll.state;
  const amount = base + roll.value;
  p.cash += amount;
  p.weeksWithoutClothes = 0;
  events.push({ type: "DonationReceived", playerId: p.id, amount });
}

/** §2 Relax — only at the player's own apartment; restores Relaxation, first-per-turn happiness. */
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run packages/core/test/donation.test.ts 2>&1 | tail -50`
Expected: all tests pass.

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes (note: this will likely still show the `@jones/ai` regression test failing — that's expected and is fixed in Task 3, not this one).

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/health.ts packages/core/src/setup.ts packages/core/test/donation.test.ts
git commit -m "feat(core): add netWorth and applyDonation"
```

---

## Task 2: Wire `applyDonation` into the turn sequence

**Files:**
- Modify: `packages/core/src/turn.ts`
- Modify: `packages/core/src/setup.ts`
- Modify: `packages/core/test/food-health.test.ts`

**Interfaces:**
- Consumes: `applyDonation` (Task 1, from `./health.js`).

- [ ] **Step 1: Write the failing test in `packages/core/test/food-health.test.ts`**

Add this `describe` block at the end of the file (after the last existing `describe`):

```ts
describe("Donation wiring via EndTurn (bug fix follow-up)", () => {
  it("fires DonationReceived after 2 consecutive turns without clothing, when broke", () => {
    const g = soloGame();
    g.players[0].clothing = { casual: 0, dress: 0, business: 0 };
    const { state: s1 } = reduce(g, { type: "EndTurn" }, testConfig);
    expect(s1.players[0].weeksWithoutClothes).toBe(1);
    const { events } = reduce(s1, { type: "EndTurn" }, testConfig);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run packages/core/test/food-health.test.ts 2>&1 | tail -30`
Expected: FAIL — `applyDonation` isn't called from `advanceTurn` yet, so `weeksWithoutClothes` never increments and no `DonationReceived` event ever fires.

- [ ] **Step 3: Wire `applyDonation` into `packages/core/src/turn.ts`**

Find the import line:

```ts
import { applyFoodAndHealth, ownsDurableType } from "./health.js";
```

Replace it with:

```ts
import { applyDonation, applyFoodAndHealth, ownsDurableType } from "./health.js";
```

Find the tail of `advanceTurn`:

```ts
  } else {
    applyDueDates(upNext, state, config, events);
    applyFoodAndHealth(upNext, state, config, events);
  }
}
```

Replace it with:

```ts
  } else {
    applyDueDates(upNext, state, config, events);
    applyFoodAndHealth(upNext, state, config, events);
    applyDonation(upNext, state, config, events);
  }
}
```

- [ ] **Step 4: Wire `applyDonation` into `packages/core/src/setup.ts`'s seat-0 mirror**

Find the import line:

```ts
import { applyFoodAndHealth } from "./health.js";
```

Replace it with:

```ts
import { applyDonation, applyFoodAndHealth } from "./health.js";
```

Find the seat-0 mirror block's tail:

```ts
  } else {
    applyDueDates(first, state, config, discardedEvents);
    applyFoodAndHealth(first, state, config, discardedEvents);
  }

  return state;
}
```

Replace it with:

```ts
  } else {
    applyDueDates(first, state, config, discardedEvents);
    applyFoodAndHealth(first, state, config, discardedEvents);
    applyDonation(first, state, config, discardedEvents);
  }

  return state;
}
```

- [ ] **Step 5: Run the tests and typecheck**

Run: `pnpm vitest run packages/core/test/food-health.test.ts 2>&1 | tail -30`
Expected: all tests pass, including the new one.

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes except the still-vacuous `@jones/ai` regression test (fixed in Task 3 — note its exact failure mode at this point: it now might actually pass on its own depending on the scenario, but do not treat that as this task's concern; Task 3 replaces it regardless).

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/turn.ts packages/core/src/setup.ts packages/core/test/food-health.test.ts
git commit -m "feat(core): wire Donation processing into the turn sequence"
```

---

## Task 3: Fix the vacuous AI poverty-spiral regression test

**Files:**
- Modify: `packages/ai/test/integration.ai.test.ts`

**Interfaces:**
- Consumes: `applyDonation`'s effect (Tasks 1-2), observed indirectly through `playGame`/`reduce` — no direct import needed.

A prior regression test (added during the AI poverty-recovery work, before Donations existed) was found to be vacuous: it asserted `cash > 0` at some point within 200 weeks, which is trivially true from week 1 since starting cash is positive, regardless of whether any bug exists. A corrected version was designed (tracking `wasBroke` before checking for `recovered`) but at the time it was written, the exact reproduction scenario (seed 42, medium difficulty) had zero liquidatable assets, so even the corrected version failed — which is exactly the gap Donations now closes.

- [ ] **Step 1: Find and replace the vacuous test**

In `packages/ai/test/integration.ai.test.ts`, find the test titled `"recovers from the diagnosed poverty spiral instead of bottoming out forever (seed 42, medium, 200 weeks)"` (added in a prior commit). Replace its entire body with:

```ts
  it("recovers from the diagnosed poverty spiral instead of bottoming out forever (seed 42, medium, 200 weeks)", () => {
    // Reproduction of a real reported bug: this exact seed/difficulty/horizon
    // previously drove the AI to $0 cash by week 6, after which lapsed
    // clothing made Work permanently unaffordable to restore, and happiness
    // declined monotonically to roughly -397 by week 200 with no recovery.
    // Fixed by @jones/ai's emergency-liquidity fallback (pawn/sell assets)
    // plus @jones/core's Donation safety net (for when there's nothing to
    // liquidate at all, which is exactly what happens on this seed).
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.medium, config, 42, 0) };
    let state = newGame(42);
    const allEvents: GameEvent[] = [];
    let wasBroke = false;
    let recovered = false;

    for (let w = 0; w < 200 && state.status === "playing"; w++) {
      const r = playGame(config, state, [seat], { maxWeeks: state.week + 1 });
      state = r.state;
      allEvents.push(...r.events);
      if (state.players[0].cash <= 0) {
        wasBroke = true;
      } else if (wasBroke) {
        recovered = true;
        break;
      }
    }

    expect(wasBroke).toBe(true);
    expect(recovered).toBe(true);
    expect(invalidCount(allEvents)).toBeLessThan(5);
  });
```

- [ ] **Step 2: Run the test to confirm it now passes**

Run: `pnpm vitest run packages/ai/test/integration.ai.test.ts 2>&1 | tail -40`
Expected: all tests pass, including this one — `wasBroke` becomes `true` (the spiral genuinely occurs, matching the diagnosed scenario), and `recovered` becomes `true` afterward (proving Donations gives this exact zero-asset AI a way out).

If `recovered` is still `false`, do not weaken the assertion or pick a different seed to paper over it — that would silently re-introduce a vacuous or evasive test. Instead, stop and report exactly what `state.players[0]`'s relevant fields (`cash`, `weeksWithoutClothes`, `durables`, `tBills`, `stocks`) look like at the point the loop ends, so the root cause of why Donations didn't fire can be diagnosed (e.g., re-check the eligibility math by hand against this exact scenario's actual cash/net-worth trajectory).

- [ ] **Step 3: Run the full suite and typecheck**

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes — this should now be the first fully-green run since the AI poverty-recovery work began.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/test/integration.ai.test.ts
git commit -m "fix(ai): poverty-spiral regression test now passes with the Donation safety net"
```

---

## Self-review notes

- **Spec coverage:** Goal 1 (donation trigger/grant) → Task 1's `applyDonation`. Goal 2 (symmetric across every seat) → Task 2's wiring into both `advanceTurn` and `setup.ts`'s mirror. Goal 3 (counter resets after donation) → already covered by Task 1's `applyDonation` implementation and its dedicated test. The Testing Strategy section's note about updating the AI regression test → Task 3.
- **Type consistency:** `netWorth(p: PlayerState, state: GameState): number` and `applyDonation(p: PlayerState, state: GameState, config: GameConfig, events: GameEvent[]): void` match the exact parameter shapes `applyFoodAndHealth` already uses in the same file — no signature drift between tasks. `weeksWithoutClothes: number` is the one new `PlayerState` field every task references identically.
- **No placeholders:** every step has complete, working code and exact verification commands. Task 3 explicitly forbids the "weaken the assertion" escape hatch that produced the original vacuous test.
- **Ordering matches the authoritative reference:** `applyDonation` is called immediately after `applyFoodAndHealth` in both wiring sites, matching step 17 (Donations) coming after steps 9-11 (Spoiled Food/Starvation/Doctor Visit) and step 13 (clothing decay, already in `applyStartOfWeek`, which always runs before either due-dates or food-health processing).
