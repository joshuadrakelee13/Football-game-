# Lantern Wall

An arcade platformer on a castle wall at night. Run the
battlements, ring the bells and rescue the queen from her tower.

Open `index.html` in a browser. There is no build step; the three scripts are plain
classic scripts, so it works straight off disk.

## How it plays

- A round is eight **sections** of wall. Like Hunchback, each one is a single fixed
  screen: the screen is wide enough to show the whole wall, from where you start to
  the belfry or tower at the far end, so nothing scrolls.
- Seven sections end in a **belfry**. Touch the bell's rope to ring it and collect the
  bell. **Five bells in a row earn an extra life**. Die before the fifth and every bell
  collected so far is lost.
- The eighth section ends at the **queen's tower**. Reach it to rescue her and start the
  next, faster round.
- A **climbing knight** comes up the wall face out of the moat behind you, the way he
  does in Hunchback, climbs onto the walkway and comes after you. If he touches you, you lose a life. Jump over him and outrun
  him. He is about half your speed, and he has to climb down and around every breach.
- If you die, you restart from the start of the half of the wall you died on.

The HUD shows your bells top left and your progress through the whole round bottom
left: the walked stretch is filled in, with the bells along it and the tower at the end.

## Files

| | |
|---|---|
| `skin.js` | Everything visual: palette, sprite grids, scene colours, text |
| `levels.js` | Pieces of wall, the sections built from them, knight speeds, bonus and bell rules |
| `game.js` | Engine: physics, the knight, scrolling, drawing, sound |

Testing hook in the browser console: `lanternWall.go(section, round)`.
