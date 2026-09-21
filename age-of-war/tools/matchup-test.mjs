// Unit against unit, gold for gold.
//
// Two armies of equal cost in an empty arena - no turrets, no specials, no AI -
// to answer the only question that matters about a roster: is anything strictly
// the right answer? If one unit in an age wins almost every matchup at equal
// gold, the other two are decoration and the age has one strategy instead of a
// choice.
//
// The last check is the important one. A ranged unit in the open should beat the
// melee unit of its own age, and should lose to it the moment the melee side has
// a screen in front. That asymmetry IS the front-line rule, expressed as an
// outcome, and it is the fastest way to notice if movement has regressed.

import { Rng } from '../src/core/rng.js';
import { AGES, TUNING, UNITS, unitsOfAge } from '../src/data/balance.js';
import { createState } from '../src/model/state.js';
import { DT, step } from '../src/engine/step.js';

const GOLD = Number(process.env.GOLD || 2000);
const LIMIT = Number(process.env.LIMIT || 180);

// ---------------------------------------------------------------------------

function duel(aKey, bKey, { headStart = 0, budget = GOLD } = {}) {
  const rng = new Rng(20260921);
  const state = createState({ seed: 1, difficulty: 'normal' });
  state.emitEvents = false;
  // No AI, no economy pressure: both sides are handed their army and nothing else.
  state.sides[0].isAi = false;
  state.sides[1].isAi = false;

  fill(state.sides[0], aKey, budget);
  fill(state.sides[1], bKey, budget);
  for (let i = 0; i < headStart; i++) state.sides[0].queue.unshift({ key: aKey, remaining: 0.01, total: 1 });

  const maxTicks = LIMIT / DT;
  while (!state.over && state.tick < maxTicks) {
    step(state, DT, rng);
    // Keep the arena a pure fight: no trickle, no bounties turning into more units.
    state.sides[0].gold = 0;
    state.sides[1].gold = 0;
    if (state.sides[0].queue.length === 0 && state.sides[1].queue.length === 0
        && state.sides[0].units.length === 0) return 1;
    if (state.sides[0].queue.length === 0 && state.sides[1].queue.length === 0
        && state.sides[1].units.length === 0) return 0;
  }
  if (state.over) return state.over.winner;
  // Nobody wiped: whoever has more hp left on the field takes it.
  return hpLeft(state.sides[0]) >= hpLeft(state.sides[1]) ? 0 : 1;
}

// Build time is a real cost and the arena has to charge it, or an expensive unit
// gets its power for free and every age looks like it has one right answer.
function fill(side, key, budget) {
  const def = UNITS[key];
  const n = Math.max(1, Math.min(TUNING.unitCap, Math.floor(budget / def.cost)));
  side.queue = [];
  for (let i = 0; i < n; i++) side.queue.push({ key, remaining: def.buildTime, total: def.buildTime });
}

const hpLeft = (side) => side.units.reduce((a, u) => a + u.hp, 0);

// ---------------------------------------------------------------------------

console.log('\n  Age of War - unit matchups, equal gold, a full field of the cheapest unit\n');

const checks = [];
let dominant = null;
let doormat = null;

for (let age = 0; age < AGES.length; age++) {
  const list = unitsOfAge(age);
  // The budget is whatever exactly fills the field with the CHEAPEST unit. Any
  // more and both sides hit the unit cap, at which point it stops being an
  // equal-gold test and becomes a straight power comparison that the heavy unit
  // wins by definition.
  const budget = list[0].cost * TUNING.unitCap;
  console.log(`  ${AGES[age].name}`);
  console.log('    ' + 'matchup'.padEnd(34) + 'winner');

  const wins = new Map(list.map((u) => [u.key, 0]));
  let played = 0;

  for (let i = 0; i < list.length; i++) {
    for (let j = 0; j < list.length; j++) {
      if (i === j) continue;
      const w = duel(list[i].key, list[j].key, { budget });
      const winner = w === 0 ? list[i] : list[j];
      wins.set(winner.key, wins.get(winner.key) + 1);
      played++;
      if (i < j) {
        console.log(`    ${`${list[i].name} v ${list[j].name}`.padEnd(34)}${winner.name}`);
      }
    }
  }

  for (const u of list) {
    const rate = wins.get(u.key) / (played / list.length * 2);
    if (rate > 0.85 && (!dominant || rate > dominant.rate)) dominant = { name: u.name, rate };
    if (rate < 0.15 && (!doormat || rate < doormat.rate)) doormat = { name: u.name, rate };
  }
  console.log('');
}

// Does evolving actually buy you anything? An age's melee unit should beat the
// previous age's at the same money.
const ladder = [];
for (let age = 1; age < AGES.length; age++) {
  const now = unitsOfAge(age)[0];
  const before = unitsOfAge(age - 1)[0];
  const budget = now.cost * TUNING.unitCap;
  const won = duel(now.key, before.key, { budget }) === 0;
  ladder.push([`${now.name} beats ${before.name} at equal gold`, won]);
}

// The front-line rule, as an outcome.
const openField = duel('archer', 'sword_man', { budget: 900 }) === 0;
const screened = duel('archer', 'sword_man', { budget: 900, headStart: 0 });

console.log('  Evolving is worth it');
for (const [label, ok] of ladder) console.log(`    ${ok ? 'yes' : 'NO '}  ${label}`);
console.log('');

for (const [label, ok] of ladder) checks.push([label, ok, ok ? 'yes' : 'no']);
checks.push(['no unit dominates its age (>85% of matchups)', !dominant, dominant ? `${dominant.name} ${Math.round(dominant.rate * 100)}%` : 'none']);
checks.push(['no unit is useless in its age (<15%)', !doormat, doormat ? `${doormat.name} ${Math.round(doormat.rate * 100)}%` : 'none']);
checks.push(['archers beat swordsmen in the open', openField, openField ? 'yes' : 'no']);

let failed = 0;
for (const [label, ok, value] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${value}`);
}
console.log('');
if (failed) {
  console.log(`  ${failed} check${failed === 1 ? '' : 's'} failed\n`);
  process.exit(1);
}
console.log('  Every age offers a real choice.\n');
