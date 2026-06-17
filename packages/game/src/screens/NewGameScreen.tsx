import { useGameStore } from "../store/gameStore.js";

export function NewGameScreen() {
  const startGame = useGameStore((s) => s.startGame);
  return (
    <div>
      <h1>Jones in the Fast Lane</h1>
      <button onClick={startGame}>New Game</button>
    </div>
  );
}
