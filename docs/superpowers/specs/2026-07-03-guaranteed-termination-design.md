# Guaranteed Termination — Design Spec

**Status:** Approved, ready for implementation plan.

## Context

The reported "AI never wins — game never ends" bug was investigated
empirically: 60 headless full games (3 difficulties × 4 player counts × 5
seeds) produced **0 winners**, every one running to the runner's week cap
with `status` still `"playing"`. Root-cause tracing found layered causes:

1. The AI never eats, so it starves every turn (−20 hours, −2 happiness).
2. The AI never pays rent, so $325/month accrues as debt and garnishment
   skims half of every wage earned.
3. Even with eating and rent patched in a throwaway spike, the greedy
   planner still won 0–1 of 60 games: its "pick the weakest unmet goal, do
   one action toward it" strategy cannot sustain the coherent multi-turn
   economy needed to satisfy all four win goals at once (bank $3000 for
   wealth, hold happiness at 30 against its many downward pressures, finish
   a second degree, keep dependibility up by working consistently).

The user chose to fix this along **two independent axes**: improve the AI so
it can win legitimately, *and* add a hard termination guarantee so a game
always ends with exactly one winner regardless of AI skill. Those are two
separate subsystems, decomposed into two sub-projects built in order:

- **Sub-project 1 (this spec): Guaranteed Termination** — a core-rules week
  cap; when reached with no goals-based winner, the leading player wins on
  points. Small, deterministic, and on its own it *provably* satisfies the
  user's stated requirement ("always one winner, game ends at some point").
  Built first so the AI work has a bounded harness where every game ends.
- **Sub-project 2 (separate spec, later): AI economic-planner overhaul** —
  rewrite the `@jones/ai` planner to actually pursue victory.

The original game's timed mode ends a game after a set duration and ranks
players by goal progress; this sub-project implements that faithfully.

## Goals

1. A game always terminates: once `week` exceeds a configurable cap, the
   game ends even if no player has met all four goals.
2. Termination always yields **exactly one** winner: the player with the
   highest average goal-completion percentage, ties broken deterministically
   by seat order.
3. The existing goals-based victory path (`hasWon` checked at each player's
   own turn start) is unchanged and still ends the game first whenever a
   player legitimately wins before the cap.
4. The cap is configurable and can be disabled (`≤ 0`) to preserve
   pure play-to-victory for tests or alternate configs.

## Non-Goals

- No AI behavior changes — that is sub-project 2. This sub-project only
  guarantees termination; with the current weak AI, most games will end by
  cap (on points) rather than by a real all-goals victory. That is expected
  and acceptable here.
- No new UI/rendering work. A new event is emitted so a later UI milestone
  can display "time's up — wins on points," but wiring it into any screen is
  out of scope.
- No retuning of goal targets, the economy, or existing mechanics.

## Architecture

### New config constant

Add to `GameConstants` (`packages/config/src/types.ts`) and the `constants`
object (`packages/config/src/constants.ts`):

```
maxWeeks: number; // §3 timed-game cap. Game ends by time once week > maxWeeks.
                  // <= 0 disables the cap (pure play-to-victory).
```

Default value: **156** (3 game-years of 52 weeks). This is a generous
backstop, not a tight limit — its purpose is to guarantee termination, not
to cut legitimate games short. It may be retuned after sub-project 2 shows
how long real AI victories take.

### Two pure helpers in `packages/core/src/goals.ts`

```
export function goalCompletion(p: PlayerState): number
```
Average of the four per-goal completion ratios, each individually capped at
1.0 so overshooting one goal cannot compensate for missing another:
`avg( min(s.wealth/g.wealth,1), min(s.happiness/g.happiness,1),
      min(s.education/g.education,1), min(s.career/g.career,1) )`
where `s = goalScores(p)` and `g = p.goals`. Returns a value in `[0, 1]`.

Edge case: a goal target is always ≥ 10 (per `goalRanges.min`), so no
division by zero is possible with valid game state. `goalScores` can return
negative values (e.g. negative happiness); `min(negative/target, 1)` is
negative, which correctly drags the average down. The ratio is **not**
floored at 0 — a player at −200 happiness should rank below one at 0, and
clamping both to 0 would erase that ordering. So each term is capped above
at 1 but not below.

```
export function leadingPlayer(players: PlayerState[]): PlayerState
```
Returns the player with the greatest `goalCompletion`. Iterates in array
(seat) order and only replaces the current leader on a **strictly greater**
score, so an exact tie is resolved in favor of the earlier seat —
deterministic. Assumes `players` is non-empty (always true for a real game).

### Cap check in `packages/core/src/turn.ts` (`advanceTurn`)

Inside the existing `if (wasLast)` block only — the cap is a once-per-week
check. Placed **after** `state.week += 1` and the economy step (so the week
number and end-of-week economy effects are fully applied), and **before** the
`upNext` start-of-week/`hasWon` block:

```
if (config.constants.maxWeeks > 0 && state.week > config.constants.maxWeeks) {
  const winner = leadingPlayer(state.players);
  state.winners.push(winner.id);
  state.status = "ended";
  events.push({ type: "GameEndedByTime", week: state.week, winnerId: winner.id });
  return;
}
```

`return` exits `advanceTurn` immediately, skipping the normal
`applyStartOfWeek` / `hasWon` / due-dates / food-health / donation path for
the capped week — the game is over, so no further start-of-turn processing
runs. Within the cap, `advanceTurn` behaves exactly as it does today.

Because the goals-based `hasWon` check runs earlier in each player's own turn
(unchanged), a legitimate all-goals victory that occurs on or before the cap
week still ends the game via the existing `PlayerWon` path first; the cap
only fires when the incremented week strictly exceeds `maxWeeks` with no
prior winner.

### New event in `packages/core/src/types.ts`

Add to the `GameEvent` union:
```
| { type: "GameEndedByTime"; week: number; winnerId: string }
```
Distinct from `PlayerWon` so a consumer can tell a points-win at the time
cap from an all-goals victory. `winners` is still populated identically in
both cases, so any code reading `state.winners` / `status` is unaffected.

### Runner interaction (`packages/ai/src/runner.ts`)

No code change. The runner's own `maxWeeks` option (default 520) is a
far-larger external safety stop; since it exceeds the core cap (156), the
core cap always fires first and the runner's loop exits naturally because
`state.status === "ended"`. The only constraint, noted for future config
changes: the runner cap must stay ≥ the core cap, or the runner would cut a
game off (winner-less) before core's guaranteed terminator runs.

## Testing strategy

Follows the project's core testing convention (real `createInitialGame`
fixtures, real `reduce()`, no mocking).

- **`packages/core/test/goals.test.ts`** (extend existing):
  - `goalCompletion` returns 1.0 when every goal is met or exceeded (caps at
    1 each, no overshoot credit).
  - `goalCompletion` averages partial progress correctly (e.g. two goals at
    100%, two at 0% → 0.5).
  - Negative happiness produces a below-zero term that lowers the average
    relative to a zero-happiness player (ordering preserved, not clamped).
  - `leadingPlayer` picks the strictly-highest-completion player.
  - `leadingPlayer` breaks an exact tie in favor of the earlier seat index.

- **`packages/core/test/turn.test.ts`** (extend existing):
  - Advancing the final seat's turn on the cap week (`week` becomes
    `maxWeeks + 1`) with no goals-based winner sets `status: "ended"`,
    pushes exactly one id to `winners`, and emits `GameEndedByTime` with that
    week and winnerId.
  - A player who legitimately meets all goals on or before the cap week still
    ends via `PlayerWon` (cap path does not pre-empt a real victory).
  - `maxWeeks <= 0` disables the cap: advancing well past 156 weeks keeps
    `status: "playing"` when no one has won (verified with a config override).

- **`packages/ai/test/integration.ai.test.ts`** (extend existing): a
  headless game run with a small `maxWeeks` override (e.g. 3) terminates by
  week 4 with `status: "ended"` and exactly one entry in `winners`.

## Self-review

- **Scope:** touches `packages/config/src/types.ts` + `constants.ts` (new
  constant), `packages/core/src/goals.ts` (two helpers),
  `packages/core/src/turn.ts` (cap check), `packages/core/src/types.ts` (new
  event). No AI logic changes; no UI changes.
- **No placeholders:** the winner metric, tiebreak rule, cap placement, and
  default value are all fully specified.
- **Consistency:** `goalCompletion` reuses the existing `goalScores` and the
  player's own `goals`; the cap check reuses the existing `winners`/`status`
  end-of-game representation, so downstream consumers need no changes.
- **Determinism:** the tiebreak is strict-greater seat-order, so a given
  game state always yields the same single winner — no RNG consumed, no
  nondeterminism introduced.
- **Root cause vs. workaround:** this does not pretend to fix the AI (that is
  sub-project 2); it is an honest, faithful implementation of the original
  game's timed-mode termination, and it independently guarantees the user's
  stated requirement that every game ends with exactly one winner.
