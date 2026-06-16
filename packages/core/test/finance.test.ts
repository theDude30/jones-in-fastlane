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
});
