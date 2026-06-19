import { useGameStore } from "../../store/gameStore.js";

export function HomeScreen() {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const p = state.players[state.currentPlayerIndex];

  return (
    <section>
      <h2>Home Sweet Home</h2>
      <p>Relaxation: {p.relaxation} · Happiness: {p.happiness}</p>
      <button onClick={() => dispatch({ type: "Relax" })}>Relax</button>
    </section>
  );
}
