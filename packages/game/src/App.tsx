import { useGameStore } from "./store/gameStore.js";
import { NewGameScreen } from "./screens/NewGameScreen.js";
import { PlayScreen } from "./screens/PlayScreen.js";

export function App() {
  const state = useGameStore((s) => s.state);
  return state === null ? <NewGameScreen /> : <PlayScreen />;
}
