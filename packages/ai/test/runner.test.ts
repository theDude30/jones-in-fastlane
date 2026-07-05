import { describe, it, expect } from "vitest";
import { defaultConfig, aiDifficulty } from "@jones/config";
import { createInitialGame } from "@jones/core";
import type { GameState, Command } from "@jones/core";
import type { Agent } from "../src/index.js";
import { makeAgent } from "../src/agent.js";
import { playGame } from "../src/runner.js";

function game(): GameState {
  return createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
  ]);
}

describe("makeAgent", () => {
  it("builds a random agent for the easy preset and a budget agent otherwise", () => {
    const easy = makeAgent(aiDifficulty.easy, defaultConfig, 1, 0);
    const hard = makeAgent(aiDifficulty.hard, defaultConfig, 1, 0);
    expect(easy.constructor.name).toBe("RandomPlanner");
    expect(hard.constructor.name).toBe("BudgetPlanner");
  });
});

describe("playGame", () => {
  it("force-ends a turn when an agent never returns EndTurn", () => {
    // A stalling agent that always tries to ExitBuilding (a no-op-ish legal churn).
    const staller: Agent = { nextCommand: () => ({ type: "ExitBuilding" } as Command) };
    const result = playGame(defaultConfig, game(), [{ playerId: "p0", agent: staller }], {
      maxWeeks: 3,
      maxCommandsPerTurn: 10,
    });
    expect(result.weeks).toBeGreaterThanOrEqual(3);
  });

  it("terminates at maxWeeks when no one wins", () => {
    const result = playGame(defaultConfig, game(), [{ playerId: "p0", agent: makeAgent(aiDifficulty.easy, defaultConfig, 1, 0) }], {
      maxWeeks: 5,
    });
    expect(result.weeks).toBeLessThanOrEqual(5);
    expect(["playing", "ended"]).toContain(result.state.status);
  });

  it("stops at a human (null-agent) seat", () => {
    const result = playGame(defaultConfig, game(), [{ playerId: "p0", agent: null }], { maxWeeks: 5 });
    expect(result.weeks).toBe(1); // never advanced past the human seat
  });
});
