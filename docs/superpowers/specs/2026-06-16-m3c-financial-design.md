# M3c Financial Subsystem Design

## Goal

Add all financial operations to the game engine: bank deposits/withdrawals, loan applications, stock and T-bill trading via a broker, and lottery ticket purchases. Introduces 9 new commands, 10 new events, and a `finance.ts` module in `@jones/core`.

## Architecture

Single `finance.ts` module in `@jones/core/src`, following the same pattern as `shopping.ts`. All operations are pure functions receiving `(state, config, events)`. Stock definitions live in a new `stocks.ts` in `@jones/config`. Current stock prices are stored in `GameState` (initialized to base prices; weekly fluctuation is M3e).

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest, same reducer pattern as `shopping.ts`, `hire.ts`, and `education.ts`.

---

## Section 1: Config

### `StockId` (new union type in `packages/config/src/types.ts`)

```ts
export type StockId = "gold" | "silver" | "porkBellies" | "blueChip" | "pennyStocks";
```

T-Bills are NOT a `StockId` — they have fixed pricing ($100 buy / $97 sell) and different mechanics, so they are treated separately throughout.

### `StockDef` interface (new in `packages/config/src/types.ts`)

```ts
export interface StockDef {
  id: StockId;
  name: string;
  basePrice: number;
}
```

### `GameConstants` additions (`packages/config/src/types.ts`)

```ts
tBillBuyPrice: number;     // 100
tBillSellPrice: number;    // 97
lotteryBatchSize: number;  // 10  (tickets per $10 purchase)
loanPaymentAmount: number; // 50  (monthly payment)
loanPaymentToDebt: number; // 45  (portion of payment that reduces balance; $5 is interest)
```

### `GameConfig` addition (`packages/config/src/types.ts`)

```ts
stocks: StockDef[];
```

### `packages/config/src/stocks.ts` (new file)

All 5 stock definitions:

| id | name | basePrice | Low | High |
|---|---|---|---|---|
| gold | Gold | $413 | $206 | $1,032 |
| silver | Silver | $14 | $7 | $35 |
| porkBellies | Pork Bellies | $20 | $10 | $50 |
| blueChip | Blue Chip | $49 | $24 | $122 |
| pennyStocks | Penny Stocks | $7 | $3 | $17 |

Low/High columns are informational (50%–250% of base); they drive M3e fluctuation, not M3c.

---

## Section 2: State additions

### `PlayerState` new fields (`packages/core/src/types.ts`)

```ts
stocks: Record<StockId, number>;  // shares owned per stock
tBills: number;                   // T-bill units owned
loanBalance: number;              // outstanding loan ($0 = no loan)
loanDueWeek: number | null;       // week when next $50 payment is due (null = no loan)
timesDefaulted: number;           // permanent risk counter, never resets
loanInDefault: boolean;           // currently in default — blocks new loans
brokerMenuOpen: boolean;          // true after OpenBroker, cleared on ExitBuilding
lotteryTickets: number;           // tickets held for next turn's draw
```

### `GameState` new field (`packages/core/src/types.ts`)

```ts
stockPrices: Record<StockId, number>;  // current per-stock prices
```

Initialized to base prices at game start. Weekly fluctuation (per-stock reading, trend toward Index) is M3e.

### `setup.ts` additions

```ts
// PlayerState
stocks: { gold: 0, silver: 0, porkBellies: 0, blueChip: 0, pennyStocks: 0 },
tBills: 0,
loanBalance: 0,
loanDueWeek: null,
timesDefaulted: 0,
loanInDefault: false,
brokerMenuOpen: false,
lotteryTickets: 0,

// GameState
stockPrices: Object.fromEntries(config.stocks.map(s => [s.id, s.basePrice])) as Record<StockId, number>,
```

### `cloneState` in `reduce.ts`

```ts
stocks: { ...p.stocks },  // Record<StockId, number>; values are primitives, spread is sufficient
```

`tBills`, `loanBalance`, `loanDueWeek`, `timesDefaulted`, `loanInDefault`, `brokerMenuOpen`, `lotteryTickets` are primitives — no special handling. `stockPrices` on GameState is also a Record of numbers — spread it on the state clone.

---

## Section 3: Commands & Events

### New commands (`packages/core/src/types.ts`)

```ts
| { type: "Deposit"; amount: number }        // must be positive multiple of 100
| { type: "Withdraw"; amount: number }       // must be positive multiple of 100
| { type: "ApplyLoan" }                      // 2h, at bank
| { type: "OpenBroker" }                     // 2h, at bank; sets brokerMenuOpen
| { type: "BuyStock"; stockId: StockId }     // 0h, brokerMenuOpen required
| { type: "SellStock"; stockId: StockId }    // 0h, brokerMenuOpen required
| { type: "BuyTBill" }                       // 0h, brokerMenuOpen required, $100 fixed
| { type: "SellTBill" }                      // 0h, brokerMenuOpen required, $97 fixed
| { type: "BuyLotteryTickets" }              // 0h, at blacksMarket, $10 fixed → +10 tickets
```

### New events (`packages/core/src/types.ts`)

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
| { type: "LotteryTicketsBought"; playerId: string; ticketCount: number; totalCost: number }
```

`LoanApproved.happinessGained` = 5; `LoanDenied.happinessCost` = 1. Including these in the events keeps reducer outputs self-describing.

---

## Section 4: Finance logic (`packages/core/src/finance.ts`)

### Function signatures

```ts
export function deposit(amount: number, state: GameState, events: GameEvent[]): void
export function withdraw(amount: number, state: GameState, events: GameEvent[]): void
export function applyLoan(state: GameState, config: GameConfig, events: GameEvent[]): void
export function openBroker(state: GameState, config: GameConfig, events: GameEvent[]): void
export function buyStock(stockId: StockId, state: GameState, config: GameConfig, events: GameEvent[]): void
export function sellStock(stockId: StockId, state: GameState, config: GameConfig, events: GameEvent[]): void
export function buyTBill(state: GameState, config: GameConfig, events: GameEvent[]): void
export function sellTBill(state: GameState, config: GameConfig, events: GameEvent[]): void
export function buyLotteryTickets(state: GameState, config: GameConfig, events: GameEvent[]): void
```

### `deposit(amount)`

Guards (in order):
1. Player is `insideBuilding` and `locationId === "bank"` → else `InvalidAction: "wrong location"`
2. `amount > 0 && amount % 100 === 0` → else `InvalidAction: "amount must be a positive multiple of 100"`
3. `p.cash >= amount` → else `NotEnoughMoney`

Effect: `p.cash -= amount; p.bank += amount`. Emits `Deposited { amount }`.

### `withdraw(amount)`

Guards:
1. At bank + inside
2. `amount > 0 && amount % 100 === 0` → else `InvalidAction`
3. `p.bank >= amount` → else `NotEnoughMoney`

Effect: `p.bank -= amount; p.cash += amount`. Emits `Withdrawn { amount }`.

### `applyLoan()`

Guards:
1. At bank + inside
2. `p.hoursRemaining >= config.actionCosts.applyLoan` → else `NotEnoughTime`

Hours always deducted before approval check: `p.hoursRemaining -= config.actionCosts.applyLoan`.

Approval formula:
```ts
const stockValue = stockIds.reduce((sum, id) => sum + p.stocks[id] * state.stockPrices[id], 0);
const liquidAssets = p.cash + p.bank + stockValue + p.tBills * config.constants.tBillBuyPrice;
const liquidity = p.wage + liquidAssets / 1000;
const risk = (p.timesDefaulted === 0 && p.loanBalance === 0)
  ? 5
  : 5 + p.timesDefaulted + Math.floor(p.loanBalance / 100) + (p.loanBalance > 0 ? 1 : 0);
```

Deny if `p.loanInDefault` → reason `"in-default"`.  
Deny if `p.wage === 0` → reason `"unemployed"`.  
Deny if `liquidity <= risk` → reason `"too-risky"`.

On denial: `p.happiness -= 1`. Emits `LoanDenied { reason, happinessCost: 1 }`.

On approval:
```ts
const loanSize = 100 * Math.floor(liquidity - risk);
p.loanBalance += loanSize;
p.loanDueWeek = state.week + 4;
p.happiness += 5;
```
Emits `LoanApproved { amount: loanSize, dueWeek, happinessGained: 5 }`.

### `openBroker()`

Guards:
1. At bank + inside
2. `p.hoursRemaining >= config.actionCosts.broker` → else `NotEnoughTime`

Effect: `p.hoursRemaining -= config.actionCosts.broker; p.brokerMenuOpen = true`. Emits `BrokerOpened`.

### `buyStock(stockId)`

Guards:
1. `p.brokerMenuOpen` → else `InvalidAction: "broker not open"`
2. `config.stocks.some(s => s.id === stockId)` → else `InvalidAction: "unknown stock"`
3. `p.cash >= state.stockPrices[stockId]` → else `NotEnoughMoney`

Effect: `p.cash -= price; p.stocks[stockId] += 1`. Emits `StockBought { stockId, price }`.

### `sellStock(stockId)`

Guards:
1. `p.brokerMenuOpen` → else `InvalidAction`
2. Stock exists in config
3. `p.stocks[stockId] >= 1` → else `InvalidAction: "no shares to sell"`

Effect: `p.stocks[stockId] -= 1; p.cash += price`. Emits `StockSold { stockId, price }`.

### `buyTBill()`

Guards:
1. `p.brokerMenuOpen`
2. `p.cash >= config.constants.tBillBuyPrice` (100) → else `NotEnoughMoney`

Effect: `p.cash -= 100; p.tBills += 1`. Emits `TBillBought { price: 100 }`.

### `sellTBill()`

Guards:
1. `p.brokerMenuOpen`
2. `p.tBills >= 1` → else `InvalidAction: "no T-bills to sell"`

Effect: `p.tBills -= 1; p.cash += config.constants.tBillSellPrice` (97). Emits `TBillSold { proceeds: 97 }`.

### `buyLotteryTickets()`

Guards:
1. `p.insideBuilding && p.locationId === "blacksMarket"` → else `InvalidAction: "wrong location"`
2. `p.cash >= 10` → else `NotEnoughMoney`

Effect: `p.cash -= 10; p.lotteryTickets += config.constants.lotteryBatchSize` (10).  
Emits `LotteryTicketsBought { ticketCount: 10, totalCost: 10 }`.

### `reduce.ts` change

In the `ExitBuilding` handler, after setting `p.insideBuilding = false`, add:
```ts
p.brokerMenuOpen = false;
```

---

## Section 5: Testing (`packages/core/test/finance.test.ts`)

Helper `financeGame(locationId)` creates a single-player game with the player `insideBuilding` at the given location, `cash = 5000`, `bank = 500`, `wage = 10`, `hoursRemaining = 60`. Uses `constantEconomyConfig` (reading = 0).

~30 tests:

**Banking:**
1. Deposit — cash decreases, bank increases by amount
2. Deposit not multiple of 100 → `InvalidAction`
3. Deposit more than cash → `NotEnoughMoney`
4. Deposit at wrong location → `InvalidAction`
5. Withdraw — bank decreases, cash increases
6. Withdraw more than bank balance → `NotEnoughMoney`

**Loans:**
7. ApplyLoan — `wage = 0` → `LoanDenied { reason: "unemployed" }`, -1 happiness, 2h deducted
8. ApplyLoan — employed, fresh borrower → `LoanApproved`, +5 happiness, correct `loanSize`, `loanDueWeek = week + 4`, 2h deducted
9. ApplyLoan — loan size formula: `liquidity = wage + (cash+bank) / 1000`, `risk = 5`, `loanSize = 100 × floor(liquidity - 5)`
10. ApplyLoan — `loanInDefault = true` → `LoanDenied { reason: "in-default" }`
11. ApplyLoan — `timesDefaulted = 2`, existing `loanBalance = 200` raises risk; verify correct `risk = 5 + 2 + 2 + 1 = 10`
12. ApplyLoan — hours deducted even on denial

**Broker:**
13. BuyStock without OpenBroker → `InvalidAction: "broker not open"`
14. OpenBroker — deducts 2h, `brokerMenuOpen = true`, emits `BrokerOpened`
15. BuyStock gold — cash decreases by `stockPrices.gold` (413 at base), `p.stocks.gold = 1`
16. SellStock gold — cash increases by price, `p.stocks.gold = 0`
17. SellStock with 0 holdings → `InvalidAction: "no shares to sell"`
18. BuyTBill — cash decreases by 100, `tBills = 1`
19. SellTBill — cash increases by 97, `tBills = 0`
20. SellTBill with 0 tBills → `InvalidAction: "no T-bills to sell"`
21. ExitBuilding after OpenBroker clears `brokerMenuOpen`; subsequent BuyStock → `InvalidAction`
22. Can buy multiple stocks in one session (gold then silver, both succeed)

**Lottery:**
23. BuyLotteryTickets at `"blacksMarket"` — cash decreases by 10, `lotteryTickets = 10`
24. BuyLotteryTickets again — `lotteryTickets = 20`, total cash spent = 20
25. BuyLotteryTickets at wrong location → `InvalidAction`
26. BuyLotteryTickets with cash < 10 → `NotEnoughMoney`

**Integration test addition** in `integration.game.test.ts` — new `"financial flow"` describe block: player travels to bank, deposits $500, opens broker, buys gold, attempts to sell T-bill with none owned (→ `InvalidAction`), buys T-bill, exits building (`brokerMenuOpen` cleared); then travels to Black's Market, buys lottery tickets. Assert `p.bank`, `p.stocks.gold`, `p.tBills`, `p.lotteryTickets`, and that subsequent BuyStock after exit → `InvalidAction`.
