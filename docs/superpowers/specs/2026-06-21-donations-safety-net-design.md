# Donations Safety Net — Design Spec

**Status:** Approved, ready for implementation plan.

## Context

While fixing a reported bug (AI opponents never winning because they get
permanently stuck in a poverty spiral — zero cash + lapsed clothing → can
never afford a uniform → can never `Work` again → no income, ever), an
emergency-liquidity fix was added to `@jones/ai` (pawn a durable / sell a
T-bill / sell a stock as a last resort). Verifying the exact reported
reproduction (seed 42, medium difficulty) revealed that fix alone is
insufficient: it only helps a player who already owns *something* to
liquidate when they go broke. A player (AI on any difficulty, or
conceivably a careless human) who hits `$0` cash and `$0` assets has no way
out at all — and `GreedyPlanner`'s deliberate logic never proactively
invests, so on **hard difficulty** (`epsilon: 0`, no random "mistakes")
the AI can *never* acquire a liquidatable asset through its own choices.

The authoritative reference
(`docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md`) already
specifies the *actual* intended safety net for exactly this scenario — not
an invented mechanic, but one explicitly deferred during M3f as future work
(`docs/superpowers/specs/2026-06-17-m3f-food-and-health-design.md`'s
Non-Goals: "Apartment/street Wild Willy robbery, Appliance Repair,
**Donations** (→ a future 'property risk & safety net' milestone)"):

> **§2 step 17 — Donations:** if "naked" 2+ turns and broke, receive enough
> for clothes + small cash.
>
> **§12 — Donation:** (CD-ROM) no clothes 2+ turns, Cash <$300, Net Worth
> <$300 → receive cost-of-clothes-for-current-job (or $50 if unemployed) +
> random $1–100.
>
> **§4 — Net Worth** (used only for Donation eligibility) = Liquid Assets +
> value of all owned Durables (incl. pawned). Durable value = price paid
> for the last unit of that type × quantity.
>
> **§4 — Liquid Assets** = Cash + Bank balance + current Stock value.

This spec implements exactly that mechanic, in `@jones/core` (it's a core
game rule, not AI behavior), so the AI's emergency-liquidity fix is backed
by a real fallback even when it owns nothing — and a human player gets the
same protection the original game gives them.

## Goals

1. A player who has had no clothes at all for 2+ consecutive turns, with
   cash under $300 and Net Worth under $300, receives a cash donation: the
   cheapest item satisfying their current job's required uniform level
   (or a flat $50 if unemployed), plus a random $1–100.
2. This applies symmetrically to every seat, matching every other
   start-of-turn mechanic already in `turn.ts`/`health.ts` (including
   seat 0 at game creation, via the existing fix in `setup.ts`).
3. Donating resets the consecutive-no-clothes counter, so it can't fire
   again every single turn while the player is still rebuilding.

## Non-Goals

- No other deferred safety-net/random-event mechanics from the same
  reference cluster (Wild Willy robbery, Appliance Repair, Computer
  Profits, Weekend costs, Lottery draws) — those remain separately
  deferred, unchanged from M3f's scoping.
- No change to the existing Wealth goal's score formula
  (`goalScores`'s `wealth = floor((cash + bank) / 100)`, which already
  excludes stock value — a pre-existing simplification noted but
  out of scope here). Net Worth for Donation eligibility is computed fresh,
  separately, exactly per the reference's formula — it does not replace or
  alter the existing Liquid-Assets-for-Wealth-goal calculation.
- No `@jones/ai` changes — `GreedyPlanner`/`RandomPlanner` don't need to
  know about Donations at all; it's an automatic start-of-turn effect, not
  a command either planner chooses to take.

## Architecture

### New `PlayerState` field

`weeksWithoutClothes: number` — initialized to `0` in `createInitialGame`.
Incremented by the new turn-sequence step (below) whenever
`bestUniform(p) === null` (the existing helper in `work.ts`, already used by
`meetsUniform`), reset to `0` whenever the player has any clothing or
receives a donation.

### `applyDonation` — new function in `packages/core/src/health.ts`

```
applyDonation(p: PlayerState, state: GameState, config: GameConfig, events: GameEvent[]): void
```

Logic:

1. If `bestUniform(p) !== null` (has some clothing): `p.weeksWithoutClothes = 0`; return.
2. Otherwise: `p.weeksWithoutClothes += 1`.
3. If `p.weeksWithoutClothes < 2`: return (not yet eligible).
4. Compute `netWorth(p, state, config)` (new small helper, same file): `p.cash + p.bank + Σ(p.stocks[id] * state.stockPrices[id]) + Σ(pricePaid for every entry in p.durables) + Σ(pricePaid for every entry in state.pawnedItems where pawnedByPlayerId === p.id)`.

   This sums every durable holding's own recorded `pricePaid` directly,
   rather than grouping by `durableType` and using only the "last unit's"
   price as the reference literally describes — the existing data model has
   no acquisition-order timestamp on `p.durables` to determine "last," and
   in the overwhelming majority of cases a player holds at most one item
   per `durableType` at a time anyway (owned XOR pawned, not both — dedup
   rules in `shopping.ts`/`legalCommands` prevent owning two of the same
   type simultaneously), in which case the two formulas are identical. The
   only divergence is the rare edge case of pawning an item then buying a
   replacement of the same type before redeeming the original — direct
   summation slightly over-counts there versus the reference's "last price
   only" rule. Accepted as a reasonable simplification given the data
   model; not expected to matter in practice.
5. If `p.cash >= 300 || netWorth >= 300`: return (not broke enough).
6. Compute the grant: if `p.jobId === null`, base = `50`. Else, base = the cheapest `config.items` entry whose `clothingCategory` matches the job's required uniform level's `basePrice` (mirroring `@jones/ai`'s `buyUniform` price-selection logic, but without an affordability filter — this is the cash that makes it affordable).
7. Roll `random = nextInt(state.rng, 1, 100)` (threading `state.rng` the same way every other RNG-using core function already does).
8. `p.cash += base + random`; `p.weeksWithoutClothes = 0`; emit `DonationReceived`.

### New `GameEvent` variant

```
{ type: "DonationReceived"; playerId: string; amount: number }
```

### Wiring into `turn.ts`

In `advanceTurn`, `applyDonation` is called immediately after the existing
`applyFoodAndHealth` call (matching the reference's step ordering — clothing
decay already happened earlier in `applyStartOfWeek`, food/health already
ran just before):

```
applyDueDates(upNext, state, config, events);
applyFoodAndHealth(upNext, state, config, events);
applyDonation(upNext, state, config, events);
```

Seat 0 gets this automatically at creation too, since `setup.ts` already
mirrors `advanceTurn`'s tail (including the `applyFoodAndHealth` call) for
the first player — `applyDonation` is added there in the same place.

## Testing strategy

Matches the project's established core testing convention (real
`createInitialGame` fixtures, real `reduce()`, no mocking):

- New `packages/core/test/donation.test.ts` (or appended to
  `food-health.test.ts`, mirroring where `applyFoodAndHealth`'s own tests
  live): the 2-turn threshold (no donation on turn 1 without clothes,
  donation on turn 2), the cash/net-worth eligibility gates (no donation if
  cash ≥ $300 even when naked long enough; no donation if durables/stocks
  push net worth ≥ $300 even with low cash), the employed-vs-unemployed
  grant base ($50 flat vs. cheapest matching uniform item price), the
  counter resetting after a donation (and after acquiring any clothing).
- Update the existing `packages/ai/test/integration.ai.test.ts` regression
  test (added during the AI poverty-recovery work, currently failing
  because the exact reproduction scenario has zero liquidatable assets) —
  once Donations exists, that exact scenario should recover via the
  donation path instead of (or in addition to) asset liquidation.

## Self-review

- **Scope:** Touches `packages/core/src/types.ts` (new field, new event),
  `packages/core/src/setup.ts` (initialize the field, wire the new call
  alongside the existing seat-0 parity fix), `packages/core/src/health.ts`
  (new `applyDonation`/`netWorth` functions), `packages/core/src/turn.ts`
  (wire the new call into `advanceTurn`). No `@jones/ai`/`@jones/config`
  changes.
- **No placeholders:** every formula (Net Worth, grant amount, trigger
  thresholds) is copied verbatim from the authoritative reference, not
  invented.
- **Consistency:** `applyDonation`'s signature and RNG-threading pattern
  (`nextInt(state.rng, ...)`, reassigning `state.rng = result.state`)
  matches `applyFoodAndHealth`'s existing Doctor Visit roll exactly — same
  file, same established pattern, not a new convention.
- **Root cause, not a workaround:** this directly closes the gap the AI
  poverty-recovery fix's own verification exposed (an AI with zero assets
  has no path to recovery at all) by implementing the mechanic the original
  game already specifies for this exact situation, rather than inventing
  a new one.
