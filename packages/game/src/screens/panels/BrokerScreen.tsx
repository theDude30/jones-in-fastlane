import { useGameStore } from "../../store/gameStore.js";

export function BrokerScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const p = state.players[state.currentPlayerIndex];

  return (
    <section>
      <h2>Broker</h2>
      <ul>
        {config.stocks.map((stock) => (
          <li key={stock.id}>
            {stock.name} — ${state.stockPrices[stock.id]} (own: {p.stocks[stock.id]}){" "}
            <button onClick={() => dispatch({ type: "BuyStock", stockId: stock.id })}>Buy</button>{" "}
            <button onClick={() => dispatch({ type: "SellStock", stockId: stock.id })}>Sell</button>
          </li>
        ))}
      </ul>
      <p>
        T-Bills — buy ${config.constants.tBillBuyPrice} / sell ${config.constants.tBillSellPrice} (own:{" "}
        {p.tBills}){" "}
        <button onClick={() => dispatch({ type: "BuyTBill" })}>Buy T-Bill</button>{" "}
        <button onClick={() => dispatch({ type: "SellTBill" })}>Sell T-Bill</button>
      </p>
    </section>
  );
}
