import { ownsDurableType, findJob } from "@jones/core";
import type { Economy, GameState, PlayerState } from "@jones/core";
import type { GameConfig, ItemDef, UniformLevel } from "@jones/config";
import { canAfford } from "./selectors.js";

export const PLANNER_TUNING = {
  weeklyBuffer: 50,
  happinessBuffer: 2,
  wageUpgradeThreshold: 2,
  relaxationThreshold: 12,
  rentPayHorizonWeeks: 1,
  rentReserveHorizonWeeks: 2,
  fridgeLowWaterWeeks: 1,
  clothingLowWaterWeeks: 1,
} as const;

export function adjustedItemPrice(item: ItemDef, state: GameState, economy: Economy): number {
  return item.fixedPrice ? item.basePrice : economy.adjustedPrice(item.basePrice, state.economy.reading);
}

export function affordableItems(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  predicate: (item: ItemDef) => boolean,
): Array<{ item: ItemDef; price: number }> {
  return config.items
    .filter(predicate)
    .map((item) => ({ item, price: adjustedItemPrice(item, state, economy) }))
    .filter(({ price }) => canAfford(p, price));
}

export interface TurnBudget {
  rentReserve: number;
  foodReserve: number;
  uniformReserve: number;
  cashFloor: number;
  discretionary: number;
}

export function computeBudget(p: PlayerState, state: GameState, config: GameConfig, economy: Economy): TurnBudget {
  const rentReserve =
    p.rentDueWeek - state.week <= PLANNER_TUNING.rentReserveHorizonWeeks ? p.currentRent : 0;

  const hasFridge = ownsDurableType(p, config, "refrigerator");
  const foodCandidates = hasFridge
    ? affordableItems(p, state, config, economy, (it) => it.category === "freshFood")
    : affordableItems(p, state, config, economy, (it) => it.category === "fastFood");
  const foodReserve = foodCandidates.length > 0 ? Math.min(...foodCandidates.map((c) => c.price)) : 0;

  const requiredLevel: UniformLevel = p.jobId !== null ? findJob(config, p.jobId).uniform : "casual";
  const uniformCandidates = affordableItems(p, state, config, economy, (it) => it.clothingCategory === requiredLevel);
  const uniformReserve = uniformCandidates.length > 0 ? Math.min(...uniformCandidates.map((c) => c.price)) : 0;

  const cashFloor = rentReserve + foodReserve + uniformReserve + PLANNER_TUNING.weeklyBuffer;
  const discretionary = Math.max(0, p.cash - cashFloor);

  return { rentReserve, foodReserve, uniformReserve, cashFloor, discretionary };
}
