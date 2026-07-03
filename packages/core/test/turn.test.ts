import { describe, it, expect } from "vitest";
import { defaultConfig, constants } from "@jones/config";
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
    g.players[0].cash = 0; // relaxation sits at the decay floor (10), which is Doctor-Visit-eligible;
    // cash=0 deterministically blocks any visit's effects regardless of the roll, so this
    // test isn't coupled to seed 1 happening to avoid that 20% chance.
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

describe("maxWeeks timed-game cap", () => {
  // A config whose cap is small, so we can drive a game to it quickly.
  const cappedConfig = { ...defaultConfig, constants: { ...constants, maxWeeks: 3 } };

  function cappedTwoPlayerGame() {
    return createInitialGame(cappedConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
      { name: "B", isAI: true, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
  }

  it("ends the game on points once week exceeds maxWeeks, with exactly one winner", () => {
    let g = cappedTwoPlayerGame();
    // Make player A clearly ahead on goal completion (higher happiness), but
    // NOT a full winner, so the cap — not hasWon — decides it.
    g.players[0].happiness = 8;  // ahead
    g.players[1].happiness = 1;  // behind
    // Advance turns until the week ticks past the cap (maxWeeks = 3 -> ends when week becomes 4).
    let events: import("../src/types.js").GameEvent[] = [];
    for (let i = 0; i < 8 && g.status === "playing"; i++) {
      const r = reduce(g, { type: "EndTurn" }, cappedConfig);
      g = r.state;
      events = r.events;
    }
    expect(g.status).toBe("ended");
    expect(g.week).toBe(4);
    expect(g.winners).toHaveLength(1);
    expect(g.winners[0]).toBe("p0");
    expect(events.some((e) => e.type === "GameEndedByTime" && e.winnerId === "p0" && e.week === 4)).toBe(true);
  });

  it("lets a legitimate all-goals victory end the game before the cap fires", () => {
    let g = cappedTwoPlayerGame();
    g.players[0].cash = 1000;                 // wealth 10
    g.players[0].happiness = 50;
    g.players[0].degrees = ["juniorCollege"]; // education 10
    g.players[0].jobId = "zMart.clerk"; g.players[0].dependibility = 80; // career
    g = reduce(g, { type: "EndTurn" }, cappedConfig).state;             // -> B
    const { state, events } = reduce(g, { type: "EndTurn" }, cappedConfig); // wrap -> A, win check at week 2
    expect(events.some((e) => e.type === "PlayerWon")).toBe(true);
    expect(events.some((e) => e.type === "GameEndedByTime")).toBe(false);
    expect(state.week).toBe(2);
    expect(state.winners).toContain("p0");
  });

  it("maxWeeks <= 0 disables the cap (stays playing past 156 weeks with no winner)", () => {
    const noCapConfig = { ...defaultConfig, constants: { ...constants, maxWeeks: 0 } };
    let g = createInitialGame(noCapConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    // Single seat: every EndTurn wraps and advances a week. Run well past 156.
    for (let i = 0; i < 170 && g.status === "playing"; i++) {
      g = reduce(g, { type: "EndTurn" }, noCapConfig).state;
    }
    expect(g.status).toBe("playing");
    expect(g.week).toBeGreaterThan(156);
  });
});
