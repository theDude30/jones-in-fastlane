import { useState } from "react";
import { useGameStore } from "../store/gameStore.js";
import { LocationScreen } from "./LocationScreen.js";
import type { Command } from "@jones/core";

export function PlayScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  const lastEvents = useGameStore((s) => s.lastEvents);
  const dispatch = useGameStore((s) => s.dispatch);
  const [showRawState, setShowRawState] = useState(false);

  if (!state) return null;

  const player = state.players[state.currentPlayerIndex];
  const fire = (command: Command) => dispatch(command);

  return (
    <div>
      {state.status !== "playing" && (
        <div data-testid="game-over-banner">
          Game over — status: {state.status}
          {state.winners.length > 0 && ` — winner: ${state.winners.join(", ")}`}
        </div>
      )}
      <section>
        <p>Player: {player.name}</p>
        <p>Week: {state.week}</p>
        <p>Cash: {player.cash}</p>
        <p>Location: {player.locationId}</p>
        <p>Inside: {player.insideBuilding ? "yes" : "no"}</p>
        <p>Hours remaining: {player.hoursRemaining}</p>
      </section>
      {player.insideBuilding ? (
        <section>
          <button onClick={() => fire({ type: "ExitBuilding" })}>Exit Building</button>
          <LocationScreen />
        </section>
      ) : (
        <section>
          {config.locations.map((loc) => (
            <button key={loc.id} onClick={() => fire({ type: "TravelTo", locationId: loc.id })}>
              Travel to {loc.name}
            </button>
          ))}
          <button onClick={() => fire({ type: "EnterBuilding" })}>Enter Building</button>
        </section>
      )}
      <section>
        <button onClick={() => fire({ type: "EndTurn" })}>End Turn</button>
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
