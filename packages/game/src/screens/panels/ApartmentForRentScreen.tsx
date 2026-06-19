import { useGameStore } from "../../store/gameStore.js";

export function ApartmentForRentScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const p = state.players[state.currentPlayerIndex];
  const other = config.locations.find((l) => l.types.includes("apartment") && l.id !== p.apartmentId);

  return (
    <section>
      <h2>Apartment For Rent</h2>
      {other && <p>Rent: ${other.baseRent}/month</p>}
      <button onClick={() => dispatch({ type: "SwitchApartment" })}>Switch Apartment</button>
    </section>
  );
}
