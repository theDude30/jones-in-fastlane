# Jones in the Fast Lane — Game Logic Reference

**Date:** 2026-06-15
**Source:** [Jones in the Fast Lane Wiki](https://jonesinthefastlane.fandom.com/) (Fandom), all 143 articles extracted and reconciled.
**Status:** Authoritative ruleset for `@jones/core` + `@jones/config`. Where this
document and the Java port (`dimidd/openjones`) disagree, **this document wins** —
it reflects the original game. See "Discrepancies with the Java Port" at the end.
**Version note:** values are for the **CD-ROM version** unless a Floppy difference
is called out.

---

## 1. Overview

Jones is a turn-based life-simulation board game for up to **4 players** (humans
and/or the AI character "Jones"). Players move around a town board, work, study,
shop, and invest to be the first to meet **all four** of their pre-set life Goals
(Wealth, Happiness, Education, Career). Each turn = one Week of the player's life,
metered in **Hours**.

---

## 2. Time

| Unit | Definition |
|---|---|
| **Hour** | The time budget within a turn. Each player gets **60 Hours/turn** (reduced by Starvation/Doctor events). Actions cost Hours; the town clock tracks remaining Hours. |
| **Turn** | One player's active period (Weekend report → start-of-turn events → free movement/actions until 60 Hours spent). |
| **Week** | One full round of all players' turns. Game starts Week #1. No practical cap (overflow glitch at #32767). |
| **Month** | Every 4 Weeks. The **4th Week of each Month** is special: Rent & Loan payments come due; Rent Office opens. |

**End-of-turn rule:** once 60 Hours are spent, the turn ends the moment the player
**leaves a Location** or finishes moving. While inside a Location with 0 Hours, the
player may still do **zero-time actions** (buy items, deposit/withdraw, enroll, pawn)
but not Work/Study/Relax/etc.

**Time-gated events:**
- Week #4+: Wild Willy street robberies become possible.
- Week #8+: Market Crashes & Economic Booms become possible; Weekend max cost rises
  from $55 to $100.
- Crashes/Booms suppressed in the first 3 Weeks regardless.

### Action / Event Hour costs

| Action | Hours | Notes |
|---|---|---|
| Moving | Varies | ~10 Hours for a full lap of the board; ~4 to cross from one side to the other. Measured in fractions of an Hour. |
| Entering a Location | 2 | Charged even if you immediately re-enter. |
| Working | up to 6 | Full session = 6 Hours; if <6 left, pay is prorated (see Jobs). |
| Applying for a Job / Raise | 4 | Charged whether approved or denied. |
| Relaxing | 6 | Full effect even if <6 Hours remain. |
| Studying (one lesson) | 6 | Full lesson even if <6 Hours remain. |
| Apply for Loan | 2 | Charged whether approved or denied. |
| Visiting the Broker (Stock Market) | 2 | Per time the menu is opened. Buy/sell itself is free. |
| Buying a Newspaper | 1 | At Black's Market. Event-driven newspapers are free. |
| Starvation (event) | 20 | Start-of-turn penalty. |
| Doctor Visit (event) | 10 | Start-of-turn penalty. |
| Buying items, deposit/withdraw, enroll, pawn/redeem | 0 | Allowed even after time runs out. |

### Start-of-Turn sequence (strict order)

1. **Economy recalculation** (Index + Reading; see §5).
2. **Cooking Bonus:** +1 Happiness if the player owns a Microwave or Stove (only +1
   even if both). Applied *before* the win check so it can complete a Happiness Goal.
3. **Winner Check:** if all 4 Goals met → player wins.
4. **Weekend:** pick a Weekend (tickets > durables > random) and charge its price.
5. **Lottery:** if tickets were bought last turn, roll for a prize.
6. **Computer Profits:** if a Computer is owned, 1/7 chance to earn $20–$100 (+3 Happiness).
7. **Degrade Relaxation:** −1 (min 10), unless a Hot Tub is owned.
8. **Apartment Robbery:** Low-Cost Housing + owns Durables → chance of Wild Willy.
9. **Spoiled Food:** Fresh Food spoils if no Refrigerator / over capacity.
10. **Starvation:** if not fed (Fast Food last turn, or Fresh Food + Refrigerator).
11. **Doctor Visit:** chance triggered by Starvation / Spoiled Food / low Relaxation.
12. **Rent Notice** (4th Week of Month, if unpaid).
13. **Buy New Clothes:** decrement all 3 clothing categories by 1 Week; warn if ≤1 left.
14. **Loan Payment notice** (4th Week of Month, if debt outstanding).
15. **Appliance Repair:** each owned Appliance may break (only if Cash > $500).
16. **Economic Events:** Market Crash / Economic Boom announced via Newspaper; firings/pay cuts applied.
17. **Donations:** if "naked" 2+ turns and broke, receive enough for clothes + small cash.
18. **Player Control:** placed outside their apartment with 60 Hours (minus event losses).

---

## 3. Goals & Win Condition

A player wins when **all four** Goals are met at the **start of their turn**. Each
Goal is set per-player at game start to a value **10–100** (cannot be 0/off). Jones's
goals are random.

| Goal | Score formula | Value to hit a 100-goal |
|---|---|---|
| **Wealth** | `floor(Liquid Assets / 100)` | $10,000 Liquid Assets |
| **Happiness** | `= Happiness stat` | 100 Happiness |
| **Education** | `1 + (9 × Degrees)` | all 11 Degrees |
| **Career** | `1.25 × Dependibility` (0 if unemployed) | 80 Dependibility **and** employed |

After someone wins, remaining players may keep playing until they also win.

---

## 4. Stats

All stats are tracked per player. Most are **hidden** (not shown in-game).

- **Liquid Assets** (hidden) = Cash + Bank balance + current Stock value. **Excludes**
  all Items/Durables. Drives the Wealth Goal. (Note: buying Durables *lowers* progress
  to Wealth Goal; duplicate Durables never help.)
- **Net Worth** (shown, used only for Donation eligibility) = Liquid Assets + value of
  all owned Durables (incl. pawned). Durable value = price paid for the *last* unit of
  that type × quantity.
- **Happiness** (drives Happiness Goal): fluctuates from many actions/events (see §11/§12). Range effectively 0–100.
- **Education** = Degree count (drives Education Goal).
- **Career** = `1.25 × Dependibility`, but **0 while unemployed**.
- **Experience** (hidden): starts at **10**, never decreases. Gates job eligibility.
- **Dependibility** (hidden): starts at **20**, **−3 each Week** (min 0). Gates jobs,
  raises, and firing; sole driver of Career. If <10 when getting a new job, reset to 10.
- **Relaxation** (hidden): starts at **10**, range **10–50**. −1/turn (unless Hot Tub).
  +3 per Relax action (max 50). Low Relaxation → Doctor visits & apartment robbery risk.
- **Extra Credit** (hidden): reduces lessons-per-Degree. +1 for owning a Computer; +1
  for owning all three Books (Encyclopedia + Dictionary + Atlas). Lessons: default 10,
  min **8**.

### Experience & Dependibility caps

On getting a **new job**, caps reset:

```
Maximum Experience    = 10 + Job's Required Experience    + (Degrees × 5)
Maximum Dependibility = 20 + Job's Required Dependibility  + (Degrees × 5)
```

- Working: **+1 Experience and +1 Dependibility per work session** (up to caps).
- New job: **+2 Experience**.
- Each Degree earned: **+5 Dependibility** (temporary, ignores cap, decays −3/wk) and
  permanent **+5 to both Max caps**.

---

## 5. Economy

Recomputed at the start of every turn into two hidden values:

- **Index**: −3…+3, the market *trend* (momentum & direction).
- **Reading**: −30…+90 (Floppy: −90…+90), the precise level applied to prices.

**Universal price formula** (Items, offered Wages, offered Rents, enrollment fees):

```
Price = BasePrice + (BasePrice × Reading / 60)
```

→ effective range **50%–250%** of base. **Exceptions (never fluctuate):** Lottery
Tickets ($10/batch), Newspaper ($1), and Pawn Shop sale prices (fixed once listed).

- A player's **current** Wage and Rent do **not** move with the economy (only *offered*
  ones do). Exception: a Moderate/Major Crash can cut current Wage (see §6).
- **Stocks** trend toward the Index but fluctuate independently (own per-stock reading);
  range 50%–250% of base. T-Bills are fixed.

### Market Crash (Week #8+, Reading ≥ 80)

Trigger chance: `1 / (1 + 30 × NumPlayers)` (Floppy: `1 / (1 + 20 × NumPlayers)`).
Severity is equal-chance Minor/Moderate/Major:

| Severity | Price drop | Fired chance | Pay cut | Bank wipe | Happiness (turn player) |
|---|---|---|---|---|---|
| Minor | −5% | — | — | — | −1 (−1 more if >$1000 in stocks) |
| Moderate | −10% | 50% | survivors → Wage ×0.80 | — | −2 (−2 more) |
| Major | −15% | 100% | — | all Bank balances → $0 | −3 (−5 more) |

Index sharply declines too (so the effective drop is larger than the % shown).

### Economic Boom (Week #8+, Reading ≤ 120)

Trigger chance: `1 / (1 + 30 × NumPlayers)`. Single intensity. Index sharply rises;
all prices +10%. Turn player gets **+5 Happiness if >$1000 in stocks**.

---

## 6. Jobs & Working

10 workplaces, each offering 2–9 jobs. Apply at the **Employment Office** (4 Hours).
Three gates: **Experience**, **Dependibility**, **Degrees** (all must be met).

### Working

- Full session = **6 Hours**, pays **8 × current Wage** in Cash.
- If <6 Hours left: `Earnings = 8 × Wage × HoursRemaining / 6`.
- Requires owning the job's **Uniform** (or better) or "Work" does nothing.
- Fired on attempting to work if `Dependibility < RequiredDependibility − 5`
  (the **Minimum Dependibility**). 3–5 below = warning only.
- +1 Experience, +1 Dependibility per session (up to caps).
- Cash earnings risk robbery leaving Bank/Black's Market (deposit first).

### Hiring randomness — "No Openings" (luck)

Even when qualified, a random roll 1–100 vs a luck score can deny with "No Openings":

```
Luck = 30 + (10 + Dependibility + Experience + 8 × Degrees) / 3
```

If luck is the *only* failing factor, that job is "turned down" for the rest of the
turn (other jobs at the same location can still be tried). During Weeks 1–4 the "Poor
Work History" (dependibility) rejection is suppressed. **Cook at Monolith Burgers is
always approved** regardless of stats.

On approval: **+3 Happiness**. On any rejection: **−1 Happiness**.

### Raises (at Employment Office)

If your current job is currently *offered* at a higher wage than you make, you may ask
for a raise. Granted only if:

```
Dependibility ≥ RequiredDependibility + (5 × RaisesAlreadyReceivedAtThisJob)
```

Switching jobs resets the raise counter.

### Losing a job

(1) Dependibility falls below Minimum; or (2) Moderate (50%) / Major (100%) Crash.
Only penalty is Happiness loss; re-hiring is allowed.

### Unemployment

Career Goal progress is **0** while unemployed (even with high Dependibility). No
unemployment income. Take Cook as a fallback.

### Full Job table (Base Wage / Req. Exp / Req. Dep / Degrees / Uniform)

| Location | Job | Wage | Exp | Dep | Degrees | Uniform |
|---|---|---|---|---|---|---|
| Z-Mart | Clerk | $5 | 10 | 10 | — | Casual |
| Z-Mart | Assistant Manager | $7 | 20 | 20 | — | Dress |
| Z-Mart | Manager | $8 | 30 | 30 | Junior College | Business |
| Monolith Burgers | Cook ** | $5 | 0 | 10 | — | Casual |
| Monolith Burgers | Clerk | $6 | 10 | 20 | — | Casual |
| Monolith Burgers | Assistant Manager | $7 | 20 | 30 | — | Casual |
| Monolith Burgers | Manager | $8 | 30 | 40 | Junior College | Dress |
| QT Clothing | Janitor * | $6 | 10 | 20 | — | Casual |
| QT Clothing | Salesperson | $8 | 30 | 30 | — | Dress |
| QT Clothing | Assistant Manager | $9 | 40 | 40 | Junior College | Business |
| QT Clothing | Manager | $12 | 50 | 50 | Business Admin. | Business |
| Socket City | Clerk * | $6 | 10 | 20 | — | Casual |
| Socket City | Salesperson | $7 | 30 | 30 | — | Dress |
| Socket City | Electronics Repairman | $11 | 40 | 40 | Electronics | Casual |
| Socket City | Manager | $14 | 40 | 40 | Electronics + Junior College | Business |
| Hi-Tech U | Janitor | $5 | 10 | 10 | — | Casual |
| Hi-Tech U | Teacher | $11 | 40 | 50 | Academic | Dress |
| Hi-Tech U | Professor | $20 | 50 | 60 | Research | Dress |
| Factory | Janitor | $7 | 10 | 20 | — | Casual |
| Factory | Assembly Worker | $8 | 30 | 30 | Trade School | Casual |
| Factory | Secretary | $9 | 40 | 40 | Junior College | Dress |
| Factory | Machinist's Helper | $10 | 40 | 40 | Pre-Engineering | Casual |
| Factory | Executive Secretary | $18 | 50 | 50 | Business Admin. | Business |
| Factory | Machinist | $19 | 50 | 50 | Engineering | Casual |
| Factory | Department Manager | $22 | 60 | 60 | Junior College + Engineering | Business |
| Factory | Engineer | $23 | 60 | 60 | Junior College + Engineering | Business |
| Factory | General Manager | $25 | 70 | 70 | Business Admin. + Engineering | Business |
| Bank | Janitor | $6 | 10 | 20 | — | Casual |
| Bank | Teller | $10 | 40 | 40 | Junior College | Dress |
| Bank | Assistant Manager | $14 | 50 | 50 | Business Admin. | Business |
| Bank | Manager | $19 | 60 | 60 | Business Admin. | Business |
| Bank | Broker | $22 | 70 | 70 | Business Admin. + Academic | Business |
| Black's Market | Janitor | $6 | 10 | 10 | — | Casual |
| Black's Market | Checker | $8 | 20 | 20 | — | Casual |
| Black's Market | Butcher | $12 | 30 | 30 | Trade School | Casual |
| Black's Market | Assistant Manager | $15 | 40 | 40 | Junior College | Dress |
| Black's Market | Manager | $18 | 50 | 50 | Business Admin. | Business |
| Rent Office | Groundskeeper | $7 | 10 | 20 | — | Casual |
| Rent Office | Apartment Manager | $9 | 30 | 30 | Junior College | Casual |

`*` CD-ROM only. `**` always approved.

---

## 7. Education (Hi-Tech U & Degrees)

- **Enroll:** $50 base (economy-adjusted), 0 Hours. Buys the right to take 1 course;
  can stack enrollments. Up to **4 active courses** at once.
- **Study:** each lesson = 6 Hours. Default **10 lessons/Degree**, reduced by Extra
  Credit to a min of **8**. Graduate when lessons hit 0.
- **On graduating:** +1 Degree (permanent), +5 Dependibility (temporary), +5 to both
  Max caps (permanent).

### 11 Degrees (prerequisite chain)

| Degree | Requires (prereq) | Notably unlocks |
|---|---|---|
| Junior College | — (always available) | many mid jobs (Teller, Secretary, Managers…) |
| Trade School | — (always available) | Assembly Worker, Butcher |
| Business Administration | Junior College | Bank/Factory/Black's managers, Broker, Exec Sec, GM |
| Academic | Junior College | Teacher, Broker |
| Electronics | Trade School | Electronics Repairman, Socket City Manager |
| Pre-Engineering | Trade School | Machinist's Helper |
| Engineering | Pre-Engineering | Machinist, Engineer, Dept Manager, GM |
| Graduate School | Academic | (prereq only) |
| Post-Doctoral | Graduate School | (prereq only) |
| Research | Post-Doctoral | Professor |
| Publishing | Research | (none — completionist) |

Job applications missing a required Degree are always rejected ("Not enough
Education"). Degree count also reduces "No Openings" odds (see §6 luck formula).

---

## 8. Locations (board order, clockwise from top)

| Location | Type | Open | Key services / jobs |
|---|---|---|---|
| Low-Cost Housing | Apartment | If rented | Relax. Start home. Robbery risk. Base rent $325. |
| Pawn Shop | Service | Always | Pawn / Redeem / Buy durables. |
| Z-Mart | Store + Work | Always | 6 random discounted durables, used clothes, tickets, junk. Jobs. |
| Monolith Burgers | Store + Work | Always | Fast Food, Soft Drinks. Jobs. |
| QT Clothing | Store + Work | Always | New Clothes. Jobs. |
| Socket City | Store + Work | Always | Appliances (full price). Jobs. |
| Hi-Tech U | Service + Work | Always | Enroll / Study / Work. |
| Employment Office | Service | Always | Apply for Job / Raise. |
| Factory | Work | Always | Work only (9 jobs). |
| Bank | Service + Work | Always | Deposit/Withdraw, Loan, Stock Market. Robbery on exit. |
| Black's Market | Store + Work | Always | Fresh Food, Lottery Tickets, Newspaper. Robbery on exit. |
| Le Security Apartments | Apartment | If rented | Relax. No robbery. Base rent $475. |
| Rent Office | Service + Work | 4th Week only* | Pay Rent / Extension / Garnishment / switch apartment. |

`*` Rent Office also opens for extension-holders and for its own employees.

---

## 9. Money Systems

### Cash
Only spendable form. All earnings arrive as Cash. Lost entirely to Wild Willy street
robberies. Counts toward Liquid Assets.

### Bank Account
Deposit/withdraw in **$100** units, unlimited, **no fees, no interest**. 0 Hours.
Counts toward Liquid Assets. Safe from Wild Willy but **wiped to $0 by a Major Crash**.

### Loans (at Bank, 2 Hours to apply)

```
Liquidity  = CurrentWage + LiquidAssets / 1000
Risk       = 5                                   (if never borrowed / never defaulted)
Risk       = 5 + TimesDefaulted + CurrentLoanDebt/100 + (1 if CurrentDebt > 0)   (otherwise)
Approved if Liquidity > Risk and not currently in Default.
LoanSize   = 100 × (Liquidity − Risk)
```

Approval → +5 Happiness; rejection → −1 Happiness. Must be employed to qualify in
practice (wage drives Liquidity). **Payments:** $50 each ($45 to debt, $5 interest);
debt <$50 cleared with no interest. One payment/Month avoids **Default**; extra
payments push the deadline forward a Month. Loan debt counts **against** Liquid Assets.
Defaulting: −1 Happiness/Month, permanent Risk increase (TimesDefaulted never resets).

### Stock Market (via Bank → "See the Broker", 2 Hours)

6 stocks, buy/sell single units (free once menu is open). Prices 50%–250% of base,
volatile (independent per-stock reading). Counts toward Liquid Assets; **can't be
fully wiped by a Crash** (unlike Bank). Newspaper stock tips are bugged/non-functional.

| Stock | Base | Low | High | Notes |
|---|---|---|---|---|
| T-Bills | $100 | — | — | Fixed price; sells back at $97 (3% fee). Safe store of value. |
| Gold | $413 | $206 | $1032 | |
| Silver | $14 | $7 | $35 | |
| Pork Bellies | $20 | $10 | $50 | |
| Blue Chip | $49 | $24 | $122 | |
| Penny Stocks | $7 | $3 | $17 | High % swings; lots of clicking. |

### Lottery (tickets at Black's Market, $10/batch of 10, fixed price)

At start of next turn, if tickets owned: roll `R = rand(0..500)`. **Win if `R < tickets`**.
Prize: `R ≤ tickets/20` → **$5000**; else `R ≤ tickets/5` → **$500**; else **$200**.
All tickets removed afterward. (~1/501 win per ticket; ~1/10000 jackpot per ticket.)

### Pawn Shop

- **Pawn:** receive **40% of original purchase price** (economy-adjusted) in Cash;
  −1 Happiness. Only Durables. Shop holds max **6 items total**; one of each type.
- **Redeem** (within 3 Weeks, original pawner only): pay **50% of original purchase
  price** (not economy-adjusted) to get it back.
- **Buy:** after 3 Weeks unredeemed, item is listed for sale at **50% of original
  price** (fixed) — any player may buy it.

---

## 10. Rent & Housing

- Start: Low-Cost Housing, **$325**, paid through Month 1. First rent due **Week #4**,
  then every 4 Weeks.
- Current rent is **fixed** while you keep the apartment; only changes by switching.
  Offered rents fluctuate with economy (can be halved in a Crash). Bases: Low-Cost
  $325, Security $475.
- **Pay 1 Month:** clears the period and/or pays an advance (each advance = +4 Weeks;
  advances forfeited if you switch apartments).
- **Rent Extension** (ask the officer; once/turn): approval chance 100% / 75% / 50% /
  25% by number previously approved. Denied → −1 Happiness. **Once you ever enter Rent
  Debt, all future extension requests are auto-denied.**
- **Rent Debt** (missed payment, no extension): debt += one month's rent. Garnishment
  applies while debt > 0 (see §11). Never evicted.
- **Switching apartments:** only between the two types; costs a full month's rent on
  the new one; advances on the old are forfeited (debt carries over). "Double-switch"
  in one turn (out and back) can lower rent, best during a Crash.

---

## 11. Items

All purchase prices follow the economy formula (§5) unless noted. Buying the **first**
of a happiness-giving item type per turn gives the bonus; repeats usually do nothing.

### Garnishment (while in Rent Debt)
Each Work session: 50% of earnings → debt, **−$2 interest** to player, remaining 50%−$2
to Cash. If debt < 50% of earnings: only the debt amount is taken, no interest, rest paid.

### Food
- **Fast Food** (Monolith Burgers): any one prevents Starvation **next turn only**; all
  removed at start of next turn. First fast food/turn gives the listed Happiness.

  | Item | Base | Happiness (first/turn) |
  |---|---|---|
  | Fries | $65 | — |
  | Hamburgers | $79 | — |
  | Cheeseburger | $89 | +1 |
  | Astro Chicken | $124 | +2 |

- **Fresh Food** (Black's Market): 1 unit consumed/turn (prevents Starvation). Needs a
  **Refrigerator** (stores 6; +Freezer = 12) or it **Spoils**. Packs: 1wk $55 (+1 Hap),
  2wk $100 (+2), 4wk $190 (+4).

### Clothes (3 categories: Casual < Dress < Business; wear the best owned)
Each category decrements 1 Week/turn (even unworn). Start: 6 weeks Casual, 0/0. Need
the job's required Uniform (or higher) to Work. No clothes → can't work, appear naked,
may trigger Donation.

| Item | Store | Base | Lasts | Happiness/purchase |
|---|---|---|---|---|
| Casual Clothes | QT / Z-Mart | $73 / $35 | 11 / 9 wks | — |
| Dress Clothes | QT / Z-Mart | $125 / $90 | 13 / 9 wks | +1 (QT) / — |
| Business Suit | QT | $295 | 13 wks | +2 |

### Appliances / Durables (permanent; count toward Liquid Assets/Net Worth)
First-of-type purchase gives Happiness. Can break (see Repairs §12) — except books.
Bought at Socket City (full) or Z-Mart (used, cheaper, breaks more).

| Item | Socket City | Z-Mart | Effect | Happiness (1st) | Wild-Willy-proof? |
|---|---|---|---|---|---|
| Refrigerator | $876 | $650 | Store 6 Fresh Food | +1 | yes |
| Freezer | $513 | — | +Fridge → store 12 | +2 | yes |
| Stove | $570 | $490 | +1 Happiness/turn (not w/ Microwave) | +1 | yes |
| Microwave | $330 | $220 | +1 Happiness/turn (not w/ Stove) | +2/+1 | no |
| Color TV | $525 | $450 | (decor) | +2/+1 | no |
| VCR | $333 | $250 | (decor) | +2/+1 | no |
| Stereo | $412 | $450 | (decor) | +2/+1 | no |
| Black & White TV | — | $110 | (decor) | — | no |
| Hot Tub | $1255 | — | Relaxation never decays | +3 | yes |
| Computer | $1599 | — | +1 Extra Credit; 1/7 chance $20–$100/turn | +3 | yes |
| Encyclopedia | — | $475 | Books: all 3 → +1 Extra Credit | — (book) | yes |
| Dictionary | — | $70 | " | — | yes |
| Atlas | — | $55 | " | — | yes |

### Junk (effect on purchase, not kept)
Soft Drinks (Monolith): Colas $69 (+1), Shakes $102 (+2) — first/turn only. Newspaper
(Black's) $1 fixed, 1 Hour, shows headline. Z-Mart junk (Happiness penalty each buy):
Dog Food $18 (−1), 8-Track Player $75 (−1), Works of Capote $100 (−2).

### Tickets (Z-Mart; force a specific Medium-priced Weekend next turn)
Baseball $45, Theatre $30, Concert $40; all +2 Happiness on first purchase/turn.
Priority Baseball > Theatre > Concert.

---

## 12. Random / Conditional Events (detail)

- **Starvation:** not fed → +20 Hours lost, −2 Happiness, 25% Doctor chance.
- **Spoiled Food:** no Refrigerator → all Fresh Food lost, −2 Happiness, 50% Doctor,
  Starvation if no Fast Food bought. Over capacity → excess lost, −1 Happiness.
- **Doctor Visit:** triggers — Starvation 25% / Spoiled 50% / Relaxation==10 20% (each
  rolled separately, max one visit). Needs Cash >$0. Costs +10 Hours, −4 Happiness, and
  money: ≥$500 cash → $30–$200; $50–$499 → $30–$50; $31–$49 → $30–allCash; ≤$30 → allCash.
- **Wild Willy — street:** leaving Bank 1/31, Black's Market 1/51 (Week #4+, carrying
  Cash). Sets Cash to $0, −3 Happiness. (Deposit before leaving to avoid.)
- **Wild Willy — apartment:** Low-Cost + owns Durables. Chance `1/(Relaxation+1)`
  (~9% at 10, ~2% at 50). Each durable *type* 25% to be stolen (one roll per type).
  −4 Happiness if anything taken. Fridge/Freezer/Stove/Computer/Books never stolen.
- **Computer profits:** 1/7 chance, $20–$100, +3 Happiness.
- **Appliance Repair:** only if Cash >$500. Per appliance break chance: Socket City
  1/51, Z-Mart/Pawn 1/36. Repair cost = random 1/20…1/4 of price paid; −1 Happiness;
  only one unit per type/turn; pawned items can't break.
- **Donation:** (CD-ROM) no clothes 2+ turns, Cash <$300, Net Worth <$300 → receive
  cost-of-clothes-for-current-job (or $50 if unemployed) + random $1–$100.
- **Relax action:** +3 Relaxation (max 50), +2 Happiness first/turn, 6 Hours.

### Weekends
Each turn opens with a Weekend (text + a charged price). Selection priority:
1. **Tickets** (Baseball→Theatre→Concert): forces that Medium weekend; removes those tickets.
2. **Durables**: each owned durable type has 20% to trigger its Cheap themed weekend
   (can't repeat the previous player's durable weekend).
3. **Random**: pick 1 of 42 weekends (Floppy: 44). Can't repeat the previous player's.

Price ranges: **Cheap $5–$20**, **Medium $15–$55**, **Expensive $50–$100**. Until Week
#8 all non-cheap weekends are Medium (max $55); from #8 the top tier becomes Expensive.
Player never pays more Cash than they have (can drop to $0; $0 cash → free weekend).
*(Full weekend/headline text is preserved in the extracted wiki dump for flavor reuse.)*

---

## 13. Discrepancies with the Java Port (fidelity corrections)

These are cases where `dimidd/openjones` differs from the original; **follow this doc**:

1. **Number of Goals: 4, not 5.** Original Goals = Wealth, Happiness, Education, Career.
   The Java port adds a separate **Health** goal/measure that does not exist in the
   original. → `@jones/config` ships **4 goals**; Health is dropped (or left off by
   default behind a config flag if we ever want the port's variant).
2. **Turn budget = 60 Hours.** The port uses `TIMEUNITS_PER_WEEK=600` /
   `TIMEUNITS_PER_HOUR=5`. The original is **60 Hours/turn** with the action costs in
   §2. Use 60 Hours (or 600 tenths-of-an-hour internally, but action costs must match
   §2: Work 6, Enter 2, etc.).
3. **Career = 1.25 × Dependibility (capped 100), 0 if unemployed** — not the port's
   `career.score + wage` blend. Win goal target 100, not 850.
4. **Exact economy / wage / price model** = the Reading-based ±formula in §5, replacing
   the port's `ConstantEconomyModel`. Implement as the default `DynamicEconomy`;
   keep `ConstantEconomy` available for deterministic tests.
5. **Hidden vs visible stats, caps, and the "No Openings" luck formula** (§4, §6) are
   fully specified here and should be ported as-is into `@jones/core`.

All numeric tables above become the seed data for `@jones/config`.

---

## 14. Mapping to the build

- **`@jones/config`**: §3 goals, §6 job table, §7 degree graph, §8 location list, §9
  stock table + loan/lottery/pawn constants, §10 rent bases, §11 item tables, §5
  economy params, §2 action-hour costs. All as JSON.
- **`@jones/core`**: §2 turn sequence (ordered reducer steps), §4 stat math + caps, §5
  economy step, §6 work/hire/raise/fire, §7 study/graduate, §9–§12 money & events,
  §3 win check. Each is a pure function over `GameState` + config + seeded RNG.
- **`@jones/ai`**: planners reason over these same rules (e.g. greedy = raise the
  lowest of the 4 goal scores).
- **Audio/UI**: §12 events and §2 sequence emit the semantic events the audio manifest
  and HUD subscribe to.
