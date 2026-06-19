import { useState } from "react";
import { useGameStore } from "../../store/gameStore.js";

type Tab = "pawn" | "redeem" | "buy";

export function PawnShopScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [tab, setTab] = useState<Tab>("pawn");

  if (!state) return null;
  const p = state.players[state.currentPlayerIndex];

  return (
    <section>
      <h2>Pawn Shop</h2>
      <button onClick={() => setTab("pawn")}>PAWN</button>
      <button onClick={() => setTab("redeem")}>REDEEM</button>
      <button onClick={() => setTab("buy")}>BUY</button>

      {tab === "pawn" && (
        <ul>
          {p.durables.map((d) => (
            <li key={d.itemId}>
              {d.itemId}{" "}
              <button onClick={() => dispatch({ type: "PawnItem", itemId: d.itemId })}>Pawn</button>
            </li>
          ))}
        </ul>
      )}

      {tab === "redeem" && (
        <ul>
          {state.pawnedItems
            .filter((pi) => pi.pawnedByPlayerId === p.id)
            .map((pi) => (
              <li key={pi.itemId}>
                {pi.itemId}{" "}
                <button onClick={() => dispatch({ type: "RedeemItem", itemId: pi.itemId })}>Redeem</button>
              </li>
            ))}
        </ul>
      )}

      {tab === "buy" && (
        <ul>
          {state.pawnedItems
            .filter((pi) => state.week - pi.pawnedWeek >= config.constants.pawnExpiryWeeks)
            .map((pi) => (
              <li key={pi.itemId}>
                {pi.itemId}{" "}
                <button onClick={() => dispatch({ type: "BuyPawnedItem", itemId: pi.itemId })}>Buy</button>
              </li>
            ))}
        </ul>
      )}
    </section>
  );
}
