import { nextFloat, nextInt, makeEconomy, travelHours, findJob, meetsUniform } from "@jones/core";
import type { Command, GameState, PlayerState, RngState } from "@jones/core";
import type { GameConfig, AIDifficultyPreset } from "@jones/config";
import type { Agent } from "./types.js";
import {
  GoalKey,
  rankedUnmetGoals,
  legalCommands,
  eligibleJobs,
  enrollableDegrees,
  canAfford,
  hasHours,
  atLocation,
  isInside,
  findPlayer,
} from "./selectors.js";

/** Greedy: improve the weakest unmet goal each step via a goal->activity map. */
export class GreedyPlanner implements Agent {
  private rng: RngState;
  constructor(
    seed: number,
    private readonly preset: AIDifficultyPreset,
    private readonly config: GameConfig,
  ) {
    this.rng = { seed };
  }

  nextCommand(state: GameState, playerId: string): Command {
    const p = findPlayer(state, playerId);

    // Mistake roll.
    if (this.preset.epsilon > 0) {
      const r = nextFloat(this.rng);
      this.rng = r.state;
      if (r.value < this.preset.epsilon) return this.randomLegal(state, playerId);
    }

    // Try each unmet goal weakest-first; return the first actionable command.
    for (const goal of rankedUnmetGoals(p, this.preset.weights)) {
      const cmd = this.activity(goal, p, state);
      if (cmd) return cmd;
    }
    return { type: "EndTurn" };
  }

  private randomLegal(state: GameState, playerId: string): Command {
    const legal = legalCommands(state, playerId, this.config);
    const r = nextInt(this.rng, 0, legal.length - 1);
    this.rng = r.state;
    return legal[r.value];
  }

  private activity(goal: GoalKey, p: PlayerState, state: GameState): Command | null {
    switch (goal) {
      case "wealth":
      case "career":
        return p.jobId !== null ? this.work(p) : this.getJob(p, state);
      case "education":
        return this.educate(p, state);
      case "happiness":
        return this.buyHappiness(p, state);
    }
  }

  /** Navigate to the workplace and Work. */
  private work(p: PlayerState): Command | null {
    const job = findJob(this.config, p.jobId as string);
    const nav = this.navigateInto(p, job.locationId);
    if (nav) return nav;
    if (
      atLocation(p, job.locationId) &&
      isInside(p) &&
      p.hoursRemaining > 0 &&
      meetsUniform(p, job.uniform) &&
      p.dependibility >= job.reqDependibility - 5
    ) {
      return { type: "Work" };
    }
    return null;
  }

  /** Navigate to the Employment Office and apply for the best eligible job. */
  private getJob(p: PlayerState, state: GameState): Command | null {
    const jobs = eligibleJobs(p, state, this.config);
    if (jobs.length === 0) return null;
    const best = jobs.reduce((a, b) => (b.baseWage > a.baseWage ? b : a));
    const nav = this.navigateInto(p, "employmentOffice");
    if (nav) return nav;
    if (
      atLocation(p, "employmentOffice") &&
      isInside(p) &&
      hasHours(p, this.config.actionCosts.applyJob)
    ) {
      return { type: "ApplyForJob", jobId: best.id };
    }
    return null;
  }

  /** Navigate to the university and Study an in-progress degree, else Enroll. */
  private educate(p: PlayerState, state: GameState): Command | null {
    const nav = this.navigateInto(p, "hiTechU");
    if (nav) return nav;
    if (!atLocation(p, "hiTechU") || !isInside(p)) return null;
    if (!hasHours(p, this.config.actionCosts.study)) return null;
    if (p.enrollments.length > 0) return { type: "Study", degreeId: p.enrollments[0].degreeId };
    const economy = makeEconomy(this.config);
    const options = enrollableDegrees(p, state, this.config, economy);
    if (options.length > 0) return { type: "Enroll", degreeId: options[0] };
    return null;
  }

  /** Navigate to a store and buy the best affordable happiness item available this turn. */
  private buyHappiness(p: PlayerState, state: GameState): Command | null {
    const economy = makeEconomy(this.config);
    const candidates = this.config.items
      .filter((it) => (it.happinessOnBuy ?? 0) > 0)
      .filter((it) => !it.happinessGroup || !p.happyGroupsThisTurn.includes(it.happinessGroup))
      .map((it) => ({ it, price: economy.adjustedPrice(it.basePrice, state.economy.reading) }))
      .filter(({ price }) => canAfford(p, price))
      .sort((a, b) => (b.it.happinessOnBuy ?? 0) - (a.it.happinessOnBuy ?? 0) || a.price - b.price);
    if (candidates.length === 0) return null;
    const target = candidates[0].it;
    const nav = this.navigateInto(p, target.locationId);
    if (nav) return nav;
    if (!atLocation(p, target.locationId) || !isInside(p)) return null;
    return { type: "BuyItem", itemId: target.id };
  }

  /**
   * Returns the next navigation command needed to be INSIDE `locationId`,
   * or null when already inside it. Returns null (infeasible) when a required
   * step can't be afforded.
   */
  private navigateInto(p: PlayerState, locationId: string): Command | null {
    if (!atLocation(p, locationId)) {
      if (isInside(p)) return { type: "ExitBuilding" };
      const cost = travelHours(this.config, p.locationId, locationId);
      if (!hasHours(p, cost)) return null;
      return { type: "TravelTo", locationId };
    }
    if (!isInside(p)) {
      if (!hasHours(p, this.config.actionCosts.enterLocation)) return null;
      return { type: "EnterBuilding" };
    }
    return null; // already at location and inside
  }
}
