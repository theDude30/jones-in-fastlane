import { nextInt } from "@jones/core";
import type { Command, GameState, RngState } from "@jones/core";
import type { GameConfig } from "@jones/config";
import type { Agent } from "./types.js";
import { legalCommands } from "./selectors.js";

/** Easy baseline: uniformly picks any currently-legal command (incl. EndTurn). */
export class RandomPlanner implements Agent {
  private rng: RngState;
  constructor(seed: number, private readonly config: GameConfig) {
    this.rng = { seed };
  }

  nextCommand(state: GameState, playerId: string): Command {
    const legal = legalCommands(state, playerId, this.config);
    const r = nextInt(this.rng, 0, legal.length - 1);
    this.rng = r.state;
    return legal[r.value];
  }
}
