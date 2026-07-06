import { Assets, Container, Graphics, Sprite, Text, Texture, Ticker } from "pixi.js";
import { defaultConfig } from "@jones/config";
import type { GameState } from "@jones/core";
import {
  BOARD_ASPECT,
  boardLayout,
  computeBoardRect,
  roadFractionByLocation,
  roadHeadingAt,
  roadPointAt,
  shortestRoadDelta,
  toPixelPosition,
} from "./layout.js";
import type { BoardRect } from "./layout.js";
import { buildingColor } from "./buildingStyles.js";
import { clusterPlayersByLocation, fanOffsets } from "./playerClusters.js";

const CARD_WIDTH = 96;
const CARD_HEIGHT = 56;
const CAR_SIZE = 64;
const TOKEN_SPACING = 50;
const TRAVEL_DURATION_MS = 400;
const SEAT_COLORS = ["#2a7fff", "#e0524a", "#2eb872", "#caa12e"];
const BACKDROP_URL = "/board/town-backdrop.png";
const CAR_URL = "/board/car.png";

// Locations with dedicated illustrated art instead of the flat placeholder
// card. `size` is the sprite's width/height in the same reference-scale
// units as CARD_WIDTH/HEIGHT (the container's own scale transform handles
// shrinking it to fit the actual board size, same as the card graphics).
// `verticalOffset` nudges the art (and its label) up or down from the
// location's boardLayout point, in the same units — needed when a larger
// icon would otherwise clip past the board canvas's edge, which has zero
// margin on whichever side the board's aspect ratio pins to the
// container. employmentOffice sits at y=0.901, a hair from the bottom.
const CUSTOM_BUILDING_ART: Partial<Record<string, { url: string; size: number; verticalOffset: number }>> = {
  employmentOffice: { url: "/board/employment-office.png", size: 112, verticalOffset: -26 },
  // hiTechU sits at y=0.868 — closer to the bottom edge than most
  // locations, needing the same upward nudge as employmentOffice.
  hiTechU: { url: "/board/hi-tech-u.png", size: 112, verticalOffset: -14 },
};

// The car artwork's nose points toward the bottom of its source image (+y,
// i.e. `atan2` angle +90°) — this offset rotates that default orientation to
// match whatever heading angle the car is actually facing on the road.
const CAR_NOSE_OFFSET = Math.PI / 2;

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
  private buildingCards = new Map<
    string,
    { container: Container; graphics: Graphics; label: Text; sprite?: Sprite }
  >();
  private playerTokens = new Map<string, Sprite>();
  private carTexture: Texture | null = null;
  private customArtTextures = new Map<string, Texture>();
  private rect: BoardRect = { boardWidth: 0, boardHeight: 0, offsetX: 0, offsetY: 0 };
  private lastState: GameState | null = null;
  private activeAnimations = new Map<string, { token: Sprite; tick: (ticker: Ticker) => void }>();
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

    // Car artwork loads asynchronously too; tokens can't be created as
    // sprites until it resolves, so redraw once it's ready (same guard/retry
    // pattern as the backdrop above).
    Assets.load(CAR_URL).then((texture) => {
      if (this.destroyed) return;
      this.carTexture = texture;
      if (this.lastState) this.drawTokens(this.lastState);
    });

    // Illustrated building art (currently just Employment Office) loads the
    // same way — redraw once each one resolves so it appears without
    // waiting for the next unrelated state change.
    for (const [locationId, art] of Object.entries(CUSTOM_BUILDING_ART)) {
      Assets.load(art!.url).then((texture) => {
        if (this.destroyed) return;
        this.customArtTextures.set(locationId, texture);
        if (this.lastState) this.drawBuildingCards(this.lastState);
      });
    }

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
      this.buildingCards.set(loc.id, { container, graphics, label });
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

  /** Whether `playerId` currently has an in-flight travel animation. */
  isAnimating(playerId: string): boolean {
    return this.activeAnimations.has(playerId);
  }

  playTravelAnimation(
    playerId: string,
    fromLocationId: string,
    toLocationId: string,
    onComplete: () => void,
  ): void {
    this.cancelAnimation(playerId);
    // The car texture loads asynchronously; travel commands already landed
    // in game state by the time this is called, so if the sprite isn't
    // ready yet, skip the visual and still fire the follow-up command.
    if (!this.carTexture) {
      onComplete();
      return;
    }
    const scale = this.scale;
    const seatIndex = Number(playerId.slice(1));
    // Animate along the road's actual drawn centerline, not a straight line
    // between the two buildings — `shortestRoadDelta` picks the same
    // direction (and matching hour cost) @jones/core's travelHours already
    // charged, so the trip a player sees always matches what they paid for.
    const fromFraction = roadFractionByLocation[fromLocationId];
    const delta = shortestRoadDelta(fromLocationId, toLocationId);
    const direction: 1 | -1 = delta >= 0 ? 1 : -1;
    const start = toPixelPosition(roadPointAt(fromFraction), this.rect);

    const token = new Sprite(this.carTexture);
    token.anchor.set(0.5);
    token.tint = SEAT_COLORS[seatIndex] ?? "#888888";
    token.width = CAR_SIZE * scale;
    token.height = CAR_SIZE * scale;
    token.position.set(start.x, start.y);
    token.rotation = roadHeadingAt(fromFraction, direction, this.rect) - CAR_NOSE_OFFSET;
    this.animationLayer.addChild(token);

    // Redraw the static token layer now, excluding the animating player, so
    // there is never a duplicate render of their token while it animates.
    if (this.lastState) this.drawTokens(this.lastState);

    let elapsed = 0;
    const tick = (ticker: Ticker) => {
      elapsed += ticker.deltaMS;
      const t = Math.min(1, elapsed / TRAVEL_DURATION_MS);
      const s = fromFraction + delta * t;
      const point = toPixelPosition(roadPointAt(s), this.rect);
      token.position.set(point.x, point.y);
      token.rotation = roadHeadingAt(s, direction, this.rect) - CAR_NOSE_OFFSET;
      if (t >= 1) {
        this.cancelAnimation(playerId);
        if (this.lastState) this.drawTokens(this.lastState);
        onComplete();
      }
    };
    this.activeAnimations.set(playerId, { token, tick });
    Ticker.shared.add(tick);
  }

  destroy(): void {
    this.destroyed = true;
    for (const playerId of [...this.activeAnimations.keys()]) this.cancelAnimation(playerId);
    this.backdropLayer.destroy({ children: true });
    this.buildingsLayer.destroy({ children: true });
    this.tokensLayer.destroy({ children: true });
    this.animationLayer.destroy({ children: true });
    this.playerTokens.clear();
  }

  private cancelAnimation(playerId: string): void {
    const anim = this.activeAnimations.get(playerId);
    if (!anim) return;
    Ticker.shared.remove(anim.tick);
    this.animationLayer.removeChild(anim.token);
    anim.token.destroy();
    this.activeAnimations.delete(playerId);
  }

  private drawBuildingCards(state: GameState): void {
    const human = state.players[0];
    const scale = this.scale;
    for (const loc of defaultConfig.locations) {
      const entry = this.buildingCards.get(loc.id)!;
      const { container, graphics, label } = entry;
      const { x, y } = toPixelPosition(boardLayout[loc.id], this.rect);
      container.position.set(x, y);
      container.scale.set(scale);
      const isHere = human.insideBuilding && human.locationId === loc.id;

      const art = CUSTOM_BUILDING_ART[loc.id];
      const artTexture = art && this.customArtTextures.get(loc.id);
      graphics.clear();
      if (art && artTexture) {
        // Illustrated art replaces the flat card. The name renders as a
        // pill-backed label overlapping the icon's own bottom edge, inside
        // its footprint — not as a caption below it, which would clip off
        // the board's fixed-height canvas for locations near its outer
        // edge (this one sits at y=0.901, a hair from the bottom). The
        // artwork's own blank signboard is too narrow at board scale for
        // legible text, so it stays a decorative flourish instead.
        if (!entry.sprite) {
          entry.sprite = new Sprite(artTexture);
          entry.sprite.anchor.set(0.5);
          container.addChildAt(entry.sprite, 0);
        }
        entry.sprite.width = art.size;
        entry.sprite.height = art.size;
        entry.sprite.position.set(0, art.verticalOffset);
        const labelY = art.verticalOffset + art.size / 2 - 14;
        graphics.roundRect(-art.size / 2 + 6, labelY - 10, art.size - 12, 20, 8);
        graphics.fill({ color: "#ffffff", alpha: 0.85 });
        if (isHere) {
          graphics.roundRect(-art.size / 2 - 4, art.verticalOffset - art.size / 2 - 4, art.size + 8, art.size + 8, 12);
          graphics.stroke({ width: 3, color: "#222222" });
        }
        label.position.set(0, labelY);
        label.style.wordWrapWidth = art.size - 16;
      } else {
        graphics.roundRect(-CARD_WIDTH / 2, -CARD_HEIGHT / 2, CARD_WIDTH, CARD_HEIGHT, 6);
        graphics.fill(buildingColor(loc.types));
        graphics.stroke({ width: isHere ? 3 : 1.5, color: isHere ? "#222222" : "#444444" });
        label.position.set(0, 0);
        label.style.wordWrapWidth = CARD_WIDTH - 8;
      }
    }
  }

  private drawTokens(state: GameState): void {
    // Tokens are persistent, one Sprite per player, reused and repositioned
    // every call — never recreated. Creating/destroying many display
    // objects within a single synchronous burst (once per syncState call)
    // raced with Pixi's WebGL batch renderer and threw "Cannot read
    // properties of null (reading 'geometry')" intermittently; reusing
    // objects (the same pattern already used for building cards) eliminates
    // the churn that caused it.
    if (!this.carTexture) return;
    const scale = this.scale;
    const clusters = clusterPlayersByLocation(state.players);
    const visiblePlayerIds = new Set<string>();
    for (const [locationId, players] of clusters) {
      const visible = players.filter((p) => !this.activeAnimations.has(p.id));
      // On the road at this location's stop, not on the building card —
      // matches where playTravelAnimation starts and ends, so there's no
      // visual jump between arriving and coming to rest.
      const fraction = roadFractionByLocation[locationId];
      const { x, y } = toPixelPosition(roadPointAt(fraction), this.rect);
      // Parked cars face the direction of forward travel around the ring.
      const rotation = roadHeadingAt(fraction, 1, this.rect) - CAR_NOSE_OFFSET;
      const offsets = fanOffsets(visible.length, TOKEN_SPACING * scale);
      visible.forEach((player, i) => {
        visiblePlayerIds.add(player.id);
        let token = this.playerTokens.get(player.id);
        if (!token) {
          token = new Sprite(this.carTexture!);
          token.anchor.set(0.5);
          const seatIndex = Number(player.id.slice(1));
          token.tint = SEAT_COLORS[seatIndex] ?? "#888888";
          this.tokensLayer.addChild(token);
          this.playerTokens.set(player.id, token);
        }
        token.visible = true;
        token.width = CAR_SIZE * scale;
        token.height = CAR_SIZE * scale;
        token.rotation = rotation;
        token.position.set(x + offsets[i], y);
      });
    }
    for (const [playerId, token] of this.playerTokens) {
      if (!visiblePlayerIds.has(playerId)) token.visible = false;
    }
  }
}
