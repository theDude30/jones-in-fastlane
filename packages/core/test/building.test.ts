import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import { resetToFreshTurn } from "./testHelpers.js";

function gameAt(locationId: string) {
  const g = createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  resetToFreshTurn(g, defaultConfig, 1);
  g.players[0].locationId = locationId;
  return g;
}

describe("EnterBuilding / ExitBuilding", () => {
  it("entering costs 2 hours and sets insideBuilding", () => {
    const { state } = reduce(gameAt("bank"), { type: "EnterBuilding" }, defaultConfig);
    expect(state.players[0].insideBuilding).toBe(true);
    expect(state.players[0].hoursRemaining).toBe(58);
  });

  it("cannot enter when already inside", () => {
    const g = gameAt("bank");
    const after = reduce(g, { type: "EnterBuilding" }, defaultConfig).state;
    const { events } = reduce(after, { type: "EnterBuilding" }, defaultConfig);
    expect(events.some((e) => e.type === "InvalidAction")).toBe(true);
  });

  it("exiting is free and clears insideBuilding", () => {
    const g = gameAt("bank");
    const inside = reduce(g, { type: "EnterBuilding" }, defaultConfig).state;
    const { state, events } = reduce(inside, { type: "ExitBuilding" }, defaultConfig);
    expect(state.players[0].insideBuilding).toBe(false);
    expect(state.players[0].hoursRemaining).toBe(58);
    expect(events.some((e) => e.type === "ExitedBuilding")).toBe(true);
  });

  it("cannot enter with insufficient hours", () => {
    const g = gameAt("bank");
    g.players[0].hoursRemaining = 1;
    const { events } = reduce(g, { type: "EnterBuilding" }, defaultConfig);
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });
});
