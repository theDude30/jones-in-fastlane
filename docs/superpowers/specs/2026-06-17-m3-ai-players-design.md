# M3 — AI Players Design

**Status:** Approved design (brainstormed 2026-06-17)
**Milestone:** M3 — AI players
**Depends on:** `@jones/core` (game engine), `@jones/config` (tunable data)

## 1. Goal

Add AI opponents that play full games of *Jones in the Fast Lane* headlessly against
the existing `@jones/core` engine, driven through the **same `Command` interface**
humans use. Difficulty is configurable as pure data in `@jones/config`. This is the
last logic milestone before rendering/UI (M4); its deliverable is a deterministic,
fully-tested solo-vs-AI (and AI-vs-AI) game loop.

## 2. Architecture & boundaries

A new package **`@jones/ai`**:

- **Depends on** `@jones/core` and `@jones/config`.
- **Never** depends on `@jones/game`. `@jones/core` **never** depends on `@jones/ai`.
- Contains: the `Agent` abstraction, two planners (`GreedyPlanner`, `RandomPlanner`),
  a headless game runner, and helpers for reading goal progress / legal moves.

Agents act exclusively by emitting `Command`s and reading a read-only `GameState`
snapshot. Seat types — local human, local AI, future remote human, future remote/LLM
AI — are therefore interchangeable: an AI seat is just an `Agent` whose commands are
dispatched the same way a human's are.

### Package layout

```
packages/ai/
  package.json            @jones/ai (depends on @jones/core, @jones/config)
  tsconfig.json
  src/
    index.ts              public exports
    types.ts              Agent interface, AIConfig/preset types (re-exported from config)
    selectors.ts          read-only helpers over GameState (goal gaps, legal moves, feasibility)
    greedy.ts             GreedyPlanner
    random.ts             RandomPlanner
    runner.ts             playGame headless driver
  test/
    greedy.test.ts
    random.test.ts
    runner.test.ts
    integration.ai.test.ts
```

## 3. Core interface

```ts
interface Agent {
  // Returns the next command for this agent's player given a read-only snapshot.
  // Returns { type: "EndTurn" } when the agent is done for the week.
  nextCommand(state: GameState, playerId: string): Command;
}
```

- Agents are **stateful objects** that hold their own seeded `RngState`.
- An agent's RNG is seeded deterministically from `gameSeed + seatIndex` at
  construction (a small integer derivation, e.g. `seed * 1000 + seatIndex`, using the
  same `RngState` shape and `nextFloat`/`nextInt` helpers as `@jones/core`).
- `nextCommand` advances **only the agent's own RNG**. It never touches the game's RNG
  (which lives in `GameState`). This keeps `@jones/core` RNG pure and makes replay
  deterministic from the game seed + seat lineup alone.
- `nextCommand` treats `state` as read-only — it never mutates it. All state changes
  flow through `reduce`.

A factory builds the right agent for a seat from config:

```ts
function makeAgent(preset: AIDifficultyPreset, gameSeed: number, seatIndex: number): Agent;
```

## 4. Components

### 4.1 Goal selectors (`selectors.ts`)

Pure, read-only helpers shared by the planners. They reuse `goalScores(p)` exported
from `@jones/core/goals` — the planner never re-derives goal math.

- `weakestGoal(p, weights): keyof GoalTargets | null` — for each of the four goals
  compute `progress = score / target` (a fully-met goal yields `Infinity` / is
  excluded); apply the per-goal `weights` multiplier to bias selection; return the
  goal with the **lowest weighted progress and a remaining gap > 0**, or `null` when
  all goals are already met (the player has effectively won).
- `legalCommands(state, playerId, config): Command[]` — enumerate the commands that
  `reduce` would currently accept for this player (used by `RandomPlanner` and the
  greedy mistake path). Built from current location, `insideBuilding`, hours, cash,
  job state, and config tables. This is a *best-effort legal set*; correctness is
  still ultimately enforced by `reduce`.
- Small feasibility predicates: `canAfford(p, cost)`, `hasHours(p, cost)`,
  `atLocation(p, locId)`, `isInside(p)`.

Goal score reference (from `@jones/core/goals`, do not duplicate the formulas — call
`goalScores`):
- `wealth = floor((cash + bank) / 100)`
- `happiness = happiness`
- `education = 1 + 9 * degrees.length`
- `career = jobId === null ? 0 : floor(1.25 * dependibility)`

### 4.2 `GreedyPlanner` (`greedy.ts`)

Each call to `nextCommand`:

1. With probability **epsilon**, take a random legal action (the "mistake"): draw from
   `legalCommands` using the agent's RNG and return it. (epsilon defaults to 0 for the
   hardest preset.)
2. Otherwise, compute `weakestGoal`. If `null` (all goals met) → return `EndTurn`.
3. Map the weakest goal to an **activity** (see table) and emit the next concrete
   command that advances it — navigating first (`TravelTo` → `EnterBuilding`) when not
   already at the activity's location/inside, then performing the action.
4. If the chosen activity is infeasible this step (insufficient hours/cash, missing
   prereq, no job to work) → try the next-weakest goal; if none is actionable → return
   `EndTurn`.

**Activity map:**

| Weakest goal | Activity (in priority order) |
|---|---|
| wealth | If employed and at/can reach workplace with hours → `Work`. Else if unemployed → pursue a job (see career). Banking (`Deposit`) is neutral to wealth score so it is not used to chase wealth. |
| career | If unemployed → `TravelTo` a workplace whose requirements are met → `EnterBuilding` → `ApplyForJob`. If employed → `Work` (raises dependibility, which drives career) and, when eligible, `RequestRaise`. |
| education | If not enrolled in an in-progress degree whose prereqs are met → go to university → `Enroll`. If enrolled → go to university → `Study` toward graduation. |
| happiness | Buy the most cost-effective affordable happiness-raising item (ticket/durable/food per config), navigating to the seller first. |

`Work` advances both wealth and career, so a greedy agent naturally favors employment
and working — no special-casing required.

### 4.3 `RandomPlanner` (`random.ts`)

`nextCommand` draws uniformly (via the agent's RNG) from `legalCommands(state,
playerId, config)`, which always includes `EndTurn`. The "easy" baseline. It never
emits an obviously-illegal command, so it won't spam `InvalidAction`.

### 4.4 Headless runner (`runner.ts`)

```ts
interface Seat {
  playerId: string;
  agent: Agent | null;   // null = human/externally-driven seat, skipped by the runner
}

interface RunResult {
  state: GameState;
  events: GameEvent[];
  weeks: number;
  winnerId: string | null;
}

function playGame(
  config: GameConfig,
  initial: GameState,
  seats: Seat[],
  opts?: { maxWeeks?: number; maxCommandsPerTurn?: number },
): RunResult;
```

Loop:

1. Identify the current player (`state.currentPlayerIndex`) and its seat.
2. If the seat has no agent (human) → stop and return (externally driven); for fully
   headless AI games every seat has an agent.
3. Otherwise repeatedly: `cmd = agent.nextCommand(state, playerId)` →
   `({state, events} = reduce(state, cmd, config))` → accumulate events. Stop the
   inner loop when the agent returns `EndTurn` **or** the per-turn command count
   reaches `maxCommandsPerTurn` (default e.g. 200), in which case force one final
   `EndTurn` through `reduce`. This guards against an agent that never terminates its
   turn or loops on `InvalidAction`.
4. Continue until `state.status === "ended"` or `state.week` reaches `maxWeeks`
   (default e.g. 520 — a generous cap guaranteeing termination).
5. Return the final state, accumulated events, week count, and winner (first id in
   `state.winners`, else `null`).

## 5. Difficulty config (`@jones/config`)

A new `aiDifficulty` table of presets, pure data:

```ts
interface AIDifficultyPreset {
  planner: "greedy" | "random";
  weights: GoalTargets;   // per-goal multipliers biasing which "weakest" goal to chase
  epsilon: number;        // 0..1 mistake rate (greedy only; ignored by random)
}
```

Presets:

| Preset | planner | weights | epsilon |
|---|---|---|---|
| easy | random | `{1,1,1,1}` | n/a |
| medium | greedy | `{1,1,1,1}` | 0.15 |
| hard | greedy | tuned (e.g. slightly favor the cheapest-to-progress goals) | 0 |

Adding a new algorithm = a new planner module in `@jones/ai` + a new preset in
`@jones/config`. **No `@jones/core` change** is required for new difficulty or new
strategies.

## 6. Data flow & determinism

- `playGame` owns the loop; `reduce` owns all state truth. Agents only read snapshots
  and emit commands.
- Determinism: the same `(config, initial state incl. seed, seat lineup)` produces an
  identical game, because (a) the core RNG is seeded inside `GameState` and advanced
  only by `reduce`, and (b) each agent's RNG is seeded from `gameSeed + seatIndex`.
  Replaying from those inputs is reproducible.

## 7. Error handling / safety

- The greedy planner proposes only feasibility-checked commands, so `InvalidAction`
  from `reduce` should be rare. If one occurs, it still counts toward
  `maxCommandsPerTurn`, and at the cap the runner forces `EndTurn` — no infinite loops.
- The random planner draws from a legal-move set, so it won't generate a storm of
  invalid actions.
- The `maxWeeks` cap guarantees `playGame` terminates even if no agent ever wins.

## 8. Testing strategy

- **Unit (`greedy.test.ts`):** `weakestGoal` selection including weights and the
  all-goals-met → `null` case; each activity mapping emits the correct navigate→act
  sequence from representative states; feasibility gating (no cash → no purchase, no
  hours → `EndTurn`, missing prereq → skip activity); epsilon mistakes are
  deterministic under a fixed agent seed (epsilon 0 ⇒ never random; epsilon 1 ⇒ always
  random).
- **Unit (`random.test.ts`):** every command `RandomPlanner` emits is in
  `legalCommands`; over many draws it produces a spread including `EndTurn`;
  deterministic under a fixed seed.
- **Runner (`runner.test.ts`):** a deliberately stalling agent (never returns
  `EndTurn`) is force-ended at `maxCommandsPerTurn`; a null (human) seat stops the
  runner; `maxWeeks` cap terminates a never-winning game.
- **Integration (`integration.ai.test.ts`) — the headline tests:** a full seeded
  headless game of greedy agents (a) never throws, (b) produces no storm of
  `InvalidAction` events (assert the count stays under a small threshold), (c)
  terminates (winner or week cap), and (d) is **deterministic** — running the same
  seed twice yields identical final `GameState` and winner. Additionally, over a fixed
  number of weeks a greedy agent measurably out-progresses a random agent (sum of
  weighted goal progress).

## 9. Scope boundaries (YAGNI)

**In scope:** the `Agent` interface, `GreedyPlanner`, `RandomPlanner`, difficulty
presets in config, the headless `playGame` runner, and the test suite above.

**Out of scope (deferred):**
- Search / ordered / lookahead planners.
- The original Java weekly-"plan" abstraction (`StudyAllWeekPlan`, etc.).
- LLM / remote external agents (the `Agent` interface accommodates them later with no
  core change).
- Any UI / rendering wiring (M4).
- Resource handicaps or starting-bonus difficulty knobs (would bend game fairness).

## 10. Mapping to the build

- **`@jones/ai`** (new): `Agent`, planners, selectors, runner.
- **`@jones/config`**: `aiDifficulty` presets table + `AIDifficultyPreset` type.
- **`@jones/core`**: **unchanged**. `goalScores`, `hasWon`, `reduce`, `RngState`,
  `nextFloat`, and `nextInt` are already exported from the package entry (`index.ts`
  re-exports `goals.js` and `rng.js`), so `@jones/ai` consumes them directly with no
  core edits.
