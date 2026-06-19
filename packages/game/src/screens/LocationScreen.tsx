import { useGameStore } from "../store/gameStore.js";
import { StoreScreen } from "./panels/StoreScreen.js";
import { WorkplaceScreen } from "./panels/WorkplaceScreen.js";
import { BankScreen } from "./panels/BankScreen.js";
import { PawnShopScreen } from "./panels/PawnShopScreen.js";
import { UniversityScreen } from "./panels/UniversityScreen.js";
import { EmploymentOfficeScreen } from "./panels/EmploymentOfficeScreen.js";
import { RentOfficeScreen } from "./panels/RentOfficeScreen.js";
import { HomeScreen } from "./panels/HomeScreen.js";
import { ApartmentForRentScreen } from "./panels/ApartmentForRentScreen.js";

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
      {location.id === "pawnShop" && <PawnShopScreen />}
      {location.id === "hiTechU" && <UniversityScreen />}
      {location.id === "employmentOffice" && <EmploymentOfficeScreen />}
      {location.id === "rentOffice" && <RentOfficeScreen />}
      {location.types.includes("apartment") &&
        (p.apartmentId === location.id ? <HomeScreen /> : <ApartmentForRentScreen />)}
    </div>
  );
}
