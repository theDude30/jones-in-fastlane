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

// §3 timed-game ranking. Average of the four per-goal completion ratios,
// each capped ABOVE at 1 (overshooting one goal cannot offset missing
// another) but NOT floored below 0 (a deeply negative goal, e.g. large
// negative happiness, must rank below a zero one). Used only to pick a
// winner when the game ends by the maxWeeks cap.
export function goalCompletion(p: PlayerState): number {
  const s = goalScores(p);
  const g = p.goals;
  const ratio = (score: number, target: number) => Math.min(score / target, 1);
  return (
    ratio(s.wealth, g.wealth) +
    ratio(s.happiness, g.happiness) +
    ratio(s.education, g.education) +
    ratio(s.career, g.career)
  ) / 4;
}

// The player with the greatest goalCompletion. Iterates in seat (array)
// order and replaces the leader only on a STRICTLY greater score, so an
// exact tie resolves to the earlier seat — fully deterministic, no RNG.
// Assumes a non-empty players array (always true for a real game).
export function leadingPlayer(players: PlayerState[]): PlayerState {
  let leader = players[0];
  let best = goalCompletion(leader);
  for (let i = 1; i < players.length; i++) {
    const c = goalCompletion(players[i]);
    if (c > best) {
      best = c;
      leader = players[i];
    }
  }
  return leader;
}
