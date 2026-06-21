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

/** Town-map positions per location id, as fractions [0,1] of the board's logical space. */
export const boardLayout: Record<string, BoardPoint> = {
  lowCostHousing: { x: 0.27, y: 0.29 },
  pawnShop: { x: 0.5, y: 0.18 },
  zMart: { x: 0.68, y: 0.32 },
  monolithBurgers: { x: 0.8, y: 0.22 },
  qtClothing: { x: 0.88, y: 0.45 },
  socketCity: { x: 0.75, y: 0.58 },
  hiTechU: { x: 0.6, y: 0.5 },
  employmentOffice: { x: 0.45, y: 0.65 },
  factory: { x: 0.55, y: 0.8 },
  bank: { x: 0.38, y: 0.85 },
  blacksMarket: { x: 0.22, y: 0.72 },
  securityApartments: { x: 0.13, y: 0.55 },
  rentOffice: { x: 0.2, y: 0.4 },
};

/** Every location id, in ring-travel order, for drawing the connecting path. */
export const boardPathOrder: string[] = [...defaultConfig.locations]
  .sort((a, b) => a.ringIndex - b.ringIndex)
  .map((l) => l.id);

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
