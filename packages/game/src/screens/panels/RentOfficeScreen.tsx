import { useGameStore } from "../../store/gameStore.js";

export function RentOfficeScreen() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const p = state.players[state.currentPlayerIndex];

  return (
    <section>
      <h2>Rent Office</h2>
      <p>
        Current rent: ${p.currentRent} · Due week: {p.rentDueWeek}
        {p.rentDebt > 0 && ` · Debt: $${p.rentDebt}`}
      </p>
      <button onClick={() => dispatch({ type: "PayRent" })}>Pay Rent</button>
      <button
        disabled={p.rentExtensionUsedThisTurn}
        onClick={() => dispatch({ type: "RequestRentExtension" })}
      >
        Request Extension
      </button>
      <button onClick={() => dispatch({ type: "SwitchApartment" })}>Switch Apartment</button>
    </section>
  );
}
