import { create } from "zustand";
import { createInitialGame, reduce } from "@jones/core";
import type { Command, GameEvent, GameState } from "@jones/core";
import { defaultConfig, aiDifficulty } from "@jones/config";
import type { GameConfig } from "@jones/config";
import { makeAgent, playGame } from "@jones/ai";
import type { Seat } from "@jones/ai";

const DEFAULT_GOALS = { wealth: 30, happiness: 30, education: 19, career: 30 };

export type Difficulty = "easy" | "medium" | "hard";

export interface GameStore {
  config: GameConfig;
  state: GameState | null;
  lastEvents: GameEvent[];
  seats: Seat[];
  startGame(opponentCount?: number, difficulty?: Difficulty): void;
  dispatch(command: Command): void;
}

export const useGameStore = create<GameStore>((set, get) => ({
  config: defaultConfig,
  state: null,
  lastEvents: [],
  seats: [],
  startGame(opponentCount = 0, difficulty = "medium") {
    const { config } = get();
    const seed = Date.now();
    const setups = [
      { name: "You", isAI: false, goals: DEFAULT_GOALS },
      ...Array.from({ length: opponentCount }, (_, i) => ({
        name: `AI ${i + 1}`,
        isAI: true,
        goals: DEFAULT_GOALS,
      })),
    ];
    const state = createInitialGame(config, seed, setups);
    const seats: Seat[] = setups.map((s, i) => ({
      playerId: `p${i}`,
      agent: s.isAI ? makeAgent(aiDifficulty[difficulty], config, seed, i) : null,
    }));
    set({ state, seats, lastEvents: [] });
  },
  dispatch(command) {
    const { state, config, seats } = get();
    if (!state || state.status !== "playing") return;
    const { state: afterHuman, events: humanEvents } = reduce(state, command, config);
    let next = afterHuman;
    let events = humanEvents;
    if (next.status === "playing" && next.players[next.currentPlayerIndex].isAI) {
      const result = playGame(config, next, seats);
      next = result.state;
      events = [...events, ...result.events];
    }
    set({ state: next, lastEvents: events });
  },
}));
