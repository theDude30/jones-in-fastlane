import { useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import type { Difficulty } from "../store/gameStore.js";

export function NewGameScreen() {
  const startGame = useGameStore((s) => s.startGame);
  const [opponentCount, setOpponentCount] = useState(1);
  const [difficulty, setDifficulty] = useState<Difficulty>("medium");

  return (
    <div>
      <h1>Jones in the Fast Lane</h1>
      <div>
        <label htmlFor="opponent-count">AI opponents</label>
        <select
          id="opponent-count"
          value={opponentCount}
          onChange={(e) => setOpponentCount(Number(e.target.value))}
        >
          <option value={1}>1</option>
          <option value={2}>2</option>
          <option value={3}>3</option>
        </select>
      </div>
      <div>
        <label htmlFor="difficulty">Difficulty</label>
        <select
          id="difficulty"
          value={difficulty}
          onChange={(e) => setDifficulty(e.target.value as Difficulty)}
        >
          <option value="easy">Easy</option>
          <option value="medium">Medium</option>
          <option value="hard">Hard</option>
        </select>
      </div>
      <button onClick={() => startGame(opponentCount, difficulty)}>Start Game</button>
    </div>
  );
}
