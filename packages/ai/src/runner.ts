import { reduce } from "@jones/core";
import type { GameConfig } from "@jones/config";
import type { GameState, GameEvent } from "@jones/core";
import type { Agent } from "./types.js";

export interface Seat {
  playerId: string;
  agent: Agent | null; // null = human / externally driven seat (stops the runner)
}

export interface RunResult {
  state: GameState;
  events: GameEvent[];
  weeks: number;
  winnerId: string | null;
}

export interface RunOptions {
  maxWeeks?: number;
  maxCommandsPerTurn?: number;
}

/**
 * Plays a headless game by looping nextCommand -> reduce for each seated agent.
 * Stops at: game ended, maxWeeks reached, or a null-agent (human) seat.
 */
export function playGame(
  config: GameConfig,
  initial: GameState,
  seats: Seat[],
  opts: RunOptions = {},
): RunResult {
  const maxWeeks = opts.maxWeeks ?? 520;
  const maxCmds = opts.maxCommandsPerTurn ?? 200;
  const byId = new Map(seats.map((s) => [s.playerId, s]));

  let state = initial;
  const events: GameEvent[] = [];

  while (state.status === "playing" && state.week < maxWeeks) {
    const playerId = state.players[state.currentPlayerIndex].id;
    const seat = byId.get(playerId);
    if (!seat || seat.agent === null) break; // human / unseated → hand control back

    const agent = seat.agent;
    let commandsThisTurn = 0;
    let endedTurn = false;
    while (commandsThisTurn < maxCmds) {
      const cmd = agent.nextCommand(state, playerId);
      const r = reduce(state, cmd, config);
      state = r.state;
      events.push(...r.events);
      commandsThisTurn++;
      if (cmd.type === "EndTurn") { endedTurn = true; break; }
      if (state.status !== "playing") { endedTurn = true; break; }
    }
    if (!endedTurn) {
      // Agent stalled — force the turn to end.
      const r = reduce(state, { type: "EndTurn" }, config);
      state = r.state;
      events.push(...r.events);
    }
  }

  return {
    state,
    events,
    weeks: state.week,
    winnerId: state.winners[0] ?? null,
  };
}
