import { defaultConfig } from "@jones/config";

export interface BoardPoint {
  x: number;
  y: number;
}

export interface BoardRect {
  boardWidth: number;
  boardHeight: number;
  offsetX: number;
  offsetY: number;
}

export const BOARD_ASPECT = 16 / 9;

/**
 * Town-map positions per location id, as fractions [0,1] of the board's
 * logical space. Calibrated to sit just outside the paved road loop drawn in
 * `public/board/town-backdrop.png` — a stadium shape (two straights + two
 * semicircles) with centers at pixel (520,555)/(1480,555) in the image's
 * 2000x1121 reference frame, outer road edge radius 445px, buildings placed
 * 10px further out (the image's own top/bottom margin outside the road is
 * much tighter than its left/right margin, which sets the ceiling on this
 * gap — anything larger clips the building card against the top/bottom of
 * the board at the standard card size), evenly spaced by arc length in
 * ringIndex order starting at the top straight. Re-derive with
 * `node /tmp/compute-layout.mjs` (or recreate that script) if the backdrop
 * art or CARD_WIDTH/CARD_HEIGHT changes.
 */
export const boardLayout: Record<string, BoardPoint> = {
  lowCostHousing: { x: 0.260, y: 0.089 },
  pawnShop: { x: 0.444, y: 0.089 },
  zMart: { x: 0.628, y: 0.089 },
  monolithBurgers: { x: 0.810, y: 0.109 },
  qtClothing: { x: 0.945, y: 0.319 },
  socketCity: { x: 0.953, y: 0.638 },
  hiTechU: { x: 0.829, y: 0.868 },
  employmentOffice: { x: 0.648, y: 0.901 },
  factory: { x: 0.464, y: 0.901 },
  bank: { x: 0.280, y: 0.901 },
  blacksMarket: { x: 0.110, y: 0.801 },
  securityApartments: { x: 0.033, y: 0.513 },
  rentOffice: { x: 0.096, y: 0.215 },
};

/** Every location id, in ring-travel order, for drawing the connecting path. */
export const boardPathOrder: string[] = [...defaultConfig.locations]
  .sort((a, b) => a.ringIndex - b.ringIndex)
  .map((l) => l.id);

// --- Road centerline, for animating travel along the drawn road instead of
// a straight line between two buildings. Same stadium geometry as
// `boardLayout`'s derivation, but at the road's actual centerline radius
// (the dashed line in town-backdrop.png), measured in the same 2000x1121
// reference frame: semicircle centers at pixel (520,555)/(1480,555),
// centerline radius 375px (vs. the 455px buildings sit at).
const ROAD_IMG_W = 2000;
const ROAD_IMG_H = 1121;
const ROAD_CX1 = 520;
const ROAD_CX2 = 1480;
const ROAD_CY = 555;
const ROAD_RADIUS = 375;
const ROAD_STRAIGHT_LEN = ROAD_CX2 - ROAD_CX1;
const ROAD_ARC_LEN = Math.PI * ROAD_RADIUS;
const ROAD_PERIMETER = 2 * ROAD_STRAIGHT_LEN + 2 * ROAD_ARC_LEN;

/**
 * A point on the road's centerline at arc-length fraction `s` (0..1 covers
 * the whole loop once; wraps outside that range), as a `boardLayout`-style
 * fraction point. `s = 0` is the top straight's left end, matching where
 * `boardLayout`'s own arc-length derivation started.
 */
export function roadPointAt(s: number): BoardPoint {
  let len = ((s % 1) + 1) % 1 * ROAD_PERIMETER;
  let x: number;
  let y: number;
  if (len <= ROAD_STRAIGHT_LEN) {
    x = ROAD_CX1 + len;
    y = ROAD_CY - ROAD_RADIUS;
  } else if ((len -= ROAD_STRAIGHT_LEN) <= ROAD_ARC_LEN) {
    const angle = ((-90 + (len / ROAD_ARC_LEN) * 180) * Math.PI) / 180;
    x = ROAD_CX2 + ROAD_RADIUS * Math.cos(angle);
    y = ROAD_CY + ROAD_RADIUS * Math.sin(angle);
  } else if ((len -= ROAD_ARC_LEN) <= ROAD_STRAIGHT_LEN) {
    x = ROAD_CX2 - len;
    y = ROAD_CY + ROAD_RADIUS;
  } else {
    len -= ROAD_STRAIGHT_LEN;
    const angle = ((90 + (len / ROAD_ARC_LEN) * 180) * Math.PI) / 180;
    x = ROAD_CX1 + ROAD_RADIUS * Math.cos(angle);
    y = ROAD_CY + ROAD_RADIUS * Math.sin(angle);
  }
  return { x: x / ROAD_IMG_W, y: y / ROAD_IMG_H };
}

/** Each location's position along the road as an arc-length fraction (0..1), matching its ringIndex. */
export const roadFractionByLocation: Record<string, number> = Object.fromEntries(
  defaultConfig.locations.map((loc) => [loc.id, loc.ringIndex / defaultConfig.constants.ringSize]),
);

/**
 * The shorter-direction arc-length fraction to travel from `fromId` to
 * `toId` along the ring — positive means increasing ringIndex (the
 * direction `roadPointAt`'s `s` increases in), negative means decreasing.
 * Mirrors `@jones/core`'s `travelHours` shortest-path choice exactly, so the
 * animation always travels the same direction the hours were charged for.
 */
export function shortestRoadDelta(fromId: string, toId: string): number {
  const size = defaultConfig.constants.ringSize;
  const from = defaultConfig.locations.find((l) => l.id === fromId)!.ringIndex;
  const to = defaultConfig.locations.find((l) => l.id === toId)!.ringIndex;
  const forward = ((to - from) % size + size) % size;
  const backward = size - forward;
  return (forward <= backward ? forward : -backward) / size;
}

/**
 * Fits a 16:9 (by default) board into a containerWidth x containerHeight
 * area, preserving aspect ratio (letterboxed, never stretched/distorted).
 */
export function computeBoardRect(
  containerWidth: number,
  containerHeight: number,
  aspect: number = BOARD_ASPECT,
): BoardRect {
  const containerAspect = containerWidth / containerHeight;
  let boardWidth: number;
  let boardHeight: number;
  if (containerAspect > aspect) {
    boardHeight = containerHeight;
    boardWidth = boardHeight * aspect;
  } else {
    boardWidth = containerWidth;
    boardHeight = boardWidth / aspect;
  }
  return {
    boardWidth,
    boardHeight,
    offsetX: (containerWidth - boardWidth) / 2,
    offsetY: (containerHeight - boardHeight) / 2,
  };
}

/** Maps a fractional boardLayout point into the rect's actual pixel space. */
export function toPixelPosition(point: BoardPoint, rect: BoardRect): { x: number; y: number } {
  return {
    x: rect.offsetX + point.x * rect.boardWidth,
    y: rect.offsetY + point.y * rect.boardHeight,
  };
}
