import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";
import { resetToFreshTurn } from "./testHelpers.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function pawnGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  resetToFreshTurn(state, testConfig, 0);
  const p = state.players[0];
  p.locationId = "pawnShop";
  p.insideBuilding = true;
  p.cash = 2000;
  p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
  return state;
}

describe("PawnItem", () => {
  it("removes durable, pays 40% of economy-adjusted value, -1 happiness, adds to shop", () => {
    const { state, events } = reduce(pawnGame(), { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    const p = state.players[0];
    expect(p.durables.find((d) => d.itemId === "refrigeratorSocket")).toBeUndefined();
    expect(p.cash).toBe(2000 + 350);
    expect(p.happiness).toBe(-1);
    expect(state.pawnedItems).toHaveLength(1);
    expect(state.pawnedItems[0]).toMatchObject({
      itemId: "refrigeratorSocket",
      durableType: "refrigerator",
      pricePaid: 876,
      pawnedByPlayerId: "p0",
      pawnedWeek: 1,
    });
    expect(events[0]).toMatchObject({ type: "ItemPawned", itemId: "refrigeratorSocket", payout: 350, happinessCost: 1 });
  });

  it("InvalidAction when the player does not own the item", () => {
    const state = pawnGame();
    state.players[0].durables = [];
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "not owned" });
  });

  it("InvalidAction when the shop is full", () => {
    const state = pawnGame();
    state.pawnedItems = Array.from({ length: 6 }, (_, i) => ({
      itemId: "stoveSocket" as const,
      durableType: "stove" as const,
      pricePaid: 100,
      pawnedByPlayerId: "pX",
      pawnedWeek: 1,
    }));
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "pawn shop full" });
  });

  it("InvalidAction when the shop already holds that durableType", () => {
    const state = pawnGame();
    state.pawnedItems = [{
      itemId: "refrigeratorZMart", durableType: "refrigerator", pricePaid: 650, pawnedByPlayerId: "pX", pawnedWeek: 1,
    }];
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "type already pawned" });
  });

  it("InvalidAction when not at the pawn shop", () => {
    const state = pawnGame();
    state.players[0].locationId = "bank";
    const { events } = reduce(state, { type: "PawnItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("RedeemItem", () => {
  function pawnedState(week: number, pawnedWeek = 1): GameState {
    const state = pawnGame();
    state.week = week;
    state.players[0].durables = [];
    state.pawnedItems = [{
      itemId: "refrigeratorSocket", durableType: "refrigerator", pricePaid: 876, pawnedByPlayerId: "p0", pawnedWeek,
    }];
    return state;
  }

  it("original pawner redeems within window: pays 50% of pricePaid, gets durable back", () => {
    const { state, events } = reduce(pawnedState(2), { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    const p = state.players[0];
    expect(p.cash).toBe(2000 - 438); // round(0.5 * 876)
    expect(p.durables.find((d) => d.itemId === "refrigeratorSocket")).toMatchObject({ pricePaid: 876 });
    expect(state.pawnedItems).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: "ItemRedeemed", itemId: "refrigeratorSocket", cost: 438 });
  });

  it("InvalidAction when a different player pawned it", () => {
    const state = pawnedState(2);
    state.pawnedItems[0].pawnedByPlayerId = "pX";
    const { events } = reduce(state, { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "not your item" });
  });

  it("InvalidAction when the 3-week window has passed", () => {
    const state = pawnedState(4); // week 4, pawnedWeek 1 → 3 weeks elapsed
    const { events } = reduce(state, { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "redeem window expired" });
  });

  it("NotEnoughMoney when cash < cost", () => {
    const state = pawnedState(2);
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "RedeemItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});

describe("BuyPawnedItem", () => {
  function expiredState(week = 4): GameState {
    const state = pawnGame();
    state.week = week;
    state.players[0].durables = [];
    state.pawnedItems = [{
      itemId: "refrigeratorSocket", durableType: "refrigerator", pricePaid: 876, pawnedByPlayerId: "pX", pawnedWeek: 1,
    }];
    return state;
  }

  it("after expiry any player buys at 50% of pricePaid; basis = cost", () => {
    const { state, events } = reduce(expiredState(4), { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    const p = state.players[0];
    expect(p.cash).toBe(2000 - 438);
    expect(p.durables.find((d) => d.itemId === "refrigeratorSocket")).toMatchObject({ pricePaid: 438 });
    expect(state.pawnedItems).toHaveLength(0);
    expect(events[0]).toMatchObject({ type: "PawnedItemBought", itemId: "refrigeratorSocket", cost: 438 });
  });

  it("InvalidAction before expiry (still redeem-only)", () => {
    const { events } = reduce(expiredState(2), { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "not yet for sale" });
  });

  it("InvalidAction when buyer already owns that durableType", () => {
    const state = expiredState(4);
    state.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const { events } = reduce(state, { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "already owned" });
  });

  it("NotEnoughMoney when cash < cost", () => {
    const state = expiredState(4);
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "BuyPawnedItem", itemId: "refrigeratorSocket" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});
