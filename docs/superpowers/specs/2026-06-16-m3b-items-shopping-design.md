# M3b Items & Shopping Design

## Goal

Add all purchasable items to the game engine: food (fast food, soft drinks, fresh food), clothing, durables/appliances, books, junk, tickets, and newspaper. Introduces the `BuyItem` command and `ItemBought` event, and extends `PlayerState` with inventory fields.

## Architecture

Single `BuyItem` command dispatched to a `shopping.ts` module in `@jones/core`. All item definitions (prices, effects, locations) live in a new `items.ts` in `@jones/config`. One event covers all purchases. No new commands beyond `BuyItem`.

**Tech Stack:** TypeScript strict, pnpm workspaces, Vitest, same reducer pattern as `hire.ts` and `education.ts`.

---

## Section 1: Config

### `ItemId` (new union type in `packages/config/src/types.ts`)

```ts
export type ItemId =
  // Fast Food (Monolith Burgers)
  | "fries" | "hamburgers" | "cheeseburger" | "astroChicken"
  // Soft Drinks (Monolith Burgers)
  | "colasDrink" | "shakesDrink"
  // Fresh Food (Black's Market)
  | "freshFood1Wk" | "freshFood2Wk" | "freshFood4Wk"
  // Clothes — separate IDs per store variant
  | "casualClothesQT" | "casualClothesZMart"
  | "dressClothesQT"  | "dressClothesZMart"
  | "businessSuit"
  // Durables — Socket City variants
  | "refrigeratorSocket" | "freezerSocket" | "stoveSocket" | "microwaveSocket"
  | "colorTVSocket" | "vcrSocket" | "stereoSocket" | "hotTubSocket" | "computerSocket"
  // Durables — Z-Mart variants (used; cheaper; higher break chance)
  | "refrigeratorZMart" | "stoveZMart" | "microwaveZMart"
  | "colorTVZMart" | "vcrZMart" | "stereoZMart" | "bwTVZMart"
  // Books (Z-Mart only; all three → +1 extraCredit)
  | "encyclopedia" | "dictionary" | "atlas"
  // Junk — consumed on purchase (happiness penalty)
  | "dogFood" | "eightTrackPlayer" | "worksOfCapote"
  // Miscellaneous
  | "newspaper"
  | "baseballTicket" | "theatreTicket" | "concertTicket";
```

### `DurableType` (new union type in `packages/config/src/types.ts`)

Groups store variants for inventory ownership checks (e.g., "does player have a refrigerator?"):

```ts
export type DurableType =
  | "refrigerator" | "freezer" | "stove" | "microwave"
  | "colorTV" | "vcr" | "stereo" | "bwTV" | "hotTub" | "computer"
  | "encyclopedia" | "dictionary" | "atlas";
```

### `ItemDef` interface (new in `packages/config/src/types.ts`)

```ts
export interface ItemDef {
  id: ItemId;
  category: "fastFood" | "softDrink" | "freshFood" | "clothes"
          | "durable" | "book" | "junk" | "ticket" | "newspaper";
  locationId: string;       // player must be insideBuilding at this location
  basePrice: number;
  fixedPrice?: true;        // skip economy adjustment (newspaper: $1)
  hourCost?: number;        // additional hours deducted (newspaper: 1; all others: 0)
  happinessOnBuy?: number;  // >0 = bonus; <0 = penalty; absent = 0
  happinessGroup?: string;  // if set, only first buy of this group per turn gives happiness
  // Clothes only:
  clothingCategory?: "casual" | "dress" | "business";
  clothingWeeks?: number;
  // Durables and books:
  durableType?: DurableType;
  breakChanceInverse?: number; // denominator: 51 = Socket City (1/51), 36 = Z-Mart/Pawn (1/36)
  wildWillyProof?: boolean;    // true = can't be stolen by Wild Willy apartment event
  // Fresh food only:
  freshFoodWeeks?: number;
  // Tickets only:
  ticketType?: "baseball" | "theatre" | "concert";
}
```

### `GameConfig` update (`packages/config/src/types.ts`)

Add `items: ItemDef[]` field to `GameConfig`.

### `packages/config/src/items.ts` (new file)

All 30 item definitions. Key entries:

**Fast Food** (location: `"monolithBurgers"`, happinessGroup: `"fastFood"`):
| id | basePrice | happinessOnBuy |
|---|---|---|
| fries | 65 | — |
| hamburgers | 79 | — |
| cheeseburger | 89 | +1 |
| astroChicken | 124 | +2 |

**Soft Drinks** (location: `"monolithBurgers"`, happinessGroup: `"softDrink"`):
| id | basePrice | happinessOnBuy |
|---|---|---|
| colasDrink | 69 | +1 |
| shakesDrink | 102 | +2 |

**Fresh Food** (location: `"blacksMarket"`; no happinessGroup — always gives happiness):
| id | basePrice | freshFoodWeeks | happinessOnBuy |
|---|---|---|---|
| freshFood1Wk | 55 | 1 | +1 |
| freshFood2Wk | 100 | 2 | +2 |
| freshFood4Wk | 190 | 4 | +4 |

**Clothes**:
| id | location | basePrice | clothingCategory | clothingWeeks | happinessOnBuy | happinessGroup |
|---|---|---|---|---|---|---|
| casualClothesQT | qtClothing | 73 | casual | 11 | — | — |
| casualClothesZMart | zmart | 35 | casual | 9 | — | — |
| dressClothesQT | qtClothing | 125 | dress | 13 | +1 | "dressClothes" |
| dressClothesZMart | zmart | 90 | dress | 9 | — | — |
| businessSuit | qtClothing | 295 | business | 13 | +2 | "businessSuit" |

**Durables — Socket City** (location: `"socketCity"`, breakChanceInverse: 51):
| id | durableType | basePrice | happinessOnBuy | wildWillyProof |
|---|---|---|---|---|
| refrigeratorSocket | refrigerator | 876 | +1 | yes |
| freezerSocket | freezer | 513 | +2 | yes |
| stoveSocket | stove | 570 | +1 | yes |
| microwaveSocket | microwave | 330 | +2 | — |
| colorTVSocket | colorTV | 525 | +2 | — |
| vcrSocket | vcr | 333 | +2 | — |
| stereoSocket | stereo | 412 | +2 | — |
| hotTubSocket | hotTub | 1255 | +3 | yes |
| computerSocket | computer | 1599 | +3 | yes |

**Durables — Z-Mart** (location: `"zmart"`, breakChanceInverse: 36):
| id | durableType | basePrice | happinessOnBuy | wildWillyProof |
|---|---|---|---|---|
| refrigeratorZMart | refrigerator | 650 | +1 | yes |
| stoveZMart | stove | 490 | +1 | yes |
| microwaveZMart | microwave | 220 | +1 | — |
| colorTVZMart | colorTV | 450 | +1 | — |
| vcrZMart | vcr | 250 | +1 | — |
| stereoZMart | stereo | 450 | +1 | — |
| bwTVZMart | bwTV | 110 | — | — |

Note: Microwave happiness is +2 from Socket City, +1 from Z-Mart (used); Color TV, VCR, Stereo same pattern. Durables do **not** use `happinessGroup` — the ownership guard already prevents buying a duplicate, so happiness always fires exactly once. Stereo is priced higher at Z-Mart ($450) than Socket City ($412); this matches the original game reference.

**Books** (location: `"zmart"`, breakChanceInverse: undefined — books can't break, wildWillyProof: true):
| id | durableType | basePrice | happinessOnBuy |
|---|---|---|---|
| encyclopedia | encyclopedia | 475 | — |
| dictionary | dictionary | 70 | — |
| atlas | atlas | 55 | — |

Books give no happiness on purchase. Their value is `extraCredit` when all three are owned.

**Junk** (location: `"zmart"`; no happinessGroup — penalty fires every purchase):
| id | basePrice | happinessOnBuy |
|---|---|---|
| dogFood | 18 | −1 |
| eightTrackPlayer | 75 | −1 |
| worksOfCapote | 100 | −2 |

**Newspaper** (location: `"blacksMarket"`, fixedPrice: true, basePrice: 1, hourCost: 1, no happiness):

**Tickets** (location: `"zmart"`; happinessGroup per ticket type):
| id | ticketType | basePrice | happinessOnBuy | happinessGroup |
|---|---|---|---|---|
| baseballTicket | baseball | 45 | +2 | "baseballTicket" |
| theatreTicket | theatre | 30 | +2 | "theatreTicket" |
| concertTicket | concert | 40 | +2 | "concertTicket" |

---

## Section 2: PlayerState additions (`packages/core/src/types.ts`)

```ts
fastFood: number;       // units held; all cleared at turn start (M3e)
freshFood: number;      // weeks stored; capacity/spoilage checked at turn start (M3e)
durables: Array<{ itemId: ItemId; pricePaid: number }>;
tickets: { baseball: number; theatre: number; concert: number };
happyGroupsThisTurn: string[];  // group keys already fired this turn; cleared at turn start (M3e)
```

**`pricePaid`** stores the actual economy-adjusted price paid at purchase time (needed by Pawn Shop in M3d: redeems at 50% of `pricePaid`; sells unclaimed at 50% of `pricePaid`).

**`extraCredit`** (existing field from M3a) is updated by `BuyItem`:
- Computer purchased → `p.extraCredit += 1` (always; player can only own one computer)
- Third book completes the set → `p.extraCredit += 1` (only when all three books are now owned)

**`setup.ts` additions:**
```ts
fastFood: 0,
freshFood: 0,
durables: [],
tickets: { baseball: 0, theatre: 0, concert: 0 },
happyGroupsThisTurn: [],
```

**`cloneState` in `reduce.ts`** must deep-clone the new arrays:
```ts
durables: p.durables.map((d) => ({ ...d })),
tickets: { ...p.tickets },
happyGroupsThisTurn: [...p.happyGroupsThisTurn],
```
`fastFood` and `freshFood` are primitives; no special handling.

---

## Section 3: Command & Events (`packages/core/src/types.ts`)

**New command:**
```ts
| { type: "BuyItem"; itemId: ItemId }
```

**New event:**
```ts
| { type: "ItemBought"; playerId: string; itemId: ItemId; price: number; happinessGained: number; extraCreditGained: number }
```

`extraCreditGained` is `0` for all items except:
- Computer: always `1`
- Third book (the one that completes encyclopedia + dictionary + atlas): `1`

No separate event for `extraCredit` changes — it is fully described by `extraCreditGained` on `ItemBought`.

---

## Section 4: Shopping logic (`packages/core/src/shopping.ts`)

```ts
export function buyItem(
  itemId: ItemId,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  events: GameEvent[]
): void
```

**Guards (in order):**

1. Item exists in `config.items` → else `InvalidAction: "unknown item"`
2. Player is `insideBuilding` and `p.locationId === item.locationId` → else `InvalidAction: "wrong location"`
3. Durable/book ownership: if `item.durableType` and `p.durables.some(d => config.items.find(i => i.id === d.itemId)?.durableType === item.durableType)` → `InvalidAction: "already owned"`
4. Hours check (newspaper only): `p.hoursRemaining <= 0` → `NotEnoughTime`
5. Cash check: `p.cash < price` → `NotEnoughMoney`

**Price calculation:**
```ts
const price = item.fixedPrice
  ? item.basePrice
  : economy.adjustedPrice(item.basePrice, state.economy.reading);
```

**Effects after guards pass:**
- `p.cash -= price`
- Newspaper: `p.hoursRemaining -= item.hourCost ?? 0`
- **Clothes**: `p.clothing[item.clothingCategory!] += item.clothingWeeks!`
- **Durables/books**: `p.durables.push({ itemId, pricePaid: price })`
- **Fast food**: `p.fastFood += 1`
- **Fresh food**: `p.freshFood += item.freshFoodWeeks!`
- **Tickets**: `p.tickets[item.ticketType!] += 1`
- **Junk**: no inventory change (happiness penalty below)

**Happiness calculation:**
```ts
let happinessGained = 0;
if (item.happinessOnBuy !== undefined) {
  if (item.happinessGroup) {
    if (!p.happyGroupsThisTurn.includes(item.happinessGroup)) {
      happinessGained = item.happinessOnBuy;
      p.happyGroupsThisTurn.push(item.happinessGroup);
    }
  } else {
    // No group: always apply (fresh food, junk penalty)
    happinessGained = item.happinessOnBuy;
  }
}
p.happiness += happinessGained;
```

**`extraCredit` update:**
```ts
let extraCreditGained = 0;
if (item.durableType === "computer") {
  p.extraCredit += 1;
  extraCreditGained = 1;
} else if (["encyclopedia", "dictionary", "atlas"].includes(item.durableType ?? "")) {
  const bookIds: DurableType[] = ["encyclopedia", "dictionary", "atlas"];
  const allOwned = bookIds.every((bt) =>
    p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === bt)
  );
  if (allOwned) {
    p.extraCredit += 1;
    extraCreditGained = 1;
  }
}
```

**Event emitted:**
```ts
events.push({ type: "ItemBought", playerId: p.id, itemId, price, happinessGained, extraCreditGained });
```

---

## Section 5: Testing (`packages/core/test/shopping.test.ts`)

Helper `shopGame(locationId: string)` creates a game with the player inside the given store with `cash = 5000`, `hoursRemaining = 60`.

~22 tests:

1. Location guard — `BuyItem` issued from wrong store → `InvalidAction`
2. Not inside building → `InvalidAction`
3. Unknown item ID → `InvalidAction`
4. `NotEnoughMoney` — cash < price
5. Newspaper `NotEnoughTime` — 0 hours
6. Fast food — `fastFood` incremented; first buy gives happiness; second buy same turn gives 0 (happinessGroup guard)
7. Soft drinks — same per-turn group logic
8. Fresh food — `freshFood` incremented by weeks; happiness always granted
9. Clothes (QT dress) — `clothing.dress` weeks added; `+1` happiness first buy; second buy same turn gives 0
10. Clothes (Z-Mart dress) — weeks added; 0 happiness (happinessOnBuy absent)
11. Business suit — `clothing.business` weeks added; `+2` happiness
12. Durable purchase — pushed to `durables` with correct `pricePaid`; happiness granted
13. Can't buy second durable of same `durableType` → `InvalidAction`
14. Computer — `extraCredit` incremented by 1 on purchase
15. Books: encyclopedia + dictionary alone → `extraCredit` unchanged
16. Books: third book (atlas) completes set → `extraCredit += 1`, `extraCreditGained: 1` in event
17. Junk (dogFood) — happiness penalty applied every buy (no group protection)
18. Ticket purchase — `p.tickets.baseball` incremented; `+2` happiness first buy; second same turn gives 0
19. Newspaper — `$1` fixed price regardless of economy; `hoursRemaining` decremented by 1
20. Economy-adjusted price — non-fixed item at non-zero reading uses `adjustedPrice`
21. Multi-durable types — buying a refrigerator then a stove both succeed (different `durableType`)
22. Integration: buy clothes at QT, then food at Monolith, check state coherence
