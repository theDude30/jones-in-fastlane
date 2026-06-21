import type { GameConfig, StockId } from "@jones/config";
import type { GameEvent, GameState, GoalTargets, PlayerState } from "./types.js";
import { applyStartOfWeek, applyDueDates } from "./turn.js";
import { applyFoodAndHealth } from "./health.js";
import { hasWon } from "./goals.js";

export interface PlayerSetup {
  name: string;
  isAI: boolean;
  goals: GoalTargets;
}

export function createInitialGame(
  config: GameConfig,
  seed: number,
  setups: PlayerSetup[],
): GameState {
  const c = config.constants;
  if (setups.length < 1 || setups.length > c.maxPlayers) {
    throw new Error(`player count must be 1..${c.maxPlayers}`);
  }
  const homeRent = config.locations.find((l) => l.id === c.homeLocationId)?.baseRent ?? 0;
  const players: PlayerState[] = setups.map((s, i) => ({
    id: `p${i}`,
    name: s.name,
    isAI: s.isAI,
    cash: c.initialCash,
    bank: 0,
    happiness: 0,
    dependibility: c.initialDependibility,
    experience: c.initialExperience,
    relaxation: c.initialRelaxation,
    maxDependibility: c.initialDependibility,
    maxExperience: c.initialExperience,
    degrees: [],
    enrollments: [],
    extraCredit: 0,
    jobId: null,
    wage: 0,
    raisesReceived: 0,
    locationId: c.homeLocationId,
    insideBuilding: false,
    clothing: { casual: c.initialCasualWeeks, dress: 0, business: 0 },
    goals: { ...s.goals },
    hoursRemaining: c.hoursPerTurn,
    fastFood: 0,
    freshFood: 0,
    durables: [],
    tickets: { baseball: 0, theatre: 0, concert: 0 },
    happyGroupsThisTurn: [],
    stocks: Object.fromEntries(config.stocks.map((s) => [s.id, 0])) as Record<StockId, number>,
    tBills: 0,
    loanBalance: 0,
    loanDueWeek: null,
    timesDefaulted: 0,
    loanInDefault: false,
    brokerMenuOpen: false,
    lotteryTickets: 0,
    apartmentId: c.homeLocationId,
    currentRent: homeRent,
    rentDueWeek: c.weeksPerMonth,
    rentDebt: 0,
    rentExtensionsApproved: 0,
    everInRentDebt: false,
    rentExtensionUsedThisTurn: false,
    weeksWithoutClothes: 0,
  }));
  const state: GameState = {
    week: 1,
    currentPlayerIndex: 0,
    players,
    economy: { index: config.economy.initialIndex, reading: config.economy.initialReading },
    rng: { seed },
    status: "playing",
    winners: [],
    stockPrices: Object.fromEntries(
      config.stocks.map((s) => [s.id, s.basePrice])
    ) as Record<StockId, number>,
    pawnedItems: [],
  };

  // Mirrors advanceTurn's tail exactly: every seat undergoes one start-of-turn
  // pass (decay, due dates, food/health) before its first action. advanceTurn
  // already does this for every seat the moment it becomes "upNext" — seat 0
  // never goes through advanceTurn for its own first turn, so it needs the
  // same pass run here, at creation, or it gets an undeserved free pass (e.g.
  // never starving despite starting with no food, while every other seat does).
  const discardedEvents: GameEvent[] = [];
  const first = state.players[0];
  applyStartOfWeek(first, config);
  if (hasWon(first)) {
    state.winners.push(first.id);
    state.status = "ended";
  } else {
    applyDueDates(first, state, config, discardedEvents);
    applyFoodAndHealth(first, state, config, discardedEvents);
  }

  return state;
}
