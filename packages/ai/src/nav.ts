import { travelHours } from "@jones/core";
import type { Command, PlayerState } from "@jones/core";
import type { GameConfig, ItemId } from "@jones/config";
import { atLocation, hasHours, isInside } from "./selectors.js";

/**
 * Returns the next navigation command needed to be INSIDE `locationId`,
 * or null when already inside it. Returns null (infeasible) when a required
 * step can't be afforded.
 */
export function navigateInto(p: PlayerState, locationId: string, config: GameConfig): Command | null {
  if (!atLocation(p, locationId)) {
    if (isInside(p)) return { type: "ExitBuilding" };
    const cost = travelHours(config, p.locationId, locationId);
    if (!hasHours(p, cost)) return null;
    return { type: "TravelTo", locationId };
  }
  if (!isInside(p)) {
    if (!hasHours(p, config.actionCosts.enterLocation)) return null;
    return { type: "EnterBuilding" };
  }
  return null;
}

/** Navigate to `locationId`, then buy `itemId` once inside. */
export function goBuy(p: PlayerState, locationId: string, itemId: ItemId, config: GameConfig): Command | null {
  const nav = navigateInto(p, locationId, config);
  if (nav) return nav;
  if (!atLocation(p, locationId) || !isInside(p)) return null;
  return { type: "BuyItem", itemId };
}
