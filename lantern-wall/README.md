# Lantern Wall

An arcade platformer on a castle wall at night. Run the
battlements, ring the bells and rescue the queen from her tower.

Open `index.html` in a browser. There is no build step; the three scripts are plain
classic scripts, so it works straight off disk.

## How it plays

Laid out after the 1983 arcade game **Hunchback**, with its own art and characters.

- Sixteen fixed screens, none of which scroll: fifteen screens of castle wall, then the
  bell tower. Each wall screen ends in a belfry; touch the rope to ring the bell.
- The obstacles are Hunchback's: low fireballs and arrows to jump, high ones to stay
  under, coming from either side; breaches to jump; fire pits crossed on a swinging rope;
  and pikemen in gaps in the ramparts whose pikes thrust up on a rhythm.
- The **climbing knight** is the clock. On every screen he starts at the bottom left and
  climbs the wall face as the bonus drains. If he reaches the top, he comes after you
  along the walkway with his torch. Touching him, climbing or walking, costs a life.
- A bell rung before the knight reaches the top counts. **Five in a row** without losing
  a life pays the **super bonus** (10,000, then 20,000, then 30,000) and an **extra life**.
  A life lost, or a bell rung too late, breaks the run.
- In the bell tower, four bells hang on still ropes over a fire pit; grab each rope to
  ring its bell, then reach the queen's tower. The game then starts again, faster and with
  less time.
- If you die, you restart the screen from its left end.

Only the first two screens are documented exactly (one fireball from the right, then a
rope over a fire pit). Screens 3 to 15 are rebuilt from the original's documented
building blocks and progression, not from its exact layouts.

The HUD shows your run of bells top left and your progress through the round bottom left.

## Files

| | |
|---|---|
| `skin.js` | Everything visual: palette, sprite grids, scene colours, text |
| `levels.js` | The sixteen screens, time limits, bonus and bell rules |
| `game.js` | Engine: physics, the knight, scrolling, drawing, sound |

Testing hook in the browser console: `lanternWall.go(section, round)`.
