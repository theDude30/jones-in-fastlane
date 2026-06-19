import { describe, it, expect } from "vitest";
import { useGameStore } from "../src/store/gameStore.js";

function freshStore() {
  useGameStore.setState({ state: null, lastEvents: [], seats: [] });
  return useGameStore.getState();
}

describe("gameStore", () => {
  it("startGame defaults to one human player with the debug goals and no AI opponents", () => {
    const store = freshStore();
    store.startGame();
    const { state, seats } = useGameStore.getState();
    expect(state).not.toBeNull();
    expect(state!.players).toHaveLength(1);
    expect(state!.players[0].name).toBe("You");
    expect(state!.players[0].isAI).toBe(false);
    expect(state!.players[0].goals).toEqual({
      wealth: 30,
      happiness: 30,
      education: 19,
      career: 30,
    });
    expect(seats).toHaveLength(1);
    expect(seats[0].agent).toBeNull();
  });

  it("startGame builds the requested number of AI opponents with seated agents", () => {
    const store = freshStore();
    store.startGame(2, "hard");
    const { state, seats } = useGameStore.getState();
    expect(state!.players).toHaveLength(3);
    expect(state!.players.map((p) => p.name)).toEqual(["You", "AI 1", "AI 2"]);
    expect(state!.players[1].isAI).toBe(true);
    expect(state!.players[2].isAI).toBe(true);
    expect(seats).toHaveLength(3);
    expect(seats[0].agent).toBeNull();
    expect(seats[1].agent).not.toBeNull();
    expect(seats[2].agent).not.toBeNull();
  });

  it("dispatch is a no-op before startGame", () => {
    const store = freshStore();
    store.dispatch({ type: "EndTurn" });
    expect(useGameStore.getState().state).toBeNull();
  });

  it("dispatch chains a real multi-command sequence through reduce", () => {
    const store = freshStore();
    store.startGame();

    store.dispatch({ type: "EnterBuilding" });
    expect(useGameStore.getState().state!.players[0].insideBuilding).toBe(true);

    store.dispatch({ type: "EndTurn" });
    expect(useGameStore.getState().state!.week).toBe(2);
  });

  it("dispatch records InvalidAction and leaves state unchanged for an illegal command", () => {
    const store = freshStore();
    store.startGame();

    // Player starts outside with no job: Work is illegal.
    store.dispatch({ type: "Work" });
    const { state, lastEvents } = useGameStore.getState();
    expect(lastEvents.some((e) => e.type === "InvalidAction")).toBe(true);
    expect(state!.players[0].insideBuilding).toBe(false);
  });

  it("dispatch is a no-op once the game has ended", () => {
    const store = freshStore();
    store.startGame();
    useGameStore.setState((s) => ({ state: { ...s.state!, status: "ended" } }));
    const weekBefore = useGameStore.getState().state!.week;

    store.dispatch({ type: "EndTurn" });
    expect(useGameStore.getState().state!.week).toBe(weekBefore);
  });

  it("dispatch auto-plays AI seats until control returns to the human, merging events", () => {
    const store = freshStore();
    store.startGame(1, "easy");

    store.dispatch({ type: "EndTurn" });
    const { state, lastEvents } = useGameStore.getState();
    // The lone AI opponent (seat 1 of 2) is always the last seat, so its own
    // EndTurn wraps the turn order and advances the week — proving playGame
    // actually ran the AI's turn rather than stopping at the human's EndTurn.
    expect(state!.currentPlayerIndex).toBe(0);
    expect(state!.week).toBe(2);
    expect(lastEvents.some((e) => e.type === "WeekAdvanced")).toBe(true);
  });
});
