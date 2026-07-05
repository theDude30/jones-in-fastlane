import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { makeEconomy } from "@jones/core";
import type { GameState } from "@jones/core";
import { computeBudget } from "../src/budget.js";
import { eatRung, rentRung, clothesRung, healthRung, employmentRung, depMaintenanceWorkRung, cashFloorWorkRung, educationRung, happinessRung, wealthSweepRung } from "../src/rungs.js";
import type { TurnContext } from "../src/rungs.js";
import { solo } from "./testHelpers.js";

const economy = makeEconomy(defaultConfig);

function ctxFor(state: GameState): TurnContext {
  return { state, player: state.players[0], config: defaultConfig, economy, budget: computeBudget(state.players[0], state, defaultConfig, economy) };
}

describe("eatRung", () => {
  it("buys fries when unfridged and out of fast food", () => {
    const s = solo(defaultConfig);
    expect(eatRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "monolithBurgers" });
  });

  it("does nothing once fast food is stocked", () => {
    const s = solo(defaultConfig);
    s.players[0].fastFood = 1;
    expect(eatRung(ctxFor(s))).toBeNull();
  });

  it("restocks the 4-week fresh-food pack when fridged and low", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    s.players[0].freshFood = 0;
    s.players[0].locationId = "blacksMarket";
    s.players[0].insideBuilding = true;
    expect(eatRung(ctxFor(s))).toEqual({ type: "BuyItem", itemId: "freshFood4Wk" });
  });

  it("does nothing once fresh food is above the low-water mark", () => {
    const s = solo(defaultConfig);
    s.players[0].durables = [{ itemId: "refrigeratorZMart", pricePaid: 650 }];
    s.players[0].freshFood = 4;
    expect(eatRung(ctxFor(s))).toBeNull();
  });
});

describe("rentRung", () => {
  it("does nothing when rent isn't due soon", () => {
    const s = solo(defaultConfig); // rentDueWeek=4, week=1
    expect(rentRung(ctxFor(s))).toBeNull();
  });

  it("pays rent once due within the pay horizon and cash covers it", () => {
    const s = solo(defaultConfig);
    s.week = 3; // rentDueWeek(4) - week(3) = 1 <= horizon(1)
    s.players[0].cash = 1000; // initialCash (200) can't cover the $325 rent
    expect(rentRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "rentOffice" });
  });

  it("pays once at the rent office", () => {
    const s = solo(defaultConfig);
    s.week = 3;
    s.players[0].cash = 1000;
    s.players[0].locationId = "rentOffice";
    s.players[0].insideBuilding = true;
    expect(rentRung(ctxFor(s))).toEqual({ type: "PayRent" });
  });

  it("does nothing when due soon but unaffordable", () => {
    const s = solo(defaultConfig);
    s.week = 3;
    s.players[0].cash = 100;
    expect(rentRung(ctxFor(s))).toBeNull();
  });
});

describe("clothesRung", () => {
  it("does nothing with fresh starting casual clothing (6 weeks)", () => {
    const s = solo(defaultConfig);
    expect(clothesRung(ctxFor(s))).toBeNull();
  });

  it("buys the cheapest casual outfit once clothing is low, unemployed", () => {
    const s = solo(defaultConfig);
    s.players[0].clothing = { casual: 1, dress: 0, business: 0 };
    expect(clothesRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" });
  });

  it("targets the job's required uniform level once employed", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "zMart.assistantManager"; // uniform: "dress"
    s.players[0].clothing = { casual: 6, dress: 0, business: 0 };
    expect(clothesRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // dressClothesZMart, $90
  });
});

describe("healthRung", () => {
  it("enters the apartment first when at home but outside, relaxation at or below the threshold", () => {
    const s = solo(defaultConfig); // initialRelaxation=10 <= threshold 12; at lowCostHousing, outside
    expect(healthRung(ctxFor(s))).toEqual({ type: "EnterBuilding" });
  });

  it("relaxes once inside its own apartment", () => {
    const s = solo(defaultConfig);
    s.players[0].insideBuilding = true; // at lowCostHousing, inside
    expect(healthRung(ctxFor(s))).toEqual({ type: "Relax" });
  });

  it("does nothing once relaxation is above the threshold", () => {
    const s = solo(defaultConfig);
    s.players[0].relaxation = 20;
    expect(healthRung(ctxFor(s))).toBeNull();
  });
});

describe("employmentRung", () => {
  it("applies for the best-paying eligible job when unemployed", () => {
    const s = solo(defaultConfig); // week 1: dep gate off, exp=10 qualifies several jobs
    // Best-paying eligible job at week 1, exp 10, no degrees: factory.janitor ($7/hr).
    expect(employmentRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "employmentOffice" });
  });

  it("applies once at the employment office", () => {
    const s = solo(defaultConfig);
    s.players[0].locationId = "employmentOffice";
    s.players[0].insideBuilding = true;
    expect(employmentRung(ctxFor(s))).toEqual({ type: "ApplyForJob", jobId: "factory.janitor" });
  });

  it("does nothing when already employed and no worthwhile upgrade is eligible", () => {
    const s = solo(defaultConfig);
    s.players[0].jobId = "factory.generalManager"; // top wage, nothing higher exists
    s.players[0].wage = 25;
    s.players[0].dependibility = 70; // meets factory.generalManager's own reqDependibility(70), so canSustain holds
    expect(employmentRung(ctxFor(s))).toBeNull();
  });

  it("skips an unsustainable high-wage job in favor of one the player can actually work, when unemployed", () => {
    const s = solo(defaultConfig);
    s.players[0].dependibility = 12; // below factory.janitor's reqDependibility(20)-5=15, and below every other reqDependibility(20) job's -5 line, but above the reqDependibility(10) jobs' -5=5 line
    // factory.janitor ($7) would normally win by wage, but canSustain fails (12 < 15), as does every other reqDependibility-20 job.
    // Among the surviving reqDependibility-10 jobs (zMart.clerk $5, monolithBurgers.cook $5, hiTechU.janitor $5, blacksMarket.janitor $6),
    // blacksMarket.janitor is the highest-wage one that passes canSustain (12 >= 5).
    expect(employmentRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "employmentOffice" });
  });

  it("applies to the sustainable job once at the employment office, not the unsustainable higher-wage one", () => {
    const s = solo(defaultConfig);
    s.players[0].dependibility = 12;
    s.players[0].locationId = "employmentOffice";
    s.players[0].insideBuilding = true;
    expect(employmentRung(ctxFor(s))).toEqual({ type: "ApplyForJob", jobId: "blacksMarket.janitor" });
  });

  it("quits when the current job has become permanently unworkable at today's dependibility", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "factory.janitor"; // reqDependibility 20
    p.dependibility = 10; // 10 < 20 - 5 = 15 -> unsustainable
    expect(employmentRung(ctxFor(s))).toEqual({ type: "QuitJob" });
  });

  it("does not quit a job that's still sustainable", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "factory.janitor";
    p.dependibility = 16; // 16 >= 20 - 5 = 15 -> sustainable
    p.wage = 25; // does not affect selection (employmentRung compares against the job's config baseWage, not p.wage)
    expect(employmentRung(ctxFor(s))).toBeNull();
  });
});

describe("depMaintenanceWorkRung", () => {
  it("does nothing without a job", () => {
    const s = solo(defaultConfig);
    expect(depMaintenanceWorkRung(ctxFor(s))).toBeNull();
  });

  it("does nothing when dependibility is already at its cap", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.maxDependibility = p.dependibility; // already at cap
    expect(depMaintenanceWorkRung(ctxFor(s))).toBeNull();
  });

  it("works toward the cap once employed and below it", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk"; // reqDependibility 10 -> maxDependibility becomes 20+10+0=30
    p.maxDependibility = 30;
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    expect(depMaintenanceWorkRung(ctxFor(s))).toEqual({ type: "Work" });
  });

  it("won't Work if the uniform isn't met (leaves it to clothesRung)", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.maxDependibility = 30;
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    p.clothing = { casual: 0, dress: 0, business: 0 };
    expect(depMaintenanceWorkRung(ctxFor(s))).toBeNull();
  });
});

describe("cashFloorWorkRung", () => {
  it("does nothing without a job", () => {
    const s = solo(defaultConfig);
    expect(cashFloorWorkRung(ctxFor(s))).toBeNull();
  });

  it("does nothing when cash already covers the floor", () => {
    const s = solo(defaultConfig); // cash 200, floor ~150 (see budget.test.ts)
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    expect(cashFloorWorkRung(ctxFor(s))).toBeNull();
  });

  it("works when cash is below the floor", () => {
    const s = solo(defaultConfig);
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    p.cash = 50; // below the ~150 floor
    expect(cashFloorWorkRung(ctxFor(s))).toEqual({ type: "Work" });
  });
});

describe("educationRung", () => {
  it("does nothing once education 19 (2 degrees) is already met", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].degrees = ["juniorCollege", "tradeSchool"];
    expect(educationRung(ctxFor(s))).toBeNull();
  });

  it("heads to the university to enroll when below the education goal", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].cash = 5000;
    expect(educationRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "hiTechU" });
  });

  it("enrolls in a prereq-free degree once at the university", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].cash = 5000;
    s.players[0].locationId = "hiTechU";
    s.players[0].insideBuilding = true;
    expect(educationRung(ctxFor(s))).toEqual({ type: "Enroll", degreeId: "juniorCollege" });
  });

  it("studies an existing enrollment instead of enrolling again", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 0, education: 19, career: 0 });
    s.players[0].locationId = "hiTechU";
    s.players[0].insideBuilding = true;
    s.players[0].enrollments = [{ degreeId: "juniorCollege", lessonsRemaining: 10 }];
    expect(educationRung(ctxFor(s))).toEqual({ type: "Study", degreeId: "juniorCollege" });
  });
});

describe("happinessRung", () => {
  it("does nothing once happiness already clears goal + buffer", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 10, education: 0, career: 0 });
    s.players[0].happiness = 13; // 10 + buffer(2) + 1
    expect(happinessRung(ctxFor(s))).toBeNull();
  });

  it("buys the microwave first (cheapest un-owned durable pump) when discretionary cash allows", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 30, education: 0, career: 0 });
    s.players[0].cash = 1000; // discretionary well above $220
    expect(happinessRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // microwaveZMart $220 < socketCity's $330
  });

  it("falls through to tickets once both durables are owned", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 30, education: 0, career: 0 });
    const p = s.players[0];
    p.cash = 1000;
    p.durables = [
      { itemId: "microwaveZMart", pricePaid: 220 },
      { itemId: "refrigeratorZMart", pricePaid: 650 },
    ];
    expect(happinessRung(ctxFor(s))).toEqual({ type: "TravelTo", locationId: "zMart" }); // tickets sold at zMart
  });

  it("does nothing when discretionary cash can't cover any happiness purchase", () => {
    const s = solo(defaultConfig, { wealth: 0, happiness: 30, education: 0, career: 0 });
    s.players[0].cash = 0;
    expect(happinessRung(ctxFor(s))).toBeNull();
  });
});

describe("wealthSweepRung", () => {
  it("does nothing without a job", () => {
    const s = solo(defaultConfig, { wealth: 30, happiness: 0, education: 0, career: 0 });
    expect(wealthSweepRung(ctxFor(s))).toBeNull();
  });

  it("does nothing once the wealth goal is met", () => {
    const s = solo(defaultConfig, { wealth: 1, happiness: 0, education: 0, career: 0 });
    s.players[0].jobId = "zMart.clerk";
    expect(wealthSweepRung(ctxFor(s))).toBeNull(); // floor(200/100)=2 >= 1
  });

  it("works every remaining hour toward an unmet wealth goal", () => {
    const s = solo(defaultConfig, { wealth: 30, happiness: 0, education: 0, career: 0 });
    const p = s.players[0];
    p.jobId = "zMart.clerk";
    p.wage = 10;
    p.locationId = "zMart";
    p.insideBuilding = true;
    expect(wealthSweepRung(ctxFor(s))).toEqual({ type: "Work" });
  });
});
