import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { HomeScreen } from "../../src/screens/panels/HomeScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("HomeScreen", () => {
  it("relaxes and increases relaxation", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.locationId = p.apartmentId;
      p.insideBuilding = true;
      p.relaxation = 10;
      return { state: s.state };
    });
    render(<HomeScreen />);
    fireEvent.click(screen.getByText("Relax"));
    expect(useGameStore.getState().state!.players[0].relaxation).toBe(13);
  });
});
