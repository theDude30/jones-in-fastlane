import type { DegreeId, DurableType, ItemId, StockId, UniformLevel } from "@jones/config";
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
  stocks: Record<StockId, number>;
  tBills: number;
  loanBalance: number;
  loanDueWeek: number | null;
  timesDefaulted: number;
  loanInDefault: boolean;
  brokerMenuOpen: boolean;
  lotteryTickets: number;
  apartmentId: string;
  currentRent: number;
  rentDueWeek: number;
  rentDebt: number;
  rentExtensionsApproved: number;
  everInRentDebt: boolean;
  rentExtensionUsedThisTurn: boolean;
}

export type GameStatus = "playing" | "ended";

export interface PawnedItem {
  itemId: ItemId;
  durableType: DurableType;
  pricePaid: number;
  pawnedByPlayerId: string;
  pawnedWeek: number;
}

export interface GameState {
  week: number;
  currentPlayerIndex: number;
  players: PlayerState[];
  economy: { index: number; reading: number };
  rng: RngState;
  status: GameStatus;
  winners: string[];
  stockPrices: Record<StockId, number>;
  pawnedItems: PawnedItem[];
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
  | { type: "BuyItem"; itemId: ItemId }
  | { type: "Deposit"; amount: number }
  | { type: "Withdraw"; amount: number }
  | { type: "ApplyLoan" }
  | { type: "OpenBroker" }
  | { type: "BuyStock"; stockId: StockId }
  | { type: "SellStock"; stockId: StockId }
  | { type: "BuyTBill" }
  | { type: "SellTBill" }
  | { type: "BuyLotteryTickets" }
  | { type: "PayRent" }
  | { type: "RequestRentExtension" }
  | { type: "SwitchApartment" }
  | { type: "PawnItem"; itemId: ItemId }
  | { type: "RedeemItem"; itemId: ItemId }
  | { type: "BuyPawnedItem"; itemId: ItemId }
  | { type: "PayLoan" };

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
  | { type: "ItemBought"; playerId: string; itemId: ItemId; price: number; happinessGained: number; extraCreditGained: number }
  | { type: "Deposited"; playerId: string; amount: number }
  | { type: "Withdrawn"; playerId: string; amount: number }
  | { type: "LoanApproved"; playerId: string; amount: number; dueWeek: number; happinessGained: number }
  | { type: "LoanDenied"; playerId: string; reason: "unemployed" | "too-risky" | "in-default"; happinessCost: number }
  | { type: "BrokerOpened"; playerId: string }
  | { type: "StockBought"; playerId: string; stockId: StockId; price: number }
  | { type: "StockSold"; playerId: string; stockId: StockId; price: number }
  | { type: "TBillBought"; playerId: string; price: number }
  | { type: "TBillSold"; playerId: string; proceeds: number }
  | { type: "LotteryTicketsBought"; playerId: string; ticketCount: number; totalCost: number }
  | { type: "RentPaid"; playerId: string; amount: number; rentDueWeek: number }
  | { type: "RentExtensionApproved"; playerId: string; extensionsApproved: number; rentDueWeek: number }
  | { type: "RentExtensionDenied"; playerId: string; reason: "in-debt" | "luck"; happinessCost: number }
  | { type: "ApartmentSwitched"; playerId: string; apartmentId: string; newRent: number; rentDueWeek: number }
  | { type: "ItemPawned"; playerId: string; itemId: ItemId; payout: number; happinessCost: number }
  | { type: "ItemRedeemed"; playerId: string; itemId: ItemId; cost: number }
  | { type: "PawnedItemBought"; playerId: string; itemId: ItemId; cost: number }
  | { type: "Garnished"; playerId: string; toDebt: number; interest: number }
  | { type: "LoanPaid"; playerId: string; payment: number; toDebt: number; interest: number; remainingBalance: number; dueWeek: number | null }
  | { type: "RentDebtIncurred"; playerId: string; amount: number; totalDebt: number; rentDueWeek: number }
  | { type: "LoanDefaulted"; playerId: string; timesDefaulted: number; dueWeek: number; happinessCost: number }
  | { type: "FoodSpoiled"; playerId: string; excess?: number }
  | { type: "PlayerStarved"; playerId: string; hoursLost: number }
  | { type: "DoctorVisited"; playerId: string; hoursLost: number; happinessCost: number; cost: number };

export interface ReduceResult {
  state: GameState;
  events: GameEvent[];
}
