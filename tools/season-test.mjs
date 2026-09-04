// Full-season integrity harness.
//
// Simulates whole seasons of the entire world and asserts that the league tables,
// promotion and relegation, cups and finances all stay internally consistent.

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import { advanceMatchday, endSeason, nextSeason } from '../src/engine/season.js';
import { standings, goalDifference } from '../src/engine/league.js';
import { DIVISIONS } from '../src/data/competitions.js';
import { squadRating } from '../src/model/club.js';

const SEASONS = Number(process.env.SEASONS || 5);
const failures = [];
const check = (label, ok, detail = '') => {
  if (!ok) failures.push(`${label}${detail ? ' — ' + detail : ''}`);
  return ok;
};

const rng = new Rng(20260904);
const world = buildWorld({ seed: 20260904 });
const nameOf = (id) => world.clubs[id]?.name || id;

console.log(`\nFull-season integrity  (${SEASONS} seasons, ${Object.keys(world.clubs).length} clubs)\n`);

const t0 = Date.now();

for (let season = 1; season <= SEASONS; season++) {
  let guard = 0;
  while (world.matchdayIndex < world.calendar.length && guard++ < 200) {
    advanceMatchday(world, rng);
  }

  // --- League table integrity -------------------------------------------------
  for (const div of DIVISIONS) {
    const table = standings(world.tables[div.tier], nameOf);
    const expectedGames = (div.clubs - 1) * 2;

    const wrongPlayed = table.filter((r) => r.played !== expectedGames);
    check(`T${div.tier} every club played ${expectedGames}`, wrongPlayed.length === 0,
      wrongPlayed.length ? `${wrongPlayed.length} clubs off, e.g. ${nameOf(wrongPlayed[0].clubId)} on ${wrongPlayed[0].played}` : '');

    const totalFor = table.reduce((s, r) => s + r.goalsFor, 0);
    const totalAgainst = table.reduce((s, r) => s + r.goalsAgainst, 0);
    check(`T${div.tier} goals for equals goals against`, totalFor === totalAgainst, `${totalFor} vs ${totalAgainst}`);

    const badPoints = table.filter((r) => r.points !== r.won * 3 + r.drawn);
    check(`T${div.tier} points match results`, badPoints.length === 0);

    const badRecord = table.filter((r) => r.won + r.drawn + r.lost !== r.played);
    check(`T${div.tier} W/D/L sums to played`, badRecord.length === 0);

    const sorted = table.every((r, i) => i === 0 || table[i - 1].points > r.points ||
      (table[i - 1].points === r.points && goalDifference(table[i - 1]) >= goalDifference(r)));
    check(`T${div.tier} table correctly sorted`, sorted);

    const goalsPerGame = totalFor / (expectedGames * div.clubs / 2);
    check(`T${div.tier} goals per game realistic`, goalsPerGame > 2.0 && goalsPerGame < 3.6, goalsPerGame.toFixed(2));

    if (season === 1) {
      const champ = table[0];
      console.log(`  T${div.tier} ${div.name.padEnd(16)} champions ${nameOf(champ.clubId).padEnd(24)} ${String(champ.points).padStart(3)} pts   ${goalsPerGame.toFixed(2)} goals/game`);
    }
  }

  // --- Cups -------------------------------------------------------------------
  for (const key of ['FA', 'EFL']) {
    const cup = world.cups[key];
    check(`${key} Cup completed`, !!cup && cup.complete && !!cup.winner);
  }

  const summary = endSeason(world, rng);

  // --- Promotion and relegation ----------------------------------------------
  for (const div of DIVISIONS) {
    const up = summary.promoted.filter((p) => p.from === div.tier).length;
    const down = summary.relegated.filter((p) => p.from === div.tier).length;
    const expectedUp = div.tier === 0 ? 0 : div.autoPromoted + (div.playoffPlaces.length ? 1 : 0);
    check(`T${div.tier} promoted count`, up === expectedUp, `${up} vs ${expectedUp}`);
    check(`T${div.tier} relegated count`, down === div.relegated, `${down} vs ${div.relegated}`);
  }

  // Division sizes must survive the churn.
  for (const div of DIVISIONS) {
    const size = world.divisions[div.tier].length;
    check(`T${div.tier} still has ${div.clubs} clubs after movement`, size === div.clubs, `has ${size}`);
  }

  // --- Sanity on values -------------------------------------------------------
  const nanClubs = Object.values(world.clubs).filter((c) =>
    !Number.isFinite(c.balance) || !Number.isFinite(c.reputation) || !Number.isFinite(c.fans));
  check('no NaN in club finances', nanClubs.length === 0, nanClubs.length ? nanClubs[0].name : '');

  const nanPlayers = Object.values(world.clubs).flatMap((c) => c.squad)
    .filter((p) => !Number.isFinite(p.overall) || !Number.isFinite(p.value) || !Number.isFinite(p.wage));
  check('no NaN in player ratings', nanPlayers.length === 0);

  const tinySquads = Object.values(world.clubs).filter((c) => c.squad.length < 16);
  check('no squad below 16 players', tinySquads.length === 0, tinySquads.length ? `${tinySquads.length} clubs, e.g. ${tinySquads[0].name} (${tinySquads[0].squad.length})` : '');

  const you = playerClub(world);
  const p = summary.player;
  console.log(
    `  season ${season}: ${you.name} finished ${p.position} in T${p.tier}` +
    `${p.promoted ? ' — PROMOTED' : p.relegated ? ' — RELEGATED' : ''}` +
    `   XI ${squadRating(you).toFixed(1)}   bal £${(you.balance / 1e6).toFixed(2)}M   rep ${p.reputation}   fans ${you.fans.toLocaleString('en-GB')}`
  );

  if (season < SEASONS) nextSeason(world, rng);
}

const elapsed = Date.now() - t0;
console.log(`\n  ${SEASONS} seasons simulated in ${(elapsed / 1000).toFixed(1)}s (${(elapsed / SEASONS / 1000).toFixed(2)}s per season)\n`);

if (failures.length) {
  const unique = [...new Set(failures)];
  console.log(`  ${unique.length} distinct failure(s):`);
  for (const f of unique.slice(0, 25)) console.log(`  FAIL  ${f}`);
  console.log('');
  process.exit(1);
}
console.log('  All season-integrity checks passed\n');
