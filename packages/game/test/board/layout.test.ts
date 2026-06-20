import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import {
  boardLayout,
  boardPathOrder,
  BOARD_ASPECT,
  computeBoardRect,
  toPixelPosition,
} from "../../src/board/layout.js";

describe("boardLayout", () => {
  it("has exactly one entry per configured location, each within [0,1]", () => {
    for (const loc of defaultConfig.locations) {
      const point = boardLayout[loc.id];
      expect(point).toBeDefined();
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.x).toBeLessThanOrEqual(1);
      expect(point.y).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeLessThanOrEqual(1);
    }
    expect(Object.keys(boardLayout)).toHaveLength(defaultConfig.locations.length);
  });
});

describe("boardPathOrder", () => {
  it("lists every location exactly once, in ascending ringIndex order", () => {
    expect(boardPathOrder).toHaveLength(defaultConfig.locations.length);
    const ringIndexes = boardPathOrder.map(
      (id) => defaultConfig.locations.find((l) => l.id === id)!.ringIndex,
    );
    expect(ringIndexes).toEqual([...ringIndexes].sort((a, b) => a - b));
  });
});

describe("computeBoardRect", () => {
  it("letterboxes left/right when the container is wider than the board aspect", () => {
    const rect = computeBoardRect(2000, 500, 16 / 9);
    expect(rect.boardHeight).toBe(500);
    expect(rect.boardWidth).toBeCloseTo(500 * (16 / 9));
    expect(rect.offsetY).toBe(0);
    expect(rect.offsetX).toBeCloseTo((2000 - rect.boardWidth) / 2);
  });

  it("letterboxes top/bottom when the container is taller than the board aspect", () => {
    const rect = computeBoardRect(800, 800, 16 / 9);
    expect(rect.boardWidth).toBe(800);
    expect(rect.boardHeight).toBeCloseTo(800 / (16 / 9));
    expect(rect.offsetX).toBe(0);
    expect(rect.offsetY).toBeCloseTo((800 - rect.boardHeight) / 2);
  });

  it("defaults to BOARD_ASPECT when no aspect is given", () => {
    const a = computeBoardRect(1600, 900);
    const b = computeBoardRect(1600, 900, BOARD_ASPECT);
    expect(a).toEqual(b);
  });
});

describe("toPixelPosition", () => {
  it("maps a fractional point into the rect's pixel space, including its offset", () => {
    const rect = { boardWidth: 200, boardHeight: 100, offsetX: 50, offsetY: 10 };
    expect(toPixelPosition({ x: 0.5, y: 0.5 }, rect)).toEqual({ x: 150, y: 60 });
    expect(toPixelPosition({ x: 0, y: 0 }, rect)).toEqual({ x: 50, y: 10 });
  });
});
