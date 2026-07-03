# Guaranteed Termination Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Guarantee every game terminates with exactly one winner by adding a configurable max-week cap to `@jones/core`; when the cap is reached with no goals-based winner, the player with the highest average goal-completion percentage wins.

**Architecture:** A new `maxWeeks` config constant; two pure helper functions in `goals.ts` (`goalCompletion`, `leadingPlayer`); a once-per-week cap check inside `advanceTurn` that ends the game and picks the leader on points; a new `GameEndedByTime` event. The existing per-turn `hasWon` victory path is untouched and still ends the game first on a legitimate win.

**Tech Stack:** TypeScript monorepo, Vitest. Packages: `@jones/config` (typed data), `@jones/core` (pure game logic). Run tests with `npm test` (or `npx vitest run <path>` for a single file).

## Global Constraints

- `maxWeeks` default value is **156**; `maxWeeks <= 0` disables the cap (pure play-to-victory).
- Winner-at-cap metric: average of the four per-goal ratios `min(score/target, 1)`, each capped above at 1 but **not** floored at 0.
- Tiebreak: strict-greater comparison iterating in seat (array) order, so exact ties resolve to the earliest seat. No RNG consumed anywhere in this feature.
- The cap check lives only in `advanceTurn`'s `wasLast` block, after `week += 1` and the economy step, before the `applyStartOfWeek`/`hasWon` block.
- Follow the existing core test convention: real `createInitialGame` fixtures, real `reduce()`, no mocking.

---

### Task 1: Add the `maxWeeks` config constant

**Files:**
- Modify: `packages/config/src/types.ts` (add field to `GameConstants` interface, after `doctorHoursLost`)
- Modify: `packages/config/src/constants.ts` (add value to the `constants` object, after `doctorHoursLost`)

**Interfaces:**
- Produces: `config.constants.maxWeeks: number` — consumed by Task 3's cap check.

- [ ] **Step 1: Add the field to the `GameConstants` interface**

In `packages/config/src/types.ts`, the `GameConstants` interface currently ends with `doctorHoursLost: number;`. Add a new line immediately after it (before the closing `}`):

```typescript
  maxWeeks: number;                // 156 §3 — timed-game cap; game ends by time once week > maxWeeks. <= 0 disables the cap.
```

- [ ] **Step 2: Add the value to the `constants` object**

In `packages/config/src/constants.ts`, the object currently ends with `doctorHoursLost: 10,`. Add a new line immediately after it (before the closing `};`):

```typescript
  maxWeeks: 156,
```

- [ ] **Step 3: Verify config typechecks and the whole suite still passes**

Run: `npm test`
Expected: PASS — no test references `maxWeeks` yet, and adding a required field with a value keeps `constants` assignable to `GameConstants`. (If TypeScript reports `constants` is missing a property, the field/value pair is mismatched — recheck Steps 1–2.)

- [ ] **Step 4: Commit**

```bash
git add packages/config/src/types.ts packages/config/src/constants.ts
git commit -m "feat(config): add maxWeeks timed-game cap constant"
```

---

### Task 2: Add `goalCompletion` and `leadingPlayer` helpers

**Files:**
- Modify: `packages/core/src/goals.ts` (append two exported functions)
- Test: `packages/core/test/goals.test.ts` (append new `describe` blocks)

**Interfaces:**
- Consumes: existing `goalScores(p: PlayerState): GoalTargets` and `PlayerState` (with `.goals: GoalTargets`) — both already in this file / `./types.js`.
- Produces:
  - `goalCompletion(p: PlayerState): number` — average of the four `min(score/target, 1)` ratios; each ratio capped above at 1, not floored below.
  - `leadingPlayer(players: PlayerState[]): PlayerState` — the player with strictly-greatest `goalCompletion`, ties to earliest seat. Both consumed by Task 3.

- [ ] **Step 1: Write the failing tests**

Append to `packages/core/test/goals.test.ts`. First add the imports — change the existing import line
`import { goalScores, hasWon } from "../src/goals.js";`
to:

```typescript
import { goalScores, hasWon, goalCompletion, leadingPlayer } from "../src/goals.js";
```

Then append these `describe` blocks at the end of the file:

```typescript
describe("goalCompletion", () => {
  it("is 1.0 when every goal is met exactly", () => {
    const p = player(); // targets all 10
    p.cash = 1000;        // wealth 10
    p.happiness = 10;
    p.degrees = ["juniorCollege"]; // education 10
    p.jobId = "zMart.clerk"; p.dependibility = 8; // career 10
    expect(goalCompletion(p)).toBeCloseTo(1.0, 5);
  });

  it("caps each goal at 1.0 so overshoot gives no extra credit", () => {
    const p = player(); // targets all 10
    p.cash = 100000;      // wealth 1000 — massively over
    p.happiness = 10;
    p.degrees = ["juniorCollege"];
    p.jobId = "zMart.clerk"; p.dependibility = 8;
    // wealth capped at 1, others exactly 1 -> average 1.0, not >1
    expect(goalCompletion(p)).toBeCloseTo(1.0, 5);
  });

  it("averages partial progress: two goals at 100%, two at 0% -> 0.5", () => {
    const p = player(); // targets all 10
    p.cash = 1000;        // wealth 10 -> ratio 1
    p.degrees = ["juniorCollege"]; // education 10 -> ratio 1
    p.happiness = 0;      // ratio 0
    p.jobId = null; p.dependibility = 0; // career score 0 -> ratio 0
    expect(goalCompletion(p)).toBeCloseTo(0.5, 5);
  });

  it("lets a negative goal term drag the average below a zero-happiness peer (not floored at 0)", () => {
    const base = player();
    base.cash = 1000; base.degrees = ["juniorCollege"];
    base.jobId = "zMart.clerk"; base.dependibility = 8; // wealth+edu+career all met
    const zero = { ...base, happiness: 0 };
    const negative = { ...base, happiness: -200 };
    expect(goalCompletion(negative)).toBeLessThan(goalCompletion(zero));
  });
});

describe("leadingPlayer", () => {
  it("returns the strictly-highest-completion player", () => {
    const low = player();  low.id = "p0"; low.happiness = 0;
    const high = player(); high.id = "p1"; high.happiness = 10;
    // give both the same other goals so happiness decides it
    for (const q of [low, high]) { q.cash = 1000; q.degrees = ["juniorCollege"]; q.jobId = "zMart.clerk"; q.dependibility = 8; }
    expect(leadingPlayer([low, high]).id).toBe("p1");
    expect(leadingPlayer([high, low]).id).toBe("p1");
  });

  it("breaks an exact tie in favor of the earlier seat", () => {
    const a = player(); a.id = "p0";
    const b = player(); b.id = "p1";
    for (const q of [a, b]) { q.cash = 1000; q.happiness = 10; q.degrees = ["juniorCollege"]; q.jobId = "zMart.clerk"; q.dependibility = 8; }
    // identical completion -> earliest seat wins
    expect(leadingPlayer([a, b]).id).toBe("p0");
    expect(leadingPlayer([b, a]).id).toBe("p1");
  });
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/goals.test.ts`
Expected: FAIL — `goalCompletion is not a function` / `leadingPlayer is not a function` (imports unresolved).

- [ ] **Step 3: Implement the two helpers**

Append to `packages/core/src/goals.ts` (after `hasWon`):

```typescript
// §3 timed-game ranking. Average of the four per-goal completion ratios,
// each capped ABOVE at 1 (overshooting one goal cannot offset missing
// another) but NOT floored below 0 (a deeply negative goal, e.g. large
// negative happiness, must rank below a zero one). Used only to pick a
// winner when the game ends by the maxWeeks cap.
export function goalCompletion(p: PlayerState): number {
  const s = goalScores(p);
  const g = p.goals;
  const ratio = (score: number, target: number) => Math.min(score / target, 1);
  return (
    ratio(s.wealth, g.wealth) +
    ratio(s.happiness, g.happiness) +
    ratio(s.education, g.education) +
    ratio(s.career, g.career)
  ) / 4;
}

// The player with the greatest goalCompletion. Iterates in seat (array)
// order and replaces the leader only on a STRICTLY greater score, so an
// exact tie resolves to the earlier seat — fully deterministic, no RNG.
// Assumes a non-empty players array (always true for a real game).
export function leadingPlayer(players: PlayerState[]): PlayerState {
  let leader = players[0];
  let best = goalCompletion(leader);
  for (let i = 1; i < players.length; i++) {
    const c = goalCompletion(players[i]);
    if (c > best) {
      best = c;
      leader = players[i];
    }
  }
  return leader;
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/goals.test.ts`
Expected: PASS — all existing `goalScores`/`hasWon` tests plus the four new `goalCompletion`/`leadingPlayer` tests.

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/goals.ts packages/core/test/goals.test.ts
git commit -m "feat(core): add goalCompletion and leadingPlayer helpers"
```

---

### Task 3: Add the `GameEndedByTime` event and the cap check in `advanceTurn`

**Files:**
- Modify: `packages/core/src/types.ts` (add one variant to the `GameEvent` union)
- Modify: `packages/core/src/turn.ts` (import helpers; add cap check in `advanceTurn`)
- Test: `packages/core/test/turn.test.ts` (append new `describe` block)

**Interfaces:**
- Consumes: `leadingPlayer(players)` from Task 2; `config.constants.maxWeeks` from Task 1.
- Produces: `GameEndedByTime` event `{ type: "GameEndedByTime"; week: number; winnerId: string }`; the guarantee that `advanceTurn` ends the game once `week > maxWeeks`.

- [ ] **Step 1: Add the event variant**

In `packages/core/src/types.ts`, the `GameEvent` union currently ends with:
```typescript
  | { type: "DonationReceived"; playerId: string; amount: number };
```
Change that line to add the new variant (keep the trailing `;` on the final line):
```typescript
  | { type: "DonationReceived"; playerId: string; amount: number }
  | { type: "GameEndedByTime"; week: number; winnerId: string };
```

- [ ] **Step 2: Write the failing tests**

Append to `packages/core/test/turn.test.ts`. First extend the imports — change
`import { createInitialGame } from "../src/setup.js";`
to also pull the config helper by adding this alongside the existing imports at the top of the file:

```typescript
import { constants } from "@jones/config";
```

Then append this `describe` block at the end of the file:

```typescript
describe("maxWeeks timed-game cap", () => {
  // A config whose cap is small, so we can drive a game to it quickly.
  const cappedConfig = { ...defaultConfig, constants: { ...constants, maxWeeks: 3 } };

  function cappedTwoPlayerGame() {
    return createInitialGame(cappedConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
      { name: "B", isAI: true, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
  }

  it("ends the game on points once week exceeds maxWeeks, with exactly one winner", () => {
    let g = cappedTwoPlayerGame();
    // Make player A clearly ahead on goal completion (higher happiness), but
    // NOT a full winner, so the cap — not hasWon — decides it.
    g.players[0].happiness = 8;  // ahead
    g.players[1].happiness = 1;  // behind
    // Advance turns until the week ticks past the cap (maxWeeks = 3 -> ends when week becomes 4).
    let events: import("../src/types.js").GameEvent[] = [];
    for (let i = 0; i < 8 && g.status === "playing"; i++) {
      const r = reduce(g, { type: "EndTurn" }, cappedConfig);
      g = r.state;
      events = r.events;
    }
    expect(g.status).toBe("ended");
    expect(g.week).toBe(4);
    expect(g.winners).toHaveLength(1);
    expect(g.winners[0]).toBe("p0");
    expect(events.some((e) => e.type === "GameEndedByTime" && e.winnerId === "p0" && e.week === 4)).toBe(true);
  });

  it("lets a legitimate all-goals victory end the game before the cap fires", () => {
    let g = cappedTwoPlayerGame();
    g.players[0].cash = 1000;                 // wealth 10
    g.players[0].happiness = 50;
    g.players[0].degrees = ["juniorCollege"]; // education 10
    g.players[0].jobId = "zMart.clerk"; g.players[0].dependibility = 80; // career
    g = reduce(g, { type: "EndTurn" }, cappedConfig).state;             // -> B
    const { state, events } = reduce(g, { type: "EndTurn" }, cappedConfig); // wrap -> A, win check at week 2
    expect(events.some((e) => e.type === "PlayerWon")).toBe(true);
    expect(events.some((e) => e.type === "GameEndedByTime")).toBe(false);
    expect(state.week).toBe(2);
    expect(state.winners).toContain("p0");
  });

  it("maxWeeks <= 0 disables the cap (stays playing past 156 weeks with no winner)", () => {
    const noCapConfig = { ...defaultConfig, constants: { ...constants, maxWeeks: 0 } };
    let g = createInitialGame(noCapConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    // Single seat: every EndTurn wraps and advances a week. Run well past 156.
    for (let i = 0; i < 170 && g.status === "playing"; i++) {
      g = reduce(g, { type: "EndTurn" }, noCapConfig).state;
    }
    expect(g.status).toBe("playing");
    expect(g.week).toBeGreaterThan(156);
  });
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run packages/core/test/turn.test.ts`
Expected: FAIL — the first test fails because the game never ends (no cap logic yet): `g.status` stays `"playing"` and no `GameEndedByTime` is emitted.

- [ ] **Step 4: Implement the cap check**

In `packages/core/src/turn.ts`, extend the existing import from `./goals.js`. Change:
```typescript
import { hasWon } from "./goals.js";
```
to:
```typescript
import { hasWon, leadingPlayer } from "./goals.js";
```

Then, inside `advanceTurn`, locate the `if (wasLast) { ... }` block. It ends with `events.push(...result.events);` followed by a closing `}`. Immediately **after** that closing `}` of the `wasLast` block (and before the `const upNext = state.players[state.currentPlayerIndex];` line), insert:

```typescript
  // Timed-game cap (§3): once the week ticks past maxWeeks with no
  // goals-based winner yet, end the game and award it on points to the
  // player with the highest average goal completion. Deterministic
  // (seat-order tiebreak, no RNG). Disabled when maxWeeks <= 0.
  if (config.constants.maxWeeks > 0 && state.week > config.constants.maxWeeks) {
    const winner = leadingPlayer(state.players);
    state.winners.push(winner.id);
    state.status = "ended";
    events.push({ type: "GameEndedByTime", week: state.week, winnerId: winner.id });
    return;
  }
```

Note: `state.week` is only mutated inside the `wasLast` block, so placing this check just after that block means it runs at most once per week, on the exact turn the week rolls over. The `return` skips the normal `applyStartOfWeek`/`hasWon`/due-date path for the now-ended game.

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run packages/core/test/turn.test.ts`
Expected: PASS — all three new tests plus the existing `EndTurn` tests.

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/turn.ts packages/core/test/turn.test.ts
git commit -m "feat(core): end the game on points once week exceeds maxWeeks"
```

---

### Task 4: Integration test — a headless game always terminates with one winner

**Files:**
- Test: `packages/ai/test/integration.ai.test.ts` (append one test to the existing `describe("AI full-game integration", ...)` block)

**Interfaces:**
- Consumes: `createInitialGame`, `playGame`, `makeAgent` (all already imported in this file); the Task 3 cap guarantee. The runner's `maxWeeks` option (its own external stop) must stay ≥ the core cap so the core cap fires first.

- [ ] **Step 1: Write the test**

Append this `it(...)` inside the existing `describe("AI full-game integration", () => { ... })` block in `packages/ai/test/integration.ai.test.ts` (before the block's closing `});`):

```typescript
  it("always terminates with exactly one winner under a small core cap (multiple seeds)", () => {
    // Override the core cap low so games end quickly; give the runner a
    // larger maxWeeks so the CORE cap is what terminates, not the runner.
    const capped = { ...config, constants: { ...config.constants, maxWeeks: 10 } };
    for (const seed of [1, 2, 3, 42, 99]) {
      const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, capped, seed, 0) };
      const result = playGame(capped, createInitialGame(capped, seed, [
        { name: "AI", isAI: true, goals: { wealth: 30, happiness: 30, education: 19, career: 30 } },
      ]), [seat], { maxWeeks: 100 });
      expect(result.state.status).toBe("ended");
      expect(result.state.winners).toHaveLength(1);
      expect(result.state.week).toBeLessThanOrEqual(11); // cap 10 -> ends when week becomes 11
    }
  });
```

- [ ] **Step 2: Run the test to verify it passes**

Run: `npx vitest run packages/ai/test/integration.ai.test.ts`
Expected: PASS — every seed ends with `status: "ended"` and exactly one winner by week 11. (This test would have failed before Task 3, since games ran forever with no winner.)

- [ ] **Step 3: Run the full suite to confirm nothing regressed**

Run: `npm test`
Expected: PASS — all packages green, including the pre-existing `terminates (winner or week cap)` and determinism tests (the default `maxWeeks: 156` does not affect those, which run under 300-week runner caps and either win earlier or now end by the core cap at 156 within their runner limit).

- [ ] **Step 4: Commit**

```bash
git add packages/ai/test/integration.ai.test.ts
git commit -m "test(ai): headless games always terminate with one winner under the cap"
```

---

## Self-Review

**1. Spec coverage:**
- New `maxWeeks` constant (spec §Architecture "New config constant") → Task 1. ✓
- `goalCompletion` + `leadingPlayer` helpers (spec "Two pure helpers") → Task 2. ✓
- Cap check in `advanceTurn`, placed after `week += 1`/economy step, before start-of-week block, with `return` (spec "Cap check") → Task 3 Step 4. ✓
- `GameEndedByTime` event (spec "New event") → Task 3 Step 1. ✓
- Runner interaction note (runner cap ≥ core cap) → Task 4 Interfaces + test design. ✓
- Testing strategy bullets (goalCompletion math incl. cap + negative ordering; leadingPlayer argmax + tiebreak; cap ends with one winner + GameEndedByTime; legitimate win still wins first; maxWeeks<=0 disables; headless small-cap termination) → Tasks 2–4. ✓
- `maxWeeks <= 0` disables the cap (spec Goal 4) → Task 3 Step 2 third test + Step 4 guard. ✓

**2. Placeholder scan:** No TBD/TODO/"handle edge cases"/"similar to Task N". Every code step shows complete code and exact run commands with expected output. ✓

**3. Type consistency:** `goalCompletion(p: PlayerState): number` and `leadingPlayer(players: PlayerState[]): PlayerState` are defined in Task 2 and consumed with those exact signatures in Task 3. The event shape `{ type: "GameEndedByTime"; week: number; winnerId: string }` is identical in the type union (Task 3 Step 1), the emit site (Task 3 Step 4), and the test assertions (Task 3 Step 2). `config.constants.maxWeeks` naming is consistent across Tasks 1, 3, 4. ✓
