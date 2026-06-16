import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function eduGame(): GameState {
  const g = createInitialGame(testConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  g.players[0].locationId = "hiTechU";
  g.players[0].insideBuilding = true;
  g.players[0].cash = 500;
  return g;
}

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

  it("guard: unknown degreeId → InvalidAction { reason: 'unknown degree' }", () => {
    const g = eduGame();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { events } = reduce(g, { type: "Enroll", degreeId: "doesNotExist" as any }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction" && e.reason === "unknown degree")).toBe(true);
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
    const { events } = reduce(eduGame(), { type: "Enroll", degreeId: "businessAdmin" }, testConfig);
    expect(events.some((e) => e.type === "InvalidAction" && e.reason === "no prereq")).toBe(true);
  });

  it("guard: max enrollments (4) → InvalidAction { reason: 'max enrollments' }", () => {
    const g = eduGame();
    g.players[0].degrees = ["juniorCollege"];
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
    expect(p.dependibility).toBe(25);
    expect(p.maxDependibility).toBe(25);
    expect(p.maxExperience).toBe(15);
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
