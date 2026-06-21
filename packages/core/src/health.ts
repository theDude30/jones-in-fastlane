import type { DurableType, GameConfig, StockId } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import { nextFloat, nextInt } from "./rng.js";
import { bestUniform, findJob } from "./work.js";

/** True if the player owns any durable of the given type (any store variant). */
export function ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean {
  return p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === durableType);
}

/**
 * §4 Net Worth — used only for Donation eligibility. Liquid Assets (cash +
 * bank + current stock value) plus the value of every durable the player
 * holds, whether currently owned or currently pawned. Sums every holding's
 * own recorded pricePaid directly rather than grouping by durableType and
 * using only the "last unit's" price — the data model has no
 * acquisition-order timestamp on `durables` to determine "last," and in
 * the normal case (at most one item per durableType at a time) the two
 * formulas are identical.
 */
export function netWorth(p: PlayerState, state: GameState): number {
  const stockValue = (Object.keys(p.stocks) as StockId[]).reduce(
    (sum, id) => sum + p.stocks[id] * state.stockPrices[id],
    0,
  );
  const ownedDurableValue = p.durables.reduce((sum, d) => sum + d.pricePaid, 0);
  const pawnedDurableValue = state.pawnedItems
    .filter((pi) => pi.pawnedByPlayerId === p.id)
    .reduce((sum, pi) => sum + pi.pricePaid, 0);
  return p.cash + p.bank + stockValue + ownedDurableValue + pawnedDurableValue;
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

/**
 * §2 step 17 / §12 Donation: a player with no clothing at all for 2+
 * consecutive turns, cash under $300, and Net Worth under $300 receives a
 * cash grant — enough for their job's required uniform (or $50 flat if
 * unemployed) plus a random $1-100. The counter resets to 0 whenever the
 * player has any clothing, or immediately after a donation.
 */
export function applyDonation(
  p: PlayerState,
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
): void {
  if (bestUniform(p) !== null) {
    p.weeksWithoutClothes = 0;
    return;
  }
  p.weeksWithoutClothes += 1;
  if (p.weeksWithoutClothes < 2) return;
  if (p.cash >= 300 || netWorth(p, state) >= 300) return;

  let base: number;
  if (p.jobId === null) {
    base = 50;
  } else {
    const job = findJob(config, p.jobId);
    const candidates = config.items
      .filter((it) => it.clothingCategory === job.uniform)
      .sort((a, b) => a.basePrice - b.basePrice);
    base = candidates[0]?.basePrice ?? 50;
  }

  const roll = nextInt(state.rng, 1, 100);
  state.rng = roll.state;
  const amount = base + roll.value;
  p.cash += amount;
  p.weeksWithoutClothes = 0;
  events.push({ type: "DonationReceived", playerId: p.id, amount });
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
