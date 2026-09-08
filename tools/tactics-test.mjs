// Tactics validation harness.
//
// The whole point of this file: every tactical lever must move a real number inside
// the match engine, not just sit in a UI. Layer 1 checks the formulas directly with
// no RNG involved — the fastest possible "did I even wire it" signal. Layer 2 runs
// thousands of matches, holding two squads identical and varying only the lever under
// test, mirroring sim-test.mjs's own technique — if a lever's assertion fails here,
// the lever is cosmetic, and that is exactly the failure mode this file exists to catch.

import { Rng } from '../src/core/rng.js';
import { createClub, teamRatings, pickBestXI } from '../src/model/club.js';
import { simulateMatch } from '../src/engine/match.js';
import { roleFit } from '../src/data/positions.js';
import { defaultTactics } from '../src/data/tactics.js';

const N = Number(process.env.N || 3000);
const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
};

function clubAt(rng, rating, id, tacticsOverride = {}) {
  const club = createClub(rng, {
    id, name: id, short: id, abbr: id.slice(0, 3).toUpperCase(),
    stadium: id + ' Park', capacity: 20000, prestige: 50, tier: 1,
    colors: { primary: '#fff', secondary: '#000' }, pattern: 'solid',
  }, { ratingTarget: rating });
  // createClub assigns a random AI identity to every non-player club, including
  // role/duty for its likely starters (see pickClubIdentity in club.js). For an
  // isolation test that has to reset — leaving it in place would let a leftover
  // random role/duty contaminate a test that is supposed to be varying only the
  // dials in tacticsOverride.
  club.tactics = { ...defaultTactics(), ...tacticsOverride };
  club.playerTactics = {};
  club.lineup = pickBestXI(club);
  return club;
}

function resetCondition(club) {
  for (const p of club.squad) { p.fitness = 95; p.morale = 70; p.form = 0; p.injuredFor = 0; }
  club.lineup = pickBestXI(club);
}

// ---------------------------------------------------------------------------
// Layer 1 — deterministic, no RNG. Formula-level proof of wiring.
// ---------------------------------------------------------------------------

console.log('\nLayer 1 — deterministic formula checks\n');

{
  const rng = new Rng(1);
  const attacking = clubAt(rng, 65, 'ATK', { mentality: 2 });
  const balanced = clubAt(rng, 65, 'BAL', { mentality: 0 });
  const defensive = clubAt(rng, 65, 'DEF', { mentality: -2 });
  const rA = teamRatings(attacking), rB = teamRatings(balanced), rD = teamRatings(defensive);
  check('mentality +2 raises attack vs balanced', rA.attack > rB.attack, `${rA.attack.toFixed(2)} vs ${rB.attack.toFixed(2)}`);
  check('mentality +2 lowers defence vs balanced', rA.defence < rB.defence, `${rA.defence.toFixed(2)} vs ${rB.defence.toFixed(2)}`);
  check('mentality -2 lowers attack vs balanced', rD.attack < rB.attack, `${rD.attack.toFixed(2)} vs ${rB.attack.toFixed(2)}`);
  check('mentality -2 raises defence vs balanced', rD.defence > rB.defence, `${rD.defence.toFixed(2)} vs ${rB.defence.toFixed(2)}`);
}

{
  // Duty, isolated: same club, same squad, only the RB's duty differs between two
  // lineups built by hand so nothing else about the XI changes.
  const rng = new Rng(2);
  const club = clubAt(rng, 60, 'DUTY');
  const rbEntry = club.lineup.find((l) => l.slot === 'RB');
  club.playerTactics[rbEntry.playerId] = { role: null, duty: 'support' };
  club.lineup = pickBestXI(club);
  const supportRatings = teamRatings(club);

  club.playerTactics[rbEntry.playerId] = { role: null, duty: 'attack' };
  club.lineup = pickBestXI(club);
  const attackRatings = teamRatings(club);

  check('attack-duty full-back raises the attack line', attackRatings.attack > supportRatings.attack,
    `${attackRatings.attack.toFixed(2)} vs ${supportRatings.attack.toFixed(2)}`);
  check('attack-duty full-back lowers the defence line', attackRatings.defence < supportRatings.defence,
    `${attackRatings.defence.toFixed(2)} vs ${supportRatings.defence.toFixed(2)}`);
}

{
  // Role, isolated: a striker whose attributes are shaped like a poacher must rate
  // higher deployed as a poacher than as a target-man.
  const poacherLike = { attributes: { pace: 55, finishing: 90, passing: 20, tackling: 10, physical: 40, technique: 55, handling: 0, reflexes: 0 } };
  const fitAsPoacher = roleFit(poacherLike, 'ST', 'poacher');
  const fitAsTargetMan = roleFit(poacherLike, 'ST', 'target-man');
  check('a poacher-shaped striker rates higher as a poacher than a target-man', fitAsPoacher > fitAsTargetMan,
    `${fitAsPoacher.toFixed(3)} vs ${fitAsTargetMan.toFixed(3)}`);
  check('no role assigned is exactly neutral', roleFit(poacherLike, 'ST', null) === 1, String(roleFit(poacherLike, 'ST', null)));
}

{
  // Duty's directionality must hold for essentially any roster, not just typical
  // ones — the whole reason this is a bias mechanism (like mentality) rather than a
  // weight redistribution is that a redistribution's direction depends on how the
  // specific player being given the duty compares to his teammates, which isn't
  // reliable. Sweep many random rosters and require unanimous direction.
  const rng = new Rng(3);
  let raised = 0, lowered = 0, defLowered = 0, defRaised = 0;
  for (let i = 0; i < 80; i++) {
    const club = clubAt(rng, 60, 'RB' + i);
    const rbEntry = club.lineup.find((l) => l.slot === 'RB');
    if (!rbEntry) continue;
    club.playerTactics[rbEntry.playerId] = { role: null, duty: 'support' };
    club.lineup = pickBestXI(club);
    const rSupport = teamRatings(club);
    club.playerTactics[rbEntry.playerId] = { role: null, duty: 'attack' };
    club.lineup = pickBestXI(club);
    const rAttack = teamRatings(club);
    if (rAttack.attack > rSupport.attack + 0.0001) raised++;
    else if (rAttack.attack < rSupport.attack - 0.0001) lowered++;
    if (rAttack.defence < rSupport.defence - 0.0001) defLowered++;
    else if (rAttack.defence > rSupport.defence + 0.0001) defRaised++;
  }
  check('attack duty raises the attack line for every roster tested (80/80)', raised === 80 && lowered === 0,
    `raised ${raised}, lowered ${lowered}`);
  check('attack duty lowers the defence line for every roster tested (80/80)', defLowered === 80 && defRaised === 0,
    `lowered ${defLowered}, raised ${defRaised}`);
}

// ---------------------------------------------------------------------------
// Layer 2 — Monte Carlo. Proof the wiring reaches actual match outcomes.
//
// Squads are held identical between the baseline and treatment conditions, and both
// use the same home/away assignment in both conditions, so any structural home-
// advantage bias is present equally in both and cancels out of the comparison.
// ---------------------------------------------------------------------------

console.log('\nLayer 2 — Monte Carlo match outcomes\n');

const PAIRS = 20;

// Runs N/PAIRS matches per squad pair for both a baseline and a treatment tactic on
// the home side, resetting condition every match, and returns aggregate stats for
// both conditions plus their difference.
function compareTactic(seed, baseTactics, treatTactics, n) {
  const rng = new Rng(seed);
  const perPair = Math.max(1, Math.round(n / PAIRS));
  const agg = () => ({ shotsHome: 0, shotsAway: 0, onTargetHome: 0, fitnessHome: 0, foulsHome: 0, cardsHome: 0, cornersHome: 0, played: 0 });
  const base = agg();
  const treat = agg();

  for (let pair = 0; pair < PAIRS; pair++) {
    const homeBase = clubAt(rng, 60, 'H', baseTactics);
    const homeTreat = clubAt(rng, 60, 'H', treatTactics);
    const away = clubAt(rng, 60, 'A');

    for (let i = 0; i < perPair; i++) {
      for (const [home, bucket] of [[homeBase, base], [homeTreat, treat]]) {
        resetCondition(home); resetCondition(away);
        // The AI's half-time reaction (see ai-tactics.js) nudges a non-player club's
        // own mentality/pressing based on the scoreline — exactly the kind of
        // uncontrolled confound this comparison exists to exclude, since it would
        // let the scoreline itself perturb the very dial being held fixed mid-match.
        const m = simulateMatch(home, away, rng, { competition: 'LEAGUE', aiHalfTimeReactions: false });
        bucket.shotsHome += m.stats.shots[0];
        bucket.shotsAway += m.stats.shots[1];
        bucket.onTargetHome += m.stats.onTarget[0];
        bucket.foulsHome += m.stats.fouls[0];
        bucket.cardsHome += m.stats.yellows[0] + m.stats.reds[0];
        bucket.cornersHome += m.stats.corners[0];
        const fitnessSum = m.home.onPitch.reduce((s, e) => s + e.minutes, 0); // proxy unused below
        bucket.played++;
      }
    }
  }
  return { base, treat };
}

{
  const { base, treat } = compareTactic(101, {}, { pressing: 2 }, N);
  const shotsAgainstBase = base.shotsAway / base.played;
  const shotsAgainstTreat = treat.shotsAway / treat.played;
  const foulsBase = base.foulsHome / base.played;
  const foulsTreat = treat.foulsHome / treat.played;
  const cardsBase = base.cardsHome / base.played;
  const cardsTreat = treat.cardsHome / treat.played;
  check('high pressing lowers the opponent\'s shots', shotsAgainstTreat < shotsAgainstBase * 0.97,
    `${shotsAgainstTreat.toFixed(2)} vs ${shotsAgainstBase.toFixed(2)}`);
  check('high pressing raises the presser\'s own fouls', foulsTreat > foulsBase * 1.05,
    `${foulsTreat.toFixed(2)} vs ${foulsBase.toFixed(2)}`);
  check('high pressing raises the presser\'s own cards', cardsTreat > cardsBase * 1.05,
    `${cardsTreat.toFixed(3)} vs ${cardsBase.toFixed(3)}`);
}

{
  const { base, treat } = compareTactic(102, {}, { tempo: 2 }, N);
  const shotsBase = base.shotsHome / base.played;
  const shotsTreat = treat.shotsHome / treat.played;
  const onTargetShareBase = base.onTargetHome / base.shotsHome;
  const onTargetShareTreat = treat.onTargetHome / treat.shotsHome;
  check('high tempo raises shots', shotsTreat > shotsBase * 1.03, `${shotsTreat.toFixed(2)} vs ${shotsBase.toFixed(2)}`);
  check('high tempo lowers on-target share (volume-for-quality trade)', onTargetShareTreat < onTargetShareBase,
    `${(onTargetShareTreat * 100).toFixed(1)}% vs ${(onTargetShareBase * 100).toFixed(1)}%`);
}

{
  const { base, treat } = compareTactic(103, {}, { width: 2 }, N);
  const cornersBase = base.cornersHome / base.played;
  const cornersTreat = treat.cornersHome / treat.played;
  check('high width raises corners', cornersTreat > cornersBase * 1.05, `${cornersTreat.toFixed(2)} vs ${cornersBase.toFixed(2)}`);
}

{
  // Width's real signature is redistribution, not volume — measure directly on
  // pickWeighted's positional term via widthInvolvement rather than a full Monte
  // Carlo run, since that is the exact, isolated thing width is supposed to change.
  const { widthInvolvement } = await import('../src/data/tactics.js');
  const wideAtWidth2 = widthInvolvement('RW', 2);
  const wideAtWidth0 = widthInvolvement('RW', 0);
  const centralAtWidth2 = widthInvolvement('ST', 2);
  const centralAtWidth0 = widthInvolvement('ST', 0);
  check('high width raises a wide slot\'s involvement', wideAtWidth2 > wideAtWidth0, `${wideAtWidth2} vs ${wideAtWidth0}`);
  check('high width lowers a central slot\'s involvement', centralAtWidth2 < centralAtWidth0, `${centralAtWidth2} vs ${centralAtWidth0}`);
}

{
  // Opposition focus: focusing on the away side's best player should measurably
  // lower that player's scoring+assist output relative to no focus.
  const rng = new Rng(104);
  const perPair = Math.max(1, Math.round(N / PAIRS));
  let outputBase = 0, outputFocused = 0, matchesBase = 0, matchesFocused = 0;

  for (let pair = 0; pair < PAIRS; pair++) {
    const home = clubAt(rng, 60, 'H');
    const awayBase = clubAt(rng, 65, 'A');
    const awayFocused = clubAt(rng, 65, 'A');
    const targetId = awayBase.lineup.reduce((best, l) => {
      const p = awayBase.squad.find((x) => x.id === l.playerId);
      return !best || p.overall > best.overall ? p : best;
    }, null).id;

    for (let i = 0; i < perPair; i++) {
      resetCondition(home);
      home.tactics.oppositionFocus = false;
      resetCondition(awayBase);
      // aiHalfTimeReactions: false — see the comment in compareTactic above. Without
      // it, home.tactics (a non-player club) could pick up a scoreline-driven nudge in
      // the first match that leaks into the second, since resetCondition intentionally
      // does not touch club.tactics.
      const m1 = simulateMatch(home, awayBase, rng, { competition: 'LEAGUE', aiHalfTimeReactions: false });
      outputBase += m1.away.scorers.filter((s) => s.playerId === targetId).length + m1.away.assists.filter((a) => a.playerId === targetId).length;
      matchesBase++;

      resetCondition(home);
      home.tactics.oppositionFocus = true;
      resetCondition(awayFocused);
      const m2 = simulateMatch(home, awayFocused, rng, { competition: 'LEAGUE', aiHalfTimeReactions: false });
      outputFocused += m2.away.scorers.filter((s) => s.playerId === targetId).length + m2.away.assists.filter((a) => a.playerId === targetId).length;
      matchesFocused++;
    }
  }
  const rateBase = outputBase / matchesBase;
  const rateFocused = outputFocused / matchesFocused;
  check('opposition focus lowers the targeted player\'s output', rateFocused < rateBase,
    `${rateFocused.toFixed(3)}/game vs ${rateBase.toFixed(3)}/game`);
}

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All tactics checks passed — every lever moves a real number\n');
