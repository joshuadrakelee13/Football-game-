// Monte Carlo balance harness for the match engine.
//
// Balance is measured, not eyeballed. This runs thousands of matches at controlled
// rating gaps and checks the outcome distribution against real football.

import { Rng } from '../src/core/rng.js';
import { createClub, overallStrength, pickBestXI } from '../src/model/club.js';
import { simulateMatch } from '../src/engine/match.js';

const N = Number(process.env.N || 4000);

// A synthetic club at an exact rating, so gaps are precise rather than approximate.
function clubAt(rng, rating, id) {
  return createClub(rng, {
    id, name: id, short: id, abbr: id.slice(0, 3).toUpperCase(),
    stadium: id + ' Park', capacity: 20000, prestige: 50, tier: 1,
    colors: { primary: '#fff', secondary: '#000' }, pattern: 'solid',
  }, { ratingTarget: rating });
}

// Averaged over many independently generated squad pairs, so one unlucky squad
// generation cannot bias a whole row.
const SQUAD_PAIRS = 24;

function runSeries(gap, n) {
  const rng = new Rng(1234 + gap);
  let hw = 0, d = 0, aw = 0, hg = 0, ag = 0, shots = 0, onT = 0, reds = 0;
  let realisedGap = 0;
  const perPair = Math.max(1, Math.round(n / SQUAD_PAIRS));
  let played = 0;

  for (let pair = 0; pair < SQUAD_PAIRS; pair++) {
    const home = clubAt(rng, 65 + gap / 2, 'HOME');
    const away = clubAt(rng, 65 - gap / 2, 'AWAY');
    realisedGap += overallStrength(home) - overallStrength(away);

    for (let i = 0; i < perPair; i++) {
      // Reset condition each match so fatigue does not accumulate across the series.
      for (const c of [home, away]) for (const p of c.squad) { p.fitness = 95; p.morale = 70; p.form = 0; p.injuredFor = 0; }
      c_reset(home); c_reset(away);
      const m = simulateMatch(home, away, rng, { competition: 'LEAGUE' });
      if (m.homeGoals > m.awayGoals) hw++;
      else if (m.homeGoals === m.awayGoals) d++;
      else aw++;
      hg += m.homeGoals; ag += m.awayGoals;
      shots += m.stats.shots[0] + m.stats.shots[1];
      onT += m.stats.onTarget[0] + m.stats.onTarget[1];
      reds += m.stats.reds[0] + m.stats.reds[1];
      played++;
    }
  }
  return {
    gap,
    realisedGap: realisedGap / SQUAD_PAIRS,
    homeWin: (hw / played) * 100, draw: (d / played) * 100, awayWin: (aw / played) * 100,
    goalsPerGame: (hg + ag) / played,
    homeGoals: hg / played, awayGoals: ag / played,
    shotsPerGame: shots / played, onTargetPerGame: onT / played,
    redsPerGame: reds / played,
  };
}

// Injuries during a match must not persist into the next simulated fixture.
function c_reset(club) {
  club.lineup = pickBestXI(club);
}

const results = [0, 5, 10, 15, 20, 30].map((gap) => runSeries(gap, N));

console.log(`\nMatch engine balance  (${N} matches per row)\n`);
console.log('  gap  real   home%   draw%   away%   goals   H-A goals    shots   on tgt');
console.log('  ' + '-'.repeat(72));
for (const r of results) {
  console.log(
    `  ${String(r.gap).padStart(3)}  ${r.realisedGap.toFixed(1).padStart(4)}   ` +
    `${r.homeWin.toFixed(1).padStart(5)}   ${r.draw.toFixed(1).padStart(5)}   ${r.awayWin.toFixed(1).padStart(5)}   ` +
    `${r.goalsPerGame.toFixed(2).padStart(5)}   ${r.homeGoals.toFixed(2)}-${r.awayGoals.toFixed(2)}    ` +
    `${r.shotsPerGame.toFixed(1).padStart(5)}   ${r.onTargetPerGame.toFixed(1).padStart(5)}`
  );
}

// Assertions against real-football reference values.
const checks = [];
const even = results[0];
const big = results[3];   // 15-point gap
const huge = results[5];  // 30-point gap

checks.push(['goals per game in 2.4-3.2', even.goalsPerGame >= 2.4 && even.goalsPerGame <= 3.2, even.goalsPerGame.toFixed(2)]);
checks.push(['home win 40-50% at parity', even.homeWin >= 40 && even.homeWin <= 50, even.homeWin.toFixed(1) + '%']);
checks.push(['draws 20-30% at parity', even.draw >= 20 && even.draw <= 30, even.draw.toFixed(1) + '%']);
checks.push(['home advantage worth 0.2-0.5 goals', even.homeGoals - even.awayGoals >= 0.2 && even.homeGoals - even.awayGoals <= 0.5, (even.homeGoals - even.awayGoals).toFixed(2)]);
checks.push(['shots per game 20-30', even.shotsPerGame >= 20 && even.shotsPerGame <= 30, even.shotsPerGame.toFixed(1)]);
checks.push(['favourite wins 60-80% at 15-pt gap', big.homeWin >= 60 && big.homeWin <= 80, big.homeWin.toFixed(1) + '%']);
checks.push(['underdog still wins >=10% at 15-pt gap', big.awayWin >= 10, big.awayWin.toFixed(1) + '%']);
// A 30-point gap is a Premier League side against a non-league club: a genuine
// mismatch where real giant-killings sit at a couple of percent, not ten.
checks.push(['underdog still wins >=2% at 30-pt gap', huge.awayWin >= 2, huge.awayWin.toFixed(1) + '%']);
checks.push(['red cards rare (<0.25/game)', even.redsPerGame < 0.25, even.redsPerGame.toFixed(3)]);

console.log('');
let failed = 0;
for (const [label, ok, value] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(42)} ${value}`);
}
console.log('');
if (failed) {
  console.log(`  ${failed} check(s) failed\n`);
  process.exit(1);
}
console.log('  All match-engine checks passed\n');
