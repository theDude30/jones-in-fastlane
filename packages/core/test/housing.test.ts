import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { GameState } from "../src/types.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function rentGame(seed = 0): GameState {
  const state = createInitialGame(testConfig, seed, [
    { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
  ]);
  state.players[0].locationId = "rentOffice";
  state.players[0].insideBuilding = true;
  state.players[0].cash = 5000;
  state.players[0].wage = 10;
  return state;
}

describe("PayRent", () => {
  it("deducts currentRent and advances rentDueWeek by 4", () => {
    const { state, events } = reduce(rentGame(), { type: "PayRent" }, testConfig);
    expect(state.players[0].cash).toBe(5000 - 325);
    expect(state.players[0].rentDueWeek).toBe(8); // started 4, +4
    expect(events[0]).toMatchObject({ type: "RentPaid", amount: 325, rentDueWeek: 8 });
  });

  it("NotEnoughMoney when cash < rent", () => {
    const state = rentGame();
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "PayRent" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });

  it("InvalidAction when not at rentOffice", () => {
    const state = rentGame();
    state.players[0].locationId = "bank";
    const { events } = reduce(state, { type: "PayRent" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "wrong location" });
  });
});

describe("RequestRentExtension", () => {
  it("first request (0 prior, 100% chance) approved, advances dueWeek", () => {
    const { state, events } = reduce(rentGame(), { type: "RequestRentExtension" }, testConfig);
    expect(state.players[0].rentExtensionsApproved).toBe(1);
    expect(state.players[0].rentDueWeek).toBe(8);
    expect(state.players[0].rentExtensionUsedThisTurn).toBe(true);
    expect(events[0]).toMatchObject({ type: "RentExtensionApproved", extensionsApproved: 1, rentDueWeek: 8 });
  });

  it("auto-denied with reason in-debt when everInRentDebt", () => {
    const state = rentGame();
    state.players[0].everInRentDebt = true;
    const { state: s, events } = reduce(state, { type: "RequestRentExtension" }, testConfig);
    expect(s.players[0].happiness).toBe(-1);
    expect(events[0]).toMatchObject({ type: "RentExtensionDenied", reason: "in-debt", happinessCost: 1 });
  });

  it("second request in same turn is InvalidAction", () => {
    const { state: s1 } = reduce(rentGame(), { type: "RequestRentExtension" }, testConfig);
    const { events } = reduce(s1, { type: "RequestRentExtension" }, testConfig);
    expect(events[0]).toMatchObject({ type: "InvalidAction", reason: "extension already requested this turn" });
  });

  it("denied with reason luck when RNG roll fails the tier chance", () => {
    // seed 1 → first nextFloat = 0.6271; at rentExtensionsApproved=3 chance is 0.25; 0.6271 >= 0.25 → denied
    const state = rentGame(1);
    state.players[0].rentExtensionsApproved = 3;
    const { state: s, events } = reduce(state, { type: "RequestRentExtension" }, testConfig);
    expect(s.players[0].happiness).toBe(-1);
    expect(s.players[0].rentExtensionsApproved).toBe(3); // unchanged
    expect(events[0]).toMatchObject({ type: "RentExtensionDenied", reason: "luck", happinessCost: 1 });
  });
});

describe("SwitchApartment", () => {
  it("switches lowCost → security, locks new rent, charges a month, resets dueWeek", () => {
    const { state, events } = reduce(rentGame(), { type: "SwitchApartment" }, testConfig);
    expect(state.players[0].apartmentId).toBe("securityApartments");
    expect(state.players[0].currentRent).toBe(475);
    expect(state.players[0].cash).toBe(5000 - 475);
    expect(state.players[0].rentDueWeek).toBe(5); // week 1 + 4
    expect(events[0]).toMatchObject({ type: "ApartmentSwitched", apartmentId: "securityApartments", newRent: 475, rentDueWeek: 5 });
  });

  it("toggles back security → lowCost", () => {
    const { state: s1 } = reduce(rentGame(), { type: "SwitchApartment" }, testConfig);
    const { state: s2 } = reduce(s1, { type: "SwitchApartment" }, testConfig);
    expect(s2.players[0].apartmentId).toBe("lowCostHousing");
    expect(s2.players[0].currentRent).toBe(325);
  });

  it("rentDebt carries over unchanged", () => {
    const state = rentGame();
    state.players[0].rentDebt = 200;
    const { state: s } = reduce(state, { type: "SwitchApartment" }, testConfig);
    expect(s.players[0].rentDebt).toBe(200);
  });

  it("NotEnoughMoney when cash < new rent", () => {
    const state = rentGame();
    state.players[0].cash = 100;
    const { events } = reduce(state, { type: "SwitchApartment" }, testConfig);
    expect(events[0]).toMatchObject({ type: "NotEnoughMoney" });
  });
});

function workerInDebt(rentDebt: number): GameState {
  const state = rentGame();
  const p = state.players[0];
  p.locationId = "zMart";
  p.insideBuilding = true;
  p.jobId = "zMart.clerk";
  p.wage = 10;
  p.maxExperience = 50;
  p.maxDependibility = 50;
  p.dependibility = 50;
  p.hoursRemaining = 6; // exactly one full work session
  p.cash = 5000;
  p.rentDebt = rentDebt;
  return state;
}

describe("garnishment during Work", () => {
  it("debt >= half: half to debt, $2 interest, rest to cash", () => {
    const state = workerInDebt(100);
    const { state: s, events } = reduce(state, { type: "Work" }, testConfig);
    // earned = 80; half = 40; debt 100 >= 40 → debt 60, cash += 80-40-2 = 38
    expect(s.players[0].rentDebt).toBe(60);
    expect(s.players[0].cash).toBe(5000 + 38);
    expect(events.some((e) => e.type === "Worked" && e.earned === 80)).toBe(true);
    expect(events.some((e) => e.type === "Garnished" && e.toDebt === 40 && e.interest === 2)).toBe(true);
  });

  it("debt < half: only debt taken, no interest", () => {
    const state = workerInDebt(10);
    const { state: s, events } = reduce(state, { type: "Work" }, testConfig);
    // earned = 80; half = 40; debt 10 < 40 → debt 0, cash += 80-10 = 70
    expect(s.players[0].rentDebt).toBe(0);
    expect(s.players[0].cash).toBe(5000 + 70);
    expect(events.some((e) => e.type === "Garnished" && e.toDebt === 10 && e.interest === 0)).toBe(true);
  });

  it("no debt: full earnings, no Garnished event", () => {
    const state = workerInDebt(0);
    const { state: s, events } = reduce(state, { type: "Work" }, testConfig);
    expect(s.players[0].cash).toBe(5000 + 80);
    expect(events.some((e) => e.type === "Garnished")).toBe(false);
  });
});
