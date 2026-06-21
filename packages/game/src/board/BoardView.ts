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
  private activeTick: ((ticker: Ticker) => void) | null = null;
  private activeAnimationToken: Graphics | null = null;

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
    this.cancelActiveAnimation();
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
        this.cancelActiveAnimation();
        if (this.lastState) this.drawTokens(this.lastState);
        onComplete();
      }
    };
    this.activeAnimationToken = token;
    this.activeTick = tick;
    Ticker.shared.add(tick);
  }

  destroy(): void {
    this.cancelActiveAnimation();
    this.pathLayer.destroy();
    this.buildingsLayer.destroy({ children: true });
    this.tokensLayer.destroy({ children: true });
    this.animationLayer.destroy({ children: true });
  }

  private cancelActiveAnimation(): void {
    if (this.activeTick) {
      Ticker.shared.remove(this.activeTick);
      this.activeTick = null;
    }
    if (this.activeAnimationToken) {
      this.animationLayer.removeChild(this.activeAnimationToken);
      this.activeAnimationToken.destroy();
      this.activeAnimationToken = null;
    }
    this.animatingPlayerId = null;
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
