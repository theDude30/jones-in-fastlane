# M3d Housing & Pawn Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add rent/housing (pay rent, request extension, switch apartment, wage garnishment) and a shared pawn shop (pawn, redeem, buy) to the game engine.

**Architecture:** Two new modules in `@jones/core/src`: `housing.ts` (rent commands + `applyGarnishment` helper called from `Work`) and `pawn.ts` (pawn commands). Rent state is per-player on `PlayerState`; the pawn shop is shared global state on `GameState.pawnedItems`. The 4th-week automatic rent-due processing is deferred to M3e; garnishment is built now but stays dormant until `rentDebt > 0`.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest. Run tests with `pnpm test` from repo root; typecheck with `pnpm typecheck`.

---

## File map

| Action | File |
|--------|------|
| Modify | `packages/config/src/types.ts` — `LocationDef.baseRent`, 7 `GameConstants` fields |
| Modify | `packages/config/src/constants.ts` — 7 new constant values |
| Modify | `packages/config/src/locations.ts` — `baseRent` on the two apartments |
| Modify | `packages/core/src/types.ts` — 7 `PlayerState` fields, `GameState.pawnedItems`, `PawnedItem` interface, `DurableType` import, 6 commands, 8 events |
| Modify | `packages/core/src/setup.ts` — initialize rent fields + `pawnedItems` |
| Modify | `packages/core/src/reduce.ts` — clone `pawnedItems`, wire 6 commands, garnishment in `Work` |
| Create | `packages/core/src/housing.ts` — rent commands + garnishment |
| Create | `packages/core/src/pawn.ts` — pawn commands |
| Modify | `packages/core/src/index.ts` — export both modules |
| Create | `packages/core/test/housing.test.ts` |
| Create | `packages/core/test/pawn.test.ts` |
| Modify | `packages/core/test/integration.game.test.ts` — housing & pawn flow |

---

## Task 1: Config — baseRent, constants, location data

**Files:**
- Modify: `packages/config/src/types.ts`
- Modify: `packages/config/src/constants.ts`
- Modify: `packages/config/src/locations.ts`

- [ ] **Step 1: Add `baseRent` to `LocationDef` in `packages/config/src/types.ts`**

Inside the `LocationDef` interface, after `types: LocationType[];`, add:

```ts
  baseRent?: number;     // monthly rent base for apartment locations
```

- [ ] **Step 2: Add 7 fields to `GameConstants` in `packages/config/src/types.ts`**

Inside `GameConstants`, after the last financial field (`loanPaymentToDebt: number;`), add:

```ts
  pawnPayoutRate: number;         // 0.40 — pawn payout = 40% of current economy-adjusted value
  pawnRedeemRate: number;         // 0.50 — redeem cost = 50% of original price paid (flat)
  pawnSaleRate: number;           // 0.50 — for-sale price after expiry = 50% of price paid (flat)
  pawnMaxItems: number;           // 6 — shop capacity (total)
  pawnExpiryWeeks: number;        // 3 — weeks before an unredeemed item becomes buyable
  garnishmentInterest: number;    // 2 — $ interest deducted per garnished work session
  rentExtensionChances: number[]; // approval chance by # prior approvals (clamp at index 3)
```

- [ ] **Step 3: Add the 7 constant values to `packages/config/src/constants.ts`**

After `loanPaymentToDebt: 45,`, add:

```ts
  pawnPayoutRate: 0.4,
  pawnRedeemRate: 0.5,
  pawnSaleRate: 0.5,
  pawnMaxItems: 6,
  pawnExpiryWeeks: 3,
  garnishmentInterest: 2,
  rentExtensionChances: [1.0, 0.75, 0.5, 0.25],
```

- [ ] **Step 4: Add `baseRent` to the two apartments in `packages/config/src/locations.ts`**

Change the `lowCostHousing` line to:
```ts
  { id: "lowCostHousing", name: "Low-Cost Housing", ringIndex: 0, types: ["apartment"], baseRent: 325 },
```
Change the `securityApartments` line to:
```ts
  { id: "securityApartments", name: "Le Security Apartments", ringIndex: 11, types: ["apartment"], baseRent: 475 },
```

- [ ] **Step 5: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/constants.ts packages/config/src/locations.ts
git commit -m "feat(config): add apartment baseRent and housing/pawn constants"
```

---

## Task 2: Core types — PlayerState, GameState, PawnedItem, commands, events

**Files:**
- Modify: `packages/core/src/types.ts`

- [ ] **Step 1: Add `DurableType` to the `@jones/config` import**

Change the first import line from:
```ts
import type { DegreeId, ItemId, StockId, UniformLevel } from "@jones/config";
```
to:
```ts
import type { DegreeId, DurableType, ItemId, StockId, UniformLevel } from "@jones/config";
```

- [ ] **Step 2: Add 7 rent fields to `PlayerState`**

After the financial fields (the last is `lotteryTickets: number;`), add:

```ts
  apartmentId: string;
  currentRent: number;
  rentDueWeek: number;
  rentDebt: number;
  rentExtensionsApproved: number;
  everInRentDebt: boolean;
  rentExtensionUsedThisTurn: boolean;
```

- [ ] **Step 3: Add `PawnedItem` interface and `pawnedItems` to `GameState`**

Add this interface just above the `GameState` interface:

```ts
export interface PawnedItem {
  itemId: ItemId;
  durableType: DurableType;
  pricePaid: number;
  pawnedByPlayerId: string;
  pawnedWeek: number;
}
```

Inside `GameState`, after `stockPrices: Record<StockId, number>;`, add:

```ts
  pawnedItems: PawnedItem[];
```

- [ ] **Step 4: Add 6 commands to the `Command` union**

After the last command (`| { type: "BuyLotteryTickets" };` — change its trailing `;`), add:

```ts
  | { type: "PayRent" }
  | { type: "RequestRentExtension" }
  | { type: "SwitchApartment" }
  | { type: "PawnItem"; itemId: ItemId }
  | { type: "RedeemItem"; itemId: ItemId }
  | { type: "BuyPawnedItem"; itemId: ItemId };
```

- [ ] **Step 5: Add 8 events to the `GameEvent` union**

After the last event (`| { type: "LotteryTicketsBought"; ... };` — change its trailing `;`), add:

```ts
  | { type: "RentPaid"; playerId: string; amount: number; rentDueWeek: number }
  | { type: "RentExtensionApproved"; playerId: string; extensionsApproved: number; rentDueWeek: number }
  | { type: "RentExtensionDenied"; playerId: string; reason: "in-debt" | "luck"; happinessCost: number }
  | { type: "ApartmentSwitched"; playerId: string; apartmentId: string; newRent: number; rentDueWeek: number }
  | { type: "ItemPawned"; playerId: string; itemId: ItemId; payout: number; happinessCost: number }
  | { type: "ItemRedeemed"; playerId: string; itemId: ItemId; cost: number }
  | { type: "PawnedItemBought"; playerId: string; itemId: ItemId; cost: number }
  | { type: "Garnished"; playerId: string; toDebt: number; interest: number };
```

- [ ] **Step 6: Run typecheck**

Run: `pnpm typecheck`
Expected: errors in `setup.ts` about missing PlayerState/GameState fields — expected, fixed in Task 3.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts
git commit -m "feat(core): add housing/pawn types — fields, PawnedItem, 6 commands, 8 events"
```

---

## Task 3: Setup and cloneState

**Files:**
- Modify: `packages/core/src/setup.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Initialize rent fields in `packages/core/src/setup.ts`**

Just before the `const players: PlayerState[] = setups.map(...)` line, compute the home rent:

```ts
  const homeRent = config.locations.find((l) => l.id === c.homeLocationId)?.baseRent ?? 0;
```

Inside the player object, after the financial fields (the last is `lotteryTickets: 0,`), add:

```ts
    apartmentId: c.homeLocationId,
    currentRent: homeRent,
    rentDueWeek: c.weeksPerMonth,
    rentDebt: 0,
    rentExtensionsApproved: 0,
    everInRentDebt: false,
    rentExtensionUsedThisTurn: false,
```

- [ ] **Step 2: Initialize `pawnedItems` in the returned `GameState`**

In the `return { ... }` object, after `stockPrices: ...,`, add:

```ts
    pawnedItems: [],
```

- [ ] **Step 3: Clone `pawnedItems` in `cloneState` in `packages/core/src/reduce.ts`**

In the outer `GameState` clone object, after `stockPrices: { ...state.stockPrices },`, add:

```ts
    pawnedItems: state.pawnedItems.map((it) => ({ ...it })),
```

(The 7 new `PlayerState` fields are primitives and are already handled by `...p`.)

- [ ] **Step 4: Run typecheck and tests**

Run: `pnpm typecheck`
Expected: errors only about unhandled command cases in `reduce.ts` (added in Tasks 4–6). No errors in `setup.ts`.

Run: `pnpm test`
Expected: all existing 159 tests still pass.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/setup.ts packages/core/src/reduce.ts
git commit -m "feat(core): initialize rent fields and pawnedItems in setup and cloneState"
```

---

## Task 4: Housing — PayRent, RequestRentExtension, SwitchApartment

**Files:**
- Create: `packages/core/test/housing.test.ts`
- Create: `packages/core/src/housing.ts`
- Modify: `packages/core/src/reduce.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing housing tests in `packages/core/test/housing.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function rentGame(seed = 0): GameState {
  const state = createInitialGame(testConfig, seed, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = "rentOffice";
  state.players[0].insideBuilding = true;
  state.players[0].cash = 5000;
  state.players[0].wage = 10;
  return state;
}

describe("PayRent", () => {
  it("deducts currentRent and advances rentDueWeek by 4", () => {
    const { state, events } = reduce(rentGame(), { type: "PayRent" }, testConfig);
    expect(state.players[0].cash).toBe(5000 - 325);
    expect(state.players[0].rentDueWeek).toBe(8); // started 4, +4
    expect(events[0]).toMatchObject({ type: "RentPaid", amount: 325, rentDueWeek: 8 });
  });

  it("NotEnoughMoney when cash < rent", () => {
    const state = rentGame();
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "PayRent" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when not at rentOffice", () => {
    const state = rentGame();
    state.players[0].locationId = "bank";
    const { events } = reduce(state, { type: "PayRent" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("RequestRentExtension", () => {
  it("first request (0 prior, 100% chance) approved, advances dueWeek", () => {
    const { state, events } = reduce(rentGame(), { type: "RequestRentExtension" }, testConfig);
    expect(state.players[0].rentExtensionsApproved).toBe(1);
    expect(state.players[0].rentDueWeek).toBe(8);
    expect(state.players[0].rentExtensionUsedThisTurn).toBe(true);
    expect(events[0]).toMatchObject({ type: "RentExtensionApproved", extensionsApproved: 1, rentDueWeek: 8 });
  });

  it("auto-denied with reason in-debt when everInRentDebt", () => {
    const state = rentGame();
    state.players[0].everInRentDebt = true;
    const { state: s, events } = reduce(state, { type: "RequestRentExtension" }, testConfig);
    expect(s.players[0].happiness).toBe(-1);
    expect(events[0]).toMatchObject({ type: "RentExtensionDenied", reason: "in-debt", happinessCost: 1 });
  });

  it("second request in same turn is InvalidAction", () => {
    const { state: s1 } = reduce(rentGame(), { type: "RequestRentExtension" }, testConfig);
    const { events } = reduce(s1, { type: "RequestRentExtension" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "extension already requested this turn" });
  });

  it("denied with reason luck when RNG roll fails the tier chance", () => {
    // seed 1 → first nextFloat = 0.6271; at rentExtensionsApproved=3 chance is 0.25; 0.6271 >= 0.25 → denied
    const state = rentGame(1);
    state.players[0].rentExtensionsApproved = 3;
    const { state: s, events } = reduce(state, { type: "RequestRentExtension" }, testConfig);
    expect(s.players[0].happiness).toBe(-1);
    expect(s.players[0].rentExtensionsApproved).toBe(3); // unchanged
    expect(events[0]).toMatchObject({ type: "RentExtensionDenied", reason: "luck", happinessCost: 1 });
  });
});

describe("SwitchApartment", () => {
  it("switches lowCost → security, locks new rent, charges a month, resets dueWeek", () => {
    const { state, events } = reduce(rentGame(), { type: "SwitchApartment" }, testConfig);
    expect(state.players[0].apartmentId).toBe("securityApartments");
    expect(state.players[0].currentRent).toBe(475);
    expect(state.players[0].cash).toBe(5000 - 475);
    expect(state.players[0].rentDueWeek).toBe(5); // week 1 + 4
    expect(events[0]).toMatchObject({ type: "ApartmentSwitched", apartmentId: "securityApartments", newRent: 475, rentDueWeek: 5 });
  });

  it("toggles back security → lowCost", () => {
    const { state: s1 } = reduce(rentGame(), { type: "SwitchApartment" }, testConfig);
    const { state: s2 } = reduce(s1, { type: "SwitchApartment" }, testConfig);
    expect(s2.players[0].apartmentId).toBe("lowCostHousing");
    expect(s2.players[0].currentRent).toBe(325);
  });

  it("rentDebt carries over unchanged", () => {
    const state = rentGame();
    state.players[0].rentDebt = 200;
    const { state: s } = reduce(state, { type: "SwitchApartment" }, testConfig);
    expect(s.players[0].rentDebt).toBe(200);
  });

  it("NotEnoughMoney when cash < new rent", () => {
    const state = rentGame();
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "SwitchApartment" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test -- packages/core/test/housing.test.ts 2>&1 | tail -15`
Expected: FAIL — the commands are unhandled (`InvalidAction "unhandled command ..."`).

- [ ] **Step 3: Create `packages/core/src/housing.ts`**

```ts
import type { GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import type { Economy } from "./economy.js";
import { nextFloat } from "./rng.js";

function playerAtRentOffice(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "rentOffice") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}

export function payRent(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtRentOffice(state, events);
  if (!p) return;
  if (p.cash < p.currentRent) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "PayRent" });
    return;
  }
  p.cash -= p.currentRent;
  p.rentDueWeek += config.constants.weeksPerMonth;
  events.push({ type: "RentPaid", playerId: p.id, amount: p.currentRent, rentDueWeek: p.rentDueWeek });
}

export function requestRentExtension(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtRentOffice(state, events);
  if (!p) return;
  if (p.rentExtensionUsedThisTurn) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "extension already requested this turn" });
    return;
  }
  p.rentExtensionUsedThisTurn = true;

  if (p.everInRentDebt) {
    p.happiness -= 1;
    events.push({ type: "RentExtensionDenied", playerId: p.id, reason: "in-debt", happinessCost: 1 });
    return;
  }

  const tier = Math.min(p.rentExtensionsApproved, config.constants.rentExtensionChances.length - 1);
  const chance = config.constants.rentExtensionChances[tier];
  const { value: roll, state: rng } = nextFloat(state.rng);
  state.rng = rng;

  if (roll < chance) {
    p.rentExtensionsApproved += 1;
    p.rentDueWeek += config.constants.weeksPerMonth;
    events.push({ type: "RentExtensionApproved", playerId: p.id, extensionsApproved: p.rentExtensionsApproved, rentDueWeek: p.rentDueWeek });
  } else {
    p.happiness -= 1;
    events.push({ type: "RentExtensionDenied", playerId: p.id, reason: "luck", happinessCost: 1 });
  }
}

export function switchApartment(state: GameState, config: GameConfig, economy: Economy, events: GameEvent[]): void {
  const p = playerAtRentOffice(state, events);
  if (!p) return;
  const other = config.locations.find((l) => l.types.includes("apartment") && l.id !== p.apartmentId);
  if (!other || other.baseRent === undefined) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no alternate apartment" });
    return;
  }
  const newRent = Math.round(economy.adjustedPrice(other.baseRent, state.economy.reading));
  if (p.cash < newRent) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "SwitchApartment" });
    return;
  }
  p.cash -= newRent;
  p.apartmentId = other.id;
  p.currentRent = newRent;
  p.rentDueWeek = state.week + config.constants.weeksPerMonth;
  events.push({ type: "ApartmentSwitched", playerId: p.id, apartmentId: p.apartmentId, newRent, rentDueWeek: p.rentDueWeek });
}
```

- [ ] **Step 4: Wire the three commands in `packages/core/src/reduce.ts`**

Add the import after the finance import:
```ts
import { payRent, requestRentExtension, switchApartment } from "./housing.js";
```

In the switch, after the `BuyLotteryTickets` case, add:
```ts
    case "PayRent":
      payRent(next, config, events);
      break;
    case "RequestRentExtension":
      requestRentExtension(next, config, events);
      break;
    case "SwitchApartment":
      switchApartment(next, config, economy, events);
      break;
```

- [ ] **Step 5: Export housing from `packages/core/src/index.ts`**

After `export * from "./finance.js";`, add:
```ts
export * from "./housing.js";
```

- [ ] **Step 6: Run the housing tests, then the full suite**

Run: `pnpm test -- packages/core/test/housing.test.ts 2>&1 | tail -8`
Expected: all housing tests pass.

Run: `pnpm test`
Expected: all tests pass.

- [ ] **Step 7: Run typecheck**

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/housing.ts packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/housing.test.ts
git commit -m "feat(core): add PayRent, RequestRentExtension, SwitchApartment commands"
```

---

## Task 5: Garnishment in the Work handler

**Files:**
- Modify: `packages/core/test/housing.test.ts`
- Modify: `packages/core/src/housing.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Add garnishment tests to `packages/core/test/housing.test.ts`**

Append after the `SwitchApartment` describe block. These place the player at Z-Mart with the known-valid casual job `"zMart.clerk"` (used in the existing integration tests) so a single `Work` command produces a known gross `earned`. With `constantEconomyConfig` the wage is not economy-adjusted. With `wage=10`, `hours=6`, `fullHours=6`, gross `earned = Math.floor(8 × 10 × 6 / 6) = 80`. The player's default `clothing.casual` (6) already meets the clerk's casual uniform; `maxDependibility`/`dependibility` are raised so the work session is not a firing.

```ts
function workerInDebt(rentDebt: number): GameState {
  const state = rentGame();
  const p = state.players[0];
  p.locationId = "zMart";
  p.insideBuilding = true;
  p.jobId = "zMart.clerk";
  p.wage = 10;
  p.maxExperience = 50;
  p.maxDependibility = 50;
  p.dependibility = 50;
  p.hoursRemaining = 6; // exactly one full work session
  p.cash = 5000;
  p.rentDebt = rentDebt;
  return state;
}

describe("garnishment during Work", () => {
  it("debt >= half: half to debt, $2 interest, rest to cash", () => {
    const state = workerInDebt(100);
    const { state: s, events } = reduce(state, { type: "Work" }, testConfig);
    // earned = 80; half = 40; debt 100 >= 40 → debt 60, cash += 80-40-2 = 38
    expect(s.players[0].rentDebt).toBe(60);
    expect(s.players[0].cash).toBe(5000 + 38);
    expect(events.some((e) => e.type === "Worked" && e.earned === 80)).toBe(true);
    expect(events.some((e) => e.type === "Garnished" && e.toDebt === 40 && e.interest === 2)).toBe(true);
  });

  it("debt < half: only debt taken, no interest", () => {
    const state = workerInDebt(10);
    const { state: s, events } = reduce(state, { type: "Work" }, testConfig);
    // earned = 80; half = 40; debt 10 < 40 → debt 0, cash += 80-10 = 70
    expect(s.players[0].rentDebt).toBe(0);
    expect(s.players[0].cash).toBe(5000 + 70);
    expect(events.some((e) => e.type === "Garnished" && e.toDebt === 10 && e.interest === 0)).toBe(true);
  });

  it("no debt: full earnings, no Garnished event", () => {
    const state = workerInDebt(0);
    const { state: s, events } = reduce(state, { type: "Work" }, testConfig);
    expect(s.players[0].cash).toBe(5000 + 80);
    expect(events.some((e) => e.type === "Garnished")).toBe(false);
  });
});
```

- [ ] **Step 2: Run tests to confirm garnishment tests fail**

Run: `pnpm test -- packages/core/test/housing.test.ts 2>&1 | tail -15`
Expected: the three garnishment tests FAIL (Work doesn't garnish yet; cash will be `5000 + 80` and no `Garnished` event).

- [ ] **Step 3: Add `applyGarnishment` to `packages/core/src/housing.ts`**

Append at the end of the file:

```ts
export function applyGarnishment(
  p: PlayerState,
  earned: number,
  config: GameConfig,
  events: GameEvent[],
): number {
  const half = Math.floor(earned / 2);
  if (p.rentDebt >= half) {
    p.rentDebt -= half;
    const keep = Math.max(0, earned - half - config.constants.garnishmentInterest);
    events.push({ type: "Garnished", playerId: p.id, toDebt: half, interest: config.constants.garnishmentInterest });
    return keep;
  }
  const taken = p.rentDebt;
  p.rentDebt = 0;
  events.push({ type: "Garnished", playerId: p.id, toDebt: taken, interest: 0 });
  return earned - taken;
}
```

- [ ] **Step 4: Call `applyGarnishment` from the `Work` handler in `packages/core/src/reduce.ts`**

Add `applyGarnishment` to the housing import:
```ts
import { payRent, requestRentExtension, switchApartment, applyGarnishment } from "./housing.js";
```

In the `Work` case, replace this line:
```ts
      p.cash += earned;
```
with:
```ts
      p.cash += p.rentDebt > 0 ? applyGarnishment(p, earned, config, events) : earned;
```

- [ ] **Step 5: Run the full suite and typecheck**

Run: `pnpm test`
Expected: all tests pass, including the three garnishment tests.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/housing.ts packages/core/src/reduce.ts packages/core/test/housing.test.ts
git commit -m "feat(core): garnish wages during Work while in rent debt"
```

---

## Task 6: Pawn — PawnItem, RedeemItem, BuyPawnedItem

**Files:**
- Create: `packages/core/test/pawn.test.ts`
- Create: `packages/core/src/pawn.ts`
- Modify: `packages/core/src/reduce.ts`
- Modify: `packages/core/src/index.ts`

- [ ] **Step 1: Write the failing pawn tests in `packages/core/test/pawn.test.ts`**

`refrigeratorSocket` has `basePrice: 876` and `durableType: "refrigerator"`. With `constantEconomyConfig`, `adjustedPrice(876, reading) = 876`. Payout = `round(0.40 × 876) = 350`. Redeem/sale = `round(0.50 × pricePaid)`.

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function pawnGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  const p = state.players[0];
  p.locationId = "pawnShop";
  p.insideBuilding = true;
  p.cash = 2000;
  p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
  return state;
}

describe("PawnItem", () => {
  it("removes durable, pays 40% of economy-adjusted value, -1 happiness, adds to shop", () => {
    const { state, events } = reduce(pawnGame(), { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    const p = state.players[0];
    expect(p.durables.find((d) => d.itemId === "refrigeratorSocket")).toBeUndefined();
    expect(p.cash).toBe(2000 + 350);
    expect(p.happiness).toBe(-1);
    expect(state.pawnedItems).toHaveLength(1);
    expect(state.pawnedItems[0]).toMatchObject({
      itemId: "refrigeratorSocket",
      durableType: "refrigerator",
      pricePaid: 876,
      pawnedByPlayerId: "p0",
      pawnedWeek: 1,
    });
    expect(events[0]).toMatchObject({ type: "ItemPawned", itemId: "refrigeratorSocket", payout: 350, happinessCost: 1 });
  });

  it("InvalidAction when the player does not own the item", () => {
    const state = pawnGame();
    state.players[0].durables = [];
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "not owned" });
  });

  it("InvalidAction when the shop is full", () => {
    const state = pawnGame();
    state.pawnedItems = Array.from({ length: 6 }, (_, i) => ({
      itemId: "stoveSocket" as const,
      durableType: "stove" as const,
      pricePaid: 100,
      pawnedByPlayerId: "pX",
      pawnedWeek: 1,
    }));
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "pawn shop full" });
  });

  it("InvalidAction when the shop already holds that durableType", () => {
    const state = pawnGame();
    state.pawnedItems = [{
      itemId: "refrigeratorZMart", durableType: "refrigerator", pricePaid: 650, pawnedByPlayerId: "pX", pawnedWeek: 1,
    }];
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "type already pawned" });
  });

  it("InvalidAction when not at the pawn shop", () => {
    const state = pawnGame();
    state.players[0].locationId = "bank";
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("RedeemItem", () => {
  function pawnedState(week: number, pawnedWeek = 1): GameState {
    const state = pawnGame();
    state.week = week;
    state.players[0].durables = [];
    state.pawnedItems = [{
      itemId: "refrigeratorSocket", durableType: "refrigerator", pricePaid: 876, pawnedByPlayerId: "p0", pawnedWeek,
    }];
    return state;
  }

  it("original pawner redeems within window: pays 50% of pricePaid, gets durable back", () => {
    const { state, events } = reduce(pawnedState(2), { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    const p = state.players[0];
    expect(p.cash).toBe(2000 - 438); // round(0.5 * 876)
    expect(p.durables.find((d) => d.itemId === "refrigeratorSocket")).toMatchObject({ pricePaid: 876 });
    expect(state.pawnedItems).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: "ItemRedeemed", itemId: "refrigeratorSocket", cost: 438 });
  });

  it("InvalidAction when a different player pawned it", () => {
    const state = pawnedState(2);
    state.pawnedItems[0].pawnedByPlayerId = "pX";
    const { events } = reduce(state, { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "not your item" });
  });

  it("InvalidAction when the 3-week window has passed", () => {
    const state = pawnedState(4); // week 4, pawnedWeek 1 → 3 weeks elapsed
    const { events } = reduce(state, { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "redeem window expired" });
  });

  it("NotEnoughMoney when cash < cost", () => {
    const state = pawnedState(2);
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});

describe("BuyPawnedItem", () => {
  function expiredState(week = 4): GameState {
    const state = pawnGame();
    state.week = week;
    state.players[0].durables = [];
    state.pawnedItems = [{
      itemId: "refrigeratorSocket", durableType: "refrigerator", pricePaid: 876, pawnedByPlayerId: "pX", pawnedWeek: 1,
    }];
    return state;
  }

  it("after expiry any player buys at 50% of pricePaid; basis = cost", () => {
    const { state, events } = reduce(expiredState(4), { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    const p = state.players[0];
    expect(p.cash).toBe(2000 - 438);
    expect(p.durables.find((d) => d.itemId === "refrigeratorSocket")).toMatchObject({ pricePaid: 438 });
    expect(state.pawnedItems).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: "PawnedItemBought", itemId: "refrigeratorSocket", cost: 438 });
  });

  it("InvalidAction before expiry (still redeem-only)", () => {
    const { events } = reduce(expiredState(2), { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "not yet for sale" });
  });

  it("InvalidAction when buyer already owns that durableType", () => {
    const state = expiredState(4);
    state.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const { events } = reduce(state, { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });

  it("NotEnoughMoney when cash < cost", () => {
    const state = expiredState(4);
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});
```

- [ ] **Step 2: Run tests to confirm they fail**

Run: `pnpm test -- packages/core/test/pawn.test.ts 2>&1 | tail -15`
Expected: FAIL — pawn commands unhandled.

- [ ] **Step 3: Create `packages/core/src/pawn.ts`**

```ts
import type { GameConfig, ItemId } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import type { Economy } from "./economy.js";

function playerAtPawnShop(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "pawnShop") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}

export function pawnItem(itemId: ItemId, state: GameState, config: GameConfig, economy: Economy, events: GameEvent[]): void {
  const p = playerAtPawnShop(state, events);
  if (!p) return;
  const idx = p.durables.findIndex((d) => d.itemId === itemId);
  if (idx < 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not owned" });
    return;
  }
  const item = config.items.find((i) => i.id === itemId);
  if (!item || item.durableType === undefined) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not a durable" });
    return;
  }
  if (state.pawnedItems.length >= config.constants.pawnMaxItems) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "pawn shop full" });
    return;
  }
  if (state.pawnedItems.some((pi) => pi.durableType === item.durableType)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "type already pawned" });
    return;
  }
  const pricePaid = p.durables[idx].pricePaid;
  p.durables.splice(idx, 1);
  const payout = Math.round(config.constants.pawnPayoutRate * economy.adjustedPrice(item.basePrice, state.economy.reading));
  p.cash += payout;
  p.happiness -= 1;
  state.pawnedItems.push({
    itemId,
    durableType: item.durableType,
    pricePaid,
    pawnedByPlayerId: p.id,
    pawnedWeek: state.week,
  });
  events.push({ type: "ItemPawned", playerId: p.id, itemId, payout, happinessCost: 1 });
}

export function redeemItem(itemId: ItemId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtPawnShop(state, events);
  if (!p) return;
  const idx = state.pawnedItems.findIndex((pi) => pi.itemId === itemId);
  if (idx < 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not in pawn shop" });
    return;
  }
  const entry = state.pawnedItems[idx];
  if (entry.pawnedByPlayerId !== p.id) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not your item" });
    return;
  }
  if (state.week - entry.pawnedWeek >= config.constants.pawnExpiryWeeks) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "redeem window expired" });
    return;
  }
  const cost = Math.round(config.constants.pawnRedeemRate * entry.pricePaid);
  if (p.cash < cost) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "RedeemItem" });
    return;
  }
  state.pawnedItems.splice(idx, 1);
  p.durables.push({ itemId, pricePaid: entry.pricePaid });
  p.cash -= cost;
  events.push({ type: "ItemRedeemed", playerId: p.id, itemId, cost });
}

export function buyPawnedItem(itemId: ItemId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtPawnShop(state, events);
  if (!p) return;
  const idx = state.pawnedItems.findIndex((pi) => pi.itemId === itemId);
  if (idx < 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not in pawn shop" });
    return;
  }
  const entry = state.pawnedItems[idx];
  if (state.week - entry.pawnedWeek < config.constants.pawnExpiryWeeks) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not yet for sale" });
    return;
  }
  const alreadyOwned = p.durables.some(
    (d) => config.items.find((i) => i.id === d.itemId)?.durableType === entry.durableType,
  );
  if (alreadyOwned) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "already owned" });
    return;
  }
  const cost = Math.round(config.constants.pawnSaleRate * entry.pricePaid);
  if (p.cash < cost) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyPawnedItem" });
    return;
  }
  state.pawnedItems.splice(idx, 1);
  p.durables.push({ itemId, pricePaid: cost });
  p.cash -= cost;
  events.push({ type: "PawnedItemBought", playerId: p.id, itemId, cost });
}
```

- [ ] **Step 4: Wire the three commands in `packages/core/src/reduce.ts`**

Add the import after the housing import:
```ts
import { pawnItem, redeemItem, buyPawnedItem } from "./pawn.js";
```

In the switch, after the `SwitchApartment` case, add:
```ts
    case "PawnItem":
      pawnItem(command.itemId, next, config, economy, events);
      break;
    case "RedeemItem":
      redeemItem(command.itemId, next, config, events);
      break;
    case "BuyPawnedItem":
      buyPawnedItem(command.itemId, next, config, events);
      break;
```

- [ ] **Step 5: Export pawn from `packages/core/src/index.ts`**

After `export * from "./housing.js";`, add:
```ts
export * from "./pawn.js";
```

- [ ] **Step 6: Run the pawn tests, then the full suite and typecheck**

Run: `pnpm test -- packages/core/test/pawn.test.ts 2>&1 | tail -8`
Expected: all pawn tests pass.

Run: `pnpm test`
Expected: all tests pass.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/pawn.ts packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/pawn.test.ts
git commit -m "feat(core): add PawnItem, RedeemItem, BuyPawnedItem commands"
```

---

## Task 7: Integration test

**Files:**
- Modify: `packages/core/test/integration.game.test.ts`

- [ ] **Step 1: Add the housing & pawn flow test**

Append after the "financial flow" describe block (end of file):

```ts
describe("housing & pawn flow", () => {
  it("buys a durable, pawns and redeems it, then pays rent and switches apartment", () => {
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

    // Buy a refrigerator at Socket City ($876)
    step({ type: "TravelTo", locationId: "socketCity" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "refrigeratorSocket" });
    const afterBuyCash = state.players[0].cash;

    // Travel to the Pawn Shop, pawn it (payout 350), then redeem it same week (cost 438)
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "pawnShop" });
    step({ type: "EnterBuilding" });
    step({ type: "PawnItem", itemId: "refrigeratorSocket" });
    expect(state.pawnedItems).toHaveLength(1);
    expect(state.players[0].cash).toBe(afterBuyCash + 350);

    step({ type: "RedeemItem", itemId: "refrigeratorSocket" });
    expect(state.pawnedItems).toHaveLength(0);
    expect(state.players[0].durables.find((d) => d.itemId === "refrigeratorSocket")).toBeDefined();

    // Travel to the Rent Office, pay rent then switch apartment
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "rentOffice" });
    step({ type: "EnterBuilding" });
    step({ type: "PayRent" });
    const dueAfterPay = state.players[0].rentDueWeek;
    step({ type: "SwitchApartment" });

    const p = state.players[0];
    expect(dueAfterPay).toBe(8);                 // started 4, +4 from PayRent
    expect(p.apartmentId).toBe("securityApartments");
    expect(p.currentRent).toBe(475);
    expect(allEvents.some((e) => e.type === "ItemPawned")).toBe(true);
    expect(allEvents.some((e) => e.type === "ItemRedeemed")).toBe(true);
    expect(allEvents.some((e) => e.type === "RentPaid")).toBe(true);
    expect(allEvents.some((e) => e.type === "ApartmentSwitched")).toBe(true);
  });
});
```

- [ ] **Step 2: Run the full suite and typecheck**

Run: `pnpm test`
Expected: all tests pass, including the new integration test.

Run: `pnpm typecheck`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add packages/core/test/integration.game.test.ts
git commit -m "test(core): add housing & pawn flow integration test"
```
