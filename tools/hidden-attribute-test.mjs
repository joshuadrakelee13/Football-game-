// Hidden-attribute wiring harness (epic 1, phase 7).
//
// Phases 1-6 built the 13 hidden attributes and made sure they survive generation,
// save/load and migration — but until now nothing in the game actually read them; a
// League Two journeyman with 18 Determination and a Premier League star with 4 were
// functionally identical. This phase wires four of the thirteen into real formulas
// (the plan's own scope — the rest are natural fits for later epics: dirtiness/
// temperament/sportsmanship/pressure into epic 11's dressing room, adaptability/
// versatility into epic 5's development model). Each gets a direct, isolated test here
// rather than trusting a full-season sim to surface a one-line formula bug.

import { Rng, clamp } from '../src/core/rng.js';
import { createClub, pickBestXI } from '../src/model/club.js';
import { applyTraining } from '../src/engine/training.js';
import { injurePlayer } from '../src/engine/match.js';
import { formVolatility } from '../src/engine/season.js';
import { renewalDemand } from '../src/engine/transfers.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(64)} ${detail}`);
};

function clone(obj) { return JSON.parse(JSON.stringify(obj)); }

// ---------------------------------------------------------------------------
// professionalism (hidden) + determination (visible) -> training scale
// ---------------------------------------------------------------------------
console.log('\nprofessionalism + determination -> training scale\n');

{
  const rng = new Rng(9001);
  const club = createClub(rng, {
    id: 'T1', name: 'Test', short: 'TST', abbr: 'TST', stadium: 'Test Park',
    capacity: 10000, prestige: 55, tier: 2, colors: { primary: '#fff', secondary: '#000' }, pattern: 'solid',
  }, { ratingTarget: 55 });
  club.lineup = pickBestXI(club);

  const base = club.squad.find((p) => p.age <= 23 && p.potential > p.overall + 4);
  if (!base) {
    check('found a young player with training headroom to test on', false);
  } else {
    const hardWorker = clone(base);
    hardWorker.hidden.professionalism = 20;
    hardWorker.attributes.determination = 20;
    const lazy = clone(base);
    lazy.hidden.professionalism = 1;
    lazy.attributes.determination = 1;

    const clubFor = (player) => ({ squad: [player], trainingFocus: 'balanced', facilities: { training: 1 } });
    // Identically seeded so the per-attribute rng.float(0.6, 1.4) noise draws are the
    // same sequence for both runs — the only thing that can differ is the work-ethic
    // multiplier itself.
    for (let week = 0; week < 12; week++) applyTraining(clubFor(hardWorker), 1, new Rng(4242 + week));
    for (let week = 0; week < 12; week++) applyTraining(clubFor(lazy), 1, new Rng(4242 + week));

    const hardGain = hardWorker.overall - base.overall;
    const lazyGain = lazy.overall - base.overall;
    check('a model professional with real determination trains faster than a lazy player',
      hardGain > lazyGain, `hard-worker gained ${hardGain}, lazy gained ${lazyGain} over 12 weeks`);
  }
}

// ---------------------------------------------------------------------------
// injuryProneness (hidden) -> who an in-match injury actually lands on
// ---------------------------------------------------------------------------
console.log('\ninjuryProneness -> injury event weighting\n');

{
  const onPitch = [];
  for (let i = 0; i < 13; i++) onPitch.push({ player: { id: i, hidden: { injuryProneness: 11 } } });
  onPitch.push({ player: { id: 'brittle', hidden: { injuryProneness: 20 } } });
  onPitch.push({ player: { id: 'sturdy', hidden: { injuryProneness: 1 } } });

  const side = {
    onPitch, injuries: [], club: { short: 'TST', id: 'T1', playerTactics: {}, isPlayerClub: false },
    bench: [], subsUsed: 0, subs: [],
  };
  const tally = {};
  const rng = new Rng(777);
  const TRIALS = 20000;
  for (let i = 0; i < TRIALS; i++) {
    side.injuries = [];
    injurePlayer(1, side, rng, () => {}, null);
    const id = side.injuries[0]?.playerId;
    tally[id] = (tally[id] || 0) + 1;
  }
  const brittleShare = (tally.brittle || 0) / TRIALS;
  const sturdyShare = (tally.sturdy || 0) / TRIALS;
  check('a brittle (injuryProneness 20) player is hurt far more often than a sturdy (1) one',
    brittleShare > sturdyShare * 3, `brittle=${(brittleShare * 100).toFixed(2)}% sturdy=${(sturdyShare * 100).toFixed(2)}%`);
  const avgShare = 1 / 15;
  check('a brittle player is hurt more often than a roughly-average (11) teammate',
    brittleShare > avgShare * 1.3, `brittle=${(brittleShare * 100).toFixed(2)}% average-teammate≈${(avgShare * 100).toFixed(2)}%`);
}

// ---------------------------------------------------------------------------
// consistency + importantMatches -> per-match form volatility
// ---------------------------------------------------------------------------
console.log('\nconsistency + importantMatches -> form volatility\n');

{
  const steady = formVolatility({ hidden: { consistency: 20, importantMatches: 11 } }, false);
  const streaky = formVolatility({ hidden: { consistency: 1, importantMatches: 11 } }, false);
  check('low consistency swings form more than high consistency, in a routine league match',
    streaky > steady, `streaky=${streaky.toFixed(3)} steady=${steady.toFixed(3)}`);

  const bigGameHero = formVolatility({ hidden: { consistency: 11, importantMatches: 20 } }, true);
  const bigGameBottler = formVolatility({ hidden: { consistency: 11, importantMatches: 1 } }, true);
  check('a low importantMatches player is extra-volatile specifically in a cup/European match',
    bigGameBottler > bigGameHero, `bottler=${bigGameBottler.toFixed(3)} big-game-player=${bigGameHero.toFixed(3)}`);

  const routineSame = formVolatility({ hidden: { consistency: 11, importantMatches: 20 } }, false);
  const routineOther = formVolatility({ hidden: { consistency: 11, importantMatches: 1 } }, false);
  check('importantMatches has no effect on volatility in a routine league match',
    Math.abs(routineSame - routineOther) < 1e-9, `${routineSame.toFixed(3)} vs ${routineOther.toFixed(3)}`);
}

// ---------------------------------------------------------------------------
// ambition + loyalty -> renewalDemand
// ---------------------------------------------------------------------------
console.log('\nambition + loyalty -> renewalDemand\n');

{
  const basePlayer = {
    overall: 68, age: 25, morale: 60, contractYears: 2, position: 'CM',
    attributes: { determination: 11 },
  };
  const ambitious = { ...basePlayer, hidden: { ambition: 20, loyalty: 1 } };
  const loyal = { ...basePlayer, hidden: { ambition: 1, loyalty: 20 } };
  const neutral = { ...basePlayer, hidden: { ambition: 11, loyalty: 11 } };

  const ambitiousDemand = renewalDemand(ambitious).wage;
  const loyalDemand = renewalDemand(loyal).wage;
  const neutralDemand = renewalDemand(neutral).wage;

  check('a highly ambitious, disloyal player demands more than a neutral one',
    ambitiousDemand > neutralDemand, `ambitious=£${ambitiousDemand} neutral=£${neutralDemand}`);
  check('a loyal, unambitious player demands less than a neutral one',
    loyalDemand < neutralDemand, `loyal=£${loyalDemand} neutral=£${neutralDemand}`);
  check('the ambitious player demands more than the loyal one',
    ambitiousDemand > loyalDemand, `ambitious=£${ambitiousDemand} loyal=£${loyalDemand}`);
}

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All hidden-attribute wiring checks passed\n');
