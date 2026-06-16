import type { ItemDef } from "./types.js";

export const items: ItemDef[] = [
  // Fast Food — location: monolithBurgers
  // Fries and Hamburgers give no happiness; they don't consume the fastFood group slot.
  { id: "fries",        category: "fastFood", locationId: "monolithBurgers", basePrice: 65 },
  { id: "hamburgers",   category: "fastFood", locationId: "monolithBurgers", basePrice: 79 },
  { id: "cheeseburger", category: "fastFood", locationId: "monolithBurgers", basePrice: 89,  happinessOnBuy: 1, happinessGroup: "fastFood" },
  { id: "astroChicken", category: "fastFood", locationId: "monolithBurgers", basePrice: 124, happinessOnBuy: 2, happinessGroup: "fastFood" },

  // Soft Drinks — location: monolithBurgers
  { id: "colasDrink",  category: "softDrink", locationId: "monolithBurgers", basePrice: 69,  happinessOnBuy: 1, happinessGroup: "softDrink" },
  { id: "shakesDrink", category: "softDrink", locationId: "monolithBurgers", basePrice: 102, happinessOnBuy: 2, happinessGroup: "softDrink" },

  // Fresh Food — location: blacksMarket; no group = happiness fires every purchase
  { id: "freshFood1Wk", category: "freshFood", locationId: "blacksMarket", basePrice: 55,  freshFoodWeeks: 1, happinessOnBuy: 1 },
  { id: "freshFood2Wk", category: "freshFood", locationId: "blacksMarket", basePrice: 100, freshFoodWeeks: 2, happinessOnBuy: 2 },
  { id: "freshFood4Wk", category: "freshFood", locationId: "blacksMarket", basePrice: 190, freshFoodWeeks: 4, happinessOnBuy: 4 },

  // Clothes
  { id: "casualClothesQT",    category: "clothes", locationId: "qtClothing", basePrice: 73,  clothingCategory: "casual",   clothingWeeks: 11 },
  { id: "casualClothesZMart", category: "clothes", locationId: "zMart",      basePrice: 35,  clothingCategory: "casual",   clothingWeeks: 9 },
  { id: "dressClothesQT",     category: "clothes", locationId: "qtClothing", basePrice: 125, clothingCategory: "dress",    clothingWeeks: 13, happinessOnBuy: 1, happinessGroup: "dressClothes" },
  { id: "dressClothesZMart",  category: "clothes", locationId: "zMart",      basePrice: 90,  clothingCategory: "dress",    clothingWeeks: 9 },
  { id: "businessSuit",       category: "clothes", locationId: "qtClothing", basePrice: 295, clothingCategory: "business", clothingWeeks: 13, happinessOnBuy: 2, happinessGroup: "businessSuit" },

  // Durables — Socket City (breakChanceInverse: 51)
  { id: "refrigeratorSocket", category: "durable", locationId: "socketCity", basePrice: 876,  durableType: "refrigerator", happinessOnBuy: 1, breakChanceInverse: 51, wildWillyProof: true },
  { id: "freezerSocket",      category: "durable", locationId: "socketCity", basePrice: 513,  durableType: "freezer",      happinessOnBuy: 2, breakChanceInverse: 51, wildWillyProof: true },
  { id: "stoveSocket",        category: "durable", locationId: "socketCity", basePrice: 570,  durableType: "stove",        happinessOnBuy: 1, breakChanceInverse: 51, wildWillyProof: true },
  { id: "microwaveSocket",    category: "durable", locationId: "socketCity", basePrice: 330,  durableType: "microwave",    happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "colorTVSocket",      category: "durable", locationId: "socketCity", basePrice: 525,  durableType: "colorTV",      happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "vcrSocket",          category: "durable", locationId: "socketCity", basePrice: 333,  durableType: "vcr",          happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "stereoSocket",       category: "durable", locationId: "socketCity", basePrice: 412,  durableType: "stereo",       happinessOnBuy: 2, breakChanceInverse: 51 },
  { id: "hotTubSocket",       category: "durable", locationId: "socketCity", basePrice: 1255, durableType: "hotTub",       happinessOnBuy: 3, breakChanceInverse: 51, wildWillyProof: true },
  { id: "computerSocket",     category: "durable", locationId: "socketCity", basePrice: 1599, durableType: "computer",     happinessOnBuy: 3, breakChanceInverse: 51, wildWillyProof: true },

  // Durables — Z-Mart (breakChanceInverse: 36)
  // Note: stereoZMart ($450) > stereoSocket ($412) — matches original game reference.
  { id: "refrigeratorZMart", category: "durable", locationId: "zMart", basePrice: 650, durableType: "refrigerator", happinessOnBuy: 1, breakChanceInverse: 36, wildWillyProof: true },
  { id: "stoveZMart",        category: "durable", locationId: "zMart", basePrice: 490, durableType: "stove",        happinessOnBuy: 1, breakChanceInverse: 36, wildWillyProof: true },
  { id: "microwaveZMart",    category: "durable", locationId: "zMart", basePrice: 220, durableType: "microwave",    happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "colorTVZMart",      category: "durable", locationId: "zMart", basePrice: 450, durableType: "colorTV",      happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "vcrZMart",          category: "durable", locationId: "zMart", basePrice: 250, durableType: "vcr",          happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "stereoZMart",       category: "durable", locationId: "zMart", basePrice: 450, durableType: "stereo",       happinessOnBuy: 1, breakChanceInverse: 36 },
  { id: "bwTVZMart",         category: "durable", locationId: "zMart", basePrice: 110, durableType: "bwTV",                            breakChanceInverse: 36 },

  // Books — Z-Mart only; no happiness; all three together → +1 extraCredit (handled in shopping.ts)
  { id: "encyclopedia", category: "book", locationId: "zMart", basePrice: 475, durableType: "encyclopedia", wildWillyProof: true },
  { id: "dictionary",   category: "book", locationId: "zMart", basePrice: 70,  durableType: "dictionary",   wildWillyProof: true },
  { id: "atlas",        category: "book", locationId: "zMart", basePrice: 55,  durableType: "atlas",         wildWillyProof: true },

  // Junk — Z-Mart; no group = penalty fires every purchase
  { id: "dogFood",          category: "junk", locationId: "zMart", basePrice: 18,  happinessOnBuy: -1 },
  { id: "eightTrackPlayer", category: "junk", locationId: "zMart", basePrice: 75,  happinessOnBuy: -1 },
  { id: "worksOfCapote",    category: "junk", locationId: "zMart", basePrice: 100, happinessOnBuy: -2 },

  // Newspaper — Black's Market; $1 fixed price; 1 Hour cost (from config.actionCosts.newspaper)
  { id: "newspaper", category: "newspaper", locationId: "blacksMarket", basePrice: 1, fixedPrice: true },

  // Tickets — Z-Mart; +2 happiness first per type per turn
  { id: "baseballTicket", category: "ticket", locationId: "zMart", basePrice: 45, ticketType: "baseball", happinessOnBuy: 2, happinessGroup: "baseballTicket" },
  { id: "theatreTicket",  category: "ticket", locationId: "zMart", basePrice: 30, ticketType: "theatre",  happinessOnBuy: 2, happinessGroup: "theatreTicket" },
  { id: "concertTicket",  category: "ticket", locationId: "zMart", basePrice: 40, ticketType: "concert",  happinessOnBuy: 2, happinessGroup: "concertTicket" },
];
