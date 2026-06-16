# M3b Items & Shopping Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add all purchasable items to the game engine — fast food, drinks, fresh food, clothes, durables, books, junk, tickets, and newspaper — via a single `BuyItem` command.

**Architecture:** Item definitions live in `@jones/config` (`items.ts`). A new `shopping.ts` in `@jones/core` implements `buyItem()` using the same `(itemId, state, config, economy, events)` pattern as `hire.ts` and `education.ts`. Tests go through `reduce()` (TDD: tests are written before wiring, then wired in Task 4).

**Tech Stack:** TypeScript strict · pnpm workspaces · Vitest · same reducer pattern as existing modules

---

## File Map

| File | Change |
|---|---|
| `packages/config/src/types.ts` | Add `ItemId`, `DurableType`, `ItemDef`; extend `GameConfig` |
| `packages/config/src/items.ts` | New — all 40 item definitions |
| `packages/config/src/defaultConfig.ts` | Add `items` field |
| `packages/config/src/index.ts` | Re-export `items` |
| `packages/core/src/types.ts` | Add 5 fields to `PlayerState`, `BuyItem` command, `ItemBought` event |
| `packages/core/src/setup.ts` | Initialize new PlayerState fields |
| `packages/core/src/reduce.ts` | Update `cloneState`; wire `BuyItem` case (Task 4) |
| `packages/core/src/shopping.ts` | New — `buyItem()` function |
| `packages/core/src/index.ts` | Re-export shopping (Task 4) |
| `packages/core/test/shopping.test.ts` | New — 22 tests |

---

## Task 1: Config — ItemId, DurableType, ItemDef, items data

**Files:**
- Modify: `packages/config/src/types.ts`
- Create: `packages/config/src/items.ts`
- Modify: `packages/config/src/defaultConfig.ts`
- Modify: `packages/config/src/index.ts`

- [ ] **Step 1: Add types to `packages/config/src/types.ts`**

Append after the `DegreeDef` interface:

```ts
export type ItemId =
  | "fries" | "hamburgers" | "cheeseburger" | "astroChicken"
  | "colasDrink" | "shakesDrink"
  | "freshFood1Wk" | "freshFood2Wk" | "freshFood4Wk"
  | "casualClothesQT" | "casualClothesZMart"
  | "dressClothesQT" | "dressClothesZMart"
  | "businessSuit"
  | "refrigeratorSocket" | "freezerSocket" | "stoveSocket" | "microwaveSocket"
  | "colorTVSocket" | "vcrSocket" | "stereoSocket" | "hotTubSocket" | "computerSocket"
  | "refrigeratorZMart" | "stoveZMart" | "microwaveZMart"
  | "colorTVZMart" | "vcrZMart" | "stereoZMart" | "bwTVZMart"
  | "encyclopedia" | "dictionary" | "atlas"
  | "dogFood" | "eightTrackPlayer" | "worksOfCapote"
  | "newspaper"
  | "baseballTicket" | "theatreTicket" | "concertTicket";

export type DurableType =
  | "refrigerator" | "freezer" | "stove" | "microwave"
  | "colorTV" | "vcr" | "stereo" | "bwTV" | "hotTub" | "computer"
  | "encyclopedia" | "dictionary" | "atlas";

export interface ItemDef {
  id: ItemId;
  category: "fastFood" | "softDrink" | "freshFood" | "clothes"
          | "durable" | "book" | "junk" | "ticket" | "newspaper";
  locationId: string;
  basePrice: number;
  fixedPrice?: true;
  happinessOnBuy?: number;
  happinessGroup?: string;
  clothingCategory?: "casual" | "dress" | "business";
  clothingWeeks?: number;
  durableType?: DurableType;
  breakChanceInverse?: number;
  wildWillyProof?: boolean;
  freshFoodWeeks?: number;
  ticketType?: "baseball" | "theatre" | "concert";
}
```

Add `items: ItemDef[]` to the `GameConfig` interface:

```ts
export interface GameConfig {
  constants: GameConstants;
  goalRanges: GoalRanges;
  actionCosts: ActionCosts;
  locations: LocationDef[];
  jobs: JobDef[];
  economy: EconomyConfig;
  degrees: DegreeDef[];
  items: ItemDef[];
}
```

- [ ] **Step 2: Create `packages/config/src/items.ts`**

```ts
import type { ItemDef } from "./types.js";

export const items: ItemDef[] = [
  // Fast Food — location: monolithBurgers
  // Fries and Hamburgers give no happiness (no happinessOnBuy); they don't consume the group slot.
  // Cheeseburger/AstroChicken do consume the "fastFood" slot (first-per-turn wins).
  { id: "fries",        category: "fastFood", locationId: "monolithBurgers", basePrice: 65 },
  { id: "hamburgers",   category: "fastFood", locationId: "monolithBurgers", basePrice: 79 },
  { id: "cheeseburger", category: "fastFood", locationId: "monolithBurgers", basePrice: 89,  happinessOnBuy: 1, happinessGroup: "fastFood" },
  { id: "astroChicken", category: "fastFood", locationId: "monolithBurgers", basePrice: 124, happinessOnBuy: 2, happinessGroup: "fastFood" },

  // Soft Drinks — location: monolithBurgers
  { id: "colasDrink",  category: "softDrink", locationId: "monolithBurgers", basePrice: 69,  happinessOnBuy: 1, happinessGroup: "softDrink" },
  { id: "shakesDrink", category: "softDrink", locationId: "monolithBurgers", basePrice: 102, happinessOnBuy: 2, happinessGroup: "softDrink" },

  // Fresh Food — location: blacksMarket; no group = happiness fires every purchase
  { id: "freshFood1Wk", category: "freshFood", locationId: "blacksMarket", basePrice: 55,  freshFoodWeeks: 1, happinessOnBuy: 1 },
  { id: "freshFood2Wk", category: "freshFood", locationId: "blacksMarket", basePrice: 100, freshFoodWeeks: 2, happinessOnBuy: 2 },
  { id: "freshFood4Wk", category: "freshFood", locationId: "blacksMarket", basePrice: 190, freshFoodWeeks: 4, happinessOnBuy: 4 },

  // Clothes — casual gives no happiness; dress/business have group (first QT purchase per turn)
  { id: "casualClothesQT",   category: "clothes", locationId: "qtClothing", basePrice: 73,  clothingCategory: "casual",   clothingWeeks: 11 },
  { id: "casualClothesZMart",category: "clothes", locationId: "zMart",      basePrice: 35,  clothingCategory: "casual",   clothingWeeks: 9 },
  { id: "dressClothesQT",    category: "clothes", locationId: "qtClothing", basePrice: 125, clothingCategory: "dress",    clothingWeeks: 13, happinessOnBuy: 1, happinessGroup: "dressClothes" },
  { id: "dressClothesZMart", category: "clothes", locationId: "zMart",      basePrice: 90,  clothingCategory: "dress",    clothingWeeks: 9 },
  { id: "businessSuit",      category: "clothes", locationId: "qtClothing", basePrice: 295, clothingCategory: "business", clothingWeeks: 13, happinessOnBuy: 2, happinessGroup: "businessSuit" },

  // Durables — Socket City (breakChanceInverse: 51 = 1/51 break chance per turn in M3e)
  // No happinessGroup: ownership guard prevents duplicates, so happiness fires exactly once naturally.
  { id: "refrigeratorSocket", category: "durable", locationId: "socketCity", basePrice: 876,  durableType: "refrigerator", happinessOnBuy: 1, breakChanceInverse: 51, wildWillyProof: true },
  { id: "freezerSocket",      category: "durable", locationId: "socketCity", basePrice: 513,  durableType: "freezer",      happinessOnBuy: 2, breakChanceInverse: 51, wildWillyProof: true },
  { id: "stoveSocket",        category: "durable", locationId: "socketCity", basePrice: 570,  durableType: "stove",        happinessOnBuy: 1, breakChanceInverse: 51, wildWillyProof: true },
  { id: "microwaveSocket",    category: "durable", locationId: "socketCity", basePrice: 330,  durableType: "microwave",    happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "colorTVSocket",      category: "durable", locationId: "socketCity", basePrice: 525,  durableType: "colorTV",      happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "vcrSocket",          category: "durable", locationId: "socketCity", basePrice: 333,  durableType: "vcr",          happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "stereoSocket",       category: "durable", locationId: "socketCity", basePrice: 412,  durableType: "stereo",       happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "hotTubSocket",       category: "durable", locationId: "socketCity", basePrice: 1255, durableType: "hotTub",       happinessOnBuy: 3, breakChanceInverse: 51, wildWillyProof: true },
  { id: "computerSocket",     category: "durable", locationId: "socketCity", basePrice: 1599, durableType: "computer",     happinessOnBuy: 3, breakChanceInverse: 51, wildWillyProof: true },

  // Durables — Z-Mart (breakChanceInverse: 36 = 1/36 break chance per turn in M3e)
  // Note: stereoZMart ($450) is more expensive than stereoSocket ($412) — matches the original game reference.
  { id: "refrigeratorZMart", category: "durable", locationId: "zMart", basePrice: 650, durableType: "refrigerator", happinessOnBuy: 1, breakChanceInverse: 36, wildWillyProof: true },
  { id: "stoveZMart",        category: "durable", locationId: "zMart", basePrice: 490, durableType: "stove",        happinessOnBuy: 1, breakChanceInverse: 36, wildWillyProof: true },
  { id: "microwaveZMart",    category: "durable", locationId: "zMart", basePrice: 220, durableType: "microwave",    happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "colorTVZMart",      category: "durable", locationId: "zMart", basePrice: 450, durableType: "colorTV",      happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "vcrZMart",          category: "durable", locationId: "zMart", basePrice: 250, durableType: "vcr",          happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "stereoZMart",       category: "durable", locationId: "zMart", basePrice: 450, durableType: "stereo",       happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "bwTVZMart",         category: "durable", locationId: "zMart", basePrice: 110, durableType: "bwTV",                            breakChanceInverse: 36 },

  // Books — Z-Mart only; no happiness on purchase; all three together → +1 extraCredit (handled in shopping.ts)
  { id: "encyclopedia", category: "book", locationId: "zMart", basePrice: 475, durableType: "encyclopedia", wildWillyProof: true },
  { id: "dictionary",   category: "book", locationId: "zMart", basePrice: 70,  durableType: "dictionary",   wildWillyProof: true },
  { id: "atlas",        category: "book", locationId: "zMart", basePrice: 55,  durableType: "atlas",         wildWillyProof: true },

  // Junk — Z-Mart; no happinessGroup = penalty fires every purchase
  { id: "dogFood",          category: "junk", locationId: "zMart", basePrice: 18,  happinessOnBuy: -1 },
  { id: "eightTrackPlayer", category: "junk", locationId: "zMart", basePrice: 75,  happinessOnBuy: -1 },
  { id: "worksOfCapote",    category: "junk", locationId: "zMart", basePrice: 100, happinessOnBuy: -2 },

  // Newspaper — Black's Market; $1 fixed price; 1 Hour cost (from config.actionCosts.newspaper)
  { id: "newspaper", category: "newspaper", locationId: "blacksMarket", basePrice: 1, fixedPrice: true },

  // Tickets — Z-Mart; +2 happiness first per type per turn
  { id: "baseballTicket", category: "ticket", locationId: "zMart", basePrice: 45, ticketType: "baseball", happinessOnBuy: 2, happinessGroup: "baseballTicket" },
  { id: "theatreTicket",  category: "ticket", locationId: "zMart", basePrice: 30, ticketType: "theatre",  happinessOnBuy: 2, happinessGroup: "theatreTicket" },
  { id: "concertTicket",  category: "ticket", locationId: "zMart", basePrice: 40, ticketType: "concert",  happinessOnBuy: 2, happinessGroup: "concertTicket" },
];
```

- [ ] **Step 3: Update `packages/config/src/defaultConfig.ts`**

```ts
import type { GameConfig } from "./types.js";
import { constants } from "./constants.js";
import { goalRanges } from "./goals.js";
import { actionCosts } from "./actionCosts.js";
import { locations } from "./locations.js";
import { jobs } from "./jobs.js";
import { degrees } from "./degrees.js";
import { items } from "./items.js";
import { defaultEconomyConfig } from "./economyConfig.js";

export const defaultConfig: GameConfig = {
  constants,
  goalRanges,
  actionCosts,
  locations,
  jobs,
  degrees,
  items,
  economy: defaultEconomyConfig,
};
```

- [ ] **Step 4: Update `packages/config/src/index.ts`**

Add one line after the `degrees` export:

```ts
export { items } from "./items.js";
```

- [ ] **Step 5: Typecheck config package**

```bash
cd /path/to/repo && pnpm --filter @jones/config typecheck
```

Expected: 0 errors.

- [ ] **Step 6: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/items.ts \
        packages/config/src/defaultConfig.ts packages/config/src/index.ts
git commit -m "feat(config): add ItemId, DurableType, ItemDef, and items data"
```

---

## Task 2: Core types — PlayerState, Command, GameEvent, setup, cloneState

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/setup.ts`
- Modify: `packages/core/src/reduce.ts`

- [ ] **Step 1: Extend `PlayerState` in `packages/core/src/types.ts`**

Update the import at the top to include `ItemId`:

```ts
import type { DegreeId, ItemId, UniformLevel } from "@jones/config";
```

Add five fields to `PlayerState` after `hoursRemaining`:

```ts
  fastFood: number;
  freshFood: number;
  durables: Array<{ itemId: ItemId; pricePaid: number }>;
  tickets: { baseball: number; theatre: number; concert: number };
  happyGroupsThisTurn: string[];
```

- [ ] **Step 2: Add `BuyItem` to the `Command` union in `packages/core/src/types.ts`**

```ts
  | { type: "BuyItem"; itemId: ItemId }
```

- [ ] **Step 3: Add `ItemBought` to the `GameEvent` union in `packages/core/src/types.ts`**

```ts
  | { type: "ItemBought"; playerId: string; itemId: ItemId; price: number; happinessGained: number; extraCreditGained: number }
```

- [ ] **Step 4: Initialize new fields in `packages/core/src/setup.ts`**

In the `players.map` block, after `hoursRemaining: c.hoursPerTurn,`:

```ts
    fastFood: 0,
    freshFood: 0,
    durables: [],
    tickets: { baseball: 0, theatre: 0, concert: 0 },
    happyGroupsThisTurn: [],
```

- [ ] **Step 5: Update `cloneState` in `packages/core/src/reduce.ts`**

The existing `cloneState` inner player spread needs three new lines. The full updated player mapping:

```ts
    players: state.players.map((p) => ({
      ...p,
      clothing: { ...p.clothing },
      degrees: [...p.degrees],
      enrollments: p.enrollments.map((e) => ({ ...e })),
      goals: { ...p.goals },
      durables: p.durables.map((d) => ({ ...d })),
      tickets: { ...p.tickets },
      happyGroupsThisTurn: [...p.happyGroupsThisTurn],
    })),
```

- [ ] **Step 6: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/setup.ts packages/core/src/reduce.ts
git commit -m "feat(core): add shopping fields to PlayerState, BuyItem command, ItemBought event"
```

---

## Task 3: Shopping module — TDD

**Files:**
- Create: `packages/core/src/shopping.ts`
- Create: `packages/core/test/shopping.test.ts`

Tests go through `reduce()`. `BuyItem` is not wired to the reducer until Task 4, so **all tests will fail** after this task — that is expected. The tests will pass once Task 4 wires the case.

- [ ] **Step 1: Write `packages/core/test/shopping.test.ts`**

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function shopGame(locationId: string, cash = 5000): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = locationId;
  state.players[0].insideBuilding = true;
  state.players[0].cash = cash;
  return state;
}

function buy(state: GameState, itemId: string) {
  return reduce(state, { type: "BuyItem", itemId: itemId as any }, testConfig);
}

describe("BuyItem guards", () => {
  it("InvalidAction when not inside building", () => {
    const state = shopGame("monolithBurgers");
    state.players[0].insideBuilding = false;
    const { events } = buy(state, "fries");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });

  it("InvalidAction when at wrong location", () => {
    const state = shopGame("socketCity");
    const { events } = buy(state, "fries"); // fries only at monolithBurgers
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });

  it("InvalidAction for unknown item id", () => {
    const state = shopGame("monolithBurgers");
    const { events } = buy(state, "doesNotExist");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "unknown item" });
  });

  it("NotEnoughMoney when cash < price", () => {
    const state = shopGame("monolithBurgers", 0);
    const { events } = buy(state, "astroChicken");
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney", action: "BuyItem" });
  });

  it("NotEnoughTime for newspaper when 0 hours", () => {
    const state = shopGame("blacksMarket");
    state.players[0].hoursRemaining = 0;
    const { events } = buy(state, "newspaper");
    expect(events[0]).toMatchObject({ type: "NotEnoughTime", action: "BuyItem" });
  });

  it("InvalidAction buying second durable of same durableType", () => {
    const state = shopGame("socketCity");
    const { state: s1 } = buy(state, "refrigeratorSocket");
    const { events } = buy(s1, "refrigeratorSocket");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });

  it("InvalidAction buying Z-Mart durable when same type already owned from Socket City", () => {
    const state = shopGame("socketCity");
    const { state: s1 } = buy(state, "refrigeratorSocket");
    s1.players[0].locationId = "zMart";
    const { events } = buy(s1, "refrigeratorZMart");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });
});

describe("Fast food", () => {
  it("increments fastFood and deducts cash", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1, events } = buy(state, "astroChicken");
    const p = s1.players[0];
    expect(p.fastFood).toBe(1);
    expect(p.cash).toBe(5000 - 124); // constantEconomy: price = basePrice
    expect(events[0]).toMatchObject({ type: "ItemBought", itemId: "astroChicken", price: 124, happinessGained: 2 });
  });

  it("first happiness-giving fast food grants happiness; second in same turn does not", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1 } = buy(state, "cheeseburger"); // +1, consumes fastFood group
    const { state: s2, events } = buy(s1, "astroChicken"); // 0 (group consumed)
    expect(s1.players[0].happiness).toBe(1);
    expect(s2.players[0].happiness).toBe(1); // unchanged
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 0 });
  });

  it("neutral fast food (fries) does not consume the group slot", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1 } = buy(state, "fries"); // no happiness, no group consumed
    const { state: s2 } = buy(s1, "cheeseburger"); // +1 because group was not consumed
    expect(s2.players[0].happiness).toBe(1);
  });
});

describe("Soft drinks", () => {
  it("first drink grants happiness; second in same turn does not", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1 } = buy(state, "colasDrink"); // +1
    const { state: s2 } = buy(s1, "shakesDrink");   // 0 (group consumed)
    expect(s1.players[0].happiness).toBe(1);
    expect(s2.players[0].happiness).toBe(1);
  });
});

describe("Fresh food", () => {
  it("adds freshFoodWeeks and always grants happiness", () => {
    const state = shopGame("blacksMarket");
    const { state: s1 } = buy(state, "freshFood2Wk");
    const { state: s2 } = buy(s1, "freshFood2Wk"); // no group = always gives happiness
    expect(s2.players[0].freshFood).toBe(4);
    expect(s2.players[0].happiness).toBe(4); // +2 twice
  });
});

describe("Clothes", () => {
  it("QT dress adds weeks and grants +1 happiness first buy", () => {
    const state = shopGame("qtClothing");
    const { state: s1, events } = buy(state, "dressClothesQT");
    expect(s1.players[0].clothing.dress).toBe(13);
    expect(s1.players[0].happiness).toBe(1);
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 1 });
  });

  it("Z-Mart dress adds weeks but gives no happiness", () => {
    const state = shopGame("zMart");
    const { state: s1, events } = buy(state, "dressClothesZMart");
    expect(s1.players[0].clothing.dress).toBe(9);
    expect(s1.players[0].happiness).toBe(0);
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 0 });
  });

  it("Z-Mart dress does not consume the dressClothes group slot", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "dressClothesZMart"); // no group consumed
    s1.players[0].locationId = "qtClothing";
    const { state: s2 } = buy(s1, "dressClothesQT"); // should still get +1
    expect(s2.players[0].happiness).toBe(1);
  });

  it("business suit adds weeks and grants +2 happiness", () => {
    const state = shopGame("qtClothing");
    const { state: s1 } = buy(state, "businessSuit");
    expect(s1.players[0].clothing.business).toBe(13);
    expect(s1.players[0].happiness).toBe(2);
  });

  it("second business suit buy same turn gives no happiness but still adds weeks", () => {
    const state = shopGame("qtClothing");
    const { state: s1 } = buy(state, "businessSuit");
    const { state: s2 } = buy(s1, "businessSuit"); // group consumed
    expect(s2.players[0].clothing.business).toBe(26);
    expect(s2.players[0].happiness).toBe(2); // unchanged
  });
});

describe("Durables", () => {
  it("adds durable to durables array with pricePaid", () => {
    const state = shopGame("socketCity");
    const { state: s1, events } = buy(state, "refrigeratorSocket");
    const p = s1.players[0];
    expect(p.durables).toHaveLength(1);
    expect(p.durables[0]).toEqual({ itemId: "refrigeratorSocket", pricePaid: 876 });
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 1 });
  });

  it("two different durableTypes can both be purchased", () => {
    const state = shopGame("socketCity");
    const { state: s1 } = buy(state, "refrigeratorSocket");
    const { state: s2, events } = buy(s1, "stoveSocket");
    expect(s2.players[0].durables).toHaveLength(2);
    expect(events[0].type).toBe("ItemBought");
  });

  it("computer sets extraCreditGained: 1 and increments extraCredit", () => {
    const state = shopGame("socketCity");
    const { state: s1, events } = buy(state, "computerSocket");
    expect(s1.players[0].extraCredit).toBe(1);
    expect(events[0]).toMatchObject({ type: "ItemBought", extraCreditGained: 1 });
  });
});

describe("Books", () => {
  it("buying first two books does not grant extraCredit", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "encyclopedia");
    const { state: s2, events } = buy(s1, "dictionary");
    expect(s2.players[0].extraCredit).toBe(0);
    expect(events[0]).toMatchObject({ type: "ItemBought", extraCreditGained: 0 });
  });

  it("buying the third book completes the set and grants extraCredit: 1", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "encyclopedia");
    const { state: s2 } = buy(s1, "dictionary");
    const { state: s3, events } = buy(s2, "atlas");
    expect(s3.players[0].extraCredit).toBe(1);
    expect(events[0]).toMatchObject({ type: "ItemBought", extraCreditGained: 1 });
  });
});

describe("Junk", () => {
  it("applies happiness penalty on every purchase (no group protection)", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "dogFood");
    const { state: s2 } = buy(s1, "dogFood");
    expect(s2.players[0].happiness).toBe(-2);
  });
});

describe("Tickets", () => {
  it("increments ticket count and grants +2 happiness first buy", () => {
    const state = shopGame("zMart");
    const { state: s1, events } = buy(state, "baseballTicket");
    expect(s1.players[0].tickets.baseball).toBe(1);
    expect(s1.players[0].happiness).toBe(2);
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 2 });
  });

  it("second baseball ticket same turn gives no happiness", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "baseballTicket");
    const { state: s2 } = buy(s1, "baseballTicket");
    expect(s2.players[0].tickets.baseball).toBe(2); // count increments
    expect(s2.players[0].happiness).toBe(2); // happiness unchanged
  });
});

describe("Newspaper", () => {
  it("deducts $1 fixed and 1 hour; no happiness effect", () => {
    const state = shopGame("blacksMarket");
    state.players[0].hoursRemaining = 10;
    const { state: s1, events } = buy(state, "newspaper");
    expect(s1.players[0].cash).toBe(4999);
    expect(s1.players[0].hoursRemaining).toBe(9);
    expect(events[0]).toMatchObject({ type: "ItemBought", price: 1, happinessGained: 0 });
  });

  it("newspaper price is $1 regardless of economy reading", () => {
    const config = { ...testConfig, economy: { ...testConfig.economy, initialReading: 30 } };
    const state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    state.players[0].locationId = "blacksMarket";
    state.players[0].insideBuilding = true;
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "BuyItem", itemId: "newspaper" }, config);
    expect(events[0]).toMatchObject({ type: "ItemBought", price: 1 });
  });
});
```

- [ ] **Step 2: Run tests — expect all shopping tests to fail**

```bash
pnpm test packages/core/test/shopping.test.ts 2>&1 | tail -5
```

Expected: all tests FAIL with something like `InvalidAction: unhandled command BuyItem` — this is correct. BuyItem is not wired yet. Tests will pass after Task 4.

- [ ] **Step 3: Create `packages/core/src/shopping.ts`**

```ts
import type { DurableType, GameConfig, ItemId } from "@jones/config";
import type { Economy } from "./economy.js";
import type { GameEvent, GameState } from "./types.js";

export function buyItem(
  itemId: ItemId,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  const item = config.items.find((i) => i.id === itemId);
  if (!item) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown item" });
    return;
  }

  if (!p.insideBuilding || p.locationId !== item.locationId) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }

  if (item.durableType !== undefined) {
    const alreadyOwned = p.durables.some(
      (d) => config.items.find((i) => i.id === d.itemId)?.durableType === item.durableType,
    );
    if (alreadyOwned) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "already owned" });
      return;
    }
  }

  if (item.category === "newspaper" && p.hoursRemaining <= 0) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "BuyItem" });
    return;
  }

  const price = item.fixedPrice
    ? item.basePrice
    : economy.adjustedPrice(item.basePrice, state.economy.reading);

  if (p.cash < price) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyItem" });
    return;
  }

  p.cash -= price;

  if (item.category === "newspaper") {
    p.hoursRemaining -= config.actionCosts.newspaper;
  } else if (item.clothingCategory) {
    p.clothing[item.clothingCategory] += item.clothingWeeks!;
  } else if (item.category === "durable" || item.category === "book") {
    p.durables.push({ itemId, pricePaid: price });
  } else if (item.category === "fastFood") {
    p.fastFood += 1;
  } else if (item.category === "freshFood") {
    p.freshFood += item.freshFoodWeeks!;
  } else if (item.category === "ticket") {
    p.tickets[item.ticketType!] += 1;
  }
  // junk: no inventory change

  let happinessGained = 0;
  const rawHappiness = item.happinessOnBuy ?? 0;
  if (rawHappiness !== 0) {
    if (item.happinessGroup) {
      if (!p.happyGroupsThisTurn.includes(item.happinessGroup)) {
        happinessGained = rawHappiness;
        p.happyGroupsThisTurn.push(item.happinessGroup);
      }
    } else {
      happinessGained = rawHappiness;
    }
  }
  p.happiness += happinessGained;

  let extraCreditGained = 0;
  if (item.durableType === "computer") {
    p.extraCredit += 1;
    extraCreditGained = 1;
  } else if (
    item.durableType === "encyclopedia" ||
    item.durableType === "dictionary" ||
    item.durableType === "atlas"
  ) {
    const bookTypes: DurableType[] = ["encyclopedia", "dictionary", "atlas"];
    const allOwned = bookTypes.every((bt) =>
      p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === bt),
    );
    if (allOwned) {
      p.extraCredit += 1;
      extraCreditGained = 1;
    }
  }

  events.push({ type: "ItemBought", playerId: p.id, itemId, price, happinessGained, extraCreditGained });
}
```

- [ ] **Step 4: Typecheck**

```bash
pnpm typecheck
```

Expected: 0 errors.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/shopping.ts packages/core/test/shopping.test.ts
git commit -m "feat(core): add shopping.ts with buyItem() and TDD tests"
```

---

## Task 4: Wire reducer, export, integration test

**Files:**
- Modify: `packages/core/src/reduce.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/integration.game.test.ts`

- [ ] **Step 1: Add import to `packages/core/src/reduce.ts`**

Add to the imports block (after the `hire.js` import):

```ts
import { buyItem } from "./shopping.js";
```

- [ ] **Step 2: Add `BuyItem` case to the switch in `packages/core/src/reduce.ts`**

Add before the `default` case:

```ts
    case "BuyItem": {
      buyItem(command.itemId, next, config, economy, events);
      break;
    }
```

- [ ] **Step 3: Export shopping from `packages/core/src/index.ts`**

Add after the `education.js` export:

```ts
export * from "./shopping.js";
```

- [ ] **Step 4: Run shopping tests — expect all to pass**

```bash
pnpm test packages/core/test/shopping.test.ts 2>&1 | tail -5
```

Expected: all 22+ tests pass.

- [ ] **Step 5: Add shopping integration test to `packages/core/test/integration.game.test.ts`**

Add a new `describe("shopping flow")` block at the end of the file (before the final closing `}`):

```ts
describe("shopping flow", () => {
  it("player buys fast food, clothes, a durable, and the full book set", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    state.players[0].cash = 5000; // override $200 initial cash; computerSocket costs $1,599
    const allEvents: GameEvent[] = [];

    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Travel to Monolith Burgers (ringIndex 3) and enter
    step({ type: "TravelTo", locationId: "monolithBurgers" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "astroChicken" });  // +2 happiness, fastFood=1

    // Exit, travel to QT Clothing (ringIndex 4), buy dress clothes
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "qtClothing" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "dressClothesQT" }); // +1 happiness, dress weeks=13

    // Exit, travel to Socket City (ringIndex 5), buy a computer
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "socketCity" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "computerSocket" }); // +3 happiness, extraCredit=1

    // Exit, travel to Z-Mart (ringIndex 2), buy all three books
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "zMart" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "encyclopedia" });   // extraCredit still 1
    step({ type: "BuyItem", itemId: "dictionary" });     // extraCredit still 1
    step({ type: "BuyItem", itemId: "atlas" });          // extraCredit = 2 (books complete)

    const p = state.players[0];

    // Inventory checks
    expect(p.fastFood).toBe(1);
    expect(p.clothing.dress).toBe(13);
    expect(p.durables.find((d) => d.itemId === "computerSocket")).toBeDefined();
    expect(p.durables.find((d) => d.itemId === "encyclopedia")).toBeDefined();
    expect(p.durables.find((d) => d.itemId === "atlas")).toBeDefined();

    // extraCredit: +1 computer, +1 books set = 2
    expect(p.extraCredit).toBe(2);

    // happiness: +2 astro chicken + 1 dress QT + 3 computer = 6
    expect(p.happiness).toBe(6);

    // Events emitted
    const bought = allEvents.filter((e) => e.type === "ItemBought");
    expect(bought).toHaveLength(7);

    const atlasBought = bought.find((e) => e.type === "ItemBought" && (e as any).itemId === "atlas");
    expect(atlasBought).toMatchObject({ type: "ItemBought", extraCreditGained: 1 });
  });
});
```

The integration test file already imports `GameEvent`, `reduce`, `createInitialGame`, `defaultConfig`, and `constantEconomyConfig` — no import changes needed.

- [ ] **Step 6: Run all tests**

```bash
pnpm test 2>&1 | tail -10
```

Expected: all tests pass (86 existing + new shopping and integration tests).

- [ ] **Step 7: Typecheck**

```bash
pnpm typecheck 2>&1 | tail -5
```

Expected: 0 errors.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/reduce.ts packages/core/src/index.ts \
        packages/core/test/integration.game.test.ts
git commit -m "feat(core): wire BuyItem into reducer, add shopping integration test"
```
