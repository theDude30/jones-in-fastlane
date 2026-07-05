import type { AIDifficultyPreset } from "./types.js";

export const aiDifficulty: Record<"easy" | "medium" | "hard", AIDifficultyPreset> = {
  easy: { planner: "random", epsilon: 0 },
  medium: { planner: "budget", epsilon: 0.15 },
  hard: { planner: "budget", epsilon: 0 },
};
