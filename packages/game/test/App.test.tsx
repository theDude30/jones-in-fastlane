import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { App } from "../src/App.js";
import { useGameStore } from "../src/store/gameStore.js";

vi.mock("../src/screens/PixiBoard.js", () => ({
  PixiBoard: () => null,
}));

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
    expect(screen.getByTestId("play-screen")).toBeInTheDocument();
  });

  it("dispatching EndTurn advances the week in state", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    // The End Turn control now lives on the Pixi board canvas, which can't be
    // clicked through RTL (Pixi renders to a canvas, not DOM text nodes) —
    // dispatch the command directly, exactly as a real board click would.
    act(() => {
      useGameStore.getState().dispatch({ type: "EndTurn" });
    });
    expect(useGameStore.getState().state!.week).toBe(2);
  });

  it("does not crash when an invalid action is dispatched", () => {
    render(<App />);
    fireEvent.click(screen.getByText("Start Game"));
    useGameStore.setState((s) => {
      s.state!.players[0].hoursRemaining = 0;
      return { state: s.state };
    });
    // Board clicks can't be simulated through RTL (Pixi renders to a canvas,
    // not DOM text nodes) — dispatch the illegal command directly, exactly
    // as a real board click would, to prove the error path doesn't crash the
    // tree. Wrapped in act() because this dispatch happens outside of an
    // RTL-triggered event, so React won't otherwise flush the resulting
    // state update before the assertion runs.
    act(() => {
      useGameStore.getState().dispatch({ type: "EnterBuilding" });
    });
    expect(screen.getByTestId("play-screen")).toBeInTheDocument();
  });
});
