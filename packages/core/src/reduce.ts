import type { GameConfig } from "@jones/config";
import type { Command, GameEvent, GameState, PlayerState, ReduceResult } from "./types.js";
import { travelHours } from "./travel.js";
import { findJob, meetsUniform } from "./work.js";
import { advanceTurn } from "./turn.js";
import { makeEconomy } from "./economy.js";
import { applyForJob, requestRaise, quitJob } from "./hire.js";
import { enroll, study } from "./education.js";
import { buyItem } from "./shopping.js";
import { deposit, withdraw, applyLoan, openBroker, buyStock, sellStock, buyTBill, sellTBill, buyLotteryTickets } from "./finance.js";
import { payRent, requestRentExtension, switchApartment, applyGarnishment } from "./housing.js";

function current(state: GameState): PlayerState {
  return state.players[state.currentPlayerIndex];
}

function cloneState(state: GameState): GameState {
  return {
    ...state,
    players: state.players.map((p) => ({
      ...p,
      clothing: { ...p.clothing },
      degrees: [...p.degrees],
      enrollments: p.enrollments.map((e) => ({ ...e })),
      goals: { ...p.goals },
      durables: p.durables.map((d) => ({ ...d })),
      tickets: { ...p.tickets },
      happyGroupsThisTurn: [...p.happyGroupsThisTurn],
      stocks: { ...p.stocks },
    })),
    rng: { ...state.rng },
    winners: [...state.winners],
    economy: { ...state.economy },
    stockPrices: { ...state.stockPrices },
    pawnedItems: state.pawnedItems.map((it) => ({ ...it })),
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
      p.brokerMenuOpen = false;
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
      p.cash += p.rentDebt > 0 ? applyGarnishment(p, earned, config, events) : earned;
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
    case "Enroll": {
      enroll(command.degreeId, next, config, economy, events);
      break;
    }
    case "Study": {
      study(command.degreeId, next, config, events);
      break;
    }
    case "BuyItem": {
      buyItem(command.itemId, next, config, economy, events);
      break;
    }
    case "Deposit":
      deposit(command.amount, next, events);
      break;
    case "Withdraw":
      withdraw(command.amount, next, events);
      break;
    case "ApplyLoan":
      applyLoan(next, config, events);
      break;
    case "OpenBroker":
      openBroker(next, config, events);
      break;
    case "BuyStock":
      buyStock(command.stockId, next, config, events);
      break;
    case "SellStock":
      sellStock(command.stockId, next, config, events);
      break;
    case "BuyTBill":
      buyTBill(next, config, events);
      break;
    case "SellTBill":
      sellTBill(next, config, events);
      break;
    case "BuyLotteryTickets":
      buyLotteryTickets(next, config, events);
      break;
    case "PayRent":
      payRent(next, config, events);
      break;
    case "RequestRentExtension":
      requestRentExtension(next, config, events);
      break;
    case "SwitchApartment":
      switchApartment(next, config, economy, events);
      break;
    default:
      events.push({ type: "InvalidAction", playerId: p.id, reason: `unhandled command ${(command as Command).type}` });
  }

  return { state: next, events };
}
