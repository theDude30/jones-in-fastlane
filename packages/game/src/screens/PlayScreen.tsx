import { useGameStore } from "../store/gameStore.js";
import { LocationScreen } from "./LocationScreen.js";
import { PixiBoard } from "./PixiBoard.js";

export function PlayScreen() {
  const state = useGameStore((s) => s.state);

  if (!state) return null;

  const player = state.players[state.currentPlayerIndex];

  return (
    <div data-testid="play-screen">
      {state.status !== "playing" && (
        <div data-testid="game-over-banner">
          Game over — status: {state.status}
          {state.winners.length > 0 && ` — winner: ${state.winners.join(", ")}`}
        </div>
      )}
      {/* position: relative gives LocationScreen's overlay-style panels (e.g.
          the Employment Office) a positioning context to cover exactly the
          board above them; panels that render as normal in-flow content are
          unaffected since this wrapper doesn't constrain their height. */}
      <div style={{ position: "relative" }}>
        <PixiBoard />
        {player.insideBuilding && <LocationScreen />}
      </div>
    </div>
  );
}
