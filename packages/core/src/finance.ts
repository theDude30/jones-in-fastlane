import type { GameEvent, GameState, PlayerState } from "./types.js";

function playerAtBank(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "bank") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}

export function deposit(amount: number, state: GameState, events: GameEvent[]): void {
  const p = playerAtBank(state, events);
  if (!p) return;
  if (amount <= 0 || amount % 100 !== 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "amount must be a positive multiple of 100" });
    return;
  }
  if (p.cash < amount) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "Deposit" });
    return;
  }
  p.cash -= amount;
  p.bank += amount;
  events.push({ type: "Deposited", playerId: p.id, amount });
}

export function withdraw(amount: number, state: GameState, events: GameEvent[]): void {
  const p = playerAtBank(state, events);
  if (!p) return;
  if (amount <= 0 || amount % 100 !== 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "amount must be a positive multiple of 100" });
    return;
  }
  if (p.bank < amount) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "Withdraw" });
    return;
  }
  p.bank -= amount;
  p.cash += amount;
  events.push({ type: "Withdrawn", playerId: p.id, amount });
}
