import type { GameConfig } from "@jones/config";

export function travelHours(config: GameConfig, fromId: string, toId: string): number {
  const from = config.locations.find((l) => l.id === fromId);
  const to = config.locations.find((l) => l.id === toId);
  if (!from || !to) throw new Error(`unknown location: ${fromId} or ${toId}`);
  const size = config.constants.ringSize;
  const raw = Math.abs(from.ringIndex - to.ringIndex);
  const steps = Math.min(raw, size - raw);
  return steps * config.constants.hoursPerRingStep;
}
