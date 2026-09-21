# Age of War

A recreation of the 2007 browser game by Louissi. One lane, two bases, five ages.

Send men down the lane. Kill theirs, take their gold and their experience, and
spend it on the next age before they spend it on you. Get to the Future Age with
a base still standing and you win.

## Playing it

You need [Node](https://nodejs.org) 18 or newer. Nothing else — no dependencies,
no build step, no accounts, no network.

```
npm start
```

Then open **http://127.0.0.1:5173**.

> Opening `index.html` straight off disk will not work: browsers refuse to load
> ES modules over `file://`. The one-line server exists purely to get around
> that, and uses nothing but Node's own built-in modules.
>
> The other game in this repository also defaults to port 5173. To run both,
> start one of them with `PORT=5174 npm start`.

## The loop

**Gold** buys units and turrets. Every kill pays some, and a trickle keeps you
from ever being completely stuck.

**Experience** buys two things that compete: the next age, and the special
attack. You cannot have both, and choosing between them is the whole game.

**Nothing overtakes the man in front.** The lane is a queue. Roughly the front
three ranks of a column can reach the enemy, which is why a wall of cheap units
works, why ranged units want a wall in front of them to shoot over, and why a
line that breaks is a line that loses.

**Turrets** sit on your base and only ever shoot what is walking at you. You
start with one slot; three more cost 1,000, 3,000 and 7,500. Selling gives half
back.

## The ages

| | Melee | Ranged | Heavy | Special |
|---|---|---|---|---|
| **Stone** | Club Man 15 | Slingshot Man 25 | Dino Rider 100 | Meteor Shower |
| **Castle** | Sword Man 50 | Archer 75 | Knight 500 | Arrow Storm |
| **Renaissance** | Dueler 200 | Musketeer 400 | Cannoneer 1,000 | Cannon Barrage |
| **Modern** | Melee Infantry 1,500 | Infantry 2,000 | Tank 7,000 | Airstrike |
| **Future** | God's Blade 5,000 | Blaster 6,000 | War Machine 20,000 | Death Ray |

Each age also has three turrets of its own, fifteen in all. And there is a
sixteenth unit — the **Super Soldier**, 150,000 gold, Future Age only. The enemy
cannot build one. That is rather the point of it.

Within every age the three units form a loop: the ranged unit beats the melee
unit in the open, the melee unit beats the heavy one at the same money, and the
heavy one beats the ranged one. There is no single right answer in any age.

## Controls

| | |
|---|---|
| `1` `2` `3` `4` | buy a unit (right-click a tile to cancel one, refunded in full) |
| `Q` `W` `E` `R` | turret slots — click an empty one to pick a turret, a full one to sell |
| `V` | evolve |
| `S` | special attack |
| `Space` | pause |
| `+` `-` | game speed, 1x to 3x |

## Difficulty

**Normal** is a fair fight and is meant to be won. **Impossible** unlocks after
your first win: the enemy opens an age ahead with a bank behind it and earns a
quarter more than you do for the rest of the battle. It is beatable, but not by
playing the same way.

## Development

```
npm start              # dev server
npm test               # all five harnesses
npm run test:sim       # determinism and rule invariants
npm run test:matchup   # unit against unit, gold for gold
npm run test:balance   # AI against AI, 200 battles
npm run test:difficulty# scripted players against both difficulties
npm run test:xp        # pacing: how long each age lasts
```

`src/engine/` and `src/model/` never touch the DOM, so those harnesses import the
simulation and run full battles in Node at about a thousand times real speed.
Every number in the game came out of them. See `DESIGN.md` for what they found.

## Layout

```
src/core/     seeded rng, maths, ids, number formatting
src/data/     balance.js — every number in the game — plus the figure specs
src/model/    battle state and the save layer
src/engine/   the simulation. No DOM anywhere in here.
src/render/   canvas: procedural figures, backdrops, effects
src/ui/       the interface, as DOM over the canvas
tools/        the dev server and five headless harnesses
```

## Credit, and what is and is not original here

Age of War was made by **Louissi** and released in October 2007. This is an
unofficial fan recreation, written from scratch.

None of the original's art or audio is used or reproduced. Every character,
turret, base and effect here is drawn from scratch in code — there are no image
files in this project at all — in a similar cartoon style but not traced from
anything. The unit and turret names and their gold costs come from the game and
from the community wikis that documented it; everything the sources do not
record has been invented and then measured into shape.
