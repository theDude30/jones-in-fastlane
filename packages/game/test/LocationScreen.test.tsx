import { describe, it, expect, afterEach } from "vitest";
import { render, screen } from "@testing-library/react";
import { useGameStore } from "../src/store/gameStore.js";
import { LocationScreen } from "../src/screens/LocationScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("LocationScreen routing", () => {
  it("shows only the store panel at Z-Mart when unemployed", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.locationId = "zMart";
      p.insideBuilding = true;
      return { state: s.state };
    });
    render(<LocationScreen />);
    expect(screen.getByText(/casualClothesZMart/)).toBeInTheDocument();
    expect(screen.queryByText("Work")).not.toBeInTheDocument();
  });

  it("shows both store and workplace panels at Z-Mart when employed there", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.locationId = "zMart";
      p.insideBuilding = true;
      p.jobId = "zMart.clerk";
      p.wage = 5;
      return { state: s.state };
    });
    render(<LocationScreen />);
    expect(screen.getByText(/casualClothesZMart/)).toBeInTheDocument();
    expect(screen.getByText("Work")).toBeInTheDocument();
  });
});
