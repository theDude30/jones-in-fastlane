import { describe, it, expect } from "vitest";
import { aiDifficulty } from "../src/index.js";

describe("aiDifficulty presets", () => {
  it("defines easy/medium/hard", () => {
    expect(Object.keys(aiDifficulty).sort()).toEqual(["easy", "hard", "medium"]);
  });

  it("easy is random, hard is greedy with no mistakes", () => {
    expect(aiDifficulty.easy.planner).toBe("random");
    expect(aiDifficulty.hard.planner).toBe("greedy");
    expect(aiDifficulty.hard.epsilon).toBe(0);
  });

  it("medium is greedy with a positive mistake rate", () => {
    expect(aiDifficulty.medium.planner).toBe("greedy");
    expect(aiDifficulty.medium.epsilon).toBeGreaterThan(0);
    expect(aiDifficulty.medium.epsilon).toBeLessThan(1);
  });

  it("every preset has all four goal weights", () => {
    for (const preset of Object.values(aiDifficulty)) {
      expect(Object.keys(preset.weights).sort()).toEqual(["career", "education", "happiness", "wealth"]);
    }
  });
});
