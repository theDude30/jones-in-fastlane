import type { PlayerState } from "@jones/core";

/** Groups players by their current locationId, preserving seat order. */
export function clusterPlayersByLocation(players: PlayerState[]): Map<string, PlayerState[]> {
  const clusters = new Map<string, PlayerState[]>();
  for (const player of players) {
    const existing = clusters.get(player.locationId);
    if (existing) {
      existing.push(player);
    } else {
      clusters.set(player.locationId, [player]);
    }
  }
  return clusters;
}

/** Evenly-spaced, zero-centered x-offsets for `count` tokens fanned out at one location. */
export function fanOffsets(count: number, spacing = 18): number[] {
  return Array.from({ length: count }, (_, i) => (i - (count - 1) / 2) * spacing);
}
