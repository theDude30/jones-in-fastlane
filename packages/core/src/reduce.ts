import type { GameConfig } from "@jones/config";
import type { Command, GameEvent, GameState, PlayerState, ReduceResult } from "./types.js";
import { travelHours } from "./travel.js";

function current(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

/** Returns a deep-ish clone safe to mutate for the current player. */
function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, clothing: { ...p.clothing }, degrees: [...p.degrees], goals: { ...p.goals } })),
    rng: { ...state.rng },
    winners: [...state.winners],
  };
}

export function reduce(state: GameState, command: Command, config: GameConfig): ReduceResult {
  const events: GameEvent[] = [];
  const next = cloneState(state);
  const p = current(next);

  switch (command.type) {
    case "TravelTo": {
      if (p.insideBuilding) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "must exit building before traveling" });
        break;
      }
      const hours = travelHours(config, p.locationId, command.locationId);
      if (hours > p.hoursRemaining) {
        events.push({ type: "NotEnoughTime", playerId: p.id, action: "TravelTo" });
        break;
      }
      p.hoursRemaining -= hours;
      p.locationId = command.locationId;
      events.push({ type: "Traveled", playerId: p.id, toLocationId: command.locationId, hoursSpent: hours });
      break;
    }
    case "EnterBuilding": {
      if (p.insideBuilding) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "already inside" });
        break;
      }
      const cost = config.actionCosts.enterLocation;
      if (cost > p.hoursRemaining) {
        events.push({ type: "NotEnoughTime", playerId: p.id, action: "EnterBuilding" });
        break;
      }
      p.hoursRemaining -= cost;
      p.insideBuilding = true;
      events.push({ type: "EnteredBuilding", playerId: p.id, locationId: p.locationId });
      break;
    }
    case "ExitBuilding": {
      if (!p.insideBuilding) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "not inside" });
        break;
      }
      p.insideBuilding = false;
      events.push({ type: "ExitedBuilding", playerId: p.id, locationId: p.locationId });
      break;
    }
    default:
      events.push({ type: "InvalidAction", playerId: p.id, reason: `unhandled command ${command.type}` });
  }

  return { state: next, events };
}
