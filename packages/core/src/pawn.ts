import type { GameConfig, ItemId } from "@jones/config";
import type { GameEvent, GameState, PlayerState } from "./types.js";
import type { Economy } from "./economy.js";

function playerAtPawnShop(state: GameState, events: GameEvent[]): PlayerState | null {
  const p = state.players[state.currentPlayerIndex];
  if (!p.insideBuilding || p.locationId !== "pawnShop") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return null;
  }
  return p;
}

export function pawnItem(itemId: ItemId, state: GameState, config: GameConfig, economy: Economy, events: GameEvent[]): void {
  const p = playerAtPawnShop(state, events);
  if (!p) return;
  const idx = p.durables.findIndex((d) => d.itemId === itemId);
  if (idx < 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not owned" });
    return;
  }
  const item = config.items.find((i) => i.id === itemId);
  if (!item || item.durableType === undefined) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not a durable" });
    return;
  }
  if (state.pawnedItems.length >= config.constants.pawnMaxItems) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "pawn shop full" });
    return;
  }
  if (state.pawnedItems.some((pi) => pi.durableType === item.durableType)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "type already pawned" });
    return;
  }
  const pricePaid = p.durables[idx].pricePaid;
  p.durables.splice(idx, 1);
  const payout = Math.round(config.constants.pawnPayoutRate * economy.adjustedPrice(item.basePrice, state.economy.reading));
  p.cash += payout;
  p.happiness -= 1;
  state.pawnedItems.push({
    itemId,
    durableType: item.durableType,
    pricePaid,
    pawnedByPlayerId: p.id,
    pawnedWeek: state.week,
  });
  events.push({ type: "ItemPawned", playerId: p.id, itemId, payout, happinessCost: 1 });
}

export function redeemItem(itemId: ItemId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtPawnShop(state, events);
  if (!p) return;
  const idx = state.pawnedItems.findIndex((pi) => pi.itemId === itemId);
  if (idx < 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not in pawn shop" });
    return;
  }
  const entry = state.pawnedItems[idx];
  if (entry.pawnedByPlayerId !== p.id) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not your item" });
    return;
  }
  if (state.week - entry.pawnedWeek >= config.constants.pawnExpiryWeeks) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "redeem window expired" });
    return;
  }
  const cost = Math.round(config.constants.pawnRedeemRate * entry.pricePaid);
  if (p.cash < cost) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "RedeemItem" });
    return;
  }
  state.pawnedItems.splice(idx, 1);
  p.durables.push({ itemId, pricePaid: entry.pricePaid });
  p.cash -= cost;
  events.push({ type: "ItemRedeemed", playerId: p.id, itemId, cost });
}

export function buyPawnedItem(itemId: ItemId, state: GameState, config: GameConfig, events: GameEvent[]): void {
  const p = playerAtPawnShop(state, events);
  if (!p) return;
  const idx = state.pawnedItems.findIndex((pi) => pi.itemId === itemId);
  if (idx < 0) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not in pawn shop" });
    return;
  }
  const entry = state.pawnedItems[idx];
  if (state.week - entry.pawnedWeek < config.constants.pawnExpiryWeeks) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not yet for sale" });
    return;
  }
  const alreadyOwned = p.durables.some(
    (d) => config.items.find((i) => i.id === d.itemId)?.durableType === entry.durableType,
  );
  if (alreadyOwned) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "already owned" });
    return;
  }
  const cost = Math.round(config.constants.pawnSaleRate * entry.pricePaid);
  if (p.cash < cost) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyPawnedItem" });
    return;
  }
  state.pawnedItems.splice(idx, 1);
  p.durables.push({ itemId, pricePaid: cost });
  p.cash -= cost;
  events.push({ type: "PawnedItemBought", playerId: p.id, itemId, cost });
}
