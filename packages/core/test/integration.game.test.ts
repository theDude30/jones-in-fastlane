import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { Command, GameState } from "../src/types.js";

function run(state: GameState, commands: Command[]): GameState {
  let s = state;
  for (const c of commands) {
    s = reduce(s, c, defaultConfig).state;
  }
  return s;
}

describe("headless game", () => {
  it("a solo player can travel to Z-Mart, get hired implicitly, and earn money", () => {
    const game = createInitialGame(defaultConfig, 7, [
      { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    game.players[0].jobId = "zMart.clerk";
    game.players[0].wage = 5;
    game.players[0].maxExperience = 30;
    game.players[0].maxDependibility = 30;

    const after = run(game, [
      { type: "TravelTo", locationId: "zMart" },
      { type: "EnterBuilding" },
      { type: "Work" },
      { type: "Work" },
    ]);
    expect(after.players[0].cash).toBe(200 + 2 * 8 * 5); // 280
    expect(after.players[0].experience).toBe(12);
  });

  it("is fully deterministic: same seed + same commands ⇒ identical state", () => {
    const setups = [{ name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } }];
    const cmds: Command[] = [
      { type: "TravelTo", locationId: "bank" },
      { type: "EnterBuilding" },
      { type: "ExitBuilding" },
      { type: "EndTurn" },
    ];
    const a = run(createInitialGame(defaultConfig, 99, setups), cmds);
    const b = run(createInitialGame(defaultConfig, 99, setups), cmds);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("runs many weeks without crashing and advances the clock/weeks", () => {
    let game = createInitialGame(defaultConfig, 3, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
      { name: "B", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    for (let i = 0; i < 40; i++) {
      game = reduce(game, { type: "EndTurn" }, defaultConfig).state;
      if (game.status === "ended") break;
    }
    expect(game.week).toBeGreaterThan(1);
  });
});
