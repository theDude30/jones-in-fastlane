import type { GameConfig } from "./types.js";
import { constants } from "./constants.js";
import { goalRanges } from "./goals.js";
import { actionCosts } from "./actionCosts.js";
import { locations } from "./locations.js";
import { jobs } from "./jobs.js";

export const defaultConfig: GameConfig = {
  constants,
  goalRanges,
  actionCosts,
  locations,
  jobs,
};
