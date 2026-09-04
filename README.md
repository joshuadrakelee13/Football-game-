# Football Club Tycoon

Take a club with two thousand seats and no money, and drag it all the way to the
Premier League.

You start as **Riverside FC**, a fictional club given a place in a real League Two
alongside the actual 92. Reputation 10. A thousand supporters. A hundred thousand
pounds to spend and ten thousand a week for wages — the smallest budget in the
division and the worst squad in it. Season one is a relegation scrap.

Everything above you is real: League Two, League One, the Championship and the
Premier League, plus the National League below to catch you if you fall. The FA Cup
and the Carabao Cup run alongside. Reach the top and the Champions League, Europa
League and Conference League are waiting. Every player is fictional and generated
fresh for your save.

## Playing it

You need [Node](https://nodejs.org) 18 or newer. Nothing else — no dependencies, no
build step, no accounts, no network.

```
npm start
```

Then open **http://127.0.0.1:5173**.

> Opening `index.html` straight off disk will not work: browsers refuse to load ES
> modules over `file://`. The one-line server above exists purely to get around that,
> and uses nothing but Node's own built-in modules.

Your progress saves to the browser automatically after every matchday. **Save & data**
in the bottom-left corner copies a save out or pastes one back in.

## The loop

Pick your team → play the match → collect gate money, prize money and reputation →
spend it on players, the ground, the training pitches or the academy → do it again,
one division higher.

Ten screens run the club:

| | |
|---|---|
| **Overview** | Who you play next, and the one button that matters |
| **Squad** | Your XI on the pitch, formation, contracts, morale, fitness |
| **Transfers** | The market, bids for your players, free agents |
| **Fixtures** | Results and what is coming |
| **League Table** | Any division in the pyramid |
| **Stadium** | 2,000 seats to 60,000, one expansion at a time |
| **Training** | Six focuses, and facilities that make them bite |
| **Youth Academy** | Prospects to promote, sell or release |
| **Finances** | Where every pound came from and went |
| **Club** | Objectives, honours and your season history |

## Matches

You do not control the match. You pick the side and the shape, and the engine plays
it out minute by minute. Four ways to get through a 46-game season:

- **Play match** — the full thing, with live commentary
- **Quick sim** — straight to the result
- **Sim ahead** — play out everyone else's games and stop when you are next in action
- **Auto-play** — hand the rest of the season over and jump to the review

The result turns on squad strength, your starting XI, formation, fitness, morale,
home advantage and a real amount of luck. Across a fifteen-point rating gap the
underdog still wins about one game in seven.

## Things worth knowing

- **Scouting.** A player's potential shows as a range — `63–85` — until you pay to
  scout him. Upgrade the scouting department and the range narrows, eventually to an
  exact number.
- **Contracts run down.** A player in his final year will leave for nothing. Renew him
  from the Squad screen before that happens.
- **Wages are the real constraint.** Signing a good player is easy. Paying him every
  week for three years while the stadium needs expanding is the actual decision.
- **Getting promoted changes everything.** The Championship-to-Premier-League jump is
  roughly a hundredfold increase in prize money. It is meant to feel like that.
- **Relegation out of League Two is not the end.** The National League is there, and so
  is the way back.

## Development

```
npm test              # everything below
npm run test:sim      # match engine outcome distribution
npm run test:season   # full-season integrity across the whole world
npm run test:balance  # how long the climb actually takes
```

The simulation in `src/engine/` and `src/model/` never touches the DOM, which is what
lets those harnesses run it directly in Node. Balance here is measured rather than
guessed — see `DESIGN.md` for what the numbers are and why.

```
src/core/      seeded RNG, formatting, event bus
src/data/      clubs, competitions, positions, names, commentary
src/model/     player, club, world, save
src/engine/    match, league, cups, europe, season, transfers, finance, events
src/ui/        shell, ten screens, match overlay, season review
styles/        design tokens, base, components, screens
tools/         dev server and the three test harnesses
```

## A note on names

This is an unofficial fan project, not affiliated with or endorsed by any club or
competition. Club and competition names belong to their respective owners and are used
here to describe the real football pyramid. No crests or logos are reproduced — clubs
are identified by name and by a bar in their kit colours. Every player in the game is
fictional and procedurally generated; any resemblance to a real footballer is chance.

Fonts (Archivo, IBM Plex Mono, Public Sans) are bundled under the SIL Open Font
License 1.1.
