import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { travelHours } from "../src/travel.js";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";

describe("travelHours", () => {
  it("is zero between a location and itself", () => {
    expect(travelHours(defaultConfig, "bank", "bank")).toBe(0);
  });

  it("uses the shorter direction around the ring", () => {
    // lowCostHousing(0) -> rentOffice(12): 12 steps clockwise, 1 step the other way.
    const h = travelHours(defaultConfig, "lowCostHousing", "rentOffice");
    expect(h).toBeCloseTo(1 * (10 / 13), 5);
  });

  it("uses the direct distance when it is already the shorter direction", () => {
    // lowCostHousing(0) -> qtClothing(4): 4 steps direct, 9 steps the other way.
    const h = travelHours(defaultConfig, "lowCostHousing", "qtClothing");
    expect(h).toBeCloseTo(4 * (10 / 13), 5);
  });
});

describe("reduce TravelTo", () => {
  it("moves the player and spends hours", () => {
    const game = createInitialGame(defaultConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
    const { state, events } = reduce(game, { type: "TravelTo", locationId: "bank" }, defaultConfig);
    const p = state.players[0];
    expect(p.locationId).toBe("bank");
    expect(p.insideBuilding).toBe(false);
    expect(p.hoursRemaining).toBeLessThan(60);
    expect(events.some((e) => e.type === "Traveled")).toBe(true);
  });

  it("rejects travel when not enough hours remain", () => {
    const game = createInitialGame(defaultConfig, 1, [
      { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ]);
    game.players[0].hoursRemaining = 0.1;
    const { state, events } = reduce(game, { type: "TravelTo", locationId: "factory" }, defaultConfig);
    expect(state.players[0].locationId).toBe("lowCostHousing");
    expect(events.some((e) => e.type === "NotEnoughTime")).toBe(true);
  });
});
