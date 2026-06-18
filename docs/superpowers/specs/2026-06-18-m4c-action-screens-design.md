# M4c — Action Screens Design

## Summary

M4a built a debug screen proving the human command-dispatch loop works, but
deliberately limited its buttons to a fixed list (TravelTo/Enter/Exit/Work/
one hardcoded ApplyForJob/EndTurn) — no `BuyItem`, `Enroll`/`Study`,
banking, pawn, rent, or `Relax` were clickable. This was surfaced by
analyzing 13 screenshots of the original DOS game covering every location
(Black's Market, Z-Mart, Monolith Burgers, QT Clothing, Socket City,
Hi-Tech University, Employment Office, the Factory, Bank, Pawn Shop, Rent
Office, and both apartment types). Every action shown in those screenshots
already maps to an existing `@jones/core` command (M1–M3f) — **no core
logic is missing**. This milestone is UI-only: replace the debug screen's
generic button list with real per-location screens that expose every
already-implemented command.

## Goals

1. Every command in `@jones/core`'s `Command` union is reachable from the
   UI at the location(s) where it's legal.
2. Each location's screen shows the same items/actions the original game
   showed at that location (verified against the 13 reference screenshots).
3. Styling is plain/functional (matches M4a's "legibility only" bar) —
   visual theming is a future milestone, once board art exists.
4. The existing raw-state JSON dump (useful for verification) is kept,
   behind a toggle, not removed.

## Non-Goals

- Visual styling/theming to match the original screenshots' art.
- PixiJS board rendering (M4b — independent of this work; the original
  design spec places "in-building action screens" in the React/DOM layer,
  with no dependency on the Pixi canvas).
- Adding week-4-only gating to the Rent Office (the original game restricts
  `PayRent`/`RequestRentExtension`/`SwitchApartment` to the 4th week of each
  month; the current core has no such gating. Decision: leave it
  always-open — more player-friendly, and not something this milestone
  needs to "fix" since the core behavior wasn't flagged as a bug, just a
  simplification).
- Any new `@jones/core`/`@jones/config` work — this milestone confirmed
  zero missing core logic against the reference screenshots.
- AI changes (`@jones/ai`) — `RandomPlanner`/`GreedyPlanner` are unaffected;
  they dispatch commands directly, not through this UI layer.

## Architecture

### Compositional panel router

A `LocationScreen` component reads the current location's
`LocationDef.types` (`"store" | "workplace" | "service" | "apartment"`)
plus player state, and renders the matching panel(s) — locations can have
more than one type (e.g. Z-Mart is `store` + `workplace`), so more than one
panel can render simultaneously, stacked:

| Location(s) | Types | Panel(s) rendered |
|---|---|---|
| Black's Market, Z-Mart, Monolith Burgers, QT Clothing, Socket City | `store` (+`workplace`) | `StoreScreen` (+ `WorkplaceScreen` if employed here) |
| Bank | `service`, `workplace` | `BankScreen` (+ `WorkplaceScreen` if employed here) |
| Hi-Tech University | `service`, `workplace` | `UniversityScreen` (+ `WorkplaceScreen` if employed here) |
| Rent Office | `service`, `workplace` | `RentOfficeScreen` (+ `WorkplaceScreen` if employed here) |
| Employment Office | `service` | `EmploymentOfficeScreen` |
| Factory | `workplace` | `WorkplaceScreen` (only if employed here — Factory has no other panel, so an unemployed visitor sees nothing to do but leave) |
| Pawn Shop | `service` | `PawnShopScreen` |
| Low-Cost Housing / Security Apartments | `apartment` | `HomeScreen` if `p.apartmentId === locationId`, else `ApartmentForRentScreen` |

### File structure

```
packages/game/src/screens/
  PlayScreen.tsx        — replaces DebugGameScreen: HUD (week/cash/location/
                          hours) + outside-building nav (TravelTo list,
                          EnterBuilding, EndTurn) + <LocationScreen/> when
                          inside + a "Show raw state" toggle (off by default)
                          gating the existing JSON <pre> dump
  LocationScreen.tsx     — the panel router described above
  panels/
    StoreScreen.tsx              — props: locationId; lists config.items
                                    filtered by locationId, a Buy button per
                                    item (price via economy.adjustedPrice
                                    unless item.fixedPrice)
    WorkplaceScreen.tsx          — shown only when findJob(p.jobId).locationId
                                    === current location; Work, RequestRaise,
                                    QuitJob buttons
    BankScreen.tsx                — Deposit/Withdraw (amount inputs, default
                                    100), ApplyLoan, PayLoan (shown only if
                                    p.loanBalance > 0), "See The Broker"
                                    (see Broker toggle below)
    BrokerScreen.tsx              — config.stocks list with current
                                    state.stockPrices[id], Buy/Sell per
                                    stock; T-Bill Buy/Sell; "Back to Bank"
    PawnShopScreen.tsx           — local tab state ("pawn"|"redeem"|"buy"):
                                    PAWN lists p.durables (Pawn button each);
                                    REDEEM lists state.pawnedItems pawned by
                                    this player within pawnExpiryWeeks
                                    (Redeem button each); BUY lists expired
                                    state.pawnedItems (Buy button each)
    UniversityScreen.tsx         — config.degrees list; Enroll button per
                                    eligible not-yet-owned/enrolled degree;
                                    Study button per p.enrollments entry
    EmploymentOfficeScreen.tsx   — local selectedEmployer: string | null;
                                    null shows distinct workplace locations
                                    (from config.locations where types
                                    includes "workplace"); selected shows
                                    config.jobs filtered by that locationId,
                                    each with an Apply button
    RentOfficeScreen.tsx         — shows p.currentRent/p.rentDebt/
                                    p.rentDueWeek; PayRent, RequestRentExtension
                                    (disabled if p.rentExtensionUsedThisTurn),
                                    SwitchApartment buttons
    HomeScreen.tsx                — Relax button; shows p.relaxation/
                                    p.happiness for feedback
    ApartmentForRentScreen.tsx   — shows the other apartment's baseRent;
                                    SwitchApartment button
```

`gameStore.ts` is unchanged — every panel reads `config`/`state` and calls
the existing `dispatch(command)` exactly as `DebugGameScreen` already does.
No new store fields, no new `@jones/core` exports beyond what already
exists.

### Trickier mechanics

- **Broker toggle:** `p.brokerMenuOpen` only resets `false→true→false` across
  turns (`applyStartOfWeek` resets it; `OpenBroker` sets it). `BankScreen`
  keeps local `viewingBroker` state; "See The Broker" dispatches `OpenBroker`
  only if `!p.brokerMenuOpen` (avoids re-spending the broker-visit hour
  cost on every click), then sets `viewingBroker = true`. "Back to Bank" is
  a pure local toggle back to `false` — no command, since there is nothing
  to undo in game state.
- **Amount inputs:** plain `<input type="number">` defaulting to `100` for
  Deposit/Withdraw, dispatched as-is; no client-side validation duplicated
  — core's existing `NotEnoughMoney`/`InvalidAction` events handle it, and
  the panel renders the latest `lastEvents` entry inline (reusing the
  pattern already in `PlayScreen`'s "Last events" section).

## Testing Strategy

- **Component tests** (Vitest + RTL, one file per panel under
  `packages/game/test/panels/`): for each panel, render it with a
  `gameStore` state placing the player at the right location with the right
  preconditions (e.g. owns a durable, has a job here, has loan balance),
  click each action, assert the dispatched command produced the expected
  state change via the real `reduce()` (no mocking — same pattern as
  `gameStore.test.ts`/`App.test.tsx` from M4a).
- **`LocationScreen` routing tests:** for each location, assert the correct
  panel set renders (in particular the dual-panel cases: Z-Mart shows both
  `StoreScreen` and `WorkplaceScreen` when employed there, just `StoreScreen`
  otherwise).
- **One end-to-end test per "real" flow** (extending `PlayScreen`'s existing
  test style): buy an item at a store and see cash decrease; enroll in a
  degree and see it appear in enrollments; deposit cash at the bank and see
  `bank` increase; relax at home and see relaxation increase.
- A11y/visual regression testing is out of scope given the "plain
  functional" styling decision.

## Open Questions

None — all scope and behavior decisions were resolved during brainstorming
(see Non-Goals for what's explicitly deferred).
