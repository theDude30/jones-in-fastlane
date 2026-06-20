# M4 PixiJS Board Rendering Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `@jones/game`'s text-based "Travel to X"/"Enter Building"/"Exit Building" button list with a real PixiJS-rendered organic town map — every location is a color-coded building card; clicking a building travels/enters/exits depending on context; every player's token renders at their location, fanned out when sharing a building; the human's travel animates while AI tokens snap.

**Architecture:** A thin `<PixiBoard />` React wrapper mounts a single Pixi `Application` and hands it to a plain `BoardView` class that owns every Pixi object and exposes `resize`/`syncState`/`playTravelAnimation`. Pure logic (board layout/scaling math, building colors, click-to-command resolution, player clustering) lives in standalone TypeScript modules with zero Pixi dependency, so it's unit-testable in the project's existing jsdom/Vitest setup. Pixi itself **cannot** run in jsdom (verified empirically — `Application.init()` throws `Not implemented: HTMLCanvasElement.prototype.getContext`), so `BoardView`'s actual rendering is verified manually against the real dev server in the final task, and any test that renders through `PlayScreen`/`App` mocks `PixiBoard`.

**Tech Stack:** PixiJS v8.19.0, React, TypeScript (strict), Zustand, Vitest + `@testing-library/react`. Run `pnpm test` and `pnpm typecheck` from the repo root.

## Global Constraints

- No `@jones/core`/`@jones/config`/`@jones/ai` changes — board layout/rendering is purely a `@jones/game` presentation concern (confirmed: `@jones/config`'s `LocationDef` has no x/y fields, and the project's core/config packages are required to stay rendering-free since `@jones/ai` and a future server also depend on them).
- Location ids are plain `string` (`LocationDef.id: string`) — there is no `LocationId` union type in this codebase.
- Seat colors, in seat-index order: seat 0 (human) `#2a7fff`, seat 1 `#e0524a`, seat 2 `#2eb872`, seat 3 `#caa12e`.
- Building colors by type, with priority `apartment > store > service > workplace` when a location has multiple types: `apartment` `#ffe2b0`, `store` `#cfe3ff`, `service` `#d8f5d0`, `workplace` `#ffd2a8`.
- Board aspect ratio is fixed at 16:9; the board scales to fit its container while preserving that aspect ratio (letterboxed, never stretched).
- Clicking a building resolves to exactly one command based on the clicking player's state: outside + different location → `TravelTo`; outside + current location → `EnterBuilding`; inside → `ExitBuilding`.
- Local relative imports inside `packages/game` use explicit `.js` extensions on `.ts`/`.tsx` files, matching the established M4a/M4c/M4-AI-wiring convention.
- Pure logic (layout math, building colors, click resolution, player clustering) must be unit-tested with real fixtures (via `createInitialGame` where a `PlayerState`/`GameState` is needed) — no mocking of game logic, matching the project's existing testing convention.

---

## File map

| Action | File | Responsibility |
|--------|------|-----------------|
| Create | `packages/game/src/board/layout.ts` | Town-map positions, ring path order, aspect ratio, container-to-board scaling math |
| Create | `packages/game/test/board/layout.test.ts` | Tests for the above |
| Create | `packages/game/src/board/buildingStyles.ts` | Location `types` → color mapping |
| Create | `packages/game/test/board/buildingStyles.test.ts` | Tests for the above |
| Create | `packages/game/src/board/resolveClick.ts` | Click → command resolution (travel/enter/exit) |
| Create | `packages/game/test/board/resolveClick.test.ts` | Tests for the above |
| Create | `packages/game/src/board/playerClusters.ts` | Group players sharing a location; compute fan-out offsets |
| Create | `packages/game/test/board/playerClusters.test.ts` | Tests for the above |
| Modify | `packages/game/package.json` | Add `pixi.js` dependency |
| Create | `packages/game/src/board/BoardView.ts` | Owns all Pixi rendering: building cards, path, tokens, travel animation |
| Create | `packages/game/src/screens/PixiBoard.tsx` | React wrapper: mounts the Pixi `Application`, owns the `BoardView` instance, wires clicks to `dispatch` |
| Modify | `packages/game/src/screens/PlayScreen.tsx` | Renders `<PixiBoard />`; removes the `TravelTo`/`EnterBuilding`/`ExitBuilding` buttons |
| Modify | `packages/game/test/App.test.tsx` | Mocks `PixiBoard`; rewrites the error-event test to dispatch directly (no clickable board buttons in RTL) |

---

## Task 1: Board layout & scaling math

**Files:**
- Create: `packages/game/src/board/layout.ts`
- Create: `packages/game/test/board/layout.test.ts`

**Interfaces:**
- Produces: `BoardPoint` (`{ x: number; y: number }`), `BoardRect` (`{ boardWidth, boardHeight, offsetX, offsetY }`), `boardLayout: Record<string, BoardPoint>`, `boardPathOrder: string[]`, `BOARD_ASPECT: number`, `computeBoardRect(containerWidth: number, containerHeight: number, aspect?: number): BoardRect`, `toPixelPosition(point: BoardPoint, rect: BoardRect): { x: number; y: number }`. Consumed by Task 3's `BoardView`.

- [ ] **Step 1: Write the failing tests in `packages/game/test/board/layout.test.ts`**

```ts
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run packages/game/test/board/layout.test.ts 2>&1 | tail -30`
Expected: FAIL — `../../src/board/layout.js` doesn't exist yet.

- [ ] **Step 3: Create `packages/game/src/board/layout.ts`**

```ts
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
```

- [ ] **Step 4: Run the tests to confirm they pass**

Run: `pnpm vitest run packages/game/test/board/layout.test.ts 2>&1 | tail -30`
Expected: all tests pass.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/board/layout.ts packages/game/test/board/layout.test.ts
git commit -m "feat(game): add board layout & scaling math"
```

---

## Task 2: Building colors & pure interaction logic

**Files:**
- Create: `packages/game/src/board/buildingStyles.ts`
- Create: `packages/game/test/board/buildingStyles.test.ts`
- Create: `packages/game/src/board/resolveClick.ts`
- Create: `packages/game/test/board/resolveClick.test.ts`
- Create: `packages/game/src/board/playerClusters.ts`
- Create: `packages/game/test/board/playerClusters.test.ts`

**Interfaces:**
- Produces: `buildingColor(types: LocationType[]): string`; `resolveClick(locationId: string, player: PlayerState): Command`; `clusterPlayersByLocation(players: PlayerState[]): Map<string, PlayerState[]>`; `fanOffsets(count: number, spacing?: number): number[]`. All consumed by Task 3's `BoardView`.

- [ ] **Step 1: Write the failing tests**

Create `packages/game/test/board/buildingStyles.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { buildingColor } from "../../src/board/buildingStyles.js";

describe("buildingColor", () => {
  it("returns a defined color for every location type combination actually configured", () => {
    for (const loc of defaultConfig.locations) {
      expect(() => buildingColor(loc.types)).not.toThrow();
      expect(buildingColor(loc.types)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("prioritizes apartment over any other type", () => {
    expect(buildingColor(["apartment", "workplace"])).toBe("#ffe2b0");
  });

  it("prioritizes store over service and workplace", () => {
    expect(buildingColor(["store", "workplace"])).toBe("#cfe3ff");
  });

  it("prioritizes service over workplace", () => {
    expect(buildingColor(["service", "workplace"])).toBe("#d8f5d0");
  });

  it("falls back to the workplace color when that is the only type", () => {
    expect(buildingColor(["workplace"])).toBe("#ffd2a8");
  });
});
```

Create `packages/game/test/board/resolveClick.test.ts`:

```ts
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
```

Create `packages/game/test/board/playerClusters.test.ts`:

```ts
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
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run packages/game/test/board/buildingStyles.test.ts packages/game/test/board/resolveClick.test.ts packages/game/test/board/playerClusters.test.ts 2>&1 | tail -40`
Expected: FAIL — none of the three source modules exist yet.

- [ ] **Step 3: Create `packages/game/src/board/buildingStyles.ts`**

```ts
import type { LocationType } from "@jones/config";

const COLOR_BY_TYPE: Record<LocationType, string> = {
  apartment: "#ffe2b0",
  store: "#cfe3ff",
  service: "#d8f5d0",
  workplace: "#ffd2a8",
};

/** When a location has multiple types, the first matching type here wins. */
const PRIORITY: LocationType[] = ["apartment", "store", "service", "workplace"];

export function buildingColor(types: LocationType[]): string {
  for (const type of PRIORITY) {
    if (types.includes(type)) return COLOR_BY_TYPE[type];
  }
  throw new Error(`no color defined for location types: ${types.join(",")}`);
}
```

- [ ] **Step 4: Create `packages/game/src/board/resolveClick.ts`**

```ts
import type { Command, PlayerState } from "@jones/core";

/**
 * Resolves a board click on `locationId` into the command it should
 * dispatch, given the clicking player's current state:
 * - elsewhere, outside -> TravelTo
 * - here, outside      -> EnterBuilding
 * - here, inside       -> ExitBuilding (the only building that can be
 *   "here" while inside)
 */
export function resolveClick(locationId: string, player: PlayerState): Command {
  if (player.insideBuilding) {
    return { type: "ExitBuilding" };
  }
  if (player.locationId === locationId) {
    return { type: "EnterBuilding" };
  }
  return { type: "TravelTo", locationId };
}
```

- [ ] **Step 5: Create `packages/game/src/board/playerClusters.ts`**

```ts
import type { PlayerState } from "@jones/core";

/** Groups players by their current locationId, preserving seat order. */
export function clusterPlayersByLocation(players: PlayerState[]): Map<string, PlayerState[]> {
  const clusters = new Map<string, PlayerState[]>();
  for (const player of players) {
    const existing = clusters.get(player.locationId);
    if (existing) {
      existing.push(player);
    } else {
      clusters.set(player.locationId, [player]);
    }
  }
  return clusters;
}

/** Evenly-spaced, zero-centered x-offsets for `count` tokens fanned out at one location. */
export function fanOffsets(count: number, spacing = 18): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}
```

- [ ] **Step 6: Run the tests and typecheck**

Run: `pnpm vitest run packages/game/test/board 2>&1 | tail -40`
Expected: all tests pass (Task 1's `layout.test.ts` plus this task's three files).

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add packages/game/src/board/buildingStyles.ts packages/game/test/board/buildingStyles.test.ts packages/game/src/board/resolveClick.ts packages/game/test/board/resolveClick.test.ts packages/game/src/board/playerClusters.ts packages/game/test/board/playerClusters.test.ts
git commit -m "feat(game): add building colors and pure board interaction logic"
```

---

## Task 3: `BoardView` — Pixi rendering

**Files:**
- Modify: `packages/game/package.json`
- Create: `packages/game/src/board/BoardView.ts`

**Interfaces:**
- Consumes: `boardLayout`, `boardPathOrder`, `BOARD_ASPECT`, `computeBoardRect`, `toPixelPosition` (Task 1); `buildingColor`, `clusterPlayersByLocation`, `fanOffsets` (Task 2).
- Produces: `class BoardView { constructor(stage: Container, onLocationClick: (locationId: string) => void); resize(width: number, height: number): void; syncState(state: GameState): void; playTravelAnimation(playerId: string, fromLocationId: string, toLocationId: string, onComplete: () => void): void; destroy(): void }`. Consumed by Task 4's `PixiBoard.tsx`.

**No automated test for this task.** Pixi rendering cannot execute in this project's jsdom/Vitest environment — verified empirically: constructing and initializing a real `pixi.js` `Application` in jsdom throws `Error: Not implemented: HTMLCanvasElement.prototype.getContext (without installing the canvas npm package)`. `BoardView`'s correctness is verified manually in Task 5, against the real running dev server. Run `pnpm typecheck` after writing this task's code as the only automated check.

- [ ] **Step 1: Add the `pixi.js` dependency**

In `packages/game/package.json`, change the `"dependencies"` block from:

```json
  "dependencies": {
    "@jones/ai": "workspace:*",
    "@jones/config": "workspace:*",
    "@jones/core": "workspace:*",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
```

to:

```json
  "dependencies": {
    "@jones/ai": "workspace:*",
    "@jones/config": "workspace:*",
    "@jones/core": "workspace:*",
    "pixi.js": "^8.19.0",
    "react": "^18.3.1",
    "react-dom": "^18.3.1",
    "zustand": "^4.5.5"
  },
```

- [ ] **Step 2: Install**

Run: `pnpm install`
Expected: completes with no errors; `node_modules/pixi.js` resolves to v8.19.x.

- [ ] **Step 3: Create `packages/game/src/board/BoardView.ts`**

```ts
import { Container, Graphics, Text, Ticker } from "pixi.js";
import { defaultConfig } from "@jones/config";
import type { GameState } from "@jones/core";
import { BOARD_ASPECT, boardLayout, boardPathOrder, computeBoardRect, toPixelPosition } from "./layout.js";
import type { BoardRect } from "./layout.js";
import { buildingColor } from "./buildingStyles.js";
import { clusterPlayersByLocation, fanOffsets } from "./playerClusters.js";

const CARD_WIDTH = 96;
const CARD_HEIGHT = 56;
const TOKEN_RADIUS = 7;
const TRAVEL_DURATION_MS = 400;
const SEAT_COLORS = ["#2a7fff", "#e0524a", "#2eb872", "#caa12e"];

function tokenY(centerY: number): number {
  return centerY + CARD_HEIGHT / 2 + TOKEN_RADIUS;
}

/**
 * Owns every Pixi object on the board: building cards, the connecting path,
 * and player tokens. `syncState` is the one-way sync point from game state
 * to the rendered scene — this class never reads from the Zustand store
 * itself, only from whatever state `PixiBoard.tsx` hands it.
 */
export class BoardView {
  private pathLayer = new Graphics();
  private buildingsLayer = new Container();
  private tokensLayer = new Container();
  private animationLayer = new Container();
  private buildingCards = new Map<string, Graphics>();
  private rect: BoardRect = { boardWidth: 0, boardHeight: 0, offsetX: 0, offsetY: 0 };
  private lastState: GameState | null = null;
  private animatingPlayerId: string | null = null;

  constructor(stage: Container, private onLocationClick: (locationId: string) => void) {
    stage.addChild(this.pathLayer);
    stage.addChild(this.buildingsLayer);
    stage.addChild(this.tokensLayer);
    stage.addChild(this.animationLayer);

    for (const loc of defaultConfig.locations) {
      const card = new Graphics();
      card.eventMode = "static";
      card.cursor = "pointer";
      card.on("pointertap", () => this.onLocationClick(loc.id));

      const label = new Text({
        text: loc.name,
        style: { fontSize: 10, fill: "#222222", align: "center", wordWrap: true, wordWrapWidth: CARD_WIDTH - 8 },
      });
      label.anchor.set(0.5);
      card.addChild(label);

      this.buildingsLayer.addChild(card);
      this.buildingCards.set(loc.id, card);
    }
  }

  resize(width: number, height: number): void {
    this.rect = computeBoardRect(width, height, BOARD_ASPECT);
    this.drawPath();
    if (this.lastState) this.syncState(this.lastState);
  }

  syncState(state: GameState): void {
    this.lastState = state;
    this.drawBuildingCards(state);
    this.drawTokens(state);
  }

  playTravelAnimation(
    playerId: string,
    fromLocationId: string,
    toLocationId: string,
    onComplete: () => void,
  ): void {
    this.animatingPlayerId = playerId;
    const seatIndex = Number(playerId.slice(1));
    const from = toPixelPosition(boardLayout[fromLocationId], this.rect);
    const to = toPixelPosition(boardLayout[toLocationId], this.rect);

    const token = new Graphics();
    token.circle(0, 0, TOKEN_RADIUS).fill(SEAT_COLORS[seatIndex] ?? "#888888");
    token.stroke({ width: 2, color: "#ffffff" });
    token.position.set(from.x, tokenY(from.y));
    this.animationLayer.addChild(token);

    // Redraw the static token layer now, excluding the animating player, so
    // there is never a duplicate render of their token while it animates.
    if (this.lastState) this.drawTokens(this.lastState);

    let elapsed = 0;
    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / TRAVEL_DURATION_MS);
      token.position.set(from.x + (to.x - from.x) * t, tokenY(from.y + (to.y - from.y) * t));
      if (t >= 1) {
        Ticker.shared.remove(tick);
        this.animationLayer.removeChild(token);
        token.destroy();
        this.animatingPlayerId = null;
        if (this.lastState) this.drawTokens(this.lastState);
        onComplete();
      }
    };
    Ticker.shared.add(tick);
  }

  destroy(): void {
    this.pathLayer.destroy();
    this.buildingsLayer.destroy({ children: true });
    this.tokensLayer.destroy({ children: true });
    this.animationLayer.destroy({ children: true });
  }

  private drawPath(): void {
    this.pathLayer.clear();
    const points = boardPathOrder.map((id) => toPixelPosition(boardLayout[id], this.rect));
    this.pathLayer.moveTo(points[0].x, points[0].y);
    for (const point of points.slice(1)) this.pathLayer.lineTo(point.x, point.y);
    this.pathLayer.lineTo(points[0].x, points[0].y);
    this.pathLayer.stroke({ width: 3, color: "#bbbbbb" });
  }

  private drawBuildingCards(state: GameState): void {
    const human = state.players[0];
    for (const loc of defaultConfig.locations) {
      const card = this.buildingCards.get(loc.id)!;
      const { x, y } = toPixelPosition(boardLayout[loc.id], this.rect);
      card.position.set(x, y);
      card.clear();
      card.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6);
      card.fill(buildingColor(loc.types));
      const isHere = human.insideBuilding && human.locationId === loc.id;
      card.stroke({ width: isHere ? 3 : 1.5, color: isHere ? "#222222" : "#444444" });
    }
  }

  private drawTokens(state: GameState): void {
    this.tokensLayer.removeChildren();
    const clusters = clusterPlayersByLocation(state.players);
    for (const [locationId, players] of clusters) {
      const visible = players.filter((p) => p.id !== this.animatingPlayerId);
      if (visible.length === 0) continue;
      const { x, y } = toPixelPosition(boardLayout[locationId], this.rect);
      const offsets = fanOffsets(visible.length);
      visible.forEach((player, i) => {
        const seatIndex = Number(player.id.slice(1));
        const token = new Graphics();
        token.circle(0, 0, TOKEN_RADIUS).fill(SEAT_COLORS[seatIndex] ?? "#888888");
        token.stroke({ width: 2, color: "#ffffff" });
        token.position.set(x + offsets[i], tokenY(y));
        this.tokensLayer.addChild(token);
      });
    }
  }
}
```

- [ ] **Step 4: Typecheck**

Run: `pnpm typecheck 2>&1 | tail -25`
Expected: no errors. If `pixi.js`'s types disagree with any call here (API surfaces do shift between minor versions), fix the call to match the installed `node_modules/pixi.js` type declarations — the imports/method names above were verified against `pixi.js@8.19.0`'s shipped `.d.ts` files (`Graphics().roundRect().fill().stroke()`, `new Text({ text, style })`, `Ticker.shared.add((ticker) => ticker.deltaMS)`, `container.eventMode = "static"`).

- [ ] **Step 5: Run the full test suite (regression check)**

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite still passes — this task adds no new tests, but must not have broken anything.

- [ ] **Step 6: Commit**

```bash
git add packages/game/package.json pnpm-lock.yaml packages/game/src/board/BoardView.ts
git commit -m "feat(game): add BoardView Pixi rendering class"
```

---

## Task 4: `PixiBoard` wrapper, `PlayScreen` integration

**Files:**
- Create: `packages/game/src/screens/PixiBoard.tsx`
- Modify: `packages/game/src/screens/PlayScreen.tsx`
- Modify: `packages/game/test/App.test.tsx`

**Interfaces:**
- Consumes: `BoardView` (Task 3), `resolveClick` (Task 2), `useGameStore` (existing).
- Produces: `PixiBoard()` (named export, no props) — consumed by `PlayScreen.tsx`.

- [ ] **Step 1: Create `packages/game/src/screens/PixiBoard.tsx`**

```tsx
import { useEffect, useRef } from "react";
import { Application } from "pixi.js";
import { useGameStore } from "../store/gameStore.js";
import { BoardView } from "../board/BoardView.js";
import { resolveClick } from "../board/resolveClick.js";

export function PixiBoard() {
  const containerRef = useRef<HTMLDivElement>(null);
  const boardViewRef = useRef<BoardView | null>(null);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const app = new Application();
    let boardView: BoardView | null = null;
    let resizeObserver: ResizeObserver | null = null;
    let cancelled = false;

    function handleLocationClick(locationId: string) {
      const current = stateRef.current;
      if (!current) return;
      const player = current.players[current.currentPlayerIndex];
      const command = resolveClick(locationId, player);
      const fromLocationId = player.locationId;
      dispatch(command);
      if (command.type === "TravelTo") {
        boardViewRef.current?.playTravelAnimation(player.id, fromLocationId, locationId, () => {});
      }
    }

    app
      .init({
        resizeTo: container,
        resolution: Math.min(window.devicePixelRatio, 2),
        autoDensity: true,
        backgroundColor: "#f4f6f9",
      })
      .then(() => {
        if (cancelled) return;
        container.appendChild(app.canvas);
        boardView = new BoardView(app.stage, handleLocationClick);
        boardViewRef.current = boardView;
        boardView.resize(container.clientWidth, container.clientHeight);
        if (stateRef.current) boardView.syncState(stateRef.current);

        resizeObserver = new ResizeObserver(() => {
          boardView?.resize(container.clientWidth, container.clientHeight);
        });
        resizeObserver.observe(container);
      });

    return () => {
      cancelled = true;
      resizeObserver?.disconnect();
      boardView?.destroy();
      app.destroy(true);
      boardViewRef.current = null;
    };
  }, [dispatch]);

  useEffect(() => {
    if (state) boardViewRef.current?.syncState(state);
  }, [state]);

  return <div ref={containerRef} style={{ width: "100%", height: 360 }} />;
}
```

- [ ] **Step 2: Update `packages/game/src/screens/PlayScreen.tsx`**

Replace the entire file with:

```tsx
import { useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import { LocationScreen } from "./LocationScreen.js";
import { PixiBoard } from "./PixiBoard.js";

export function PlayScreen() {
  const state = useGameStore((s) => s.state);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const dispatch = useGameStore((s) => s.dispatch);
  const [showRawState, setShowRawState] = useState(false);

  if (!state) return null;

  const player = state.players[state.currentPlayerIndex];

  return (
    <div>
      {state.status !== "playing" && (
        <div data-testid="game-over-banner">
          Game over — status: {state.status}
          {state.winners.length > 0 && ` — winner: ${state.winners.join(", ")}`}
        </div>
      )}
      <PixiBoard />
      <section>
        <p>Player: {player.name}</p>
        <p>Week: {state.week}</p>
        <p>Cash: {player.cash}</p>
        <p>Location: {player.locationId}</p>
        <p>Inside: {player.insideBuilding ? "yes" : "no"}</p>
        <p>Hours remaining: {player.hoursRemaining}</p>
      </section>
      {player.insideBuilding && (
        <section>
          <LocationScreen />
        </section>
      )}
      <section>
        <button onClick={() => dispatch({ type: "EndTurn" })}>End Turn</button>
      </section>
      <section>
        <h2>Last events</h2>
        <ul>
          {lastEvents.map((e, i) => (
            <li key={i}>{JSON.stringify(e)}</li>
          ))}
        </ul>
      </section>
      <section>
        <button onClick={() => setShowRawState((v) => !v)}>
          {showRawState ? "Hide" : "Show"} raw state
        </button>
        {showRawState && <pre data-testid="state-dump">{JSON.stringify(state, null, 2)}</pre>}
      </section>
    </div>
  );
}
```

- [ ] **Step 3: Update `packages/game/test/App.test.tsx`**

Pixi cannot run in this project's jsdom test environment (verified empirically in Task 3's brief), so `PixiBoard` must be mocked here, and the old "click Enter Building" interaction (now a board click, which RTL can't simulate — there is no DOM text node for it) must dispatch directly instead. Replace the entire file with:

```tsx
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App.js";
import { useGameStore } from "../src/store/gameStore.js";

vi.mock("../src/screens/PixiBoard.js", () => ({
  PixiBoard: () => null,
}));

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
});

describe("App", () => {
  it("shows the New Game screen initially", () => {
    render(<App />);
    expect(screen.getByText("Jones in the Fast Lane")).toBeInTheDocument();
  });

  it("clicking Start Game switches to the play screen", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    expect(screen.getByText(/Week: 1/)).toBeInTheDocument();
  });

  it("clicking End Turn advances the displayed week", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    fireEvent.click(screen.getByText("End Turn"));
    expect(screen.getByText(/Week: 2/)).toBeInTheDocument();
  });

  it("renders an error event inline instead of crashing", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    useGameStore.setState((s) => {
      s.state!.players[0].hoursRemaining = 0;
      return { state: s.state };
    });
    // Board clicks can't be simulated through RTL (Pixi renders to a canvas,
    // not DOM text nodes) — dispatch the illegal command directly, exactly
    // as a real board click would, to prove the error path still renders
    // inline instead of crashing.
    useGameStore.getState().dispatch({ type: "EnterBuilding" });
    expect(screen.getByText(/NotEnoughTime/)).toBeInTheDocument();
  });
});
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm test 2>&1 | tail -25`
Expected: full suite passes, including the updated `App.test.tsx`.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

Run: `pnpm --filter @jones/game build 2>&1 | tail -25`
Expected: Vite build completes successfully.

- [ ] **Step 5: Commit**

```bash
git add packages/game/src/screens/PixiBoard.tsx packages/game/src/screens/PlayScreen.tsx packages/game/test/App.test.tsx
git commit -m "feat(game): wire PixiBoard into PlayScreen, remove travel/enter/exit buttons"
```

---

## Task 5: Manual verification against the real app

**Files:** none (verification only).

This task has no automated test — it exercises exactly what Task 3/4 deliberately left untested: real Pixi rendering, click-to-canvas interaction, the travel animation, and cross-device scaling. Use the `verify` skill's approach (the same one used for the game-setup & AI-wiring sub-project): launch the real dev server, drive it headlessly with Playwright, capture screenshots.

- [ ] **Step 1: Install a headless browser if not already available**

Run: `npx -y playwright@1.49.0 install chromium 2>&1 | tail -10`
Expected: Chromium downloads (or reports already installed).

- [ ] **Step 2: Start the dev server**

Run (from `packages/game`): `pnpm dev > /tmp/jones-dev.log 2>&1 &`
Then: `sleep 1 && curl -sf http://localhost:5173/ >/dev/null && echo "server up"`
Expected: `server up`. If the port is in use, `pkill -f vite` first and retry.

- [ ] **Step 3: Write and run a driver script**

Create a scratch directory with its own `package.json` so `playwright`'s Node API is resolvable (the repo itself does not depend on the `playwright` npm package, only the `playwright` *test runner binary* installed in Step 1's cache):

```bash
mkdir -p /tmp/pw-scratch && cd /tmp/pw-scratch && npm init -y >/dev/null 2>&1 && npm i playwright@1.49.0 >/tmp/pw-install.log 2>&1
```

Create `/tmp/pw-scratch/verify-board.mjs`:

```js
import { chromium } from "playwright";
import fs from "fs";

const shotDir = "/tmp/board-screenshots";
fs.mkdirSync(shotDir, { recursive: true });

const browser = await chromium.launch({ args: ["--no-sandbox"] });
const page = await browser.newPage({ viewport: { width: 1200, height: 900 } });
const consoleErrors = [];
page.on("console", (msg) => { if (msg.type() === "error") consoleErrors.push(msg.text()); });
page.on("pageerror", (err) => consoleErrors.push("pageerror: " + err.message));

await page.goto("http://localhost:5173/", { waitUntil: "networkidle" });
await page.click("text=Start Game");
await page.waitForSelector("text=Week: 1");
await page.waitForTimeout(300); // let the Pixi Application finish async init
await page.screenshot({ path: `${shotDir}/01-board.png` });

// Click somewhere on the canvas where a building card should be (Low-Cost
// Housing, the player's starting location, sits near the top-left per
// layout.ts's boardLayout — adjust if the screenshot shows otherwise).
const canvas = await page.$("canvas");
const box = await canvas.boundingBox();
await page.mouse.click(box.x + box.width * 0.27, box.y + box.height * 0.29);
await page.waitForTimeout(200);
await page.screenshot({ path: `${shotDir}/02-after-click-current-location.png` });
console.log("Inside text present:", (await page.textContent("body")).includes("Inside: yes"));

await page.screenshot({ path: `${shotDir}/03-final.png` });
console.log("CONSOLE_ERRORS:", JSON.stringify(consoleErrors));
await browser.close();
```

Run: `cd /tmp/pw-scratch && node verify-board.mjs`
Expected: no thrown errors from the script; `CONSOLE_ERRORS: []`.

- [ ] **Step 4: Inspect the screenshots**

Read `/tmp/board-screenshots/01-board.png` and confirm: the town map renders with 13 color-coded building cards in the organic layout from `layout.ts`, a connecting path between them, and the human's token visible at the starting location.

Read `/tmp/board-screenshots/02-after-click-current-location.png` and confirm: clicking the player's current building entered it — `Inside text present: true` in the script's console output, and (if `LocationScreen`'s panel for that location renders below the board) its content is visible.

If the human's starting location isn't where the script assumed, note the actual coordinates from the screenshot and re-run Step 3 with the corrected click position — `boardLayout.lowCostHousing` in `layout.ts` is the source of truth.

- [ ] **Step 5: Verify travel and multi-opponent fan-out manually**

Extend the same script (or write a second one) to: exit the building, click a *different* building to confirm `TravelTo` fires and the token animates (capture two screenshots ~150ms apart during the ~400ms animation window and confirm the token is at a different position in each); then start a fresh game with 3 AI opponents and, after the human's first `EndTurn`, screenshot the board to confirm multiple tokens fan out (not stacked/hidden) wherever players ended up sharing a location.

- [ ] **Step 6: Verify cross-device scaling**

Re-run Step 3's script with `viewport: { width: 400, height: 700 }` (a phone-like portrait size) and again with `{ width: 2560, height: 1440 }` (a large desktop size). Screenshot both. Confirm in each: the board is letterboxed (not stretched/distorted — building cards keep their proportions and relative spacing matches the desktop screenshot), and `CONSOLE_ERRORS` stays empty.

- [ ] **Step 7: Clean up**

Run: `pkill -f vite; lsof -ti:5173 | xargs kill 2>/dev/null; rm -rf /tmp/pw-scratch /tmp/board-screenshots /tmp/jones-dev.log`

- [ ] **Step 8: Report findings**

Summarize what was verified (board renders, click-to-travel/enter/exit all work, animation plays, multi-player fan-out works, scaling holds at phone/desktop sizes) and flag anything that looked off — per the `verify` skill's framing, observations matter even if nothing is strictly broken.

---

## Self-review notes

- **Spec coverage:** Goal 1 (organic town map) → Task 1's `layout.ts` + Task 3's `drawPath`/`drawBuildingCards`. Goal 2 (all players' tokens, fanned out) → Task 2's `playerClusters.ts` + Task 3's `drawTokens`. Goal 3 (board replaces buttons) → Task 4's `PlayScreen.tsx` rewrite. Goal 4 (crisp/correctly-scaled on any device) → Task 1's `computeBoardRect`/`toPixelPosition` + Task 4's `resolution`/`autoDensity`/`ResizeObserver` wiring + Task 5's explicit phone/desktop screenshot comparison. Goal 5 (human animates, AI snaps) → Task 3's `playTravelAnimation` plus the `animatingPlayerId` exclusion in `drawTokens`, only ever invoked from a board click (which is always the human, by construction — AI moves happen inside `gameStore.dispatch`'s `playGame()` call, never through `PixiBoard`'s click handler).
- **Type consistency:** `resolveClick(locationId: string, player: PlayerState): Command` (Task 2) is consumed with that exact signature in Task 4's `PixiBoard.tsx`. `BoardView`'s constructor signature, `resize`/`syncState`/`playTravelAnimation`/`destroy` methods (Task 3) match exactly what Task 4's `PixiBoard.tsx` calls. `boardLayout`/`toPixelPosition`/`BOARD_ASPECT` (Task 1) are imported with matching names in Task 3.
- **No placeholders:** every step has complete, working code; the one task without an automated test (Task 3) states the empirical reason in its brief rather than silently skipping TDD, and Task 5 supplies the verification that task is missing.
- **Animation/double-render race condition:** explicitly designed around in Task 3 — `playTravelAnimation` sets `animatingPlayerId` and immediately re-runs `drawTokens` to exclude that player from the static layer, and `drawTokens` itself filters by `animatingPlayerId` on every call (including the ones triggered by `syncState` after React re-renders with the post-dispatch state) — so the animating player is never rendered twice, regardless of render timing between the click handler and the `useEffect[state]` callback.
