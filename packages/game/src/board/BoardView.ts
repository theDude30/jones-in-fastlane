import { Assets, Container, Graphics, Sprite, Text, Ticker } from "pixi.js";
import { defaultConfig } from "@jones/config";
import type { GameState } from "@jones/core";
import {
  BOARD_ASPECT,
  boardLayout,
  computeBoardRect,
  roadFractionByLocation,
  roadPointAt,
  shortestRoadDelta,
  toPixelPosition,
} from "./layout.js";
import type { BoardRect } from "./layout.js";
import { buildingColor } from "./buildingStyles.js";
import { clusterPlayersByLocation, fanOffsets } from "./playerClusters.js";

const CARD_WIDTH = 96;
const CARD_HEIGHT = 56;
const TOKEN_RADIUS = 7;
const TOKEN_SPACING = 18;
const TRAVEL_DURATION_MS = 400;
const SEAT_COLORS = ["#2a7fff", "#e0524a", "#2eb872", "#caa12e"];
const BACKDROP_URL = "/board/town-backdrop.png";

// Card/token pixel sizes above are tuned for the board at this width — the
// width it gets whenever the container is at least 360px tall (16:9 against
// the fixed 360px board height most viewports hit). Narrower containers
// (e.g. a narrow phone) get less board width than this from
// computeBoardRect, so cards/tokens must shrink with it via a scale
// transform, or they visually overlap at small sizes.
const REFERENCE_BOARD_WIDTH = 640;

/**
 * Owns every Pixi object on the board: the backdrop, building cards, and
 * player tokens. `syncState` is the one-way sync point from game state to
 * the rendered scene — this class never reads from the Zustand store
 * itself, only from whatever state `PixiBoard.tsx` hands it.
 *
 * The connecting travel path is drawn by the backdrop art itself (the road
 * loop in town-backdrop.png), not by this class — building positions in
 * `boardLayout` are calibrated to sit just outside that drawn road.
 */
export class BoardView {
  private backdropLayer = new Container();
  private backdropSprite: Sprite | null = null;
  private buildingsLayer = new Container();
  private tokensLayer = new Container();
  private animationLayer = new Container();
  private buildingCards = new Map<string, { container: Container; graphics: Graphics }>();
  private playerTokens = new Map<string, Graphics>();
  private rect: BoardRect = { boardWidth: 0, boardHeight: 0, offsetX: 0, offsetY: 0 };
  private lastState: GameState | null = null;
  private animatingPlayerId: string | null = null;
  private activeTick: ((ticker: Ticker) => void) | null = null;
  private activeAnimationToken: Graphics | null = null;
  private destroyed = false;

  constructor(stage: Container, private onLocationClick: (locationId: string) => void) {
    stage.addChild(this.backdropLayer);
    stage.addChild(this.buildingsLayer);
    stage.addChild(this.tokensLayer);
    stage.addChild(this.animationLayer);

    // Backdrop art loads asynchronously; lay it out once it's ready, using
    // whatever board rect is current at that moment (resize() re-lays-out
    // on every later resize too, same as the path and building cards). Guard
    // against the view having been torn down before the load resolves (the
    // same React StrictMode double-mount race documented on PixiBoard.tsx).
    Assets.load(BACKDROP_URL).then((texture) => {
      if (this.destroyed) return;
      this.backdropSprite = new Sprite(texture);
      this.backdropLayer.addChild(this.backdropSprite);
      this.layoutBackdrop();
    });

    for (const loc of defaultConfig.locations) {
      // A Container (not a Graphics) is required to hold both the card's
      // rect and its label — Pixi v8 deprecates adding children directly to
      // a Graphics instance (it will be disallowed in a future v8 release).
      const container = new Container();
      container.eventMode = "static";
      container.cursor = "pointer";
      container.on("pointertap", () => this.onLocationClick(loc.id));

      const graphics = new Graphics();
      container.addChild(graphics);

      const label = new Text({
        text: loc.name,
        style: { fontSize: 10, fill: "#222222", align: "center", wordWrap: true, wordWrapWidth: CARD_WIDTH - 8 },
      });
      label.anchor.set(0.5);
      container.addChild(label);

      this.buildingsLayer.addChild(container);
      this.buildingCards.set(loc.id, { container, graphics });
    }
  }

  private get scale(): number {
    return this.rect.boardWidth > 0 ? this.rect.boardWidth / REFERENCE_BOARD_WIDTH : 1;
  }

  resize(width: number, height: number): void {
    this.rect = computeBoardRect(width, height, BOARD_ASPECT);
    this.layoutBackdrop();
    if (this.lastState) this.syncState(this.lastState);
  }

  private layoutBackdrop(): void {
    if (!this.backdropSprite || this.rect.boardWidth <= 0) return;
    this.backdropSprite.width = this.rect.boardWidth;
    this.backdropSprite.height = this.rect.boardHeight;
    this.backdropSprite.position.set(this.rect.offsetX, this.rect.offsetY);
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
    const scale = this.scale;
    const seatIndex = Number(playerId.slice(1));
    // Animate along the road's actual drawn centerline, not a straight line
    // between the two buildings — `shortestRoadDelta` picks the same
    // direction (and matching hour cost) @jones/core's travelHours already
    // charged, so the trip a player sees always matches what they paid for.
    const fromFraction = roadFractionByLocation[fromLocationId];
    const delta = shortestRoadDelta(fromLocationId, toLocationId);
    const start = toPixelPosition(roadPointAt(fromFraction), this.rect);

    const token = new Graphics();
    token.circle(0, 0, TOKEN_RADIUS).fill(SEAT_COLORS[seatIndex] ?? "#888888");
    token.stroke({ width: 2, color: "#ffffff" });
    token.scale.set(scale);
    token.position.set(start.x, start.y);
    this.animationLayer.addChild(token);

    // Redraw the static token layer now, excluding the animating player, so
    // there is never a duplicate render of their token while it animates.
    if (this.lastState) this.drawTokens(this.lastState);

    let elapsed = 0;
    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / TRAVEL_DURATION_MS);
      const point = toPixelPosition(roadPointAt(fromFraction + delta * t), this.rect);
      token.position.set(point.x, point.y);
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
    this.destroyed = true;
    this.cancelActiveAnimation();
    this.backdropLayer.destroy({ children: true });
    this.buildingsLayer.destroy({ children: true });
    this.tokensLayer.destroy({ children: true });
    this.animationLayer.destroy({ children: true });
    this.playerTokens.clear();
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

  private drawBuildingCards(state: GameState): void {
    const human = state.players[0];
    const scale = this.scale;
    for (const loc of defaultConfig.locations) {
      const { container, graphics } = this.buildingCards.get(loc.id)!;
      const { x, y } = toPixelPosition(boardLayout[loc.id], this.rect);
      container.position.set(x, y);
      container.scale.set(scale);
      graphics.clear();
      graphics.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6);
      graphics.fill(buildingColor(loc.types));
      const isHere = human.insideBuilding && human.locationId === loc.id;
      graphics.stroke({ width: isHere ? 3 : 1.5, color: isHere ? "#222222" : "#444444" });
    }
  }

  private drawTokens(state: GameState): void {
    // Tokens are persistent, one Graphics per player, reused and
    // repositioned every call — never recreated. Creating/destroying many
    // Graphics objects within a single synchronous burst (once per
    // syncState call) raced with Pixi's WebGL batch renderer and threw
    // "Cannot read properties of null (reading 'geometry')" intermittently;
    // reusing objects (the same pattern already used for building cards)
    // eliminates the churn that caused it.
    const scale = this.scale;
    const clusters = clusterPlayersByLocation(state.players);
    const visiblePlayerIds = new Set<string>();
    for (const [locationId, players] of clusters) {
      const visible = players.filter((p) => p.id !== this.animatingPlayerId);
      // On the road at this location's stop, not on the building card —
      // matches where playTravelAnimation starts and ends, so there's no
      // visual jump between arriving and coming to rest.
      const { x, y } = toPixelPosition(roadPointAt(roadFractionByLocation[locationId]), this.rect);
      const offsets = fanOffsets(visible.length, TOKEN_SPACING * scale);
      visible.forEach((player, i) => {
        visiblePlayerIds.add(player.id);
        let token = this.playerTokens.get(player.id);
        if (!token) {
          token = new Graphics();
          const seatIndex = Number(player.id.slice(1));
          token.circle(0, 0, TOKEN_RADIUS).fill(SEAT_COLORS[seatIndex] ?? "#888888");
          token.stroke({ width: 2, color: "#ffffff" });
          this.tokensLayer.addChild(token);
          this.playerTokens.set(player.id, token);
        }
        token.visible = true;
        token.scale.set(scale);
        token.position.set(x + offsets[i], y);
      });
    }
    for (const [playerId, token] of this.playerTokens) {
      if (!visiblePlayerIds.has(playerId)) token.visible = false;
    }
  }
}
