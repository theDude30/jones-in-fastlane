import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig, aiDifficulty } from "@jones/config";
import { createInitialGame, goalScores } from "@jones/core";
import type { GameState, GameEvent } from "@jones/core";
import { makeAgent, playGame } from "../src/index.js";

const config = { ...defaultConfig, economy: constantEconomyConfig };

function newGame(seed: number, goals = { wealth: 30, happiness: 30, education: 19, career: 30 }): GameState {
  return createInitialGame(config, seed, [{ name: "AI", isAI: true, goals }]);
}

function invalidCount(events: GameEvent[]): number {
  return events.filter((e) => e.type === "InvalidAction").length;
}

describe("AI full-game integration", () => {
  it("a greedy game never crashes and emits no storm of InvalidAction", () => {
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, config, 1, 0) };
    const result = playGame(config, newGame(1), [seat], { maxWeeks: 200 });
    // A well-behaved greedy agent should produce very few (ideally zero) invalid actions.
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

  it("a greedy agent out-progresses a random agent over the same horizon", () => {
    const horizon = 60;
    const progress = (preset: typeof aiDifficulty.hard, seed: number) => {
      const r = playGame(config, newGame(seed, { wealth: 999, happiness: 999, education: 999, career: 999 }), [
        { playerId: "p0", agent: makeAgent(preset, config, seed, 0) },
      ], { maxWeeks: horizon });
      const s = goalScores(r.state.players[0]);
      return s.wealth + s.happiness + s.education + s.career;
    };
    const greedy = progress(aiDifficulty.hard, 3);
    const random = progress(aiDifficulty.easy, 3);
    expect(greedy).toBeGreaterThan(random);
  });

  it("recovers from the diagnosed poverty spiral instead of bottoming out forever (seed 42, medium, 200 weeks)", () => {
    // Reproduction of a real reported bug: this exact seed/difficulty/horizon
    // previously drove the AI to $0 cash by week 6, after which lapsed
    // clothing made Work permanently unaffordable to restore, and happiness
    // declined monotonically to roughly -397 by week 200 with no recovery.
    // Fixed by @jones/ai's emergency-liquidity fallback (pawn/sell assets)
    // plus @jones/core's Donation safety net (for when there's nothing to
    // liquidate at all, which is exactly what happens on this seed).
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.medium, config, 42, 0) };
    let state = newGame(42);
    const allEvents: GameEvent[] = [];
    let wasBroke = false;
    let recovered = false;

    for (let w = 0; w < 200 && state.status === "playing"; w++) {
      const r = playGame(config, state, [seat], { maxWeeks: state.week + 1 });
      state = r.state;
      allEvents.push(...r.events);
      if (state.players[0].cash <= 0) {
        wasBroke = true;
      } else if (wasBroke) {
        recovered = true;
        break;
      }
    }

    expect(wasBroke).toBe(true);
    expect(recovered).toBe(true);
    expect(invalidCount(allEvents)).toBeLessThan(5);
  });

  it("always terminates with exactly one winner under a small core cap (multiple seeds)", () => {
    // Override the core cap low so games end quickly; give the runner a
    // larger maxWeeks so the CORE cap is what terminates, not the runner.
    const capped = { ...config, constants: { ...config.constants, maxWeeks: 10 } };
    for (const seed of [1, 2, 3, 42, 99]) {
      const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.hard, capped, seed, 0) };
      const result = playGame(capped, createInitialGame(capped, seed, [
        { name: "AI", isAI: true, goals: { wealth: 30, happiness: 30, education: 19, career: 30 } },
      ]), [seat], { maxWeeks: 100 });
      expect(result.state.status).toBe("ended");
      expect(result.state.winners).toHaveLength(1);
      expect(result.state.week).toBeLessThanOrEqual(11); // cap 10 -> ends when week becomes 11
    }
  });
});
