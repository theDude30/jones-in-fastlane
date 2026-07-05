import { describe, it, expect } from "vitest";
import { aiDifficulty } from "../src/index.js";

describe("aiDifficulty presets", () => {
  it("defines easy/medium/hard", () => {
    expect(Object.keys(aiDifficulty).sort()).toEqual(["easy", "hard", "medium"]);
  });

  it("easy is random, hard is budget with no mistakes", () => {
    expect(aiDifficulty.easy.planner).toBe("random");
    expect(aiDifficulty.hard.planner).toBe("budget");
    expect(aiDifficulty.hard.epsilon).toBe(0);
  });

  it("medium is budget with a positive mistake rate", () => {
    expect(aiDifficulty.medium.planner).toBe("budget");
    expect(aiDifficulty.medium.epsilon).toBeGreaterThan(0);
    expect(aiDifficulty.medium.epsilon).toBeLessThan(1);
  });
});
