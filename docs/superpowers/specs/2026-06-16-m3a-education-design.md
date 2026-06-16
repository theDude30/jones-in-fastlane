# M3a — Education Design

**Date:** 2026-06-16
**Status:** Approved
**Part of:** M3 — Remaining Game Logic (before AI)
**Authoritative rules:** `docs/superpowers/specs/2026-06-15-jones-game-logic-reference.md` §7

---

## Goal

Add the Education subsystem: players enroll in degree programs at Hi-Tech U, study to complete lessons, and graduate to gain permanent stat cap boosts and unlock higher-tier jobs.

---

## Scope

Two new commands (`Enroll`, `Study`), automatic graduation on lesson completion, 11 degrees with prereq chain in config, and `extraCredit` placeholder on `PlayerState` (set to 0 now; M3b will update it when Computer/Books are purchased).

---

## Config additions (`@jones/config`)

### `DegreeDef` (new interface in `types.ts`)

```ts
export interface DegreeDef {
  id: DegreeId;
  name: string;
  prereqs: DegreeId[];  // all must be in p.degrees before enrolling
}
```

### `GameConfig` update

Add `degrees: DegreeDef[]` field.

### `GameConstants` additions

```ts
enrollmentBaseFee: number;          // 50  — economy-adjusted at enroll time
lessonsPerDegree: number;           // 10  — default lessons per degree
minLessonsPerDegree: number;        // 8   — floor after extraCredit reduction
graduateDependibilityBonus: number; // 5   — added to p.dependibility on graduate
graduateMaxCapBonus: number;        // 5   — added to both maxDep and maxExp on graduate
maxEnrollments: number;             // 4   — max active enrollments at once
```

### `degrees.ts` (new file)

All 11 degrees with their prereq chains (from §7):

| DegreeId | Name | Prereqs |
|---|---|---|
| `juniorCollege` | Junior College | — |
| `tradeSchool` | Trade School | — |
| `businessAdmin` | Business Administration | juniorCollege |
| `academic` | Academic | juniorCollege |
| `electronics` | Electronics | tradeSchool |
| `preEngineering` | Pre-Engineering | tradeSchool |
| `engineering` | Engineering | preEngineering |
| `graduateSchool` | Graduate School | academic |
| `postDoctoral` | Post-Doctoral | graduateSchool |
| `research` | Research | postDoctoral |
| `publishing` | Publishing | research |

---

## State additions (`@jones/core`)

### `PlayerState` additions

```ts
enrollments: Array<{ degreeId: DegreeId; lessonsRemaining: number }>;
extraCredit: number;  // 0..2; 0 at game start; updated by M3b on Computer/Book purchase
```

`extraCredit` is read at **enroll time** to set `lessonsRemaining = Math.max(minLessonsPerDegree, lessonsPerDegree - p.extraCredit)`. The count is locked in for that enrollment; buying a Computer after enrolling does not reduce remaining lessons.

### `Command` additions

```ts
| { type: "Enroll"; degreeId: DegreeId }
| { type: "Study"; degreeId: DegreeId }
```

### `GameEvent` additions

```ts
| { type: "Enrolled"; playerId: string; degreeId: DegreeId; fee: number; lessonsRemaining: number }
| { type: "Studied"; playerId: string; degreeId: DegreeId; lessonsRemaining: number }
| { type: "Graduated"; playerId: string; degreeId: DegreeId }
| { type: "NotEnoughMoney"; playerId: string; action: string }
```

---

## Command logic

### `Enroll { degreeId }` — 0 Hours, Cash deducted

Guards checked in order (all emit `InvalidAction` unless noted):

1. Not at Hi-Tech U (`locationId !== "hiTechU"`) or `!insideBuilding` → `InvalidAction { reason: "wrong location" }`
2. Unknown degreeId → `InvalidAction { reason: "unknown degree" }`
3. Player already has the degree (`p.degrees.includes(degreeId)`) → `InvalidAction { reason: "already graduated" }`
4. Player already enrolled in that degree → `InvalidAction { reason: "already enrolled" }`
5. Missing any prereq (`prereqs.some(pr => !p.degrees.includes(pr))`) → `InvalidAction { reason: "no prereq" }`
6. At max enrollments (`p.enrollments.length >= maxEnrollments`) → `InvalidAction { reason: "max enrollments" }`
7. Not enough cash → `NotEnoughMoney { playerId, action: "Enroll" }`

On approval:
- `fee = economy.adjustedPrice(constants.enrollmentBaseFee, state.economy.reading)`
- `p.cash -= fee`
- `lessonsRemaining = Math.max(constants.minLessonsPerDegree, constants.lessonsPerDegree - p.extraCredit)`
- Push `{ degreeId, lessonsRemaining }` to `p.enrollments`
- Emit `Enrolled { playerId, degreeId, fee, lessonsRemaining }`

### `Study { degreeId }` — costs `min(6, hoursRemaining)` Hours

Guards checked in order:

1. Not at Hi-Tech U or `!insideBuilding` → `InvalidAction { reason: "wrong location" }`
2. Not enrolled in degreeId → `InvalidAction { reason: "not enrolled" }`
3. `p.hoursRemaining === 0` → `NotEnoughTime { playerId, action: "Study" }`

On success:
- `p.hoursRemaining -= Math.min(6, p.hoursRemaining)`
- Decrement `enrollment.lessonsRemaining` by 1
- Emit `Studied { playerId, degreeId, lessonsRemaining: enrollment.lessonsRemaining }`

If `lessonsRemaining === 0` (graduation):
- Remove enrollment from `p.enrollments`
- Push `degreeId` to `p.degrees`
- `p.dependibility += constants.graduateDependibilityBonus`
- `p.maxDependibility += constants.graduateMaxCapBonus`
- `p.maxExperience += constants.graduateMaxCapBonus`
- Emit `Graduated { playerId, degreeId }`

---

## File structure

**`@jones/config`:**
- Modify: `packages/config/src/types.ts` — add `DegreeDef`, update `GameConfig` and `GameConstants`
- Create: `packages/config/src/degrees.ts` — all 11 `DegreeDef` entries
- Modify: `packages/config/src/constants.ts` — add education constants
- Modify: `packages/config/src/defaultConfig.ts` — add `degrees`
- Modify: `packages/config/src/index.ts` — export `degrees` and `DegreeDef`

**`@jones/core`:**
- Modify: `packages/core/src/types.ts` — add `enrollments`, `extraCredit` to `PlayerState`; add `Enroll`, `Study` to `Command`; add new `GameEvent` variants
- Modify: `packages/core/src/setup.ts` — init `enrollments: []`, `extraCredit: 0`
- Create: `packages/core/src/education.ts` — `enroll(degreeId, state, config, economy, events)`, `study(degreeId, state, config, events)`
- Modify: `packages/core/src/reduce.ts` — add `Enroll`, `Study` cases; import from `education.ts`
- Modify: `packages/core/src/index.ts` — `export * from "./education.js"`
- Create: `packages/core/test/education.test.ts` — all tests using `constantEconomyConfig`

---

## Testing approach

All tests use `testConfig = { ...defaultConfig, economy: constantEconomyConfig }` so enrollment fees and wages are deterministic (fee = base = 50, no economy adjustment).

Key test scenarios:
- Enroll: approved path (fee deducted, enrollment added, lessonsRemaining correct)
- Enroll: each guard (wrong location, unknown degree, already graduated, already enrolled, missing prereq, max enrollments, not enough cash)
- Enroll: extraCredit=1 reduces lessonsRemaining to 9; extraCredit=2 → 8
- Study: approved path (hours deducted, lessons decremented)
- Study: with <6 hours remaining (lesson still counts, all hours deducted)
- Study: graduation trigger (enrollment removed, degree added, dep/maxCap bumped, Graduated emitted)
- Study: guard failures (wrong location, not enrolled, 0 hours)
- Study: multiple enrollments — Study only advances the specified degree
