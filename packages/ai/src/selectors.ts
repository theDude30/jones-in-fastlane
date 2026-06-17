import { goalScores } from "@jones/core";
import type { GameState, PlayerState } from "@jones/core";
import type { GoalWeights } from "@jones/config";

export type GoalKey = "wealth" | "happiness" | "education" | "career";
export const GOAL_KEYS: GoalKey[] = ["wealth", "happiness", "education", "career"];

export function findPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p;
}

/**
 * Unmet goals ordered weakest-first by weighted progress ratio
 * (score / target / weight). A goal with score >= target is excluded.
 */
export function rankedUnmetGoals(p: PlayerState, weights: GoalWeights): GoalKey[] {
  const scores = goalScores(p);
  return GOAL_KEYS.filter((k) => scores[k] < p.goals[k]).sort((a, b) => {
    const pa = scores[a] / p.goals[a] / (weights[a] || 1);
    const pb = scores[b] / p.goals[b] / (weights[b] || 1);
    return pa - pb;
  });
}

/** The single weakest unmet goal, or null if all goals are met. */
export function weakestGoal(p: PlayerState, weights: GoalWeights): GoalKey | null {
  return rankedUnmetGoals(p, weights)[0] ?? null;
}

export const canAfford = (p: PlayerState, cost: number): boolean => p.cash >= cost;
export const hasHours = (p: PlayerState, cost: number): boolean => p.hoursRemaining >= cost;
export const atLocation = (p: PlayerState, locationId: string): boolean => p.locationId === locationId;
export const isInside = (p: PlayerState): boolean => p.insideBuilding;
