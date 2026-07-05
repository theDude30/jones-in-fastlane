import type { GameConfig } from "@jones/config";
import { createInitialGame } from "@jones/core";
import type { GameState, GoalTargets } from "@jones/core";

const DEFAULT_GOALS: GoalTargets = { wealth: 100, happiness: 100, education: 100, career: 100 };

/**
 * A fresh solo game, reset to a pristine turn-1 baseline. createInitialGame
 * runs one start-of-turn pass (decay, food/health) on seat 0 at creation, so
 * this restores exactly what that pass can touch — including the RNG state,
 * whose Doctor Visit roll can consume a draw that would otherwise shift any
 * seed-calibrated luck roll a test makes afterward.
 */
export function solo(config: GameConfig, goals: GoalTargets = DEFAULT_GOALS): GameState {
  const g = createInitialGame(config, 1, [{ name: "A", isAI: true, goals }]);
  const c = config.constants;
  const p = g.players[0];
  p.hoursRemaining = c.hoursPerTurn;
  p.happiness = 0;
  p.cash = c.initialCash;
  p.relaxation = c.initialRelaxation;
  p.dependibility = c.initialDependibility;
  p.clothing = { casual: c.initialCasualWeeks, dress: 0, business: 0 };
  g.rng = { seed: 1 };
  return g;
}
