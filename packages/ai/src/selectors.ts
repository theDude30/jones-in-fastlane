import { makeEconomy, travelHours, findJob, meetsUniform } from "@jones/core";
import type { GameState, PlayerState, Command, Economy } from "@jones/core";
import type { GameConfig } from "@jones/config";

export function findPlayer(state: GameState, playerId: string): PlayerState {
  const p = state.players.find((pl) => pl.id === playerId);
  if (!p) throw new Error(`unknown player ${playerId}`);
  return p;
}

export const canAfford = (p: PlayerState, cost: number): boolean => p.cash >= cost;
export const hasHours = (p: PlayerState, cost: number): boolean => p.hoursRemaining >= cost;
export const atLocation = (p: PlayerState, locationId: string): boolean => p.locationId === locationId;
export const isInside = (p: PlayerState): boolean => p.insideBuilding;

/**
 * A conservative set of commands that `reduce` will currently accept for this
 * player, restricted to the M3 AI repertoire (navigation, Work, ApplyForJob,
 * Enroll, Study, BuyItem, EndTurn). Used by RandomPlanner and greedy mistakes.
 */
export function legalCommands(state: GameState, playerId: string, config: GameConfig): Command[] {
  const p = findPlayer(state, playerId);
  const cmds: Command[] = [{ type: "EndTurn" }];
  const ac = config.actionCosts;

  if (isInside(p)) {
    cmds.push({ type: "ExitBuilding" });

    // Work: at our workplace, employed, hours left, dependibility ok, uniform met.
    if (p.jobId !== null) {
      const job = findJob(config, p.jobId);
      if (atLocation(p, job.locationId) && p.hoursRemaining > 0 && meetsUniform(p, job.uniform) && p.dependibility >= job.reqDependibility - 5) {
        cmds.push({ type: "Work" });
      }
    }

    // ApplyForJob: at the Employment Office, with hours, for each fully-eligible job.
    if (atLocation(p, "employmentOffice") && hasHours(p, ac.applyJob)) {
      for (const job of eligibleJobs(p, state, config)) {
        cmds.push({ type: "ApplyForJob", jobId: job.id });
      }
    }

    // Enroll / Study: at the university.
    const economy = makeEconomy(config);
    if (atLocation(p, "hiTechU")) {
      for (const d of enrollableDegrees(p, state, config, economy)) {
        if (hasHours(p, ac.study)) cmds.push({ type: "Enroll", degreeId: d });
      }
      for (const e of p.enrollments) {
        if (hasHours(p, ac.study)) cmds.push({ type: "Study", degreeId: e.degreeId });
      }
    }

    // BuyItem: at a store, items sold here, not an already-owned durable, and affordable.
    for (const item of config.items) {
      if (item.locationId !== p.locationId) continue;
      if (item.durableType !== undefined) {
        const alreadyOwned = p.durables.some(
          (d) => config.items.find((i) => i.id === d.itemId)?.durableType === item.durableType,
        );
        if (alreadyOwned) continue;
      }
      const price = item.fixedPrice ? item.basePrice : economy.adjustedPrice(item.basePrice, state.economy.reading);
      if (canAfford(p, price)) cmds.push({ type: "BuyItem", itemId: item.id });
    }

    // OpenBroker: at the bank, not already open.
    if (atLocation(p, "bank") && !p.brokerMenuOpen) {
      cmds.push({ type: "OpenBroker" });
    }

    // SellStock / SellTBill: broker open, asset owned.
    if (p.brokerMenuOpen) {
      for (const stock of config.stocks) {
        if (p.stocks[stock.id] > 0) cmds.push({ type: "SellStock", stockId: stock.id });
      }
      if (p.tBills > 0) cmds.push({ type: "SellTBill" });
    }

    // PawnItem: at the pawn shop, for each owned durable whose type isn't
    // already pawned (pawnedItems is shared state-wide, not per-player).
    if (atLocation(p, "pawnShop")) {
      for (const d of p.durables) {
        const durableType = config.items.find((i) => i.id === d.itemId)?.durableType;
        if (durableType === undefined) continue;
        const alreadyPawned = state.pawnedItems.some((pi) => pi.durableType === durableType);
        if (!alreadyPawned) cmds.push({ type: "PawnItem", itemId: d.itemId });
      }
    }
  } else {
    if (hasHours(p, ac.enterLocation)) cmds.push({ type: "EnterBuilding" });
    for (const loc of config.locations) {
      if (loc.id === p.locationId) continue;
      const cost = travelHours(config, p.locationId, loc.id);
      if (hasHours(p, cost)) cmds.push({ type: "TravelTo", locationId: loc.id });
    }
  }

  return cmds;
}

/** Jobs whose stat gates the player currently satisfies. */
export function eligibleJobs(p: PlayerState, state: GameState, config: GameConfig) {
  const depGate = state.week > 4;
  return config.jobs.filter(
    (job) =>
      p.experience >= job.reqExperience &&
      (!depGate || p.dependibility >= job.reqDependibility) &&
      job.reqDegrees.every((d) => p.degrees.includes(d)),
  );
}

/** Degrees the player can enroll in now (prereqs met, not owned, not enrolled, under cap, affordable). */
export function enrollableDegrees(p: PlayerState, state: GameState, config: GameConfig, economy: Economy) {
  const fee = economy.adjustedPrice(config.constants.enrollmentBaseFee, state.economy.reading);
  return config.degrees
    .filter(
      (d) =>
        d.prereqs.every((pr) => p.degrees.includes(pr)) &&
        !p.degrees.includes(d.id) &&
        !p.enrollments.some((e) => e.degreeId === d.id) &&
        p.enrollments.length < config.constants.maxEnrollments &&
        canAfford(p, fee),
    )
    .map((d) => d.id);
}
