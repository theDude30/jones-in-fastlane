import { describe, it, expect } from "vitest";
import { createInitialGame } from "@jones/core";
import { defaultConfig } from "@jones/config";
import { resolveClick } from "../../src/board/resolveClick.js";

function player(locationId: string, insideBuilding: boolean) {
  const g = createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
  g.players[0].locationId = locationId;
  g.players[0].insideBuilding = insideBuilding;
  return g.players[0];
}

describe("resolveClick", () => {
  it("travels when clicking a different location while outside", () => {
    expect(resolveClick("bank", player("zMart", false))).toEqual({
      type: "TravelTo",
      locationId: "bank",
    });
  });

  it("enters when clicking the current location while outside", () => {
    expect(resolveClick("zMart", player("zMart", false))).toEqual({ type: "EnterBuilding" });
  });

  it("exits when clicking the current location while inside", () => {
    expect(resolveClick("zMart", player("zMart", true))).toEqual({ type: "ExitBuilding" });
  });
});
