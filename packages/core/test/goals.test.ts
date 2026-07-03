import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { goalScores, hasWon, goalCompletion, leadingPlayer } from "../src/goals.js";

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
