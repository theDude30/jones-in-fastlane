export type UniformLevel = "casual" | "dress" | "business";
export type DegreeId =
  | "juniorCollege" | "tradeSchool" | "businessAdmin" | "academic"
  | "electronics" | "preEngineering" | "engineering" | "graduateSchool"
  | "postDoctoral" | "research" | "publishing";

export interface JobDef {
  id: string;            // unique, e.g. "bank.teller"
  locationId: string;    // matches a LocationDef.id
  title: string;
  baseWage: number;      // §6 Base Wage (dollars/hour, pre-economy)
  reqExperience: number;
  reqDependibility: number;
  reqDegrees: DegreeId[];
  uniform: UniformLevel;
  alwaysApproved?: boolean; // Cook
}

export type LocationType =
  | "apartment" | "store" | "workplace" | "service";

export interface LocationDef {
  id: string;
  name: string;
  ringIndex: number;     // position on the board ring (clockwise)
  types: LocationType[];
}

export interface ActionCosts {
  enterLocation: number; // §2
  work: number;
  relax: number;
  study: number;
  applyJob: number;
  applyLoan: number;
  broker: number;
  newspaper: number;
}

export interface GoalRanges {
  min: number;           // 10
  max: number;           // 100
}

export interface GameConstants {
  hoursPerTurn: number;        // 60 §2
  weeksPerMonth: number;       // 4
  maxPlayers: number;          // 4
  initialCash: number;         // §4 / port
  initialDependibility: number; // 20 §4
  initialExperience: number;   // 10 §4
  initialRelaxation: number;   // 10 §4
  initialCasualWeeks: number;  // 6 §11
  homeLocationId: string;      // "lowCostHousing"
  ringSize: number;            // number of ring positions
  hoursPerRingStep: number;    // travel cost per ring step (§2: ~10/lap)
  workWageMultiplier: number;  // 8 §6
  dependibilityDecayPerWeek: number; // 3 §4
}

export interface GameConfig {
  constants: GameConstants;
  goalRanges: GoalRanges;
  actionCosts: ActionCosts;
  locations: LocationDef[];
  jobs: JobDef[];
  economy: EconomyConfig;
}

export interface EconomyConfig {
  mode: "dynamic" | "constant";
  initialIndex: number;
  initialReading: number;
  eventStartWeek: number;
  crashReadingThreshold: number;
  crashProbabilityBase: number;
  boomProbabilityBase: number;
}
