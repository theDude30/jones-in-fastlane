import type { PlayerState, GoalTargets } from "./types.js";

// §3 / §4 goal score formulas.
export function goalScores(p: PlayerState): GoalTargets {
  const liquidAssets = p.cash + p.bank; // stocks added in a later plan
  return {
    wealth: Math.floor(liquidAssets / 100),
    happiness: p.happiness,
    education: 1 + 9 * p.degrees.length,
    career: p.jobId === null ? 0 : Math.floor(1.25 * p.dependibility),
  };
}

export function hasWon(p: PlayerState): boolean {
  const s = goalScores(p);
  return (
    s.wealth >= p.goals.wealth &&
    s.happiness >= p.goals.happiness &&
    s.education >= p.goals.education &&
    s.career >= p.goals.career
  );
}
