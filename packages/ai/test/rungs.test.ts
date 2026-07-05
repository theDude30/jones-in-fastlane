import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { makeEconomy } from "@jones/core";
import type { GameState } from "@jones/core";
import { computeBudget } from "../src/budget.js";
import { eatRung, rentRung, clothesRung, healthRung } from "../src/rungs.js";
import type { TurnContext } from "../src/rungs.js";
import { solo } from "./testHelpers.js";

const economy = makeEconomy(defaultConfig);

function ctxFor(state: GameState): TurnContext {
  return { state, player: state.players[0], config: defaultConfig, economy, budget: computeBudget(state.players[0], state, defaultConfig, economy) };
}

describe("eatRung", () => {
  it("buys fries when unfridged and out of fast food", () => {
    const s = solo(defaultConfig);
    expect(eatRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "monolithBurgers" });
  });

  it("does nothing once fast food is stocked", () => {
    const s = solo(defaultConfig);
    s.players[0].fastFood = 1;
    expect(eatRung(ctxFor(s))).toBeNull();
  });

  it("restocks the 4-week fresh-food pack when fridged and low", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    s.players[0].freshFood = 0;
    s.players[0].locationId = "blacksMarket";
    s.players[0].insideBuilding = true;
    expect(eatRung(ctxFor(s))).toEqual({ type: "BuyItem", itemId: "freshFood4Wk" });
  });

  it("does nothing once fresh food is above the low-water mark", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    s.players[0].freshFood = 4;
    expect(eatRung(ctxFor(s))).toBeNull();
  });
});

describe("rentRung", () => {
  it("does nothing when rent isn't due soon", () => {
    const s = solo(defaultConfig); // rentDueWeek=4, week=1
    expect(rentRung(ctxFor(s))).toBeNull();
  });

  it("pays rent once due within the pay horizon and cash covers it", () => {
    const s = solo(defaultConfig);
    s.week = 3; // rentDueWeek(4) - week(3) = 1 <= horizon(1)
    s.players[0].cash = 1000; // initialCash (200) can't cover the $325 rent
    expect(rentRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "rentOffice" });
  });

  it("pays once at the rent office", () => {
    const s = solo(defaultConfig);
    s.week = 3;
    s.players[0].cash = 1000;
    s.players[0].locationId = "rentOffice";
    s.players[0].insideBuilding = true;
    expect(rentRung(ctxFor(s))).toEqual({ type: "PayRent" });
  });

  it("does nothing when due soon but unaffordable", () => {
    const s = solo(defaultConfig);
    s.week = 3;
    s.players[0].cash = 100;
    expect(rentRung(ctxFor(s))).toBeNull();
  });
});

describe("clothesRung", () => {
  it("does nothing with fresh starting casual clothing (6 weeks)", () => {
    const s = solo(defaultConfig);
    expect(clothesRung(ctxFor(s))).toBeNull();
  });

  it("buys the cheapest casual outfit once clothing is low, unemployed", () => {
    const s = solo(defaultConfig);
    s.players[0].clothing = { casual: 1, dress: 0, business: 0 };
    expect(clothesRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" });
  });

  it("targets the job's required uniform level once employed", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "zMart.assistantManager"; // uniform: "dress"
    s.players[0].clothing = { casual: 6, dress: 0, business: 0 };
    expect(clothesRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // dressClothesZMart, $90
  });
});

describe("healthRung", () => {
  it("enters the apartment first when at home but outside, relaxation at or below the threshold", () => {
    const s = solo(defaultConfig); // initialRelaxation=10 <= threshold 12; at lowCostHousing, outside
    expect(healthRung(ctxFor(s))).toEqual({ type: "EnterBuilding" });
  });

  it("relaxes once inside its own apartment", () => {
    const s = solo(defaultConfig);
    s.players[0].insideBuilding = true; // at lowCostHousing, inside
    expect(healthRung(ctxFor(s))).toEqual({ type: "Relax" });
  });

  it("does nothing once relaxation is above the threshold", () => {
    const s = solo(defaultConfig);
    s.players[0].relaxation = 20;
    expect(healthRung(ctxFor(s))).toBeNull();
  });
});
