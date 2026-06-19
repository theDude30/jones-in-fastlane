import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { NewGameScreen } from "../src/screens/NewGameScreen.js";
import { useGameStore } from "../src/store/gameStore.js";

afterEach(() => {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
});

describe("NewGameScreen", () => {
  it("starts a game with the default 1 AI opponent at medium difficulty", () => {
    render(<NewGameScreen />);
    fireEvent.click(screen.getByText("Start Game"));
    const { state, seats } = useGameStore.getState();
    expect(state!.players).toHaveLength(2);
    expect(state!.players[1].isAI).toBe(true);
    expect(seats).toHaveLength(2);
    expect(seats[1].agent).not.toBeNull();
  });

  it("starts a game with the selected opponent count and difficulty", () => {
    render(<NewGameScreen />);
    fireEvent.change(screen.getByLabelText("AI opponents"), { target: { value: "3" } });
    fireEvent.change(screen.getByLabelText("Difficulty"), { target: { value: "hard" } });
    fireEvent.click(screen.getByText("Start Game"));
    const { state } = useGameStore.getState();
    expect(state!.players).toHaveLength(4);
    expect(state!.players.map((p) => p.name)).toEqual(["You", "AI 1", "AI 2", "AI 3"]);
  });
});
