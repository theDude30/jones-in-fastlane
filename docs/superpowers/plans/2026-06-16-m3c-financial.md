# M3c Financial Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add banking (Deposit/Withdraw), loan application, stock/T-bill trading via a broker, and lottery ticket purchases to the game engine.

**Architecture:** Single `finance.ts` module in `@jones/core/src`, wired into `reduce.ts` as 9 new commands. Stock definitions live in a new `stocks.ts` in `@jones/config`. Current stock prices live in `GameState.stockPrices` (initialized to base prices; weekly fluctuation is M3e). All tests go through `reduce()`.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest. Run tests with `pnpm test` from repo root; typecheck with `pnpm typecheck`.

---

## File map

| Action | File |
|--------|------|
| Modify | `packages/config/src/types.ts` — add `StockId`, `StockDef`, extend `GameConstants`, extend `GameConfig` |
| Modify | `packages/config/src/constants.ts` — add 6 new constants |
| Create | `packages/config/src/stocks.ts` — 5 stock definitions |
| Modify | `packages/config/src/defaultConfig.ts` — add `stocks` field |
| Modify | `packages/config/src/index.ts` — export `stocks` |
| Modify | `packages/core/src/types.ts` — add 8 `PlayerState` fields, 1 `GameState` field, 9 commands, 10 events, import `StockId` |
| Modify | `packages/core/src/setup.ts` — initialize new fields |
| Modify | `packages/core/src/reduce.ts` — clone new fields, wire 9 commands, clear `brokerMenuOpen` on `ExitBuilding` |
| Create | `packages/core/src/finance.ts` — all financial operations |
| Modify | `packages/core/src/index.ts` — export `finance.js` |
| Create | `packages/core/test/finance.test.ts` — ~30 tests |
| Modify | `packages/core/test/integration.game.test.ts` — add financial flow test |

---

## Task 1: Config — StockId, StockDef, constants, stocks data

**Files:**
- Modify: `packages/config/src/types.ts`
- Modify: `packages/config/src/constants.ts`
- Create: `packages/config/src/stocks.ts`
- Modify: `packages/config/src/defaultConfig.ts`
- Modify: `packages/config/src/index.ts`

- [ ] **Step 1: Add `StockId` and `StockDef` to `packages/config/src/types.ts`**

After the last line of the file (after the closing `}` of `ItemDef`), append:

```ts
export type StockId = "gold" | "silver" | "porkBellies" | "blueChip" | "pennyStocks";

export interface StockDef {
  id: StockId;
  name: string;
  basePrice: number;
}
```

- [ ] **Step 2: Add 6 new fields to `GameConstants` in `packages/config/src/types.ts`**

Inside the `GameConstants` interface, after `maxEnrollments: number;`, add:

```ts
tBillBuyPrice: number;     // 100
tBillSellPrice: number;    // 97
lotteryBatchSize: number;  // 10 tickets per $10 batch
lotteryBatchPrice: number; // 10 (fixed, never economy-adjusted)
loanPaymentAmount: number; // 50 monthly payment
loanPaymentToDebt: number; // 45 of the $50 reduces balance; $5 is interest
```

- [ ] **Step 3: Add `stocks` field to `GameConfig` in `packages/config/src/types.ts`**

Inside the `GameConfig` interface, after `items: ItemDef[];`, add:

```ts
stocks: StockDef[];
```

- [ ] **Step 4: Add new constants to `packages/config/src/constants.ts`**

After `maxEnrollments: 4,`, add:

```ts
tBillBuyPrice: 100,
tBillSellPrice: 97,
lotteryBatchSize: 10,
lotteryBatchPrice: 10,
loanPaymentAmount: 50,
loanPaymentToDebt: 45,
```

- [ ] **Step 5: Create `packages/config/src/stocks.ts`**

```ts
import type { StockDef } from "./types.js";

export const stocks: StockDef[] = [
  { id: "gold",        name: "Gold",         basePrice: 413 },
  { id: "silver",      name: "Silver",       basePrice: 14  },
  { id: "porkBellies", name: "Pork Bellies", basePrice: 20  },
  { id: "blueChip",    name: "Blue Chip",    basePrice: 49  },
  { id: "pennyStocks", name: "Penny Stocks", basePrice: 7   },
];
```

- [ ] **Step 6: Update `packages/config/src/defaultConfig.ts`**

Add the import:
```ts
import { stocks } from "./stocks.js";
```

Add `stocks` to the config object (after `items`):
```ts
stocks,
```

- [ ] **Step 7: Export `stocks` from `packages/config/src/index.ts`**

Add after the `items` export line:
```ts
export { stocks } from "./stocks.js";
```

- [ ] **Step 8: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/constants.ts packages/config/src/stocks.ts packages/config/src/defaultConfig.ts packages/config/src/index.ts
git commit -m "feat(config): add StockId, StockDef, stock definitions and financial constants"
```

---

## Task 2: Core types — PlayerState, GameState, commands, events

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add `StockId` to the import in `packages/core/src/types.ts`**

Change line 1 from:
```ts
import type { DegreeId, ItemId, UniformLevel } from "@jones/config";
```
to:
```ts
import type { DegreeId, ItemId, StockId, UniformLevel } from "@jones/config";
```

- [ ] **Step 2: Add 8 new fields to `PlayerState`**

After `happyGroupsThisTurn: string[];`, add:

```ts
stocks: Record<StockId, number>;
tBills: number;
loanBalance: number;
loanDueWeek: number | null;
timesDefaulted: number;
loanInDefault: boolean;
brokerMenuOpen: boolean;
lotteryTickets: number;
```

- [ ] **Step 3: Add `stockPrices` to `GameState`**

After `winners: string[];`, add:

```ts
stockPrices: Record<StockId, number>;
```

- [ ] **Step 4: Add 9 new commands to the `Command` union**

After `| { type: "BuyItem"; itemId: ItemId };`, add:

```ts
| { type: "Deposit"; amount: number }
| { type: "Withdraw"; amount: number }
| { type: "ApplyLoan" }
| { type: "OpenBroker" }
| { type: "BuyStock"; stockId: StockId }
| { type: "SellStock"; stockId: StockId }
| { type: "BuyTBill" }
| { type: "SellTBill" }
| { type: "BuyLotteryTickets" };
```

- [ ] **Step 5: Add 10 new events to the `GameEvent` union**

After the `ItemBought` event line, add:

```ts
| { type: "Deposited"; playerId: string; amount: number }
| { type: "Withdrawn"; playerId: string; amount: number }
| { type: "LoanApproved"; playerId: string; amount: number; dueWeek: number; happinessGained: number }
| { type: "LoanDenied"; playerId: string; reason: "unemployed" | "too-risky" | "in-default"; happinessCost: number }
| { type: "BrokerOpened"; playerId: string }
| { type: "StockBought"; playerId: string; stockId: StockId; price: number }
| { type: "StockSold"; playerId: string; stockId: StockId; price: number }
| { type: "TBillBought"; playerId: string; price: number }
| { type: "TBillSold"; playerId: string; proceeds: number }
| { type: "LotteryTicketsBought"; playerId: string; ticketCount: number; totalCost: number };
```

- [ ] **Step 6: Run typecheck**

```bash
pnpm typecheck
```

Expected: errors in `setup.ts` and `reduce.ts` about missing fields — that's expected; we fix them next.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add financial types — PlayerState/GameState fields, 9 commands, 10 events"
```

---

## Task 3: Setup and cloneState

**Files:**
- Modify: `packages/core/src/setup.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Add `StockId` to the import in `packages/core/src/setup.ts`**

Change line 1 from:
```ts
import type { GameConfig } from "@jones/config";
```
to:
```ts
import type { GameConfig, StockId } from "@jones/config";
```

- [ ] **Step 2: Initialize new `PlayerState` fields in `packages/core/src/setup.ts`**

After `happyGroupsThisTurn: [],`, add:

```ts
stocks: { gold: 0, silver: 0, porkBellies: 0, blueChip: 0, pennyStocks: 0 },
tBills: 0,
loanBalance: 0,
loanDueWeek: null,
timesDefaulted: 0,
loanInDefault: false,
brokerMenuOpen: false,
lotteryTickets: 0,
```

- [ ] **Step 3: Initialize `stockPrices` in the returned `GameState` in `packages/core/src/setup.ts`**

After `winners: [],`, add:

```ts
stockPrices: Object.fromEntries(
  config.stocks.map((s) => [s.id, s.basePrice])
) as Record<StockId, number>,
```

- [ ] **Step 4: Update `cloneState` in `packages/core/src/reduce.ts`**

In `cloneState`, inside the `players.map()`, after `happyGroupsThisTurn: [...p.happyGroupsThisTurn],`, add:

```ts
stocks: { ...p.stocks },
```

The other new fields (`tBills`, `loanBalance`, `loanDueWeek`, `timesDefaulted`, `loanInDefault`, `brokerMenuOpen`, `lotteryTickets`) are primitives and are already spread via `...p`.

In the outer clone object (at the `GameState` level), after `economy: { ...state.economy },`, add:

```ts
stockPrices: { ...state.stockPrices },
```

- [ ] **Step 5: Run typecheck**

```bash
pnpm typecheck
```

Expected: errors about unhandled command cases in `reduce.ts` — those go away in later tasks.

- [ ] **Step 6: Run tests**

```bash
pnpm test
```

Expected: all existing tests still pass (the new fields have sensible defaults).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/setup.ts packages/core/src/reduce.ts
git commit -m "feat(core): initialize financial state fields in setup and cloneState"
```

---

## Task 4: Banking — Deposit and Withdraw

**Files:**
- Create: `packages/core/test/finance.test.ts`
- Create: `packages/core/src/finance.ts`
- Modify: `packages/core/src/reduce.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write failing banking tests in `packages/core/test/finance.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function bankGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = "bank";
  state.players[0].insideBuilding = true;
  state.players[0].cash = 5000;
  state.players[0].bank = 500;
  state.players[0].wage = 10;
  return state;
}

describe("Deposit", () => {
  it("decreases cash and increases bank by the amount", () => {
    const { state } = reduce(bankGame(), { type: "Deposit", amount: 300 }, testConfig);
    expect(state.players[0].cash).toBe(4700);
    expect(state.players[0].bank).toBe(800);
  });

  it("emits Deposited event", () => {
    const { events } = reduce(bankGame(), { type: "Deposit", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "Deposited", amount: 300 });
  });

  it("InvalidAction when amount is not a positive multiple of 100", () => {
    const { events } = reduce(bankGame(), { type: "Deposit", amount: 150 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction" });
  });

  it("NotEnoughMoney when cash < amount", () => {
    const state = bankGame();
    state.players[0].cash = 200;
    const { events } = reduce(state, { type: "Deposit", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when not at bank", () => {
    const state = bankGame();
    state.players[0].locationId = "zMart";
    const { events } = reduce(state, { type: "Deposit", amount: 100 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("Withdraw", () => {
  it("decreases bank and increases cash by the amount", () => {
    const { state } = reduce(bankGame(), { type: "Withdraw", amount: 300 }, testConfig);
    expect(state.players[0].cash).toBe(5300);
    expect(state.players[0].bank).toBe(200);
  });

  it("emits Withdrawn event", () => {
    const { events } = reduce(bankGame(), { type: "Withdraw", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "Withdrawn", amount: 300 });
  });

  it("NotEnoughMoney when bank < amount", () => {
    const state = bankGame();
    state.players[0].bank = 200;
    const { events } = reduce(state, { type: "Withdraw", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when amount is not a positive multiple of 100", () => {
    const { events } = reduce(bankGame(), { type: "Withdraw", amount: 50 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -A2 "Deposit\|Withdraw"
```

Expected: FAIL — `Deposit` and `Withdraw` are unhandled commands (reduce pushes `InvalidAction: "unhandled command Deposit"`).

- [ ] **Step 3: Create `packages/core/src/finance.ts` with deposit and withdraw**

```ts
import type { GameConfig } from "@jones/config";
import type { GameEvent, GameState } from "./types.js";

export function deposit(amount: number, state: GameState, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "bank") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }
  if (amount <= 0 || amount % 100 !== 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "amount must be a positive multiple of 100" });
    return;
  }
  if (p.cash < amount) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "Deposit" });
    return;
  }
  p.cash -= amount;
  p.bank += amount;
  events.push({ type: "Deposited", playerId: p.id, amount });
}

export function withdraw(amount: number, state: GameState, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "bank") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }
  if (amount <= 0 || amount % 100 !== 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "amount must be a positive multiple of 100" });
    return;
  }
  if (p.bank < amount) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "Withdraw" });
    return;
  }
  p.bank -= amount;
  p.cash += amount;
  events.push({ type: "Withdrawn", playerId: p.id, amount });
}
```

- [ ] **Step 4: Wire Deposit and Withdraw in `packages/core/src/reduce.ts`**

Add the import at the top:
```ts
import { deposit, withdraw } from "./finance.js";
```

In the `switch` block, after the `BuyItem` case and before the `default`, add:

```ts
case "Deposit":
  deposit(command.amount, next, events);
  break;
case "Withdraw":
  withdraw(command.amount, next, events);
  break;
```

- [ ] **Step 5: Export finance from `packages/core/src/index.ts`**

Add after the `shopping.js` export:
```ts
export * from "./finance.js";
```

- [ ] **Step 6: Run banking tests**

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -E "✓|✗|FAIL|PASS" | head -20
```

Expected: all Deposit and Withdraw tests pass.

- [ ] **Step 7: Run full test suite**

```bash
pnpm test
```

Expected: all existing tests still pass, new banking tests pass.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/finance.ts packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/finance.test.ts
git commit -m "feat(core): add Deposit and Withdraw commands"
```

---

## Task 5: Loans — ApplyLoan

**Files:**
- Modify: `packages/core/test/finance.test.ts`
- Modify: `packages/core/src/finance.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Add ApplyLoan tests to `packages/core/test/finance.test.ts`**

Append after the Withdraw describe block:

```ts
describe("ApplyLoan", () => {
  it("LoanDenied reason=unemployed when wage=0, -1 happiness, 2h deducted", () => {
    const state = bankGame();
    state.players[0].wage = 0;
    const { state: s, events } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
    expect(s.players[0].happiness).toBe(-1);
    expect(events[0]).toMatchObject({ type: "LoanDenied", reason: "unemployed", happinessCost: 1 });
  });

  it("LoanApproved: correct loanSize, dueWeek=week+4, +5 happiness, 2h deducted", () => {
    // bankGame: wage=10, cash=5000, bank=500, no stocks/tBills
    // liquidAssets = 5000 + 500 = 5500
    // liquidity = 10 + 5500/1000 = 15.5
    // risk = 5 (fresh borrower: timesDefaulted=0, loanBalance=0)
    // loanSize = 100 * floor(15.5 - 5) = 1000
    const { state: s, events } = reduce(bankGame(), { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
    expect(s.players[0].loanBalance).toBe(1000);
    expect(s.players[0].loanDueWeek).toBe(5); // week 1 + 4
    expect(s.players[0].happiness).toBe(5);
    expect(events[0]).toMatchObject({ type: "LoanApproved", amount: 1000, dueWeek: 5, happinessGained: 5 });
  });

  it("LoanDenied reason=in-default when loanInDefault=true", () => {
    const state = bankGame();
    state.players[0].loanInDefault = true;
    const { state: s, events } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
    expect(events[0]).toMatchObject({ type: "LoanDenied", reason: "in-default" });
  });

  it("risk formula: timesDefaulted=2, loanBalance=200 → risk=10, loanSize=500", () => {
    // risk = 5 + 2 + floor(200/100) + 1 = 10
    // liquidity = 10 + 5500/1000 = 15.5
    // loanSize = 100 * floor(15.5 - 10) = 500
    // new loanBalance = 200 + 500 = 700
    const state = bankGame();
    state.players[0].timesDefaulted = 2;
    state.players[0].loanBalance = 200;
    const { state: s } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].loanBalance).toBe(700);
  });

  it("hours are deducted even when loan is denied", () => {
    const state = bankGame();
    state.players[0].wage = 0;
    const { state: s } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
  });
});
```

- [ ] **Step 2: Run ApplyLoan tests to confirm they fail**

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -A2 "ApplyLoan"
```

Expected: FAIL — `ApplyLoan` is not yet wired in reduce.ts.

- [ ] **Step 3: Add `applyLoan` to `packages/core/src/finance.ts`**

Add this import at the top of finance.ts (add `StockId` and `GameConfig` to the import):
```ts
import type { GameConfig, StockId } from "@jones/config";
```

Then append after the `withdraw` function:

```ts
const STOCK_IDS: StockId[] = ["gold", "silver", "porkBellies", "blueChip", "pennyStocks"];

export function applyLoan(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "bank") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }
  if (p.hoursRemaining < config.actionCosts.applyLoan) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "ApplyLoan" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.applyLoan;

  if (p.loanInDefault) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "in-default", happinessCost: 1 });
    return;
  }
  if (p.wage === 0) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "unemployed", happinessCost: 1 });
    return;
  }

  const stockValue = STOCK_IDS.reduce(
    (sum, id) => sum + p.stocks[id] * state.stockPrices[id],
    0,
  );
  const liquidAssets = p.cash + p.bank + stockValue + p.tBills * config.constants.tBillBuyPrice;
  const liquidity = p.wage + liquidAssets / 1000;
  const risk =
    p.timesDefaulted === 0 && p.loanBalance === 0
      ? 5
      : 5 + p.timesDefaulted + Math.floor(p.loanBalance / 100) + (p.loanBalance > 0 ? 1 : 0);

  if (liquidity <= risk) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "too-risky", happinessCost: 1 });
    return;
  }

  const loanSize = 100 * Math.floor(liquidity - risk);
  const dueWeek = state.week + 4;
  p.loanBalance += loanSize;
  p.loanDueWeek = dueWeek;
  p.happiness += 5;
  events.push({ type: "LoanApproved", playerId: p.id, amount: loanSize, dueWeek, happinessGained: 5 });
}
```

- [ ] **Step 4: Wire `ApplyLoan` in `packages/core/src/reduce.ts`**

Update the import to include `applyLoan`:
```ts
import { deposit, withdraw, applyLoan } from "./finance.js";
```

In the switch block, after the `Withdraw` case, add:

```ts
case "ApplyLoan":
  applyLoan(next, config, events);
  break;
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/finance.ts packages/core/src/reduce.ts packages/core/test/finance.test.ts
git commit -m "feat(core): add ApplyLoan command"
```

---

## Task 6: Broker — OpenBroker, BuyStock, SellStock, BuyTBill, SellTBill

**Files:**
- Modify: `packages/core/test/finance.test.ts`
- Modify: `packages/core/src/finance.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Add broker tests to `packages/core/test/finance.test.ts`**

Append after the ApplyLoan describe block:

```ts
function brokerGame(): GameState {
  const state = bankGame();
  state.players[0].brokerMenuOpen = true;
  return state;
}

describe("OpenBroker", () => {
  it("deducts 2h, sets brokerMenuOpen=true, emits BrokerOpened", () => {
    const { state, events } = reduce(bankGame(), { type: "OpenBroker" }, testConfig);
    expect(state.players[0].hoursRemaining).toBe(58);
    expect(state.players[0].brokerMenuOpen).toBe(true);
    expect(events[0]).toMatchObject({ type: "BrokerOpened" });
  });

  it("InvalidAction when not at bank", () => {
    const state = bankGame();
    state.players[0].locationId = "zMart";
    const { events } = reduce(state, { type: "OpenBroker" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("BuyStock", () => {
  it("InvalidAction when brokerMenuOpen=false", () => {
    const { events } = reduce(bankGame(), { type: "BuyStock", stockId: "gold" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "broker not open" });
  });

  it("buys gold: cash decreases by base price, stocks.gold=1", () => {
    // testConfig uses constantEconomyConfig; stockPrices initialized to basePrice
    // gold basePrice = 413
    const { state } = reduce(brokerGame(), { type: "BuyStock", stockId: "gold" }, testConfig);
    expect(state.players[0].cash).toBe(5000 - 413);
    expect(state.players[0].stocks.gold).toBe(1);
  });

  it("emits StockBought with stockId and price", () => {
    const { events } = reduce(brokerGame(), { type: "BuyStock", stockId: "gold" }, testConfig);
    expect(events[0]).toMatchObject({ type: "StockBought", stockId: "gold", price: 413 });
  });

  it("NotEnoughMoney when cash < stock price", () => {
    const state = brokerGame();
    state.players[0].cash = 0;
    const { events } = reduce(state, { type: "BuyStock", stockId: "gold" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("can buy multiple different stocks in one broker session", () => {
    const { state: s1 } = reduce(brokerGame(), { type: "BuyStock", stockId: "gold" }, testConfig);
    const { state: s2 } = reduce(s1, { type: "BuyStock", stockId: "silver" }, testConfig);
    expect(s2.players[0].stocks.gold).toBe(1);
    expect(s2.players[0].stocks.silver).toBe(1);
  });
});

describe("SellStock", () => {
  it("InvalidAction when 0 shares owned", () => {
    const { events } = reduce(brokerGame(), { type: "SellStock", stockId: "gold" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "no shares to sell" });
  });

  it("decrements holdings and increases cash by price", () => {
    const state = brokerGame();
    state.players[0].stocks.gold = 2;
    state.players[0].cash = 0;
    const { state: s } = reduce(state, { type: "SellStock", stockId: "gold" }, testConfig);
    expect(s.players[0].stocks.gold).toBe(1);
    expect(s.players[0].cash).toBe(413);
  });
});

describe("BuyTBill", () => {
  it("decreases cash by 100, increments tBills", () => {
    const { state } = reduce(brokerGame(), { type: "BuyTBill" }, testConfig);
    expect(state.players[0].cash).toBe(4900);
    expect(state.players[0].tBills).toBe(1);
  });

  it("emits TBillBought with price=100", () => {
    const { events } = reduce(brokerGame(), { type: "BuyTBill" }, testConfig);
    expect(events[0]).toMatchObject({ type: "TBillBought", price: 100 });
  });

  it("NotEnoughMoney when cash < 100", () => {
    const state = brokerGame();
    state.players[0].cash = 50;
    const { events } = reduce(state, { type: "BuyTBill" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});

describe("SellTBill", () => {
  it("decrements tBills and increases cash by 97", () => {
    const state = brokerGame();
    state.players[0].tBills = 1;
    state.players[0].cash = 0;
    const { state: s } = reduce(state, { type: "SellTBill" }, testConfig);
    expect(s.players[0].tBills).toBe(0);
    expect(s.players[0].cash).toBe(97);
  });

  it("emits TBillSold with proceeds=97", () => {
    const state = brokerGame();
    state.players[0].tBills = 1;
    const { events } = reduce(state, { type: "SellTBill" }, testConfig);
    expect(events[0]).toMatchObject({ type: "TBillSold", proceeds: 97 });
  });

  it("InvalidAction when tBills=0", () => {
    const { events } = reduce(brokerGame(), { type: "SellTBill" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "no T-bills to sell" });
  });
});

describe("ExitBuilding clears brokerMenuOpen", () => {
  it("brokerMenuOpen becomes false after ExitBuilding", () => {
    const { state: s1 } = reduce(bankGame(), { type: "OpenBroker" }, testConfig);
    expect(s1.players[0].brokerMenuOpen).toBe(true);
    const { state: s2 } = reduce(s1, { type: "ExitBuilding" }, testConfig);
    expect(s2.players[0].brokerMenuOpen).toBe(false);
  });

  it("BuyStock after ExitBuilding → InvalidAction", () => {
    const { state: s1 } = reduce(bankGame(), { type: "OpenBroker" }, testConfig);
    const { state: s2 } = reduce(s1, { type: "ExitBuilding" }, testConfig);
    // re-enter building to isolate the brokerMenuOpen guard
    s2.players[0].insideBuilding = true;
    const { events } = reduce(s2, { type: "BuyStock", stockId: "gold" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "broker not open" });
  });
});
```

- [ ] **Step 2: Run broker tests to confirm they fail**

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -E "BuyStock|SellStock|OpenBroker|BuyTBill|SellTBill|ExitBuilding" | head -20
```

Expected: FAIL.

- [ ] **Step 3: Add broker functions to `packages/core/src/finance.ts`**

Append after `applyLoan`:

```ts
export function openBroker(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "bank") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }
  if (p.hoursRemaining < config.actionCosts.broker) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "OpenBroker" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.broker;
  p.brokerMenuOpen = true;
  events.push({ type: "BrokerOpened", playerId: p.id });
}

export function buyStock(stockId: StockId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.brokerMenuOpen) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "broker not open" });
    return;
  }
  if (!config.stocks.some((s) => s.id === stockId)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown stock" });
    return;
  }
  const price = state.stockPrices[stockId];
  if (p.cash < price) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyStock" });
    return;
  }
  p.cash -= price;
  p.stocks[stockId] += 1;
  events.push({ type: "StockBought", playerId: p.id, stockId, price });
}

export function sellStock(stockId: StockId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.brokerMenuOpen) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "broker not open" });
    return;
  }
  if (!config.stocks.some((s) => s.id === stockId)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown stock" });
    return;
  }
  if (p.stocks[stockId] < 1) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no shares to sell" });
    return;
  }
  const price = state.stockPrices[stockId];
  p.stocks[stockId] -= 1;
  p.cash += price;
  events.push({ type: "StockSold", playerId: p.id, stockId, price });
}

export function buyTBill(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.brokerMenuOpen) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "broker not open" });
    return;
  }
  const price = config.constants.tBillBuyPrice;
  if (p.cash < price) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyTBill" });
    return;
  }
  p.cash -= price;
  p.tBills += 1;
  events.push({ type: "TBillBought", playerId: p.id, price });
}

export function sellTBill(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.brokerMenuOpen) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "broker not open" });
    return;
  }
  if (p.tBills < 1) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no T-bills to sell" });
    return;
  }
  const proceeds = config.constants.tBillSellPrice;
  p.tBills -= 1;
  p.cash += proceeds;
  events.push({ type: "TBillSold", playerId: p.id, proceeds });
}
```

- [ ] **Step 4: Clear `brokerMenuOpen` in the `ExitBuilding` handler in `packages/core/src/reduce.ts`**

Find the `ExitBuilding` case (around line 71). After `p.insideBuilding = false;`, add:
```ts
p.brokerMenuOpen = false;
```

The block should look like:
```ts
case "ExitBuilding": {
  if (!p.insideBuilding) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not inside" });
    break;
  }
  p.insideBuilding = false;
  p.brokerMenuOpen = false;
  events.push({ type: "ExitedBuilding", playerId: p.id, locationId: p.locationId });
  break;
}
```

- [ ] **Step 5: Wire broker commands in `packages/core/src/reduce.ts`**

Update the import to include broker functions:
```ts
import { deposit, withdraw, applyLoan, openBroker, buyStock, sellStock, buyTBill, sellTBill } from "./finance.js";
```

In the switch block, after the `ApplyLoan` case, add:

```ts
case "OpenBroker":
  openBroker(next, config, events);
  break;
case "BuyStock":
  buyStock(command.stockId, next, config, events);
  break;
case "SellStock":
  sellStock(command.stockId, next, config, events);
  break;
case "BuyTBill":
  buyTBill(next, config, events);
  break;
case "SellTBill":
  sellTBill(next, config, events);
  break;
```

- [ ] **Step 6: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/finance.ts packages/core/src/reduce.ts packages/core/test/finance.test.ts
git commit -m "feat(core): add OpenBroker, BuyStock, SellStock, BuyTBill, SellTBill commands"
```

---

## Task 7: Lottery — BuyLotteryTickets

**Files:**
- Modify: `packages/core/test/finance.test.ts`
- Modify: `packages/core/src/finance.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Add lottery tests to `packages/core/test/finance.test.ts`**

Append after the last describe block:

```ts
function lotteryGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = "blacksMarket";
  state.players[0].insideBuilding = true;
  state.players[0].cash = 100;
  return state;
}

describe("BuyLotteryTickets", () => {
  it("decreases cash by 10, adds 10 lotteryTickets", () => {
    const { state } = reduce(lotteryGame(), { type: "BuyLotteryTickets" }, testConfig);
    expect(state.players[0].cash).toBe(90);
    expect(state.players[0].lotteryTickets).toBe(10);
  });

  it("emits LotteryTicketsBought with ticketCount=10, totalCost=10", () => {
    const { events } = reduce(lotteryGame(), { type: "BuyLotteryTickets" }, testConfig);
    expect(events[0]).toMatchObject({ type: "LotteryTicketsBought", ticketCount: 10, totalCost: 10 });
  });

  it("buying twice gives 20 tickets total and deducts 20 cash", () => {
    const { state: s1 } = reduce(lotteryGame(), { type: "BuyLotteryTickets" }, testConfig);
    const { state: s2 } = reduce(s1, { type: "BuyLotteryTickets" }, testConfig);
    expect(s2.players[0].lotteryTickets).toBe(20);
    expect(s2.players[0].cash).toBe(80);
  });

  it("NotEnoughMoney when cash < 10", () => {
    const state = lotteryGame();
    state.players[0].cash = 5;
    const { events } = reduce(state, { type: "BuyLotteryTickets" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when not at blacksMarket", () => {
    const state = lotteryGame();
    state.players[0].locationId = "bank";
    const { events } = reduce(state, { type: "BuyLotteryTickets" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});
```

- [ ] **Step 2: Run lottery tests to confirm they fail**

```bash
pnpm test -- --reporter=verbose 2>&1 | grep -A2 "BuyLotteryTickets"
```

Expected: FAIL.

- [ ] **Step 3: Add `buyLotteryTickets` to `packages/core/src/finance.ts`**

Append after `sellTBill`:

```ts
export function buyLotteryTickets(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "blacksMarket") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }
  const cost = config.constants.lotteryBatchPrice;
  if (p.cash < cost) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyLotteryTickets" });
    return;
  }
  p.cash -= cost;
  p.lotteryTickets += config.constants.lotteryBatchSize;
  events.push({
    type: "LotteryTicketsBought",
    playerId: p.id,
    ticketCount: config.constants.lotteryBatchSize,
    totalCost: cost,
  });
}
```

- [ ] **Step 4: Wire `BuyLotteryTickets` in `packages/core/src/reduce.ts`**

Update the import:
```ts
import { deposit, withdraw, applyLoan, openBroker, buyStock, sellStock, buyTBill, sellTBill, buyLotteryTickets } from "./finance.js";
```

Add after the `SellTBill` case:

```ts
case "BuyLotteryTickets":
  buyLotteryTickets(next, config, events);
  break;
```

- [ ] **Step 5: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/finance.ts packages/core/src/reduce.ts packages/core/test/finance.test.ts
git commit -m "feat(core): add BuyLotteryTickets command"
```

---

## Task 8: Integration test

**Files:**
- Modify: `packages/core/test/integration.game.test.ts`

- [ ] **Step 1: Add financial flow test to `packages/core/test/integration.game.test.ts`**

Append after the education flow describe block:

```ts
describe("financial flow", () => {
  it("player deposits, uses broker, and buys lottery tickets", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    state.players[0].cash = 5000;
    const allEvents: GameEvent[] = [];

    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Travel to bank, deposit $500, open broker, buy gold, buy T-bill, exit
    step({ type: "TravelTo", locationId: "bank" });
    step({ type: "EnterBuilding" });
    step({ type: "Deposit", amount: 500 });
    step({ type: "OpenBroker" });
    step({ type: "BuyStock", stockId: "gold" });  // costs $413
    step({ type: "BuyTBill" });                    // costs $100
    step({ type: "ExitBuilding" });

    // brokerMenuOpen cleared after exit
    expect(state.players[0].brokerMenuOpen).toBe(false);

    // SellTBill after broker closed → InvalidAction
    const { events: afterExit } = reduce(state, { type: "SellTBill" }, config);
    expect(afterExit[0]).toMatchObject({ type: "InvalidAction", reason: "broker not open" });

    // Travel to Black's Market, buy lottery tickets
    step({ type: "TravelTo", locationId: "blacksMarket" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyLotteryTickets" });

    const p = state.players[0];
    // cash: 5000 - 500 (deposit) - 413 (gold) - 100 (tbill) - 10 (lottery) = 3977
    expect(p.cash).toBe(3977);
    expect(p.bank).toBe(500);
    expect(p.stocks.gold).toBe(1);
    expect(p.tBills).toBe(1);
    expect(p.lotteryTickets).toBe(10);

    expect(allEvents.some((e) => e.type === "Deposited")).toBe(true);
    expect(allEvents.some((e) => e.type === "StockBought")).toBe(true);
    expect(allEvents.some((e) => e.type === "LotteryTicketsBought")).toBe(true);
  });
});
```

- [ ] **Step 2: Run full test suite**

```bash
pnpm test
```

Expected: all tests pass, including the new integration test.

- [ ] **Step 3: Run typecheck**

```bash
pnpm typecheck
```

Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/core/test/integration.game.test.ts
git commit -m "test(core): add financial flow integration test"
```
