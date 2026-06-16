import type { GameConstants } from "./types.js";

// §2/§4/§11. hoursPerRingStep: ~10 hours per full 13-step lap → 10/13 ≈ 0.77.
export const constants: GameConstants = {
  hoursPerTurn: 60,
  weeksPerMonth: 4,
  maxPlayers: 4,
  initialCash: 200,
  initialDependibility: 20,
  initialExperience: 10,
  initialRelaxation: 10,
  initialCasualWeeks: 6,
  homeLocationId: "lowCostHousing",
  ringSize: 13,
  hoursPerRingStep: 10 / 13,
  workWageMultiplier: 8,
  dependibilityDecayPerWeek: 3,
  enrollmentBaseFee: 50,
  lessonsPerDegree: 10,
  minLessonsPerDegree: 8,
  graduateDependibilityBonus: 5,
  graduateMaxCapBonus: 5,
  maxEnrollments: 4,
};
