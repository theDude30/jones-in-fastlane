import type { DegreeId, ItemId, UniformLevel } from "@jones/config";
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
  enrollments: Array<{ degreeId: DegreeId; lessonsRemaining: number }>;
  extraCredit: number;
  jobId: string | null;
  wage: number;
  raisesReceived: number;
  locationId: string;
  insideBuilding: boolean;
  clothing: ClothingWeeks;
  goals: GoalTargets;
  hoursRemaining: number;
  fastFood: number;
  freshFood: number;
  durables: Array<{ itemId: ItemId; pricePaid: number }>;
  tickets: { baseball: number; theatre: number; concert: number };
  happyGroupsThisTurn: string[];
}

export type GameStatus = "playing" | "ended";

export interface GameState {
  week: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  economy: { index: number; reading: number };
  rng: RngState;
  status: GameStatus;
  winners: string[];
}

export type Command =
  | { type: "TravelTo"; locationId: string }
  | { type: "EnterBuilding" }
  | { type: "ExitBuilding" }
  | { type: "Work" }
  | { type: "EndTurn" }
  | { type: "ApplyForJob"; jobId: string }
  | { type: "RequestRaise" }
  | { type: "QuitJob" }
  | { type: "Enroll"; degreeId: DegreeId }
  | { type: "Study"; degreeId: DegreeId }
  | { type: "BuyItem"; itemId: ItemId };

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
  | { type: "PlayerWon"; playerId: string }
  | { type: "JobApplied"; playerId: string; jobId: string; wage: number }
  | { type: "JobDenied"; playerId: string; jobId: string; reason: "stats" | "luck" }
  | { type: "RaiseGranted"; playerId: string; newWage: number }
  | { type: "RaiseDenied"; playerId: string; reason: "stats" | "no-higher-offer" }
  | { type: "JobQuit"; playerId: string; jobId: string }
  | { type: "EconomyUpdated"; index: number; reading: number }
  | { type: "CrashOccurred"; severity: "minor" | "moderate" | "major"; week: number }
  | { type: "BoomOccurred"; week: number }
  | { type: "Enrolled"; playerId: string; degreeId: DegreeId; fee: number; lessonsRemaining: number }
  | { type: "Studied"; playerId: string; degreeId: DegreeId; lessonsRemaining: number }
  | { type: "Graduated"; playerId: string; degreeId: DegreeId }
  | { type: "NotEnoughMoney"; playerId: string; action: string }
  | { type: "ItemBought"; playerId: string; itemId: ItemId; price: number; happinessGained: number; extraCreditGained: number };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}
