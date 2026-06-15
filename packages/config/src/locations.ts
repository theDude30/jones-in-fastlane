import type { LocationDef } from "./types.js";

// §8: board order, clockwise from the top. ringIndex defines travel distance.
export const locations: LocationDef[] = [
  { id: "lowCostHousing", name: "Low-Cost Housing", ringIndex: 0, types: ["apartment"] },
  { id: "pawnShop", name: "Pawn Shop", ringIndex: 1, types: ["service"] },
  { id: "zMart", name: "Z-Mart", ringIndex: 2, types: ["store", "workplace"] },
  { id: "monolithBurgers", name: "Monolith Burgers", ringIndex: 3, types: ["store", "workplace"] },
  { id: "qtClothing", name: "QT Clothing", ringIndex: 4, types: ["store", "workplace"] },
  { id: "socketCity", name: "Socket City", ringIndex: 5, types: ["store", "workplace"] },
  { id: "hiTechU", name: "Hi-Tech U", ringIndex: 6, types: ["service", "workplace"] },
  { id: "employmentOffice", name: "Employment Office", ringIndex: 7, types: ["service"] },
  { id: "factory", name: "Factory", ringIndex: 8, types: ["workplace"] },
  { id: "bank", name: "Bank", ringIndex: 9, types: ["service", "workplace"] },
  { id: "blacksMarket", name: "Black's Market", ringIndex: 10, types: ["store", "workplace"] },
  { id: "securityApartments", name: "Le Security Apartments", ringIndex: 11, types: ["apartment"] },
  { id: "rentOffice", name: "Rent Office", ringIndex: 12, types: ["service", "workplace"] },
];
