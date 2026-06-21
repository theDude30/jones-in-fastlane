# AI Poverty-Spiral Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give both AI planners a way to raise emergency cash (pawn a durable, sell a T-bill, sell a stock) so a player who hits `$0` cash and lapsed clothing can recover instead of being permanently unemployable — fixing a reproducible bug where the game never ends because the AI opponent gets stuck in a poverty spiral forever.

**Architecture:** `legalCommands` (in `packages/ai/src/selectors.ts`) gains four more conditionally-included command types (`OpenBroker`, `SellStock`, `SellTBill`, `PawnItem`), each gated by the exact precondition `@jones/core`'s `reduce()` already enforces — so `RandomPlanner` can pick them by chance. `GreedyPlanner` gains a new private `emergencyLiquidity` method, tried only when its normal goal-pursuit loop returns nothing, using the same `navigateInto` navigation helper its other methods already use.

**Tech Stack:** TypeScript (strict), Vitest. Run `pnpm test` and `pnpm typecheck` from the repo root.

## Global Constraints

- No `@jones/core`/`@jones/config` changes — every command needed (`PawnItem`, `SellStock`, `SellTBill`, `OpenBroker`) already exists and is already exercised by existing core tests. All work is in `@jones/ai`.
- No proactive cash-buffer management — only last-resort recovery, tried after all normal goal-pursuing activities have already returned nothing.
- Tests use real fixtures (`createInitialGame`, real `reduce()`/`playGame()`) — no mocking of game logic, matching the project's existing AI testing convention.
- `GreedyPlanner`'s recovery priority order: (1) pawn an owned durable whose type isn't already pawned state-wide, (2) sell a T-bill, (3) sell a stock, (4) nothing to liquidate → fall through to `EndTurn`.

---

## File map

| Action | File | Responsibility |
|--------|------|-----------------|
| Modify | `packages/ai/src/selectors.ts` | `legalCommands` gains `OpenBroker`/`SellStock`/`SellTBill`/`PawnItem` entries |
| Modify | `packages/ai/test/selectors.test.ts` | Tests for the above |
| Modify | `packages/ai/src/greedy.ts` | `GreedyPlanner` gains `emergencyLiquidity`, tried as a last resort in `nextCommand` |
| Modify | `packages/ai/test/greedy.test.ts` | Tests for the above |
| Modify | `packages/ai/test/integration.ai.test.ts` | Regression test reproducing the exact diagnosed scenario and asserting recovery |

---

## Task 1: `legalCommands` — expand `RandomPlanner`'s repertoire

**Files:**
- Modify: `packages/ai/src/selectors.ts`
- Modify: `packages/ai/test/selectors.test.ts`

**Interfaces:**
- No new exports — `legalCommands(state, playerId, config): Command[]`'s signature is unchanged, it just returns more command types under the right conditions. Consumed as-is by `RandomPlanner` (already wired) and by Task 2's tests (not by Task 2's implementation — `GreedyPlanner.emergencyLiquidity` is separate, deliberate logic, not driven by this list).

- [ ] **Step 1: Write the failing tests**

In `packages/ai/test/selectors.test.ts`, add these four `it` blocks inside the existing `describe("legalCommands", ...)` block (after the last existing `it`, before the closing `});` of that `describe`):

```ts
  it("offers OpenBroker at the bank when the broker isn't open, not when it already is", () => {
    const s = solo();
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    let cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "OpenBroker")).toBe(true);

    s.players[0].brokerMenuOpen = true;
    cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "OpenBroker")).toBe(false);
  });

  it("offers SellStock/SellTBill only when the broker is open and the asset is owned", () => {
    const s = solo();
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].brokerMenuOpen = true;
    s.players[0].stocks.gold = 2;
    s.players[0].tBills = 1;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "SellStock" && c.stockId === "gold")).toBe(true);
    expect(cmds.some((c) => c.type === "SellTBill")).toBe(true);
  });

  it("excludes SellStock/SellTBill when the broker isn't open", () => {
    const s = solo();
    s.players[0].locationId = "bank";
    s.players[0].insideBuilding = true;
    s.players[0].stocks.gold = 2;
    s.players[0].tBills = 1;
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "SellStock")).toBe(false);
    expect(cmds.some((c) => c.type === "SellTBill")).toBe(false);
  });

  it("offers PawnItem for an owned durable whose type isn't already pawned", () => {
    const s = solo();
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "PawnItem" && c.itemId === "refrigeratorSocket")).toBe(true);
  });

  it("excludes PawnItem when that durable type is already pawned state-wide", () => {
    const s = solo();
    s.players[0].locationId = "pawnShop";
    s.players[0].insideBuilding = true;
    s.players[0].durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    s.pawnedItems = [
      { itemId: "refrigeratorZMart", durableType: "refrigerator", pricePaid: 650, pawnedByPlayerId: "p1", pawnedWeek: 1 },
    ];
    const cmds = legalCommands(s, "p0", defaultConfig);
    expect(cmds.some((c) => c.type === "PawnItem")).toBe(false);
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run packages/ai/test/selectors.test.ts 2>&1 | tail -40`
Expected: FAIL on all 5 new tests — `legalCommands` doesn't yet return any of these command types.

- [ ] **Step 3: Implement the additions in `packages/ai/src/selectors.ts`**

Find this block (inside `legalCommands`, within the `if (isInside(p)) { ... }` branch, right after the existing `// BuyItem: ...` `for` loop and before the closing `} else {`):

```ts
    // BuyItem: at a store, items sold here, not an already-owned durable, and affordable.
    for (const item of config.items) {
      if (item.locationId !== p.locationId) continue;
      if (item.durableType !== undefined) {
        const alreadyOwned = p.durables.some(
          (d) => config.items.find((i) => i.id === d.itemId)?.durableType === item.durableType,
        );
        if (alreadyOwned) continue;
      }
      const price = item.fixedPrice ? item.basePrice : economy.adjustedPrice(item.basePrice, state.economy.reading);
      if (canAfford(p, price)) cmds.push({ type: "BuyItem", itemId: item.id });
    }
  } else {
```

Replace it with (the existing `BuyItem` loop, unchanged, plus four new blocks immediately after it):

```ts
    // BuyItem: at a store, items sold here, not an already-owned durable, and affordable.
    for (const item of config.items) {
      if (item.locationId !== p.locationId) continue;
      if (item.durableType !== undefined) {
        const alreadyOwned = p.durables.some(
          (d) => config.items.find((i) => i.id === d.itemId)?.durableType === item.durableType,
        );
        if (alreadyOwned) continue;
      }
      const price = item.fixedPrice ? item.basePrice : economy.adjustedPrice(item.basePrice, state.economy.reading);
      if (canAfford(p, price)) cmds.push({ type: "BuyItem", itemId: item.id });
    }

    // OpenBroker: at the bank, not already open.
    if (atLocation(p, "bank") && !p.brokerMenuOpen) {
      cmds.push({ type: "OpenBroker" });
    }

    // SellStock / SellTBill: broker open, asset owned.
    if (p.brokerMenuOpen) {
      for (const stock of config.stocks) {
        if (p.stocks[stock.id] > 0) cmds.push({ type: "SellStock", stockId: stock.id });
      }
      if (p.tBills > 0) cmds.push({ type: "SellTBill" });
    }

    // PawnItem: at the pawn shop, for each owned durable whose type isn't
    // already pawned (pawnedItems is shared state-wide, not per-player).
    if (atLocation(p, "pawnShop")) {
      for (const d of p.durables) {
        const durableType = config.items.find((i) => i.id === d.itemId)?.durableType;
        if (durableType === undefined) continue;
        const alreadyPawned = state.pawnedItems.some((pi) => pi.durableType === durableType);
        if (!alreadyPawned) cmds.push({ type: "PawnItem", itemId: d.itemId });
      }
    }
  } else {
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm vitest run packages/ai/test/selectors.test.ts 2>&1 | tail -40`
Expected: all tests pass.

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/selectors.ts packages/ai/test/selectors.test.ts
git commit -m "feat(ai): add OpenBroker/SellStock/SellTBill/PawnItem to legalCommands"
```

---

## Task 2: `GreedyPlanner.emergencyLiquidity` — deliberate last-resort recovery

**Files:**
- Modify: `packages/ai/src/greedy.ts`
- Modify: `packages/ai/test/greedy.test.ts`

**Interfaces:**
- Produces: `GreedyPlanner.emergencyLiquidity(p: PlayerState, state: GameState): Command | null` (private method) — wired into the existing `nextCommand` as a fallback before `EndTurn`. No public API change; `nextCommand`'s signature and behavior for every previously-passing test is unchanged (this only adds a new fallback for the case where nothing else was returned).

- [ ] **Step 1: Write the failing tests**

In `packages/ai/test/greedy.test.ts`, add these four `it` blocks inside the existing `describe("GreedyPlanner", ...)` block (after the last existing `it`, before the closing `});`):

```ts
  it("pawns an owned durable as a last resort when no goal activity is available", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 }); // all goals already met
    const p = s.players[0];
    p.locationId = "pawnShop";
    p.insideBuilding = true;
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "PawnItem", itemId: "refrigeratorSocket" });
  });

  it("navigates to the pawn shop first when not yet there", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.durables = [{ itemId: "refrigeratorSocket", pricePaid: 876 }];
    // p starts at lowCostHousing, outside.
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "TravelTo", locationId: "pawnShop" });
  });

  it("sells a T-bill when there's nothing to pawn", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.brokerMenuOpen = true;
    p.tBills = 2;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "SellTBill" });
  });

  it("sells a stock when there's nothing to pawn and no T-bills", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.brokerMenuOpen = true;
    p.stocks.gold = 3;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "SellStock", stockId: "gold" });
  });

  it("opens the broker first when it owns a T-bill but the broker isn't open yet", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 });
    const p = s.players[0];
    p.locationId = "bank";
    p.insideBuilding = true;
    p.tBills = 1;
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "OpenBroker" });
  });

  it("still ends the turn when there is truly nothing left to liquidate", () => {
    const s = solo({ wealth: 0, happiness: 0, education: 1, career: 0 }); // all goals met, no assets
    const planner = new GreedyPlanner(5, HARD, defaultConfig);
    expect(planner.nextCommand(s, "p0")).toEqual({ type: "EndTurn" });
  });
```

- [ ] **Step 2: Run the tests to confirm they fail**

Run: `pnpm vitest run packages/ai/test/greedy.test.ts 2>&1 | tail -60`
Expected: FAIL on the 5 new recovery tests (the 6th, "still ends the turn...", already passes today since it matches existing no-op behavior — that's fine, it's there to lock in the unchanged case).

- [ ] **Step 3: Implement `emergencyLiquidity` in `packages/ai/src/greedy.ts`**

Find this method (the last one in the class, right before the closing `}` of `GreedyPlanner`):

```ts
  /**
   * Returns the next navigation command needed to be INSIDE `locationId`,
   * or null when already inside it. Returns null (infeasible) when a required
   * step can't be afforded.
   */
  private navigateInto(p: PlayerState, locationId: string): Command | null {
    if (!atLocation(p, locationId)) {
      if (isInside(p)) return { type: "ExitBuilding" };
      const cost = travelHours(this.config, p.locationId, locationId);
      if (!hasHours(p, cost)) return null;
      return { type: "TravelTo", locationId };
    }
    if (!isInside(p)) {
      if (!hasHours(p, this.config.actionCosts.enterLocation)) return null;
      return { type: "EnterBuilding" };
    }
    return null; // already at location and inside
  }
}
```

Replace it with (the existing `navigateInto` unchanged, plus a new method after it):

```ts
  /**
   * Returns the next navigation command needed to be INSIDE `locationId`,
   * or null when already inside it. Returns null (infeasible) when a required
   * step can't be afforded.
   */
  private navigateInto(p: PlayerState, locationId: string): Command | null {
    if (!atLocation(p, locationId)) {
      if (isInside(p)) return { type: "ExitBuilding" };
      const cost = travelHours(this.config, p.locationId, locationId);
      if (!hasHours(p, cost)) return null;
      return { type: "TravelTo", locationId };
    }
    if (!isInside(p)) {
      if (!hasHours(p, this.config.actionCosts.enterLocation)) return null;
      return { type: "EnterBuilding" };
    }
    return null; // already at location and inside
  }

  /**
   * Last resort, tried only when no goal-pursuing activity returned a
   * command: raise emergency cash by pawning a durable, else selling a
   * T-bill, else selling a stock. Returns null when there's truly nothing
   * left to liquidate.
   */
  private emergencyLiquidity(p: PlayerState, state: GameState): Command | null {
    const pawnable = p.durables.find((d) => {
      const durableType = this.config.items.find((i) => i.id === d.itemId)?.durableType;
      return durableType !== undefined && !state.pawnedItems.some((pi) => pi.durableType === durableType);
    });
    if (pawnable) {
      const nav = this.navigateInto(p, "pawnShop");
      if (nav) return nav;
      if (!atLocation(p, "pawnShop") || !isInside(p)) return null;
      return { type: "PawnItem", itemId: pawnable.itemId };
    }

    if (p.tBills > 0) {
      const nav = this.navigateInto(p, "bank");
      if (nav) return nav;
      if (!atLocation(p, "bank") || !isInside(p)) return null;
      if (!p.brokerMenuOpen) return { type: "OpenBroker" };
      return { type: "SellTBill" };
    }

    const ownedStock = this.config.stocks.find((s) => p.stocks[s.id] > 0);
    if (ownedStock) {
      const nav = this.navigateInto(p, "bank");
      if (nav) return nav;
      if (!atLocation(p, "bank") || !isInside(p)) return null;
      if (!p.brokerMenuOpen) return { type: "OpenBroker" };
      return { type: "SellStock", stockId: ownedStock.id };
    }

    return null;
  }
}
```

Then update `nextCommand` to try this fallback. Find:

```ts
    // Try each unmet goal weakest-first; return the first actionable command.
    for (const goal of rankedUnmetGoals(p, this.preset.weights)) {
      const cmd = this.activity(goal, p, state);
      if (cmd) return cmd;
    }
    return { type: "EndTurn" };
  }
```

Replace with:

```ts
    // Try each unmet goal weakest-first; return the first actionable command.
    for (const goal of rankedUnmetGoals(p, this.preset.weights)) {
      const cmd = this.activity(goal, p, state);
      if (cmd) return cmd;
    }
    // Last resort: nothing goal-driven is actionable — try to raise
    // emergency cash before giving up on the turn entirely.
    const liquidity = this.emergencyLiquidity(p, state);
    if (liquidity) return liquidity;
    return { type: "EndTurn" };
  }
```

- [ ] **Step 4: Run the tests and typecheck**

Run: `pnpm vitest run packages/ai/test/greedy.test.ts 2>&1 | tail -60`
Expected: all tests pass, including the 6 new ones and every pre-existing test (the fallback only ever fires when the existing goal loop already returned nothing, so no previously-passing case changes).

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 5: Commit**

```bash
git add packages/ai/src/greedy.ts packages/ai/test/greedy.test.ts
git commit -m "feat(ai): teach GreedyPlanner emergency-liquidity recovery"
```

---

## Task 3: Regression test reproducing the diagnosed scenario

**Files:**
- Modify: `packages/ai/test/integration.ai.test.ts`

**Interfaces:**
- Consumes: `makeAgent`, `playGame` (already imported in this file), `goalScores` (already imported).

- [ ] **Step 1: Write the failing test**

In `packages/ai/test/integration.ai.test.ts`, add this `it` block inside the existing `describe("AI full-game integration", ...)` block (after the last existing `it`, before the closing `});`):

```ts
  it("recovers from the diagnosed poverty spiral instead of bottoming out forever (seed 42, medium, 200 weeks)", () => {
    // Reproduction of a real reported bug: this exact seed/difficulty/horizon
    // previously drove the AI to $0 cash by week 6, after which lapsed
    // clothing made Work permanently unaffordable to restore, and happiness
    // declined monotonically to roughly -397 by week 200 with no recovery.
    const seat = { playerId: "p0", agent: makeAgent(aiDifficulty.medium, config, 42, 0) };
    let state = newGame(42);
    const allEvents: GameEvent[] = [];
    let recovered = false;

    for (let w = 0; w < 200 && state.status === "playing"; w++) {
      const r = playGame(config, state, [seat], { maxWeeks: state.week + 1 });
      state = r.state;
      allEvents.push(...r.events);
      if (state.players[0].cash > 0) {
        recovered = true;
        break;
      }
    }

    expect(recovered).toBe(true);
    expect(invalidCount(allEvents)).toBeLessThan(5);
  });
```

- [ ] **Step 2: Run the test to confirm it fails**

Run: `pnpm vitest run packages/ai/test/integration.ai.test.ts 2>&1 | tail -40`
Expected: FAIL — `recovered` stays `false` through all 200 weeks on the unfixed code (cash never climbs back above `0` once it hits bottom).

- [ ] **Step 3: Confirm it passes after Tasks 1-2**

This task adds no new source code — it only proves Tasks 1-2's changes actually fix the real reported bug. Run:

Run: `pnpm vitest run packages/ai/test/integration.ai.test.ts 2>&1 | tail -40`
Expected: all tests pass, including the new one.

Run: `pnpm test 2>&1 | tail -15`
Expected: full suite passes.

Run: `pnpm typecheck 2>&1 | tail -15`
Expected: no errors.

- [ ] **Step 4: Commit**

```bash
git add packages/ai/test/integration.ai.test.ts
git commit -m "test(ai): add regression test for the poverty-spiral recovery fix"
```

---

## Self-review notes

- **Spec coverage:** Goal 1 (`GreedyPlanner` emergency liquidity) → Task 2. Goal 2 (`RandomPlanner`/`legalCommands` repertoire) → Task 1. Goal 3 (reproduction scenario demonstrably recovers) → Task 3. Non-goals respected by construction: no `@jones/core`/`@jones/config` file appears in any task's file list; no proactive cash-buffer logic (the fallback only ever runs after the existing goal loop returns nothing).
- **Type consistency:** `emergencyLiquidity(p: PlayerState, state: GameState): Command | null` matches the exact parameter/return shape every other `GreedyPlanner` private method already uses (`work`, `buyUniform`, `getJob`, `educate`, `buyHappiness`). `legalCommands`' new entries use the exact `Command` union shapes from `@jones/core`'s `types.ts` (`{ type: "SellStock"; stockId }`, etc.) — same shapes Task 2's `emergencyLiquidity` returns, so a command either planner produces is guaranteed to be one `reduce()` already accepts.
- **No placeholders:** every step has complete, working code and exact verification commands.
- **Priority order is unambiguous and tested:** Task 2's six tests each isolate exactly one priority tier (pawn available → pawn; pawn unavailable but T-bill owned → sell T-bill; neither but stock owned → sell stock; broker not yet open → open it first; truly nothing → unchanged `EndTurn` behavior) plus navigation-first behavior when not yet at the right location.
