// Pacing. How long each age lasts, what it earns, and whether the ladder can
// actually be climbed inside a battle.
//
// This is the harness that settles the evolution thresholds. The community
// sources quote 4000, 14000, 12000, 20000 and 45000 in various combinations;
// reading them as the four incremental costs is the only arrangement that both
// uses the documented numbers and matches the experience income measured here.

import { Rng } from '../src/core/rng.js';
import { AGES, TUNING, unitsOfAge } from '../src/data/balance.js';
import { createState } from '../src/model/state.js';
import { DT, step } from '../src/engine/step.js';
import { clock } from '../src/core/format.js';

const N = Number(process.env.N || 60);

const timeIn = [0, 0, 0, 0, 0];
const xpIn = [0, 0, 0, 0, 0];
const goldIn = [0, 0, 0, 0, 0];
const reachedAt = [[], [], [], [], []];
const goldLocked = [];
const lengths = [];

for (let run = 0; run < N; run++) {
  const seed = 4242 + run * 977;
  const rng = new Rng(seed);
  const state = createState({ seed, difficulty: 'normal' });
  state.emitEvents = false;
  state.sides[0].isAi = true;
  state.sides[0].profile = 'normal';

  let lastXp = 0;
  let lastGold = 0;
  let lockedFor = 0;
  let worstLock = 0;
  const you = state.sides[0];

  while (!state.over && state.tick < TUNING.maxMatchSeconds / DT) {
    step(state, DT, rng);
    const age = you.age;
    timeIn[age] += DT;
    xpIn[age] += state.stats.xpEarned[0] - lastXp;
    lastXp = state.stats.xpEarned[0];
    goldIn[age] += state.stats.goldEarned[0] - lastGold;
    lastGold = state.stats.goldEarned[0];

    // The passive trickle exists so you are never stuck unable to field anything.
    const cheapest = cheapestOf(age);
    if (you.gold < cheapest && you.queue.length === 0) {
      lockedFor += DT;
      if (lockedFor > worstLock) worstLock = lockedFor;
    } else {
      lockedFor = 0;
    }
  }

  goldLocked.push(worstLock);
  lengths.push(state.time);
  you.age;
  state.stats.evolvedAt[0].forEach((t, i) => reachedAt[i + 1].push(t));
}

function cheapestOf(age) {
  let best = Infinity;
  for (const u of unitsOfAge(age)) best = Math.min(best, u.cost);
  return best === Infinity ? 0 : best;
}

// ---------------------------------------------------------------------------

console.log(`\n  Age of War - pacing over ${N} battles\n`);
console.log(
  '  ' + 'age'.padEnd(18) + 'min/battle'.padStart(11) + 'xp/min'.padStart(10) +
  'gold/min'.padStart(10) + 'cost'.padStart(9) + 'min needed'.padStart(12) + 'median reached'.padStart(16) + '  hit rate',
);
console.log('  ' + '-'.repeat(88));

const perAgeMinutes = [];
for (let a = 0; a < AGES.length; a++) {
  const mins = timeIn[a] / 60;
  const perGame = mins / N;
  perAgeMinutes.push(perGame);
  const xpm = mins > 0.01 ? xpIn[a] / mins : 0;
  const gm = mins > 0.01 ? goldIn[a] / mins : 0;
  const need = AGES[a].evolveCost;
  const at = reachedAt[a].slice().sort((x, y) => x - y);
  const median = at.length ? clock(at[Math.floor(at.length / 2)]) : '-';
  const rate = a === 0 ? '100%' : `${Math.round((at.length / N) * 100)}%`;
  console.log(
    '  ' + AGES[a].name.padEnd(18) + perGame.toFixed(2).padStart(11) + Math.round(xpm).toString().padStart(10) +
    Math.round(gm).toString().padStart(10) + String(need ?? '-').padStart(9) +
    (need ? (need / xpm).toFixed(1) : '-').padStart(12) + median.padStart(16) + '     ' + rate,
  );
}

lengths.sort((a, b) => a - b);
const median = lengths[Math.floor(lengths.length / 2)];
const worstLock = Math.max(...goldLocked);
const reach = (a) => reachedAt[a].length / N;

console.log('');
console.log(`  median battle ${clock(median)}   p10 ${clock(lengths[Math.floor(N * 0.1)])}   p90 ${clock(lengths[Math.floor(N * 0.9)])}`);
console.log(`  longest stretch unable to afford anything: ${worstLock.toFixed(1)}s`);
console.log('');

const checks = [];
checks.push(['Castle Age reached in 80-200s', medianOf(reachedAt[1]) >= 80 && medianOf(reachedAt[1]) <= 200, clock(medianOf(reachedAt[1]))]);
checks.push(['Renaissance reached inside 8 min', medianOf(reachedAt[2]) > 0 && medianOf(reachedAt[2]) <= 480, clock(medianOf(reachedAt[2]))]);
checks.push(['Modern Age reached in >= 55% of battles', reach(3) >= 0.55, `${Math.round(reach(3) * 100)}%`]);
checks.push(['Future Age reached in >= 25% of battles', reach(4) >= 0.25, `${Math.round(reach(4) * 100)}%`]);
checks.push(['no age is a grind (each under 6 min)', perAgeMinutes.every((m) => m < 6), perAgeMinutes.map((m) => m.toFixed(1)).join('/')]);
checks.push(['never gold-locked for more than 12s', worstLock <= 12, `${worstLock.toFixed(1)}s`]);

report(checks);

function medianOf(arr) {
  if (!arr.length) return 0;
  const s = arr.slice().sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

function report(rows) {
  let failed = 0;
  for (const [label, ok, value] of rows) {
    if (!ok) failed++;
    console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${value}`);
  }
  console.log('');
  if (failed) {
    console.log(`  ${failed} check${failed === 1 ? '' : 's'} failed\n`);
    process.exit(1);
  }
  console.log('  Pacing looks right.\n');
}
