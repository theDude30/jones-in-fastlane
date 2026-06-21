import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { createInitialGame } from "@jones/core";
import type { GameState, PlayerState } from "@jones/core";
import { findPlayer, weakestGoal, canAfford, hasHours, atLocation, isInside } from "../src/selectors.js";

function solo(): GameState {
  const g = createInitialGame(defaultConfig, 1, [
    { name: "A", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
  ]);
  // createInitialGame now runs one start-of-turn pass (decay, food/health) on
  // seat 0 at creation (bug fix: every other seat already got this on its own
  // first turn) — an unfed fresh player loses hours/happiness immediately.
  // Reset to a clean baseline so this file's selector tests aren't coupled
  // to that.
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

describe("findPlayer", () => {
  it("returns the player by id", () => {
    const s = solo();
    expect(findPlayer(s, "p0").id).toBe("p0");
  });
  it("throws on unknown id", () => {
    expect(() => findPlayer(solo(), "nope")).toThrow();
  });
});

describe("weakestGoal", () => {
  const w = { wealth: 1, happiness: 1, education: 1, career: 1 };

  it("returns null when all goals are met", () => {
    const p = solo().players[0];
    p.goals = { wealth: 0, happiness: 0, education: 1, career: 0 }; // education score is 1 at start
    expect(weakestGoal(p, w)).toBeNull();
  });

  it("picks the goal with the lowest progress ratio", () => {
    const p = solo().players[0];
    // scores at start: wealth=floor(cash/100), happiness=0, education=1, career=0
    p.cash = 100000; // wealth score very high
    p.happiness = 50;
    p.goals = { wealth: 100, happiness: 100, education: 100, career: 100 };
    // happiness 50/100=0.5, education 1/100=0.01, career 0/100=0 -> career weakest
    expect(weakestGoal(p, w)).toBe("career");
  });

  it("weights bias selection toward higher-weighted goals", () => {
    const p = solo().players[0];
    p.happiness = 40; // 0.4
    p.cash = 5000;    // wealth score 50 -> 0.5
    p.goals = { wealth: 100, happiness: 100, education: 1, career: 0 };
    // even weights -> happiness (0.4) weakest. Weight wealth heavily -> wealth chosen.
    expect(weakestGoal(p, { wealth: 5, happiness: 1, education: 1, career: 1 })).toBe("wealth");
  });
});

describe("feasibility predicates", () => {
  it("canAfford / hasHours / atLocation / isInside", () => {
    const p = { cash: 100, hoursRemaining: 10, locationId: "bank", insideBuilding: true } as PlayerState;
    expect(canAfford(p, 100)).toBe(true);
    expect(canAfford(p, 101)).toBe(false);
    expect(hasHours(p, 10)).toBe(true);
    expect(hasHours(p, 11)).toBe(false);
    expect(atLocation(p, "bank")).toBe(true);
    expect(atLocation(p, "zMart")).toBe(false);
    expect(isInside(p)).toBe(true);
  });
});

import { legalCommands } from "../src/selectors.js";
import { reduce } from "@jones/core";

describe("legalCommands", () => {
  it("always includes EndTurn", () => {
    const s = solo();
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "EndTurn")).toBe(true);
  });

  it("outside at home offers EnterBuilding and TravelTo, not ExitBuilding", () => {
    const s = solo();
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "EnterBuilding")).toBe(true);
    expect(cmds.some((c) => c.type === "TravelTo")).toBe(true);
    expect(cmds.some((c) => c.type === "ExitBuilding")).toBe(false);
  });

  it("inside offers ExitBuilding", () => {
    const s = solo();
    s.players[0].insideBuilding = true;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "ExitBuilding")).toBe(true);
  });

  it("every returned command is accepted by reduce (no InvalidAction)", () => {
    // Sample several representative states and assert legality.
    const states: GameState[] = [];
    const home = solo(); states.push(home);
    const inHome = solo(); inHome.players[0].insideBuilding = true; states.push(inHome);
    const atStore = solo();
    atStore.players[0].locationId = "monolithBurgers";
    atStore.players[0].insideBuilding = true;
    atStore.players[0].cash = 100000;
    states.push(atStore);

    // Player already at the max-enrollments cap, at the university.
    const atCap = solo();
    atCap.players[0].locationId = "hiTechU";
    atCap.players[0].insideBuilding = true;
    atCap.players[0].cash = 100000;
    atCap.players[0].enrollments = Array.from(
      { length: defaultConfig.constants.maxEnrollments },
      () => ({ degreeId: "tradeSchool", lessonsRemaining: 5 }),
    );
    states.push(atCap);

    // Player already owning a durable, at a store selling another item with the same durableType.
    const ownsDurable = solo();
    ownsDurable.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    ownsDurable.players[0].locationId = "zMart";
    ownsDurable.players[0].insideBuilding = true;
    ownsDurable.players[0].cash = 100000;
    states.push(ownsDurable);

    for (const st of states) {
      for (const cmd of legalCommands(st, "p0", defaultConfig)) {
        const { events } = reduce(st, cmd, defaultConfig);
        expect(events.some((e) => e.type === "InvalidAction")).toBe(false);
      }
    }
  });

  it("excludes Enroll for a player already at the max-enrollments cap", () => {
    const s = solo();
    s.players[0].locationId = "hiTechU";
    s.players[0].insideBuilding = true;
    s.players[0].cash = 100000;
    s.players[0].enrollments = Array.from(
      { length: defaultConfig.constants.maxEnrollments },
      () => ({ degreeId: "tradeSchool", lessonsRemaining: 5 }),
    );
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "Enroll")).toBe(false);
  });

  it("excludes BuyItem for an item sharing durableType with an already-owned durable", () => {
    const s = solo();
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    s.players[0].locationId = "zMart";
    s.players[0].insideBuilding = true;
    s.players[0].cash = 100000;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "BuyItem" && c.itemId === "refrigeratorZMart")).toBe(false);
  });

  it("offers OpenBroker at the bank when the broker isn't open, not when it already is", () => {
    const s = solo();
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    let cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "OpenBroker")).toBe(true);

    s.players[0].brokerMenuOpen = true;
    cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "OpenBroker")).toBe(false);
  });

  it("offers SellStock/SellTBill only when the broker is open and the asset is owned", () => {
    const s = solo();
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].brokerMenuOpen = true;
    s.players[0].stocks.gold = 2;
    s.players[0].tBills = 1;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "SellStock" && c.stockId === "gold")).toBe(true);
    expect(cmds.some((c) => c.type === "SellTBill")).toBe(true);
  });

  it("excludes SellStock/SellTBill when the broker isn't open", () => {
    const s = solo();
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].stocks.gold = 2;
    s.players[0].tBills = 1;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "SellStock")).toBe(false);
    expect(cmds.some((c) => c.type === "SellTBill")).toBe(false);
  });

  it("offers PawnItem for an owned durable whose type isn't already pawned", () => {
    const s = solo();
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "PawnItem" && c.itemId === "refrigeratorSocket")).toBe(true);
  });

  it("excludes PawnItem when that durable type is already pawned state-wide", () => {
    const s = solo();
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    s.pawnedItems = [
      { itemId: "refrigeratorZMart", durableType: "refrigerator", pricePaid: 650, pawnedByPlayerId: "p1", pawnedWeek: 1 },
    ];
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "PawnItem")).toBe(false);
  });
});
