import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import { nextInt } from "../src/rng.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

/** Player positioned inside the Employment Office with default stats. */
function applyJobGame(): GameState {
  const g = createInitialGame(testConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  g.players[0].locationId = "employmentOffice";
  g.players[0].insideBuilding = true;
  return g;
}

/**
 * Finds the first seed in 0..99999 where nextInt(rng, 1, 100) satisfies predicate.
 * Used to set game.rng.seed so the luck roll lands exactly where the test expects.
 */
function findSeedForRoll(predicate: (roll: number) => boolean): number {
  for (let s = 0; s <= 99999; s++) {
    if (predicate(nextInt({ seed: s }, 1, 100).value)) return s;
  }
  throw new Error("no matching seed found in 0..99999");
}

describe("ApplyForJob", () => {
  it("Cook: approved (alwaysApproved=true), sets job/wage/experience/happiness", () => {
    const g = applyJobGame();
    const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
    const p = state.players[0];
    expect(p.jobId).toBe("monolithBurgers.cook");
    expect(p.wage).toBe(5);           // adjustedPrice(baseWage=5, reading=0) = 5
    expect(p.raisesReceived).toBe(0);
    expect(p.experience).toBe(12);    // 10 + 2 on hire
    expect(p.happiness).toBe(3);      // +3 on hire
    expect(p.hoursRemaining).toBe(56); // 60 - applyJob(4)
    expect(events.some((e) => e.type === "JobApplied" && e.jobId === "monolithBurgers.cook" && e.wage === 5)).toBe(true);
  });

  it("Cook: always approved even when luck roll would fail for other jobs", () => {
    // luck threshold for default player: 30 + (10+20+10+0)/3 ≈ 43.33
    // find a seed where roll > 43 (would fail luck for non-alwaysApproved)
    const BAD_LUCK_SEED = findSeedForRoll((r) => r > 43);
    const g = applyJobGame();
    g.rng = { seed: BAD_LUCK_SEED };
    const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
    expect(events.some((e) => e.type === "JobApplied")).toBe(true);
    expect(state.players[0].jobId).toBe("monolithBurgers.cook");
  });

  it("denied on stats: experience too low; hours deducted, happiness -1", () => {
    const g = applyJobGame();
    g.players[0].experience = 5; // reqExperience=10 for zMart.clerk
    const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "zMart.clerk" }, testConfig);
    expect(events.some((e) => e.type === "JobDenied" && e.reason === "stats")).toBe(true);
    expect(state.players[0].jobId).toBeNull();
    expect(state.players[0].happiness).toBe(-1);
    expect(state.players[0].hoursRemaining).toBe(56); // hours still charged
  });

  it("denied on luck: roll exceeds luck threshold; hours deducted, happiness -1", () => {
    // luck threshold for default player: floor(30 + (10+20+10)/3) = 43
    // denied if roll > 43
    const LUCK_FAIL_SEED = findSeedForRoll((r) => r > 43);
    const g = applyJobGame();
    g.rng = { seed: LUCK_FAIL_SEED };
    const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "zMart.clerk" }, testConfig);
    expect(events.some((e) => e.type === "JobDenied" && e.reason === "luck")).toBe(true);
    expect(state.players[0].jobId).toBeNull();
    expect(state.players[0].happiness).toBe(-1);
    expect(state.players[0].hoursRemaining).toBe(56);
  });

  it("weeks 1-4: dep gate suppressed; player hired even with dep below requirement", () => {
    const g = applyJobGame();
    g.players[0].dependibility = 5; // below reqDependibility=10 for Cook, but week=1
    // Cook is alwaysApproved so luck check is also skipped
    const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
    expect(events.some((e) => e.type === "JobApplied")).toBe(true);
    expect(state.players[0].jobId).toBe("monolithBurgers.cook");
  });

  it("guard: not inside Employment Office → InvalidAction, no hour cost", () => {
    const g = applyJobGame();
    g.players[0].insideBuilding = false;
    const { state, events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
    expect(state.players[0].hoursRemaining).toBe(60); // no cost
  });

  it("guard: not enough hours → NotEnoughTime", () => {
    const g = applyJobGame();
    g.players[0].hoursRemaining = 3; // below applyJob cost = 4
    const { events } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });

  it("guard: unknown jobId → InvalidAction", () => {
    const g = applyJobGame();
    const { events } = reduce(g, { type: "ApplyForJob", jobId: "does.not.exist" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction" && e.reason === "unknown job")).toBe(true);
  });

  it("sets stat caps on hire: maxDep = initialDep + reqDep + 5*degrees", () => {
    const g = applyJobGame();
    const { state } = reduce(g, { type: "ApplyForJob", jobId: "monolithBurgers.cook" }, testConfig);
    // Cook: reqDependibility=10, player has no degrees
    // maxDep = 20 + 10 + 5*0 = 30; maxExp = 10 + 0 + 5*0 = 10
    expect(state.players[0].maxDependibility).toBe(30);
    expect(state.players[0].maxExperience).toBe(10);
  });
});

describe("RequestRaise", () => {
  function raisedGame(overrides: { wage?: number; raisesReceived?: number; dep?: number } = {}): GameState {
    const g = applyJobGame();
    g.players[0].jobId = "monolithBurgers.cook";
    g.players[0].wage = overrides.wage ?? 3;       // below baseWage=5 so raise is offered
    g.players[0].raisesReceived = overrides.raisesReceived ?? 0;
    g.players[0].dependibility = overrides.dep ?? 20;
    return g;
  }

  it("granted: wage updated, raisesReceived incremented, happiness +3", () => {
    // offeredWage = adjustedPrice(baseWage=5, reading=0) = 5; p.wage=3 < 5 → raise approved
    // dep gate: 20 >= reqDep(10) + 5*raisesReceived(0) = 10 → passes
    const { state, events } = reduce(raisedGame(), { type: "RequestRaise" }, testConfig);
    const p = state.players[0];
    expect(p.wage).toBe(5);
    expect(p.raisesReceived).toBe(1);
    expect(p.happiness).toBe(3);
    expect(events.some((e) => e.type === "RaiseGranted" && e.newWage === 5)).toBe(true);
  });

  it("denied (no-higher-offer): offered wage ≤ current wage", () => {
    // wage=5, offeredWage=5 → not higher → denied
    const g = raisedGame({ wage: 5 });
    const { state, events } = reduce(g, { type: "RequestRaise" }, testConfig);
    expect(events.some((e) => e.type === "RaiseDenied" && e.reason === "no-higher-offer")).toBe(true);
    expect(state.players[0].wage).toBe(5); // unchanged
  });

  it("denied (stats): dep too low for nth raise, happiness -1", () => {
    // raisesReceived=1: dep must be >= reqDep(10) + 5*1 = 15; player dep=14 → fails
    const g = raisedGame({ wage: 3, raisesReceived: 1, dep: 14 });
    const { state, events } = reduce(g, { type: "RequestRaise" }, testConfig);
    expect(events.some((e) => e.type === "RaiseDenied" && e.reason === "stats")).toBe(true);
    expect(state.players[0].happiness).toBe(-1);
    expect(state.players[0].wage).toBe(3); // unchanged
  });

  it("guard: not inside Employment Office → InvalidAction", () => {
    const g = raisedGame();
    g.players[0].insideBuilding = false;
    const { events } = reduce(g, { type: "RequestRaise" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("guard: no job → InvalidAction", () => {
    const g = applyJobGame(); // no job
    const { events } = reduce(g, { type: "RequestRaise" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction" && e.reason === "no job")).toBe(true);
  });

  it("guard: not enough hours → NotEnoughTime", () => {
    const g = raisedGame();
    g.players[0].hoursRemaining = 3;
    const { events } = reduce(g, { type: "RequestRaise" }, testConfig);
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });
});

describe("QuitJob", () => {
  function employedGame(): GameState {
    const g = applyJobGame();
    g.players[0].jobId = "monolithBurgers.cook";
    g.players[0].wage = 5;
    g.players[0].raisesReceived = 2;
    return g;
  }

  it("clears job, wage, raisesReceived; happiness -2; emits JobQuit", () => {
    const { state, events } = reduce(employedGame(), { type: "QuitJob" }, testConfig);
    const p = state.players[0];
    expect(p.jobId).toBeNull();
    expect(p.wage).toBe(0);
    expect(p.raisesReceived).toBe(0);
    expect(p.happiness).toBe(-2);
    expect(events.some((e) => e.type === "JobQuit" && e.jobId === "monolithBurgers.cook")).toBe(true);
  });

  it("no location requirement — works from anywhere", () => {
    const g = employedGame();
    g.players[0].locationId = "zMart";
    g.players[0].insideBuilding = false;
    const { events } = reduce(g, { type: "QuitJob" }, testConfig);
    expect(events.some((e) => e.type === "JobQuit")).toBe(true);
  });

  it("guard: no job → InvalidAction", () => {
    const { events } = reduce(applyJobGame(), { type: "QuitJob" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction" && e.reason === "no job")).toBe(true);
  });
});
