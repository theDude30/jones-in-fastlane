# M1 Core Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up the monorepo and build a deterministic, headless, command-driven game core that can play a scripted Jones game (move → work → earn → advance weeks → win), seeded entirely from `@jones/config` data.

**Architecture:** A pnpm-workspaces monorepo. `@jones/config` holds all tunable game data as typed plain objects (seeded from the logic reference). `@jones/core` holds a pure, serializable `GameState` plus a `reduce(state, command, config) → { state, events }` function and a seeded RNG carried in state. The board is modeled as **locations with pairwise travel-time costs** (ring layout) — no tile grid (that's a rendering concern). This first plan implements movement, working, the turn/week loop, the start-of-turn sequence skeleton, and the 4-goal win check. Dynamic economy, study, money systems, and random events are later plans built on these seams.

**Tech Stack:** TypeScript (strict), pnpm workspaces, Vitest, tsx (for a headless runner), ESLint/Prettier.

**Authoritative spec:** `docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md` (sections cited as §N). Design: `docs/superpowers/specs/2026-06-15-jones-in-the-fast-lane-design.md`.

---

## File Structure

```
package.json                      # workspace root
pnpm-workspace.yaml
tsconfig.base.json
vitest.config.ts
packages/
  config/
    package.json
    tsconfig.json
    src/
      index.ts                    # re-exports
      types.ts                    # config type definitions
      goals.ts                    # goal target ranges + formula ids
      locations.ts                # location list + ring travel model
      jobs.ts                     # full job table (§6)
      actionCosts.ts              # action hour costs (§2)
      constants.ts                # initial player + turn constants
      defaultConfig.ts            # assembles GameConfig
  core/
    package.json
    tsconfig.json
    src/
      index.ts                    # re-exports
      rng.ts                      # seeded RNG (mulberry32)
      types.ts                    # GameState, PlayerState, Command, GameEvent
      setup.ts                    # createInitialGame()
      goals.ts                    # goalScores(), hasWon()
      travel.ts                   # travelHours(from,to)
      reduce.ts                   # reduce(state, command, config)
      turn.ts                     # startOfTurnSequence(), advanceTurn()
    test/
      rng.test.ts
      setup.test.ts
      goals.test.ts
      travel.test.ts
      reduce.work.test.ts
      turn.test.ts
      integration.game.test.ts
    runner/
      headless.ts                 # scripted game runner (manual smoke)
```

---

## Task 1: Monorepo scaffold & tooling

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/config/package.json`, `packages/config/tsconfig.json`, `packages/config/src/index.ts`
- Create: `packages/core/package.json`, `packages/core/tsconfig.json`, `packages/core/src/index.ts`
- Create: `.gitignore`

- [ ] **Step 1: Create the workspace root files**

`pnpm-workspace.yaml`:
```yaml
packages:
  - "packages/*"
```

`package.json`:
```json
{
  "name": "jones-in-fastlane",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b packages/config packages/core"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "tsx": "^4.16.0"
  }
}
```

`tsconfig.base.json`:
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "declaration": true,
    "composite": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  }
}
```

`vitest.config.ts`:
```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["packages/**/test/**/*.test.ts"],
  },
});
```

`.gitignore`:
```
node_modules/
dist/
*.tsbuildinfo
```

- [ ] **Step 2: Create the `@jones/config` package skeleton**

`packages/config/package.json`:
```json
{
  "name": "@jones/config",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts"
}
```

`packages/config/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src"]
}
```

`packages/config/src/index.ts`:
```ts
export const PLACEHOLDER = true;
```

- [ ] **Step 3: Create the `@jones/core` package skeleton**

`packages/core/package.json`:
```json
{
  "name": "@jones/core",
  "version": "0.0.0",
  "type": "module",
  "main": "src/index.ts",
  "types": "src/index.ts",
  "dependencies": {
    "@jones/config": "workspace:*"
  }
}
```

`packages/core/tsconfig.json`:
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "references": [{ "path": "../config" }],
  "include": ["src"]
}
```

`packages/core/src/index.ts`:
```ts
export const PLACEHOLDER = true;
```

- [ ] **Step 4: Install dependencies**

Run: `pnpm install`
Expected: completes without error; `node_modules/` created; workspace links `@jones/config` into `@jones/core`.

- [ ] **Step 5: Verify tooling works**

Run: `pnpm test`
Expected: Vitest runs and reports "No test files found" (exit 0) — confirms config resolves.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm monorepo with config and core packages"
```

---

## Task 2: Seeded RNG

**Files:**
- Create: `packages/core/src/rng.ts`
- Test: `packages/core/test/rng.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/rng.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { nextInt, nextFloat, type RngState } from "../src/rng.js";

describe("seeded rng", () => {
  it("is deterministic for the same seed", () => {
    const a: RngState = { seed: 12345 };
    const b: RngState = { seed: 12345 };
    const r1 = nextInt(a, 0, 100);
    const r2 = nextInt(b, 0, 100);
    expect(r1.value).toBe(r2.value);
    expect(r1.state.seed).toBe(r2.state.seed);
  });

  it("advances state so successive calls differ", () => {
    let s: RngState = { seed: 1 };
    const first = nextInt(s, 0, 1_000_000);
    s = first.state;
    const second = nextInt(s, 0, 1_000_000);
    expect(first.value).not.toBe(second.value);
  });

  it("nextInt stays within [min, max] inclusive", () => {
    let s: RngState = { seed: 999 };
    for (let i = 0; i < 500; i++) {
      const r = nextInt(s, 5, 10);
      expect(r.value).toBeGreaterThanOrEqual(5);
      expect(r.value).toBeLessThanOrEqual(10);
      s = r.state;
    }
  });

  it("nextFloat is in [0,1)", () => {
    const r = nextFloat({ seed: 42 });
    expect(r.value).toBeGreaterThanOrEqual(0);
    expect(r.value).toBeLessThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/rng.test.ts`
Expected: FAIL — cannot find module `../src/rng.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/rng.ts`:
```ts
/** Serializable RNG state. `seed` is the full mutable internal state. */
export interface RngState {
  seed: number;
}

export interface RngResult<T> {
  value: T;
  state: RngState;
}

/** mulberry32 — small, fast, deterministic. */
function step(seed: number): { next: number; raw: number } {
  let t = (seed + 0x6d2b79f5) | 0;
  let x = t;
  x = Math.imul(x ^ (x >>> 15), x | 1);
  x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
  const raw = ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  return { next: t, raw };
}

export function nextFloat(state: RngState): RngResult<number> {
  const { next, raw } = step(state.seed);
  return { value: raw, state: { seed: next } };
}

/** Inclusive integer in [min, max]. */
export function nextInt(state: RngState, min: number, max: number): RngResult<number> {
  const { value, state: s } = nextFloat(state);
  const span = max - min + 1;
  return { value: min + Math.floor(value * span), state: s };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/rng.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/rng.ts packages/core/test/rng.test.ts
git commit -m "feat(core): add deterministic seeded RNG"
```

---

## Task 3: Config types & seed data

**Files:**
- Create: `packages/config/src/types.ts`, `goals.ts`, `locations.ts`, `jobs.ts`, `actionCosts.ts`, `constants.ts`, `defaultConfig.ts`
- Modify: `packages/config/src/index.ts`
- Test: (validation test lives in core) — add `packages/config` is data-only; validate via a core test in Task 4. For this task, verify it typechecks.

- [ ] **Step 1: Define config types**

`packages/config/src/types.ts`:
```ts
export type UniformLevel = "casual" | "dress" | "business";
export type DegreeId =
  | "juniorCollege" | "tradeSchool" | "businessAdmin" | "academic"
  | "electronics" | "preEngineering" | "engineering" | "graduateSchool"
  | "postDoctoral" | "research" | "publishing";

export interface JobDef {
  id: string;            // unique, e.g. "bank.teller"
  locationId: string;    // matches a LocationDef.id
  title: string;
  baseWage: number;      // §6 Base Wage (dollars/hour, pre-economy)
  reqExperience: number;
  reqDependibility: number;
  reqDegrees: DegreeId[];
  uniform: UniformLevel;
  alwaysApproved?: boolean; // Cook
}

export type LocationType =
  | "apartment" | "store" | "workplace" | "service";

export interface LocationDef {
  id: string;
  name: string;
  ringIndex: number;     // position on the board ring (clockwise)
  types: LocationType[];
}

export interface ActionCosts {
  enterLocation: number; // §2
  work: number;
  relax: number;
  study: number;
  applyJob: number;
  applyLoan: number;
  broker: number;
  newspaper: number;
}

export interface GoalRanges {
  min: number;           // 10
  max: number;           // 100
}

export interface GameConstants {
  hoursPerTurn: number;        // 60 §2
  weeksPerMonth: number;       // 4
  maxPlayers: number;          // 4
  initialCash: number;         // §4 / port
  initialDependibility: number; // 20 §4
  initialExperience: number;   // 10 §4
  initialRelaxation: number;   // 10 §4
  initialCasualWeeks: number;  // 6 §11
  homeLocationId: string;      // "lowCostHousing"
  ringSize: number;            // number of ring positions
  hoursPerRingStep: number;    // travel cost per ring step (§2: ~10/lap)
  workWageMultiplier: number;  // 8 §6
  dependibilityDecayPerWeek: number; // 3 §4
}

export interface GameConfig {
  constants: GameConstants;
  goalRanges: GoalRanges;
  actionCosts: ActionCosts;
  locations: LocationDef[];
  jobs: JobDef[];
}
```

- [ ] **Step 2: Add goal ranges**

`packages/config/src/goals.ts`:
```ts
import type { GoalRanges } from "./types.js";

// §3: each goal is set per player between 10 and 100.
export const goalRanges: GoalRanges = { min: 10, max: 100 };
```

- [ ] **Step 3: Add locations (ring layout, §8)**

`packages/config/src/locations.ts`:
```ts
import type { LocationDef } from "./types.js";

// §8: board order, clockwise from the top. ringIndex defines travel distance.
export const locations: LocationDef[] = [
  { id: "lowCostHousing", name: "Low-Cost Housing", ringIndex: 0, types: ["apartment"] },
  { id: "pawnShop", name: "Pawn Shop", ringIndex: 1, types: ["service"] },
  { id: "zMart", name: "Z-Mart", ringIndex: 2, types: ["store", "workplace"] },
  { id: "monolithBurgers", name: "Monolith Burgers", ringIndex: 3, types: ["store", "workplace"] },
  { id: "qtClothing", name: "QT Clothing", ringIndex: 4, types: ["store", "workplace"] },
  { id: "socketCity", name: "Socket City", ringIndex: 5, types: ["store", "workplace"] },
  { id: "hiTechU", name: "Hi-Tech U", ringIndex: 6, types: ["service", "workplace"] },
  { id: "employmentOffice", name: "Employment Office", ringIndex: 7, types: ["service"] },
  { id: "factory", name: "Factory", ringIndex: 8, types: ["workplace"] },
  { id: "bank", name: "Bank", ringIndex: 9, types: ["service", "workplace"] },
  { id: "blacksMarket", name: "Black's Market", ringIndex: 10, types: ["store", "workplace"] },
  { id: "securityApartments", name: "Le Security Apartments", ringIndex: 11, types: ["apartment"] },
  { id: "rentOffice", name: "Rent Office", ringIndex: 12, types: ["service", "workplace"] },
];
```

- [ ] **Step 4: Add the full job table (§6)**

`packages/config/src/jobs.ts`:
```ts
import type { JobDef } from "./types.js";

// §6 full job table. baseWage = dollars/hour pre-economy.
export const jobs: JobDef[] = [
  { id: "zMart.clerk", locationId: "zMart", title: "Clerk", baseWage: 5, reqExperience: 10, reqDependibility: 10, reqDegrees: [], uniform: "casual" },
  { id: "zMart.assistantManager", locationId: "zMart", title: "Assistant Manager", baseWage: 7, reqExperience: 20, reqDependibility: 20, reqDegrees: [], uniform: "dress" },
  { id: "zMart.manager", locationId: "zMart", title: "Manager", baseWage: 8, reqExperience: 30, reqDependibility: 30, reqDegrees: ["juniorCollege"], uniform: "business" },
  { id: "monolithBurgers.cook", locationId: "monolithBurgers", title: "Cook", baseWage: 5, reqExperience: 0, reqDependibility: 10, reqDegrees: [], uniform: "casual", alwaysApproved: true },
  { id: "monolithBurgers.clerk", locationId: "monolithBurgers", title: "Clerk", baseWage: 6, reqExperience: 10, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "monolithBurgers.assistantManager", locationId: "monolithBurgers", title: "Assistant Manager", baseWage: 7, reqExperience: 20, reqDependibility: 30, reqDegrees: [], uniform: "casual" },
  { id: "monolithBurgers.manager", locationId: "monolithBurgers", title: "Manager", baseWage: 8, reqExperience: 30, reqDependibility: 40, reqDegrees: ["juniorCollege"], uniform: "dress" },
  { id: "qtClothing.janitor", locationId: "qtClothing", title: "Janitor", baseWage: 6, reqExperience: 10, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "qtClothing.salesperson", locationId: "qtClothing", title: "Salesperson", baseWage: 8, reqExperience: 30, reqDependibility: 30, reqDegrees: [], uniform: "dress" },
  { id: "qtClothing.assistantManager", locationId: "qtClothing", title: "Assistant Manager", baseWage: 9, reqExperience: 40, reqDependibility: 40, reqDegrees: ["juniorCollege"], uniform: "business" },
  { id: "qtClothing.manager", locationId: "qtClothing", title: "Manager", baseWage: 12, reqExperience: 50, reqDependibility: 50, reqDegrees: ["businessAdmin"], uniform: "business" },
  { id: "socketCity.clerk", locationId: "socketCity", title: "Clerk", baseWage: 6, reqExperience: 10, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "socketCity.salesperson", locationId: "socketCity", title: "Salesperson", baseWage: 7, reqExperience: 30, reqDependibility: 30, reqDegrees: [], uniform: "dress" },
  { id: "socketCity.electronicsRepairman", locationId: "socketCity", title: "Electronics Repairman", baseWage: 11, reqExperience: 40, reqDependibility: 40, reqDegrees: ["electronics"], uniform: "casual" },
  { id: "socketCity.manager", locationId: "socketCity", title: "Manager", baseWage: 14, reqExperience: 40, reqDependibility: 40, reqDegrees: ["electronics", "juniorCollege"], uniform: "business" },
  { id: "hiTechU.janitor", locationId: "hiTechU", title: "Janitor", baseWage: 5, reqExperience: 10, reqDependibility: 10, reqDegrees: [], uniform: "casual" },
  { id: "hiTechU.teacher", locationId: "hiTechU", title: "Teacher", baseWage: 11, reqExperience: 40, reqDependibility: 50, reqDegrees: ["academic"], uniform: "dress" },
  { id: "hiTechU.professor", locationId: "hiTechU", title: "Professor", baseWage: 20, reqExperience: 50, reqDependibility: 60, reqDegrees: ["research"], uniform: "dress" },
  { id: "factory.janitor", locationId: "factory", title: "Janitor", baseWage: 7, reqExperience: 10, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "factory.assemblyWorker", locationId: "factory", title: "Assembly Worker", baseWage: 8, reqExperience: 30, reqDependibility: 30, reqDegrees: ["tradeSchool"], uniform: "casual" },
  { id: "factory.secretary", locationId: "factory", title: "Secretary", baseWage: 9, reqExperience: 40, reqDependibility: 40, reqDegrees: ["juniorCollege"], uniform: "dress" },
  { id: "factory.machinistsHelper", locationId: "factory", title: "Machinist's Helper", baseWage: 10, reqExperience: 40, reqDependibility: 40, reqDegrees: ["preEngineering"], uniform: "casual" },
  { id: "factory.executiveSecretary", locationId: "factory", title: "Executive Secretary", baseWage: 18, reqExperience: 50, reqDependibility: 50, reqDegrees: ["businessAdmin"], uniform: "business" },
  { id: "factory.machinist", locationId: "factory", title: "Machinist", baseWage: 19, reqExperience: 50, reqDependibility: 50, reqDegrees: ["engineering"], uniform: "casual" },
  { id: "factory.departmentManager", locationId: "factory", title: "Department Manager", baseWage: 22, reqExperience: 60, reqDependibility: 60, reqDegrees: ["juniorCollege", "engineering"], uniform: "business" },
  { id: "factory.engineer", locationId: "factory", title: "Engineer", baseWage: 23, reqExperience: 60, reqDependibility: 60, reqDegrees: ["juniorCollege", "engineering"], uniform: "business" },
  { id: "factory.generalManager", locationId: "factory", title: "General Manager", baseWage: 25, reqExperience: 70, reqDependibility: 70, reqDegrees: ["businessAdmin", "engineering"], uniform: "business" },
  { id: "bank.janitor", locationId: "bank", title: "Janitor", baseWage: 6, reqExperience: 10, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "bank.teller", locationId: "bank", title: "Teller", baseWage: 10, reqExperience: 40, reqDependibility: 40, reqDegrees: ["juniorCollege"], uniform: "dress" },
  { id: "bank.assistantManager", locationId: "bank", title: "Assistant Manager", baseWage: 14, reqExperience: 50, reqDependibility: 50, reqDegrees: ["businessAdmin"], uniform: "business" },
  { id: "bank.manager", locationId: "bank", title: "Manager", baseWage: 19, reqExperience: 60, reqDependibility: 60, reqDegrees: ["businessAdmin"], uniform: "business" },
  { id: "bank.broker", locationId: "bank", title: "Broker", baseWage: 22, reqExperience: 70, reqDependibility: 70, reqDegrees: ["businessAdmin", "academic"], uniform: "business" },
  { id: "blacksMarket.janitor", locationId: "blacksMarket", title: "Janitor", baseWage: 6, reqExperience: 10, reqDependibility: 10, reqDegrees: [], uniform: "casual" },
  { id: "blacksMarket.checker", locationId: "blacksMarket", title: "Checker", baseWage: 8, reqExperience: 20, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "blacksMarket.butcher", locationId: "blacksMarket", title: "Butcher", baseWage: 12, reqExperience: 30, reqDependibility: 30, reqDegrees: ["tradeSchool"], uniform: "casual" },
  { id: "blacksMarket.assistantManager", locationId: "blacksMarket", title: "Assistant Manager", baseWage: 15, reqExperience: 40, reqDependibility: 40, reqDegrees: ["juniorCollege"], uniform: "dress" },
  { id: "blacksMarket.manager", locationId: "blacksMarket", title: "Manager", baseWage: 18, reqExperience: 50, reqDependibility: 50, reqDegrees: ["businessAdmin"], uniform: "business" },
  { id: "rentOffice.groundskeeper", locationId: "rentOffice", title: "Groundskeeper", baseWage: 7, reqExperience: 10, reqDependibility: 20, reqDegrees: [], uniform: "casual" },
  { id: "rentOffice.apartmentManager", locationId: "rentOffice", title: "Apartment Manager", baseWage: 9, reqExperience: 30, reqDependibility: 30, reqDegrees: ["juniorCollege"], uniform: "casual" },
];
```

- [ ] **Step 5: Add action costs and constants**

`packages/config/src/actionCosts.ts`:
```ts
import type { ActionCosts } from "./types.js";

// §2 action hour costs.
export const actionCosts: ActionCosts = {
  enterLocation: 2,
  work: 6,
  relax: 6,
  study: 6,
  applyJob: 4,
  applyLoan: 2,
  broker: 2,
  newspaper: 1,
};
```

`packages/config/src/constants.ts`:
```ts
import type { GameConstants } from "./types.js";

// §2/§4/§11. hoursPerRingStep: ~10 hours per full 13-step lap → 10/13 ≈ 0.77.
export const constants: GameConstants = {
  hoursPerTurn: 60,
  weeksPerMonth: 4,
  maxPlayers: 4,
  initialCash: 200,
  initialDependibility: 20,
  initialExperience: 10,
  initialRelaxation: 10,
  initialCasualWeeks: 6,
  homeLocationId: "lowCostHousing",
  ringSize: 13,
  hoursPerRingStep: 10 / 13,
  workWageMultiplier: 8,
  dependibilityDecayPerWeek: 3,
};
```

- [ ] **Step 6: Assemble the default config and export**

`packages/config/src/defaultConfig.ts`:
```ts
import type { GameConfig } from "./types.js";
import { constants } from "./constants.js";
import { goalRanges } from "./goals.js";
import { actionCosts } from "./actionCosts.js";
import { locations } from "./locations.js";
import { jobs } from "./jobs.js";

export const defaultConfig: GameConfig = {
  constants,
  goalRanges,
  actionCosts,
  locations,
  jobs,
};
```

`packages/config/src/index.ts` (replace contents):
```ts
export * from "./types.js";
export { constants } from "./constants.js";
export { goalRanges } from "./goals.js";
export { actionCosts } from "./actionCosts.js";
export { locations } from "./locations.js";
export { jobs } from "./jobs.js";
export { defaultConfig } from "./defaultConfig.js";
```

- [ ] **Step 7: Typecheck**

Run: `pnpm typecheck`
Expected: PASS — no type errors.

- [ ] **Step 8: Commit**

```bash
git add packages/config
git commit -m "feat(config): add typed game config seeded from logic reference"
```

---

## Task 4: Game state types & initial game

**Files:**
- Create: `packages/core/src/types.ts`, `packages/core/src/setup.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/setup.test.ts`

- [ ] **Step 1: Define core types**

`packages/core/src/types.ts`:
```ts
import type { DegreeId, UniformLevel } from "@jones/config";
import type { RngState } from "./rng.js";

export interface GoalTargets {
  wealth: number;     // 10..100
  happiness: number;
  education: number;
  career: number;
}

export interface ClothingWeeks {
  casual: number;
  dress: number;
  business: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  cash: number;
  bank: number;
  happiness: number;
  dependibility: number;
  experience: number;
  relaxation: number;
  maxDependibility: number;
  maxExperience: number;
  degrees: DegreeId[];
  jobId: string | null;
  wage: number;            // current hourly wage (0 if unemployed)
  locationId: string;
  insideBuilding: boolean;
  clothing: ClothingWeeks;
  goals: GoalTargets;
  hoursRemaining: number;
}

export type GameStatus = "playing" | "ended";

export interface GameState {
  week: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  economyReading: number;  // §5; static in this plan (0), dynamic later
  rng: RngState;
  status: GameStatus;
  winners: string[];       // player ids, in order of winning
}

export type Command =
  | { type: "TravelTo"; locationId: string }
  | { type: "EnterBuilding" }
  | { type: "ExitBuilding" }
  | { type: "Work" }
  | { type: "EndTurn" };

export type GameEvent =
  | { type: "Traveled"; playerId: string; toLocationId: string; hoursSpent: number }
  | { type: "EnteredBuilding"; playerId: string; locationId: string }
  | { type: "ExitedBuilding"; playerId: string; locationId: string }
  | { type: "Worked"; playerId: string; earned: number }
  | { type: "Fired"; playerId: string; jobId: string }
  | { type: "NotEnoughTime"; playerId: string; action: string }
  | { type: "InvalidAction"; playerId: string; reason: string }
  | { type: "TurnEnded"; playerId: string }
  | { type: "WeekAdvanced"; week: number }
  | { type: "PlayerWon"; playerId: string };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}
```

- [ ] **Step 2: Write the failing test**

`packages/core/test/setup.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";

describe("createInitialGame", () => {
  it("creates players at home with starting stats", () => {
    const game = createInitialGame(defaultConfig, 7, [
      { name: "Alice", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
      { name: "Jones", isAI: true, goals: { wealth: 30, happiness: 30, education: 30, career: 30 } },
    ]);
    expect(game.players).toHaveLength(2);
    const alice = game.players[0];
    expect(alice.cash).toBe(200);
    expect(alice.dependibility).toBe(20);
    expect(alice.experience).toBe(10);
    expect(alice.relaxation).toBe(10);
    expect(alice.clothing.casual).toBe(6);
    expect(alice.clothing.dress).toBe(0);
    expect(alice.locationId).toBe("lowCostHousing");
    expect(alice.insideBuilding).toBe(false);
    expect(alice.jobId).toBeNull();
    expect(alice.hoursRemaining).toBe(60);
    expect(game.week).toBe(1);
    expect(game.currentPlayerIndex).toBe(0);
    expect(game.status).toBe("playing");
  });

  it("throws when more than maxPlayers", () => {
    const setups = Array.from({ length: 5 }, (_, i) => ({
      name: `P${i}`, isAI: false,
      goals: { wealth: 10, happiness: 10, education: 10, career: 10 },
    }));
    expect(() => createInitialGame(defaultConfig, 1, setups)).toThrow();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/setup.test.ts`
Expected: FAIL — cannot find `../src/setup.js`.

- [ ] **Step 4: Write minimal implementation**

`packages/core/src/setup.ts`:
```ts
import type { GameConfig } from "@jones/config";
import type { GameState, GoalTargets, PlayerState } from "./types.js";

export interface PlayerSetup {
  name: string;
  isAI: boolean;
  goals: GoalTargets;
}

export function createInitialGame(
  config: GameConfig,
  seed: number,
  setups: PlayerSetup[],
): GameState {
  const c = config.constants;
  if (setups.length < 1 || setups.length > c.maxPlayers) {
    throw new Error(`player count must be 1..${c.maxPlayers}`);
  }
  const players: PlayerState[] = setups.map((s, i) => ({
    id: `p${i}`,
    name: s.name,
    isAI: s.isAI,
    cash: c.initialCash,
    bank: 0,
    happiness: 0,
    dependibility: c.initialDependibility,
    experience: c.initialExperience,
    relaxation: c.initialRelaxation,
    maxDependibility: c.initialDependibility,
    maxExperience: c.initialExperience,
    degrees: [],
    jobId: null,
    wage: 0,
    locationId: c.homeLocationId,
    insideBuilding: false,
    clothing: { casual: c.initialCasualWeeks, dress: 0, business: 0 },
    goals: { ...s.goals },
    hoursRemaining: c.hoursPerTurn,
  }));
  return {
    week: 1,
    currentPlayerIndex: 0,
    players,
    economyReading: 0,
    rng: { seed },
    status: "playing",
    winners: [],
  };
}
```

- [ ] **Step 5: Export from index**

`packages/core/src/index.ts` (replace contents):
```ts
export * from "./rng.js";
export * from "./types.js";
export * from "./setup.js";
```

- [ ] **Step 6: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/setup.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/types.ts packages/core/src/setup.ts packages/core/src/index.ts packages/core/test/setup.test.ts
git commit -m "feat(core): add game state types and createInitialGame"
```

---

## Task 5: Goal scoring & win check

**Files:**
- Create: `packages/core/src/goals.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/goals.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/goals.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { goalScores, hasWon } from "../src/goals.js";

function player() {
  return createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]).players[0];
}

describe("goalScores", () => {
  it("computes the four scores per §3", () => {
    const p = player();
    p.cash = 5000; p.bank = 0;       // wealth = floor(5000/100) = 50
    p.happiness = 42;                // happiness = 42
    p.degrees = ["juniorCollege", "tradeSchool"]; // education = 1 + 9*2 = 19
    p.jobId = "zMart.clerk"; p.dependibility = 40; // career = 1.25*40 = 50
    const s = goalScores(p);
    expect(s.wealth).toBe(50);
    expect(s.happiness).toBe(42);
    expect(s.education).toBe(19);
    expect(s.career).toBe(50);
  });

  it("career is 0 when unemployed even with high dependibility", () => {
    const p = player();
    p.jobId = null; p.dependibility = 80;
    expect(goalScores(p).career).toBe(0);
  });
});

describe("hasWon", () => {
  it("is true only when all four scores meet their targets", () => {
    const p = player(); // targets all 10
    p.cash = 1000;        // wealth 10
    p.happiness = 10;
    p.degrees = ["juniorCollege"]; // education 10
    p.jobId = "zMart.clerk"; p.dependibility = 8; // career 10
    expect(hasWon(p)).toBe(true);
  });

  it("is false if any goal is short", () => {
    const p = player();
    p.cash = 1000; p.happiness = 9; // happiness short of 10
    p.degrees = ["juniorCollege"];
    p.jobId = "zMart.clerk"; p.dependibility = 8;
    expect(hasWon(p)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/goals.test.ts`
Expected: FAIL — cannot find `../src/goals.js`.

- [ ] **Step 3: Write minimal implementation**

`packages/core/src/goals.ts`:
```ts
import type { PlayerState, GoalTargets } from "./types.js";

// §3 / §4 goal score formulas.
export function goalScores(p: PlayerState): GoalTargets {
  const liquidAssets = p.cash + p.bank; // stocks added in a later plan
  return {
    wealth: Math.floor(liquidAssets / 100),
    happiness: p.happiness,
    education: 1 + 9 * p.degrees.length,
    career: p.jobId === null ? 0 : Math.floor(1.25 * p.dependibility),
  };
}

export function hasWon(p: PlayerState): boolean {
  const s = goalScores(p);
  return (
    s.wealth >= p.goals.wealth &&
    s.happiness >= p.goals.happiness &&
    s.education >= p.goals.education &&
    s.career >= p.goals.career
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/goals.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Export and commit**

Append to `packages/core/src/index.ts`:
```ts
export * from "./goals.js";
```

```bash
git add packages/core/src/goals.ts packages/core/src/index.ts packages/core/test/goals.test.ts
git commit -m "feat(core): add 4-goal scoring and win check"
```

---

## Task 6: Travel cost & TravelTo command

**Files:**
- Create: `packages/core/src/travel.ts`, `packages/core/src/reduce.ts`
- Modify: `packages/core/src/index.ts`
- Test: `packages/core/test/travel.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/travel.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { travelHours } from "../src/travel.js";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";

describe("travelHours", () => {
  it("is zero between a location and itself", () => {
    expect(travelHours(defaultConfig, "bank", "bank")).toBe(0);
  });

  it("uses the shorter direction around the ring", () => {
    // lowCostHousing(0) -> rentOffice(12): 12 steps clockwise, 1 step the other way.
    const h = travelHours(defaultConfig, "lowCostHousing", "rentOffice");
    expect(h).toBeCloseTo(1 * (10 / 13), 5);
  });
});

describe("reduce TravelTo", () => {
  it("moves the player and spends hours", () => {
    const game = createInitialGame(defaultConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
    const { state, events } = reduce(game, { type: "TravelTo", locationId: "bank" }, defaultConfig);
    const p = state.players[0];
    expect(p.locationId).toBe("bank");
    expect(p.insideBuilding).toBe(false);
    expect(p.hoursRemaining).toBeLessThan(60);
    expect(events.some((e) => e.type === "Traveled")).toBe(true);
  });

  it("rejects travel when not enough hours remain", () => {
    const game = createInitialGame(defaultConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
    game.players[0].hoursRemaining = 0.1;
    const { state, events } = reduce(game, { type: "TravelTo", locationId: "factory" }, defaultConfig);
    expect(state.players[0].locationId).toBe("lowCostHousing");
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/travel.test.ts`
Expected: FAIL — cannot find `../src/travel.js`.

- [ ] **Step 3: Implement travel**

`packages/core/src/travel.ts`:
```ts
import type { GameConfig } from "@jones/config";

export function travelHours(config: GameConfig, fromId: string, toId: string): number {
  const from = config.locations.find((l) => l.id === fromId);
  const to = config.locations.find((l) => l.id === toId);
  if (!from || !to) throw new Error(`unknown location: ${fromId} or ${toId}`);
  const size = config.constants.ringSize;
  const raw = Math.abs(from.ringIndex - to.ringIndex);
  const steps = Math.min(raw, size - raw);
  return steps * config.constants.hoursPerRingStep;
}
```

- [ ] **Step 4: Implement the reducer with TravelTo only**

`packages/core/src/reduce.ts`:
```ts
import type { GameConfig } from "@jones/config";
import type { Command, GameEvent, GameState, PlayerState, ReduceResult } from "./types.js";
import { travelHours } from "./travel.js";

function current(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

/** Returns a deep-ish clone safe to mutate for the current player. */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, clothing: { ...p.clothing }, degrees: [...p.degrees], goals: { ...p.goals } })),
    rng: { ...state.rng },
    winners: [...state.winners],
  };
}

export function reduce(state: GameState, command: Command, config: GameConfig): ReduceResult {
  const events: GameEvent[] = [];
  const next = cloneState(state);
  const p = current(next);

  switch (command.type) {
    case "TravelTo": {
      if (p.insideBuilding) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "must exit building before traveling" });
        break;
      }
      const hours = travelHours(config, p.locationId, command.locationId);
      if (hours > p.hoursRemaining) {
        events.push({ type: "NotEnoughTime", playerId: p.id, action: "TravelTo" });
        break;
      }
      p.hoursRemaining -= hours;
      p.locationId = command.locationId;
      events.push({ type: "Traveled", playerId: p.id, toLocationId: command.locationId, hoursSpent: hours });
      break;
    }
    default:
      events.push({ type: "InvalidAction", playerId: p.id, reason: `unhandled command ${command.type}` });
  }

  return { state: next, events };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/travel.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 6: Export and commit**

Append to `packages/core/src/index.ts`:
```ts
export * from "./travel.js";
export * from "./reduce.js";
```

```bash
git add packages/core/src/travel.ts packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/travel.test.ts
git commit -m "feat(core): add ring travel model and TravelTo command"
```

---

## Task 7: Enter / Exit building

**Files:**
- Modify: `packages/core/src/reduce.ts`
- Test: `packages/core/test/travel.test.ts` (extend) — add a new test file `packages/core/test/building.test.ts`

- [ ] **Step 1: Write the failing test**

`packages/core/test/building.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";

function gameAt(locationId: string) {
  const g = createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  g.players[0].locationId = locationId;
  return g;
}

describe("EnterBuilding / ExitBuilding", () => {
  it("entering costs 2 hours and sets insideBuilding", () => {
    const { state } = reduce(gameAt("bank"), { type: "EnterBuilding" }, defaultConfig);
    expect(state.players[0].insideBuilding).toBe(true);
    expect(state.players[0].hoursRemaining).toBe(58);
  });

  it("cannot enter when already inside", () => {
    const g = gameAt("bank");
    const after = reduce(g, { type: "EnterBuilding" }, defaultConfig).state;
    const { events } = reduce(after, { type: "EnterBuilding" }, defaultConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("exiting is free and clears insideBuilding", () => {
    const g = gameAt("bank");
    const inside = reduce(g, { type: "EnterBuilding" }, defaultConfig).state;
    const { state, events } = reduce(inside, { type: "ExitBuilding" }, defaultConfig);
    expect(state.players[0].insideBuilding).toBe(false);
    expect(state.players[0].hoursRemaining).toBe(58);
    expect(events.some((e) => e.type === "ExitedBuilding")).toBe(true);
  });

  it("cannot enter with insufficient hours", () => {
    const g = gameAt("bank");
    g.players[0].hoursRemaining = 1;
    const { events } = reduce(g, { type: "EnterBuilding" }, defaultConfig);
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/building.test.ts`
Expected: FAIL — `EnterBuilding`/`ExitBuilding` fall through to InvalidAction (the enter/cost assertions fail).

- [ ] **Step 3: Add cases to the reducer**

In `packages/core/src/reduce.ts`, add these two `case` blocks inside the `switch`, immediately after the `TravelTo` block:
```ts
    case "EnterBuilding": {
      if (p.insideBuilding) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "already inside" });
        break;
      }
      const cost = config.actionCosts.enterLocation;
      if (cost > p.hoursRemaining) {
        events.push({ type: "NotEnoughTime", playerId: p.id, action: "EnterBuilding" });
        break;
      }
      p.hoursRemaining -= cost;
      p.insideBuilding = true;
      events.push({ type: "EnteredBuilding", playerId: p.id, locationId: p.locationId });
      break;
    }
    case "ExitBuilding": {
      if (!p.insideBuilding) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "not inside" });
        break;
      }
      p.insideBuilding = false;
      events.push({ type: "ExitedBuilding", playerId: p.id, locationId: p.locationId });
      break;
    }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/building.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/core/src/reduce.ts packages/core/test/building.test.ts
git commit -m "feat(core): add EnterBuilding/ExitBuilding commands"
```

---

## Task 8: Work command

**Files:**
- Create: `packages/core/src/work.ts`
- Modify: `packages/core/src/reduce.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/reduce.work.test.ts`

Implements §6: must be inside the job's workplace, own the uniform, not be over-time; pays `8 × wage` (prorated if <6h left); +1 exp/+1 dep up to caps; fired if `dependibility < reqDependibility − 5`.

- [ ] **Step 1: Write the failing test**

`packages/core/test/reduce.work.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";

function workingGame() {
  const g = createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  const p = g.players[0];
  p.jobId = "zMart.clerk"; // wage base 5, casual uniform, reqDep 10
  p.wage = 5;
  p.maxExperience = 30;
  p.maxDependibility = 30;
  p.dependibility = 12;
  p.locationId = "zMart";
  p.insideBuilding = true;
  return g;
}

describe("Work", () => {
  it("pays 8x wage for a full session and grows exp/dep", () => {
    const { state, events } = reduce(workingGame(), { type: "Work" }, defaultConfig);
    const p = state.players[0];
    expect(p.cash).toBe(200 + 8 * 5);     // 240
    expect(p.hoursRemaining).toBe(54);    // 60 - 6
    expect(p.experience).toBe(11);
    expect(p.dependibility).toBe(13);
    expect(events.some((e) => e.type === "Worked")).toBe(true);
  });

  it("prorates pay when fewer than 6 hours remain", () => {
    const g = workingGame();
    g.players[0].hoursRemaining = 3;
    const { state } = reduce(g, { type: "Work" }, defaultConfig);
    // 8 * 5 * 3 / 6 = 20
    expect(state.players[0].cash).toBe(220);
    expect(state.players[0].hoursRemaining).toBe(0);
  });

  it("does not exceed exp/dep caps", () => {
    const g = workingGame();
    g.players[0].experience = 30;     // at cap
    g.players[0].dependibility = 30;  // at cap
    const { state } = reduce(g, { type: "Work" }, defaultConfig);
    expect(state.players[0].experience).toBe(30);
    expect(state.players[0].dependibility).toBe(30);
  });

  it("fires the player when dependibility is 5+ below the requirement", () => {
    const g = workingGame();
    g.players[0].dependibility = 4; // reqDep 10, minimum = 5 → 4 < 5 fires
    const { state, events } = reduce(g, { type: "Work" }, defaultConfig);
    expect(state.players[0].jobId).toBeNull();
    expect(state.players[0].wage).toBe(0);
    expect(events.some((e) => e.type === "Fired")).toBe(true);
  });

  it("refuses to work without the required uniform", () => {
    const g = workingGame();
    g.players[0].clothing.casual = 0; // no casual clothes
    const { state, events } = reduce(g, { type: "Work" }, defaultConfig);
    expect(state.players[0].cash).toBe(200);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("refuses to work when not at the job's workplace", () => {
    const g = workingGame();
    g.players[0].locationId = "bank"; // wrong workplace
    const { events } = reduce(g, { type: "Work" }, defaultConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/reduce.work.test.ts`
Expected: FAIL — Work falls through to InvalidAction; assertions fail.

- [ ] **Step 3: Implement work helpers**

`packages/core/src/work.ts`:
```ts
import type { GameConfig, JobDef, UniformLevel } from "@jones/config";
import type { PlayerState } from "./types.js";

const UNIFORM_RANK: Record<UniformLevel, number> = { casual: 0, dress: 1, business: 2 };

/** Highest uniform level the player currently has clothing weeks for (§11). */
export function bestUniform(p: PlayerState): UniformLevel | null {
  if (p.clothing.business > 0) return "business";
  if (p.clothing.dress > 0) return "dress";
  if (p.clothing.casual > 0) return "casual";
  return null;
}

export function meetsUniform(p: PlayerState, required: UniformLevel): boolean {
  const best = bestUniform(p);
  if (best === null) return false;
  return UNIFORM_RANK[best] >= UNIFORM_RANK[required];
}

export function findJob(config: GameConfig, jobId: string): JobDef {
  const job = config.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`unknown job ${jobId}`);
  return job;
}
```

- [ ] **Step 4: Add the Work case to the reducer**

In `packages/core/src/reduce.ts`, add imports at the top:
```ts
import { findJob, meetsUniform } from "./work.js";
```
Then add this `case` inside the `switch`, after `ExitBuilding`:
```ts
    case "Work": {
      if (p.jobId === null) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
        break;
      }
      const job = findJob(config, p.jobId);
      if (!p.insideBuilding || p.locationId !== job.locationId) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "not at workplace" });
        break;
      }
      if (p.hoursRemaining <= 0) {
        events.push({ type: "NotEnoughTime", playerId: p.id, action: "Work" });
        break;
      }
      // §6: fired if dependibility is 5+ below requirement.
      if (p.dependibility < job.reqDependibility - 5) {
        const firedJobId = p.jobId;
        p.jobId = null;
        p.wage = 0;
        events.push({ type: "Fired", playerId: p.id, jobId: firedJobId });
        break;
      }
      if (!meetsUniform(p, job.uniform)) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "missing uniform" });
        break;
      }
      const fullHours = config.actionCosts.work;
      const hours = Math.min(fullHours, p.hoursRemaining);
      const earned = Math.floor((config.constants.workWageMultiplier * p.wage * hours) / fullHours);
      p.cash += earned;
      p.hoursRemaining -= hours;
      if (p.experience < p.maxExperience) p.experience += 1;
      if (p.dependibility < p.maxDependibility) p.dependibility += 1;
      events.push({ type: "Worked", playerId: p.id, earned });
      break;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/reduce.work.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 6: Export and commit**

Append to `packages/core/src/index.ts`:
```ts
export * from "./work.js";
```

```bash
git add packages/core/src/work.ts packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/reduce.work.test.ts
git commit -m "feat(core): add Work command with pay, stat gain, firing, uniform check"
```

---

## Task 9: End turn, start-of-turn sequence, week advance

**Files:**
- Create: `packages/core/src/turn.ts`
- Modify: `packages/core/src/reduce.ts`, `packages/core/src/index.ts`
- Test: `packages/core/test/turn.test.ts`

Implements the EndTurn command and a (subset) start-of-turn sequence per §2:
advance to the next player; when wrapping past the last player, advance the week and
apply per-week start effects to the player about to act: **degrade relaxation (−1, min
10), decrement clothing weeks by 1 each (min 0), apply dependibility weekly decay (−3,
min 0), reset position to home with full hours, then run the win check.**

> Note: the full ordered sequence (economy, weekend, lottery, events…) is layered in
> later plans. This task installs the loop and the deterministic per-week effects so a
> game can run for many weeks and someone can win.

- [ ] **Step 1: Write the failing test**

`packages/core/test/turn.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";

function twoPlayerGame() {
  return createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    { name: "B", isAI: true, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
}

describe("EndTurn", () => {
  it("passes control to the next player without advancing the week", () => {
    const { state, events } = reduce(twoPlayerGame(), { type: "EndTurn" }, defaultConfig);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.week).toBe(1);
    expect(events.some((e) => e.type === "TurnEnded")).toBe(true);
    expect(events.some((e) => e.type === "WeekAdvanced")).toBe(false);
  });

  it("advances the week and applies per-week effects when wrapping", () => {
    let g = twoPlayerGame();
    g.players[0].relaxation = 10;
    g.players[0].dependibility = 20;
    g.players[0].clothing.casual = 6;
    g = reduce(g, { type: "EndTurn" }, defaultConfig).state; // -> player B
    const { state, events } = reduce(g, { type: "EndTurn" }, defaultConfig); // wrap -> week 2, player A
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.week).toBe(2);
    const a = state.players[0];
    expect(a.relaxation).toBe(10);          // -1 but floored at 10
    expect(a.dependibility).toBe(17);        // 20 - 3
    expect(a.clothing.casual).toBe(5);       // 6 - 1
    expect(a.hoursRemaining).toBe(60);       // reset
    expect(a.locationId).toBe("lowCostHousing");
    expect(a.insideBuilding).toBe(false);
    expect(events.some((e) => e.type === "WeekAdvanced")).toBe(true);
  });

  it("emits PlayerWon and ends the game when the active player has met goals at turn start", () => {
    let g = twoPlayerGame();
    // Make player A already winning; relaxation/dep decay must not block the win.
    g.players[0].cash = 1000;        // wealth 10
    g.players[0].happiness = 50;
    g.players[0].degrees = ["juniorCollege"]; // education 10
    g.players[0].jobId = "zMart.clerk"; g.players[0].dependibility = 80; // career stays >=10 after -3
    g = reduce(g, { type: "EndTurn" }, defaultConfig).state;      // -> B
    const { state, events } = reduce(g, { type: "EndTurn" }, defaultConfig); // wrap -> A, win check
    expect(events.some((e) => e.type === "PlayerWon")).toBe(true);
    expect(state.status).toBe("ended");
    expect(state.winners).toContain("p0");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run packages/core/test/turn.test.ts`
Expected: FAIL — EndTurn falls through to InvalidAction.

- [ ] **Step 3: Implement the turn module**

`packages/core/src/turn.ts`:
```ts
import type { GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { hasWon } from "./goals.js";

/** §2 per-week start effects applied to the player about to take their turn. */
export function applyStartOfWeek(p: PlayerState, config: GameConfig): void {
  // Degrade relaxation (-1, min 10).
  p.relaxation = Math.max(10, p.relaxation - 1);
  // Weekly dependibility decay (-3, min 0).
  p.dependibility = Math.max(0, p.dependibility - config.constants.dependibilityDecayPerWeek);
  // Decrement clothing weeks (min 0).
  p.clothing.casual = Math.max(0, p.clothing.casual - 1);
  p.clothing.dress = Math.max(0, p.clothing.dress - 1);
  p.clothing.business = Math.max(0, p.clothing.business - 1);
  // Reset position + clock.
  p.locationId = config.constants.homeLocationId;
  p.insideBuilding = false;
  p.hoursRemaining = config.constants.hoursPerTurn;
}

/**
 * Advances control to the next player. When wrapping past the last player,
 * increments the week. Then runs per-week effects + win check for the player
 * who is about to act. Mutates `state`; pushes events.
 */
export function advanceTurn(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const wasLast = state.currentPlayerIndex === state.players.length - 1;
  state.currentPlayerIndex = wasLast ? 0 : state.currentPlayerIndex + 1;
  if (wasLast) {
    state.week += 1;
    events.push({ type: "WeekAdvanced", week: state.week });
  }
  const upNext = state.players[state.currentPlayerIndex];
  applyStartOfWeek(upNext, config);
  if (hasWon(upNext)) {
    if (!state.winners.includes(upNext.id)) state.winners.push(upNext.id);
    state.status = "ended";
    events.push({ type: "PlayerWon", playerId: upNext.id });
  }
}
```

- [ ] **Step 4: Wire EndTurn into the reducer**

In `packages/core/src/reduce.ts`, add the import:
```ts
import { advanceTurn } from "./turn.js";
```
Add this `case` inside the `switch`, after `Work`:
```ts
    case "EndTurn": {
      events.push({ type: "TurnEnded", playerId: p.id });
      advanceTurn(next, config, events);
      break;
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm vitest run packages/core/test/turn.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Export and commit**

Append to `packages/core/src/index.ts`:
```ts
export * from "./turn.js";
```

```bash
git add packages/core/src/turn.ts packages/core/src/reduce.ts packages/core/src/index.ts packages/core/test/turn.test.ts
git commit -m "feat(core): add EndTurn, per-week effects, and week-advance win check"
```

---

## Task 10: Headless end-to-end game

**Files:**
- Create: `packages/core/test/integration.game.test.ts`
- Create: `packages/core/runner/headless.ts`

- [ ] **Step 1: Write the failing integration test**

`packages/core/test/integration.game.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { Command, GameState } from "../src/types.js";

function run(state: GameState, commands: Command[]): GameState {
  let s = state;
  for (const c of commands) {
    s = reduce(s, c, defaultConfig).state;
  }
  return s;
}

describe("headless game", () => {
  it("a solo player can travel to Z-Mart, get hired implicitly, and earn money", () => {
    const game = createInitialGame(defaultConfig, 7, [
      { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    // Pre-assign a job (Apply-for-job command arrives in a later plan).
    game.players[0].jobId = "zMart.clerk";
    game.players[0].wage = 5;
    game.players[0].maxExperience = 30;
    game.players[0].maxDependibility = 30;

    const after = run(game, [
      { type: "TravelTo", locationId: "zMart" },
      { type: "EnterBuilding" },
      { type: "Work" },
      { type: "Work" },
    ]);
    expect(after.players[0].cash).toBe(200 + 2 * 8 * 5); // 280
    expect(after.players[0].experience).toBe(12);
  });

  it("is fully deterministic: same seed + same commands ⇒ identical state", () => {
    const setups = [{ name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } }];
    const cmds: Command[] = [
      { type: "TravelTo", locationId: "bank" },
      { type: "EnterBuilding" },
      { type: "ExitBuilding" },
      { type: "EndTurn" },
    ];
    const a = run(createInitialGame(defaultConfig, 99, setups), cmds);
    const b = run(createInitialGame(defaultConfig, 99, setups), cmds);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("runs many weeks without crashing and advances the clock/weeks", () => {
    let game = createInitialGame(defaultConfig, 3, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
      { name: "B", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    for (let i = 0; i < 40; i++) {
      game = reduce(game, { type: "EndTurn" }, defaultConfig).state;
      if (game.status === "ended") break;
    }
    expect(game.week).toBeGreaterThan(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails or passes**

Run: `pnpm vitest run packages/core/test/integration.game.test.ts`
Expected: PASS — all building blocks already exist (this test is the integration guard). If anything fails, fix the offending unit before proceeding.

- [ ] **Step 3: Add a manual headless runner (smoke tool)**

`packages/core/runner/headless.ts`:
```ts
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { Command } from "../src/types.js";

let game = createInitialGame(defaultConfig, 42, [
  { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
]);
game.players[0].jobId = "zMart.clerk";
game.players[0].wage = 5;
game.players[0].maxExperience = 30;
game.players[0].maxDependibility = 30;

const script: Command[] = [
  { type: "TravelTo", locationId: "zMart" },
  { type: "EnterBuilding" },
  { type: "Work" },
  { type: "Work" },
  { type: "ExitBuilding" },
  { type: "EndTurn" },
];

for (const c of script) {
  const { state, events } = reduce(game, c, defaultConfig);
  game = state;
  console.log(c.type, "->", events.map((e) => e.type).join(", "));
}
console.log("week", game.week, "cash", game.players[0].cash, "hours", game.players[0].hoursRemaining);
```

- [ ] **Step 4: Run the headless runner**

Run: `pnpm tsx packages/core/runner/headless.ts`
Expected: prints a line per command and a final summary (e.g. `cash 280`). Confirms the core runs outside tests.

- [ ] **Step 5: Run the full suite**

Run: `pnpm test`
Expected: PASS — all test files green.

- [ ] **Step 6: Commit**

```bash
git add packages/core/test/integration.game.test.ts packages/core/runner/headless.ts
git commit -m "test(core): add headless end-to-end + determinism integration tests"
```

---

## Self-Review notes (addressed)

- **Spec coverage (this plan's slice of M1):** monorepo (design §Architecture) ✓;
  config-as-data with full job table + locations + action costs + goal ranges (ref
  §6/§8/§2/§3) ✓; deterministic seeded RNG + serializable state (design §core) ✓;
  4-goal win check with Career=0-if-unemployed (ref §3, discrepancy #1/#3) ✓; 60-hour
  turns + action costs (ref §2, discrepancy #2) ✓; work pay/stat-caps/firing/uniform
  (ref §6/§11) ✓; turn/week loop + per-week decay (ref §2/§4) ✓; headless determinism
  test (design §testing) ✓.
- **Deferred to later M1 plans (explicitly out of scope here):** dynamic economy
  Index/Reading (ref §5), Apply-for-Job/Raise + "No Openings" luck (ref §6), Study/
  enroll/graduate (ref §7), money systems — bank/loans/stocks/lottery/pawn (ref §9),
  rent/garnishment (ref §10), items/food/clothes-buying (ref §11), random events —
  starvation/doctor/Wild Willy/repairs/weekends/crashes/booms (ref §5/§12). Each gets
  its own plan on these seams. M2 (AI) and M3 (PixiJS/React + audio) follow.
- **Type consistency:** `GameConfig`, `PlayerState`, `Command`, `GameEvent`,
  `reduce()`, `goalScores()`, `hasWon()`, `travelHours()`, `advanceTurn()`,
  `applyStartOfWeek()`, `findJob()`, `meetsUniform()` are defined once and used with
  matching signatures across tasks.
- **No placeholders:** every step ships complete code/commands. The `PLACEHOLDER`
  exports from Task 1 are intentionally overwritten in Tasks 3–4.
```
