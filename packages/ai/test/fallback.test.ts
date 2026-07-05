import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { emergencyLiquidity } from "../src/fallback.js";
import { solo } from "./testHelpers.js";

describe("emergencyLiquidity", () => {
  it("returns null with nothing to liquidate", () => {
    const s = solo(defaultConfig);
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toBeNull();
  });

  it("navigates to the pawn shop first when a durable is owned but not there yet", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "TravelTo", locationId: "pawnShop" });
  });

  it("pawns the durable once at the pawn shop", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "PawnItem", itemId: "refrigeratorSocket" });
  });

  it("skips a durable type that's already pawned state-wide, falls through to T-bills", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = false;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    s.pawnedItems = [
      { itemId: "refrigeratorZMart", durableType: "refrigerator", pricePaid: 650, pawnedByPlayerId: "p1", pawnedWeek: 1 },
    ];
    s.players[0].tBills = 2;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "TravelTo", locationId: "bank" });
  });

  it("opens the broker before selling a T-bill", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].tBills = 1;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "OpenBroker" });
  });

  it("sells a T-bill once the broker is open", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].brokerMenuOpen = true;
    s.players[0].tBills = 2;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "SellTBill" });
  });

  it("sells a stock when there's nothing to pawn and no T-bills", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].brokerMenuOpen = true;
    s.players[0].stocks.gold = 3;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toEqual({ type: "SellStock", stockId: "gold" });
  });

  it("returns null when owns a T-bill but is not at the bank and doesn't have enough hours to travel there", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = false;
    s.players[0].tBills = 1;
    s.players[0].hoursRemaining = 0;
    expect(emergencyLiquidity(s.players[0], s, defaultConfig)).toBeNull();
  });
});
