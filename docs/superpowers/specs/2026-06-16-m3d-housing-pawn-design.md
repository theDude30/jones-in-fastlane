# M3d Housing & Pawn Design

## Goal

Add rent/housing and the pawn shop to the game engine: paying rent, requesting rent extensions, switching apartments, garnishment of wages while in rent debt, and pawning/redeeming/buying durables through a shared pawn shop. Introduces 6 new commands, 8 new events, a `housing.ts` and a `pawn.ts` module in `@jones/core`, and a shared pawn-shop entity on `GameState`.

## Architecture

Two new modules in `@jones/core/src`, following the `finance.ts`/`shopping.ts` pattern (pure functions receiving `(state, config, ...)` and pushing to an `events` array):

- **`housing.ts`** — `payRent`, `requestRentExtension`, `switchApartment`, and `applyGarnishment` (garnishment is rent-debt logic, called from the `Work` handler).
- **`pawn.ts`** — `pawnItem`, `redeemItem`, `buyPawnedItem`.

Rent state is per-player (on `PlayerState`). The pawn shop is shared global state (on `GameState`) because it has a fixed capacity and any player may buy from it.

**Scope boundary (M3d vs M3e):** M3d builds all player-initiated commands, the state fields, and the garnishment branch in `Work` (dormant until `rentDebt > 0`, fully testable by setting debt directly). The automatic 4th-week rent-due processing and debt accrual is deferred to M3e (start-of-turn events), mirroring how M3c built `ApplyLoan` but left monthly loan payments to M3e. The Rent Office's "open 4th week only" calendar gating is also calendar logic deferred to M3e; M3d allows rent commands whenever the player is inside the Rent Office.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest, same reducer pattern as the existing modules.

---

## Section 1: Config

### `LocationDef` addition (`packages/config/src/types.ts`)

```ts
baseRent?: number;  // monthly rent base for apartment locations
```

Set in `locations.ts`: `lowCostHousing` → `baseRent: 325`, `securityApartments` → `baseRent: 475`. The two apartments are found via `types.includes("apartment")`; there are exactly two.

### `GameConstants` additions (`types.ts` + `constants.ts`)

```ts
pawnPayoutRate: number;         // 0.40 — pawn payout = 40% of current economy-adjusted value
pawnRedeemRate: number;         // 0.50 — redeem cost = 50% of original price paid (flat)
pawnSaleRate: number;           // 0.50 — for-sale price after expiry = 50% of price paid (flat)
pawnMaxItems: number;           // 6 — shop capacity (total)
pawnExpiryWeeks: number;        // 3 — weeks before an unredeemed item becomes buyable
garnishmentInterest: number;    // 2 — $ interest deducted per garnished work session
rentExtensionChances: number[]; // [1.0, 0.75, 0.5, 0.25] — approval chance by # prior approvals (clamp at index 3)
```

`weeksPerMonth: 4` already exists and is reused for the rent interval.

### Pricing interpretation

The reference (§9) says the pawn payout is "40% of original purchase price **(economy-adjusted)**" while redeem is "50% of original purchase price **(not economy-adjusted)**." The deliberate contrast is honored as:

- **Pawn payout** = `round(pawnPayoutRate × economy.adjustedPrice(item.basePrice, state.economy.reading))` — recomputed at current economy.
- **Redeem cost** = `round(pawnRedeemRate × pricePaid)` — flat, using what the pawner actually paid.
- **For-sale (buy) price** = `round(pawnSaleRate × pricePaid)` — flat ("50% of original price").

### Action costs

No new `actionCosts`. All M3d in-building actions are 0-hour (consistent with deposit/withdraw/pawn being zero-time in §2). Entering the building already costs the standard `enterLocation` (2h).

---

## Section 2: State additions

### `PlayerState` new fields (`packages/core/src/types.ts`)

```ts
apartmentId: string;                // current apartment location id
currentRent: number;                // monthly rent locked for current apartment (fixed until switch)
rentDueWeek: number;                // week the next month's rent is due
rentDebt: number;                   // outstanding rent debt (drives garnishment)
rentExtensionsApproved: number;     // count ever approved (drives next approval chance)
everInRentDebt: boolean;            // once true, all extension requests auto-denied
rentExtensionUsedThisTurn: boolean; // once-per-turn guard; reset at turn start (M3e)
```

### `GameState` new field — the shared pawn shop (`types.ts`)

```ts
pawnedItems: PawnedItem[];
```

```ts
export interface PawnedItem {
  itemId: ItemId;             // specific variant pawned
  durableType: DurableType;   // for the one-per-type shop constraint
  pricePaid: number;          // original price the pawner paid (drives redeem/sale price)
  pawnedByPlayerId: string;   // original pawner (redeem eligibility)
  pawnedWeek: number;         // week pawned (3-week expiry clock)
}
```

`DurableType` is added to the `@jones/config` import in `core/src/types.ts` (alongside `ItemId`, `StockId`).

### `setup.ts` initialization

```ts
// PlayerState — derive from the home apartment's config
const homeRent = config.locations.find((l) => l.id === c.homeLocationId)?.baseRent ?? 0;
// ...
apartmentId: c.homeLocationId,        // "lowCostHousing"
currentRent: homeRent,                // 325
rentDueWeek: c.weeksPerMonth,         // 4 (first rent due Week #4)
rentDebt: 0,
rentExtensionsApproved: 0,
everInRentDebt: false,
rentExtensionUsedThisTurn: false,

// GameState
pawnedItems: [],
```

### `cloneState` in `reduce.ts`

All new `PlayerState` fields are primitives (handled by `...p`). At the `GameState` level:

```ts
pawnedItems: state.pawnedItems.map((it) => ({ ...it })),
```

---

## Section 3: Commands & Events

### New commands (`Command` union)

```ts
| { type: "PayRent" }
| { type: "RequestRentExtension" }
| { type: "SwitchApartment" }             // toggles to the other apartment type
| { type: "PawnItem"; itemId: ItemId }
| { type: "RedeemItem"; itemId: ItemId }
| { type: "BuyPawnedItem"; itemId: ItemId }
```

`SwitchApartment` takes no target — there are exactly two apartment types, so it toggles to the one the player is not currently in.

### New events (`GameEvent` union)

```ts
| { type: "RentPaid"; playerId: string; amount: number; rentDueWeek: number }
| { type: "RentExtensionApproved"; playerId: string; extensionsApproved: number; rentDueWeek: number }
| { type: "RentExtensionDenied"; playerId: string; reason: "in-debt" | "luck"; happinessCost: number }
| { type: "ApartmentSwitched"; playerId: string; apartmentId: string; newRent: number; rentDueWeek: number }
| { type: "ItemPawned"; playerId: string; itemId: ItemId; payout: number; happinessCost: number }
| { type: "ItemRedeemed"; playerId: string; itemId: ItemId; cost: number }
| { type: "PawnedItemBought"; playerId: string; itemId: ItemId; cost: number }
| { type: "Garnished"; playerId: string; toDebt: number; interest: number }
```

`RentExtensionDenied.reason`: `"in-debt"` (auto-deny because `everInRentDebt`) or `"luck"` (RNG roll failed). `Garnished` is emitted by the modified `Work` handler **in addition to** the existing `Worked` event (which still fires with gross earnings).

---

## Section 4: Logic

### `packages/core/src/housing.ts`

```ts
export function payRent(state: GameState, config: GameConfig, events: GameEvent[]): void
export function requestRentExtension(state: GameState, config: GameConfig, events: GameEvent[]): void
export function switchApartment(state: GameState, config: GameConfig, economy: Economy, events: GameEvent[]): void
export function applyGarnishment(p: PlayerState, earned: number, config: GameConfig, events: GameEvent[]): number
```

`payRent` takes no `economy` parameter — `currentRent` is fixed for the current apartment. Only `switchApartment` needs `economy` (to economy-adjust the new apartment's offered rent).

A module-private helper mirrors `playerAtBank` from `finance.ts`:

```ts
function playerAtRentOffice(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "rentOffice") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}
```

**`payRent`** — guards: `playerAtRentOffice`; `p.cash >= p.currentRent` else `NotEnoughMoney {action:"PayRent"}`. Effect: `p.cash -= p.currentRent`; `p.rentDueWeek += config.constants.weeksPerMonth`. Emit `RentPaid { amount: p.currentRent, rentDueWeek: p.rentDueWeek }`.

**`requestRentExtension`** — guards: `playerAtRentOffice`; `!p.rentExtensionUsedThisTurn` else `InvalidAction "extension already requested this turn"`. Set `p.rentExtensionUsedThisTurn = true`. Then:
- If `p.everInRentDebt` → `p.happiness -= 1`; emit `RentExtensionDenied { reason: "in-debt", happinessCost: 1 }`.
- Else: `const chance = config.constants.rentExtensionChances[Math.min(p.rentExtensionsApproved, 3)];` draw `const { value: r, state: rng } = nextFloat(state.rng); state.rng = rng;`. If `r < chance` → `p.rentExtensionsApproved += 1`; `p.rentDueWeek += config.constants.weeksPerMonth`; emit `RentExtensionApproved { extensionsApproved: p.rentExtensionsApproved, rentDueWeek: p.rentDueWeek }`. Else `p.happiness -= 1`; emit `RentExtensionDenied { reason: "luck", happinessCost: 1 }`.

**`switchApartment`** — guards: `playerAtRentOffice`. Find the other apartment: `const other = config.locations.find((l) => l.types.includes("apartment") && l.id !== p.apartmentId)`. `const newRent = Math.round(economy.adjustedPrice(other.baseRent!, state.economy.reading));` `p.cash >= newRent` else `NotEnoughMoney {action:"SwitchApartment"}`. Effect: `p.cash -= newRent`; `p.apartmentId = other.id`; `p.currentRent = newRent`; `p.rentDueWeek = state.week + config.constants.weeksPerMonth` (advances on the old apartment forfeited); `p.rentDebt` unchanged (carries over). Emit `ApartmentSwitched { apartmentId: p.apartmentId, newRent, rentDueWeek: p.rentDueWeek }`.

**`applyGarnishment(p, earned, config, events)`** — pure helper, called from `Work` only when `p.rentDebt > 0`. Returns the cash to add:

```ts
const half = Math.floor(earned / 2);
if (p.rentDebt >= half) {
  p.rentDebt -= half;
  const keep = Math.max(0, earned - half - config.constants.garnishmentInterest);
  events.push({ type: "Garnished", playerId: p.id, toDebt: half, interest: config.constants.garnishmentInterest });
  return keep;
}
const taken = p.rentDebt; // debt < half
p.rentDebt = 0;
events.push({ type: "Garnished", playerId: p.id, toDebt: taken, interest: 0 });
return earned - taken;
```

**`reduce.ts` `Work` handler change:** replace `p.cash += earned;` with:

```ts
p.cash += p.rentDebt > 0 ? applyGarnishment(p, earned, config, events) : earned;
```

The existing `Worked` event still fires with gross `earned`. Experience/dependibility increments are unchanged.

### `packages/core/src/pawn.ts`

```ts
export function pawnItem(itemId: ItemId, state: GameState, config: GameConfig, economy: Economy, events: GameEvent[]): void
export function redeemItem(itemId: ItemId, state: GameState, config: GameConfig, events: GameEvent[]): void
export function buyPawnedItem(itemId: ItemId, state: GameState, config: GameConfig, events: GameEvent[]): void
```

A module-private helper:

```ts
function playerAtPawnShop(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "pawnShop") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}
```

**`pawnItem`** — guards: `playerAtPawnShop`; the player owns the durable (`const idx = p.durables.findIndex((d) => d.itemId === itemId)`, `idx >= 0`) else `InvalidAction "not owned"`; look up `const item = config.items.find((i) => i.id === itemId)` and require `item?.durableType` else `InvalidAction "not a durable"`; shop not full (`state.pawnedItems.length < config.constants.pawnMaxItems`) else `InvalidAction "pawn shop full"`; no existing pawned item of that `durableType` (`!state.pawnedItems.some((pi) => pi.durableType === item.durableType)`) else `InvalidAction "type already pawned"`. Effect: capture `const pricePaid = p.durables[idx].pricePaid`; remove the durable (`p.durables.splice(idx, 1)`); `const payout = Math.round(config.constants.pawnPayoutRate * economy.adjustedPrice(item.basePrice, state.economy.reading))`; `p.cash += payout`; `p.happiness -= 1`; `state.pawnedItems.push({ itemId, durableType: item.durableType, pricePaid, pawnedByPlayerId: p.id, pawnedWeek: state.week })`. Emit `ItemPawned { itemId, payout, happinessCost: 1 }`.

**`redeemItem`** — guards: `playerAtPawnShop`; `const idx = state.pawnedItems.findIndex((pi) => pi.itemId === itemId)`, `idx >= 0` else `InvalidAction "not in pawn shop"`; `state.pawnedItems[idx].pawnedByPlayerId === p.id` else `InvalidAction "not your item"`; within window (`state.week - state.pawnedItems[idx].pawnedWeek < config.constants.pawnExpiryWeeks`) else `InvalidAction "redeem window expired"`; `const cost = Math.round(config.constants.pawnRedeemRate * state.pawnedItems[idx].pricePaid)`; `p.cash >= cost` else `NotEnoughMoney {action:"RedeemItem"}`. Effect: capture `pricePaid` from the pawned record; remove from `pawnedItems` (`splice`); `p.durables.push({ itemId, pricePaid })`; `p.cash -= cost`. Emit `ItemRedeemed { itemId, cost }`.

**`buyPawnedItem`** — guards: `playerAtPawnShop`; `const idx = state.pawnedItems.findIndex((pi) => pi.itemId === itemId)`, `idx >= 0` else `InvalidAction "not in pawn shop"`; expired (`state.week - state.pawnedItems[idx].pawnedWeek >= config.constants.pawnExpiryWeeks`) else `InvalidAction "not yet for sale"`; player doesn't already own that `durableType` (`!p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === state.pawnedItems[idx].durableType)`) else `InvalidAction "already owned"`; `const cost = Math.round(config.constants.pawnSaleRate * state.pawnedItems[idx].pricePaid)`; `p.cash >= cost` else `NotEnoughMoney {action:"BuyPawnedItem"}`. Effect: remove from `pawnedItems` (`splice`); `p.durables.push({ itemId, pricePaid: cost })` (new owner's basis = what they paid); `p.cash -= cost`. Emit `PawnedItemBought { itemId, cost }`.

### `reduce.ts` wiring and `index.ts`

Import and add `case` branches for all 6 commands. `payRent`/`switchApartment`/`pawnItem`/`redeemItem`/`buyPawnedItem` receive `economy` where their signatures require it (via the existing `const economy = makeEconomy(config)`). `index.ts` adds `export * from "./housing.js";` and `export * from "./pawn.js";`.

---

## Section 5: Testing

### `packages/core/test/housing.test.ts`

Helper `rentGame()`: player inside `rentOffice`, `cash=5000`, `wage=10`, week 1, `constantEconomyConfig` (so `adjustedPrice` is a no-op). ~16 tests:

1. PayRent — cash −325, `rentDueWeek += 4`, emits `RentPaid`
2. PayRent — `NotEnoughMoney` when cash < rent
3. PayRent — `InvalidAction` when not at rentOffice
4. RequestRentExtension — first request (0 prior, 100% chance) → approved, `rentExtensionsApproved=1`, `rentDueWeek += 4`, emits `RentExtensionApproved`
5. RequestRentExtension — `everInRentDebt=true` → `RentExtensionDenied {reason:"in-debt"}`, −1 happiness
6. RequestRentExtension — twice in one turn → second is `InvalidAction "extension already requested this turn"`
7. RequestRentExtension — denial via seeded RNG: set `rentExtensionsApproved=3` (25% chance) and choose a seed whose first `nextFloat` ≥ 0.25 → `RentExtensionDenied {reason:"luck"}`, −1 happiness. (Pick the seed by computing `nextFloat` against candidate seeds in the test setup, or assert the reason is `"luck"` for a seed known to roll high.)
8. SwitchApartment — lowCost → security: `apartmentId="securityApartments"`, `currentRent=475`, cash −475, `rentDueWeek = week+4`, emits `ApartmentSwitched`
9. SwitchApartment — toggles back security → lowCost (rent 325)
10. SwitchApartment — `rentDebt` set to 200 carries over unchanged
11. SwitchApartment — `NotEnoughMoney` when cash < new rent
12. Garnishment via Work — set `rentDebt=100`, contrive `earned=80` → debt ≥ half(40): `rentDebt=60`, cash += 80−40−2=38, emits `Garnished {toDebt:40, interest:2}`
13. Garnishment via Work — `rentDebt=10`, `earned=80` → debt < half: `rentDebt=0`, cash += 70, emits `Garnished {toDebt:10, interest:0}`
14. Work with `rentDebt=0` → no garnishment, full earnings, no `Garnished` event

To contrive a known `earned` for tests 12–14: set up a job the player holds at the rentOffice (rentOffice is a workplace) with a wage such that `floor(workWageMultiplier × wage × hours / fullHours)` is a round number, or set `wage`/`hoursRemaining` so `earned=80`. The implementer picks values that produce the target earnings (e.g. `wage` and a full 6-hour work session). The assertions check the garnishment math relative to whatever gross `earned` the `Worked` event reports.

### `packages/core/test/pawn.test.ts`

Helper `pawnGame()`: player inside `pawnShop` with a durable in `p.durables` (e.g. `{ itemId: "refrigeratorSocket", pricePaid: 876 }`), `cash` set per-test, `constantEconomyConfig`. ~14 tests:

15. PawnItem — durable removed, `payout = round(0.40 × basePrice)` (refrigeratorSocket basePrice 876 → 350), cash += payout, −1 happiness, item present in `state.pawnedItems` with correct fields
16. PawnItem — `InvalidAction "not owned"` when the player doesn't hold it
17. PawnItem — `InvalidAction "pawn shop full"` when `pawnedItems.length === 6`
18. PawnItem — `InvalidAction "type already pawned"` when shop holds the same `durableType`
19. PawnItem — `InvalidAction` when not at pawnShop
20. RedeemItem — within window by original pawner: `cost = round(0.50 × pricePaid)`, durable restored with original `pricePaid`, removed from shop, cash −cost
21. RedeemItem — `InvalidAction "not your item"` when a different player pawned it
22. RedeemItem — `InvalidAction "redeem window expired"` when `state.week - pawnedWeek >= 3`
23. RedeemItem — `NotEnoughMoney` when cash < cost
24. BuyPawnedItem — after expiry (`state.week - pawnedWeek >= 3`), buyer purchases at `round(0.50 × pricePaid)`, durable added with `pricePaid = cost`, removed from shop
25. BuyPawnedItem — `InvalidAction "not yet for sale"` before expiry
26. BuyPawnedItem — `InvalidAction "already owned"` when buyer already owns that `durableType`
27. BuyPawnedItem — `NotEnoughMoney` when cash < cost

### Integration test (`integration.game.test.ts`)

New "housing & pawn flow" describe block: player (cash overridden high) travels to Socket City, enters, buys a refrigerator; exits, travels to the Pawn Shop, enters, pawns it (assert cash rose by payout and `state.pawnedItems` has length 1); redeems it the same week (assert durable back in `p.durables` and `pawnedItems` empty); exits, travels to the Rent Office, enters, pays rent (assert `rentDueWeek` advanced), then switches apartment (assert `apartmentId === "securityApartments"`, `currentRent === 475`). Assert final state coherence.
