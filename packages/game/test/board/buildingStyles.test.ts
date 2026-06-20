import { describe, it, expect } from "vitest";
import { defaultConfig } from "@jones/config";
import { buildingColor } from "../../src/board/buildingStyles.js";

describe("buildingColor", () => {
  it("returns a defined color for every location type combination actually configured", () => {
    for (const loc of defaultConfig.locations) {
      expect(() => buildingColor(loc.types)).not.toThrow();
      expect(buildingColor(loc.types)).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it("prioritizes apartment over any other type", () => {
    expect(buildingColor(["apartment", "workplace"])).toBe("#ffe2b0");
  });

  it("prioritizes store over service and workplace", () => {
    expect(buildingColor(["store", "workplace"])).toBe("#cfe3ff");
  });

  it("prioritizes service over workplace", () => {
    expect(buildingColor(["service", "workplace"])).toBe("#d8f5d0");
  });

  it("falls back to the workplace color when that is the only type", () => {
    expect(buildingColor(["workplace"])).toBe("#ffd2a8");
  });
});
