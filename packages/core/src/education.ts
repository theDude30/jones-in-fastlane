import type { DegreeId, GameConfig } from "@jones/config";
import type { Economy } from "./economy.js";
import type { GameEvent, GameState } from "./types.js";

export function enroll(
  degreeId: DegreeId,
  state: GameState,
  config: GameConfig,
  economy: Economy,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  if (!p.insideBuilding || p.locationId !== "hiTechU") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }

  const degree = config.degrees.find((d) => d.id === degreeId);
  if (!degree) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "unknown degree" });
    return;
  }

  if (p.degrees.includes(degreeId)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "already graduated" });
    return;
  }

  if (p.enrollments.some((e) => e.degreeId === degreeId)) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "already enrolled" });
    return;
  }

  if (degree.prereqs.some((pr) => !p.degrees.includes(pr))) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "no prereq" });
    return;
  }

  if (p.enrollments.length >= config.constants.maxEnrollments) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "max enrollments" });
    return;
  }

  const fee = economy.adjustedPrice(config.constants.enrollmentBaseFee, state.economy.reading);
  if (p.cash < fee) {
    events.push({ type: "NotEnoughMoney", playerId: p.id, action: "Enroll" });
    return;
  }

  p.cash -= fee;
  const lessonsRemaining = Math.max(
    config.constants.minLessonsPerDegree,
    config.constants.lessonsPerDegree - p.extraCredit,
  );
  p.enrollments.push({ degreeId, lessonsRemaining });
  events.push({ type: "Enrolled", playerId: p.id, degreeId, fee, lessonsRemaining });
}

export function study(
  degreeId: DegreeId,
  state: GameState,
  config: GameConfig,
  events: GameEvent[],
): void {
  const p = state.players[state.currentPlayerIndex];

  if (!p.insideBuilding || p.locationId !== "hiTechU") {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "wrong location" });
    return;
  }

  const enrollment = p.enrollments.find((e) => e.degreeId === degreeId);
  if (!enrollment) {
    events.push({ type: "InvalidAction", playerId: p.id, reason: "not enrolled" });
    return;
  }

  if (p.hoursRemaining === 0) {
    events.push({ type: "NotEnoughTime", playerId: p.id, action: "Study" });
    return;
  }

  p.hoursRemaining -= Math.min(config.actionCosts.study, p.hoursRemaining);
  enrollment.lessonsRemaining -= 1;
  events.push({ type: "Studied", playerId: p.id, degreeId, lessonsRemaining: enrollment.lessonsRemaining });

  if (enrollment.lessonsRemaining === 0) {
    p.enrollments = p.enrollments.filter((e) => e.degreeId !== degreeId);
    p.degrees.push(degreeId);
    p.dependibility += config.constants.graduateDependibilityBonus;
    p.maxDependibility += config.constants.graduateMaxCapBonus;
    p.maxExperience += config.constants.graduateMaxCapBonus;
    events.push({ type: "Graduated", playerId: p.id, degreeId });
  }
}
