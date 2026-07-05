import type { GameConfig, AIDifficultyPreset } from "@jones/config";
import type { Agent } from "./types.js";
import { RandomPlanner } from "./random.js";
import { BudgetPlanner } from "./planner.js";

/** Build an agent for a seat, deterministically seeded from the game seed + seat index. */
export function makeAgent(
  preset: AIDifficultyPreset,
  config: GameConfig,
  gameSeed: number,
  seatIndex: number,
): Agent {
  const seed = gameSeed * 1000 + seatIndex;
  return preset.planner === "random"
    ? new RandomPlanner(seed, config)
    : new BudgetPlanner(seed, preset, config);
}
