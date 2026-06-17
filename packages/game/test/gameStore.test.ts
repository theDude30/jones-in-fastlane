import { describe, it, expect } from "vitest";
import { useGameStore } from "../src/store/gameStore.js";

function freshStore() {
  useGameStore.setState({ state: null, lastEvents: [] });
  return useGameStore.getState();
}

describe("gameStore", () => {
  it("startGame initializes one human player with the debug goals", () => {
    const store = freshStore();
    store.startGame();
    const { state } = useGameStore.getState();
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
});
