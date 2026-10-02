// AI against AI, both sides running the same brain.
//
// Because the profiles are identical, any asymmetry in the results is a bug in
// the model rather than a difference in skill - a rule that quietly favours the
// side marching left to right shows up here and nowhere else.

import { runGame } from '../src/engine/simulate.js';
import { clock } from '../src/core/format.js';
import { AGES } from '../src/data/balance.js';

const N = Number(process.env.N || 200);
const DIFFICULTY = process.env.DIFFICULTY || 'normal';

const wins = [0, 0];
const lengths = [];
const reached = [0, 0, 0, 0, 0];
const peakBank = [0, 0];
let timeouts = 0;
let stalemates = 0;
let leadChanges = 0;
let gamesWithLeadChange = 0;
let spawned = 0;

for (let run = 0; run < N; run++) {
  const seed = 1234 + run * 7919;
  let lastLeader = null;
  let changes = 0;

  const r = runGame({
    seed,
    difficulty: DIFFICULTY,
    onTick: (s) => {
      if (s.tick % 60 !== 0) return;
      // Who is winning is where the front line is, not whose base is healthier:
      // in this game the bases stay untouched until somebody actually breaks
      // through, so base health barely moves until the battle is already over.
      const f0 = s.sides[0].units[0];
      const f1 = s.sides[1].units[0];
      const mid = (s.sides[0].base.frontX + s.sides[1].base.frontX) / 2;
      const line = f0 && f1 ? (f0.x + f1.x) / 2 : f0 ? f0.x : f1 ? f1.x : mid;
      const leader = Math.abs(line - mid) < 40 ? lastLeader : (line > mid ? 0 : 1);
      if (lastLeader !== null && leader !== null && leader !== lastLeader) changes++;
      lastLeader = leader;
      for (let i = 0; i < 2; i++) peakBank[i] = Math.max(peakBank[i], s.sides[i].gold);
    },
  });

  const s = r.state;
  if (r.winner !== null) wins[r.winner]++;
  if (r.reason === 'timeout') timeouts++;
  if (s.stalemateChipped) stalemates++;
  lengths.push(s.time);
  reached[Math.max(s.sides[0].age, s.sides[1].age)]++;
  spawned += s.stats.spawned[0] + s.stats.spawned[1];
  leadChanges += changes;
  if (changes >= 1) gamesWithLeadChange++;
}

lengths.sort((a, b) => a - b);
const at = (p) => lengths[Math.min(lengths.length - 1, Math.floor(lengths.length * p))];
const winRate = wins[0] / N;
const leadRate = gamesWithLeadChange / N;
const totalMinutes = lengths.reduce((a, b) => a + b, 0) / 60;

console.log(`\n  Age of War - ${N} battles, ${DIFFICULTY} against ${DIFFICULTY}\n`);
console.log(`  win split          ${wins[0]} / ${wins[1]}   (${(winRate * 100).toFixed(1)}% to the left-hand side)`);
console.log(`  battle length      p10 ${clock(at(0.1))}   median ${clock(at(0.5))}   p90 ${clock(at(0.9))}`);
console.log(`  timeouts           ${timeouts} (${((timeouts / N) * 100).toFixed(1)}%)`);
console.log(`  stalemate valve    ${stalemates} (${((stalemates / N) * 100).toFixed(1)}%)`);
console.log(`  front-line swings  ${(leadChanges / N).toFixed(1)} per battle, ${(leadRate * 100).toFixed(0)}% of battles had one`);
console.log(`  units spawned      ${(spawned / totalMinutes).toFixed(1)} per minute across both sides`);
console.log('');
console.log('  highest age reached');
for (let a = 0; a < AGES.length; a++) {
  const n = reached[a];
  const bar = '#'.repeat(Math.round((n / N) * 40));
  console.log(`    ${AGES[a].name.padEnd(18)} ${String(n).padStart(4)}  ${bar}`);
}
console.log('');

const checks = [];
checks.push(['mirror win rate within 43-57%', winRate >= 0.43 && winRate <= 0.57, `${(winRate * 100).toFixed(1)}%`]);
checks.push(['median battle 6-16 min', at(0.5) >= 360 && at(0.5) <= 960, clock(at(0.5))]);
checks.push(['p90 battle under 22 min', at(0.9) <= 1320, clock(at(0.9))]);
checks.push(['timeouts under 8%', timeouts / N < 0.08, `${((timeouts / N) * 100).toFixed(1)}%`]);
// Two identical brains deadlock in midfield far more readily than a human does,
// so the valve earns its keep more often here than in a real battle.
checks.push(['stalemate valve under 35%', stalemates / N < 0.35, `${((stalemates / N) * 100).toFixed(1)}%`]);
checks.push(['the front line swings in >= 35% of battles', leadRate >= 0.35, `${(leadRate * 100).toFixed(0)}%`]);
checks.push(['Modern Age or better in >= 50%', (reached[3] + reached[4]) / N >= 0.5, `${(((reached[3] + reached[4]) / N) * 100).toFixed(0)}%`]);

let failed = 0;
for (const [label, ok, value] of checks) {
  if (!ok) failed++;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(40)} ${value}`);
}
console.log('');
if (failed) {
  console.log(`  ${failed} check${failed === 1 ? '' : 's'} failed\n`);
  process.exit(1);
}
console.log('  Balanced.\n');
