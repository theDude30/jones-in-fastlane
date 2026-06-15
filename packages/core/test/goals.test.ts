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
