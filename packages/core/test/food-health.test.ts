import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { applyStartOfWeek } from "../src/turn.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function soloGame(): GameState {
  return createInitialGame(testConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
}

describe("happyGroupsThisTurn reset (bug fix)", () => {
  it("resets to empty every start-of-week so a happiness-group item can grant its bonus again next turn", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happyGroupsThisTurn = ["fastFood"];
    applyStartOfWeek(p, testConfig);
    expect(p.happyGroupsThisTurn).toEqual([]);
  });
});

describe("Cooking Bonus", () => {
  it("grants +1 happiness if a Stove is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    p.durables = [{ itemId: "stoveZMart", pricePaid: 490 }];
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(6);
  });

  it("grants +1 happiness if a Microwave is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    p.durables = [{ itemId: "microwaveZMart", pricePaid: 220 }];
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(6);
  });

  it("caps at +1 total even if both Stove and Microwave are owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    p.durables = [
      { itemId: "stoveZMart", pricePaid: 490 },
      { itemId: "microwaveZMart", pricePaid: 220 },
    ];
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(6);
  });

  it("does not apply with no Stove or Microwave owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 5;
    applyStartOfWeek(p, testConfig);
    expect(p.happiness).toBe(5);
  });
});

describe("Hot Tub relaxation exemption", () => {
  it("relaxation does not decay below its current value when a Hot Tub is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.relaxation = 30;
    p.durables = [{ itemId: "hotTubSocket", pricePaid: 1255 }];
    applyStartOfWeek(p, testConfig);
    expect(p.relaxation).toBe(30);
  });

  it("relaxation still decays (floored at 10) without a Hot Tub", () => {
    const g = soloGame();
    const p = g.players[0];
    p.relaxation = 30;
    applyStartOfWeek(p, testConfig);
    expect(p.relaxation).toBe(29);
  });
});
