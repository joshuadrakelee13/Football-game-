// Attribute-foundation validation harness (epic 1).
//
// Started life in phase 2 proving just the 47-visible/13-hidden attribute set and the
// compiler that turns small position/role profiles into full weight tables, before any
// of it was wired into the live game. Phase 5 wired it in — overallFor now reads
// FULL_POSITION_WEIGHTS instead of the original 8-key table — so this file grew a
// section that checks the live consequence: does a freshly generated world's rating
// distribution still land where DESIGN.md says it should.

import {
  POSITIONS, POSITION_WEIGHTS, ROLE_OPTIONS, ROLE_LABELS, overallFor,
} from '../src/data/positions.js';
import {
  VISIBLE_ATTRIBUTES, VISIBLE_ATTRIBUTE_LABELS, ATTRIBUTE_CATEGORY,
  HIDDEN_ATTRIBUTES, HIDDEN_ATTRIBUTE_LABELS,
  GROUPS, POSITION_PROFILE, FULL_POSITION_WEIGHTS, FULL_ROLE_WEIGHTS,
  buildWeights, roleRating,
} from '../src/data/attributes.js';
import { buildWorld } from '../src/model/world.js';
import { squadRating, weeklyWages } from '../src/model/club.js';
import { DIVISION_BY_TIER } from '../src/data/competitions.js';

const checks = [];
const check = (label, pass, detail = '') => {
  checks.push([label, pass, detail]);
  console.log(`  ${pass ? 'PASS' : 'FAIL'}  ${label.padEnd(64)} ${detail}`);
};

// ---------------------------------------------------------------------------
// Structural integrity of the attribute lists themselves.
// ---------------------------------------------------------------------------
console.log('\nAttribute definitions\n');

check('47 visible attributes', VISIBLE_ATTRIBUTES.length === 47, `${VISIBLE_ATTRIBUTES.length}`);
check('13 hidden attributes', HIDDEN_ATTRIBUTES.length === 13, `${HIDDEN_ATTRIBUTES.length}`);
check('no attribute is both visible and hidden',
  VISIBLE_ATTRIBUTES.every((a) => !HIDDEN_ATTRIBUTES.includes(a)));
check('every visible attribute has a label',
  VISIBLE_ATTRIBUTES.every((a) => a in VISIBLE_ATTRIBUTE_LABELS));
check('every hidden attribute has a label',
  HIDDEN_ATTRIBUTES.every((a) => a in HIDDEN_ATTRIBUTE_LABELS));
check('every visible attribute has a UI category',
  VISIBLE_ATTRIBUTES.every((a) => ['technical', 'mental', 'physical', 'goalkeeping'].includes(ATTRIBUTE_CATEGORY[a])));

const groupMembers = Object.values(GROUPS).flat();
check('GROUPS partitions all 47 visible attributes exactly once',
  groupMembers.length === 47 && new Set(groupMembers).size === 47 &&
  VISIBLE_ATTRIBUTES.every((a) => groupMembers.includes(a)),
  `${groupMembers.length} members, ${new Set(groupMembers).size} unique`);

// ---------------------------------------------------------------------------
// The compiler: every position profile must sum to exactly 1, no negative weights,
// no reference to an attribute or group that doesn't exist. buildWeights throws on
// all three, so a clean import already proves this — these checks exist to give a
// specific, permanent regression signal rather than relying on "did it crash".
// ---------------------------------------------------------------------------
console.log('\nPosition weight compilation\n');

for (const pos of POSITIONS) {
  let table;
  let threw = null;
  try { table = buildWeights(POSITION_PROFILE[pos], pos); } catch (err) { threw = err; }
  check(`${pos}: profile compiles without throwing`, !threw, threw?.message || '');
  if (!table) continue;
  const total = Object.values(table).reduce((a, b) => a + b, 0);
  check(`${pos}: weights sum to 1`, Math.abs(total - 1) < 1e-9, total.toFixed(12));
  check(`${pos}: no negative weight`, Object.values(table).every((w) => w >= 0));
  check(`${pos}: matches FULL_POSITION_WEIGHTS export`,
    JSON.stringify(table) === JSON.stringify(FULL_POSITION_WEIGHTS[pos]));
}

// ---------------------------------------------------------------------------
// Roles: table integrity, plus — critically — that the compiled role names are
// exactly the ones the live tactics UI already offers via positions.js's own
// ROLE_OPTIONS/ROLE_LABELS. A role picked in the UI has to mean the same thing here.
// ---------------------------------------------------------------------------
console.log('\nRole weight compilation\n');

for (const slot of POSITIONS) {
  const liveRoles = ROLE_OPTIONS[slot] || [];
  const compiledRoles = Object.keys(FULL_ROLE_WEIGHTS[slot] || {});
  check(`${slot}: compiled roles match the live ROLE_OPTIONS exactly`,
    JSON.stringify(liveRoles) === JSON.stringify(compiledRoles),
    `live=${JSON.stringify(liveRoles)} compiled=${JSON.stringify(compiledRoles)}`);

  for (const role of compiledRoles) {
    const table = FULL_ROLE_WEIGHTS[slot][role];
    const total = Object.values(table).reduce((a, b) => a + b, 0);
    check(`${slot}/${role}: weights sum to 1`, Math.abs(total - 1) < 1e-9, total.toFixed(12));
    check(`${slot}/${role}: no negative weight`, Object.values(table).every((w) => w >= 0));
    check(`${slot}/${role}: has a live label`, role in ROLE_LABELS);
  }
}

// ---------------------------------------------------------------------------
// Directional sanity against the old 8-attribute POSITION_WEIGHTS. Not a numeric
// match — the new set is a genuine enrichment, and a couple of positions legitimately
// land differently once technique/passing/pace stop being one bucket each (a CAM's
// old "technique .28 vs passing .26" was a near-tie; the richer creation/ballControl
// split resolving it either way is not a regression). What a strict top-1 match would
// actually catch — a position weighted toward a wildly wrong family entirely — is
// checked here as "the true top family is *plausible* for the position", which is
// the sanity net actually worth having.
// ---------------------------------------------------------------------------
console.log('\nDirectional sanity vs the pre-existing 8-attribute table\n');

const PLAUSIBLE_TOP_GROUPS = {
  GK: ['gkStopping', 'gkSweeping'],
  CB: ['defending', 'aerial'],
  LB: ['defending', 'speed', 'creation'],
  RB: ['defending', 'speed', 'creation'],
  CDM: ['defending', 'creation'],
  CM: ['creation', 'ballControl'],
  CAM: ['creation', 'ballControl', 'shooting'],
  LW: ['ballControl', 'speed', 'shooting'],
  RW: ['ballControl', 'speed', 'shooting'],
  ST: ['shooting', 'aerial', 'power'],
};

for (const pos of POSITIONS) {
  const totals = {};
  for (const g of Object.keys(GROUPS)) {
    totals[g] = GROUPS[g].reduce((s, attr) => s + (FULL_POSITION_WEIGHTS[pos][attr] || 0), 0);
  }
  const [topGroup, topShare] = Object.entries(totals).sort((a, b) => b[1] - a[1])[0];
  check(`${pos}: top attribute family (${topGroup}, ${topShare.toFixed(2)}) is football-plausible`,
    PLAUSIBLE_TOP_GROUPS[pos].includes(topGroup),
    `expected one of ${JSON.stringify(PLAUSIBLE_TOP_GROUPS[pos])}`);
}

// A position's own old top attribute should never end up nearly weightless in the
// new table — the real failure mode a rewrite risks (e.g. a CB whose new table
// quietly forgot about tackling), as opposed to two close attributes swapping rank.
for (const pos of POSITIONS) {
  const oldTopKey = Object.entries(POSITION_WEIGHTS[pos]).sort((a, b) => b[1] - a[1])[0][0];
  const OLD_TO_GROUP = {
    pace: 'speed', finishing: 'shooting', passing: 'creation', tackling: 'defending',
    physical: 'power', technique: 'ballControl', handling: 'gkStopping', reflexes: 'gkStopping',
  };
  const inheritedGroup = OLD_TO_GROUP[oldTopKey];
  const totals = {};
  for (const g of Object.keys(GROUPS)) {
    totals[g] = GROUPS[g].reduce((s, attr) => s + (FULL_POSITION_WEIGHTS[pos][attr] || 0), 0);
  }
  const rank = Object.entries(totals).sort((a, b) => b[1] - a[1]).findIndex(([g]) => g === inheritedGroup);
  check(`${pos}: old top attribute's family ("${inheritedGroup}") still ranks top-3`, rank >= 0 && rank < 3, `rank ${rank + 1}`);
}

// ---------------------------------------------------------------------------
// roleRating on synthetic full-attribute players — proves the function actually
// differentiates in the right direction, using deliberately extreme profiles so the
// signal isn't lost in the deliberately-modest role shift (same 0.18 magnitude the
// live roleFit already uses, and by the same design: role choice should nudge a
// lineup, not remake it).
// ---------------------------------------------------------------------------
console.log('\nroleRating differentiation (synthetic players)\n');

function syntheticAttrs(overrides) {
  const a = {};
  for (const k of VISIBLE_ATTRIBUTES) a[k] = 8;
  return { ...a, ...overrides };
}

const poacher = { attributes: syntheticAttrs({ finishing: 19, pace: 18, acceleration: 18, offTheBall: 17, composure: 16 }) };
const targetMan = { attributes: syntheticAttrs({ jumping: 19, heading: 18, strength: 18, bravery: 17, balance: 16 }) };

check('a poacher-profile ST rates higher as poacher than as target-man',
  roleRating(poacher, 'ST', 'poacher') > roleRating(poacher, 'ST', 'target-man'),
  `poacher=${roleRating(poacher, 'ST', 'poacher')} target-man=${roleRating(poacher, 'ST', 'target-man')}`);
check('a target-man-profile ST rates higher as target-man than as poacher',
  roleRating(targetMan, 'ST', 'target-man') > roleRating(targetMan, 'ST', 'poacher'),
  `target-man=${roleRating(targetMan, 'ST', 'target-man')} poacher=${roleRating(targetMan, 'ST', 'poacher')}`);

const ballPlayingCB = { attributes: syntheticAttrs({ passing: 18, vision: 17, technique: 17, tackling: 12, marking: 12 }) };
const noNonsenseCB = { attributes: syntheticAttrs({ tackling: 18, marking: 18, heading: 17, strength: 17, passing: 10 }) };
check('a ball-playing-profile CB rates higher as ball-playing than no-nonsense',
  roleRating(ballPlayingCB, 'CB', 'ball-playing') > roleRating(ballPlayingCB, 'CB', 'no-nonsense'),
  `ball-playing=${roleRating(ballPlayingCB, 'CB', 'ball-playing')} no-nonsense=${roleRating(ballPlayingCB, 'CB', 'no-nonsense')}`);
check('a no-nonsense-profile CB rates higher as no-nonsense than ball-playing',
  roleRating(noNonsenseCB, 'CB', 'no-nonsense') > roleRating(noNonsenseCB, 'CB', 'ball-playing'),
  `no-nonsense=${roleRating(noNonsenseCB, 'CB', 'no-nonsense')} ball-playing=${roleRating(noNonsenseCB, 'CB', 'ball-playing')}`);

check('roleRating(roleKey=null) falls back to the bare position rating',
  roleRating(poacher, 'ST', null) === Math.round(
    Object.entries(FULL_POSITION_WEIGHTS.ST).reduce((s, [k, w]) => s + poacher.attributes[k] * 5 * w, 0)),
  `${roleRating(poacher, 'ST', null)}`);
check('roleRating returns null for an unknown slot', roleRating(poacher, 'XX', null) === null);
check('roleRating returns null for a player with no attributes', roleRating({}, 'ST', 'poacher') === null);

// A specialised profile should suit its own position far better than an unrelated one.
const cbProfile = { attributes: syntheticAttrs({ tackling: 18, marking: 18, heading: 17, strength: 16, jumping: 16 }) };
check('an extreme CB profile rates much higher at CB than at ST',
  roleRating(cbProfile, 'CB', null) - roleRating(cbProfile, 'ST', null) > 10,
  `CB=${roleRating(cbProfile, 'CB', null)} ST=${roleRating(cbProfile, 'ST', null)}`);

// ---------------------------------------------------------------------------
// Live-world calibration (E1-P5): overallFor now reads FULL_POSITION_WEIGHTS instead
// of the original 8-key POSITION_WEIGHTS — the one deliberately-isolated, balance-
// moving step in this epic's plan. generatePlayer's bisection solver is invariant to
// which table overallFor uses underneath (it searches for whatever scale factor lands
// on its own target ability, whatever the internal formula is), so a fresh world's
// rating distribution should land in the same place it always did — verified directly
// here against DESIGN.md's own band table, averaged across several seeds so one
// unlucky draw can't mask a real regression or fail the suite on ordinary noise. The
// wage-bill/market-value bounds are deliberately wide (generous round numbers around
// what this repo actually measures — see the E1-P5 commit): tight enough to catch the
// failure mode DESIGN.md warns about, "the economy quietly inflates" while every
// per-season check still passes, loose enough that ordinary seed variance never flakes.
// ---------------------------------------------------------------------------
console.log('\nLive-world calibration vs DESIGN.md\n');

check('overallFor now reads the full 47-key table, not the old 8-key one',
  overallFor({ ...Object.fromEntries(VISIBLE_ATTRIBUTES.map((a) => [a, 10])), marking: 18 }, 'CB') !==
  overallFor({ ...Object.fromEntries(VISIBLE_ATTRIBUTES.map((a) => [a, 10])), marking: 10 }, 'CB'),
  'a marking-only change now moves a CB\'s Overall, which the old 8-key table could never see');

const DESIGN_BANDS = { 0: [65, 82], 1: [57, 67], 2: [51, 60], 3: [45, 52], 4: [41, 47] };
const CALIBRATION_SEEDS = [7, 21, 1000, 55555, 909090];
const byTierRatings = {};
let calWageBillTotal = 0, calMarketValueTotal = 0;

for (const seed of CALIBRATION_SEEDS) {
  const world = buildWorld({ seed });
  for (const club of Object.values(world.clubs)) {
    (byTierRatings[club.tier] ||= []).push(squadRating(club));
    calWageBillTotal += weeklyWages(club);
    for (const p of club.squad) calMarketValueTotal += p.value;
  }
}

for (const [tier, [lo, hi]] of Object.entries(DESIGN_BANDS)) {
  const vals = byTierRatings[tier] || [];
  const mean = vals.reduce((a, b) => a + b, 0) / vals.length;
  check(`${DIVISION_BY_TIER[tier].name}: mean squad rating in DESIGN.md band [${lo}-${hi}], avg of ${CALIBRATION_SEEDS.length} seeds`,
    mean >= lo && mean <= hi, mean.toFixed(2));
}

const avgWageBillPerWorld = calWageBillTotal / CALIBRATION_SEEDS.length;
const avgMarketValuePerWorld = calMarketValueTotal / CALIBRATION_SEEDS.length;
check('total weekly wage bill (116 clubs) stays in a sane band',
  avgWageBillPerWorld > 12_000_000 && avgWageBillPerWorld < 21_000_000,
  `£${Math.round(avgWageBillPerWorld).toLocaleString()}`);
check('total player market value (~2900 players) stays in a sane band',
  avgMarketValuePerWorld > 3_000_000_000 && avgMarketValuePerWorld < 5_500_000_000,
  `£${Math.round(avgMarketValuePerWorld).toLocaleString()}`);

// ---------------------------------------------------------------------------

const failed = checks.filter(([, pass]) => !pass);
console.log('');
if (failed.length) {
  console.log(`  ${failed.length} check(s) failed\n`);
  process.exit(1);
}
console.log('  All attribute-foundation checks passed\n');
