import type { GameConfig, StockId } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";

function playerAtBank(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "bank") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}

function playerWithBrokerOpen(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.brokerMenuOpen) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "broker not open" });
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
  if (loanSize === 0) {
    p.happiness -= 1;
    events.push({ type: "LoanDenied", playerId: p.id, reason: "too-risky", happinessCost: 1 });
    return;
  }
  const effectiveDueWeek = p.loanDueWeek ?? state.week + 4;
  p.loanBalance += loanSize;
  p.loanDueWeek = effectiveDueWeek;
  p.happiness += 5;
  events.push({ type: "LoanApproved", playerId: p.id, amount: loanSize, dueWeek: effectiveDueWeek, happinessGained: 5 });
}

export function openBroker(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtBank(state, events);
  if (!p) return;
  if (p.brokerMenuOpen) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "broker already open" });
    return;
  }
  if (p.hoursRemaining < config.actionCosts.broker) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "OpenBroker" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.broker;
  p.brokerMenuOpen = true;
  events.push({ type: "BrokerOpened", playerId: p.id });
}

export function buyStock(stockId: StockId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerWithBrokerOpen(state, events);
  if (!p) return;
  if (!config.stocks.some((s) => s.id === stockId)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown stock" });
    return;
  }
  const price = state.stockPrices[stockId];
  if (p.cash < price) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyStock" });
    return;
  }
  p.cash -= price;
  p.stocks[stockId] += 1;
  events.push({ type: "StockBought", playerId: p.id, stockId, price });
}

export function sellStock(stockId: StockId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerWithBrokerOpen(state, events);
  if (!p) return;
  if (!config.stocks.some((s) => s.id === stockId)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown stock" });
    return;
  }
  if (p.stocks[stockId] < 1) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no shares to sell" });
    return;
  }
  const price = state.stockPrices[stockId];
  p.stocks[stockId] -= 1;
  p.cash += price;
  events.push({ type: "StockSold", playerId: p.id, stockId, price });
}

export function buyTBill(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerWithBrokerOpen(state, events);
  if (!p) return;
  const price = config.constants.tBillBuyPrice;
  if (p.cash < price) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyTBill" });
    return;
  }
  p.cash -= price;
  p.tBills += 1;
  events.push({ type: "TBillBought", playerId: p.id, price });
}

export function sellTBill(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerWithBrokerOpen(state, events);
  if (!p) return;
  if (p.tBills < 1) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no T-bills to sell" });
    return;
  }
  const proceeds = config.constants.tBillSellPrice;
  p.tBills -= 1;
  p.cash += proceeds;
  events.push({ type: "TBillSold", playerId: p.id, proceeds });
}

export function buyLotteryTickets(state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "blacksMarket") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }
  const cost = config.constants.lotteryBatchPrice;
  if (p.cash < cost) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyLotteryTickets" });
    return;
  }
  p.cash -= cost;
  p.lotteryTickets += config.constants.lotteryBatchSize;
  events.push({
    type: "LotteryTicketsBought",
    playerId: p.id,
    ticketCount: config.constants.lotteryBatchSize,
    totalCost: cost,
  });
}
