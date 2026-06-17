import { defineWorkspace } from "vitest/config";

export default defineWorkspace([
  {
    test: {
      name: "logic",
      include: [
        "packages/config/test/**/*.test.ts",
        "packages/core/test/**/*.test.ts",
        "packages/ai/test/**/*.test.ts",
      ],
      passWithNoTests: true,
    },
  },
  {
    test: {
      name: "game",
      include: ["packages/game/test/**/*.test.{ts,tsx}"],
      environment: "jsdom",
      setupFiles: ["packages/game/test/setup.ts"],
      passWithNoTests: true,
    },
  },
]);
