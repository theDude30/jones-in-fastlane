import type { Command, GameState, PlayerState } from "@jones/core";
import type { GameConfig } from "@jones/config";
import { atLocation, isInside } from "./selectors.js";
import { navigateInto } from "./nav.js";

/**
 * Last resort, tried only when no rung on the ladder returns a command:
 * raise emergency cash by pawning a durable, else selling a T-bill, else
 * selling a stock. Returns null when there's truly nothing left to
 * liquidate.
 */
export function emergencyLiquidity(p: PlayerState, state: GameState, config: GameConfig): Command | null {
  const pawnable = p.durables.find((d) => {
    const durableType = config.items.find((i) => i.id === d.itemId)?.durableType;
    return durableType !== undefined && !state.pawnedItems.some((pi) => pi.durableType === durableType);
  });
  if (pawnable) {
    const nav = navigateInto(p, "pawnShop", config);
    if (nav) return nav;
    if (!atLocation(p, "pawnShop") || !isInside(p)) return null;
    return { type: "PawnItem", itemId: pawnable.itemId };
  }

  if (p.tBills > 0) {
    const nav = navigateInto(p, "bank", config);
    if (nav) return nav;
    if (!atLocation(p, "bank") || !isInside(p)) return null;
    if (!p.brokerMenuOpen) return { type: "OpenBroker" };
    return { type: "SellTBill" };
  }

  const ownedStock = config.stocks.find((s) => p.stocks[s.id] > 0);
  if (ownedStock) {
    const nav = navigateInto(p, "bank", config);
    if (nav) return nav;
    if (!atLocation(p, "bank") || !isInside(p)) return null;
    if (!p.brokerMenuOpen) return { type: "OpenBroker" };
    return { type: "SellStock", stockId: ownedStock.id };
  }

  return null;
}
