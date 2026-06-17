import { create } from "zustand";
import { createInitialGame, reduce } from "@jones/core";
import type { Command, GameEvent, GameState } from "@jones/core";
import { defaultConfig } from "@jones/config";
import type { GameConfig } from "@jones/config";

const DEBUG_SEED = 1;
const DEBUG_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

export interface GameStore {
  config: GameConfig;
  state: GameState | null;
  lastEvents: GameEvent[];
  startGame(): void;
  dispatch(command: Command): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  config: defaultConfig,
  state: null,
  lastEvents: [],
  startGame() {
    const state = createInitialGame(get().config, DEBUG_SEED, [
      { name: "You", isAI: false, goals: DEBUG_GOALS },
    ]);
    set({ state, lastEvents: [] });
  },
  dispatch(command) {
    const { state, config } = get();
    if (!state || state.status !== "playing") return;
    const { state: next, events } = reduce(state, command, config);
    set({ state: next, lastEvents: events });
  },
}));
