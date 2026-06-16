import type { EconomyConfig, GameConfig } from "@jones/config";
import { nextFloat, nextInt } from "./rng.js";
import type { RngState } from "./rng.js";
import type { GameEvent, PlayerState } from "./types.js";

export interface EconomyStepResult {
  index: number;
  reading: number;
  events: GameEvent[];
  rng: RngState;
  playerUpdates: Array<{ playerId: string; wage?: number; fired?: boolean; happiness?: number }>;
}

export interface Economy {
  step(
    economy: { index: number; reading: number },
    week: number,
    currentPlayerIndex: number,
    numPlayers: number,
    config: EconomyConfig,
    rng: RngState,
    players: PlayerState[]
  ): EconomyStepResult;
  adjustedPrice(base: number, reading: number): number;
}

/**
 * Apply crash effects to the players array and collect Fired events.
 * Exported for isolated testing without going through the full economy step.
 *
 * NOTE: The exact fire probabilities and wage-cut rules are based on §5.
 * Cross-check Moderate fire logic (50%) against the Java port's EconomyManager.
 */
export function applyCrashEffects(
  severity: "minor" | "moderate" | "major",
  _week: number,
  currentPlayerIndex: number,
  players: PlayerState[],
  events: GameEvent[],
  rng: RngState,
): { playerUpdates: Array<{ playerId: string; wage?: number; fired?: boolean; happiness?: number }>; rng: RngState } {
  const updates = new Map<string, { playerId: string; wage?: number; fired?: boolean; happiness?: number }>();

  // Happiness delta for the turn player (player who is about to act this week).
  const hapDelta = severity === "minor" ? -1 : severity === "moderate" ? -2 : -3;
  if (currentPlayerIndex < players.length) {
    const tp = players[currentPlayerIndex];
    updates.set(tp.id, { playerId: tp.id, happiness: hapDelta });
  }

  for (const player of players) {
    if (player.jobId === null) continue;

    if (severity === "major") {
      // All employed players fired (no RNG consumed).
      const existing = updates.get(player.id) ?? { playerId: player.id };
      updates.set(player.id, { ...existing, fired: true });
      events.push({ type: "Fired", playerId: player.id, jobId: player.jobId });
    } else if (severity === "moderate") {
      // 50% fire chance per employed player.
      const r = nextFloat(rng);
      rng = r.state;
      if (r.value < 0.5) {
        const existing = updates.get(player.id) ?? { playerId: player.id };
        updates.set(player.id, { ...existing, fired: true });
        events.push({ type: "Fired", playerId: player.id, jobId: player.jobId });
      } else {
        // Survivor: wage cut 20% (round down).
        const existing = updates.get(player.id) ?? { playerId: player.id };
        updates.set(player.id, { ...existing, wage: Math.floor(player.wage * 0.8) });
      }
    }
    // Minor: no employment effects; only the turn-player happiness delta above.
  }

  return { playerUpdates: Array.from(updates.values()), rng };
}

class ConstantEconomy implements Economy {
  step(
    _economy: { index: number; reading: number },
    _week: number,
    _currentPlayerIndex: number,
    _numPlayers: number,
    _config: EconomyConfig,
    rng: RngState,
    _players: PlayerState[],
  ): EconomyStepResult {
    return { index: 0, reading: 0, events: [], rng, playerUpdates: [] };
  }

  adjustedPrice(base: number, _reading: number): number {
    return base;
  }
}

class DynamicEconomy implements Economy {
  step(
    economy: { index: number; reading: number },
    week: number,
    currentPlayerIndex: number,
    numPlayers: number,
    config: EconomyConfig,
    rng: RngState,
    players: PlayerState[],
  ): EconomyStepResult {
    const events: GameEvent[] = [];
    let playerUpdates: EconomyStepResult["playerUpdates"] = [];

    // Step 1: Index — random walk [-1, 0, +1], clamped to [-3, +3].
    // NOTE: Cross-check exact step distribution against Java port EconomyManager.
    const r1 = nextInt(rng, -1, 1);
    rng = r1.state;
    const newIndex = Math.max(-3, Math.min(3, economy.index + r1.value));

    // Step 2: Reading — drifts toward newIndex * 15 with jitter [-5, +5],
    // clamped to [-30, +90].
    // NOTE: Cross-check drift target and jitter range against Java port.
    const r2 = nextInt(rng, -5, 5);
    rng = r2.state;
    const drift = Math.sign(newIndex * 15 - economy.reading);
    let newReading = Math.max(-30, Math.min(90, economy.reading + drift + r2.value));

    // Step 3: Crash check (only from eventStartWeek, only if reading >= threshold).
    let crashHappened = false;
    if (week >= config.eventStartWeek && newReading >= config.crashReadingThreshold) {
      const crashProb = 1 / (1 + config.crashProbabilityBase * numPlayers);
      const r3 = nextFloat(rng);
      rng = r3.state;
      if (r3.value < crashProb) {
        crashHappened = true;
        const r4 = nextInt(rng, 0, 2);
        rng = r4.state;
        const severity = (["minor", "moderate", "major"] as const)[r4.value];

        // Reading drop: Minor -5%, Moderate -10%, Major -15% (no re-clamp per spec).
        const pct = severity === "minor" ? 0.05 : severity === "moderate" ? 0.10 : 0.15;
        newReading -= Math.floor(newReading * pct);

        const crashResult = applyCrashEffects(severity, week, currentPlayerIndex, players, events, rng);
        rng = crashResult.rng;
        playerUpdates = crashResult.playerUpdates;

        events.push({ type: "CrashOccurred", severity, week });
      }
    }

    // Step 4: Boom check (only if no crash, and only from eventStartWeek).
    // NOTE: Spec mentions Boom threshold <= 120, but max reading is 90, so no threshold.
    // Cross-check against Java port whether a real reading threshold exists.
    if (!crashHappened && week >= config.eventStartWeek) {
      const boomProb = 1 / (1 + config.boomProbabilityBase * numPlayers);
      const r5 = nextFloat(rng);
      rng = r5.state;
      if (r5.value < boomProb) {
        newReading = Math.min(90, Math.floor(newReading * 1.10));
        events.push({ type: "BoomOccurred", week });
      }
    }

    // Step 5: Always emit EconomyUpdated.
    events.push({ type: "EconomyUpdated", index: newIndex, reading: newReading });

    return { index: newIndex, reading: newReading, events, rng, playerUpdates };
  }

  adjustedPrice(base: number, reading: number): number {
    return Math.round(base + base * reading / 60);
  }
}

export function makeEconomy(config: GameConfig): Economy {
  return config.economy.mode === "dynamic" ? new DynamicEconomy() : new ConstantEconomy();
}
