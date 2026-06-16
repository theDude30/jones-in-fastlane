import type { GameConfig } from "@jones/config";
import type { Command, GameEvent, GameState, PlayerState, ReduceResult } from "./types.js";
import { travelHours } from "./travel.js";
import { findJob, meetsUniform } from "./work.js";
import { advanceTurn } from "./turn.js";
import { makeEconomy } from "./economy.js";
import { applyForJob, requestRaise, quitJob } from "./hire.js";

function current(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({ ...p, clothing: { ...p.clothing }, degrees: [...p.degrees], goals: { ...p.goals } })),
    rng: { ...state.rng },
    winners: [...state.winners],
    economy: { ...state.economy },
  };
}

export function reduce(state: GameState, command: Command, config: GameConfig): ReduceResult {
  const events: GameEvent[] = [];
  const next = cloneState(state);
  const p = current(next);
  const economy = makeEconomy(config);

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
    case "Work": {
      if (p.jobId === null) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
        break;
      }
      const job = findJob(config, p.jobId);
      if (!p.insideBuilding || p.locationId !== job.locationId) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "not at workplace" });
        break;
      }
      if (p.hoursRemaining <= 0) {
        events.push({ type: "NotEnoughTime", playerId: p.id, action: "Work" });
        break;
      }
      if (p.dependibility < job.reqDependibility - 5) {
        const firedJobId = p.jobId;
        p.jobId = null;
        p.wage = 0;
        events.push({ type: "Fired", playerId: p.id, jobId: firedJobId });
        break;
      }
      if (!meetsUniform(p, job.uniform)) {
        events.push({ type: "InvalidAction", playerId: p.id, reason: "missing uniform" });
        break;
      }
      const fullHours = config.actionCosts.work;
      const hours = Math.min(fullHours, p.hoursRemaining);
      const earned = Math.floor((config.constants.workWageMultiplier * p.wage * hours) / fullHours);
      p.cash += earned;
      p.hoursRemaining -= hours;
      if (p.experience < p.maxExperience) p.experience += 1;
      if (p.dependibility < p.maxDependibility) p.dependibility += 1;
      events.push({ type: "Worked", playerId: p.id, earned });
      break;
    }
    case "EndTurn": {
      events.push({ type: "TurnEnded", playerId: p.id });
      advanceTurn(next, config, events, economy);
      break;
    }
    case "ApplyForJob": {
      applyForJob(command.jobId, next, config, economy, events);
      break;
    }
    case "RequestRaise": {
      requestRaise(next, config, economy, events);
      break;
    }
    case "QuitJob": {
      quitJob(next, events);
      break;
    }
    default:
      events.push({ type: "InvalidAction", playerId: p.id, reason: `unhandled command ${(command as Command).type}` });
  }

  return { state: next, events };
}
