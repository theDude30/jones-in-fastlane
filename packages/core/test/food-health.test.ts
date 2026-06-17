import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { applyStartOfWeek } from "../src/turn.js";
import type { GameState } from "../src/types.js";
import { reduce } from "../src/reduce.js";
import { applyFoodAndHealth } from "../src/health.js";
import type { GameEvent } from "../src/types.js";

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

describe("Spoiled Food", () => {
  it("loses all Fresh Food and -2 happiness with no Refrigerator (plus an independent -2 Starvation, since spoilage leaves the player unfed)", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 3;
    p.happiness = 10;
    p.cash = 0;
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.freshFood).toBe(0);
    // -2 Spoiled Food, then -2 Starvation (no fridge consumption possible once spoiled, no fast food):
    // per the game logic reference (§12), "no Refrigerator -> all Fresh Food lost, -2 Happiness,
    // ... Starvation if no Fast Food bought" — both penalties are independent and additive.
    expect(p.happiness).toBe(6);
    expect(events.some((e) => e.type === "FoodSpoiled")).toBe(true);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(true);
  });

  it("does not spoil within capacity (6) when a Refrigerator is owned", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 5;
    p.happiness = 10;
    p.cash = 0;
    p.durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    // 1 unit consumed by Starvation-prevention afterward, but no spoilage/over-capacity loss.
    expect(p.happiness).toBe(10);
    expect(events.some((e) => e.type === "FoodSpoiled")).toBe(false);
  });

  it("loses excess over capacity (-1 happiness) when over a Refrigerator's 6-unit cap", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 9;
    p.happiness = 10;
    p.cash = 0;
    p.durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.happiness).toBe(9);
    expect(events.some((e) => e.type === "FoodSpoiled" && e.excess === 3)).toBe(true);
  });

  it("capacity is 12 with both Refrigerator and Freezer", () => {
    const g = soloGame();
    const p = g.players[0];
    p.freshFood = 11;
    p.happiness = 10;
    p.cash = 0;
    p.durables = [
      { itemId: "refrigeratorZMart", pricePaid: 650 },
      { itemId: "freezerSocket", pricePaid: 513 },
    ];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    // 11 is within the 12-unit cap, no over-capacity loss; 1 consumed by Starvation-prevention.
    expect(p.happiness).toBe(10);
    expect(events.some((e) => e.type === "FoodSpoiled")).toBe(false);
  });
});

describe("Starvation", () => {
  it("loses 20 hours and -2 happiness when not fed (no fast or fresh food)", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 10;
    p.cash = 0;
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.hoursRemaining).toBe(40);
    expect(p.happiness).toBe(8);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(true);
  });

  it("is prevented by Fast Food bought last turn, which is then cleared", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 10;
    p.cash = 0;
    p.fastFood = 1;
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.hoursRemaining).toBe(60);
    expect(p.happiness).toBe(10);
    expect(p.fastFood).toBe(0);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(false);
  });

  it("is prevented by Fresh Food + Refrigerator, consuming 1 unit", () => {
    const g = soloGame();
    const p = g.players[0];
    p.happiness = 10;
    p.cash = 0;
    p.freshFood = 2;
    p.durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const events: GameEvent[] = [];
    applyFoodAndHealth(p, g, testConfig, events);
    expect(p.hoursRemaining).toBe(60);
    expect(p.freshFood).toBe(1);
    expect(events.some((e) => e.type === "PlayerStarved")).toBe(false);
  });
});

/**
 * Finds the first game seed in 0..999 where a Doctor Visit fires within
 * `maxTurns` turns of a single-player game that never buys food. Used
 * because the RNG draws for Doctor Visit are conditional (only rolled
 * when a trigger condition is true), so seed-finding must simulate real
 * turns via `reduce`, not a single nextFloat call.
 */
function findSeedForDoctorVisitWithin(maxTurns: number): number {
  for (let s = 0; s <= 999; s++) {
    let g: GameState = createInitialGame(testConfig, s, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    for (let t = 0; t < maxTurns; t++) {
      const { state, events } = reduce(g, { type: "EndTurn" }, testConfig);
      g = state;
      if (events.some((e) => e.type === "DoctorVisited")) return s;
    }
  }
  throw new Error(`no seed found producing a Doctor Visit within ${maxTurns} turns`);
}

/** Finds a game seed where turn 1 alone (full reduce/EndTurn pipeline) produces no Doctor Visit, for a "no visit" negative test. */
function findSeedForNoDoctorVisit(): number {
  for (let s = 0; s <= 999; s++) {
    const g: GameState = createInitialGame(testConfig, s, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const { events } = reduce(g, { type: "EndTurn" }, testConfig);
    if (!events.some((e) => e.type === "DoctorVisited")) return s;
  }
  throw new Error("no seed found avoiding a Doctor Visit on turn 1");
}

describe("Doctor Visit", () => {
  it("triggers within a few turns of never eating (relaxation sits at the decay floor of 10)", () => {
    const seed = findSeedForDoctorVisitWithin(10);
    const g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const startingHappiness = g.players[0].happiness; // 0 by default (createInitialGame)
    let visited = false;
    let lastState = g;
    for (let t = 0; t < 10 && !visited; t++) {
      const { state, events } = reduce(lastState, { type: "EndTurn" }, testConfig);
      lastState = state;
      if (events.some((e) => e.type === "DoctorVisited")) visited = true;
    }
    expect(visited).toBe(true);
    // Happiness actually eroded from its starting value (Starvation -2/turn, Doctor Visit -4)
    // — not just "is below some arbitrary number," since happiness starts at 0, not 20.
    expect(lastState.players[0].happiness).toBeLessThan(startingHappiness);
  });

  it("never visits when cash is 0, even though a trigger condition is eligible", () => {
    const seed = findSeedForDoctorVisitWithin(1); // a seed where turn-1 alone would trigger a visit
    const g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    g.players[0].cash = 0;
    const { events } = reduce(g, { type: "EndTurn" }, testConfig);
    expect(events.some((e) => e.type === "DoctorVisited")).toBe(false);
  });

  it("can avoid a visit on turn 1 for at least one seed (rolls aren't unconditional)", () => {
    const seed = findSeedForNoDoctorVisit();
    const g: GameState = createInitialGame(testConfig, seed, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const { events } = reduce(g, { type: "EndTurn" }, testConfig);
    expect(events.some((e) => e.type === "DoctorVisited")).toBe(false);
  });
});
