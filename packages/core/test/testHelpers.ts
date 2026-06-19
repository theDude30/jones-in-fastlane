import type { GameConfig } from "@jones/config";
import type { GameState } from "../src/types.js";

/**
 * createInitialGame now runs one start-of-turn pass (decay, food/health) on
 * seat 0, matching what every other seat already gets on its own first turn
 * (bug fix: seat 0 previously got an undeserved free pass). Tests that build
 * a scenario from a fresh game and assert exact hour/happiness/decay/cash
 * deltas need a pristine baseline first — this restores exactly what that
 * pass can touch, back to createInitialGame's defaults, including the RNG
 * state (the pass's Doctor Visit roll can consume a draw, which would
 * otherwise shift any seed-calibrated luck roll the test makes afterward).
 *
 * `seed` must be the same seed originally passed to createInitialGame —
 * state.rng.seed is the live, already-advanced RNG state, not recoverable.
 */
export function resetToFreshTurn(state: GameState, config: GameConfig, seed: number): void {
  const c = config.constants;
  const p = state.players[0];
  p.hoursRemaining = c.hoursPerTurn;
  p.happiness = 0;
  p.cash = c.initialCash;
  p.relaxation = c.initialRelaxation;
  p.dependibility = c.initialDependibility;
  p.clothing = { casual: c.initialCasualWeeks, dress: 0, business: 0 };
  p.freshFood = 0;
  p.fastFood = 0;
  p.happyGroupsThisTurn = [];
  state.rng = { seed };
}
