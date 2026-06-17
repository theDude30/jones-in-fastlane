import type { AIDifficultyPreset } from "./types.js";

const evenWeights = { wealth: 1, happiness: 1, education: 1, career: 1 };

export const aiDifficulty: Record<"easy" | "medium" | "hard", AIDifficultyPreset> = {
  easy: { planner: "random", weights: { ...evenWeights }, epsilon: 0 },
  medium: { planner: "greedy", weights: { ...evenWeights }, epsilon: 0.15 },
  hard: { planner: "greedy", weights: { ...evenWeights }, epsilon: 0 },
};
