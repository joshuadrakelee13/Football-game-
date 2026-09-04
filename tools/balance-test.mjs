// Difficulty harness: does the climb take about as long as it is supposed to?
//
// Plays the player's club under a deliberately plain policy — buy the best upgrades
// you can afford, keep the wage bill under control, invest in facilities when there is
// spare cash — and measures how many seasons it takes to reach the Premier League.
// The target set out for this build is a steady climb of roughly eight seasons.

import { Rng } from '../src/core/rng.js';
import { buildWorld, playerClub } from '../src/model/world.js';
import { advanceMatchday, endSeason, nextSeason } from '../src/engine/season.js';
import {
  generateTransferMarket, canSign, signPlayer, sellPlayer,
  processExpiringContracts, runAiTransferWindow, renewalDemand, renewContract,
} from '../src/engine/transfers.js';
import { applyTraining, nextFacilityUpgrade } from '../src/engine/training.js';
import { setTransferBudget, setWageBudget, transferBudget, recordLedger, weeklyRunningCost } from '../src/engine/finance.js';
import { nextTier } from '../src/engine/stadium.js';
import { squadRating, weeklyWages, pickBestXI } from '../src/model/club.js';
import { DIVISION_BY_TIER } from '../src/data/competitions.js';

const RUNS = Number(process.env.RUNS || 6);
const MAX_SEASONS = Number(process.env.MAX_SEASONS || 14);

// A plain, sensible manager. Nothing clever — if this cannot climb, the game is
// too hard; if it romps up in three seasons, the game is too easy.
// Renew anyone worth keeping whose deal is running down.
function renewSquad(world) {
  const you = playerClub(world);
  for (const p of [...you.squad]) {
    if (p.contractYears > 1) continue;
    if (p.overall < squadRating(you) - 6) continue;
    const demand = renewalDemand(p);
    renewContract(you, p.id, demand.wage, demand.years);
  }
}

function manageSummer(world, rng) {
  const you = playerClub(world);

  // Sell the deadwood to make room and raise a little cash. Crucially, keep selling
  // while the wage bill is over budget — after a relegation the budget falls below
  // what the existing squad costs, and a manager who does not shed wages first can
  // never sign anybody again.
  const surplus = [...you.squad].sort((a, b) => a.overall - b.overall);
  while (surplus.length && you.squad.length > 18
         && (you.squad.length > 22 || weeklyWages(you) > you.wageBudget * 0.92)) {
    const player = surplus.shift();
    if (!player) break;
    if (player.potential > player.overall + 10 && you.squad.length <= 22) continue;
    sellPlayer(world, you, player.id, Math.round(player.value * 0.85));
  }

  // Buy the best upgrades the budget and wage room allow. Value potential as well as
  // current ability: a 22-year-old two points worse today but ten better eventually is
  // the better buy, and developing him is the loop the game is built around.
  const worth = (p) => p.overall + Math.max(0, p.potential - p.overall) * (p.age <= 23 ? 0.55 : 0.15);

  for (let window = 0; window < 2; window++) {
    world.transferMarket = generateTransferMarket(world, rng);
    const targets = [...world.transferMarket].sort((a, b) => worth(b) - worth(a));
    for (const target of targets) {
      if (you.squad.length >= 26) break;
      const weakest = [...you.squad].sort((a, b) => worth(a) - worth(b))[0];
      if (!weakest || worth(target) <= worth(weakest) + 1) continue;
      if (!canSign(world, you, target).ok) continue;
      const before = you.squad.length;
      signPlayer(world, you, target, rng);
      if (you.squad.length > before && you.squad.length > 22) {
        sellPlayer(world, you, weakest.id, Math.round(weakest.value * 0.85));
      }
    }
  }

  // Invest spare cash in the club: facilities first, then the ground.
  const runway = weeklyRunningCost(you).total * 30;
  for (const kind of ['training', 'youth', 'scouting']) {
    const next = nextFacilityUpgrade(kind, you.facilities[kind]);
    if (next && you.balance - next.cost > runway) {
      recordLedger(you, world.seasonNumber, 'facilities', next.name, -next.cost);
      you.facilities[kind] = next.level;
    }
  }
  const ground = nextTier(you.stadiumCapacity);
  // Only expand once the ground is actually filling up.
  if (ground && you.fans > you.stadiumCapacity * 0.85 && you.balance - ground.cost > runway) {
    recordLedger(you, world.seasonNumber, 'stadium', 'Expansion', -ground.cost);
    you.stadiumCapacity = ground.capacity;
  }

  you.trainingFocus = you.tier >= 3 ? 'youth' : 'balanced';
  you.lineup = pickBestXI(you);
}

function playSeason(world, rng) {
  let guard = 0;
  while (world.matchdayIndex < world.calendar.length && guard++ < 200) {
    advanceMatchday(world, rng);
    applyTraining(playerClub(world), 1, rng);
  }
  return endSeason(world, rng);
}

console.log(`\nDifficulty: how long does the climb take?  (${RUNS} runs, up to ${MAX_SEASONS} seasons each)\n`);

const arrivals = [];
const firstSeasonPositions = [];
const allRuns = [];

for (let run = 0; run < RUNS; run++) {
  const seed = 4242 + run * 977;
  const rng = new Rng(seed);
  const world = buildWorld({ seed });
  const path = [];
  let reachedPl = null;

  for (let season = 1; season <= MAX_SEASONS; season++) {
    const summary = playSeason(world, rng);
    const p = summary.player;
    path.push(`${DIVISION_BY_TIER[p.tier].id}${p.position}${p.promoted ? '↑' : p.relegated ? '↓' : ''}`);
    if (season === 1) firstSeasonPositions.push(p.position);
    if (p.newTier === 0 && reachedPl === null) { reachedPl = season; break; }

    // Renew before the deadline: a manager who waits until contracts have already
    // expired has lost the player for nothing.
    renewSquad(world);
    processExpiringContracts(world, rng);
    runAiTransferWindow(world, rng);
    setTransferBudget(playerClub(world));
    setWageBudget(playerClub(world));
    nextSeason(world, rng);
    manageSummer(world, rng);
  }

  const you = playerClub(world);
  arrivals.push(reachedPl);
  allRuns.push({ run: run + 1, reachedPl, path, rating: squadRating(you), tier: you.tier });
  console.log(`  run ${run + 1}: ${reachedPl ? `Premier League in season ${reachedPl}` : `reached ${DIVISION_BY_TIER[you.tier].name} in ${MAX_SEASONS}`}`);
  console.log(`         ${path.join('  ')}`);
}

const reached = arrivals.filter((a) => a !== null).sort((a, b) => a - b);
const median = reached.length ? reached[Math.floor(reached.length / 2)] : null;
const avgFirst = firstSeasonPositions.reduce((a, b) => a + b, 0) / firstSeasonPositions.length;

console.log('\n  Summary');
console.log(`    reached the Premier League: ${reached.length} of ${RUNS} runs`);
console.log(`    median season of arrival:   ${median ?? 'n/a'}`);
console.log(`    average first-season finish: ${avgFirst.toFixed(1)} of 24`);

const checks = [];
// Season one should be a scrap, not a procession: a bottom-half finish for the
// weakest squad in the division.
checks.push(['season 1 is a struggle (finish 12th or worse)', avgFirst >= 12, avgFirst.toFixed(1)]);
checks.push(['most runs reach the Premier League', reached.length >= Math.ceil(RUNS / 2), `${reached.length}/${RUNS}`]);
checks.push(['climb is not trivial (median season >= 5)', median === null || median >= 5, String(median)]);
checks.push(['climb is not a slog (median season <= 12)', median !== null && median <= 12, String(median)]);

console.log('');
let failed = 0;
for (const [label, pass, value] of checks) {
  if (!pass) failed++;
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(46)} ${value}`);
}
console.log('');
if (failed) { console.log(`  ${failed} check(s) failed\n`); process.exit(1); }
console.log('  Difficulty is in the intended band\n');
