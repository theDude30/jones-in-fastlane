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
