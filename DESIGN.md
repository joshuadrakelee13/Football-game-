# Design notes

Why the game is built the way it is, what the numbers are, and how they were arrived
at. Written for whoever tunes this next.

## The shape of it

A **sticky** game: one run to the Premier League is a long session or several short
ones. The core feeling is the **clever optimiser** — you are not powerful, you are
resourceful. Every pound is a choice between a better striker, a bigger ground and a
training pitch that makes next year's kids better.

The loop, in one line:

> pick your team → play the match → collect gate, prize money and reputation → spend
> it on the squad or the club → repeat, one division higher

Progression is a real ladder rather than a number that goes up: National League →
League Two → League One → Championship → Premier League. Each rung has its own
economy, and the gaps between them are the point.

## Architecture

`src/engine/` and `src/model/` never touch the DOM. That is not tidiness for its own
sake — it is what lets the three harnesses in `tools/` import the simulation and run
thousands of matches and dozens of seasons directly in Node. Balance here is
**measured, not guessed**, and every number below came out of those harnesses.

The UI reads state and calls into the engine; it never computes results itself.

## The world

116 real clubs across five tiers, based on the 2025/26 season. One League Two club
steps aside to make room for the player's club.

Each club carries a **prestige** (1–100) which is the anchor for everything derived:
squad quality, transfer budget, wage ceiling, fan base and who it can recruit. Without
that anchor, twenty simulated seasons of drift would leave Accrington Stanley in the
Champions League.

Prestige maps to the rating a club's first-choice XI should average:

| Prestige | 10 | 30 | 50 | 70 | 90 | 96 |
|---|---|---|---|---|---|---|
| XI rating | 45 | 53 | 63 | 73 | 81 | 84 |

Which produces these divisions:

| Division | Clubs | Games | Squad ratings |
|---|---|---|---|
| Premier League | 20 | 38 | 65–82 |
| Championship | 24 | 46 | 57–67 |
| League One | 24 | 46 | 51–60 |
| League Two | 24 | 46 | 45–52 |
| National League | 24 | 46 | 41–47 |

Riverside starts at **44.5 — dead last in League Two, five points below the next
worst club.** That is deliberate. Season one is about survival.

## Players

Attributes come first; **Overall is derived from them** by a position-weighted blend,
never the other way round. That single decision is what produces the brief's "striker
with great finishing and no passing", and it means playing a poacher at centre-back
genuinely ruins him (`positionFit` in `src/data/positions.js`).

Each player also gets an archetype — Poacher, Target man, Ball-playing, Destroyer,
Deep-lying playmaker — which pushes his attributes into a recognisable shape.

Value and wage curves, fitted to real football:

```
value      = 5000 * 1.2364 ^ (overall - 40)    × age × potential × contract
weeklyWage = 1200 * 1.1576 ^ (overall - 52)
```

| Overall | Value | Wage/wk | Reads as |
|---|---|---|---|
| 48 | £26k | £670 | League Two squad filler |
| 60 | £395k | £3.7k | League One |
| 68 | £2.5M | £11k | Championship |
| 76 | £15.6M | £34k | Premier League |
| 85 | £70M | £150k | Premier League star |

## The match engine

Minute by minute over 90 plus stoppage. Every constant lives in `TUNING` at the top of
`src/engine/match.js`.

Shot volume responds to the ratio of your attack to their defence, raised to
`strengthExponent` (2.15). Each chance runs shot → on target → goal, with quality
shifting both gates. A per-match form roll (`formSd` 0.13) is the "any given Saturday"
factor that keeps upsets alive.

Measured across 4,800 matches per rating gap (`npm run test:sim`):

| Gap | Favourite | Draw | Underdog | Goals/game |
|---|---|---|---|---|
| 0 | 38.6% | 23.0% | 38.4% | 2.62 |
| 10 | 60.5% | 18.6% | 20.9% | 2.90 |
| 15 | 70.1% | 15.9% | 14.0% | 2.97 |
| 30 | 91.3% | 5.9% | 2.4% | 4.49 |

Home advantage is worth **0.31 goals**. That number is worth a story: the harness
first reported 0.24, but that reading was contaminated by squad-generation bias —
one side simply generated stronger. Re-running with the venue swapped across
*identical* squads showed the true figure was 0.15, and the coefficients were retuned
against the honest number. A measurement you have not controlled is not a measurement.

## The economy

Prize money reproduces the real cliff between divisions, because that cliff is the
whole emotional payload of the final promotion:

| Division | Winner's prize |
|---|---|
| National League | £0.4M |
| League Two | £1.3M |
| League One | £2.0M |
| Championship | £12M |
| **Premier League** | **£170M** |

A Championship winner and a Premier League club finishing 20th are separated by
roughly **8.6×**. Relegated Premier League clubs get parachute payments, which is why
they are usually favourites to bounce straight back.

Costs are deliberately heavy. Staff and operations add ~55% on top of the playing
budget, which is what keeps a small club's margins genuinely thin. Riverside's first
season nets about **£430k** — enough for one good player, or three squad ones, or
nothing at all if you would rather build a stand.

Two budgets bite independently, as the brief asked:

- **Transfer budget** — a board allowance, mostly drawn from projected turnover
- **Wage budget** — a weekly ceiling, ~50–60% of turnover depending on division

## Difficulty

`npm run test:balance` plays the club under a plain management policy — buy the best
upgrades you can afford, weigh potential as well as current ability, renew contracts
before they expire, shed wages after a relegation, invest spare cash in facilities —
and measures the climb.

Current results over six runs: **median arrival in the Premier League is season 6**,
about half the runs stall short entirely, and the first season averages a 22nd-place
finish out of 24. Failure is real; the climb is not automatic.

### Four things that harness caught

These were all invisible until something measured them, and each one made the game
quietly unwinnable:

1. **The board never raised the player's wage budget** from its founding £10k a week.
   Income could grow tenfold and the squad still could not improve.
2. **Morale never reset between seasons**, so one relegation became a permanent
   spiral down the pyramid.
3. **Transfer interest was judged on reputation alone.** Reputation grows far slower
   than the divisions do, so a freshly promoted club could not sign anyone good enough
   for the league it had just reached — every promotion was a trapdoor. Interest now
   follows the division as well, and reputation is what lets a big club reach *above*
   its division for a star.
4. **Transfer fees, not wages, were the binding constraint.** A promoted club could
   only spend a fifth of its wage budget before the fee budget ran dry, and finished
   bottom of every division it reached no matter how well it was run.

## Pacing

A 46-game season is a lot of clicking, so there are four ways through it: full match
with commentary, quick sim, sim-ahead-to-your-next-fixture, and auto-play the rest.
Without these the mid-game would be a grind, which is the most common reason players
abandon a game of this shape.

Something should always be about to happen. Random events fire roughly every two to
five matchdays, weighted, with **streak protection** so two bad ones never land in a
row. Every event offers a real choice rather than just announcing itself. Youth
prospects surface every six weeks or so; the transfer market rotates twice a season;
bids for your players arrive periodically.

The **objectives** list always names the next goal, from "stay in the Football League"
through to winning the Champions League and developing an 85-rated academy graduate.

## Interface

The direction is a **broadcast desk**: restrained, dense, tabular. The brief asked for
clean and smooth, so this is refined minimalism, not decoration.

- **Type.** Archivo (variable, using its width axis) for headings and scorelines —
  condensed uppercase is the native language of football graphics. Public Sans for
  body. IBM Plex Mono for every number. Self-hosted, 224 KB, no network needed.
- **Colour.** Essentially monochrome on a near-black green-cast ground. Exactly one UI
  accent (pitch green), gold reserved for money, red for danger. **The clubs supply
  the rest of the colour** — each is identified by a bar in its real kit colours,
  striped or hooped where the club is. Nine clubs play in black or near-black, which
  would vanish against this ground, so those lead with their second colour instead.
- **Craft.** Tabular figures everywhere, so the league table never jitters as it
  updates. Hairline borders rather than shadows, which on a dark ground just make mud.
  4px radii. Asymmetric two-column layouts rather than a grid of equal cards.
- **Motion.** One staggered entrance per screen, a counting balance, a commentary feed
  that plays back minute by minute. Short, ease-out, never springy. All of it behind
  `prefers-reduced-motion`.

## Saves

One `localStorage` slot, plus JSON export and import. A world holds nearly 3,000
players, which as plain objects ran to 3 MB and would have overrun what browsers
store. Encoding each player as a fixed-order array (`src/model/codec.js`) cuts that to
**1 MB**, verified to round-trip with no drift. The RNG stores its state directly, so
a reloaded save continues the exact same stream.

## Known limitations and where to go next

- **AI clubs are simple.** They buy toward their prestige level and no further, so the
  world stays plausible but nobody has a genuine transfer strategy.
- **No in-match management.** By design — the brief explicitly did not want it — but
  half-time changes would be the natural next feature.
- **Europe is streamlined**: a six-game league phase, top eight into two-legged
  knockouts. Authentic in shape, not in size.
- **The National League is the floor.** Relegation from it is not modelled.
- **Club finances are modelled, not accounted.** AI clubs write off surplus above a
  cap as "infrastructure reinvestment" rather than compounding it for decades.
