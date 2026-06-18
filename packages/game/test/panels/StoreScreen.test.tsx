import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { StoreScreen } from "../../src/screens/panels/StoreScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("StoreScreen", () => {
  it("lists items sold at the given location and buys one on click", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.locationId = "monolithBurgers";
      p.insideBuilding = true;
      p.cash = 1000;
      return { state: s.state };
    });
    render(<StoreScreen locationId="monolithBurgers" />);
    expect(screen.getByText(/cheeseburger/)).toBeInTheDocument();
    fireEvent.click(screen.getAllByText("Buy")[0]);
    expect(useGameStore.getState().state!.players[0].cash).toBeLessThan(1000);
  });

  it("offers a lottery-tickets button at Black's Market", () => {
    useGameStore.getState().startGame();
    useGameStore.setState((s) => {
      const p = s.state!.players[0];
      p.locationId = "blacksMarket";
      p.insideBuilding = true;
      p.cash = 1000;
      return { state: s.state };
    });
    render(<StoreScreen locationId="blacksMarket" />);
    fireEvent.click(screen.getByText("Buy Lottery Tickets"));
    expect(useGameStore.getState().state!.players[0].lotteryTickets).toBe(10);
  });
});
