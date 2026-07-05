import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { makeEconomy } from "@jones/core";
import { computeBudget, adjustedItemPrice, affordableItems, PLANNER_TUNING } from "../src/budget.js";
import { solo } from "./testHelpers.js";

const economy = makeEconomy(defaultConfig);

describe("adjustedItemPrice", () => {
  it("returns the base price at reading 0 (fresh game)", () => {
    const item = defaultConfig.items.find((i) => i.id === "fries")!;
    const s = solo(defaultConfig);
    expect(adjustedItemPrice(item, s, economy)).toBe(65);
  });
});

describe("affordableItems", () => {
  it("filters by predicate and affordability, at fresh-game cash ($200)", () => {
    const s = solo(defaultConfig);
    const casual = affordableItems(s.players[0], s, defaultConfig, economy, (it) => it.clothingCategory === "casual");
    expect(casual.map((c) => c.item.id).sort()).toEqual(["casualClothesQT", "casualClothesZMart"]);
  });

  it("excludes items the player can't afford", () => {
    const s = solo(defaultConfig);
    s.players[0].cash = 30; // below even the cheapest casual (casualClothesZMart, $35)
    const casual = affordableItems(s.players[0], s, defaultConfig, economy, (it) => it.clothingCategory === "casual");
    expect(casual).toEqual([]);
  });
});

describe("computeBudget", () => {
  it("fresh game: no rent reserve (due in 3 weeks), cheapest fastFood + casual uniform reserved", () => {
    const s = solo(defaultConfig);
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    // rentDueWeek starts at 4, week is 1 -> 4-1=3 > rentReserveHorizonWeeks (2) -> no reserve
    expect(budget.rentReserve).toBe(0);
    expect(budget.foodReserve).toBe(65); // cheapest fastFood: fries
    expect(budget.uniformReserve).toBe(35); // cheapest casual: casualClothesZMart
    expect(budget.cashFloor).toBe(0 + 65 + 35 + PLANNER_TUNING.weeklyBuffer); // 150
    expect(budget.discretionary).toBe(50); // cash 200 - cashFloor 150
  });

  it("reserves rent once due within the reserve horizon", () => {
    const s = solo(defaultConfig);
    s.week = 3; // rentDueWeek (4) - week (3) = 1 <= horizon (2)
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    expect(budget.rentReserve).toBe(325);
  });

  it("reserves the cheapest fresh-food restock once a fridge is owned", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    expect(budget.foodReserve).toBe(55); // cheapest freshFood: freshFood1Wk
  });

  it("reserves the job's uniform level instead of casual once employed", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "zMart.assistantManager"; // uniform: "dress"
    const budget = computeBudget(s.players[0], s, defaultConfig, economy);
    expect(budget.uniformReserve).toBe(90); // cheapest dress: dressClothesZMart
  });
});
