import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { Command, GameState, GameEvent } from "../src/types.js";
import { resetToFreshTurn } from "./testHelpers.js";

const testConfig = { ...defaultConfig, economy: constantEconomyConfig };

function run(state: GameState, commands: Command[]): GameState {
  let s = state;
  for (const c of commands) {
    s = reduce(s, c, defaultConfig).state;
  }
  return s;
}

describe("headless game", () => {
  it("a solo player can travel to Z-Mart, get hired implicitly, and earn money", () => {
    const game = createInitialGame(defaultConfig, 7, [
      { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    resetToFreshTurn(game, defaultConfig, 7);
    game.players[0].jobId = "zMart.clerk";
    game.players[0].wage = 5;
    game.players[0].maxExperience = 30;
    game.players[0].maxDependibility = 30;

    const after = run(game, [
      { type: "TravelTo", locationId: "zMart" },
      { type: "EnterBuilding" },
      { type: "Work" },
      { type: "Work" },
    ]);
    expect(after.players[0].cash).toBe(200 + 2 * 8 * 5); // 280
    expect(after.players[0].experience).toBe(12);
  });

  it("is fully deterministic: same seed + same commands ⇒ identical state", () => {
    const setups = [{ name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } }];
    const cmds: Command[] = [
      { type: "TravelTo", locationId: "bank" },
      { type: "EnterBuilding" },
      { type: "ExitBuilding" },
      { type: "EndTurn" },
    ];
    const a = run(createInitialGame(defaultConfig, 99, setups), cmds);
    const b = run(createInitialGame(defaultConfig, 99, setups), cmds);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  it("runs many weeks without crashing and advances the clock/weeks", () => {
    let game = createInitialGame(defaultConfig, 3, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
      { name: "B", isAI: true, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    for (let i = 0; i < 40; i++) {
      game = reduce(game, { type: "EndTurn" }, defaultConfig).state;
      if (game.status === "ended") break;
    }
    expect(game.week).toBeGreaterThan(1);
  });
});

describe("employment flow", () => {
  it("solo player can hire at Employment Office and earn money at work", () => {
    const cmds: Command[] = [
      { type: "TravelTo", locationId: "employmentOffice" },
      { type: "EnterBuilding" },
      { type: "ApplyForJob", jobId: "monolithBurgers.cook" },
      { type: "ExitBuilding" },
      { type: "TravelTo", locationId: "monolithBurgers" },
      { type: "EnterBuilding" },
      { type: "Work" },
      { type: "EndTurn" },
    ];

    let state = createInitialGame(defaultConfig, 42, [
      { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    resetToFreshTurn(state, defaultConfig, 42);
    const allEvents: GameEvent[] = [];
    for (const cmd of cmds) {
      const result = reduce(state, cmd, defaultConfig);
      state = result.state;
      allEvents.push(...result.events);
    }

    expect(state.players[0].jobId).toBe("monolithBurgers.cook");
    expect(state.players[0].cash).toBeGreaterThan(200);
    expect(state.week).toBe(2);
    expect(allEvents.some((e) => e.type === "EconomyUpdated")).toBe(true);
    expect(allEvents.some((e) => e.type === "JobApplied" && e.jobId === "monolithBurgers.cook")).toBe(true);
  });
});

describe("shopping flow", () => {
  it("player buys fast food, clothes, a durable, and the full book set", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    resetToFreshTurn(state, config, 0);
    state.players[0].cash = 5000; // override $200 initial; computerSocket costs $1,599
    const allEvents: GameEvent[] = [];

    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Travel to Monolith Burgers and enter
    step({ type: "TravelTo", locationId: "monolithBurgers" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "astroChicken" });  // +2 happiness, fastFood=1

    // Exit, travel to QT Clothing, buy dress clothes
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "qtClothing" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "dressClothesQT" }); // +1 happiness, dress weeks=13

    // Exit, travel to Socket City, buy a computer
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "socketCity" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "computerSocket" }); // +3 happiness, extraCredit=1

    // Exit, travel to Z-Mart, buy all three books
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "zMart" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "encyclopedia" });
    step({ type: "BuyItem", itemId: "dictionary" });
    step({ type: "BuyItem", itemId: "atlas" });  // extraCredit = 2 (books complete)

    const p = state.players[0];

    expect(p.fastFood).toBe(1);
    expect(p.clothing.dress).toBe(13);
    expect(p.durables.find((d) => d.itemId === "computerSocket")).toBeDefined();
    expect(p.durables.find((d) => d.itemId === "atlas")).toBeDefined();
    expect(p.extraCredit).toBe(2); // +1 computer, +1 books set
    expect(p.happiness).toBe(6);   // +2 astro + 1 dress + 3 computer

    const bought = allEvents.filter((e) => e.type === "ItemBought");
    expect(bought).toHaveLength(6);

    const atlasBought = bought.find((e) => e.type === "ItemBought" && (e as any).itemId === "atlas");
    expect(atlasBought).toMatchObject({ type: "ItemBought", extraCreditGained: 1 });
  });
});

describe("education flow", () => {
  it("solo player can enroll at Hi-Tech U and graduate by studying 10 lessons", () => {
    // Travel home (lowCostHousing, ringIndex 0) to hiTechU (ringIndex 6):
    // steps = min(6, 13-6) = 6, hours = 6 * (10/13) ≈ 4.62h.
    // After travel + enter (2h): ~53.38h remain → 8 studies (48h used).
    // EndTurn resets player to home (insideBuilding=false), fresh 60h.
    // Turn 2: travel (~4.62h) + enter (2h) + 2 studies (12h) → Graduated on 10th study.
    const cmds: Command[] = [
      // Turn 1: travel, enter, enroll, 8 studies
      { type: "TravelTo", locationId: "hiTechU" },
      { type: "EnterBuilding" },
      { type: "Enroll", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "EndTurn" },
      // Turn 2: travel back to hiTechU, enter, 2 more studies → graduation
      { type: "TravelTo", locationId: "hiTechU" },
      { type: "EnterBuilding" },
      { type: "Study", degreeId: "juniorCollege" },
      { type: "Study", degreeId: "juniorCollege" },
    ];

    let state = createInitialGame(testConfig, 7, [
      { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    resetToFreshTurn(state, testConfig, 7);
    const allEvents: GameEvent[] = [];
    for (const cmd of cmds) {
      const result = reduce(state, cmd, testConfig);
      state = result.state;
      allEvents.push(...result.events);
    }

    const p = state.players[0];
    expect(allEvents.some((e) => e.type === "Enrolled" && e.degreeId === "juniorCollege")).toBe(true);
    expect(allEvents.some((e) => e.type === "Graduated" && e.degreeId === "juniorCollege")).toBe(true);
    expect(p.degrees).toContain("juniorCollege");
    expect(p.enrollments.find((e) => e.degreeId === "juniorCollege")).toBeUndefined();
  });
});

describe("financial flow", () => {
  it("player deposits, uses broker, and buys lottery tickets", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    state.players[0].cash = 5000;
    const allEvents: GameEvent[] = [];

    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Travel to bank, deposit $500, open broker, buy gold, buy T-bill, exit
    step({ type: "TravelTo", locationId: "bank" });
    step({ type: "EnterBuilding" });
    step({ type: "Deposit", amount: 500 });
    step({ type: "OpenBroker" });
    step({ type: "BuyStock", stockId: "gold" });  // costs $413
    step({ type: "BuyTBill" });                    // costs $100
    step({ type: "ExitBuilding" });

    // brokerMenuOpen cleared after exit
    expect(state.players[0].brokerMenuOpen).toBe(false);

    // SellTBill after broker closed → InvalidAction
    const { events: afterExit } = reduce(state, { type: "SellTBill" }, config);
    expect(afterExit[0]).toMatchObject({ type: "InvalidAction", reason: "broker not open" });

    // Travel to Black's Market, buy lottery tickets
    step({ type: "TravelTo", locationId: "blacksMarket" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyLotteryTickets" });

    const p = state.players[0];
    // cash: 5000 - 500 (deposit) - 413 (gold) - 100 (tbill) - 10 (lottery) = 3977
    expect(p.cash).toBe(3977);
    expect(p.bank).toBe(500);
    expect(p.stocks.gold).toBe(1);
    expect(p.tBills).toBe(1);
    expect(p.lotteryTickets).toBe(10);

    expect(allEvents.some((e) => e.type === "Deposited")).toBe(true);
    expect(allEvents.some((e) => e.type === "StockBought")).toBe(true);
    expect(allEvents.some((e) => e.type === "LotteryTicketsBought")).toBe(true);
  });
});

describe("housing & pawn flow", () => {
  it("buys a durable, pawns and redeems it, then pays rent and switches apartment", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 50, happiness: 50, education: 50, career: 50 } },
    ]);
    state.players[0].cash = 5000;
    const allEvents: GameEvent[] = [];

    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Buy a refrigerator at Socket City ($876)
    step({ type: "TravelTo", locationId: "socketCity" });
    step({ type: "EnterBuilding" });
    step({ type: "BuyItem", itemId: "refrigeratorSocket" });
    const afterBuyCash = state.players[0].cash;

    // Travel to the Pawn Shop, pawn it (payout 350), then redeem it same week (cost 438)
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "pawnShop" });
    step({ type: "EnterBuilding" });
    step({ type: "PawnItem", itemId: "refrigeratorSocket" });
    expect(state.pawnedItems).toHaveLength(1);
    expect(state.players[0].cash).toBe(afterBuyCash + 350);

    step({ type: "RedeemItem", itemId: "refrigeratorSocket" });
    expect(state.pawnedItems).toHaveLength(0);
    expect(state.players[0].durables.find((d) => d.itemId === "refrigeratorSocket")).toBeDefined();

    // Travel to the Rent Office, pay rent then switch apartment
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "rentOffice" });
    step({ type: "EnterBuilding" });
    step({ type: "PayRent" });
    const dueAfterPay = state.players[0].rentDueWeek;
    step({ type: "SwitchApartment" });

    const p = state.players[0];
    expect(dueAfterPay).toBe(8);                 // started 4, +4 from PayRent
    expect(p.apartmentId).toBe("securityApartments");
    expect(p.currentRent).toBe(475);
    expect(allEvents.some((e) => e.type === "ItemPawned")).toBe(true);
    expect(allEvents.some((e) => e.type === "ItemRedeemed")).toBe(true);
    expect(allEvents.some((e) => e.type === "RentPaid")).toBe(true);
    expect(allEvents.some((e) => e.type === "ApartmentSwitched")).toBe(true);
  });
});

describe("rent debt & loan default lifecycle", () => {
  it("misses rent → debt accrues → work garnishes it; defaults a loan → PayLoan clears default", () => {
    const config = { ...defaultConfig, economy: constantEconomyConfig };
    let state = createInitialGame(config, 0, [
      { name: "A", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
    ]);
    const p0 = state.players[0];
    p0.cash = 5000;
    // A job so Work earns wages to garnish.
    p0.jobId = "zMart.clerk";
    p0.wage = 10;
    p0.maxExperience = 50;
    p0.maxDependibility = 50;
    p0.dependibility = 50;
    // An outstanding loan due at week 4.
    p0.loanBalance = 1000;
    p0.loanDueWeek = 4;

    const allEvents: GameEvent[] = [];
    function step(cmd: Parameters<typeof reduce>[1]) {
      const r = reduce(state, cmd, config);
      state = r.state;
      allEvents.push(...r.events);
    }

    // Advance to week 5: both the rent (due week 4) and loan (due week 4) periods lapse unpaid.
    while (state.week < 5) step({ type: "EndTurn" });

    let p = state.players[0];
    expect(p.rentDebt).toBe(325);
    expect(p.everInRentDebt).toBe(true);
    expect(p.loanInDefault).toBe(true);
    expect(p.timesDefaulted).toBe(1);
    expect(allEvents.some((e) => e.type === "RentDebtIncurred")).toBe(true);
    expect(allEvents.some((e) => e.type === "LoanDefaulted")).toBe(true);

    // Work one session at Z-Mart: earned = floor(8 * 10 * 6 / 6) = 80; half (40) → debt, $2 interest.
    step({ type: "TravelTo", locationId: "zMart" });
    step({ type: "EnterBuilding" });
    const cashBeforeWork = state.players[0].cash;
    step({ type: "Work" });
    p = state.players[0];
    expect(p.rentDebt).toBe(285);                 // 325 - 40
    expect(p.cash).toBe(cashBeforeWork + 38);     // 80 - 40 - 2
    expect(allEvents.some((e) => e.type === "Garnished" && e.toDebt === 40 && e.interest === 2)).toBe(true);

    // Pay down the defaulted loan at the Bank: clears the default flag.
    step({ type: "ExitBuilding" });
    step({ type: "TravelTo", locationId: "bank" });
    step({ type: "EnterBuilding" });
    const cashBeforePay = state.players[0].cash;
    step({ type: "PayLoan" });
    p = state.players[0];
    expect(p.loanInDefault).toBe(false);
    expect(p.loanBalance).toBe(955);              // 1000 - 45
    expect(p.cash).toBe(cashBeforePay - 50);
    expect(allEvents.some((e) => e.type === "LoanPaid")).toBe(true);
  });
});
