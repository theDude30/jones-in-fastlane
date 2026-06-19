import { makeEconomy } from "@jones/core";
import { useGameStore } from "../../store/gameStore.js";

export function StoreScreen({ locationId }: { locationId: string }) {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);

  if (!state) return null;

  const economy = makeEconomy(config);
  const items = config.items.filter((item) => item.locationId === locationId);

  return (
    <section>
      <h2>Items</h2>
      <ul>
        {items.map((item) => {
          const price = item.fixedPrice
            ? item.basePrice
            : economy.adjustedPrice(item.basePrice, state.economy.reading);
          return (
            <li key={item.id}>
              {item.id} — ${price.toFixed(0)}{" "}
              <button onClick={() => dispatch({ type: "BuyItem", itemId: item.id })}>Buy</button>
            </li>
          );
        })}
      </ul>
      {locationId === "blacksMarket" && (
        <p>
          10 Lottery Tickets — ${config.constants.lotteryBatchPrice}{" "}
          <button onClick={() => dispatch({ type: "BuyLotteryTickets" })}>Buy Lottery Tickets</button>
        </p>
      )}
    </section>
  );
}
