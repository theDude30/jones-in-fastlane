import type { DegreeDef } from "./types.js";

export const degrees: DegreeDef[] = [
  { id: "juniorCollege",  name: "Junior College",          prereqs: [] },
  { id: "tradeSchool",    name: "Trade School",            prereqs: [] },
  { id: "businessAdmin",  name: "Business Administration", prereqs: ["juniorCollege"] },
  { id: "academic",       name: "Academic",                prereqs: ["juniorCollege"] },
  { id: "electronics",    name: "Electronics",             prereqs: ["tradeSchool"] },
  { id: "preEngineering", name: "Pre-Engineering",         prereqs: ["tradeSchool"] },
  { id: "engineering",    name: "Engineering",             prereqs: ["preEngineering"] },
  { id: "graduateSchool", name: "Graduate School",         prereqs: ["academic"] },
  { id: "postDoctoral",   name: "Post-Doctoral",           prereqs: ["graduateSchool"] },
  { id: "research",       name: "Research",                prereqs: ["postDoctoral"] },
  { id: "publishing",     name: "Publishing",              prereqs: ["research"] },
];
