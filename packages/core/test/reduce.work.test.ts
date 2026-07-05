import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import { resetToFreshTurn } from "./testHelpers.js";

function workingGame() {
  const g = createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  resetToFreshTurn(g, defaultConfig, 1);
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
    expect(p.cash).toBe(400 + 8 * 5);     // 440
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
    expect(state.players[0].cash).toBe(420);
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
    expect(state.players[0].cash).toBe(400);
    expect(state.players[0].hoursRemaining).toBe(60);
    expect(state.players[0].experience).toBe(10);
  });

  it("refuses to work without the required uniform", () => {
    const g = workingGame();
    g.players[0].clothing.casual = 0; // no casual clothes
    const { state, events } = reduce(g, { type: "Work" }, defaultConfig);
    expect(state.players[0].cash).toBe(400);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("refuses to work when not at the job's workplace", () => {
    const g = workingGame();
    g.players[0].locationId = "bank"; // wrong workplace
    const { events } = reduce(g, { type: "Work" }, defaultConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });
});
