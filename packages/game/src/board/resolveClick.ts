import type { Command, PlayerState } from "@jones/core";

/**
 * Resolves a board click on `locationId` into the command it should
 * dispatch, given the clicking player's current state:
 * - elsewhere, outside -> TravelTo
 * - here, outside      -> EnterBuilding
 * - here, inside       -> ExitBuilding (the only building that can be
 *   "here" while inside)
 */
export function resolveClick(locationId: string, player: PlayerState): Command {
  if (player.insideBuilding) {
    return { type: "ExitBuilding" };
  }
  if (player.locationId === locationId) {
    return { type: "EnterBuilding" };
  }
  return { type: "TravelTo", locationId };
}
