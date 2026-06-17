import { describe, it, expect } from "vitest";
import { constants } from "../src/constants.js";

describe("food & health constants (M3f)", () => {
  it("defines the new constants with the spec's exact values", () => {
    expect(constants.relaxAmount).toBe(3);
    expect(constants.maxRelaxation).toBe(50);
    expect(constants.freshFoodFridgeCapacity).toBe(6);
    expect(constants.freshFoodFreezerBonus).toBe(6);
    expect(constants.starvationHoursLost).toBe(20);
    expect(constants.doctorHoursLost).toBe(10);
  });
});
