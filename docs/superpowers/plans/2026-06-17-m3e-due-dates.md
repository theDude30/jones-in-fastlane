# M3e Rent & Loan Due-Date Processing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add loan repayment (`PayLoan`) and automatic start-of-turn due-date processing so unpaid rent becomes Rent Debt (activating the dormant garnishment/extension-deny logic) and unpaid loans Default.

**Architecture:** One new command `PayLoan` in the existing `finance.ts` (Bank location, mirrors `applyLoan`'s structure). A new `applyDueDates(player, state, config, events)` helper in `turn.ts`, called once per player at the start of their turn (after the win check, matching spec §2 ordering where Rent Notice = step 12 and Loan Payment = step 14 follow Winner Check = step 3). Both rent and loan use the same "due week has passed unpaid" rule: `state.week > dueWeek` ⇒ penalty + advance the due week by one month, so a missed period is charged at most once per month.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest. Run tests with `pnpm test` from repo root; typecheck with `pnpm typecheck`.

**Key facts (verified against the codebase):**
- `PlayerState` already has: `cash`, `bank`, `happiness`, `loanBalance: number`, `loanDueWeek: number | null`, `loanInDefault: boolean`, `timesDefaulted: number`, `rentDebt: number`, `currentRent: number`, `rentDueWeek: number`, `everInRentDebt: boolean`.
- `config.constants` already has: `loanPaymentAmount: 50`, `loanPaymentToDebt: 45` (so interest = 50 − 45 = 5), `weeksPerMonth: 4`.
- `applyLoan` sets `loanDueWeek = state.week + 4` for a fresh loan; `loanInDefault` blocks new loans.
- `advanceTurn` (turn.ts) runs `applyStartOfWeek(upNext, config)` then the `hasWon` win check, every `EndTurn`, for the up-next player. `state.week` is already incremented (on wrap) before this.
- Deposit/Withdraw do **not** cost hours; `PayLoan` likewise costs 0 hours (only a Bank-location guard).
- Garnishment (`applyGarnishment` in housing.ts) and auto-deny-extension-when-`everInRentDebt` are already implemented but never trigger because nothing sets `rentDebt > 0` / `everInRentDebt = true`. This plan is what activates them.

---

## File map

| Action | File |
|--------|------|
| Modify | `packages/core/src/types.ts` — add `PayLoan` command; add `LoanPaid`, `RentDebtIncurred`, `LoanDefaulted` events |
| Modify | `packages/core/src/finance.ts` — add `payLoan` handler |
| Modify | `packages/core/src/reduce.ts` — wire `PayLoan` case (import + switch) |
| Modify | `packages/core/src/turn.ts` — add `applyDueDates`, call it from `advanceTurn` |
| Modify | `packages/core/test/finance.test.ts` — `PayLoan` tests |
| Create | `packages/core/test/due-dates.test.ts` — start-of-turn rent/loan processing tests |
| Modify | `packages/core/test/integration.game.test.ts` — rent-debt→garnishment and loan-default→recovery lifecycle |

**Out of scope (do NOT implement):** rent-office "4th-week-only" open hours / location gating; all other start-of-turn sequence steps (cooking bonus, weekend, lottery roll, computer profits, robbery, spoiled food, starvation, doctor, appliance repair, donations). Those belong to a later milestone.

---

## Task 1: PayLoan command

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/test/finance.test.ts`
- Modify: `packages/core/src/finance.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Add the `PayLoan` command to the `Command` union in `packages/core/src/types.ts`**

The `Command` union currently ends at line 110 with `| { type: "BuyPawnedItem"; itemId: ItemId };`. Change that line to remove its trailing `;` and append the new command, so the block reads:

```ts
  | { type: "PawnItem"; itemId: ItemId }
  | { type: "RedeemItem"; itemId: ItemId }
  | { type: "BuyPawnedItem"; itemId: ItemId }
  | { type: "PayLoan" };
```

- [ ] **Step 2: Add the `LoanPaid` event to the `GameEvent` union in `packages/core/src/types.ts`**

The `GameEvent` union currently ends at line 153 with `| { type: "Garnished"; playerId: string; toDebt: number; interest: number };`. Change that line to remove its trailing `;` and append the new event (the `RentDebtIncurred` and `LoanDefaulted` events are added in Task 2), so the block reads:

```ts
  | { type: "PawnedItemBought"; playerId: string; itemId: ItemId; cost: number }
  | { type: "Garnished"; playerId: string; toDebt: number; interest: number }
  | { type: "LoanPaid"; playerId: string; payment: number; toDebt: number; interest: number; remainingBalance: number; dueWeek: number | null };
```

- [ ] **Step 3: Run typecheck to confirm the unhandled-command error**

Run: `pnpm typecheck`
Expected: an error in `reduce.ts` that `PayLoan` is not handled in the switch (the switch is exhaustive). This is expected and fixed in Step 8.

- [ ] **Step 4: Write the failing `PayLoan` tests in `packages/core/test/finance.test.ts`**

Append at the end of the file. These reuse the existing `bankGame()` helper (player at `bank`, inside, `cash = 5000`, `bank = 500`, `wage = 10`) and `testConfig` (constant economy). With `loanPaymentAmount = 50` and `loanPaymentToDebt = 45`, a normal payment reduces the balance by 45, costs the player 50 cash, and the $5 difference is interest.

```ts
describe("PayLoan", () => {
  it("normal payment: $50 cash, $45 to debt, $5 interest, dueWeek +4, clears default", () => {
    const state = bankGame();
    state.week = 5;
    state.players[0].loanBalance = 1000;
    state.players[0].loanDueWeek = 5;
    state.players[0].loanInDefault = true;
    const { state: s, events } = reduce(state, { type: "PayLoan" }, testConfig);
    const p = s.players[0];
    expect(p.cash).toBe(5000 - 50);
    expect(p.loanBalance).toBe(955); // 1000 - 45
    expect(p.loanDueWeek).toBe(9);   // 5 + 4
    expect(p.loanInDefault).toBe(false);
    expect(events[0]).toMatchObject({
      type: "LoanPaid",
      payment: 50,
      toDebt: 45,
      interest: 5,
      remainingBalance: 955,
      dueWeek: 9,
    });
  });

  it("balance below the payment amount is cleared with no interest, dueWeek null", () => {
    const state = bankGame();
    state.players[0].loanBalance = 30;
    state.players[0].loanDueWeek = 5;
    const { state: s, events } = reduce(state, { type: "PayLoan" }, testConfig);
    const p = s.players[0];
    expect(p.cash).toBe(5000 - 30); // pays only the outstanding balance
    expect(p.loanBalance).toBe(0);
    expect(p.loanDueWeek).toBeNull();
    expect(p.loanInDefault).toBe(false);
    expect(events[0]).toMatchObject({
      type: "LoanPaid",
      payment: 30,
      toDebt: 30,
      interest: 0,
      remainingBalance: 0,
      dueWeek: null,
    });
  });

  it("InvalidAction when there is no loan to pay", () => {
    const state = bankGame();
    state.players[0].loanBalance = 0;
    const { events } = reduce(state, { type: "PayLoan" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "no loan to pay" });
  });

  it("NotEnoughMoney when cash is below the payment due", () => {
    const state = bankGame();
    state.players[0].loanBalance = 1000;
    state.players[0].loanDueWeek = 5;
    state.players[0].cash = 20; // < 50
    const { events } = reduce(state, { type: "PayLoan" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney", action: "PayLoan" });
  });

  it("InvalidAction when not at the bank", () => {
    const state = bankGame();
    state.players[0].loanBalance = 1000;
    state.players[0].locationId = "pawnShop";
    const { events } = reduce(state, { type: "PayLoan" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});
```

- [ ] **Step 5: Run the new tests to confirm they fail**

Run: `pnpm test -- packages/core/test/finance.test.ts 2>&1 | tail -20`
Expected: FAIL — `PayLoan` is unhandled, so `reduce` emits an `InvalidAction "unhandled command ..."` (or the switch default), not `LoanPaid`.

- [ ] **Step 6: Add the `payLoan` handler to `packages/core/src/finance.ts`**

Append at the end of the file. It reuses the module-private `playerAtBank` guard already defined at the top of the file. The "below payment amount" branch pays only the outstanding balance and fully clears the loan (sets `loanDueWeek = null`); the normal branch reduces the balance by `loanPaymentToDebt`, charges the full `loanPaymentAmount`, and pushes the deadline forward by one month. Both branches clear `loanInDefault`.

```ts
export function payLoan(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtBank(state, events);
  if (!p) return;
  if (p.loanBalance <= 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no loan to pay" });
    return;
  }

  if (p.loanBalance < config.constants.loanPaymentAmount) {
    const payment = p.loanBalance;
    if (p.cash < payment) {
      events.push({ type: "NotEnoughMoney", playerId: p.id, action: "PayLoan" });
      return;
    }
    p.cash -= payment;
    p.loanBalance = 0;
    p.loanDueWeek = null;
    p.loanInDefault = false;
    events.push({
      type: "LoanPaid",
      playerId: p.id,
      payment,
      toDebt: payment,
      interest: 0,
      remainingBalance: 0,
      dueWeek: null,
    });
    return;
  }

  const payment = config.constants.loanPaymentAmount;
  if (p.cash < payment) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "PayLoan" });
    return;
  }
  const toDebt = config.constants.loanPaymentToDebt;
  const interest = payment - toDebt;
  p.cash -= payment;
  p.loanBalance -= toDebt;
  p.loanDueWeek = (p.loanDueWeek ?? state.week) + config.constants.weeksPerMonth;
  p.loanInDefault = false;
  events.push({
    type: "LoanPaid",
    playerId: p.id,
    payment,
    toDebt,
    interest,
    remainingBalance: p.loanBalance,
    dueWeek: p.loanDueWeek,
  });
}
```

- [ ] **Step 7: Add `payLoan` to the finance import in `packages/core/src/reduce.ts`**

Change the finance import (line 10) to include `payLoan`:

```ts
import { deposit, withdraw, applyLoan, payLoan, openBroker, buyStock, sellStock, buyTBill, sellTBill, buyLotteryTickets } from "./finance.js";
```

- [ ] **Step 8: Wire the `PayLoan` case in `packages/core/src/reduce.ts`**

In the switch, immediately after the `ApplyLoan` case (it ends at line 159 with `break;`), add:

```ts
    case "PayLoan":
      payLoan(next, config, events);
      break;
```

- [ ] **Step 9: Run the finance tests, then the full suite and typecheck**

Run: `pnpm test -- packages/core/test/finance.test.ts 2>&1 | tail -10`
Expected: all finance tests pass, including the 5 new `PayLoan` tests.

Run: `pnpm test`
Expected: all tests pass.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/finance.ts packages/core/src/reduce.ts packages/core/test/finance.test.ts
git commit -m "feat(core): add PayLoan command for loan repayment"
```

---

## Task 2: Start-of-turn rent & loan due-date processing

**Files:**
- Modify: `packages/core/src/types.ts`
- Create: `packages/core/test/due-dates.test.ts`
- Modify: `packages/core/src/turn.ts`

- [ ] **Step 1: Add the `RentDebtIncurred` and `LoanDefaulted` events to `packages/core/src/types.ts`**

The `GameEvent` union now ends (after Task 1) with the `LoanPaid` line. Change that line to remove its trailing `;` and append the two new events, so the block reads:

```ts
  | { type: "Garnished"; playerId: string; toDebt: number; interest: number }
  | { type: "LoanPaid"; playerId: string; payment: number; toDebt: number; interest: number; remainingBalance: number; dueWeek: number | null }
  | { type: "RentDebtIncurred"; playerId: string; amount: number; totalDebt: number; rentDueWeek: number }
  | { type: "LoanDefaulted"; playerId: string; timesDefaulted: number; dueWeek: number; happinessCost: number };
```

- [ ] **Step 2: Write the failing due-date tests in `packages/core/test/due-dates.test.ts`**

Create this file. The tests drive `advanceTurn` through `EndTurn` for a single-player game (so every `EndTurn` wraps and increments the week, then runs the up-next player's start-of-turn processing). Rent due starts at week 4 (`rentDueWeek = weeksPerMonth = 4`); the rule is that debt is incurred only once the due week has **passed** unpaid (`state.week > rentDueWeek`), giving the due week itself as a grace turn.

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState, GameEvent } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

// Single-player game: every EndTurn wraps → week += 1 → start-of-turn processing.
function soloGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
  ]);
  state.players[0].cash = 5000;
  return state;
}

function advanceToWeek(state: GameState, targetWeek: number): { state: GameState; events: GameEvent[] } {
  let s = state;
  const all: GameEvent[] = [];
  while (s.week < targetWeek) {
    const r = reduce(s, { type: "EndTurn" }, testConfig);
    s = r.state;
    all.push(...r.events);
  }
  return { state: s, events: all };
}

describe("rent due processing", () => {
  it("no debt during the grace through the due week (weeks 1-4)", () => {
    const { state } = advanceToWeek(soloGame(), 4); // reaches week 4 exactly
    const p = state.players[0];
    expect(p.rentDebt).toBe(0);
    expect(p.everInRentDebt).toBe(false);
    expect(p.rentDueWeek).toBe(4);
  });

  it("incurs one month's debt once the due week has passed unpaid", () => {
    const { state, events } = advanceToWeek(soloGame(), 5); // week 5 > rentDueWeek 4
    const p = state.players[0];
    expect(p.rentDebt).toBe(325);          // one month's rent (lowCost base)
    expect(p.everInRentDebt).toBe(true);
    expect(p.rentDueWeek).toBe(8);          // advanced one month so it won't re-charge weekly
    expect(events.some((e) => e.type === "RentDebtIncurred" && e.amount === 325 && e.totalDebt === 325 && e.rentDueWeek === 8)).toBe(true);
  });

  it("charges at most once per month, accumulating debt across months", () => {
    const { state } = advanceToWeek(soloGame(), 9); // misses week-4 and week-8 periods
    const p = state.players[0];
    expect(p.rentDebt).toBe(650);          // 2 months
    expect(p.rentDueWeek).toBe(12);
  });

  it("paying rent before the due week passes avoids debt", () => {
    let s = soloGame();
    s.players[0].locationId = "rentOffice";
    s.players[0].insideBuilding = true;
    s = reduce(s, { type: "PayRent" }, testConfig).state; // rentDueWeek 4 -> 8
    const { state } = advanceToWeek(s, 5);
    const p = state.players[0];
    expect(p.rentDebt).toBe(0);
    expect(p.everInRentDebt).toBe(false);
    expect(p.rentDueWeek).toBe(8);
  });
});

describe("loan due processing", () => {
  function loanGame(): GameState {
    const state = soloGame();
    state.players[0].loanBalance = 1000;
    state.players[0].loanDueWeek = 4;
    state.players[0].rentDueWeek = 1000; // park rent far out so it doesn't interfere
    return state;
  }

  it("no default during the grace through the due week", () => {
    const { state } = advanceToWeek(loanGame(), 4);
    const p = state.players[0];
    expect(p.loanInDefault).toBe(false);
    expect(p.timesDefaulted).toBe(0);
    expect(p.loanDueWeek).toBe(4);
  });

  it("defaults once the loan due week has passed unpaid", () => {
    const { state, events } = advanceToWeek(loanGame(), 5);
    const p = state.players[0];
    expect(p.loanInDefault).toBe(true);
    expect(p.timesDefaulted).toBe(1);
    expect(p.loanDueWeek).toBe(8); // advanced one month
    expect(events.some((e) => e.type === "LoanDefaulted" && e.timesDefaulted === 1 && e.dueWeek === 8 && e.happinessCost === 1)).toBe(true);
  });

  it("no default when there is no outstanding loan", () => {
    const { state, events } = advanceToWeek(soloGame(), 6);
    const p = state.players[0];
    expect(p.timesDefaulted).toBe(0);
    expect(p.loanInDefault).toBe(false);
    expect(events.some((e) => e.type === "LoanDefaulted")).toBe(false);
  });
});
```

- [ ] **Step 3: Run the new tests to confirm they fail**

Run: `pnpm test -- packages/core/test/due-dates.test.ts 2>&1 | tail -25`
Expected: FAIL — no rent debt / loan default is applied yet (e.g. `rentDebt` stays 0, no `RentDebtIncurred`/`LoanDefaulted` events).

- [ ] **Step 4: Add `applyDueDates` to `packages/core/src/turn.ts`**

Add this exported function just below `applyStartOfWeek` (after its closing brace at line 17). It is called once per player at the start of their turn. Both checks use the "due week has passed unpaid" rule and advance the due week by one month so a missed period is penalized at most once per month.

```ts
export function applyDueDates(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
): void {
  // Rent: if the due week has passed without payment, accrue one month's rent as debt.
  if (state.week > p.rentDueWeek) {
    p.rentDebt += p.currentRent;
    p.everInRentDebt = true;
    p.rentDueWeek += config.constants.weeksPerMonth;
    events.push({
      type: "RentDebtIncurred",
      playerId: p.id,
      amount: p.currentRent,
      totalDebt: p.rentDebt,
      rentDueWeek: p.rentDueWeek,
    });
  }

  // Loan: if an outstanding loan's due week has passed without a payment, default.
  if (p.loanBalance > 0 && p.loanDueWeek !== null && state.week > p.loanDueWeek) {
    p.timesDefaulted += 1;
    p.loanInDefault = true;
    p.happiness -= 1;
    p.loanDueWeek += config.constants.weeksPerMonth;
    events.push({
      type: "LoanDefaulted",
      playerId: p.id,
      timesDefaulted: p.timesDefaulted,
      dueWeek: p.loanDueWeek,
      happinessCost: 1,
    });
  }
}
```

- [ ] **Step 5: Call `applyDueDates` from `advanceTurn` in `packages/core/src/turn.ts`**

The end of `advanceTurn` currently reads:

```ts
  const upNext = state.players[state.currentPlayerIndex];
  applyStartOfWeek(upNext, config);
  if (hasWon(upNext)) {
    if (!state.winners.includes(upNext.id)) state.winners.push(upNext.id);
    state.status = "ended";
    events.push({ type: "PlayerWon", playerId: upNext.id });
  }
}
```

Change it so due-date processing runs only when the game has not just ended (the win check is step 3 in the spec ordering; rent/loan notices are steps 12/14, so they follow it and are skipped on a win):

```ts
  const upNext = state.players[state.currentPlayerIndex];
  applyStartOfWeek(upNext, config);
  if (hasWon(upNext)) {
    if (!state.winners.includes(upNext.id)) state.winners.push(upNext.id);
    state.status = "ended";
    events.push({ type: "PlayerWon", playerId: upNext.id });
  } else {
    applyDueDates(upNext, state, config, events);
  }
}
```

- [ ] **Step 6: Run the due-date tests, then the full suite and typecheck**

Run: `pnpm test -- packages/core/test/due-dates.test.ts 2>&1 | tail -10`
Expected: all due-date tests pass.

Run: `pnpm test`
Expected: all tests pass. (The existing `integration.game.test.ts` "runs many weeks" loop will now accrue rent debt for its passive player, but it only asserts the week advanced and that nothing crashes, so it still passes.)

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/turn.ts packages/core/test/due-dates.test.ts
git commit -m "feat(core): process rent & loan due dates at start of turn"
```

---

## Task 3: Integration — full debt lifecycles

**Files:**
- Modify: `packages/core/test/integration.game.test.ts`

- [ ] **Step 1: Add the rent-debt → garnishment and loan-default → recovery lifecycle test**

Append after the "housing & pawn flow" describe block (end of file). This verifies the two subsystems now connect end-to-end: a missed rent payment becomes debt at the start of a later turn, the next `Work` session garnishes wages against that debt (proving the previously-dormant `applyGarnishment` path now fires), and a defaulted loan is cleared by `PayLoan` (clearing `loanInDefault`).

```ts
describe("rent debt & loan default lifecycle", () => {
  it("misses rent → debt accrues → work garnishes it; defaults a loan → PayLoan clears default", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const p0 = state.players[0];
    p0.cash = 5000;
    // A job so Work earns wages to garnish.
    p0.jobId = "zMart.clerk";
    p0.wage = 10;
    p0.maxExperience = 50;
    p0.maxDependibility = 50;
    p0.dependibility = 50;
    // An outstanding loan due at week 4.
    p0.loanBalance = 1000;
    p0.loanDueWeek = 4;

    const allEvents: GameEvent[] = [];
    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Advance to week 5: both the rent (due week 4) and loan (due week 4) periods lapse unpaid.
    while (state.week < 5) step({ type: "EndTurn" });

    let p = state.players[0];
    expect(p.rentDebt).toBe(325);
    expect(p.everInRentDebt).toBe(true);
    expect(p.loanInDefault).toBe(true);
    expect(p.timesDefaulted).toBe(1);
    expect(allEvents.some((e) => e.type === "RentDebtIncurred")).toBe(true);
    expect(allEvents.some((e) => e.type === "LoanDefaulted")).toBe(true);

    // Work one session at Z-Mart: earned = floor(8 * 10 * 6 / 6) = 80; half (40) → debt, $2 interest.
    step({ type: "TravelTo", locationId: "zMart" });
    step({ type: "EnterBuilding" });
    const cashBeforeWork = state.players[0].cash;
    step({ type: "Work" });
    p = state.players[0];
    expect(p.rentDebt).toBe(285);                 // 325 - 40
    expect(p.cash).toBe(cashBeforeWork + 38);     // 80 - 40 - 2
    expect(allEvents.some((e) => e.type === "Garnished" && e.toDebt === 40 && e.interest === 2)).toBe(true);

    // Pay down the defaulted loan at the Bank: clears the default flag.
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "bank" });
    step({ type: "EnterBuilding" });
    const cashBeforePay = state.players[0].cash;
    step({ type: "PayLoan" });
    p = state.players[0];
    expect(p.loanInDefault).toBe(false);
    expect(p.loanBalance).toBe(955);              // 1000 - 45
    expect(p.cash).toBe(cashBeforePay - 50);
    expect(allEvents.some((e) => e.type === "LoanPaid")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the full suite and typecheck**

Run: `pnpm test`
Expected: all tests pass, including the new lifecycle test.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/integration.game.test.ts
git commit -m "test(core): rent-debt garnishment and loan-default recovery lifecycle"
```

---

## Self-review notes

- **Spec coverage:** §9 Loans "Payments: $50 each ($45 to debt, $5 interest); debt <$50 cleared with no interest; one payment/Month avoids Default; extra payments push the deadline forward a Month" → Task 1. §10 "Rent Debt (missed payment, no extension): debt += one month's rent; never evicted" → Task 2 rent branch. §9 "Defaulting: −1 Happiness/Month, permanent Risk increase (TimesDefaulted never resets)" → Task 2 loan branch (note `timesDefaulted` only ever increments). §2 start-of-turn ordering (win check before rent/loan notices) → Task 2 Step 5 places `applyDueDates` in the `else` of the win check.
- **Dormant code activation:** Task 2 is what first sets `rentDebt > 0` and `everInRentDebt = true`, so the existing `applyGarnishment` (Work) and auto-deny-extension (`requestRentExtension`) paths become reachable; Task 3 exercises the garnishment path end-to-end.
- **Type consistency:** handler is `payLoan` (matches `applyLoan`); `applyDueDates(p, state, config, events)`; event names `LoanPaid` / `RentDebtIncurred` / `LoanDefaulted` are used identically in types, handlers, and tests; `loanDueWeek` stays `number | null` and `LoanPaid.dueWeek` mirrors that.
- **No regressions:** existing turn/finance/integration tests stay below week 4 or pass a winning player (due processing is skipped on win) or only assert "advanced + no crash," so adding due processing does not change their expectations.
