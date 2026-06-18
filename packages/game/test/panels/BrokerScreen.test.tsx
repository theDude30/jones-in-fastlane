import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { BrokerScreen } from "../../src/screens/panels/BrokerScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

function atOpenBroker() {
  useGameStore.getState().startGame();
  useGameStore.setState((s) => {
    const p = s.state!.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.brokerMenuOpen = true;
    p.cash = 1000;
    return { state: s.state };
  });
}

describe("BrokerScreen", () => {
  it("buys a stock and increases the holding", () => {
    atOpenBroker();
    render(<BrokerScreen />);
    fireEvent.click(screen.getAllByText("Buy")[0]);
    const p = useGameStore.getState().state!.players[0];
    expect(p.stocks.gold).toBe(1);
  });

  it("buys a T-bill", () => {
    atOpenBroker();
    render(<BrokerScreen />);
    fireEvent.click(screen.getByText("Buy T-Bill"));
    expect(useGameStore.getState().state!.players[0].tBills).toBe(1);
  });
});
