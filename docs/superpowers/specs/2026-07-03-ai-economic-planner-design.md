# AI Economic Planner (BudgetPlanner) — Design

**Date:** 2026-07-03
**Status:** Approved
**Package:** `@jones/ai` (plus a small preset change in `@jones/config`)

## Problem

The current `GreedyPlanner` picks the weakest unmet goal each step and maps it to a
single activity. It never eats, never pays rent, never maintains its health or
happiness, and cannot hold all four goals above target simultaneously. Empirically,
0/60 headless games ever produced a legitimate winner; games only end via the
`maxWeeks` timed cap added in the guaranteed-termination sub-project.

Root causes:

1. Starves every week (−20 hours via `starvationHoursLost`, −2 happiness).
2. Never pays rent, so garnishment skims half of every wage forever.
3. One-action-per-goal myopia: no budgeting of the 60-hour week or the cash needed
   to satisfy all four goals at the same instant.

Two mechanics discovered during design that shape everything:

- **Happiness starts at 0 and ratchets** (no weekly decay): it is a "pump +30
  cumulative, then protect" problem, not a maintenance problem.
- **Career 30 is impossible without a degree**: `maxDependibility` starts at 20 and
  only graduation raises it (+5 per degree, plus +5 dependibility instantly and +5
  `maxExperience`). Dependibility ≥ 24 (career score 30) needs ≥ 1 degree; the
  default education goal of 19 needs exactly 2. Education is the critical path.

## Success criteria

- Hard-difficulty AI, solo game, default goals (wealth 30 / happiness 30 /
  education 19 / career 30): **≥ 90% of seeds end via `PlayerWon`** (legitimate
  goal completion), not `GameEndedByTime`, with median win ≤ 80 weeks (N = 40
  seeds in CI).
- 4-seat all-AI games still terminate with exactly one winner.
- Fully deterministic given the game seed (RNG used only for epsilon mistakes).

## Decisions (from brainstorm)

- **Success bar:** reliably wins (≥ 90%), verified by a statistical headless test.
- **Repertoire — essentials only:** Work, ApplyForJob, RequestRaise is *not* used
  (see Out of scope), Enroll/Study, BuyItem (food, clothes, tickets, microwave,
  refrigerator), PayRent, Relax, navigation, EndTurn, plus the existing
  `emergencyLiquidity` pawn/sell fallback. Loans, stocks, T-bills, lottery,
  apartment switching, rent extensions, and banking are deliberately unused.
  Banking in particular: there is no interest and no theft, and the wealth score
  counts `cash + bank` equally — `Deposit` is pure overhead.
- **GreedyPlanner is deleted.** The new `BudgetPlanner` takes over medium (with
  epsilon mistakes) and hard. Easy stays `RandomPlanner`.

## Approach: budgeted priority ladder

Every `nextCommand` call re-derives everything from `GameState` — no stored plan.
A fixed hierarchy of needs is walked top-down; the first rung that returns a
command wins. Cash reservations computed up front stop lower rungs from spending
money that higher rungs need ("never spend the rent"). Because nothing is cached,
the planner self-heals after shocks (doctor visits, garnishment, denied
applications, economy swings) for free.

Alternatives considered and rejected: utility-scored action selection (myopic —
exactly what sank greedy; weight tuning is empirical whack-a-mole) and a weekly
compiled command queue (needs invalidation/replan machinery for mid-turn shocks).
The ladder borrows the queue's best idea — weekly budgeting — via reservations
and rung ordering instead of a stored plan.

## Module layout (`packages/ai/src`)

| File | Responsibility |
|---|---|
| `budget.ts` *(new)* | Pure functions: compute a `TurnBudget` from `(state, player, config)`. No RNG, no mutation. |
| `rungs.ts` *(new)* | The priority ladder: ordered list of rung functions `(ctx: TurnContext) => Command \| null`. Each rung exported and unit-testable alone. |
| `planner.ts` *(new)* | `BudgetPlanner implements Agent`: builds `TurnContext` per call (player, budget, adjusted prices), epsilon mistake roll (same mechanism as greedy had), walks the ladder, falls through to `emergencyLiquidity`, then `EndTurn`. Only planner state is the mistake RNG. |
| `nav.ts` *(new)* | `navigateInto` extracted from greedy (exit → travel → enter) plus a `goBuy(item)` helper. |
| `greedy.ts` | **Deleted.** |
| `selectors.ts` | Stays; rungs use it; `legalCommands` still powers epsilon mistakes and `RandomPlanner`. |
| `agent.ts` | `makeAgent` maps `planner: "budget"` → `BudgetPlanner`. |

## TurnBudget

Recomputed every call:

- `rentReserve` — `currentRent` when `rentDueWeek − week ≤ 2`. Paying rent at any
  point in the cycle advances `rentDueWeek` by exactly `weeksPerMonth`, so paying
  early costs nothing over the game.
- `foodReserve` — price of next week's food: cheapest fast food if no
  refrigerator; fresh-food restock if fridged.
- `uniformReserve` — price of the cheapest replacement outfit when the job's
  required uniform has ≤ 2 weeks left.
- `cashFloor` = the three reserves + a weekly shock buffer (~$50, tunable) for
  doctor bills and price swings.
- `discretionary` = `cash − cashFloor` — the only money the happiness and wealth
  rungs may see.

## The ladder

First rung that returns a command wins; all-null → `EndTurn`.

| # | Rung | Fires when | Does |
|---|---|---|---|
| 1 | Eat | Next week's starvation check would fail (no fridge: `fastFood == 0`; fridge: `freshFood ≤ 1`) | Buy cheapest fast food at Monolith Burgers / restock the 4-week fresh pack at Black's Market |
| 2 | Rent | `rentDueWeek − week ≤ 1` and cash covers `currentRent` | Navigate to rent office, `PayRent` |
| 3 | Clothes | Job's required uniform (or `casual` if unemployed) has ≤ 1 week left | Buy cheapest qualifying garment |
| 4 | Health | `relaxation ≤ 12` (tunable) | Go home, `Relax` (+3 relaxation, +2 happiness; avoids the `relaxation == 10` → 20% doctor-visit roll) |
| 5 | Employment | No job → apply for best eligible (Monolith cook is `alwaysApproved` fallback). Employed → apply for an upgrade only if `baseWage ≥ current baseWage + 2` **and** its uniform is already affordable | `ApplyForJob` |
| 6 | Dep-maintenance work | `dependibility < maxDependibility` | `Work` (offsets −3/week decay, +1 experience) |
| 7 | Cash-floor work | `cash < cashFloor` | `Work` (income before tuition) |
| 8 | Education | Education score below goal (`1 + 9·degrees < eduGoal`, i.e. degrees < 2 at defaults) | `Study` current enrollment; else `Enroll`, preferring prereq-free degrees in config order (juniorCollege, tradeSchool) with the fee paid from `discretionary` |
| 9 | Happiness pump | `happiness < goal + buffer` (buffer ~2, tunable) | From `discretionary` only: one-time investments in order — microwave $220 (+1 happiness *every* week via the stove/microwave weekly bonus), refrigerator $650 (unlocks fresh-food economics and its +1..+4 per purchase) — then cheap tickets (theatre $30/+2, concert $40/+2, baseball $45/+2, one of each per turn via happiness groups) |
| 10 | Wealth sweep | Wealth score < goal and hours remain | `Work` every remaining hour |
| — | Fallback | Nothing actionable | Existing `emergencyLiquidity` (pawn durable / sell T-bill / sell stock), then `EndTurn` |

Design notes:

- **Ordering does the budgeting.** Rung 7 above rung 8 means tuition money and
  study hours only happen after the week's income is secured — no explicit study
  quota. Rung 9 above 10 means happiness gets funded while wealth accumulates;
  since happiness ratchets, rung 9 goes permanently dormant once it crosses
  target + buffer and all surplus flows to wealth.
- **Career emerges, not coded.** Rung 6 holds dependibility at its cap;
  graduation raises the cap and `maxExperience` (unlocking the wage-8,
  casual-uniform Black's Market checker at experience 20). Career 30 = dep 24 is
  reachable only after degree #1.
- Navigation for every rung goes through the shared `navigateInto`; each rung
  re-checks the same preconditions `reduce` enforces, so emitted commands don't
  bounce off `InvalidAction`.

## Edge cases and failure handling

- **Can't pay rent when due:** rung 2 can't fire; debt accrues and garnishment
  recovers it at half-wages (+$2/shift interest). Rungs 6–7 keep working, debt
  drains, reserves rebuild. `RequestRentExtension` stays unused (poisons
  `everInRentDebt` paths; adds RNG for little gain).
- **Fired / application denied by luck:** nothing is stored; the next call
  re-runs rung 5, and cook (`alwaysApproved`) guarantees re-employment. Failed
  upgrade attempts retry next week at 4h each, bounded by the wage-gap threshold.
- **Dependibility death spiral** (dep < 10, no eligible jobs): essentially
  unreachable with rung 6, but if it happens, donations and the 156-week points
  cap are the backstop. Explicitly out of scope (existing poverty-recovery
  behavior).
- **Doctor-visit cash shocks** ($30–200): absorbed by the weekly buffer plus
  rung 7 refilling to `cashFloor` before any discretionary spending.
- **Stalls:** every rung either emits a command its own preconditions guarantee
  `reduce` accepts, or returns null and the walk continues to `EndTurn`. The
  runner's 200-command cap + forced `EndTurn` stays as last resort.

## Presets and tuning

`packages/config/src/ai.ts`:

- easy = `{ planner: "random", epsilon: 0 }` (unchanged)
- medium = `{ planner: "budget", epsilon: 0.15 }` — 15% of calls play a uniformly
  random legal command (same mechanism as today)
- hard = `{ planner: "budget", epsilon: 0 }`
- `weights` is **removed** from `AIDifficultyPreset` (greedy-only concept); any
  usage outside `@jones/ai` is cleaned up with it.

Strategy tunables (not difficulty) live as a `PlannerTuning` constant in
`packages/ai`, not in config presets: happiness buffer (2), weekly cash buffer
($50), wage-upgrade threshold (+$2 base wage), relaxation threshold (12),
rent-pay horizon (1 week) / rent-reserve horizon (2 weeks), fridge fresh-food
low-water mark (1 week).

## Testing

1. **Unit** (`budget.test.ts`, `rungs.test.ts`): reserve math under
   rent-due / no-fridge / low-clothing states; each rung's fire/skip conditions
   against hand-built `PlayerState`s. Pure functions, no game loop.
2. **Integration — the success bar** (`integration.ai.test.ts`, replacing greedy
   expectations): hard AI solo, default goals, N = 40 seeds → ≥ 90% end via
   `PlayerWon`, median win ≤ 80 weeks. A 4-seat hard game terminates with exactly
   one winner.
3. **Determinism:** same seed twice → identical event streams.
4. **Regression economics** (one seed, cheap asserts): never starves after
   week 2; rent debt never exceeds one cycle's rent; dependibility ≥ 20 from
   week 6 on.

If 90% proves flaky at 40 seeds, tune the planner, not the threshold.

## Out of scope

- Loans, stocks, T-bills, lottery, apartment switching, rent extensions,
  banking (`Deposit`/`Withdraw`/`OpenBroker` beyond the inherited
  `emergencyLiquidity` fallback), pawn redemption, and `RequestRaise` (raises add
  RNG and the wage ladder via job upgrades already covers income growth).
- Adversarial play (racing opponents, denying the shared pawn slot).
- Poverty-recovery beyond what donations + the timed cap already provide.
- The known `locationId`/`apartmentId` reset bug in `turn.ts` (tracked
  separately; the planner reads `apartmentId` for Relax so it is unaffected).

**Amendment (post-implementation, during Task 9):** `QuitJob` was added to
`employmentRung` as a narrow, free escape hatch — if the current job has
decayed below the same `-5` firing-avoidance buffer `workCommand` already
enforces (because `ApplyForJob`'s luck roll delayed hiring past a few weeks
of dependability decay), the planner quits so it can re-apply somewhere
sustainable, instead of freezing forever with the career goal permanently
unreachable. This closed a real 31/40-seed shortfall against the 90%
win-rate bar. `QuitJob` remains otherwise unused (never issued speculatively
or as a strategy in its own right).
