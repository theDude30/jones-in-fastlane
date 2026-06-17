import type { DurableType, GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { nextFloat, nextInt } from "./rng.js";

/** True if the player owns any durable of the given type (any store variant). */
export function ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean {
  return p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === durableType);
}

/**
 * Start-of-turn food/health processing (§12), called after the win check.
 * Order: Spoiled Food, then Starvation, then Doctor Visit (each can feed
 * into the next: spoilage can cause starvation; either can trigger a
 * Doctor Visit, alongside Relaxation sitting at its decay floor of 10).
 */
export function applyFoodAndHealth(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
): void {
  // Spoiled Food.
  let spoiledThisTurn = false;
  if (!ownsDurableType(p, config, "refrigerator")) {
    if (p.freshFood > 0) {
      p.freshFood = 0;
      p.happiness -= 2;
      spoiledThisTurn = true;
      events.push({ type: "FoodSpoiled", playerId: p.id });
    }
  } else {
    const capacity =
      config.constants.freshFoodFridgeCapacity +
      (ownsDurableType(p, config, "freezer") ? config.constants.freshFoodFreezerBonus : 0);
    if (p.freshFood > capacity) {
      const excess = p.freshFood - capacity;
      p.freshFood = capacity;
      p.happiness -= 1;
      events.push({ type: "FoodSpoiled", playerId: p.id, excess });
    }
  }

  // Starvation: fed via a fridge-stored fresh food unit, or via fast food bought last turn.
  let fed = false;
  if (ownsDurableType(p, config, "refrigerator") && p.freshFood > 0) {
    p.freshFood -= 1;
    fed = true;
  } else if (p.fastFood > 0) {
    fed = true;
  }
  let starvedThisTurn = false;
  if (!fed) {
    p.hoursRemaining = Math.max(0, p.hoursRemaining - config.constants.starvationHoursLost);
    p.happiness -= 2;
    starvedThisTurn = true;
    events.push({ type: "PlayerStarved", playerId: p.id, hoursLost: config.constants.starvationHoursLost });
  }
  p.fastFood = 0;

  // Doctor Visit: up to three independent rolls; at most one visit. Rolls
  // only as many conditions as needed — stops once one triggers, since
  // the player-visible outcome (one visit, or none) is the same either way.
  let triggered = false;
  if (starvedThisTurn) {
    const r = nextFloat(state.rng);
    state.rng = r.state;
    if (r.value < 0.25) triggered = true;
  }
  if (!triggered && spoiledThisTurn) {
    const r = nextFloat(state.rng);
    state.rng = r.state;
    if (r.value < 0.5) triggered = true;
  }
  if (!triggered && p.relaxation === 10) {
    const r = nextFloat(state.rng);
    state.rng = r.state;
    if (r.value < 0.2) triggered = true;
  }

  if (triggered && p.cash > 0) {
    p.hoursRemaining = Math.max(0, p.hoursRemaining - config.constants.doctorHoursLost);
    p.happiness -= 4;
    let cost: number;
    if (p.cash >= 500) {
      const r = nextInt(state.rng, 30, 200);
      state.rng = r.state;
      cost = r.value;
    } else if (p.cash >= 50) {
      const r = nextInt(state.rng, 30, 50);
      state.rng = r.state;
      cost = r.value;
    } else if (p.cash >= 31) {
      const r = nextInt(state.rng, 30, p.cash);
      state.rng = r.state;
      cost = r.value;
    } else {
      cost = p.cash;
    }
    p.cash -= cost;
    events.push({
      type: "DoctorVisited",
      playerId: p.id,
      hoursLost: config.constants.doctorHoursLost,
      happinessCost: 4,
      cost,
    });
  }
}

/** §2 Relax — only at the player's own apartment; restores Relaxation, first-per-turn happiness. */
export function relax(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];

  if (!p.insideBuilding || p.locationId !== p.apartmentId) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "must be at your own apartment" });
    return;
  }
  if (config.actionCosts.relax > p.hoursRemaining) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "Relax" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.relax;
  p.relaxation = Math.min(config.constants.maxRelaxation, p.relaxation + config.constants.relaxAmount);

  let happinessGained = 0;
  if (!p.happyGroupsThisTurn.includes("relax")) {
    happinessGained = 2;
    p.happiness += happinessGained;
    p.happyGroupsThisTurn.push("relax");
  }

  events.push({ type: "Relaxed", playerId: p.id, relaxation: p.relaxation, happinessGained });
}
