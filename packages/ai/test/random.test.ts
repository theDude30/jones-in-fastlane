import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame, reduce } from "@jones/core";
import type { GameState } from "@jones/core";
import { RandomPlanner } from "../src/random.js";
import { legalCommands } from "../src/selectors.js";

function solo(): GameState {
  return createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
  ]);
}

describe("RandomPlanner", () => {
  it("only ever emits commands from the legal set", () => {
    const planner = new RandomPlanner(123, defaultConfig);
    const s = solo();
    for (let i = 0; i < 50; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const legal = legalCommands(s, "p0", defaultConfig);
      expect(legal.some((c) => JSON.stringify(c) === JSON.stringify(cmd))).toBe(true);
    }
  });

  it("never produces InvalidAction when its commands are applied", () => {
    const planner = new RandomPlanner(7, defaultConfig);
    let s = solo();
    for (let i = 0; i < 100; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = new RandomPlanner(42, defaultConfig);
    const b = new RandomPlanner(42, defaultConfig);
    const s = solo();
    for (let i = 0; i < 20; i++) {
      expect(a.nextCommand(s, "p0")).toEqual(b.nextCommand(s, "p0"));
    }
  });

  it("produces a spread of different commands over many draws", () => {
    const planner = new RandomPlanner(99, defaultConfig);
    const s = solo();
    const seen = new Set<string>();
    for (let i = 0; i < 60; i++) seen.add(planner.nextCommand(s, "p0").type);
    expect(seen.size).toBeGreaterThan(1);
  });
});
