import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { App } from "../src/App.js";
import { useGameStore } from "../src/store/gameStore.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [] });
});

describe("App", () => {
  it("shows the New Game screen initially", () => {
    render(<App />);
    expect(screen.getByText("New Game")).toBeInTheDocument();
  });

  it("clicking New Game switches to the debug panel", () => {
    render(<App />);
    fireEvent.click(screen.getByText("New Game"));
    expect(screen.getByText(/Week: 1/)).toBeInTheDocument();
  });

  it("clicking End Turn advances the displayed week", () => {
    render(<App />);
    fireEvent.click(screen.getByText("New Game"));
    fireEvent.click(screen.getByText("End Turn"));
    expect(screen.getByText(/Week: 2/)).toBeInTheDocument();
  });

  it("renders an InvalidAction event inline instead of crashing", () => {
    render(<App />);
    fireEvent.click(screen.getByText("New Game"));
    fireEvent.click(screen.getByText("Work")); // illegal: outside, no job yet
    expect(screen.getByText(/InvalidAction/)).toBeInTheDocument();
  });
});
