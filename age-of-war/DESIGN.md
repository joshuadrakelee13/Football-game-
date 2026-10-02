# Design notes

Written for whoever tunes this next.

## What it is

A recreation of Age of War (Louissi, 2007), aiming at the original's *feel*
rather than at a novel take on it. Five ages, sixteen units, fifteen turrets,
five specials, four turret slots, one lane. Improvements come after the
recreation, not instead of it.

It is a **snackable** game: one battle is ten to fourteen minutes and ends. The
core feeling is *pressure with a clock on it* — the front line is always moving
one way or the other, and every ten seconds you choose between something now and
something better later.

## Architecture

`src/core/`, `src/data/`, `src/model/` and `src/engine/` never touch the DOM.
That is not tidiness for its own sake — it is what lets the five harnesses in
`tools/` import the simulation and run hundreds of complete battles directly in
Node. **Balance here is measured, not guessed**, and every number in
`src/data/balance.js` came out of those harnesses.

`src/render/` reads the battle and never writes to it. `src/ui/` owns the DOM.
`src/main.js` is the only file that knows about all three.

The simulation runs on a **fixed 1/60s timestep, always**. Game speed multiplies
how many ticks happen per frame, never the size of a tick. The moment `dt`
varies, the browser and the harness stop producing the same battle from the same
seed and every measured number becomes a guess.

## The rule the whole game rests on

**Nothing overtakes the ally in front of it.** The lane is a queue. Get this
wrong and it is a different genre.

Two details do most of the work, and both were found by getting them wrong first:

- **Units are resolved front to back**, so each follower clamps against the
  leader's already-updated position on the same tick. Back to front, the column
  visibly breathes and re-collides every frame.

- **A unit's `standoff` is not its `range`.** How close it tries to get and how
  far it can hit are different numbers. With them equal, only the front rank of a
  column is ever within range — a line of twelve archers fires one arrow at a
  time, and a stack of club men cannot swarm anything. Melee units close to
  touching distance and swing far enough to cover two ranks behind them; ranged
  units stop about two ranks short of their maximum. Roughly three ranks fight at
  once, which is the swarm every Age of War guide is really describing.

Everything else follows from those two. Cheap walls work because a wall is always
there. Heavy units are worth their money because only about three units can reach
the front at once, so concentrated hit points beat spread ones. Ranged units want
a wall in front to shoot over, and are helpless without one.

## Six things the harnesses caught

None of these were visible by playing. All of them were visible within one run of
something that counted.

1. **A jammed column walked itself backwards off the map.** The ally-spacing
   limit sits behind where a unit already stands, so a blocked unit "moved" to
   it. Units never retreat now, and one will not leave the base doorway until the
   last one has cleared it.

2. **Gold income has to scale with what an age's units cost.** Left flat, the
   sustainable spawn rate collapses from the Renaissance on, the field empties,
   kills stop and no side ever reaches the Modern Age. The trickle is now set
   from `cost - goldValue` per age so the lane stays full in all five.

3. **The AI only fired its special defensively**, so two matched armies ground in
   midfield — where turrets cannot reach — until the clock ran out. It breaks its
   own stalls now. Mirror timeouts fell from 30% to 4%.

4. **The AI fired too many specials and finished an age behind.** Experience buys
   the next age *or* the special, and an AI that spends it on three small crowds
   has bought nothing. It lost nineteen battles in twenty to a scripted player
   until the crowd it demands got bigger.

5. **Two of the five ages had a strictly dominated unit** — a third of the roster
   that there was never a reason to buy. The Knight and the Musketeer were
   adjusted until every age forms a proper loop.

6. **Side 1 was winning 59% of mirror matches.** Both sides run identical code,
   so it had to be the tick: resolving one side and then the other let the second
   one aim at where the first had actually ended up. Both sides now read the field
   as it stood at the start of the tick. It was worth about nine percentage
   points, and nothing but a two-hundred-battle harness was ever going to find it.

## Where the numbers come from

`src/data/balance.js` marks every line. **`wiki`** means the community-documented
figure and is treated as fixed: all sixteen unit costs, all fifteen turret costs,
the 1,000 / 3,000 / 7,500 slot prices, the 150,000 Super Soldier and the Death
Ray. **`fitted`** means invented and then measured — every hit point, damage
number, range, speed, build time and bounty. Cost is the anchor; everything else
is fitted to it.

### The evolution thresholds

The sources looked like the one place they genuinely contradicted each other:
4,000, 14,000, 12,000, 20,000 and 45,000 all get quoted for the same four
evolutions. They reconcile if they are the four **incremental** costs rather than
running totals — and read that way they land within a few percent of the
experience income `tools/xp-curve.mjs` measures. So they are the wiki numbers
after all, and the harness agrees with them.

### Deliberate deviations

- **The passive gold trickle** is invented. The original never leaves you with an
  empty field and no way back, and without a floor the loser of the first
  engagement simply stops being able to play.
- **The Death Ray does 6,000 damage, not the documented 1,500.** Against a
  14,000hp War Machine, 7,000 experience for 1,500 damage is close to a non-event.
- **Cancelling a queued unit refunds in full.** The original had no cancel. A
  misclick costing a Tank is not tension.
- **Base health rescales proportionally on evolving** rather than refilling, so
  evolving is not a panic button.
- **A sudden-death valve**: if neither base has been touched for five minutes,
  both start chipping. It watches base damage rather than kills on purpose — a
  deadlocked battle is full of kills, that is what a deadlock is. It fires in
  about a fifth of mirror battles and is rarer in real ones.
- **Units carry a team colour.** Two Stone Age mobs are otherwise the same beige.
- **No audio**, for now.
- **All original art.** Louissi's is copyrighted, and none of it is used.

## The harnesses, and one band that was revised

Five, all in the house style: no test framework, fixed seeds, a printed table, a
`checks` array of `[label, pass, value]`, and a non-zero exit on failure.

`sim-test` proves the same seed gives the same battle and that the front-line
invariant holds on every tick of eight hundred thousand. `matchup-test` puts
equal gold against equal gold to prove no age has a dominant or a useless unit.
`balance-test` runs the AI against itself — identical profiles, so any asymmetry
in the result is a bug in the model rather than a difference in skill.
`difficulty-test` drives scripted players. `xp-curve` measures how long each age
actually lasts.

One band was revised honestly rather than met. "A competent player beats Normal"
started at 40–75%, set before the game existed; the real answer is about 80%.
Several attempts to close that gap by tuning the AI's patience, reaction time and
mistake rate moved it two or three points, because the gap is not carelessness —
the scripted players never misclick, never idle except on purpose, and evolve on
the exact frame they can afford to. Normal is the easy mode and is meant to be
won, so the band now says 55–90% and says why. The Impossible bands stayed
strict: brutal for a competent player, beatable by a good one.

## Interface

DOM over the canvas, not drawn into it. Buttons that can be focused, hovered,
disabled and read aloud are things the DOM does properly and a canvas
reimplements badly, and the original's HUD was static chrome anyway.

It updates sixty times a second, which is the one place the usual
rebuild-everything rule bends: the HUD rebuilds only when its *structure* changes
— a new age, a new slot, a different turret — and otherwise writes text and
widths into about fourteen cached nodes. Tearing it down every frame would throw
away focus and hover state sixty times a second.

The stage is a fixed 960×540 scaled to the window and letterboxed. That is how
the original played, and it matters for more than nostalgia: a battlefield that
grew with the browser window would mean different engagement distances and
different weapon ranges on every monitor.

## Art

There are no image files in this project. Every figure is a skeleton spec in
`src/data/figures.js` — proportions, a palette, a weapon, one accent — and
`src/render/figures-draw.js` turns any of them into a jointed, animated
character. A unit is twenty lines of numbers rather than a sprite sheet.

Three rules do most of the heavy lifting at thirty-odd pixels tall:

- **Everything is drawn twice**, once as a thick dark outline and once as the
  fill. That is where the cartoon weight comes from, and it costs one extra pass.
- **The walk cycle is driven by distance travelled, not by time.** Feet never
  skate: a unit that stops dead at the front line stops with its feet planted,
  and a unit at half speed takes half as many steps rather than the same steps
  more slowly.
- **One accent shape per unit** — a helmet, a hood, a tricorne, a visor — in a
  colour nothing else on it uses. That single shape is what makes a knight read
  as a knight.

Each army's clothing is pulled a third of the way towards its own colour, because
a chest ribbon alone is not enough to tell two Stone Age mobs apart in a melee.

## Known limitations, and where to go next

- **No audio.** The original's sound did a lot of work, and procedural WebAudio
  would cost nothing to ship.
- **The AI is one brain with two sets of multipliers.** It plays a coherent
  game and never cheats, but it does not bluff, bait a special, or hold units
  back for a push.
- **Impossible often runs to the time limit** rather than resolving. The player
  survives but cannot break through, and the battle is decided on base health.
- **The turret picker is a popover**, where the original let you see all of an
  age's turrets at once.
- **No save of a battle in progress.** Age of War is one sitting; only your
  settings, your record and the Impossible unlock persist.
- **The late game banks more gold than the build queue can spend.** Capped rather
  than solved: build times, not the wallet, are the real limit in the last two
  ages.
