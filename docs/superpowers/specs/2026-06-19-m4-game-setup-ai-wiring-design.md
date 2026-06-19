# M4 (sub-project A) — Game Setup & AI Wiring — Design Spec

**Status:** Approved, ready for implementation plan.

## Context

M4a built the `@jones/game` state bridge; M4c built real per-location action
screens. Both run a single, hardcoded human player (`DEBUG_SEED = 1`, one
player named `"You"`) — there is no way to actually play solo-vs-AI yet, even
though `@jones/ai` (`RandomPlanner`, `GreedyPlanner`, `makeAgent`, `playGame`)
and `@jones/core`'s multi-player support (`createInitialGame` accepts 1–4
`PlayerSetup`s, each with an `isAI` flag and its own `GoalTargets`) have
existed since M3/M3a.

This is the first of four independent pieces remaining under the README's
umbrella "M4 — Rendering + UI + audio" milestone (the others — PixiJS board
rendering, responsive layout, audio — are separate specs). This piece wires
up solo-vs-AI: a human player against 1–3 AI opponents, picked from a New
Game screen, played out through the existing M4c action screens.

**Non-goals (deferred to later specs/milestones):** hotseat (multiple human
seats), per-player goal customization, per-opponent (as opposed to shared)
difficulty, PixiJS board rendering, audio, responsive layout.

## Architecture

No `@jones/core` or `@jones/ai` changes — both already expose everything
needed (`createInitialGame`, `makeAgent`, `playGame`, `aiDifficulty` presets
in `@jones/config`). All work is in `@jones/game`.

### 1. New Game screen (`packages/game/src/screens/NewGameScreen.tsx`)

Replaces the single unconditional "New Game" button with:

- **Opponent count** control: 1, 2, or 3 AI opponents (local component state,
  default 1).
- **Difficulty** control: easy / medium / hard (local component state,
  default `"medium"`), applied to *all* AI opponents — backed by
  `@jones/config`'s existing `aiDifficulty` record, keyed by these same three
  strings.
- **Start Game** button — calls `startGame(opponentCount, difficulty)`.

The human player is always seat 0, named `"You"`. AI opponents are named
`"AI 1"`, `"AI 2"`, `"AI 3"` in seat order. Every player (human and AI) uses
the same default goal targets already in use today:
`{ wealth: 30, happiness: 30, education: 19, career: 30 }` — promoted from
`gameStore.ts`'s current `DEBUG_GOALS` constant, unchanged in value, just
applied uniformly instead of to a single hardcoded player.

### 2. `gameStore.ts` — seats, random seed, AI auto-play

**`startGame(opponentCount: number, difficulty: "easy" | "medium" | "hard")`:**

- Picks a fresh seed via `Date.now()` (replaces the hardcoded
  `DEBUG_SEED = 1`) — same seed within one game stays fully deterministic
  (`@jones/core`'s RNG is seeded), it just varies *between* games.
- Builds `setups: PlayerSetup[]`: `{ name: "You", isAI: false, goals: DEFAULT_GOALS }`
  followed by `opponentCount` AI setups (`{ name: "AI " + n, isAI: true, goals: DEFAULT_GOALS }`).
- Calls `createInitialGame(config, seed, setups)`.
- Builds `seats: Seat[]` (from `@jones/ai`): seat 0 → `{ playerId: "p0", agent: null }`;
  each AI seat `i` → `{ playerId: "p" + i, agent: makeAgent(aiDifficulty[difficulty], config, seed, i) }`.
- Stores `state`, resets `lastEvents`, and keeps `seats` as a store field.
  `seats` is **not** part of `GameState` — `Agent` instances are stateful
  (each owns a seeded RNG) and not serializable, so they live only in the
  UI-layer store, never in core state.

**`dispatch(command)` — extended, not replaced:**

1. `reduce(state, command, config)` for the human's command, exactly as
   today.
2. If the resulting state's `status === "playing"` and the new
   `state.players[state.currentPlayerIndex].isAI` is `true`, call
   `playGame(config, resultState, seats)` once. `playGame`'s existing
   internal loop already plays every consecutive AI seat and stops exactly
   at the next human turn or game end — no new looping logic needed in
   `@jones/game`.
3. Concatenate events from both steps (human command's events, then the AI
   loop's accumulated events, if any) into `lastEvents` — so the human can
   see what the AI(s) did, instant-snap style (no step-through animation;
   there's no PixiJS board yet to animate against).
4. `set({ state: finalState, lastEvents })`.

This is the same `makeAgent`/`playGame` pairing `@jones/ai`'s own
`runner.test.ts` already exercises — confirms the integration shape is
already proven, just not yet wired into the UI.

### 3. `PlayScreen.tsx` — one-line addition

Add `<p>Player: {player.name}</p>` to the existing HUD section. Previously
moot (always one player); now worth labeling since there's a real concept of
"whose turn" — even though, by construction, the human only ever sees their
own turn while `state.status === "playing"` (AI turns auto-resolve before
any render). The existing game-over banner already lists winners by name,
unchanged.

## Data flow

```
NewGameScreen
  └─ startGame(opponentCount, difficulty)
       └─ createInitialGame(config, Date.now(), setups)   [@jones/core]
       └─ seats = setups.map(i => i===0 ? null-agent : makeAgent(...))  [@jones/ai]
       └─ set({ state, seats, lastEvents: [] })

PlayScreen / LocationScreen / panels
  └─ dispatch(command)
       └─ reduce(state, command, config)                  [@jones/core]
       └─ if next player isAI: playGame(config, state, seats)  [@jones/ai]
       └─ set({ state: final, lastEvents: merged })
```

One-way data flow is preserved: the UI still only ever calls `dispatch`;
`@jones/core` still owns all game truth; `@jones/ai` is invoked the same way
a headless test runner would invoke it, just triggered from the store
instead of a test file.

## Testing strategy

Real `reduce()`/`playGame()` throughout — no mocking, matching the existing
`gameStore.test.ts`/`App.test.tsx`/M4c panel-test pattern.

- **`gameStore.test.ts`** (extended): `startGame(opponentCount, difficulty)`
  builds the right number of players and the right seat shape (seat 0 has
  `agent: null`; AI seats have a constructed agent). A human `EndTurn`
  dispatched with one AI opponent present results in control returning to
  the human (or the game ending) with a non-empty, merged `lastEvents` —
  proving the AI seat actually played at least one command before control
  returned.
- **`NewGameScreen.test.tsx`** (new): default opponent count/difficulty
  render correctly; changing the controls updates local state; clicking
  "Start Game" calls `startGame` with the currently-selected values.
- **`App.test.tsx`** (updated): the existing "New Game" → action flow now
  goes through the new controls' defaults and a "Start Game" click instead
  of a single unconditional "New Game" button.

## Self-review

- **Scope:** Touches only `packages/game` (`NewGameScreen.tsx`, `gameStore.ts`,
  `PlayScreen.tsx`) plus their tests. No `@jones/core`/`@jones/config`/`@jones/ai`
  changes — every primitive needed already exists and is already tested at
  its own layer.
- **No placeholders:** every behavior above has a concrete implementation
  shape; nothing deferred to "TBD".
- **Consistency:** `seats` construction mirrors `@jones/ai/test/runner.test.ts`'s
  own usage exactly (same `makeAgent`/`playGame` call shapes), so the
  integration risk is low — it's wiring, not new logic.
- **YAGNI respected:** hotseat, per-opponent difficulty, and goal
  customization were explicitly considered and deferred per the
  decomposition discussion, not silently dropped.
