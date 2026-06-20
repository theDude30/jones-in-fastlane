# M4 (sub-project B) — PixiJS Board Rendering — Design Spec

**Status:** Approved, ready for implementation plan.

## Context

This is the second of four independent pieces under the README's umbrella
"M4 — Rendering + UI + audio" milestone (the others — game setup & AI wiring
[done], responsive layout, audio — are separate specs/sub-projects). Today,
`@jones/game` has no visual board at all: `PlayScreen` shows a text HUD and a
flat list of "Travel to X" / "Enter Building" / "Exit Building" buttons. This
sub-project replaces that with a real PixiJS-rendered town map, matching the
top-level design spec's stated architecture (`docs/superpowers/specs/2026-06-15-jones-in-the-fast-lane-design.md`):
PixiJS owns the board, React owns the rest, a thin bridge syncs them, and the
board is laid out 4K-ready so placeholder art can be swapped for final art
without rework.

**Non-goals (deferred to other sub-projects/milestones):** full adaptive
layout across device classes (bottom sheets on phone, docked panels on
desktop — sub-project C handles *where* the board sits relative to the HUD);
audio (sub-project D); hotseat multiplayer; hand-authored/commissioned art
(still placeholder); per-opponent token customization beyond a fixed color
per seat index.

## Goals

1. Render all 13 locations as an organic town map (not a literal ring or
   Monopoly-style track) — a winding path connects them in the same fixed
   travel order `@jones/config`'s `ringIndex` already defines.
2. Every player's token renders at their current location, color-coded per
   seat index (seat 0 / human: `#2a7fff` blue; AI seats 1-3: `#e0524a` red,
   `#2eb872` green, `#caa12e` amber, in that order), fanned out (not hidden
   behind a count badge) when multiple players share a building.
3. Clicking a building is the **only** way to travel/enter/exit — the
   existing `TravelTo`/`EnterBuilding`/`ExitBuilding` buttons are removed.
4. The board renders crisply and scales correctly (no pixelation, correct
   aspect ratio) at any canvas size/device-pixel-ratio — phone, tablet, or
   desktop — even though where the board sits in the page (vs. sub-project
   C's job) doesn't adapt yet.
5. The human player's own travel animates (token slides along the path);
   AI players' tokens snap to their final position, consistent with AI
   turns already auto-resolving instantly (per the game-setup & AI-wiring
   sub-project).

## Architecture

PixiJS v8 mounts via a thin React wrapper component, **not** `@pixi/react` —
this matches the top-level design spec's literal framing ("React owns
DOM/UI; PixiJS owns the board; a thin bridge syncs them with the core...
Pixi never owns game truth") more directly than a declarative
React-component-per-sprite approach would.

- `<PixiBoard />` creates a single Pixi `Application` once, in `useEffect`,
  and hands it to a plain `BoardView` class that owns every Pixi object
  (building sprites, player tokens, the connecting path). On every relevant
  Zustand store change, `PixiBoard` calls `boardView.syncState(state)` —
  one direction, store → Pixi, never the reverse.
- `BoardView`'s public surface (`syncState`, `playTravelAnimation`,
  `resolveClick`) takes and returns plain data (`GameState`, `Command`, and
  location ids as plain `string` — `@jones/config`'s `LocationDef.id` is a
  `string`, not a dedicated union type) — no Pixi-specific types leak out,
  so its logic is unit-testable without a canvas/WebGL context.
- Board layout coordinates (the hand-placed town-map positions) live in
  `@jones/game`, **not** `@jones/config` — they are a pure rendering
  concern, and `@jones/core`/`@jones/config` are required to stay
  rendering-free (both are reused by `@jones/ai` and a future server, per
  the project's existing architecture). A new `packages/game/src/board/layout.ts`
  exports a `Record<string, { x: number; y: number }>` (keyed by location
  id) in a fixed 4K virtual design space (3840×2160), matching the approved
  organic-town
  mockup's relative placement (coordinates as fractions of the space,
  scaled at construction time):

  | Location | x | y |
  |---|---|---|
  | lowCostHousing | 0.27 | 0.29 |
  | pawnShop | 0.50 | 0.18 |
  | zMart | 0.68 | 0.32 |
  | monolithBurgers | 0.80 | 0.22 |
  | qtClothing | 0.88 | 0.45 |
  | socketCity | 0.75 | 0.58 |
  | hiTechU | 0.60 | 0.50 |
  | employmentOffice | 0.45 | 0.65 |
  | factory | 0.55 | 0.80 |
  | bank | 0.38 | 0.85 |
  | blacksMarket | 0.22 | 0.72 |
  | securityApartments | 0.13 | 0.55 |
  | rentOffice | 0.20 | 0.40 |

  The connecting path is drawn through these points in `ringIndex` order
  (0 → 1 → 2 → ... → 12 → back to 0), matching the config's existing travel
  order exactly — the visual path and the travel-distance model never
  diverge.

- **Cross-device rendering:** the `Application` is created with
  `resolution: Math.min(window.devicePixelRatio, 2)` and `autoDensity: true`
  so text/sprites stay crisp on high-DPI phone/tablet screens. The virtual
  design space is scaled to fit whatever canvas area it's given, preserving
  aspect ratio (letterboxed, never stretched/distorted) — the same town-map
  layout looks correct whether the canvas ends up small or large. This
  sub-project guarantees the **board itself** scales/renders correctly
  everywhere; it does not adapt the surrounding page layout per device
  (sub-project C's job).

## Components & file breakdown

| File | Responsibility |
|---|---|
| `packages/game/src/board/layout.ts` | `Record<string, {x,y}>` keyed by location id (table above) plus the ordered point list for the connecting path |
| `packages/game/src/board/buildingStyles.ts` | Location `types` → color mapping (store/workplace/service/apartment) for the color-coded building cards |
| `packages/game/src/board/BoardView.ts` | Plain TS class. Owns Pixi `Container`s for buildings, tokens, the path. `syncState(state)`, `playTravelAnimation(playerId, fromLocationId, toLocationId)`, `resolveClick(locationId, playerState): Command`. No React, no store access. |
| `packages/game/src/screens/PixiBoard.tsx` | Thin React wrapper: creates the `Application` + `BoardView` once, calls `syncState` on every store update, forwards `BoardView`-resolved clicks to `dispatch(command)` |
| `packages/game/src/screens/PlayScreen.tsx` (modified) | Renders `<PixiBoard />` above the existing HUD/`LocationScreen` stack; removes the `TravelTo`/`EnterBuilding`/`ExitBuilding` buttons (now board-driven) |

## Interaction model

A click on a building resolves to exactly one command via
`BoardView.resolveClick(locationId, playerState)`, based on the clicking
player's current state:

- **Outside, clicked building ≠ current location** → `{ type: "TravelTo", locationId }`
- **Outside, clicked building = current location** → `{ type: "EnterBuilding" }`
- **Inside (clicked building is necessarily the current location, since
  there's nothing else to click while inside)** → `{ type: "ExitBuilding" }`

`PixiBoard.tsx` just calls `dispatch(resolveClick(...))` — the board never
pre-validates; illegal clicks still flow through `dispatch` → `reduce` →
`InvalidAction`/`NotEnoughTime` exactly like today, surfaced in `PlayScreen`'s
existing "Last events" list. The `EndTurn` button stays in `PlayScreen` —
there's no "End Turn" building to click.

**Travel animation:** on a human-dispatched `TravelTo`, `PixiBoard` calls
`boardView.playTravelAnimation("p0", fromLocationId, toLocationId)` — a
~400ms tween of the token along the path segment between the two locations,
driven by Pixi's `Ticker` (no extra animation library). AI players' tokens
never animate; the next `syncState` places them directly at their final
position, consistent with AI turns already auto-resolving instantly before
any render (per the game-setup & AI-wiring sub-project).

## Testing strategy

`jsdom` (the project's existing Vitest environment) has no canvas/WebGL, so
actual Pixi rendering can't be unit-tested the way `@jones/game`'s React
panels were in earlier milestones. Split by what's genuinely testable:

- **Unit-tested (Vitest, real fixtures, no mocking):**
  - `layout.ts`: every location id from `@jones/config`'s `locations` array
    has exactly one entry, and all coordinates fall within `[0, 1]`.
  - `buildingStyles.ts`: the type → color mapping covers every type
    combination actually present in `@jones/config`'s locations (e.g.
    store+workplace, service-only, apartment-only).
  - `BoardView.resolveClick`: the three-way travel/enter/exit branch,
    exercised with hand-built `PlayerState` fixtures — no `Application`,
    no canvas, just function calls in, `Command` out.
- **Not unit-tested:** actual Pixi rendering, the tween animation, and
  click-to-canvas hit-testing — all depend on a real canvas/WebGL context
  `jsdom` doesn't provide.
- **Manually verified via the `verify` skill (Playwright against the real
  running dev server, same approach as the game-setup & AI-wiring
  sub-project):** before the board is considered done — confirm the town
  map renders with the approved layout/colors, clicking a building
  travels/enters/exits correctly, multiple players' tokens fan out at a
  shared location, the human's travel animates while AI tokens snap, and
  the canvas stays crisp/correctly-scaled when the browser viewport is
  resized.

## Self-review

- **Scope:** Touches only `packages/game` (new `board/` directory plus
  `PlayScreen.tsx`/a new `PixiBoard.tsx`). No `@jones/core`/`@jones/config`/`@jones/ai`
  changes — board layout data is deliberately kept out of `@jones/config`
  per the existing rendering-free-core architecture constraint.
- **No placeholders:** every section has concrete values (the 13 coordinate
  pairs, the exact resolution/scaling settings, the exact click-resolution
  branches) rather than deferred decisions.
- **Consistency with prior sub-project:** the "AI snaps, human animates"
  rule and "no Doctor-Visit-style surprises" are direct continuations of the
  game-setup & AI-wiring sub-project's "AI turns auto-resolve instantly"
  decision — not a new, conflicting interaction model.
- **Decomposition boundary respected:** cross-device rendering crispness
  (this sub-project) is explicitly distinguished from cross-device page
  layout/adaptive panel placement (sub-project C) — confirmed with the user
  mid-brainstorm after they raised "should work on all platforms," to avoid
  silently absorbing sub-project C's scope into this spec.
