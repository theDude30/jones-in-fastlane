import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { reduce } from "@jones/core";
import type { GameState, PlayerState } from "@jones/core";
import { findPlayer, canAfford, hasHours, atLocation, isInside, legalCommands } from "../src/selectors.js";
import { solo } from "./testHelpers.js";

describe("findPlayer", () => {
  it("returns the player by id", () => {
    const s = solo(defaultConfig);
    expect(findPlayer(s, "p0").id).toBe("p0");
  });
  it("throws on unknown id", () => {
    expect(() => findPlayer(solo(defaultConfig), "nope")).toThrow();
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

describe("legalCommands", () => {
  it("always includes EndTurn", () => {
    const s = solo(defaultConfig);
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "EndTurn")).toBe(true);
  });

  it("outside at home offers EnterBuilding and TravelTo, not ExitBuilding", () => {
    const s = solo(defaultConfig);
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "EnterBuilding")).toBe(true);
    expect(cmds.some((c) => c.type === "TravelTo")).toBe(true);
    expect(cmds.some((c) => c.type === "ExitBuilding")).toBe(false);
  });

  it("inside offers ExitBuilding", () => {
    const s = solo(defaultConfig);
    s.players[0].insideBuilding = true;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "ExitBuilding")).toBe(true);
  });

  it("every returned command is accepted by reduce (no InvalidAction)", () => {
    // Sample several representative states and assert legality.
    const states: GameState[] = [];
    const home = solo(defaultConfig); states.push(home);
    const inHome = solo(defaultConfig); inHome.players[0].insideBuilding = true; states.push(inHome);
    const atStore = solo(defaultConfig);
    atStore.players[0].locationId = "monolithBurgers";
    atStore.players[0].insideBuilding = true;
    atStore.players[0].cash = 100000;
    states.push(atStore);

    // Player already at the max-enrollments cap, at the university.
    const atCap = solo(defaultConfig);
    atCap.players[0].locationId = "hiTechU";
    atCap.players[0].insideBuilding = true;
    atCap.players[0].cash = 100000;
    atCap.players[0].enrollments = Array.from(
      { length: defaultConfig.constants.maxEnrollments },
      () => ({ degreeId: "tradeSchool", lessonsRemaining: 5 }),
    );
    states.push(atCap);

    // Player already owning a durable, at a store selling another item with the same durableType.
    const ownsDurable = solo(defaultConfig);
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
    const s = solo(defaultConfig);
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
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    s.players[0].locationId = "zMart";
    s.players[0].insideBuilding = true;
    s.players[0].cash = 100000;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "BuyItem" && c.itemId === "refrigeratorZMart")).toBe(false);
  });

  it("offers OpenBroker at the bank when the broker isn't open, not when it already is", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    let cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "OpenBroker")).toBe(true);

    s.players[0].brokerMenuOpen = true;
    cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "OpenBroker")).toBe(false);
  });

  it("offers SellStock/SellTBill only when the broker is open and the asset is owned", () => {
    const s = solo(defaultConfig);
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
    const s = solo(defaultConfig);
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].stocks.gold = 2;
    s.players[0].tBills = 1;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "SellStock")).toBe(false);
    expect(cmds.some((c) => c.type === "SellTBill")).toBe(false);
  });

  it("offers PawnItem for an owned durable whose type isn't already pawned", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "PawnItem" && c.itemId === "refrigeratorSocket")).toBe(true);
  });

  it("excludes PawnItem when that durable type is already pawned state-wide", () => {
    const s = solo(defaultConfig);
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
