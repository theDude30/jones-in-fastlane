# AI Poverty-Spiral Recovery — Design Spec

**Status:** Approved, ready for implementation plan.

## Context

Reported by the user: a solo-vs-AI game never produces a winner, even after
hitting "End Turn" ~200 times (the AI's opponent never wins despite having
unlimited turns to do so). Root-caused via a 200-week headless simulation
(`makeAgent(aiDifficulty.medium, defaultConfig, 42, 0)`):

- Around week 5-6, the AI's cash hits `$0` (rent garnishment + normal
  spending).
- Clothing decays every week (`applyStartOfWeek`) regardless of cash. Once
  it decays below a job's uniform requirement, `GreedyPlanner.work()`
  redirects to `buyUniform()` — which, with `$0` cash, can never afford
  anything and returns `null`. The AI can never work again.
- With no income, cash stays `$0` forever. `dependibility` decays 3/week
  with nothing to restore it (only `Work` restores it), bottoming at 0.
- Unfed every week (no cash for food), `applyFoodAndHealth` applies the
  starvation penalty (-2 happiness) every week indefinitely, with no
  recovery mechanism.
- By week 200 in the reproduction: happiness **-397**, cash `$0`, career
  score `0`, wealth score `0` — and the spiral has no floor and no escape.

This is not a missing win-check — `hasWon()` runs correctly every turn.
The actual gap: **neither AI planner has any way to raise emergency cash**.
`packages/ai/src/selectors.ts`'s `legalCommands` — the complete command
repertoire `RandomPlanner` ever considers — excludes `OpenBroker`,
`SellStock`, `SellTBill`, and `PawnItem` entirely (confirmed by inspection:
none of those four command types appear anywhere in `legalCommands`).
`GreedyPlanner`'s goal-pursuit logic (`work`/`getJob`/`educate`/
`buyHappiness`) has no "I'm stuck, raise liquidity" fallback either. Once a
player has zero cash and lapsed clothing, the existing AI behavior model
has no way out — by design, not by oversight (M3f's design spec explicitly
scoped "teach the AI to manage food/clothing" as out of scope), but nobody
previously noticed the AI could become *permanently* unemployable, not just
inconvenienced.

`@jones/core` already has every command needed (`PawnItem`, `SellStock`,
`SellTBill`, `OpenBroker`) and a real loss/bankruptcy terminal state was
explicitly considered and rejected for this pass (see Non-Goals) — this is
purely an `@jones/ai` behavior gap.

## Goals

1. `GreedyPlanner` tries to raise emergency cash (pawn a durable, sell a
   T-bill, or sell a stock) when it would otherwise end its turn with no
   goal-pursuing action available, and owns something sellable.
2. `RandomPlanner` gains the same four command types in its repertoire
   (`legalCommands`), so it can stumble into recovery the same way it
   already stumbles into everything else — both difficulty tiers should be
   incapable of a *permanent* softlock, not just the smarter one.
3. The exact reproduction scenario (seed 42, medium difficulty, 200 weeks)
   demonstrably recovers after the fix — verified by a new regression test
   alongside the existing long-horizon integration tests.

## Non-Goals

- No `@jones/core`/`@jones/config` changes — every needed command already
  exists.
- No loss/bankruptcy terminal `GameStatus` value. Confirmed against both
  reference docs (`2026-06-15-jones-game-logic-reference.md`,
  `2026-06-15-jones-in-the-fast-lane-design.md`) that neither describes a
  time limit or bankruptcy condition — the original design is "first to
  hit all four goals wins," nothing else. This fix keeps that model intact
  by making recovery *possible*, not by adding a way to lose instead.
- No change to how *humans* play — a human player already has full agency
  to pawn/sell assets themselves; this only teaches the two AI planners the
  same option.
- No proactive cash-buffer management (e.g., "sell something whenever cash
  drops below $50") — only last-resort recovery when nothing else is
  possible, per the approved scope.

## Architecture

### `GreedyPlanner` — `emergencyLiquidity` as last resort

A new private method on `GreedyPlanner`, tried in `nextCommand` *after* the
existing `rankedUnmetGoals` loop returns nothing (i.e., the planner would
otherwise fall through to `{ type: "EndTurn" }`):

```
private emergencyLiquidity(p: PlayerState, state: GameState): Command | null {
  // 1. Own a durable whose durableType isn't already pawned (state-wide,
  //    since pawnedItems is shared across all players)? Navigate to the
  //    pawn shop, PawnItem.
  // 2. Else own a T-bill (tBills > 0)? Navigate to the bank, OpenBroker if
  //    not already open, SellTBill.
  // 3. Else own any stock (p.stocks[id] > 0 for some configured stock id)?
  //    Same navigation/broker-open step, SellStock for that stock.
  // 4. Else: null — truly nothing left to liquidate; falls through to EndTurn.
}
```

This mirrors `buyUniform`/`work`'s existing navigation pattern
(`this.navigateInto(p, locationId)` returning a `TravelTo`/`EnterBuilding`
command when not yet there, the actual action command once in position) —
no new navigation primitive needed.

### `RandomPlanner` / `legalCommands` — repertoire expansion

`packages/ai/src/selectors.ts`'s `legalCommands` gains four more entries,
each gated by the exact precondition `reduce()` itself enforces (verified
against `packages/core/src/finance.ts`/`pawn.ts`):

- `OpenBroker`: at the bank, inside, broker not already open.
- `SellStock` (one entry per stock the player owns, qty > 0): broker open.
- `SellTBill`: broker open, `tBills > 0`.
- `PawnItem` (one entry per owned durable whose type isn't already pawned
  state-wide): at the pawn shop, inside.

`RandomPlanner` picks uniformly from whatever `legalCommands` returns, so
no change to `RandomPlanner` itself is needed — only to the list it draws
from.

## Testing strategy

Matches the project's existing AI testing conventions (real `createInitialGame`
fixtures, real `reduce()`/`playGame()`, no mocking):

- **`packages/ai/test/greedy.test.ts`**: unit tests for `emergencyLiquidity`
  covering all three priority branches (durable available → pawn; only a
  T-bill → sell it; only a stock → sell it) and the null case (nothing to
  liquidate, falls through to the existing goal-loop/`EndTurn` behavior).
- **`packages/ai/test/selectors.test.ts`**: unit tests confirming the four
  new `legalCommands` entries appear/don't appear correctly based on
  location, broker-open, and ownership preconditions — mirroring the
  existing `describe("legalCommands", ...)` block's pattern.
- **`packages/ai/test/integration.ai.test.ts`**: a new regression test
  reproducing the exact diagnosed scenario (`aiDifficulty.medium`, seed 42,
  200 weeks) and asserting recovery — concretely, that the player's cash
  becomes positive again at some point after going to zero (proving the
  spiral was broken), rather than monotonically declining to the end of the
  simulation as it does today.

## Self-review

- **Scope:** Touches only `packages/ai/src/greedy.ts` and
  `packages/ai/src/selectors.ts` (plus their tests). No
  `@jones/core`/`@jones/config` changes — confirmed every needed command
  (`PawnItem`, `SellStock`, `SellTBill`, `OpenBroker`) already exists and is
  already exercised by existing core tests.
- **No placeholders:** every priority branch and precondition is concrete
  and traceable to an existing guard function in `@jones/core`.
- **Consistency:** the navigation pattern matches `GreedyPlanner`'s existing
  `buyUniform`/`work`/`getJob`/`educate` methods exactly — no new pattern
  introduced.
- **Root cause, not symptom:** the fix addresses the actual mechanism (no
  recovery path once broke + unemployable) rather than papering over the
  symptom (e.g., a special-cased "give the AI free cash" rule, or hiding
  the negative happiness display) — both planners gain the same option a
  human already has.
