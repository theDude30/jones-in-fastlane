# M3a — Education Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the Education subsystem — `Enroll` and `Study` commands, automatic graduation, 11 degrees with prereq chain, and `extraCredit` placeholder on `PlayerState`.

**Architecture:** Config gains `DegreeDef[]` and education constants. Core gains `enrollments` and `extraCredit` on `PlayerState`, two new commands, and `education.ts` with pure `enroll`/`study` functions following the same pattern as `hire.ts`. Graduation fires automatically when `lessonsRemaining` reaches 0.

**Tech Stack:** TypeScript strict, pnpm workspaces (`@jones/config`, `@jones/core`), Vitest, `constantEconomyConfig` for deterministic tests.

**Design spec:** `docs/superpowers/specs/2026-06-16-m3a-education-design.md`

---

## File Structure

**`@jones/config`** — data/types only:
- `packages/config/src/types.ts` — add `DegreeDef`, add `degrees: DegreeDef[]` to `GameConfig`, add education fields to `GameConstants`
- `packages/config/src/degrees.ts` *(new)* — all 11 `DegreeDef` entries
- `packages/config/src/constants.ts` — add 6 education constants
- `packages/config/src/defaultConfig.ts` — add `degrees`
- `packages/config/src/index.ts` — export `degrees` and `DegreeDef`

**`@jones/core`** — types, logic, tests:
- `packages/core/src/types.ts` — add `enrollments`, `extraCredit` to `PlayerState`; add `Enroll`, `Study` to `Command`; add `Enrolled`, `Studied`, `Graduated`, `NotEnoughMoney` to `GameEvent`
- `packages/core/src/setup.ts` — init `enrollments: []`, `extraCredit: 0`
- `packages/core/src/reduce.ts` — deep-copy `enrollments` in `cloneState`; add `Enroll`/`Study` cases; import from `education.ts`
- `packages/core/src/education.ts` *(new)* — `enroll`, `study` functions
- `packages/core/src/index.ts` — `export * from "./education.js"`
- `packages/core/test/education.test.ts` *(new)* — all tests

---

## Task 1: Config — DegreeDef, degrees array, education constants

**Files:**
- Modify: `packages/config/src/types.ts`
- Create: `packages/config/src/degrees.ts`
- Modify: `packages/config/src/constants.ts`
- Modify: `packages/config/src/defaultConfig.ts`
- Modify: `packages/config/src/index.ts`

No new test file — pure data/types. Run `pnpm typecheck` to verify.

- [ ] **Step 1: Add `DegreeDef`, update `GameConfig` and `GameConstants` in `packages/config/src/types.ts`**

  Add `DegreeDef` after the `EconomyConfig` interface. Add `degrees` field to `GameConfig`. Add six education constants to `GameConstants`.

  After `EconomyConfig`, insert:
  ```ts
  export interface DegreeDef {
    id: DegreeId;
    name: string;
    prereqs: DegreeId[];
  }
  ```

  In `GameConfig`, add after `economy: EconomyConfig;`:
  ```ts
  degrees: DegreeDef[];
  ```

  In `GameConstants`, add after `dependibilityDecayPerWeek: number;`:
  ```ts
  enrollmentBaseFee: number;          // 50  §7
  lessonsPerDegree: number;           // 10  §7
  minLessonsPerDegree: number;        // 8   §7
  graduateDependibilityBonus: number; // 5   §4
  graduateMaxCapBonus: number;        // 5   §4
  maxEnrollments: number;             // 4   §7
  ```

- [ ] **Step 2: Create `packages/config/src/degrees.ts`**

  ```ts
  import type { DegreeDef } from "./types.js";

  export const degrees: DegreeDef[] = [
    { id: "juniorCollege",  name: "Junior College",            prereqs: [] },
    { id: "tradeSchool",    name: "Trade School",              prereqs: [] },
    { id: "businessAdmin",  name: "Business Administration",   prereqs: ["juniorCollege"] },
    { id: "academic",       name: "Academic",                  prereqs: ["juniorCollege"] },
    { id: "electronics",    name: "Electronics",               prereqs: ["tradeSchool"] },
    { id: "preEngineering", name: "Pre-Engineering",           prereqs: ["tradeSchool"] },
    { id: "engineering",    name: "Engineering",               prereqs: ["preEngineering"] },
    { id: "graduateSchool", name: "Graduate School",           prereqs: ["academic"] },
    { id: "postDoctoral",   name: "Post-Doctoral",             prereqs: ["graduateSchool"] },
    { id: "research",       name: "Research",                  prereqs: ["postDoctoral"] },
    { id: "publishing",     name: "Publishing",                prereqs: ["research"] },
  ];
  ```

- [ ] **Step 3: Update `packages/config/src/constants.ts`**

  Add the six new education fields at the end of the `constants` object:
  ```ts
  enrollmentBaseFee: 50,
  lessonsPerDegree: 10,
  minLessonsPerDegree: 8,
  graduateDependibilityBonus: 5,
  graduateMaxCapBonus: 5,
  maxEnrollments: 4,
  ```

- [ ] **Step 4: Update `packages/config/src/defaultConfig.ts`**

  Add the import and field:
  ```ts
  import { degrees } from "./degrees.js";
  ```
  And in the `defaultConfig` object, add `degrees` after `jobs`:
  ```ts
  degrees,
  ```

- [ ] **Step 5: Update `packages/config/src/index.ts`**

  Add two exports after the `jobs` export line:
  ```ts
  export { degrees } from "./degrees.js";
  export type { DegreeDef } from "./types.js";
  ```

  Note: `DegreeDef` is already re-exported via `export * from "./types.js"`, so the explicit `export type` line is not needed — just add `export { degrees } from "./degrees.js"`.

- [ ] **Step 6: Typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/config/src/types.ts packages/config/src/degrees.ts packages/config/src/constants.ts packages/config/src/defaultConfig.ts packages/config/src/index.ts
  git commit -m "feat(config): add DegreeDef, 11 degrees, and education constants"
  ```

---

## Task 2: Core types — PlayerState, Command, GameEvent, setup, cloneState

**Files:**
- Modify: `packages/core/src/types.ts`
- Modify: `packages/core/src/setup.ts`
- Modify: `packages/core/src/reduce.ts`

No new test file. Run `pnpm typecheck` and `pnpm test` to verify no regressions.

- [ ] **Step 1: Update `packages/core/src/types.ts`**

  The file already imports `DegreeId` from `@jones/config`. Add `DegreeDef` to that import:
  ```ts
  import type { DegreeId, DegreeDef, UniformLevel } from "@jones/config";
  ```

  Actually `DegreeDef` is not needed in types.ts — `enrollments` only uses `DegreeId`. The import stays as-is. Just add the new fields.

  In `PlayerState`, add after `degrees: DegreeId[];`:
  ```ts
  enrollments: Array<{ degreeId: DegreeId; lessonsRemaining: number }>;
  extraCredit: number;
  ```

  In the `Command` union, add after `| { type: "QuitJob" }`:
  ```ts
  | { type: "Enroll"; degreeId: DegreeId }
  | { type: "Study"; degreeId: DegreeId };
  ```

  In the `GameEvent` union, add after `| { type: "BoomOccurred"; week: number }`:
  ```ts
  | { type: "Enrolled"; playerId: string; degreeId: DegreeId; fee: number; lessonsRemaining: number }
  | { type: "Studied"; playerId: string; degreeId: DegreeId; lessonsRemaining: number }
  | { type: "Graduated"; playerId: string; degreeId: DegreeId }
  | { type: "NotEnoughMoney"; playerId: string; action: string };
  ```

- [ ] **Step 2: Update `packages/core/src/setup.ts`**

  In `createInitialGame`, in the player initializer object, add after `degrees: [],`:
  ```ts
  enrollments: [],
  extraCredit: 0,
  ```

- [ ] **Step 3: Update `cloneState` in `packages/core/src/reduce.ts`**

  The current player spread is:
  ```ts
  players: state.players.map((p) => ({ ...p, clothing: { ...p.clothing }, degrees: [...p.degrees], goals: { ...p.goals } })),
  ```

  Update it to also deep-copy `enrollments`:
  ```ts
  players: state.players.map((p) => ({
    ...p,
    clothing: { ...p.clothing },
    degrees: [...p.degrees],
    enrollments: p.enrollments.map((e) => ({ ...e })),
    goals: { ...p.goals },
  })),
  ```

- [ ] **Step 4: Typecheck and run tests**

  ```bash
  pnpm typecheck && pnpm test
  ```

  Expected: typecheck clean, all existing tests still passing.

- [ ] **Step 5: Commit**

  ```bash
  git add packages/core/src/types.ts packages/core/src/setup.ts packages/core/src/reduce.ts
  git commit -m "feat(core): add enrollments/extraCredit to PlayerState; Enroll/Study commands and events"
  ```

---

## Task 3: Education module — TDD

**Files:**
- Create: `packages/core/test/education.test.ts`
- Create: `packages/core/src/education.ts`

- [ ] **Step 1: Write `packages/core/test/education.test.ts`**

  ```ts
  import { describe, it, expect } from "vitest";
  import { defaultConfig, constantEconomyConfig } from "@jones/config";
  import { createInitialGame } from "../src/setup.js";
  import { reduce } from "../src/reduce.js";
  import type { GameState } from "../src/types.js";

  const testConfig = { ...defaultConfig, economy: constantEconomyConfig };
  // constantEconomy: adjustedPrice(base, reading=0) = base, so enrollment fee = 50 exactly.

  /** Player inside Hi-Tech U with enough cash. */
  function eduGame(): GameState {
    const g = createInitialGame(testConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
    g.players[0].locationId = "hiTechU";
    g.players[0].insideBuilding = true;
    g.players[0].cash = 500;
    return g;
  }

  /** Player inside Hi-Tech U with one active enrollment. */
  function enrolledGame(lessonsRemaining = 10): GameState {
    const g = eduGame();
    g.players[0].enrollments = [{ degreeId: "juniorCollege", lessonsRemaining }];
    return g;
  }

  describe("Enroll", () => {
    it("approved: fee deducted, enrollment added, lessonsRemaining=10, no hours cost", () => {
      const { state, events } = reduce(eduGame(), { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      const p = state.players[0];
      expect(p.cash).toBe(450);
      expect(p.enrollments).toHaveLength(1);
      expect(p.enrollments[0].degreeId).toBe("juniorCollege");
      expect(p.enrollments[0].lessonsRemaining).toBe(10);
      expect(p.hoursRemaining).toBe(60);
      expect(events.some((e) => e.type === "Enrolled" && e.degreeId === "juniorCollege" && e.fee === 50 && e.lessonsRemaining === 10)).toBe(true);
    });

    it("extraCredit=1 reduces lessonsRemaining to 9", () => {
      const g = eduGame();
      g.players[0].extraCredit = 1;
      const { state } = reduce(g, { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      expect(state.players[0].enrollments[0].lessonsRemaining).toBe(9);
    });

    it("extraCredit=2 reduces lessonsRemaining to 8 (min)", () => {
      const g = eduGame();
      g.players[0].extraCredit = 2;
      const { state } = reduce(g, { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      expect(state.players[0].enrollments[0].lessonsRemaining).toBe(8);
    });

    it("prereq met: can enroll in businessAdmin when juniorCollege earned", () => {
      const g = eduGame();
      g.players[0].degrees = ["juniorCollege"];
      const { events } = reduce(g, { type: "Enroll", degreeId: "businessAdmin" }, testConfig);
      expect(events.some((e) => e.type === "Enrolled" && e.degreeId === "businessAdmin")).toBe(true);
    });

    it("guard: not inside Hi-Tech U → InvalidAction, no fee charged", () => {
      const g = eduGame();
      g.players[0].insideBuilding = false;
      const { state, events } = reduce(g, { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
      expect(state.players[0].cash).toBe(500);
    });

    it("guard: already has degree → InvalidAction { reason: 'already graduated' }", () => {
      const g = eduGame();
      g.players[0].degrees = ["juniorCollege"];
      const { events } = reduce(g, { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "already graduated")).toBe(true);
    });

    it("guard: already enrolled → InvalidAction { reason: 'already enrolled' }", () => {
      const g = eduGame();
      g.players[0].enrollments = [{ degreeId: "juniorCollege", lessonsRemaining: 5 }];
      const { events } = reduce(g, { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "already enrolled")).toBe(true);
    });

    it("guard: missing prereq → InvalidAction { reason: 'no prereq' }", () => {
      // businessAdmin requires juniorCollege; player has none
      const { events } = reduce(eduGame(), { type: "Enroll", degreeId: "businessAdmin" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "no prereq")).toBe(true);
    });

    it("guard: max enrollments (4) → InvalidAction { reason: 'max enrollments' }", () => {
      const g = eduGame();
      g.players[0].degrees = ["juniorCollege"]; // satisfies prereq for businessAdmin
      g.players[0].enrollments = [
        { degreeId: "tradeSchool", lessonsRemaining: 5 },
        { degreeId: "preEngineering", lessonsRemaining: 5 },
        { degreeId: "engineering", lessonsRemaining: 5 },
        { degreeId: "electronics", lessonsRemaining: 5 },
      ];
      const { events } = reduce(g, { type: "Enroll", degreeId: "businessAdmin" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "max enrollments")).toBe(true);
    });

    it("guard: not enough cash → NotEnoughMoney", () => {
      const g = eduGame();
      g.players[0].cash = 10;
      const { events } = reduce(g, { type: "Enroll", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "NotEnoughMoney" && e.action === "Enroll")).toBe(true);
    });
  });

  describe("Study", () => {
    it("decrements lessonsRemaining by 1, deducts 6 hours, emits Studied", () => {
      const { state, events } = reduce(enrolledGame(), { type: "Study", degreeId: "juniorCollege" }, testConfig);
      expect(state.players[0].enrollments[0].lessonsRemaining).toBe(9);
      expect(state.players[0].hoursRemaining).toBe(54);
      expect(events.some((e) => e.type === "Studied" && e.degreeId === "juniorCollege" && e.lessonsRemaining === 9)).toBe(true);
    });

    it("with <6 hours remaining: uses all remaining hours, lesson still counts", () => {
      const g = enrolledGame();
      g.players[0].hoursRemaining = 3;
      const { state } = reduce(g, { type: "Study", degreeId: "juniorCollege" }, testConfig);
      expect(state.players[0].enrollments[0].lessonsRemaining).toBe(9);
      expect(state.players[0].hoursRemaining).toBe(0);
    });

    it("graduation: enrollment removed, degree added, dep/caps bumped, Graduated emitted", () => {
      const { state, events } = reduce(enrolledGame(1), { type: "Study", degreeId: "juniorCollege" }, testConfig);
      const p = state.players[0];
      expect(p.enrollments).toHaveLength(0);
      expect(p.degrees).toContain("juniorCollege");
      expect(p.dependibility).toBe(25);    // initialDep(20) + bonus(5)
      expect(p.maxDependibility).toBe(25); // initialMax(20) + bonus(5)
      expect(p.maxExperience).toBe(15);    // initialMax(10) + bonus(5)
      expect(events.some((e) => e.type === "Studied" && e.lessonsRemaining === 0)).toBe(true);
      expect(events.some((e) => e.type === "Graduated" && e.degreeId === "juniorCollege")).toBe(true);
    });

    it("only advances the specified degree; other enrollments unaffected", () => {
      const g = eduGame();
      g.players[0].enrollments = [
        { degreeId: "juniorCollege", lessonsRemaining: 5 },
        { degreeId: "tradeSchool", lessonsRemaining: 7 },
      ];
      const { state } = reduce(g, { type: "Study", degreeId: "tradeSchool" }, testConfig);
      const enrs = state.players[0].enrollments;
      expect(enrs.find((e) => e.degreeId === "tradeSchool")!.lessonsRemaining).toBe(6);
      expect(enrs.find((e) => e.degreeId === "juniorCollege")!.lessonsRemaining).toBe(5);
    });

    it("guard: not inside Hi-Tech U → InvalidAction", () => {
      const g = enrolledGame();
      g.players[0].insideBuilding = false;
      const { events } = reduce(g, { type: "Study", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
    });

    it("guard: not enrolled in that degree → InvalidAction { reason: 'not enrolled' }", () => {
      const { events } = reduce(eduGame(), { type: "Study", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "InvalidAction" && e.reason === "not enrolled")).toBe(true);
    });

    it("guard: 0 hours → NotEnoughTime", () => {
      const g = enrolledGame();
      g.players[0].hoursRemaining = 0;
      const { events } = reduce(g, { type: "Study", degreeId: "juniorCollege" }, testConfig);
      expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
    });
  });
  ```

- [ ] **Step 2: Run tests to confirm they fail**

  ```bash
  pnpm test packages/core/test/education.test.ts --reporter=verbose 2>&1 | head -20
  ```

  Expected: fails with `unhandled command Enroll` (falls through to reducer default).

- [ ] **Step 3: Create `packages/core/src/education.ts`**

  ```ts
  import type { DegreeId, GameConfig } from "@jones/config";
  import type { Economy } from "./economy.js";
  import type { GameEvent, GameState } from "./types.js";

  export function enroll(
    degreeId: DegreeId,
    state: GameState,
    config: GameConfig,
    economy: Economy,
    events: GameEvent[],
  ): void {
    const p = state.players[state.currentPlayerIndex];

    if (!p.insideBuilding || p.locationId !== "hiTechU") {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
      return;
    }

    const degree = config.degrees.find((d) => d.id === degreeId);
    if (!degree) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown degree" });
      return;
    }

    if (p.degrees.includes(degreeId)) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "already graduated" });
      return;
    }

    if (p.enrollments.some((e) => e.degreeId === degreeId)) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "already enrolled" });
      return;
    }

    if (degree.prereqs.some((pr) => !p.degrees.includes(pr))) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "no prereq" });
      return;
    }

    if (p.enrollments.length >= config.constants.maxEnrollments) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "max enrollments" });
      return;
    }

    const fee = economy.adjustedPrice(config.constants.enrollmentBaseFee, state.economy.reading);
    if (p.cash < fee) {
      events.push({ type: "NotEnoughMoney", playerId: p.id, action: "Enroll" });
      return;
    }

    p.cash -= fee;
    const lessonsRemaining = Math.max(
      config.constants.minLessonsPerDegree,
      config.constants.lessonsPerDegree - p.extraCredit,
    );
    p.enrollments.push({ degreeId, lessonsRemaining });
    events.push({ type: "Enrolled", playerId: p.id, degreeId, fee, lessonsRemaining });
  }

  export function study(
    degreeId: DegreeId,
    state: GameState,
    config: GameConfig,
    events: GameEvent[],
  ): void {
    const p = state.players[state.currentPlayerIndex];

    if (!p.insideBuilding || p.locationId !== "hiTechU") {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
      return;
    }

    const enrollment = p.enrollments.find((e) => e.degreeId === degreeId);
    if (!enrollment) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "not enrolled" });
      return;
    }

    if (p.hoursRemaining === 0) {
      events.push({ type: "NotEnoughTime", playerId: p.id, action: "Study" });
      return;
    }

    p.hoursRemaining -= Math.min(config.actionCosts.study, p.hoursRemaining);
    enrollment.lessonsRemaining -= 1;
    events.push({ type: "Studied", playerId: p.id, degreeId, lessonsRemaining: enrollment.lessonsRemaining });

    if (enrollment.lessonsRemaining === 0) {
      p.enrollments = p.enrollments.filter((e) => e.degreeId !== degreeId);
      p.degrees.push(degreeId);
      p.dependibility += config.constants.graduateDependibilityBonus;
      p.maxDependibility += config.constants.graduateMaxCapBonus;
      p.maxExperience += config.constants.graduateMaxCapBonus;
      events.push({ type: "Graduated", playerId: p.id, degreeId });
    }
  }
  ```

- [ ] **Step 4: Run education tests**

  ```bash
  pnpm test packages/core/test/education.test.ts --reporter=verbose
  ```

  Expected: all education tests still fail (Enroll/Study not wired into reducer yet).

- [ ] **Step 5: Commit education.ts**

  ```bash
  git add packages/core/src/education.ts packages/core/test/education.test.ts
  git commit -m "feat(core): add education.ts with enroll and study functions"
  ```

---

## Task 4: Wire reducer, export, and integration test

**Files:**
- Modify: `packages/core/src/reduce.ts`
- Modify: `packages/core/src/index.ts`
- Modify: `packages/core/test/integration.game.test.ts`

- [ ] **Step 1: Update `packages/core/src/reduce.ts`**

  Add import after the `quitJob` import line:
  ```ts
  import { enroll, study } from "./education.js";
  ```

  Add three new cases in the switch statement, before the `default` case:
  ```ts
      case "Enroll": {
        enroll(command.degreeId, next, config, economy, events);
        break;
      }
      case "Study": {
        study(command.degreeId, next, config, events);
        break;
      }
  ```

- [ ] **Step 2: Run education tests — should now pass**

  ```bash
  pnpm test packages/core/test/education.test.ts --reporter=verbose
  ```

  Expected: all 15 education tests pass.

- [ ] **Step 3: Update `packages/core/src/index.ts`**

  Add after `export * from "./hire.js";`:
  ```ts
  export * from "./education.js";
  ```

- [ ] **Step 4: Add integration test to `packages/core/test/integration.game.test.ts`**

  The file already has `describe("headless game", ...)` and `describe("employment flow", ...)`. Add after the closing `}` of `employment flow`:

  ```ts
  describe("education flow", () => {
    it("solo player can enroll, study, and graduate from Junior College", () => {
      const cmds: Command[] = [
        { type: "TravelTo", locationId: "hiTechU" },
        { type: "EnterBuilding" },
        { type: "Enroll", degreeId: "juniorCollege" },
      ];

      let state = createInitialGame(defaultConfig, 1, [
        { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 10, career: 100 } },
      ]);

      for (const cmd of cmds) {
        state = reduce(state, cmd, defaultConfig).state;
      }

      expect(state.players[0].enrollments).toHaveLength(1);
      expect(state.players[0].enrollments[0].degreeId).toBe("juniorCollege");

      // Study 10 lessons to graduate (6 hours each; player starts with 60h, spent ~10h traveling+entering)
      // After travel+enter player has ~46h remaining. 7 Study sessions = 42h, leaving ~4h.
      // Then EndTurn resets to 60h. Study 3 more on next turn to hit 10.
      const allEvents: GameEvent[] = [];
      for (let i = 0; i < 7; i++) {
        const result = reduce(state, { type: "Study", degreeId: "juniorCollege" }, defaultConfig);
        state = result.state;
        allEvents.push(...result.events);
      }
      // End the turn to get fresh hours
      state = reduce(state, { type: "EndTurn" }, defaultConfig).state;
      // Travel back to hiTechU and enter
      state = reduce(state, { type: "TravelTo", locationId: "hiTechU" }, defaultConfig).state;
      state = reduce(state, { type: "EnterBuilding" }, defaultConfig).state;
      // Study 3 more to complete the 10th lesson
      for (let i = 0; i < 3; i++) {
        const result = reduce(state, { type: "Study", degreeId: "juniorCollege" }, defaultConfig);
        state = result.state;
        allEvents.push(...result.events);
      }

      expect(state.players[0].degrees).toContain("juniorCollege");
      expect(state.players[0].enrollments).toHaveLength(0);
      expect(allEvents.some((e) => e.type === "Graduated" && e.degreeId === "juniorCollege")).toBe(true);
    });
  });
  ```

  Also add `GameEvent` to the import if not already present (it was added in M2; verify the import line includes `GameEvent`).

- [ ] **Step 5: Run full test suite**

  ```bash
  pnpm test
  ```

  Expected: all tests pass (no regressions).

- [ ] **Step 6: Typecheck**

  ```bash
  pnpm typecheck
  ```

  Expected: no errors.

- [ ] **Step 7: Commit**

  ```bash
  git add packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/integration.game.test.ts
  git commit -m "feat(core): wire Enroll/Study into reducer; add education integration test"
  ```

---

## Self-Review

**Spec coverage:**
- [x] `DegreeDef` interface + 11 degrees with prereq chain → Task 1
- [x] `GameConstants` education fields (enrollmentBaseFee, lessonsPerDegree, minLessonsPerDegree, graduateDependibilityBonus, graduateMaxCapBonus, maxEnrollments) → Task 1
- [x] `enrollments` and `extraCredit` on `PlayerState` → Task 2
- [x] `Enroll`, `Study` commands → Task 2
- [x] `Enrolled`, `Studied`, `Graduated`, `NotEnoughMoney` events → Task 2
- [x] `enroll`: all 7 guards in order → Task 3
- [x] `enroll`: fee = `adjustedPrice(enrollmentBaseFee, reading)` → Task 3
- [x] `enroll`: `lessonsRemaining = max(minLessonsPerDegree, lessonsPerDegree - extraCredit)` → Task 3
- [x] `study`: `min(6, hoursRemaining)` hour cost → Task 3
- [x] `study`: graduation fires at `lessonsRemaining === 0` → Task 3
- [x] `study`: graduation: +dep, +maxDep, +maxExp, degree added, enrollment removed → Task 3
- [x] `cloneState` deep-copies `enrollments` → Task 2
- [x] Exports wired → Task 4
- [x] Integration test → Task 4

**Placeholder scan:** No TBDs or incomplete steps found.

**Type consistency:** `DegreeId` used throughout; `enroll` takes `DegreeId`, reducer passes `command.degreeId: DegreeId`. `study` same. `economy.adjustedPrice` matches signature in `economy.ts`.
