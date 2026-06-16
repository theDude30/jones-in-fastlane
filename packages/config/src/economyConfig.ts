import type { EconomyConfig } from "./types.js";

export const defaultEconomyConfig: EconomyConfig = {
  mode: "dynamic",
  initialIndex: 0,
  initialReading: 0,
  eventStartWeek: 8,
  crashReadingThreshold: 80,
  crashProbabilityBase: 30,
  boomProbabilityBase: 30,
};

/** Use in tests to avoid RNG-dependent economy behaviour. */
export const constantEconomyConfig: EconomyConfig = {
  ...defaultEconomyConfig,
  mode: "constant",
};
