import { useGameStore } from "../store/gameStore.js";
import { StoreScreen } from "./panels/StoreScreen.js";
import { WorkplaceScreen } from "./panels/WorkplaceScreen.js";
import { BankScreen } from "./panels/BankScreen.js";

export function LocationScreen() {
  const config = useGameStore((s) => s.config);
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  const p = state.players[state.currentPlayerIndex];
  const location = config.locations.find((l) => l.id === p.locationId);
  if (!location) return null;

  const job = p.jobId !== null ? config.jobs.find((j) => j.id === p.jobId) : undefined;
  const isWorkplaceHere = job !== undefined && job.locationId === location.id;

  return (
    <div data-testid="location-screen">
      {location.types.includes("store") && <StoreScreen locationId={location.id} />}
      {isWorkplaceHere && <WorkplaceScreen />}
      {location.id === "bank" && <BankScreen />}
    </div>
  );
}
