import type { GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import type { Economy } from "./economy.js";
import { hasWon } from "./goals.js";

export function applyStartOfWeek(p: PlayerState, config: GameConfig): void {
  p.relaxation = Math.max(10, p.relaxation - 1);
  p.dependibility = Math.max(0, p.dependibility - config.constants.dependibilityDecayPerWeek);
  p.clothing.casual = Math.max(0, p.clothing.casual - 1);
  p.clothing.dress = Math.max(0, p.clothing.dress - 1);
  p.clothing.business = Math.max(0, p.clothing.business - 1);
  p.locationId = config.constants.homeLocationId;
  p.insideBuilding = false;
  p.brokerMenuOpen = false;
  p.hoursRemaining = config.constants.hoursPerTurn;
}

export function advanceTurn(
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
  economy: Economy,
): void {
  const wasLast = state.currentPlayerIndex === state.players.length - 1;
  state.currentPlayerIndex = wasLast ? 0 : state.currentPlayerIndex + 1;

  if (wasLast) {
    state.week += 1;
    events.push({ type: "WeekAdvanced", week: state.week });

    // Economy step: runs once per week, before the first player's new turn.
    // currentPlayerIndex is now 0 (just wrapped); this is the "turn player" for
    // crash/boom happiness effects.
    const result = economy.step(
      state.economy,
      state.week,
      state.currentPlayerIndex,
      state.players.length,
      config.economy,
      state.rng,
      state.players,
    );
    state.economy = { index: result.index, reading: result.reading };
    state.rng = result.rng;

    // Apply player updates (wage cuts, fires, happiness deltas).
    for (const update of result.playerUpdates) {
      const player = state.players.find((p) => p.id === update.playerId);
      if (!player) continue;
      if (update.fired) {
        player.jobId = null;
        player.wage = 0;
        player.raisesReceived = 0;
      }
      if (update.wage !== undefined) player.wage = update.wage;
      if (update.happiness !== undefined) player.happiness += update.happiness;
    }

    events.push(...result.events);
  }

  const upNext = state.players[state.currentPlayerIndex];
  applyStartOfWeek(upNext, config);
  if (hasWon(upNext)) {
    if (!state.winners.includes(upNext.id)) state.winners.push(upNext.id);
    state.status = "ended";
    events.push({ type: "PlayerWon", playerId: upNext.id });
  }
}
