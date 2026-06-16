import type { GameConfig } from "@jones/config";
import type { Economy } from "./economy.js";
import { nextInt } from "./rng.js";
import type { GameEvent, GameState } from "./types.js";

/** §6 ApplyForJob — location guard and hour deduction happen before any stat/luck gate. */
export function applyForJob(
  jobId: string,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  if (!p.insideBuilding || p.locationId !== "employmentOffice") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "must be inside Employment Office" });
    return;
  }
  if (config.actionCosts.applyJob > p.hoursRemaining) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "ApplyForJob" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.applyJob;

  const job = config.jobs.find((j) => j.id === jobId);
  if (!job) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown job" });
    return;
  }

  // Stat gates (§6): experience, dependibility (suppressed weeks 1-4), degrees.
  const depGateActive = state.week > 4;
  const statsFail =
    p.experience < job.reqExperience ||
    (depGateActive && p.dependibility < job.reqDependibility) ||
    job.reqDegrees.some((d) => !p.degrees.includes(d));

  if (statsFail) {
    p.happiness -= 1;
    events.push({ type: "JobDenied", playerId: p.id, jobId, reason: "stats" });
    return;
  }

  // Luck roll (§6): skipped if alwaysApproved (e.g. Cook).
  if (!job.alwaysApproved) {
    const luck = 30 + (10 + p.dependibility + p.experience + 8 * p.degrees.length) / 3;
    const r = nextInt(state.rng, 1, 100);
    state.rng = r.state;
    if (r.value > luck) {
      p.happiness -= 1;
      events.push({ type: "JobDenied", playerId: p.id, jobId, reason: "luck" });
      return;
    }
  }

  // Approval.
  p.jobId = job.id;
  p.wage = economy.adjustedPrice(job.baseWage, state.economy.reading);
  p.raisesReceived = 0;
  p.experience += 2;
  p.maxDependibility = config.constants.initialDependibility + job.reqDependibility + 5 * p.degrees.length;
  p.maxExperience = config.constants.initialExperience + job.reqExperience + 5 * p.degrees.length;
  p.happiness += 3;
  events.push({ type: "JobApplied", playerId: p.id, jobId, wage: p.wage });
}

/** §6 RequestRaise — same location and hour cost as ApplyForJob. */
export function requestRaise(
  state: GameState,
  config: GameConfig,
  economy: Economy,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  if (!p.insideBuilding || p.locationId !== "employmentOffice") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "must be inside Employment Office" });
    return;
  }
  if (p.jobId === null) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
    return;
  }
  if (config.actionCosts.applyJob > p.hoursRemaining) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "RequestRaise" });
    return;
  }
  p.hoursRemaining -= config.actionCosts.applyJob;

  const job = config.jobs.find((j) => j.id === p.jobId)!;
  const offeredWage = economy.adjustedPrice(job.baseWage, state.economy.reading);

  if (offeredWage <= p.wage) {
    events.push({ type: "RaiseDenied", playerId: p.id, reason: "no-higher-offer" });
    return;
  }

  // Dep gate: must meet reqDependibility + 5 × raisesReceived.
  if (p.dependibility < job.reqDependibility + 5 * p.raisesReceived) {
    p.happiness -= 1;
    events.push({ type: "RaiseDenied", playerId: p.id, reason: "stats" });
    return;
  }

  p.wage = offeredWage;
  p.raisesReceived += 1;
  p.happiness += 3;
  events.push({ type: "RaiseGranted", playerId: p.id, newWage: p.wage });
}

/** §6 QuitJob — free action, no location requirement. */
export function quitJob(
  state: GameState,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  if (p.jobId === null) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no job" });
    return;
  }

  const quitJobId = p.jobId;
  p.jobId = null;
  p.wage = 0;
  p.raisesReceived = 0;
  p.happiness -= 2;
  events.push({ type: "JobQuit", playerId: p.id, jobId: quitJobId });
}
