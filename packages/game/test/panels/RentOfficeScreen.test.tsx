import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { RentOfficeScreen } from "../../src/screens/panels/RentOfficeScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

function atRentOffice() {
  useGameStore.getState().startGame();
  useGameStore.setState((s) => {
    const p = s.state!.players[0];
    p.locationId = "rentOffice";
    p.insideBuilding = true;
    p.cash = 1000;
    return { state: s.state };
  });
}

describe("RentOfficeScreen", () => {
  it("pays rent and advances the due week", () => {
    atRentOffice();
    const before = useGameStore.getState().state!.players[0].rentDueWeek;
    render(<RentOfficeScreen />);
    fireEvent.click(screen.getByText("Pay Rent"));
    const p = useGameStore.getState().state!.players[0];
    expect(p.rentDueWeek).toBeGreaterThan(before);
  });

  it("requests a rent extension", () => {
    atRentOffice();
    render(<RentOfficeScreen />);
    fireEvent.click(screen.getByText("Request Extension"));
    expect(useGameStore.getState().state!.players[0].rentExtensionUsedThisTurn).toBe(true);
  });
});
