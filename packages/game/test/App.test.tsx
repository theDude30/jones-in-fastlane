import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App.js";
import { useGameStore } from "../src/store/gameStore.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
});

describe("App", () => {
  it("shows the New Game screen initially", () => {
    render(<App />);
    expect(screen.getByText("Jones in the Fast Lane")).toBeInTheDocument();
  });

  it("clicking Start Game switches to the play screen", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    expect(screen.getByText(/Week: 1/)).toBeInTheDocument();
  });

  it("clicking End Turn advances the displayed week", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    fireEvent.click(screen.getByText("End Turn"));
    expect(screen.getByText(/Week: 2/)).toBeInTheDocument();
  });

  it("renders an error event inline instead of crashing", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    useGameStore.setState((s) => {
      s.state!.players[0].hoursRemaining = 0;
      return { state: s.state };
    });
    fireEvent.click(screen.getByText("Enter Building")); // illegal: not enough hours
    expect(screen.getByText(/NotEnoughTime/)).toBeInTheDocument();
  });
});
