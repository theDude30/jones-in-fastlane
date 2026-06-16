import type { GameConfig, StockId } from "@jones/config";
import type { GameState, GoalTargets, PlayerState } from "./types.js";

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
  }));
  return {
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
  };
}
