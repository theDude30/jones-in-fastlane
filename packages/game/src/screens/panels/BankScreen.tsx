import { useState } from "react";
import { useGameStore } from "../../store/gameStore.js";
import { BrokerScreen } from "./BrokerScreen.js";

export function BankScreen() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [amount, setAmount] = useState(100);
  const [viewingBroker, setViewingBroker] = useState(false);

  if (!state) return null;
  const p = state.players[state.currentPlayerIndex];

  if (viewingBroker || p.brokerMenuOpen) {
    return (
      <section>
        <button onClick={() => setViewingBroker(false)}>Back to Bank</button>
        <BrokerScreen />
      </section>
    );
  }

  return (
    <section>
      <h2>Bank</h2>
      <p>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(Number(e.target.value))}
        />
        <button onClick={() => dispatch({ type: "Deposit", amount })}>Deposit</button>
        <button onClick={() => dispatch({ type: "Withdraw", amount })}>Withdraw</button>
      </p>
      <button onClick={() => dispatch({ type: "ApplyLoan" })}>Apply For Loan</button>
      {p.loanBalance > 0 && (
        <button onClick={() => dispatch({ type: "PayLoan" })}>Pay Loan</button>
      )}
      <button
        onClick={() => {
          if (!p.brokerMenuOpen) dispatch({ type: "OpenBroker" });
          setViewingBroker(true);
        }}
      >
        See The Broker
      </button>
    </section>
  );
}
