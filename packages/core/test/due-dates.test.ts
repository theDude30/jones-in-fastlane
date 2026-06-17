import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState, GameEvent } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

// Single-player game: every EndTurn wraps → week += 1 → start-of-turn processing.
function soloGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
  ]);
  state.players[0].cash = 5000;
  return state;
}

function advanceToWeek(state: GameState, targetWeek: number): { state: GameState; events: GameEvent[] } {
  let s = state;
  const all: GameEvent[] = [];
  while (s.week < targetWeek) {
    const r = reduce(s, { type: "EndTurn" }, testConfig);
    s = r.state;
    all.push(...r.events);
  }
  return { state: s, events: all };
}

describe("rent due processing", () => {
  it("no debt during the grace through the due week (weeks 1-4)", () => {
    const { state } = advanceToWeek(soloGame(), 4); // reaches week 4 exactly
    const p = state.players[0];
    expect(p.rentDebt).toBe(0);
    expect(p.everInRentDebt).toBe(false);
    expect(p.rentDueWeek).toBe(4);
  });

  it("incurs one month's debt once the due week has passed unpaid", () => {
    const { state, events } = advanceToWeek(soloGame(), 5); // week 5 > rentDueWeek 4
    const p = state.players[0];
    expect(p.rentDebt).toBe(325);          // one month's rent (lowCost base)
    expect(p.everInRentDebt).toBe(true);
    expect(p.rentDueWeek).toBe(8);          // advanced one month so it won't re-charge weekly
    expect(events.some((e) => e.type === "RentDebtIncurred" && e.amount === 325 && e.totalDebt === 325 && e.rentDueWeek === 8)).toBe(true);
  });

  it("charges at most once per month, accumulating debt across months", () => {
    const { state } = advanceToWeek(soloGame(), 9); // misses week-4 and week-8 periods
    const p = state.players[0];
    expect(p.rentDebt).toBe(650);          // 2 months
    expect(p.rentDueWeek).toBe(12);
  });

  it("paying rent before the due week passes avoids debt", () => {
    let s = soloGame();
    s.players[0].locationId = "rentOffice";
    s.players[0].insideBuilding = true;
    s = reduce(s, { type: "PayRent" }, testConfig).state; // rentDueWeek 4 -> 8
    const { state } = advanceToWeek(s, 5);
    const p = state.players[0];
    expect(p.rentDebt).toBe(0);
    expect(p.everInRentDebt).toBe(false);
    expect(p.rentDueWeek).toBe(8);
  });
});

describe("loan due processing", () => {
  function loanGame(): GameState {
    const state = soloGame();
    state.players[0].loanBalance = 1000;
    state.players[0].loanDueWeek = 4;
    state.players[0].rentDueWeek = 1000; // park rent far out so it doesn't interfere
    return state;
  }

  it("no default during the grace through the due week", () => {
    const { state } = advanceToWeek(loanGame(), 4);
    const p = state.players[0];
    expect(p.loanInDefault).toBe(false);
    expect(p.timesDefaulted).toBe(0);
    expect(p.loanDueWeek).toBe(4);
  });

  it("defaults once the loan due week has passed unpaid", () => {
    const { state, events } = advanceToWeek(loanGame(), 5);
    const p = state.players[0];
    expect(p.loanInDefault).toBe(true);
    expect(p.timesDefaulted).toBe(1);
    expect(p.loanDueWeek).toBe(8); // advanced one month
    expect(events.some((e) => e.type === "LoanDefaulted" && e.timesDefaulted === 1 && e.dueWeek === 8 && e.happinessCost === 1)).toBe(true);
  });

  it("no default when there is no outstanding loan", () => {
    const { state, events } = advanceToWeek(soloGame(), 6);
    const p = state.players[0];
    expect(p.timesDefaulted).toBe(0);
    expect(p.loanInDefault).toBe(false);
    expect(events.some((e) => e.type === "LoanDefaulted")).toBe(false);
  });
});
