import { useGameStore } from "../../store/gameStore.js";

export function WorkplaceScreen() {
  const dispatch = useGameStore((s) => s.dispatch);

  return (
    <section>
      <h2>Workplace</h2>
      <button onClick={() => dispatch({ type: "Work" })}>Work</button>
      <button onClick={() => dispatch({ type: "RequestRaise" })}>Request Raise</button>
      <button onClick={() => dispatch({ type: "QuitJob" })}>Quit Job</button>
    </section>
  );
}
