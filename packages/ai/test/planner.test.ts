import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import type { AIDifficultyPreset } from "@jones/config";
import { reduce } from "@jones/core";
import { BudgetPlanner } from "../src/planner.js";
import { solo } from "./testHelpers.js";

const HARD: AIDifficultyPreset = { planner: "budget", epsilon: 0 };

describe("BudgetPlanner", () => {
  // Note: survival rungs (eat/rent/clothes/health) and the employment rung
  // are unconditional safety nets — they fire regardless of whether the four
  // scored goals are already met (a met goal doesn't mean "stop eating").
  // "ends the turn" therefore requires every rung's own precondition to be
  // satisfied, not just the four goals.
  it("ends the turn when every rung's precondition is already satisfied", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.jobId = "factory.generalManager"; // wage far above anything eligibleJobs (at actual stats) could beat
    p.wage = 999;
    p.maxDependibility = p.dependibility; // at cap
    p.clothing = { casual: 0, dress: 0, business: 5 }; // meets the business uniform, above the low-water mark
    p.fastFood = 1; // fed for next week (no fridge owned)
    p.rentDueWeek = s.week + 10; // rent nowhere near due
    p.relaxation = 20; // above the relax threshold
    p.happiness = 5; // clears goal(0) + buffer(2)
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "EndTurn" });
  });

  it("secures food first from a fresh game", () => {
    const s = solo(defaultConfig);
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "TravelTo", locationId: "monolithBurgers" });
  });

  it("never produces InvalidAction over a full turn", () => {
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    let s = solo(defaultConfig);
    for (let i = 0; i < 40; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
      if (cmd.type === "EndTurn") break;
    }
  });

  it("epsilon=1 always takes a legal random action", () => {
    const preset: AIDifficultyPreset = { planner: "budget", epsilon: 1 };
    const planner = new BudgetPlanner(5, preset, defaultConfig);
    let s = solo(defaultConfig);
    for (let i = 0; i < 20; i++) {
      const cmd = planner.nextCommand(s, "p0");
      const { state, events } = reduce(s, cmd, defaultConfig);
      expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      s = state;
    }
  });

  it("is deterministic for a fixed seed", () => {
    const a = new BudgetPlanner(11, { planner: "budget", epsilon: 0.15 }, defaultConfig);
    const b = new BudgetPlanner(11, { planner: "budget", epsilon: 0.15 }, defaultConfig);
    const s = solo(defaultConfig);
    for (let i = 0; i < 20; i++) expect(a.nextCommand(s, "p0")).toEqual(b.nextCommand(s, "p0"));
  });

  it("falls back to emergency liquidity when every rung is dormant but a durable can be pawned", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.jobId = "factory.generalManager";
    p.wage = 999;
    p.maxDependibility = p.dependibility;
    p.clothing = { casual: 0, dress: 0, business: 5 };
    p.rentDueWeek = s.week + 10;
    p.relaxation = 20;
    p.happiness = 5;
    // Owning the refrigerator flips eatRung to fridge mode — keep it dormant
    // via freshFood, not fastFood.
    p.freshFood = 5;
    p.locationId = "pawnShop";
    p.insideBuilding = true;
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const planner = new BudgetPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "PawnItem", itemId: "refrigeratorSocket" });
  });
});
