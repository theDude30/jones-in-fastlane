import type { GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { hasWon } from "./goals.js";

/** §2 per-week start effects applied to the player about to take their turn. */
export function applyStartOfWeek(p: PlayerState, config: GameConfig): void {
  // Degrade relaxation (-1, min 10).
  p.relaxation = Math.max(10, p.relaxation - 1);
  // Weekly dependibility decay (-3, min 0).
  p.dependibility = Math.max(0, p.dependibility - config.constants.dependibilityDecayPerWeek);
  // Decrement clothing weeks (min 0).
  p.clothing.casual = Math.max(0, p.clothing.casual - 1);
  p.clothing.dress = Math.max(0, p.clothing.dress - 1);
  p.clothing.business = Math.max(0, p.clothing.business - 1);
  // Reset position + clock.
  p.locationId = config.constants.homeLocationId;
  p.insideBuilding = false;
  p.hoursRemaining = config.constants.hoursPerTurn;
}

/**
 * Advances control to the next player. When wrapping past the last player,
 * increments the week. Then runs per-week effects + win check for the player
 * who is about to act. Mutates `state`; pushes events.
 */
export function advanceTurn(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const wasLast = state.currentPlayerIndex === state.players.length - 1;
  state.currentPlayerIndex = wasLast ? 0 : state.currentPlayerIndex + 1;
  if (wasLast) {
    state.week += 1;
    events.push({ type: "WeekAdvanced", week: state.week });
  }
  const upNext = state.players[state.currentPlayerIndex];
  applyStartOfWeek(upNext, config);
  if (hasWon(upNext)) {
    if (!state.winners.includes(upNext.id)) state.winners.push(upNext.id);
    state.status = "ended";
    events.push({ type: "PlayerWon", playerId: upNext.id });
  }
}
