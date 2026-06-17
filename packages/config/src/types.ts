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
  baseRent?: number;     // monthly rent base for apartment locations
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
  enrollmentBaseFee: number;          // 50  §7
  lessonsPerDegree: number;           // 10  §7
  minLessonsPerDegree: number;        // 8   §7
  graduateDependibilityBonus: number; // 5   §4
  graduateMaxCapBonus: number;        // 5   §4
  maxEnrollments: number;             // 4   §7
  tBillBuyPrice: number;     // 100
  tBillSellPrice: number;    // 97
  lotteryBatchSize: number;  // 10 tickets per $10 batch
  lotteryBatchPrice: number; // 10 (fixed, never economy-adjusted)
  loanPaymentAmount: number; // 50 monthly payment
  loanPaymentToDebt: number; // 45 of the $50 reduces balance; $5 is interest
  pawnPayoutRate: number;         // 0.40 — pawn payout = 40% of current economy-adjusted value
  pawnRedeemRate: number;         // 0.50 — redeem cost = 50% of original price paid (flat)
  pawnSaleRate: number;           // 0.50 — for-sale price after expiry = 50% of price paid (flat)
  pawnMaxItems: number;           // 6 — shop capacity (total)
  pawnExpiryWeeks: number;        // 3 — weeks before an unredeemed item becomes buyable
  garnishmentInterest: number;    // 2 — $ interest deducted per garnished work session
  rentExtensionChances: number[]; // approval chance by # prior approvals (clamp at index 3)
  relaxAmount: number;            // 3   §2 — Relax action: +3 Relaxation per use
  maxRelaxation: number;          // 50  §12 — Relaxation cap (decay floor is separately 10)
  freshFoodFridgeCapacity: number; // 6  §11 — Fresh Food storage with a Refrigerator
  freshFoodFreezerBonus: number;   // 6  §11 — +6 capacity (total 12) if a Freezer is also owned
  starvationHoursLost: number;     // 20 §12 — Starvation start-of-turn Hours penalty
  doctorHoursLost: number;         // 10 §12 — Doctor Visit start-of-turn Hours penalty
}

export interface GameConfig {
  constants: GameConstants;
  goalRanges: GoalRanges;
  actionCosts: ActionCosts;
  locations: LocationDef[];
  jobs: JobDef[];
  economy: EconomyConfig;
  degrees: DegreeDef[];
  items: ItemDef[];
  stocks: StockDef[];
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

export interface DegreeDef {
  id: DegreeId;
  name: string;
  prereqs: DegreeId[];
}

export type ItemId =
  | "fries" | "hamburgers" | "cheeseburger" | "astroChicken"
  | "colasDrink" | "shakesDrink"
  | "freshFood1Wk" | "freshFood2Wk" | "freshFood4Wk"
  | "casualClothesQT" | "casualClothesZMart"
  | "dressClothesQT" | "dressClothesZMart"
  | "businessSuit"
  | "refrigeratorSocket" | "freezerSocket" | "stoveSocket" | "microwaveSocket"
  | "colorTVSocket" | "vcrSocket" | "stereoSocket" | "hotTubSocket" | "computerSocket"
  | "refrigeratorZMart" | "stoveZMart" | "microwaveZMart"
  | "colorTVZMart" | "vcrZMart" | "stereoZMart" | "bwTVZMart"
  | "encyclopedia" | "dictionary" | "atlas"
  | "dogFood" | "eightTrackPlayer" | "worksOfCapote"
  | "newspaper"
  | "baseballTicket" | "theatreTicket" | "concertTicket";

export type DurableType =
  | "refrigerator" | "freezer" | "stove" | "microwave"
  | "colorTV" | "vcr" | "stereo" | "bwTV" | "hotTub" | "computer"
  | "encyclopedia" | "dictionary" | "atlas";

export type StockId = "gold" | "silver" | "porkBellies" | "blueChip" | "pennyStocks";

export interface StockDef {
  id: StockId;
  name: string;
  basePrice: number;
}

export interface ItemDef {
  id: ItemId;
  category: "fastFood" | "softDrink" | "freshFood" | "clothes"
          | "durable" | "book" | "junk" | "ticket" | "newspaper";
  locationId: string;
  basePrice: number;
  fixedPrice?: true;
  happinessOnBuy?: number;
  happinessGroup?: string;
  clothingCategory?: "casual" | "dress" | "business";
  clothingWeeks?: number;
  durableType?: DurableType;
  breakChanceInverse?: number;
  wildWillyProof?: boolean;
  freshFoodWeeks?: number;
  ticketType?: "baseball" | "theatre" | "concert";
}

export interface GoalWeights {
  wealth: number;
  happiness: number;
  education: number;
  career: number;
}

export interface AIDifficultyPreset {
  planner: "greedy" | "random";
  weights: GoalWeights;
  epsilon: number; // 0..1 mistake rate (greedy only; ignored by random)
}
