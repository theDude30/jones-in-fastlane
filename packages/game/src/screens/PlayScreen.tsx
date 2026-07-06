import { useGameStore } from "../store/gameStore.js";
import { LocationScreen } from "./LocationScreen.js";
import { PixiBoard } from "./PixiBoard.js";

export function PlayScreen() {
  const state = useGameStore((s) => s.state);

  if (!state) return null;

  const player = state.players[state.currentPlayerIndex];

  return (
    <div data-testid="play-screen" style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {state.status !== "playing" && (
        <div data-testid="game-over-banner">
          Game over — status: {state.status}
          {state.winners.length > 0 && ` — winner: ${state.winners.join(", ")}`}
        </div>
      )}
      {/* flex: 1 lets this wrapper (and the board inside it) claim the full
          remaining viewport height instead of a fixed size — PixiBoard's own
          ResizeObserver picks up whatever size it ends up with and
          letterboxes the 16:9 board to fit. minHeight: 0 is required for a
          flex child to actually shrink/grow with its siblings instead of
          being floored at its content size. position: relative gives
          LocationScreen's overlay-style panels (e.g. the Employment Office)
          a positioning context to cover exactly the board above them. */}
      <div style={{ position: "relative", flex: 1, minHeight: 0 }}>
        <PixiBoard />
        {player.insideBuilding && <LocationScreen />}
      </div>
    </div>
  );
}
