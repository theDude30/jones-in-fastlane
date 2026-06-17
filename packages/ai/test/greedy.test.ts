import { describe, it, expect } from "vitest";
import { defaultConfig, aiDifficulty } from "@jones/config";
import { createInitialGame, reduce } from "@jones/core";
import type { GameState } from "@jones/core";
import { GreedyPlanner } from "../src/greedy.js";

const HARD = aiDifficulty.hard; // greedy, epsilon 0

function solo(goals = { wealth: 100, happiness: 100, education: 100, career: 100 }): GameState {
  return createInitialGame(defaultConfig, 1, [{ name: "A", isAI: true, goals }]);
}

describe("GreedyPlanner", () => {
  it("ends the turn when all goals are met", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "EndTurn" });
  });

  it("never produces InvalidAction over a full turn", () => {
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    let s = solo();
    for (let i = 0; i < 30; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
      if (cmd.type === "EndTurn") break;
    }
  });

  it("pursues education by heading toward the university when education is weakest", () => {
    // Make education the only unmet goal so the greedy choice is unambiguous.
    const s = solo({ wealth: 0, happiness: 0, education: 100, career: 0 });
    s.players[0].cash = 5000; // can afford enrollment
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    // From home + outside, the first move toward enrolling is to travel to hiTechU.
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "TravelTo", locationId: "hiTechU" });
  });

  it("works when employed and at the workplace and wealth/career is weakest", () => {
    const s = solo({ wealth: 100, happiness: 0, education: 1, career: 100 });
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "Work" });
  });

  it("epsilon=1 always takes a legal random action", () => {
    const preset = { planner: "greedy" as const, weights: HARD.weights, epsilon: 1 };
    const planner = new GreedyPlanner(5, preset, defaultConfig);
    let s = solo();
    for (let i = 0; i < 20; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = new GreedyPlanner(11, aiDifficulty.medium, defaultConfig);
    const b = new GreedyPlanner(11, aiDifficulty.medium, defaultConfig);
    const s = solo();
    for (let i = 0; i < 20; i++) expect(a.nextCommand(s, "p0")).toEqual(b.nextCommand(s, "p0"));
  });
});
