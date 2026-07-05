import { makeEconomy, nextFloat, nextInt } from "@jones/core";
import type { Command, GameState, RngState } from "@jones/core";
import type { GameConfig, AIDifficultyPreset } from "@jones/config";
import type { Agent } from "./types.js";
import { findPlayer, legalCommands } from "./selectors.js";
import { computeBudget } from "./budget.js";
import { emergencyLiquidity } from "./fallback.js";
import {
  eatRung,
  rentRung,
  clothesRung,
  healthRung,
  employmentRung,
  depMaintenanceWorkRung,
  cashFloorWorkRung,
  educationRung,
  happinessRung,
  wealthSweepRung,
} from "./rungs.js";
import type { TurnContext } from "./rungs.js";

const LADDER: Array<(ctx: TurnContext) => Command | null> = [
  eatRung,
  rentRung,
  clothesRung,
  healthRung,
  employmentRung,
  depMaintenanceWorkRung,
  cashFloorWorkRung,
  educationRung,
  happinessRung,
  wealthSweepRung,
];

/** Budgeted priority ladder: re-derives a TurnBudget every call, walks a fixed rung order. */
export class BudgetPlanner implements Agent {
  private rng: RngState;
  constructor(
    seed: number,
    private readonly preset: AIDifficultyPreset,
    private readonly config: GameConfig,
  ) {
    this.rng = { seed };
  }

  nextCommand(state: GameState, playerId: string): Command {
    const p = findPlayer(state, playerId);

    if (this.preset.epsilon > 0) {
      const r = nextFloat(this.rng);
      this.rng = r.state;
      if (r.value < this.preset.epsilon) return this.randomLegal(state, playerId);
    }

    const economy = makeEconomy(this.config);
    const budget = computeBudget(p, state, this.config, economy);
    const ctx: TurnContext = { state, player: p, config: this.config, economy, budget };

    for (const rung of LADDER) {
      const cmd = rung(ctx);
      if (cmd) return cmd;
    }

    const liquidity = emergencyLiquidity(p, state, this.config);
    if (liquidity) return liquidity;
    return { type: "EndTurn" };
  }

  private randomLegal(state: GameState, playerId: string): Command {
    const legal = legalCommands(state, playerId, this.config);
    const r = nextInt(this.rng, 0, legal.length - 1);
    this.rng = r.state;
    return legal[r.value];
  }
}
