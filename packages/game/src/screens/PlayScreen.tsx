import { useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import { LocationScreen } from "./LocationScreen.js";
import { PixiBoard } from "./PixiBoard.js";

export function PlayScreen() {
  const state = useGameStore((s) => s.state);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const dispatch = useGameStore((s) => s.dispatch);
  const [showRawState, setShowRawState] = useState(false);

  if (!state) return null;

  const player = state.players[state.currentPlayerIndex];

  return (
    <div>
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
      <section>
        <p>Player: {player.name}</p>
        <p>Week: {state.week}</p>
        <p>Cash: {player.cash}</p>
        <p>Location: {player.locationId}</p>
        <p>Inside: {player.insideBuilding ? "yes" : "no"}</p>
        <p>Hours remaining: {player.hoursRemaining}</p>
      </section>
      <section>
        <button onClick={() => dispatch({ type: "EndTurn" })}>End Turn</button>
      </section>
      <section>
        <h2>Last events</h2>
        <ul>
          {lastEvents.map((e, i) => (
            <li key={i}>{JSON.stringify(e)}</li>
          ))}
        </ul>
      </section>
      <section>
        <button onClick={() => setShowRawState((v) => !v)}>
          {showRawState ? "Hide" : "Show"} raw state
        </button>
        {showRawState && <pre data-testid="state-dump">{JSON.stringify(state, null, 2)}</pre>}
      </section>
    </div>
  );
}
