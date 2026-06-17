import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";

function twoPlayerGame() {
  return createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    { name: "B", isAI: true, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
}

describe("EndTurn", () => {
  it("passes control to the next player without advancing the week", () => {
    const { state, events } = reduce(twoPlayerGame(), { type: "EndTurn" }, defaultConfig);
    expect(state.currentPlayerIndex).toBe(1);
    expect(state.week).toBe(1);
    expect(events.some((e) => e.type === "TurnEnded")).toBe(true);
    expect(events.some((e) => e.type === "WeekAdvanced")).toBe(false);
  });

  it("advances the week and applies per-week effects when wrapping", () => {
    let g = twoPlayerGame();
    g.players[0].relaxation = 10;
    g.players[0].dependibility = 20;
    g.players[0].clothing.casual = 6;
    g.players[0].fastFood = 1; // avoid Starvation so this test's other assertions stay isolated
    g = reduce(g, { type: "EndTurn" }, defaultConfig).state; // -> player B
    const { state, events } = reduce(g, { type: "EndTurn" }, defaultConfig); // wrap -> week 2, player A
    expect(state.currentPlayerIndex).toBe(0);
    expect(state.week).toBe(2);
    const a = state.players[0];
    expect(a.relaxation).toBe(10);          // -1 but floored at 10
    expect(a.dependibility).toBe(17);        // 20 - 3
    expect(a.clothing.casual).toBe(5);       // 6 - 1
    expect(a.hoursRemaining).toBe(60);       // reset
    expect(a.locationId).toBe("lowCostHousing");
    expect(a.insideBuilding).toBe(false);
    expect(events.some((e) => e.type === "WeekAdvanced")).toBe(true);
  });

  it("emits PlayerWon and ends the game when the active player has met goals at turn start", () => {
    let g = twoPlayerGame();
    // Make player A already winning; relaxation/dep decay must not block the win.
    g.players[0].cash = 1000;        // wealth 10
    g.players[0].happiness = 50;
    g.players[0].degrees = ["juniorCollege"]; // education 10
    g.players[0].jobId = "zMart.clerk"; g.players[0].dependibility = 80; // career stays >=10 after -3
    g = reduce(g, { type: "EndTurn" }, defaultConfig).state;      // -> B
    const { state, events } = reduce(g, { type: "EndTurn" }, defaultConfig); // wrap -> A, win check
    expect(events.some((e) => e.type === "PlayerWon")).toBe(true);
    expect(state.status).toBe("ended");
    expect(state.winners).toContain("p0");
  });
});
