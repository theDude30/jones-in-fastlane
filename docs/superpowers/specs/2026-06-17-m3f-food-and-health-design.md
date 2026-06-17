# M3f — Food & Health Design

## Summary

The authoritative [game-logic reference](2026-06-15-jones-game-logic-reference.md)
(§2 "Start-of-Turn sequence") defines 18 ordered steps. Roughly half are
implemented; this milestone fills in the **food/health cluster**: Cooking
Bonus, Relaxation's Hot Tub exemption, Spoiled Food, Starvation, Doctor
Visit, and the entirely-missing player action `Relax`. It also fixes a
pre-existing bug (`happyGroupsThisTurn` is set at game setup but never
reset per turn) that the new `Relax` action's "first-per-turn happiness"
behavior depends on.

This was discovered while manually exercising M4a's debug screen: a
human player who never buys food just keeps playing with no consequence,
which doesn't match the original game. The remaining missing start-of-turn
steps (Weekend cost, Lottery payout, Computer Profits, Apartment/street
Wild Willy robbery, Appliance Repair, Donations) are explicitly **out of
scope** — tracked as separate future milestones (M3g, M3h) — to keep this
plan focused on one cohesive subsystem.

## Goals / Requirements

1. Buying Fast Food or Fresh Food (with a Refrigerator) actually prevents
   Starvation the following turn; not buying either causes a real penalty
   (lost hours, lost happiness).
2. Fresh Food spoils without a Refrigerator, and overflows past capacity
   (6, or 12 with a Freezer) even with one.
3. Owning a Stove or Microwave grants a small recurring happiness bonus;
   owning a Hot Tub stops Relaxation from decaying.
4. A new `Relax` command exists, usable only at the player's own apartment,
   restoring Relaxation (capped) and granting a first-per-turn happiness
   bonus.
5. Low Relaxation, Starvation, and Spoiled Food can each independently
   trigger a Doctor Visit, which costs hours, happiness, and cash — but at
   most one visit per turn even if multiple conditions are met.
6. `happyGroupsThisTurn` resets every turn (bug fix — required for Relax's
   first-per-turn bonus, and incidentally fixes the same long-standing bug
   for every other happiness-group item in the game, e.g. Fast Food,
   tickets).

## Non-Goals

- Weekend mandatory cost, Lottery draw/payout, Computer Profits (→ a
  future "turn-start random events" milestone).
- Apartment/street Wild Willy robbery, Appliance Repair, Donations (→ a
  future "property risk & safety net" milestone).
- The separate, unrelated bug where `applyStartOfWeek` resets a player's
  `locationId` to the hardcoded `homeLocationId` constant instead of their
  actual `apartmentId` (filed separately, not fixed here — `Relax`'s
  legality check is written to be correct regardless, by comparing against
  `apartmentId` directly rather than the buggy reset).
- Any AI (`@jones/ai`) changes — `GreedyPlanner`/`RandomPlanner` are not
  taught to deliberately buy food or `Relax`; they'll simply experience the
  new penalties like a careless human would. (`@jones/ai`'s existing
  long-horizon integration tests already run the unmodified planners
  through hundreds of weeks and will exercise this for free.)
- Any UI changes (`@jones/game`) — this is `@jones/core`/`@jones/config`
  only, consistent with M1–M3e/M3.

## Player-State Changes

`PlayerState` (no new fields beyond what already exists — only changed
*semantics*):
- `fastFood: number` — already incremented on purchase (`shopping.ts`);
  now also read and cleared to `0` every start-of-turn.
- `freshFood: number` — already incremented by `freshFoodWeeks` on
  purchase; now also decremented/zeroed/capped every start-of-turn.
- `happyGroupsThisTurn: string[]` — already pushed-to on purchase; now
  also reset to `[]` every start-of-turn (the bug fix).

New `@jones/config` constants (`GameConstants`): `freshFoodFridgeCapacity:
6`, `freshFoodFreezerBonus: 6` (total capacity with both = 12),
`relaxHoursCost: 6`, `relaxAmount: 3`, `maxRelaxation: 50`,
`starvationHoursLost: 20`, `doctorHoursLost: 10`.

Cooking Bonus / Hot Tub exemption / fridge/freezer checks all key off the
**existing** `durableType` field on owned durables (`"stove"`,
`"microwave"`, `"hotTub"`, `"refrigerator"`, `"freezer"`) — no config
schema changes needed.

## Start-of-Turn Sequence

Two insertion points in `packages/core/src/turn.ts`, matching the spec's
relative ordering around the win check (`hasWon`, called from
`advanceTurn` between them):

### In `applyStartOfWeek` (runs *before* the win check)

1. Reset `happyGroupsThisTurn = []` (bug fix).
2. **Cooking Bonus:** if the player owns a durable with `durableType ===
   "stove"` or `"microwave"`, `happiness += 1` (capped at +1 total even if
   both are owned).
3. **Relaxation decay:** unchanged existing line (`relaxation = max(10,
   relaxation - 1)`), but skipped entirely if the player owns a durable
   with `durableType === "hotTub"`.

### New `applyFoodAndHealth(p, state, config, events)` (called from
`advanceTurn` alongside the existing `applyDueDates`, i.e. *after* the win
check, only when the player hasn't just won)

1. **Spoiled Food:**
   - No `durableType === "refrigerator"` owned, `freshFood > 0` →
     `freshFood = 0`; `happiness -= 2`; `spoiledThisTurn = true`; emit
     `FoodSpoiled`.
   - Owns a fridge: `capacity = 6 + (owns "freezer" ? 6 : 0)`. If
     `freshFood > capacity` → `excess = freshFood - capacity; freshFood =
     capacity; happiness -= 1`; emit `FoodSpoiled` (with `excess`).
2. **Starvation:** `fed = false`.
   - If owns a fridge and `freshFood > 0` → `freshFood -= 1; fed = true`.
   - Else if `fastFood > 0` → `fed = true`.
   - If `!fed` → `hoursRemaining = max(0, hoursRemaining -
     starvationHoursLost); happiness -= 2; starvedThisTurn = true`; emit
     `PlayerStarved`.
   - Unconditionally: `fastFood = 0`.
3. **Doctor Visit:** roll up to three independent `nextFloat(state.rng)`
   draws (only for conditions that are actually true this turn, threading
   `state.rng` after each draw the same way `hire.ts`'s luck roll does):
   `starvedThisTurn` → 25%, `spoiledThisTurn` → 50%, `relaxation === 10` →
   20%. If **any** succeeds **and** `cash > 0` → exactly one visit (no
   stacking): `hoursRemaining = max(0, hoursRemaining - doctorHoursLost);
   happiness -= 4`; cost via `nextInt`/`nextFloat` tiered by current cash
   — `≥$500` → random $30–200; `$50–499` → random $30–50; `$31–49` →
   random $30–cash; `≤$30` → all cash — then `cash -= cost`; emit
   `DoctorVisited` (with `cost`).

New `GameEvent` variants: `FoodSpoiled { playerId, excess? }`,
`PlayerStarved { playerId, hoursLost }`, `DoctorVisited { playerId,
hoursLost, happinessCost, cost }`.

## The `Relax` Command

New `Command` variant: `{ type: "Relax" }`.

**Legality** (checked in `reduce.ts`, same style as `Work`/`Study`):
`insideBuilding && locationId === p.apartmentId`. This correctly works at
whichever apartment the player actually lives in (Low-Cost or Security),
independent of the separate `locationId`-reset bug noted in Non-Goals.
Illegal elsewhere → `InvalidAction`. Insufficient hours → `NotEnoughTime`
(same pattern as Work/Study).

**Effect:**
- Costs `relaxHoursCost` (6) hours.
- `relaxation = min(maxRelaxation, relaxation + relaxAmount)` (i.e. +3,
  capped at 50).
- `happiness += 2` only if `"relax"` is not already in
  `happyGroupsThisTurn` this turn (first-per-turn, reusing the existing
  happiness-group mechanism from `shopping.ts` — `"relax"` is a synthetic
  group name, not tied to any `ItemDef`).
- Emits `Relaxed { playerId, relaxation, happinessGained }`.

## Testing Strategy

- **Unit tests** (new `packages/core/test/food-health.test.ts`): one
  scenario per sub-mechanic in isolation, asserting real state changes
  (no mocking) — fed via fast food only, fed via fresh food + fridge,
  starvation when unfed, spoilage with/without fridge, over-capacity loss
  with both fridge+freezer, cooking bonus with stove only / microwave only
  / both (still capped at +1), Hot Tub relaxation exemption,
  `happyGroupsThisTurn` resetting every turn (and that a second `Relax` or
  repeat Fast Food purchase in the same turn does *not* re-grant
  happiness), and Doctor Visit triggering + cost tiers using fixed RNG
  seeds (deterministic, exact-value assertions — same style as
  `hire.ts`'s existing luck-roll tests).
- **`Relax` command tests** (new `packages/core/test/relax.test.ts`):
  legality (only at the player's own apartment; `InvalidAction` elsewhere;
  `NotEnoughTime` when hours are insufficient), relaxation capping at 50,
  first-per-turn happiness only (a second `Relax` in the same turn costs
  hours and restores relaxation but grants no further happiness).
- **Integration test:** a multi-week scenario where the player never buys
  food, showing hours and happiness erode turn over turn until a Doctor
  Visit fires, cross-checked against the spec's exact numbers (deterministic
  seed, exact-value assertions on the turn where it fires).
- **Re-verify, don't rewrite:** `packages/ai/test/integration.ai.test.ts`
  (already runs 100–300 week headless games) should be re-run once this
  lands to confirm it still passes unmodified — it will now exercise
  Starvation/Doctor Visit organically since neither planner buys food
  deliberately.

## Open Questions

None — all scope and behavior decisions were resolved during brainstorming.
The `happyGroupsThisTurn` reset bug is fixed as part of this milestone (see
Player-State Changes); the unrelated `locationId`/`apartmentId` bug is
explicitly out of scope (see Non-Goals) and tracked separately.
