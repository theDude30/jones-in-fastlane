import type { Command, PlayerState } from "@jones/core";

/**
 * Resolves a board click on `locationId` into the command(s) it should
 * dispatch, given the clicking player's current state:
 * - elsewhere, outside -> TravelTo then EnterBuilding (one click walks in)
 * - here, outside      -> EnterBuilding
 * - here, inside       -> ExitBuilding (the only building that can be
 *   "here" while inside)
 *
 * The caller is responsible for only dispatching the second command once
 * the first has actually landed the player at `locationId` (e.g. after the
 * travel animation completes) — if hours run out mid-way, the second
 * command is simply never sent, leaving the player travelled-but-outside,
 * same as today's two-click fallback.
 */
export function resolveClick(locationId: string, player: PlayerState): Command[] {
  if (player.insideBuilding) {
    return [{ type: "ExitBuilding" }];
  }
  if (player.locationId === locationId) {
    return [{ type: "EnterBuilding" }];
  }
  return [{ type: "TravelTo", locationId }, { type: "EnterBuilding" }];
}
