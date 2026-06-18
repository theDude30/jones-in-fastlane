import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { WorkplaceScreen } from "../../src/screens/panels/WorkplaceScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("WorkplaceScreen", () => {
  it("dispatches Work and increases cash for an employed, correctly-positioned player", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.jobId = "monolithBurgers.cook"; // alwaysApproved, casual uniform
      p.wage = 10;
      p.locationId = "monolithBurgers";
      p.insideBuilding = true;
      p.clothing.casual = 6;
      return { state: s.state };
    });
    const before = useGameStore.getState().state!.players[0].cash;
    render(<WorkplaceScreen />);
    fireEvent.click(screen.getByText("Work"));
    expect(useGameStore.getState().state!.players[0].cash).toBeGreaterThan(before);
  });

  it("dispatches QuitJob and clears jobId", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.jobId = "monolithBurgers.cook";
      p.wage = 10;
      return { state: s.state };
    });
    render(<WorkplaceScreen />);
    fireEvent.click(screen.getByText("Quit Job"));
    expect(useGameStore.getState().state!.players[0].jobId).toBeNull();
  });
});
