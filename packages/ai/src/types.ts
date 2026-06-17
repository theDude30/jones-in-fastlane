import type { Command, GameState } from "@jones/core";

/**
 * An AI seat. Stateful: implementations own their seeded RNG.
 * `nextCommand` treats `state` as read-only and returns the next command for
 * `playerId`, or `{ type: "EndTurn" }` when done for the week.
 */
export interface Agent {
  nextCommand(state: GameState, playerId: string): Command;
}
