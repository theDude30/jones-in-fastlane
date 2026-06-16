# Economy & Hiring Design

**Date:** 2026-06-16
**Status:** Approved design (pre-implementation)
**Milestone:** M2 prerequisite — first game-systems extension after M1 Core Foundation

## Summary

Extends `@jones/core` and `@jones/config` with two tightly-coupled systems from the
authoritative game-logic reference:

- **§5 Economy** — a weekly RNG-driven Index/Reading model that adjusts all offered
  prices and wages, plus probabilistic Crash and Boom events from week 8 onward.
- **§6 Hiring** — three new commands (`ApplyForJob`, `RequestRaise`, `QuitJob`) that
  let players get jobs, advance their wage, and leave employment.

This is the first milestone that makes the RNG state functional (economy step is the
first consumer of `GameState.rng` in the turn sequence) and the first that gives
players income through a realistic hiring flow rather than pre-assigned jobs.

## Goals

1. Economy-adjusted offered wages so `ApplyForJob` reflects market conditions.
2. Full crash/boom event model (Minor/Moderate/Major Crash; Boom), including firing
   employed players and cutting wages — applied at the week boundary.
3. Pluggable economy: `DynamicEconomy` (default) and `ConstantEconomy` (tests), chosen
   by `GameConfig.economy.mode`. Tests never depend on live RNG output.
4. Hiring gates: Experience, Dependibility, Degrees, "No Openings" luck roll.
5. Raise logic: dep gate formula, economy-adjusted offered wage comparison.
6. All new behaviour exercised by focused unit tests + one integration test.

## Non-Goals (deferred to later plans)

- Study/degrees (§7) — degree prerequisites in the job table are respected but not
  earnable until the Study plan lands.
- Bank, loans, stocks (§9) — Major Crash bank-wipe emits the event but `p.bank`
  stays 0 (bank system not yet built).
- Rent, clothing purchase, items (§10–§11).
- Happiness system beyond the deltas specified in §6 (full happiness model in §12).
- Random events other than Crash/Boom (§12).

## Architecture

### Package changes

**`@jones/config`**
- `src/economyConfig.ts` — `EconomyConfig` type + `defaultEconomyConfig` values.
- `src/defaultConfig.ts` — adds `economy: EconomyConfig` to `GameConfig`.
- `src/index.ts` — exports `EconomyConfig`, `defaultEconomyConfig`,
  `constantEconomyConfig` (for tests).

**`@jones/core`**
- `src/economy.ts` — `Economy` interface, `DynamicEconomy`, `ConstantEconomy`,
  `makeEconomy(config)` factory, `adjustedPrice` helper.
- `src/hire.ts` — `applyForJob`, `requestRaise`, `quitJob` logic functions called
  from the reducer.
- `src/types.ts` — new `Command` variants, `GameEvent` variants, updated
  `PlayerState` (`raisesReceived`), updated `GameState` (`economy` object).
- `src/turn.ts` — economy step wired into `advanceTurn` at week boundary.
- `src/reduce.ts` — three new `case` blocks + `Economy` instance construction.
- `src/setup.ts` — initialise `economy` and `raisesReceived` in `createInitialGame`.
- `src/index.ts` — export `economy` and `hire` modules.

**New tests**
- `packages/core/test/economy.test.ts`
- `packages/core/test/hire.test.ts`
- Extended `packages/core/test/integration.game.test.ts`

### Dependency rule

`@jones/core` imports only `@jones/config` (unchanged). `economy.ts` and `hire.ts`
have no DOM or rendering dependencies.

---

## Economy model (§5)

### State

`GameState.economyReading: number` (M1) is replaced by:

```ts
economy: { index: number; reading: number }
```

- `index` — market trend, integer range −3…+3.
- `reading` — price level, range −30…+90.

Initialised from `config.economy.initialIndex` / `config.economy.initialReading`
(both 0 by default — neutral market at game start).

### EconomyConfig

```ts
interface EconomyConfig {
  mode: "dynamic" | "constant";
  initialIndex: number;          // 0
  initialReading: number;        // 0
  eventStartWeek: number;        // 8  — crashes/booms enabled from this week
  crashReadingThreshold: number; // 80 — reading must reach this to trigger crash check
  crashProbabilityBase: number;  // 30 — denominator constant: 1/(1+30×N)
  boomProbabilityBase: number;   // 30
}
```

`@jones/config` exports:
- `defaultEconomyConfig` — `mode: "dynamic"`, values above.
- `constantEconomyConfig` — identical but `mode: "constant"`. Import in tests.

### Economy interface

```ts
interface Economy {
  step(
    economy: { index: number; reading: number },
    week: number,
    numPlayers: number,
    config: EconomyConfig,
    rng: RngState,
    players: PlayerState[]   // for crash fire/wage-cut effects
  ): EconomyStepResult;

  adjustedPrice(base: number, reading: number): number;
}

interface EconomyStepResult {
  index: number;
  reading: number;
  events: GameEvent[];
  rng: RngState;
  playerUpdates: Array<{ playerId: string; wage?: number; fired?: boolean }>;
}
```

`advanceTurn` applies `playerUpdates` to `state.players` after calling `step`.

### DynamicEconomy

**`adjustedPrice`**: `Math.round(base + base * reading / 60)`. Effective range 50%–250%
of base at reading −30 / +90.

**`step`**:

1. **Index update** — exact random-walk algorithm sourced from the Java port's
   `EconomyManager` during implementation (§5 specifies range and effects, not the
   per-step formula). Index clamped to [−3, +3].
2. **Reading update** — trends toward `index × 15` with random jitter; clamped to
   [−30, +90]. Algorithm likewise sourced from `EconomyManager`.
3. **Crash check** (only if `week >= config.eventStartWeek &&
   newReading >= config.crashReadingThreshold`): roll `nextFloat(rng)` against
   `1 / (1 + config.crashProbabilityBase × numPlayers)`. On trigger:
   - Roll severity: equal-chance Minor / Moderate / Major (`nextInt(rng, 0, 2)`).
   - Apply effects (see table below); push `CrashOccurred { severity, week }` and
     any `Fired` / `EconomyUpdated` events. Return early (no boom check this week).
4. **Boom check** (only if no crash, `week >= config.eventStartWeek`): same
   probability formula. On trigger: push `BoomOccurred { week }`, apply
   +10% Reading bonus, +5 Happiness to current player if stocks > $1,000
   (no-op until stock system lands).
5. Always push `EconomyUpdated { index, reading }`.

**Crash effects by severity:**

| Severity | Reading drop | Fire employed | Wage cut | Bank | Happiness (turn player) |
|---|---|---|---|---|---|
| Minor | −5% of base | — | — | — | −1 (−2 more if stocks >$1 k) |
| Moderate | −10% | 50% chance each | survivors × 0.80 | — | −2 (−4 more) |
| Major | −15% | 100% | — | `p.bank = 0` (no-op now) | −3 (−8 more) |

Reading drops are applied to the new `reading` value (not re-clamped below −30).
Fired players push `Fired { playerId, jobId }` events (reusing existing event type).
Moderate-survivor wage cut rounds down to nearest integer.

### ConstantEconomy

`adjustedPrice(base, _reading)` → `base`.
`step(economy, ...)` → `{ index: 0, reading: 0, events: [], rng, playerUpdates: [] }`.
Never consumes RNG. Used whenever `config.economy.mode === "constant"`.

### Factory

```ts
function makeEconomy(config: GameConfig): Economy {
  return config.economy.mode === "dynamic"
    ? new DynamicEconomy()
    : new ConstantEconomy();
}
```

`reduce.ts` calls `makeEconomy(config)` and passes the result to `advanceTurn`.

---

## Turn sequence integration

`advanceTurn` signature gains an `economy: Economy` parameter:

```ts
export function advanceTurn(
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
  economy: Economy
): void
```

Updated sequence (additions **bold**):

1. Advance `currentPlayerIndex`; if wrapping, increment `state.week`.
2. **If week wrapped:**
   - Call `economy.step(state.economy, state.week, state.players.length, config.economy, state.rng, state.players)`.
   - Update `state.economy = { index, reading }`.
   - Update `state.rng = result.rng`.
   - Apply `result.playerUpdates` to `state.players` (fire players, cut wages).
   - Push all `result.events` into `events`.
3. Call `applyStartOfWeek` on new current player (unchanged from M1).
4. Run `hasWon` check on new current player (unchanged from M1).

`reduce.ts`'s `EndTurn` case becomes:

```ts
case "EndTurn": {
  events.push({ type: "TurnEnded", playerId: p.id });
  advanceTurn(next, config, events, makeEconomy(config));
  break;
}
```

`cloneState` in `reduce.ts` must shallow-clone `economy`:
```ts
economy: { ...state.economy },
```
(Same pattern already used for `rng`.)

---

## Hiring commands (§6)

### PlayerState additions

```ts
raisesReceived: number;  // resets to 0 on new job or quit; initialised to 0
```

### New GameEvents

```ts
| { type: "JobApplied";  playerId: string; jobId: string; wage: number }
| { type: "JobDenied";   playerId: string; jobId: string; reason: "stats" | "luck" }
| { type: "RaiseGranted"; playerId: string; newWage: number }
| { type: "RaiseDenied";  playerId: string; reason: "stats" | "no-higher-offer" }
| { type: "JobQuit";      playerId: string; jobId: string }
| { type: "EconomyUpdated"; index: number; reading: number }
| { type: "CrashOccurred";  severity: "minor" | "moderate" | "major"; week: number }
| { type: "BoomOccurred";   week: number }
```

### `ApplyForJob { jobId: string }`

Location guard and hour deduction happen before any stat/luck check (hours charged
whether approved or denied, per §6):

1. `!p.insideBuilding || p.locationId !== "employmentOffice"` → `InvalidAction "must be inside Employment Office"`
2. `actionCosts.applyJob > p.hoursRemaining` → `NotEnoughTime`
3. Deduct `actionCosts.applyJob` (4) hours.
4. Find job in `config.jobs`; unknown id → `InvalidAction "unknown job"`.
5. **Stat gates** (all must pass):
   - `p.experience >= job.reqExperience`
   - `p.dependibility >= job.reqDependibility` — suppressed if `state.week <= 4`
   - All `job.reqDegrees` present in `p.degrees`
   - If any gate fails → `JobDenied { reason: "stats" }`, `p.happiness -= 1`, break.
6. **Luck roll** (skip if `job.alwaysApproved`):
   `luck = 30 + (10 + p.dependibility + p.experience + 8 × p.degrees.length) / 3`
   Roll `nextInt(state.rng, 1, 100)`; update `state.rng`. If roll > luck →
   `JobDenied { reason: "luck" }`, `p.happiness -= 1`, break.
7. **Approval:**
   - `p.jobId = job.id`
   - `p.wage = economy.adjustedPrice(job.wage, state.economy.reading)`
   - `p.raisesReceived = 0`
   - Recalculate caps: `p.maxDependibility = 20 + job.reqDependibility + 5 × p.degrees.length` (per §4); `p.maxExperience` likewise.
   - `p.experience = Math.min(p.maxExperience, p.experience + 2)` (+2 on hire, §6).
   - `p.happiness += 3`
   - Push `JobApplied { playerId, jobId, wage: p.wage }`.

### `RequestRaise`

1. `!p.insideBuilding || p.locationId !== "employmentOffice"` → `InvalidAction`
2. `p.jobId === null` → `InvalidAction "no job"`
3. `actionCosts.applyJob > p.hoursRemaining` → `NotEnoughTime`
4. Deduct 4 hours.
5. Find job. Compute `offeredWage = economy.adjustedPrice(job.wage, state.economy.reading)`.
6. `offeredWage <= p.wage` → `RaiseDenied { reason: "no-higher-offer" }`, break.
7. `p.dependibility < job.reqDependibility + 5 × p.raisesReceived` →
   `RaiseDenied { reason: "stats" }`, `p.happiness -= 1`, break.
8. `p.wage = offeredWage`, `p.raisesReceived += 1`, `p.happiness += 3`.
   Push `RaiseGranted { playerId, newWage: p.wage }`.

### `QuitJob`

Free, no location requirement:

1. `p.jobId === null` → `InvalidAction "no job"`
2. `const quitJobId = p.jobId`; `p.jobId = null`; `p.wage = 0`;
   `p.raisesReceived = 0`; `p.happiness -= 2`
   (happiness penalty to cross-check against Java port during implementation).
3. Push `JobQuit { playerId, jobId: quitJobId }`.

---

## Testing strategy

### `economy.test.ts` (uses `defaultConfig` with fixed seeds for determinism)

- `adjustedPrice` returns base price at reading=0, ≈150% at reading=30, ≈50% at reading=−30.
- `DynamicEconomy.step` advances RNG: `state.rng` differs before and after.
- `ConstantEconomy.step` does not consume RNG: `state.rng` identical before and after; reading stays 0.
- Major Crash fires all employed players: set reading=85, week=8, seed that triggers crash, verify `Fired` events for every player with a job.
- Moderate Crash cuts survivor wages by 20%: verify `p.wage` reduced, unfired player keeps job.
- Boom emits `BoomOccurred`, does not emit `Fired`.

### `hire.test.ts` (uses `constantEconomyConfig` throughout)

- `ApplyForJob` approved: `p.jobId` set, `p.wage` equals base wage (reading=0), `p.raisesReceived=0`, `p.experience += 2`, `p.happiness += 3`, `JobApplied` event.
- `ApplyForJob` denied on stats (exp too low): hours still deducted, `p.happiness -= 1`, `JobDenied { reason: "stats" }`.
- `ApplyForJob` denied on luck (fixed seed producing failing roll): hours deducted, `p.happiness -= 1`, `JobDenied { reason: "luck" }`.
- Cook at Monolith Burgers approved regardless of luck: use seed that fails luck for other jobs, verify `JobApplied`.
- `ApplyForJob` weeks 1–4: player with dep below `reqDependibility` still approved (dep gate suppressed).
- `RequestRaise` granted: `p.wage` updated to offered wage, `p.raisesReceived` incremented, `p.happiness += 3`.
- `RequestRaise` denied (dep too low for 2nd raise): `p.happiness -= 1`, `RaiseDenied { reason: "stats" }`.
- `QuitJob`: `p.jobId` null, `p.wage = 0`, `p.raisesReceived = 0`, `p.happiness -= 2`, `JobQuit` event.

### Integration extension (`integration.game.test.ts`)

New test: solo player travels to Employment Office → enters → applies for Cook
(always approved, no luck roll) → exits → travels to Monolith Burgers → enters →
works → ends turn; verify across week boundary that `state.economy` changes
(DynamicEconomy ran), player has a job and earned cash.

---

## Open implementation notes

1. **Economy step formula** — exact Index and Reading update algorithm must be sourced
   from the Java port's `EconomyManager` class. §5 specifies ranges and effects but
   not the per-step computation. Cross-check against the original game's observable
   behaviour (slow drifts with occasional sharp moves).
2. **`QuitJob` happiness penalty** — §6 says "Only penalty is Happiness loss" for
   losing a job; the exact delta for a voluntary quit is not stated in the reference.
   Verify against the Java port during implementation. Default: −2.
3. **`reqDegrees` field** — current `JobDef` in `@jones/config` stores degree
   requirements; verify the exact field name and type match what `ApplyForJob` will
   reference (`string[]` vs `DegreeId[]`).
4. **Stat-cap recalculation formula** — §4 gives the cap formula
   `20 + reqDependibility + 5 × degrees`; verify against Java port that this is
   recalculated on every new job (not additive across jobs).
5. **`GameState.economyReading` removal** — breaking change to `GameState`; no
   consumers outside `@jones/core` yet (no UI or AI built), so safe to rename now.
6. **Boom Reading threshold** — the logic reference states "Boom (Week #8+, Reading ≤ 120)"
   but max Reading is 90, so this condition is always satisfied. Design treats Boom as
   having no Reading prerequisite (triggers purely on probability after week 8). Verify
   against Java port; if a real threshold exists, add `boomReadingThreshold` to
   `EconomyConfig`.
