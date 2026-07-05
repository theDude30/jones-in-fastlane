import { bestUniform, findJob, meetsUniform, ownsDurableType } from "@jones/core";
import type { Command, Economy, GameState, PlayerState } from "@jones/core";
import type { GameConfig, UniformLevel } from "@jones/config";
import { canAfford, hasHours, eligibleJobs } from "./selectors.js";
import { goBuy, navigateInto } from "./nav.js";
import { adjustedItemPrice, PLANNER_TUNING, type TurnBudget } from "./budget.js";

export interface TurnContext {
  state: GameState;
  player: PlayerState;
  config: GameConfig;
  economy: Economy;
  budget: TurnBudget;
}

/** Weeks left on whichever clothing category currently satisfies a uniform check. */
function uniformWeeksLeft(p: PlayerState): number {
  const best = bestUniform(p);
  return best === null ? 0 : p.clothing[best];
}

/** Rung 1: keep a week of food in reserve so the next start-of-week check doesn't starve. */
export function eatRung(ctx: TurnContext): Command | null {
  const { player: p, state, config, economy } = ctx;
  const hasFridge = ownsDurableType(p, config, "refrigerator");

  if (hasFridge) {
    if (p.freshFood > PLANNER_TUNING.fridgeLowWaterWeeks) return null;
    const candidates = config.items
      .filter((it) => it.category === "freshFood")
      .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
      .filter(({ price }) => canAfford(p, price))
      .sort((a, b) => (b.it.freshFoodWeeks ?? 0) - (a.it.freshFoodWeeks ?? 0) || a.price - b.price);
    if (candidates.length === 0) return null;
    return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
  }

  if (p.fastFood > 0) return null;
  const candidates = config.items
    .filter((it) => it.category === "fastFood")
    .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
    .filter(({ price }) => canAfford(p, price))
    .sort((a, b) => a.price - b.price);
  if (candidates.length === 0) return null;
  return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
}

/** Rung 2: pay rent proactively once its due date is within the pay horizon. */
export function rentRung(ctx: TurnContext): Command | null {
  const { player: p, state, config } = ctx;
  if (p.rentDueWeek - state.week > PLANNER_TUNING.rentPayHorizonWeeks) return null;
  if (!canAfford(p, p.currentRent)) return null;
  const nav = navigateInto(p, "rentOffice", config);
  if (nav) return nav;
  if (p.locationId !== "rentOffice" || !p.insideBuilding) return null;
  return { type: "PayRent" };
}

/** Rung 3: replace a lapsing uniform (job's required level, or casual if unemployed). */
export function clothesRung(ctx: TurnContext): Command | null {
  const { player: p, state, config, economy } = ctx;
  const requiredLevel: UniformLevel = p.jobId !== null ? findJob(config, p.jobId).uniform : "casual";
  if (meetsUniform(p, requiredLevel) && uniformWeeksLeft(p) > PLANNER_TUNING.clothingLowWaterWeeks) return null;

  const candidates = config.items
    .filter((it) => it.clothingCategory === requiredLevel)
    .map((it) => ({ it, price: adjustedItemPrice(it, state, economy) }))
    .filter(({ price }) => canAfford(p, price))
    .sort((a, b) => a.price - b.price);
  if (candidates.length === 0) return null;
  return goBuy(p, candidates[0].it.locationId, candidates[0].it.id, config);
}

/** Rung 4: relax at home before Relaxation bottoms out (which raises Doctor Visit odds). */
export function healthRung(ctx: TurnContext): Command | null {
  const { player: p, config } = ctx;
  if (p.relaxation > PLANNER_TUNING.relaxationThreshold) return null;
  const nav = navigateInto(p, p.apartmentId, config);
  if (nav) return nav;
  if (p.locationId !== p.apartmentId || !p.insideBuilding) return null;
  if (!hasHours(p, config.actionCosts.relax)) return null;
  return { type: "Relax" };
}

function uniformAffordable(ctx: TurnContext, level: UniformLevel): boolean {
  const { player: p, state, config, economy } = ctx;
  if (meetsUniform(p, level)) return true;
  return config.items.some(
    (it) => it.clothingCategory === level && canAfford(p, adjustedItemPrice(it, state, economy)),
  );
}

/** Rung 5: hold a job — apply when unemployed, or upgrade to a meaningfully better one. */
export function employmentRung(ctx: TurnContext): Command | null {
  const { player: p, state, config } = ctx;

  if (p.jobId === null) {
    const jobs = eligibleJobs(p, state, config);
    if (jobs.length === 0) return null;
    const best = jobs.reduce((a, b) => (b.baseWage > a.baseWage ? b : a));
    return applyForBest(p, config, best.id);
  }

  const current = findJob(config, p.jobId);
  const upgrade = eligibleJobs(p, state, config)
    .filter((j) => j.baseWage >= current.baseWage + PLANNER_TUNING.wageUpgradeThreshold)
    .filter((j) => uniformAffordable(ctx, j.uniform))
    .sort((a, b) => b.baseWage - a.baseWage)[0];
  if (!upgrade) return null;
  return applyForBest(p, config, upgrade.id);
}

function applyForBest(p: PlayerState, config: GameConfig, jobId: string): Command | null {
  const nav = navigateInto(p, "employmentOffice", config);
  if (nav) return nav;
  if (p.locationId !== "employmentOffice" || !p.insideBuilding) return null;
  if (!hasHours(p, config.actionCosts.applyJob)) return null;
  return { type: "ApplyForJob", jobId };
}

/** Shared by every work-issuing rung: navigate to the workplace and Work, or null if infeasible. */
function workCommand(p: PlayerState, config: GameConfig): Command | null {
  const job = findJob(config, p.jobId as string);
  if (!meetsUniform(p, job.uniform)) return null; // clothesRung owns fixing this
  const nav = navigateInto(p, job.locationId, config);
  if (nav) return nav;
  if (p.locationId !== job.locationId || !p.insideBuilding) return null;
  if (p.hoursRemaining <= 0) return null;
  if (p.dependibility < job.reqDependibility - 5) return null; // would just get fired
  return { type: "Work" };
}

/** Rung 6: offset the weekly dependibility decay so the career goal (needs dep >= 24) stays reachable. */
export function depMaintenanceWorkRung(ctx: TurnContext): Command | null {
  const { player: p, config } = ctx;
  if (p.jobId === null) return null;
  if (p.dependibility >= p.maxDependibility) return null;
  return workCommand(p, config);
}

/** Rung 7: earn back up to the cash floor before spending on tuition/happiness/wealth. */
export function cashFloorWorkRung(ctx: TurnContext): Command | null {
  const { player: p, config, budget } = ctx;
  if (p.jobId === null) return null;
  if (p.cash >= budget.cashFloor) return null;
  return workCommand(p, config);
}
