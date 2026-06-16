import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function bankGame(): GameState {
  const state = createInitialGame(testConfig, 0, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = "bank";
  state.players[0].insideBuilding = true;
  state.players[0].cash = 5000;
  state.players[0].bank = 500;
  state.players[0].wage = 10;
  return state;
}

describe("Deposit", () => {
  it("decreases cash and increases bank by the amount", () => {
    const { state } = reduce(bankGame(), { type: "Deposit", amount: 300 }, testConfig);
    expect(state.players[0].cash).toBe(4700);
    expect(state.players[0].bank).toBe(800);
  });

  it("emits Deposited event", () => {
    const { events } = reduce(bankGame(), { type: "Deposit", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "Deposited", amount: 300 });
  });

  it("InvalidAction when amount is not a positive multiple of 100", () => {
    const { events } = reduce(bankGame(), { type: "Deposit", amount: 150 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction" });
  });

  it("NotEnoughMoney when cash < amount", () => {
    const state = bankGame();
    state.players[0].cash = 200;
    const { events } = reduce(state, { type: "Deposit", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when not at bank", () => {
    const state = bankGame();
    state.players[0].locationId = "zMart";
    const { events } = reduce(state, { type: "Deposit", amount: 100 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("Withdraw", () => {
  it("decreases bank and increases cash by the amount", () => {
    const { state } = reduce(bankGame(), { type: "Withdraw", amount: 300 }, testConfig);
    expect(state.players[0].cash).toBe(5300);
    expect(state.players[0].bank).toBe(200);
  });

  it("emits Withdrawn event", () => {
    const { events } = reduce(bankGame(), { type: "Withdraw", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "Withdrawn", amount: 300 });
  });

  it("NotEnoughMoney when bank < amount", () => {
    const state = bankGame();
    state.players[0].bank = 200;
    const { events } = reduce(state, { type: "Withdraw", amount: 300 }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when amount is not a positive multiple of 100", () => {
    const { events } = reduce(bankGame(), { type: "Withdraw", amount: 50 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction" });
  });

  it("InvalidAction when not at bank", () => {
    const state = bankGame();
    state.players[0].locationId = "zMart";
    const { events } = reduce(state, { type: "Withdraw", amount: 100 }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("ApplyLoan", () => {
  it("LoanDenied reason=unemployed when wage=0, -1 happiness, 2h deducted", () => {
    const state = bankGame();
    state.players[0].wage = 0;
    const { state: s, events } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
    expect(s.players[0].happiness).toBe(-1);
    expect(events[0]).toMatchObject({ type: "LoanDenied", reason: "unemployed", happinessCost: 1 });
  });

  it("LoanApproved: correct loanSize, dueWeek=week+4, +5 happiness, 2h deducted", () => {
    // bankGame: wage=10, cash=5000, bank=500, no stocks/tBills
    // liquidAssets = 5000 + 500 = 5500
    // liquidity = 10 + 5500/1000 = 15.5
    // risk = 5 (fresh borrower: timesDefaulted=0, loanBalance=0)
    // loanSize = 100 * floor(15.5 - 5) = 1000
    const { state: s, events } = reduce(bankGame(), { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
    expect(s.players[0].loanBalance).toBe(1000);
    expect(s.players[0].loanDueWeek).toBe(5); // week 1 + 4
    expect(s.players[0].happiness).toBe(5);
    expect(events[0]).toMatchObject({ type: "LoanApproved", amount: 1000, dueWeek: 5, happinessGained: 5 });
  });

  it("LoanDenied reason=in-default when loanInDefault=true", () => {
    const state = bankGame();
    state.players[0].loanInDefault = true;
    const { state: s, events } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
    expect(events[0]).toMatchObject({ type: "LoanDenied", reason: "in-default" });
  });

  it("risk formula: timesDefaulted=2, loanBalance=200 → risk=10, loanSize=500", () => {
    // risk = 5 + 2 + floor(200/100) + 1 = 10
    // liquidity = 10 + 5500/1000 = 15.5
    // loanSize = 100 * floor(15.5 - 10) = 500
    // new loanBalance = 200 + 500 = 700
    const state = bankGame();
    state.players[0].timesDefaulted = 2;
    state.players[0].loanBalance = 200;
    const { state: s } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].loanBalance).toBe(700);
  });

  it("hours are deducted even when loan is denied", () => {
    const state = bankGame();
    state.players[0].wage = 0;
    const { state: s } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(s.players[0].hoursRemaining).toBe(58);
  });

  it("NotEnoughTime when hoursRemaining < applyLoan cost", () => {
    const state = bankGame();
    state.players[0].hoursRemaining = 1;
    const { events } = reduce(state, { type: "ApplyLoan" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughTime", action: "ApplyLoan" });
  });
});
