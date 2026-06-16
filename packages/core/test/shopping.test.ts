import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function shopGame(locationId: string, cash = 5000): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = locationId;
  state.players[0].insideBuilding = true;
  state.players[0].cash = cash;
  return state;
}

function buy(state: GameState, itemId: string) {
  return reduce(state, { type: "BuyItem", itemId: itemId as any }, testConfig);
}

describe("BuyItem guards", () => {
  it("InvalidAction when not inside building", () => {
    const state = shopGame("monolithBurgers");
    state.players[0].insideBuilding = false;
    const { events } = buy(state, "fries");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });

  it("InvalidAction when at wrong location", () => {
    const state = shopGame("socketCity");
    const { events } = buy(state, "fries"); // fries only at monolithBurgers
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });

  it("InvalidAction for unknown item id", () => {
    const state = shopGame("monolithBurgers");
    const { events } = buy(state, "doesNotExist");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "unknown item" });
  });

  it("NotEnoughMoney when cash < price", () => {
    const state = shopGame("monolithBurgers", 0);
    const { events } = buy(state, "astroChicken");
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney", action: "BuyItem" });
  });

  it("NotEnoughTime for newspaper when 0 hours", () => {
    const state = shopGame("blacksMarket");
    state.players[0].hoursRemaining = 0;
    const { events } = buy(state, "newspaper");
    expect(events[0]).toMatchObject({ type: "NotEnoughTime", action: "BuyItem" });
  });

  it("InvalidAction buying second durable of same durableType", () => {
    const state = shopGame("socketCity");
    const { state: s1 } = buy(state, "refrigeratorSocket");
    const { events } = buy(s1, "refrigeratorSocket");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });

  it("InvalidAction buying Z-Mart durable when same type already owned from Socket City", () => {
    const state = shopGame("socketCity");
    const { state: s1 } = buy(state, "refrigeratorSocket");
    s1.players[0].locationId = "zMart";
    const { events } = buy(s1, "refrigeratorZMart");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });
});

describe("Fast food", () => {
  it("increments fastFood and deducts cash", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1, events } = buy(state, "astroChicken");
    const p = s1.players[0];
    expect(p.fastFood).toBe(1);
    expect(p.cash).toBe(5000 - 124); // constantEconomy: price = basePrice
    expect(events[0]).toMatchObject({ type: "ItemBought", itemId: "astroChicken", price: 124, happinessGained: 2 });
  });

  it("first happiness-giving fast food grants happiness; second in same turn does not", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1 } = buy(state, "cheeseburger"); // +1, consumes fastFood group
    const { state: s2, events } = buy(s1, "astroChicken"); // 0 (group consumed)
    expect(s1.players[0].happiness).toBe(1);
    expect(s2.players[0].happiness).toBe(1); // unchanged
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 0 });
  });

  it("neutral fast food (fries) does not consume the group slot", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1 } = buy(state, "fries"); // no happiness, no group consumed
    const { state: s2 } = buy(s1, "cheeseburger"); // +1 because group was not consumed
    expect(s2.players[0].happiness).toBe(1);
  });
});

describe("Soft drinks", () => {
  it("first drink grants happiness; second in same turn does not", () => {
    const state = shopGame("monolithBurgers");
    const { state: s1 } = buy(state, "colasDrink"); // +1
    const { state: s2 } = buy(s1, "shakesDrink");   // 0 (group consumed)
    expect(s1.players[0].happiness).toBe(1);
    expect(s2.players[0].happiness).toBe(1);
  });
});

describe("Fresh food", () => {
  it("adds freshFoodWeeks and always grants happiness", () => {
    const state = shopGame("blacksMarket");
    const { state: s1 } = buy(state, "freshFood2Wk");
    const { state: s2 } = buy(s1, "freshFood2Wk"); // no group = always gives happiness
    expect(s2.players[0].freshFood).toBe(4);
    expect(s2.players[0].happiness).toBe(4); // +2 twice
  });
});

describe("Clothes", () => {
  it("QT dress adds weeks and grants +1 happiness first buy", () => {
    const state = shopGame("qtClothing");
    const { state: s1, events } = buy(state, "dressClothesQT");
    expect(s1.players[0].clothing.dress).toBe(13);
    expect(s1.players[0].happiness).toBe(1);
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 1 });
  });

  it("Z-Mart dress adds weeks but gives no happiness", () => {
    const state = shopGame("zMart");
    const { state: s1, events } = buy(state, "dressClothesZMart");
    expect(s1.players[0].clothing.dress).toBe(9);
    expect(s1.players[0].happiness).toBe(0);
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 0 });
  });

  it("Z-Mart dress does not consume the dressClothes group slot", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "dressClothesZMart"); // no group consumed
    s1.players[0].locationId = "qtClothing";
    const { state: s2 } = buy(s1, "dressClothesQT"); // should still get +1
    expect(s2.players[0].happiness).toBe(1);
  });

  it("business suit adds weeks and grants +2 happiness", () => {
    const state = shopGame("qtClothing");
    const { state: s1 } = buy(state, "businessSuit");
    expect(s1.players[0].clothing.business).toBe(13);
    expect(s1.players[0].happiness).toBe(2);
  });

  it("second business suit buy same turn gives no happiness but still adds weeks", () => {
    const state = shopGame("qtClothing");
    const { state: s1 } = buy(state, "businessSuit");
    const { state: s2 } = buy(s1, "businessSuit"); // group consumed
    expect(s2.players[0].clothing.business).toBe(26);
    expect(s2.players[0].happiness).toBe(2); // unchanged
  });
});

describe("Durables", () => {
  it("adds durable to durables array with pricePaid", () => {
    const state = shopGame("socketCity");
    const { state: s1, events } = buy(state, "refrigeratorSocket");
    const p = s1.players[0];
    expect(p.durables).toHaveLength(1);
    expect(p.durables[0]).toEqual({ itemId: "refrigeratorSocket", pricePaid: 876 });
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 1 });
  });

  it("two different durableTypes can both be purchased", () => {
    const state = shopGame("socketCity");
    const { state: s1 } = buy(state, "refrigeratorSocket");
    const { state: s2, events } = buy(s1, "stoveSocket");
    expect(s2.players[0].durables).toHaveLength(2);
    expect(events[0].type).toBe("ItemBought");
  });

  it("computer sets extraCreditGained: 1 and increments extraCredit", () => {
    const state = shopGame("socketCity");
    const { state: s1, events } = buy(state, "computerSocket");
    expect(s1.players[0].extraCredit).toBe(1);
    expect(events[0]).toMatchObject({ type: "ItemBought", extraCreditGained: 1 });
  });
});

describe("Books", () => {
  it("buying first two books does not grant extraCredit", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "encyclopedia");
    const { state: s2, events } = buy(s1, "dictionary");
    expect(s2.players[0].extraCredit).toBe(0);
    expect(events[0]).toMatchObject({ type: "ItemBought", extraCreditGained: 0 });
  });

  it("buying the third book completes the set and grants extraCredit: 1", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "encyclopedia");
    const { state: s2 } = buy(s1, "dictionary");
    const { state: s3, events } = buy(s2, "atlas");
    expect(s3.players[0].extraCredit).toBe(1);
    expect(events[0]).toMatchObject({ type: "ItemBought", extraCreditGained: 1 });
  });

  it("InvalidAction buying a second copy of the same book", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "encyclopedia");
    const { events } = buy(s1, "encyclopedia");
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });
});

describe("Junk", () => {
  it("applies happiness penalty on every purchase (no group protection)", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "dogFood");
    const { state: s2 } = buy(s1, "dogFood");
    expect(s2.players[0].happiness).toBe(-2);
  });
});

describe("Tickets", () => {
  it("increments ticket count and grants +2 happiness first buy", () => {
    const state = shopGame("zMart");
    const { state: s1, events } = buy(state, "baseballTicket");
    expect(s1.players[0].tickets.baseball).toBe(1);
    expect(s1.players[0].happiness).toBe(2);
    expect(events[0]).toMatchObject({ type: "ItemBought", happinessGained: 2 });
  });

  it("second baseball ticket same turn gives no happiness", () => {
    const state = shopGame("zMart");
    const { state: s1 } = buy(state, "baseballTicket");
    const { state: s2 } = buy(s1, "baseballTicket");
    expect(s2.players[0].tickets.baseball).toBe(2); // count increments
    expect(s2.players[0].happiness).toBe(2); // happiness unchanged
  });
});

describe("Newspaper", () => {
  it("deducts $1 fixed and 1 hour; no happiness effect", () => {
    const state = shopGame("blacksMarket");
    state.players[0].hoursRemaining = 10;
    const { state: s1, events } = buy(state, "newspaper");
    expect(s1.players[0].cash).toBe(4999);
    expect(s1.players[0].hoursRemaining).toBe(9);
    expect(events[0]).toMatchObject({ type: "ItemBought", price: 1, happinessGained: 0 });
  });

  it("newspaper price is $1 regardless of economy reading", () => {
    const config = { ...testConfig, economy: { ...testConfig.economy, initialReading: 30 } };
    const state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    state.players[0].locationId = "blacksMarket";
    state.players[0].insideBuilding = true;
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "BuyItem", itemId: "newspaper" }, config);
    expect(events[0]).toMatchObject({ type: "ItemBought", price: 1 });
  });
});
