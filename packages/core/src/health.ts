import type { DurableType, GameConfig } from "@jones/config";
import type { PlayerState } from "./types.js";

/** True if the player owns any durable of the given type (any store variant). */
export function ownsDurableType(p: PlayerState, config: GameConfig, durableType: DurableType): boolean {
  return p.durables.some((d) => config.items.find((i) => i.id === d.itemId)?.durableType === durableType);
}
