import { describe, it, expect } from "vitest";
import { defaultConfig, aiDifficulty } from "@jones/config";
import { createInitialGame, reduce } from "@jones/core";
import type { GameState } from "@jones/core";
import { GreedyPlanner } from "../src/greedy.js";

const HARD = aiDifficulty.hard; // greedy, epsilon 0

function solo(goals = { wealth: 100, happiness: 100, education: 100, career: 100 }): GameState {
  const g = createInitialGame(defaultConfig, 1, [{ name: "A", isAI: true, goals }]);
  // createInitialGame now runs one start-of-turn pass (decay, food/health) on
  // seat 0 at creation (bug fix: every other seat already got this on its own
  // first turn) — an unfed fresh player loses hours/happiness immediately.
  // Reset to a clean baseline so this file's planner-decision tests aren't
  // coupled to that.
  const c = defaultConfig.constants;
  const p = g.players[0];
  p.hoursRemaining = c.hoursPerTurn;
  p.happiness = 0;
  p.cash = c.initialCash;
  p.relaxation = c.initialRelaxation;
  p.dependibility = c.initialDependibility;
  p.clothing = { casual: c.initialCasualWeeks, dress: 0, business: 0 };
  g.rng = { seed: 1 };
  return g;
}

describe("GreedyPlanner", () => {
  it("ends the turn when all goals are met", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "EndTurn" });
  });

  it("never produces InvalidAction over a full turn", () => {
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    let s = solo();
    for (let i = 0; i < 30; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
      if (cmd.type === "EndTurn") break;
    }
  });

  it("pursues education by heading toward the university when education is weakest", () => {
    // Make education the only unmet goal so the greedy choice is unambiguous.
    const s = solo({ wealth: 0, happiness: 0, education: 100, career: 0 });
    s.players[0].cash = 5000; // can afford enrollment
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    // From home + outside, the first move toward enrolling is to travel to hiTechU.
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "TravelTo", locationId: "hiTechU" });
  });

  it("works when employed and at the workplace and wealth/career is weakest", () => {
    const s = solo({ wealth: 100, happiness: 0, education: 1, career: 100 });
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "Work" });
  });

  it("buys required uniform clothing instead of attempting Work when the uniform isn't met", () => {
    const s = solo({ wealth: 100, happiness: 0, education: 1, career: 100 });
    const p = s.players[0];
    p.jobId = "zMart.clerk"; // requires uniform: "casual"
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    p.clothing = { casual: 0, dress: 0, business: 0 }; // ran out of starting clothing
    p.cash = 1000;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    // casualClothesZMart is sold at zMart (where the player already is) for 35.
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "BuyItem", itemId: "casualClothesZMart" });
  });

  it("resumes Work once the bought clothing satisfies the uniform requirement", () => {
    const s = solo({ wealth: 100, happiness: 0, education: 1, career: 100 });
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    p.clothing = { casual: 0, dress: 0, business: 0 };
    p.cash = 1000;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    const buy = planner.nextCommand(s, "p0");
    const { state: afterBuy } = reduce(s, buy, defaultConfig);
    expect(planner.nextCommand(afterBuy, "p0")).toEqual({ type: "Work" });
  });

  it("epsilon=1 always takes a legal random action", () => {
    const preset = { planner: "greedy" as const, weights: HARD.weights, epsilon: 1 };
    const planner = new GreedyPlanner(5, preset, defaultConfig);
    let s = solo();
    for (let i = 0; i < 20; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = new GreedyPlanner(11, aiDifficulty.medium, defaultConfig);
    const b = new GreedyPlanner(11, aiDifficulty.medium, defaultConfig);
    const s = solo();
    for (let i = 0; i < 20; i++) expect(a.nextCommand(s, "p0")).toEqual(b.nextCommand(s, "p0"));
  });

  it("pawns an owned durable as a last resort when no goal activity is available", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 }); // all goals already met
    const p = s.players[0];
    p.locationId = "pawnShop";
    p.insideBuilding = true;
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "PawnItem", itemId: "refrigeratorSocket" });
  });

  it("navigates to the pawn shop first when not yet there", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    // p starts at lowCostHousing, outside.
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "TravelTo", locationId: "pawnShop" });
  });

  it("sells a T-bill when there's nothing to pawn", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.brokerMenuOpen = true;
    p.tBills = 2;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "SellTBill" });
  });

  it("sells a stock when there's nothing to pawn and no T-bills", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.brokerMenuOpen = true;
    p.stocks.gold = 3;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "SellStock", stockId: "gold" });
  });

  it("opens the broker first when it owns a T-bill but the broker isn't open yet", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.tBills = 1;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "OpenBroker" });
  });

  it("still ends the turn when there is truly nothing left to liquidate", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 }); // all goals met, no assets
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "EndTurn" });
  });
});
