import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useGameStore } from "../../src/store/gameStore.js";
import { BankScreen } from "../../src/screens/panels/BankScreen.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

function atBank() {
  useGameStore.getState().startGame();
  useGameStore.setState((s) => {
    const p = s.state!.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.cash = 1000;
    return { state: s.state };
  });
}

describe("BankScreen", () => {
  it("deposits the default amount (100) on click", () => {
    atBank();
    render(<BankScreen />);
    fireEvent.click(screen.getByText("Deposit"));
    const p = useGameStore.getState().state!.players[0];
    expect(p.cash).toBe(900);
    expect(p.bank).toBe(100);
  });

  it("withdraws the default amount after a deposit", () => {
    atBank();
    render(<BankScreen />);
    fireEvent.click(screen.getByText("Deposit"));
    fireEvent.click(screen.getByText("Withdraw"));
    const p = useGameStore.getState().state!.players[0];
    expect(p.cash).toBe(1000);
    expect(p.bank).toBe(0);
  });

  it("only shows Pay Loan when a loan balance exists", () => {
    atBank();
    render(<BankScreen />);
    expect(screen.queryByText("Pay Loan")).not.toBeInTheDocument();
  });

  it("opens the broker and shows BrokerScreen content", () => {
    atBank();
    render(<BankScreen />);
    fireEvent.click(screen.getByText("See The Broker"));
    expect(useGameStore.getState().state!.players[0].brokerMenuOpen).toBe(true);
    expect(screen.getByText(/Gold/)).toBeInTheDocument();
  });

  it("Back to Bank actually returns to the main bank view", () => {
    atBank();
    render(<BankScreen />);
    fireEvent.click(screen.getByText("See The Broker"));
    expect(screen.getByText(/Gold/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Back to Bank"));
    expect(screen.getByText("Deposit")).toBeInTheDocument();
    expect(screen.queryByText(/Gold/)).not.toBeInTheDocument();
  });
});
