import type { GameConfig, JobDef, UniformLevel } from "@jones/config";
import type { PlayerState } from "./types.js";

const UNIFORM_RANK: Record<UniformLevel, number> = { casual: 0, dress: 1, business: 2 };

/** Highest uniform level the player currently has clothing weeks for (§11). */
export function bestUniform(p: PlayerState): UniformLevel | null {
  if (p.clothing.business > 0) return "business";
  if (p.clothing.dress > 0) return "dress";
  if (p.clothing.casual > 0) return "casual";
  return null;
}

export function meetsUniform(p: PlayerState, required: UniformLevel): boolean {
  const best = bestUniform(p);
  if (best === null) return false;
  return UNIFORM_RANK[best] >= UNIFORM_RANK[required];
}

export function findJob(config: GameConfig, jobId: string): JobDef {
  const job = config.jobs.find((j) => j.id === jobId);
  if (!job) throw new Error(`unknown job ${jobId}`);
  return job;
}
