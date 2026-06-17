import type { GameConfig } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import type { Economy } from "./economy.js";
import { nextFloat } from "./rng.js";

function playerAtRentOffice(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "rentOffice") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}

export function payRent(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtRentOffice(state, events);
  if (!p) return;
  if (p.cash < p.currentRent) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "PayRent" });
    return;
  }
  p.cash -= p.currentRent;
  p.rentDueWeek += config.constants.weeksPerMonth;
  events.push({ type: "RentPaid", playerId: p.id, amount: p.currentRent, rentDueWeek: p.rentDueWeek });
}

export function requestRentExtension(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtRentOffice(state, events);
  if (!p) return;
  if (p.rentExtensionUsedThisTurn) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "extension already requested this turn" });
    return;
  }
  p.rentExtensionUsedThisTurn = true;

  if (p.everInRentDebt) {
    p.happiness -= 1;
    events.push({ type: "RentExtensionDenied", playerId: p.id, reason: "in-debt", happinessCost: 1 });
    return;
  }

  const tier = Math.min(p.rentExtensionsApproved, config.constants.rentExtensionChances.length - 1);
  const chance = config.constants.rentExtensionChances[tier];
  const { value: roll, state: rng } = nextFloat(state.rng);
  state.rng = rng;

  if (roll < chance) {
    p.rentExtensionsApproved += 1;
    p.rentDueWeek += config.constants.weeksPerMonth;
    events.push({ type: "RentExtensionApproved", playerId: p.id, extensionsApproved: p.rentExtensionsApproved, rentDueWeek: p.rentDueWeek });
  } else {
    p.happiness -= 1;
    events.push({ type: "RentExtensionDenied", playerId: p.id, reason: "luck", happinessCost: 1 });
  }
}

export function switchApartment(state: GameState, config: GameConfig, economy: Economy, events: GameEvent[]): void {
  const p = playerAtRentOffice(state, events);
  if (!p) return;
  const other = config.locations.find((l) => l.types.includes("apartment") && l.id !== p.apartmentId);
  if (!other || other.baseRent === undefined) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no alternate apartment" });
    return;
  }
  const newRent = Math.round(economy.adjustedPrice(other.baseRent, state.economy.reading));
  if (p.cash < newRent) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "SwitchApartment" });
    return;
  }
  p.cash -= newRent;
  p.apartmentId = other.id;
  p.currentRent = newRent;
  p.rentDueWeek = state.week + config.constants.weeksPerMonth;
  events.push({ type: "ApartmentSwitched", playerId: p.id, apartmentId: p.apartmentId, newRent, rentDueWeek: p.rentDueWeek });
}
