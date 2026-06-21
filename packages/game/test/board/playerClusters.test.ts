import { describe, it, expect } from "vitest";
import { createInitialGame } from "@jones/core";
import { defaultConfig } from "@jones/config";
import { clusterPlayersByLocation, fanOffsets } from "../../src/board/playerClusters.js";

function game(opponents: number) {
  return createInitialGame(defaultConfig, 1, [
    { name: "You", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
    ...Array.from({ length: opponents }, (_, i) => ({
      name: `AI ${i + 1}`,
      isAI: true,
      goals: { wealth: 10, happiness: 10, education: 10, career: 10 },
    })),
  ]);
}

describe("clusterPlayersByLocation", () => {
  it("groups players sharing a location together, preserving seat order", () => {
    const g = game(2); // all 3 players start at the same home location by default
    g.players[2].locationId = "zMart"; // AI 2 moves elsewhere
    const clusters = clusterPlayersByLocation(g.players);
    const home = clusters.get(g.players[0].locationId)!;
    expect(home.map((p) => p.id)).toEqual(["p0", "p1"]);
    expect(clusters.get("zMart")!.map((p) => p.id)).toEqual(["p2"]);
    expect(clusters.size).toBe(2);
  });

  it("puts a lone player in their own single-entry cluster", () => {
    const g = game(0);
    const clusters = clusterPlayersByLocation(g.players);
    expect(clusters.get(g.players[0].locationId)).toHaveLength(1);
  });
});

describe("fanOffsets", () => {
  it("returns a single centered offset of 0 for one token", () => {
    expect(fanOffsets(1)).toEqual([0]);
  });

  it("returns symmetric offsets centered at 0 for multiple tokens", () => {
    expect(fanOffsets(2, 10)).toEqual([-5, 5]);
    expect(fanOffsets(3, 10)).toEqual([-10, 0, 10]);
  });
});
