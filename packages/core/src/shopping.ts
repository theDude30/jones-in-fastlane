import type { DurableType, GameConfig, ItemId } from "@jones/config";
import type { Economy } from "./economy.js";
import type { GameEvent, GameState } from "./types.js";

export function buyItem(
  itemId: ItemId,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  const item = config.items.find((i) => i.id === itemId);
  if (!item) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown item" });
    return;
  }

  if (!p.insideBuilding || p.locationId !== item.locationId) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }

  if (item.durableType !== undefined) {
    const alreadyOwned = p.durables.some(
      (d) => config.items.find((i) => i.id === d.itemId)?.durableType === item.durableType,
    );
    if (alreadyOwned) {
      events.push({ type: "InvalidAction", playerId: p.id, reason: "already owned" });
      return;
    }
  }

  if (item.category === "newspaper" && p.hoursRemaining <= 0) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "BuyItem" });
    return;
  }

  const price = item.fixedPrice
    ? item.basePrice
    : economy.adjustedPrice(item.basePrice, state.economy.reading);

  if (p.cash < price) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "BuyItem" });
    return;
  }

  p.cash -= price;

  if (item.category === "newspaper") {
    p.hoursRemaining -= config.actionCosts.newspaper;
  } else if (item.clothingCategory) {
    p.clothing[item.clothingCategory] += item.clothingWeeks!;
  } else if (item.category === "durable" || item.category === "book") {
    p.durables.push({ itemId, pricePaid: price });
  } else if (item.category === "fastFood") {
    p.fastFood += 1;
  } else if (item.category === "freshFood") {
    p.freshFood += item.freshFoodWeeks!;
  } else if (item.category === "ticket") {
    p.tickets[item.ticketType!] += 1;
  }
  // junk: no inventory change

  let happinessGained = 0;
  const rawHappiness = item.happinessOnBuy ?? 0;
  if (rawHappiness !== 0) {
    if (item.happinessGroup) {
      if (!p.happyGroupsThisTurn.includes(item.happinessGroup)) {
        happinessGained = rawHappiness;
        p.happyGroupsThisTurn.push(item.happinessGroup);
      }
    } else {
      happinessGained = rawHappiness;
    }
  }
  p.happiness += happinessGained;

  let extraCreditGained = 0;
  if (item.durableType === "computer") {
    p.extraCredit += 1;
    extraCreditGained = 1;
  } else if (
    item.durableType === "encyclopedia" ||
    item.durableType === "dictionary" ||
    item.durableType === "atlas"
  ) {
    const bookTypes: DurableType[] = ["encyclopedia", "dictionary", "atlas"];
    const allOwned = bookTypes.every((bt) =>
      p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === bt),
    );
    if (allOwned) {
      p.extraCredit += 1;
      extraCreditGained = 1;
    }
  }

  events.push({ type: "ItemBought", playerId: p.id, itemId, price, happinessGained, extraCreditGained });
}
