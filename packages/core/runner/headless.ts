import { defaultConfig } from "@jones/config";
import { createInitialGame } from "../src/setup.js";
import { reduce } from "../src/reduce.js";
import type { Command } from "../src/types.js";

let game = createInitialGame(defaultConfig, 42, [
  { name: "Solo", isAI: false, goals: { wealth: 100, happiness: 100, education: 100, career: 100 } },
]);
game.players[0].jobId = "zMart.clerk";
game.players[0].wage = 5;
game.players[0].maxExperience = 30;
game.players[0].maxDependibility = 30;

const script: Command[] = [
  { type: "TravelTo", locationId: "zMart" },
  { type: "EnterBuilding" },
  { type: "Work" },
  { type: "Work" },
  { type: "ExitBuilding" },
  { type: "EndTurn" },
];

for (const c of script) {
  const { state, events } = reduce(game, c, defaultConfig);
  game = state;
  console.log(c.type, "->", events.map((e) => e.type).join(", "));
}
console.log("week", game.week, "cash", game.players[0].cash, "hours", game.players[0].hoursRemaining);
