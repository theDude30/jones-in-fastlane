import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { netWorth, applyDonation } from "../src/health.js";
import type { GameState, GameEvent } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function soloGame(): GameState {
  return createInitialGame(testConfig, 1, [
    { name: "A", isAI: false, goals: { wealth: 10, happiness: 10, education: 10, career: 10 } },
  ]);
}

describe("netWorth", () => {
  it("sums cash, bank, stock value, owned durables, and this player's pawned items", () => {
    const g = soloGame();
    const p = g.players[0];
    p.cash = 100;
    p.bank = 50;
    p.stocks.gold = 2;
    g.stockPrices.gold = 25; // stock value = 50
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    g.pawnedItems = [
      { itemId: "stoveZMart", durableType: "stove", pricePaid: 490, pawnedByPlayerId: "p0", pawnedWeek: 1 },
      { itemId: "computerSocket", durableType: "computer", pricePaid: 1599, pawnedByPlayerId: "p1", pawnedWeek: 1 },
    ];
    // 100 + 50 + 50 + 876 + 490 (p0's own pawned item) = 1566; p1's pawned item excluded.
    expect(netWorth(p, g)).toBe(1566);
  });
});

describe("applyDonation", () => {
  it("does not donate (and does not increment the counter past 1) on the first clothesless turn", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    expect(p.weeksWithoutClothes).toBe(1);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(false);
  });

  it("donates a flat $50 + a $1-100 bonus when unemployed, broke, and clothesless for 2 consecutive turns", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events); // turn 1: counter -> 1, no donation
    applyDonation(p, g, testConfig, events); // turn 2: counter -> 2, donation fires
    const donation = events.find((e) => e.type === "DonationReceived");
    expect(donation).toBeDefined();
    expect((donation as { amount: number }).amount).toBeGreaterThanOrEqual(51);
    expect((donation as { amount: number }).amount).toBeLessThanOrEqual(150);
    expect(p.cash).toBe((donation as { amount: number }).amount);
    expect(p.weeksWithoutClothes).toBe(0);
  });

  it("donates the cheapest item price matching the job's uniform level, plus bonus, when employed", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    p.jobId = "zMart.clerk"; // requires "casual"; cheapest casual item is casualClothesZMart at $35
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    applyDonation(p, g, testConfig, events);
    const donation = events.find((e) => e.type === "DonationReceived");
    expect(donation).toBeDefined();
    expect((donation as { amount: number }).amount).toBeGreaterThanOrEqual(36);
    expect((donation as { amount: number }).amount).toBeLessThanOrEqual(135);
  });

  it("does not donate when cash is already >= $300, even after 2+ clothesless turns", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 300;
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    applyDonation(p, g, testConfig, events);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(false);
  });

  it("does not donate when net worth is >= $300 via an owned durable, even with $0 cash", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 0;
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events);
    applyDonation(p, g, testConfig, events);
    expect(events.some((e) => e.type === "DonationReceived")).toBe(false);
  });

  it("resets the counter to 0 as soon as the player has any clothing again", () => {
    const g = soloGame();
    const p = g.players[0];
    p.clothing = { casual: 0, dress: 0, business: 0 };
    const events: GameEvent[] = [];
    applyDonation(p, g, testConfig, events); // counter -> 1
    p.clothing.casual = 5; // player got clothed again
    applyDonation(p, g, testConfig, events);
    expect(p.weeksWithoutClothes).toBe(0);
  });
});
