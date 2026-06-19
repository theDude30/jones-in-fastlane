import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { ApartmentForRentScreen } from "../../src/screens/panels/ApartmentForRentScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("ApartmentForRentScreen", () => {
  it("switches to the other apartment on click", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      // Player starts at lowCostHousing; visit the other apartment type
      // and request a switch (from the Rent Office, per core's legality
      // check — set up there for this command to succeed).
      p.locationId = "rentOffice";
      p.insideBuilding = true;
      p.cash = 1000;
      return { state: s.state };
    });
    render(<ApartmentForRentScreen />);
    fireEvent.click(screen.getByText("Switch Apartment"));
    expect(useGameStore.getState().state!.players[0].apartmentId).toBe("securityApartments");
  });
});
