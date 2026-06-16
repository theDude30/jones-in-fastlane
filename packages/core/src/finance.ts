import type { GameConfig } from "@jones/config";
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

export function applyLoan(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtBank(state, events);
  if (!p) return;
  if (p.hoursRemaining < config.actionCosts.applyLoan) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "ApplyLoan" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.applyLoan;

  if (p.loanInDefault) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "in-default", happinessCost: 1 });
    return;
  }
  if (p.wage === 0) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "unemployed", happinessCost: 1 });
    return;
  }

  const stockValue = config.stocks.reduce(
    (sum, s) => sum + p.stocks[s.id] * state.stockPrices[s.id],
    0,
  );
  const liquidAssets = p.cash + p.bank + stockValue + p.tBills * config.constants.tBillBuyPrice;
  const liquidity = p.wage + liquidAssets / 1000;
  // Risk: base 5; for prior/current borrowers add timesDefaulted, +1 per $100 of
  // outstanding debt, and +1 if any debt remains.
  const risk =
    p.timesDefaulted === 0 && p.loanBalance === 0
      ? 5
      : 5 + p.timesDefaulted + Math.floor(p.loanBalance / 100) + (p.loanBalance > 0 ? 1 : 0);

  if (liquidity <= risk) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "too-risky", happinessCost: 1 });
    return;
  }

  const loanSize = 100 * Math.floor(liquidity - risk);
  const dueWeek = state.week + 4;
  p.loanBalance += loanSize;
  p.loanDueWeek = dueWeek;
  p.happiness += 5;
  events.push({ type: "LoanApproved", playerId: p.id, amount: loanSize, dueWeek, happinessGained: 5 });
}
