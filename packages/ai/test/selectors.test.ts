import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "@jones/core";
import type { GameState, PlayerState } from "@jones/core";
import { findPlayer, weakestGoal, canAfford, hasHours, atLocation, isInside } from "../src/selectors.js";

function solo(): GameState {
  return createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
  ]);
}

describe("findPlayer", () => {
  it("returns the player by id", () => {
    const s = solo();
    expect(findPlayer(s, "p0").id).toBe("p0");
  });
  it("throws on unknown id", () => {
    expect(() => findPlayer(solo(), "nope")).toThrow();
  });
});

describe("weakestGoal", () => {
  const w = { wealth: 1, happiness: 1, education: 1, career: 1 };

  it("returns null when all goals are met", () => {
    const p = solo().players[0];
    p.goals = { wealth: 0, happiness: 0, education: 1, career: 0 }; // education score is 1 at start
    expect(weakestGoal(p, w)).toBeNull();
  });

  it("picks the goal with the lowest progress ratio", () => {
    const p = solo().players[0];
    // scores at start: wealth=floor(cash/100), happiness=0, education=1, career=0
    p.cash = 100000; // wealth score very high
    p.happiness = 50;
    p.goals = { wealth: 100, happiness: 100, education: 100, career: 100 };
    // happiness 50/100=0.5, education 1/100=0.01, career 0/100=0 -> career weakest
    expect(weakestGoal(p, w)).toBe("career");
  });

  it("weights bias selection toward higher-weighted goals", () => {
    const p = solo().players[0];
    p.happiness = 40; // 0.4
    p.cash = 5000;    // wealth score 50 -> 0.5
    p.goals = { wealth: 100, happiness: 100, education: 1, career: 0 };
    // even weights -> happiness (0.4) weakest. Weight wealth heavily -> wealth chosen.
    expect(weakestGoal(p, { wealth: 5, happiness: 1, education: 1, career: 1 })).toBe("wealth");
  });
});

describe("feasibility predicates", () => {
  it("canAfford / hasHours / atLocation / isInside", () => {
    const p = { cash: 100, hoursRemaining: 10, locationId: "bank", insideBuilding: true } as PlayerState;
    expect(canAfford(p, 100)).toBe(true);
    expect(canAfford(p, 101)).toBe(false);
    expect(hasHours(p, 10)).toBe(true);
    expect(hasHours(p, 11)).toBe(false);
    expect(atLocation(p, "bank")).toBe(true);
    expect(atLocation(p, "zMart")).toBe(false);
    expect(isInside(p)).toBe(true);
  });
});
