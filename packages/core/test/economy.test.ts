import { describe, it, expect } from "vitest";
import { defaultConfig, constantEconomyConfig } from "@jones/config";
import { makeEconomy, applyCrashEffects } from "../src/economy.js";
import { nextFloat } from "../src/rng.js";
import type { GameEvent, PlayerState } from "../src/types.js";
import type { RngState } from "../src/rng.js";

const dynamicConfig = defaultConfig;
const constConfig = { ...defaultConfig, economy: constantEconomyConfig };
const dynamic = makeEconomy(dynamicConfig);
const constant = makeEconomy(constConfig);

function makePlayer(overrides: Partial<PlayerState> = {}): PlayerState {
  return {
    id: "p0", name: "Test", isAI: false, cash: 200, bank: 0, happiness: 0,
    dependibility: 20, experience: 10, relaxation: 10, maxDependibility: 20,
    maxExperience: 10, degrees: [], jobId: null, wage: 0, locationId: "lowCostHousing",
    insideBuilding: false, clothing: { casual: 6, dress: 0, business: 0 },
    goals: { wealth: 10, happiness: 10, education: 10, career: 10 },
    hoursRemaining: 60, raisesReceived: 0,
    ...overrides,
  };
}

/** Finds the first seed in 0..99999 where nextFloat produces a value matching predicate. */
function findSeedForFloat(predicate: (v: number) => boolean): number {
  for (let s = 0; s <= 99999; s++) {
    if (predicate(nextFloat({ seed: s }).value)) return s;
  }
  throw new Error("no matching seed found in 0..99999");
}

describe("adjustedPrice", () => {
  it("returns base when reading=0", () => {
    expect(dynamic.adjustedPrice(100, 0)).toBe(100);
  });
  it("returns 150% of base when reading=30", () => {
    expect(dynamic.adjustedPrice(100, 30)).toBe(150);
  });
  it("returns 50% of base when reading=-30", () => {
    expect(dynamic.adjustedPrice(100, -30)).toBe(50);
  });
});

describe("ConstantEconomy", () => {
  it("step returns index=0, reading=0, no events, no playerUpdates", () => {
    const rng: RngState = { seed: 42 };
    const result = constant.step({ index: 5, reading: 30 }, 10, 0, 2, constConfig.economy, rng, []);
    expect(result.index).toBe(0);
    expect(result.reading).toBe(0);
    expect(result.events).toHaveLength(0);
    expect(result.playerUpdates).toHaveLength(0);
  });
  it("step does not advance RNG", () => {
    const rng: RngState = { seed: 42 };
    const result = constant.step({ index: 0, reading: 0 }, 1, 0, 1, constConfig.economy, rng, []);
    expect(result.rng.seed).toBe(42);
  });
  it("adjustedPrice returns base regardless of reading", () => {
    expect(constant.adjustedPrice(100, 50)).toBe(100);
    expect(constant.adjustedPrice(100, -20)).toBe(100);
  });
});

describe("DynamicEconomy step", () => {
  it("advances RNG (seed changes after step)", () => {
    const rng: RngState = { seed: 1 };
    const result = dynamic.step({ index: 0, reading: 0 }, 1, 0, 1, dynamicConfig.economy, rng, []);
    expect(result.rng.seed).not.toBe(1);
  });
  it("always emits EconomyUpdated", () => {
    const rng: RngState = { seed: 1 };
    const result = dynamic.step({ index: 0, reading: 0 }, 1, 0, 1, dynamicConfig.economy, rng, []);
    expect(result.events.some((e) => e.type === "EconomyUpdated")).toBe(true);
  });
  it("keeps index in [-3, +3] over 100 steps", () => {
    let rng: RngState = { seed: 7 };
    let economy = { index: 0, reading: 0 };
    for (let i = 0; i < 100; i++) {
      const r = dynamic.step(economy, 1, 0, 1, dynamicConfig.economy, rng, []);
      expect(r.index).toBeGreaterThanOrEqual(-3);
      expect(r.index).toBeLessThanOrEqual(3);
      economy = { index: r.index, reading: r.reading };
      rng = r.rng;
    }
  });
  it("keeps reading in [-30, +90] over 200 steps", () => {
    let rng: RngState = { seed: 3 };
    let economy = { index: 0, reading: 0 };
    for (let i = 0; i < 200; i++) {
      const r = dynamic.step(economy, 1, 0, 1, dynamicConfig.economy, rng, []);
      expect(r.reading).toBeGreaterThanOrEqual(-30);
      expect(r.reading).toBeLessThanOrEqual(90);
      economy = { index: r.index, reading: r.reading };
      rng = r.rng;
    }
  });
  it("does not emit crash/boom events before eventStartWeek=8", () => {
    const rng: RngState = { seed: 1 };
    const result = dynamic.step({ index: 3, reading: 85 }, 7, 0, 1, dynamicConfig.economy, rng, []);
    expect(result.events.some((e) => e.type === "CrashOccurred")).toBe(false);
    expect(result.events.some((e) => e.type === "BoomOccurred")).toBe(false);
  });
});

describe("applyCrashEffects", () => {
  it("major: fires all employed players and emits Fired events", () => {
    const players = [
      makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 5 }),
      makePlayer({ id: "p1", jobId: null }),
      makePlayer({ id: "p2", jobId: "bank.teller", wage: 8 }),
    ];
    const events: GameEvent[] = [];
    const { playerUpdates } = applyCrashEffects("major", 8, 0, players, events, { seed: 0 });
    expect(events.filter((e) => e.type === "Fired")).toHaveLength(2);
    expect(events.some((e) => e.type === "Fired" && e.playerId === "p0")).toBe(true);
    expect(events.some((e) => e.type === "Fired" && e.playerId === "p2")).toBe(true);
    const p0u = playerUpdates.find((u) => u.playerId === "p0")!;
    expect(p0u.fired).toBe(true);
    expect(p0u.happiness).toBe(-3);
  });
  it("major: does not consume RNG (firing is deterministic)", () => {
    const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 5 })];
    const events: GameEvent[] = [];
    const rng0: RngState = { seed: 42 };
    const { rng: rng1 } = applyCrashEffects("major", 8, 0, players, events, rng0);
    expect(rng1.seed).toBe(42);
  });
  it("moderate: consumes RNG for each employed player fire check", () => {
    const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 10 })];
    const events: GameEvent[] = [];
    const rng0: RngState = { seed: 0 };
    const { rng: rng1 } = applyCrashEffects("moderate", 8, 0, players, events, rng0);
    expect(rng1.seed).not.toBe(rng0.seed);
  });
  it("moderate: fires player when float < 0.5", () => {
    const FIRE_SEED = findSeedForFloat((v) => v < 0.5);
    const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 10 })];
    const events: GameEvent[] = [];
    const { playerUpdates } = applyCrashEffects("moderate", 8, 0, players, events, { seed: FIRE_SEED });
    expect(events.some((e) => e.type === "Fired" && e.playerId === "p0")).toBe(true);
    expect(playerUpdates.find((u) => u.playerId === "p0")!.fired).toBe(true);
  });
  it("moderate: survivor wage cut by 20% when float >= 0.5", () => {
    const SURVIVE_SEED = findSeedForFloat((v) => v >= 0.5);
    const players = [makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 10 })];
    const events: GameEvent[] = [];
    const { playerUpdates } = applyCrashEffects("moderate", 8, 0, players, events, { seed: SURVIVE_SEED });
    expect(events.filter((e) => e.type === "Fired")).toHaveLength(0);
    expect(playerUpdates.find((u) => u.playerId === "p0")!.wage).toBe(8); // floor(10 * 0.8)
  });
  it("minor: happiness -1 for turn player only, no Fired events", () => {
    const players = [
      makePlayer({ id: "p0", jobId: "zMart.clerk", wage: 5 }),
      makePlayer({ id: "p1", jobId: "bank.teller", wage: 8 }),
    ];
    const events: GameEvent[] = [];
    const { playerUpdates } = applyCrashEffects("minor", 8, 0, players, events, { seed: 0 });
    expect(events.filter((e) => e.type === "Fired")).toHaveLength(0);
    const p0u = playerUpdates.find((u) => u.playerId === "p0");
    expect(p0u?.happiness).toBe(-1);
    const p1u = playerUpdates.find((u) => u.playerId === "p1");
    expect(p1u?.happiness).toBeUndefined();
  });
});
