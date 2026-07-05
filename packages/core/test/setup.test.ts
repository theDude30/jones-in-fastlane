import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";

describe("createInitialGame", () => {
  it("creates players at home with starting stats", () => {
    // Seed 2: deliberately chosen so seat 0's one start-of-turn pass (run at
    // creation — bug fix, see setup.ts) hits starvation only, with no Doctor
    // Visit roll firing, keeping this test's expected values deterministic
    // and simple. Every other seat already got this same pass on its own
    // first turn via advanceTurn; seat 0 now does too, at creation.
    const game = createInitialGame(defaultConfig, 2, [
      { name: "Alice", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
      { name: "Jones", isAI: true, goals: { wealth: 30, happiness: 30, education: 30, career: 30 } },
    ]);
    expect(game.players).toHaveLength(2);
    const alice = game.players[0];
    expect(alice.cash).toBe(400); // unaffected: no Doctor Visit fired at this seed
    expect(alice.dependibility).toBe(17); // 20 - dependibilityDecayPerWeek (3)
    expect(alice.experience).toBe(10);
    expect(alice.relaxation).toBe(10); // already at the decay floor
    expect(alice.clothing.casual).toBe(5); // 6 - 1 week's decay
    expect(alice.clothing.dress).toBe(0);
    expect(alice.locationId).toBe("lowCostHousing");
    expect(alice.insideBuilding).toBe(false);
    expect(alice.jobId).toBeNull();
    expect(alice.hoursRemaining).toBe(40); // 60 - starvationHoursLost (20): unfed, no food yet
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
