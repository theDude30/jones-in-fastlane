import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig, aiDifficulty } from "@jones/config";
import { createInitialGame, goalScores } from "@jones/core";
import type { GameState, GameEvent } from "@jones/core";
import { makeAgent, playGame } from "../src/index.js";

// Constant economy: removes RNG-driven price/crash/boom noise so these tests
// isolate planner behavior rather than economy luck (matching this file's
// pre-existing convention).
const config = { ...defaultConfig, economy: constantEconomyConfig };
const DEFAULT_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

function newGame(seed: number, goals = DEFAULT_GOALS): GameState {
  return createInitialGame(config, seed, [{ name: "AI", isAI: true, goals }]);
}

function invalidCount(events: GameEvent[]): number {
  return events.filter((e) => e.type === "InvalidAction").length;
}

function median(nums: number[]): number {
  const sorted = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 !== 0 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

describe("AI full-game integration", () => {
  it("a budget game never crashes and emits no storm of InvalidAction", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 1, 0) };
    const result = playGame(config, newGame(1), [seat], { maxWeeks: 200 });
    expect(invalidCount(result.events)).toBeLessThan(5);
    expect(["playing", "ended"]).toContain(result.state.status);
  });

  it("terminates (winner or week cap)", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 2, 0) };
    const result = playGame(config, newGame(2), [seat], { maxWeeks: 300 });
    expect(result.weeks).toBeLessThanOrEqual(300);
  });

  it("is deterministic — same seed twice yields identical final state and winner", () => {
    const run = (s: number) =>
      playGame(config, newGame(s), [{ playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, s, 0) }], { maxWeeks: 150 });
    const a = run(7);
    const b = run(7);
    expect(a.winnerId).toBe(b.winnerId);
    expect(a.weeks).toBe(b.weeks);
    expect(a.state.players[0]).toEqual(b.state.players[0]);
  });

  it("a budget agent out-progresses a random agent over the same horizon", () => {
    const horizon = 60;
    const progress = (preset: typeof aiDifficulty.hard, seed: number) => {
      const r = playGame(config, newGame(seed, { wealth: 999, happiness: 999, education: 999, career: 999 }), [
        { playerId: "p0", agent: makeAgent(preset, config, seed, 0) },
      ], { maxWeeks: horizon });
      const s = goalScores(r.state.players[0]);
      return s.wealth + s.happiness + s.education + s.career;
    };
    const budget = progress(aiDifficulty.hard, 3);
    const random = progress(aiDifficulty.easy, 3);
    expect(budget).toBeGreaterThan(random);
  });

  it("always terminates with exactly one winner under a small core cap (multiple seeds)", () => {
    const capped = { ...config, constants: { ...config.constants, maxWeeks: 10 } };
    for (const seed of [1, 2, 3, 42, 99]) {
      const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, capped, seed, 0) };
      const result = playGame(capped, createInitialGame(capped, seed, [
        { name: "AI", isAI: true, goals: DEFAULT_GOALS },
      ]), [seat], { maxWeeks: 100 });
      expect(result.state.status).toBe("ended");
      expect(result.state.winners).toHaveLength(1);
      expect(result.state.week).toBeLessThanOrEqual(11); // cap 10 -> ends when week becomes 11
    }
  });

  it("regression economics: no starvation after week 2, rent debt bounded, dependibility maintained from week 6 (seed 7)", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 7, 0) };
    let state = newGame(7);

    for (let w = 0; w < 120 && state.status === "playing"; w++) {
      const before = state.week;
      const r = playGame(config, state, [seat], { maxWeeks: before + 1 });
      state = r.state;

      if (before > 2) {
        expect(r.events.some((e) => e.type === "PlayerStarved")).toBe(false);
      }
      expect(state.players[0].rentDebt).toBeLessThanOrEqual(state.players[0].currentRent);
      if (before >= 6) {
        expect(state.players[0].dependibility).toBeGreaterThanOrEqual(20);
      }
    }
  });

  it("hard AI reliably wins: >=90% of 40 seeds finish via PlayerWon, median <=80 weeks", () => {
    const seeds = Array.from({ length: 40 }, (_, i) => i + 1);
    const winWeeks: number[] = [];
    let wins = 0;

    for (const seed of seeds) {
      const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, seed, 0) };
      const result = playGame(config, newGame(seed), [seat], { maxWeeks: 200 });
      const won = result.events.some((e) => e.type === "PlayerWon");
      if (won) {
        wins++;
        winWeeks.push(result.weeks);
      }
    }

    expect(wins / seeds.length).toBeGreaterThanOrEqual(0.9);
    expect(median(winWeeks)).toBeLessThanOrEqual(80);
  }, 60000);
});
