import { useGameStore } from "./store/gameStore.js";
import { NewGameScreen } from "./screens/NewGameScreen.js";
import { DebugGameScreen } from "./screens/DebugGameScreen.js";

export function App() {
  const state = useGameStore((s) => s.state);
  return state === null ? <NewGameScreen /> : <DebugGameScreen />;
}
