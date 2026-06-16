import type { DegreeId, UniformLevel } from "@jones/config";
import type { RngState } from "./rng.js";

export interface GoalTargets {
  wealth: number;     // 10..100
  happiness: number;
  education: number;
  career: number;
}

export interface ClothingWeeks {
  casual: number;
  dress: number;
  business: number;
}

export interface PlayerState {
  id: string;
  name: string;
  isAI: boolean;
  cash: number;
  bank: number;
  happiness: number;
  dependibility: number;
  experience: number;
  relaxation: number;
  maxDependibility: number;
  maxExperience: number;
  degrees: DegreeId[];
  jobId: string | null;
  wage: number;            // current hourly wage (0 if unemployed)
  locationId: string;
  insideBuilding: boolean;
  clothing: ClothingWeeks;
  goals: GoalTargets;
  hoursRemaining: number;
}

export type GameStatus = "playing" | "ended";

export interface GameState {
  week: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  economyReading: number;  // §5; static in this plan (0), dynamic later
  rng: RngState;
  status: GameStatus;
  winners: string[];       // player ids, in order of winning
}

export type Command =
  | { type: "TravelTo"; locationId: string }
  | { type: "EnterBuilding" }
  | { type: "ExitBuilding" }
  | { type: "Work" }
  | { type: "EndTurn" };

export type GameEvent =
  | { type: "Traveled"; playerId: string; toLocationId: string; hoursSpent: number }
  | { type: "EnteredBuilding"; playerId: string; locationId: string }
  | { type: "ExitedBuilding"; playerId: string; locationId: string }
  | { type: "Worked"; playerId: string; earned: number }
  | { type: "Fired"; playerId: string; jobId: string }
  | { type: "NotEnoughTime"; playerId: string; action: string }
  | { type: "InvalidAction"; playerId: string; reason: string }
  | { type: "TurnEnded"; playerId: string }
  | { type: "WeekAdvanced"; week: number }
  | { type: "PlayerWon"; playerId: string };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}
