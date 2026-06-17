import { describe, it, expect } from "vitest";
import { createInitialGame, reduce } from "@jones/core";
import { defaultConfig } from "@jones/config";
import type { Agent } from "../src/index.js";

describe("@jones/ai package wiring", () => {
  it("can import core + config and run a command", () => {
    const state = createInitialGame(defaultConfig, 1, [
      { name: "A", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const { state: s } = reduce(state, { type: "EndTurn" }, defaultConfig);
    expect(s.week).toBe(2);
  });

  it("Agent type is usable", () => {
    const fake: Agent = { nextCommand: () => ({ type: "EndTurn" }) };
    expect(fake.nextCommand({} as never, "p0")).toEqual({ type: "EndTurn" });
  });
});
