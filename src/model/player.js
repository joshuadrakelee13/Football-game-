// Player generation, valuation and development.
//
// Attributes are generated first and Overall is derived from them, never the other way
// round. That is what lets a striker have elite finishing and hopeless passing while
// still rating 74 — and it means playing him at centre-back genuinely ruins him.
//
// Generation now targets the full FM-style attribute set (src/data/attributes.js) —
// 47 visible, 13 hidden, preferred foot, traits — rather than the original 8. Seven of
// those eight original names (pace, finishing, passing, tackling, technique, handling,
// reflexes) survive completely unchanged as real members of the new 47: old "pace" and
// new "pace" were always the same measurement, just one of three speed attributes
// instead of the sole one. Only "physical" has no direct successor (split into
// strength/stamina/balance/naturalFitness) and is genuinely derived — see
// deriveLegacyPhysical below. That is what lets every training preset and every
// match.js call site keep working on real numbers, completely unchanged, while this
// phase is entirely about how player.attributes gets filled in. (overallFor itself has
// since moved onto the full 47-key blend — see data/attributes.js — a later, separate
// phase; it is unaffected by which 8 of the names above happen to be pinned here.)

import { clamp, Rng } from '../core/rng.js';
import { overallFor, ATTR_SCALE, ATTR_MIN, ATTR_MAX } from '../data/positions.js';
import { VISIBLE_ATTRIBUTES, HIDDEN_ATTRIBUTES, FULL_POSITION_WEIGHTS, TRAITS } from '../data/attributes.js';
import { nationsForTier, firstNames, lastNames } from '../data/names.js';

// Squad shape: how many of each position a club carries.
export const SQUAD_TEMPLATE = [
  'GK', 'GK', 'GK',
  'CB', 'CB', 'CB', 'CB',
  'LB', 'LB', 'RB', 'RB',
  'CDM', 'CDM', 'CM', 'CM', 'CM',
  'CAM', 'CAM',
  'LW', 'LW', 'RW', 'RW',
  'ST', 'ST', 'ST',
];

// ---------------------------------------------------------------------------
// Archetypes give players a recognisable shape rather than a flat stat line — the
// same names the tactics UI's role vocabulary deliberately echoes (see
// data/positions.js's ROLE_OPTIONS), now expressed as a bias on the generation profile
// rather than a flat point delta. Units are "relevance", the same 0-1-ish scale
// positionRelevance() below produces: +0.35 is a true signature stat, +0.12 a modest
// lean, and the position's own weight table already supplies the baseline every
// archetype builds on.
// ---------------------------------------------------------------------------

const SIG = 0.36, STR = 0.22, MOD = 0.12, negMOD = -0.14, negSTR = -0.24;

export const ARCHETYPE_PROFILE = {
  GK: [
    { name: 'Shot-stopper', bias: { reflexes: SIG, agility: STR, oneOnOnes: MOD, kicking: negMOD, passing: negMOD } },
    { name: 'Sweeper keeper', bias: { rushingOut: SIG, kicking: STR, passing: STR, pace: MOD, reflexes: negMOD } },
    { name: 'Commanding', bias: { commandOfArea: SIG, aerialReach: STR, strength: STR, communication: MOD, agility: negMOD } },
  ],
  CB: [
    { name: 'Ball-playing', bias: { passing: SIG, technique: STR, vision: MOD, firstTouch: MOD, tackling: negMOD, strength: negMOD } },
    { name: 'No-nonsense', bias: { tackling: SIG, strength: STR, heading: STR, aggression: MOD, technique: negMOD, passing: negMOD } },
    { name: 'Quick recovery', bias: { pace: SIG, acceleration: STR, anticipation: MOD, strength: negMOD } },
  ],
  LB: [
    { name: 'Overlapping', bias: { pace: SIG, crossing: STR, stamina: MOD, tackling: negMOD } },
    { name: 'Defensive', bias: { tackling: SIG, marking: STR, strength: MOD, pace: negMOD, technique: negMOD } },
    { name: 'Inverted', bias: { passing: SIG, technique: STR, vision: MOD, pace: negMOD } },
  ],
  RB: [
    { name: 'Overlapping', bias: { pace: SIG, crossing: STR, stamina: MOD, tackling: negMOD } },
    { name: 'Defensive', bias: { tackling: SIG, marking: STR, strength: MOD, pace: negMOD, technique: negMOD } },
    { name: 'Inverted', bias: { passing: SIG, technique: STR, vision: MOD, pace: negMOD } },
  ],
  CDM: [
    { name: 'Destroyer', bias: { tackling: SIG, strength: STR, aggression: MOD, technique: negMOD, passing: negMOD } },
    { name: 'Deep-lying playmaker', bias: { passing: SIG, vision: STR, technique: MOD, strength: negMOD, pace: negMOD } },
    { name: 'Anchor', bias: { strength: SIG, positioning: STR, tackling: MOD, pace: negSTR } },
  ],
  CM: [
    { name: 'Playmaker', bias: { passing: SIG, vision: STR, technique: MOD, pace: negMOD, tackling: negMOD } },
    { name: 'Box-to-box', bias: { stamina: SIG, workRate: STR, pace: MOD, technique: negMOD } },
    { name: 'Ball-winner', bias: { tackling: SIG, aggression: STR, strength: MOD, technique: negMOD } },
  ],
  CAM: [
    { name: 'Creator', bias: { passing: SIG, vision: STR, technique: MOD, strength: negMOD } },
    { name: 'Shadow striker', bias: { finishing: SIG, offTheBall: STR, pace: MOD, passing: negMOD } },
    { name: 'Dribbler', bias: { dribbling: SIG, flair: STR, pace: MOD, strength: negMOD, tackling: negMOD } },
  ],
  LW: [
    { name: 'Flying winger', bias: { pace: SIG, acceleration: STR, crossing: MOD, strength: negMOD, finishing: negMOD } },
    { name: 'Inside forward', bias: { finishing: SIG, technique: STR, dribbling: MOD, pace: negMOD } },
    { name: 'Creator', bias: { passing: SIG, crossing: STR, vision: MOD, finishing: negMOD } },
  ],
  RW: [
    { name: 'Flying winger', bias: { pace: SIG, acceleration: STR, crossing: MOD, strength: negMOD, finishing: negMOD } },
    { name: 'Inside forward', bias: { finishing: SIG, technique: STR, dribbling: MOD, pace: negMOD } },
    { name: 'Creator', bias: { passing: SIG, crossing: STR, vision: MOD, finishing: negMOD } },
  ],
  ST: [
    { name: 'Poacher', bias: { finishing: SIG, offTheBall: STR, composure: MOD, passing: negMOD, tackling: negMOD } },
    { name: 'Target man', bias: { heading: SIG, strength: STR, jumping: STR, bravery: MOD, pace: negSTR, technique: negMOD } },
    { name: 'Pacey forward', bias: { pace: SIG, acceleration: STR, finishing: MOD, strength: negMOD } },
    { name: 'Complete forward', bias: { technique: MOD, passing: MOD, finishing: MOD, pace: MOD } },
  ],
};

// "physical" has no single successor in the 47 — it is the mean of the four attributes
// that absorbed it. Every other legacy name (pace, finishing, passing, tackling,
// technique, handling, reflexes) is a real member of VISIBLE_ATTRIBUTES and needed no
// derivation at all, which is why training.js and match.js could and did migrate onto
// real attribute names directly (E1-P6) with no adapter required — a plain clamped
// write, same as any other attribute. "physical" itself has no such migration to make:
// it isn't a real attribute to rename, it's a display convenience. deriveLegacyPhysical
// survives, called from refreshDerived below, purely because the pre-FM-grid Attributes
// tab (src/ui/context-player.js) still shows it as one of its 6-8 badges — deleting this
// before that UI is rebuilt (E1-P8) would leave that badge silently frozen.
const PHYSICAL_CONSTITUENTS = ['strength', 'stamina', 'balance', 'naturalFitness'];

export function deriveLegacyPhysical(attributes) {
  return PHYSICAL_CONSTITUENTS.reduce((s, k) => s + (attributes[k] || 0), 0) / PHYSICAL_CONSTITUENTS.length;
}

let nextPlayerId = 1;
export function resetPlayerIds() { nextPlayerId = 1; }

// Age distribution for a squad: mostly prime, with youth and veterans at the edges.
function rollAge(rng, bias) {
  if (bias === 'youth') return rng.int(16, 19);
  const r = rng.next();
  if (r < 0.16) return rng.int(17, 20);
  if (r < 0.62) return rng.int(21, 27);
  if (r < 0.88) return rng.int(28, 31);
  return rng.int(32, 36);
}

// Headroom left to grow. Peaks in the teens, gone by the late twenties.
function rollPotential(rng, overall, age) {
  let headroom;
  if (age <= 17) headroom = rng.int(10, 34);
  else if (age <= 19) headroom = rng.int(7, 28);
  else if (age <= 21) headroom = rng.int(4, 21);
  else if (age <= 23) headroom = rng.int(2, 14);
  else if (age <= 26) headroom = rng.int(0, 7);
  else if (age <= 29) headroom = rng.int(0, 3);
  else headroom = 0;
  return clamp(overall + headroom, overall, 95);
}

// How much a position's own weight table cares about each attribute, 0-1 — the
// position-driven half of a generation profile (the archetype supplies the other half).
// Exported for expandLegacyPlayer below, which reuses it rather than a second copy.
export function positionRelevance(position) {
  const weights = FULL_POSITION_WEIGHTS[position];
  const maxWeight = Math.max(...Object.values(weights));
  const relevance = {};
  for (const key of VISIBLE_ATTRIBUTES) relevance[key] = (weights[key] || 0) / maxWeight;
  return relevance;
}

// Finds k such that evalFn(k) lands on target. evalFn must be monotone non-decreasing
// in k — true here because every weight is non-negative and clamp() is itself
// monotone, so a componentwise scale-then-clamp can only move the blend one way.
//
// A fixed bisection bracket is not safe here: how large k needs to be depends on how
// "thin" a given random profile draw is — a raw vector with several near-zero-relevance
// attributes needs a much larger k to drag its high-relevance attributes up to the same
// derived Overall than one that rolled tighter to begin with, and a fixed upper bound
// tuned for the common case silently truncates the rare wide one (verified: this
// produced players up to 21 points below their target before the fix). Doubling `hi`
// until it actually brackets the target — standard exponential-then-bisect — removes
// the guess entirely.
//
// Falls back to the closest k found rather than demanding an exact hit: at the extreme
// ends of the ability range enough attributes are saturated against ATTR_MIN/ATTR_MAX
// that no k lands exactly on target, and "off by a fraction of a point" is a fine
// outcome there — closer than a caller has any way to notice.
function solveScale(evalFn, target, { lo = 0.02, initialHi = 3, iterations = 50 } = {}) {
  let hi = initialHi;
  while (evalFn(hi) < target && hi < 1e5) hi *= 2;

  let bestK = lo, bestDiff = Math.abs(evalFn(lo) - target);
  for (let i = 0; i < iterations; i++) {
    const mid = (lo + hi) / 2;
    const value = evalFn(mid);
    const diff = Math.abs(value - target);
    if (diff < bestDiff) { bestDiff = diff; bestK = mid; }
    if (value === target) return mid;
    if (value < target) lo = mid; else hi = mid;
  }
  return bestK;
}

// Hidden attributes roll independently of the player's ability or position — a League
// Two journeyman can have 18 Determination, and that is the entire point. Excluded from
// every weight table in attributes.js by construction (GROUPS only partitions the 47
// visible ones), and stored on a separate player.hidden object rather than merged into
// player.attributes so nothing here is ever touched by attribute-indexed code (training
// gains, age development) that means only the visible set.
function rollHiddenAttributes(rng) {
  const hidden = {};
  for (const key of HIDDEN_ATTRIBUTES) hidden[key] = clamp(Math.round(rng.normal(11, 4)), ATTR_MIN, ATTR_MAX);
  return hidden;
}

// Preferred foot, biased by position (a left-back is disproportionately left-footed,
// not because the position requires it but because that is who ends up playing there).
function rollFoot(rng, position) {
  let rightBias = 0.78;
  if (position === 'LB' || position === 'LW') rightBias = 0.35;
  else if (position === 'RB' || position === 'RW') rightBias = 0.88;
  const dominantRight = rng.chance(rightBias);
  const twoFooted = rng.chance(0.08);
  const strong = clamp(Math.round(rng.normal(16, 2)), 10, 20);
  const weak = twoFooted ? clamp(Math.round(rng.normal(14, 2)), 8, 20) : clamp(Math.round(rng.normal(7, 3)), 1, 14);
  return dominantRight ? { right: strong, left: weak } : { right: weak, left: strong };
}

// Traits (PPMs): most players carry none, most of the rest carry one. Gated on the
// player's actual finished attributes (and position, where a trait only makes football
// sense for some), not on the profile — a trait describes what a player visibly does,
// which only exists once generation has actually finished.
function rollTraits(rng, attributes, position) {
  const eligible = TRAITS.filter((t) => (!t.positions || t.positions.includes(position)) && t.gate(attributes));
  if (!eligible.length || !rng.chance(0.55)) return [];
  const count = rng.chance(0.72) ? 1 : 2;
  return rng.shuffle(eligible).slice(0, count).map((t) => t.id);
}

// Personality is derived from the hidden set, never stored, the same "one number,
// banded into a label" shape as MORALE_LABELS below. A coarse composite deliberately —
// FM's own personality types are a richer read of the same handful of attributes, and
// the point here is a readable label, not a simulation of FM's exact classifier.
export const PERSONALITY_LADDER = [
  [82, 'Model professional'], [68, 'Professional'], [54, 'Fairly professional'],
  [40, 'Balanced'], [26, 'Unprofessional'], [0, 'Temperamental'],
];

export function personalityFor(hidden) {
  const score = clamp(Math.round(
    (hidden.professionalism * 0.45 + hidden.ambition * 0.2 + hidden.consistency * 0.2 + hidden.sportsmanship * 0.15) * 5,
  ), 0, 100);
  for (const [floor, label] of PERSONALITY_LADDER) if (score >= floor) return label;
  return PERSONALITY_LADDER[PERSONALITY_LADDER.length - 1][1];
}

export function generatePlayer(rng, { tier = 3, position = 'CM', targetOverall = 55, ageBias = null, nationOverride = null } = {}) {
  const age = rollAge(rng, ageBias);

  // Younger players are generated below their eventual level; that is the headroom.
  let ability = targetOverall;
  if (age <= 18) ability -= rng.int(8, 18);
  else if (age <= 20) ability -= rng.int(4, 11);
  else if (age <= 22) ability -= rng.int(1, 6);
  else if (age >= 33) ability -= rng.int(1, 5);
  ability = clamp(Math.round(ability + rng.normal(0, 2)), 20, 94);

  const archetype = rng.pick(ARCHETYPE_PROFILE[position]);
  const relevance = positionRelevance(position);

  // The generation profile: position relevance plus the archetype's signature bumps.
  // Noise is tighter on signature attributes (they track quality closely) and looser on
  // incidental ones — a below-average passer can still be a fine tackler.
  const raw = {};
  for (const key of VISIBLE_ATTRIBUTES) {
    const p = clamp((relevance[key] || 0) + (archetype.bias[key] || 0), 0, 1.4);
    const noise = 0.6 + (1 - Math.min(1, p)) * 2.0;
    // Floored well above zero, deliberately: scaling by k can only ever push a value
    // further in the direction it already has. A raw value that lands at or below zero
    // is stuck at ATTR_MIN for every k from here to infinity — not a rare edge case,
    // since a wide noise draw on a low-relevance attribute crosses zero often — and
    // just one such attribute with real weight in the position's table puts a hard,
    // silent ceiling under the target ability no amount of scaling can reach.
    raw[key] = Math.max(0.5, 2 + 12 * p + rng.normal(0, noise));
  }

  // Scale the whole vector by one factor until the derived Overall lands on `ability` —
  // multiplicative, not the old constant-drift, so shape survives the solve: a
  // signature 18 Finishing moves with the player's quality, an incidental 3 Flair does
  // not get dragged up alongside it.
  const evalK = (k) => {
    const scaled = {};
    for (const key of VISIBLE_ATTRIBUTES) scaled[key] = clamp(raw[key] * k, ATTR_MIN, ATTR_MAX);
    scaled.physical = deriveLegacyPhysical(scaled);
    return overallFor(scaled, position);
  };
  const k = solveScale(evalK, ability);

  const attributes = {};
  for (const key of VISIBLE_ATTRIBUTES) attributes[key] = clamp(raw[key] * k, ATTR_MIN, ATTR_MAX);
  attributes.physical = deriveLegacyPhysical(attributes);

  const overall = overallFor(attributes, position);
  const potential = rollPotential(rng, overall, age);
  const hidden = rollHiddenAttributes(rng);
  const foot = rollFoot(rng, position);
  const traits = rollTraits(rng, attributes, position);

  const { codes, weights: nationWeights } = nationsForTier(tier);
  const nation = nationOverride || rng.weighted(codes, nationWeights);
  const first = rng.pick(firstNames(nation));
  const last = rng.pick(lastNames(nation));

  const player = {
    id: nextPlayerId++,
    name: `${first} ${last}`,
    first,
    last,
    age,
    nation,
    position,
    attributes,
    hidden,
    foot,
    traits,
    overall,
    potential,
    archetype: archetype.name,
    morale: rng.int(58, 82),
    fitness: rng.int(88, 100),
    form: 0,
    goals: 0,
    assists: 0,
    apps: 0,
    cleanSheets: 0,
    seasonGoals: 0,
    seasonAssists: 0,
    seasonApps: 0,
    careerGoals: 0,
    careerApps: 0,
    contractYears: rng.int(1, 4),
    injuredFor: 0,
    injuryType: null,
    // Scouting fog: potential is hidden behind a range until the club scouts him.
    scouted: false,
    yellowCards: 0,
    redCards: 0,
    academyGraduate: false,
    joinedFrom: null,
    // A flat buy-out fee written into some contracts, rolled separately by
    // transfers.js's rollReleaseClause wherever a contract is actually agreed
    // (world generation, an AI signing/renewal, or a human negotiation) — never
    // here, since raw generation isn't a contract event.
    releaseClause: null,
    // Set only while this player sits in a loan club's squad — see loans.js, which is
    // the actual source of truth for full loan terms (world.loans); these two are a
    // denormalised convenience for weeklyWages and the UI.
    onLoanFrom: null,
    loanWagePercent: null,
  };

  player.value = valueOf(player);
  player.wage = wageOf(player);
  return player;
}

// Expands a player who only has the original 8 attributes (a save from before this
// epic) into the full set, in place. Used once, during load migration — see
// model/save.js — never during ordinary play.
//
// Seeded from the player's own id rather than drawing from the caller's rng: this runs
// deep inside deserialise(), long before a world has a live Rng to advance, and it
// means the same v1/v2 player always expands to the same richer profile no matter how
// many times a save is reloaded.
//
// Seven of the eight old names need no estimation at all — pace, finishing, passing,
// tackling, technique, handling and reflexes are pinned to their exact stored values,
// because they are literally the same measurement in both systems. "physical" has no
// single successor, so it is split evenly across its four descendants — there is
// nothing in an old save that could justify differentiating them, so an even split is
// the honest answer, not a guess dressed up as one. Every other attribute has no
// signal in the old save at all; those roll through the same profile shape a fresh
// generation uses, scaled by the player's own pre-migration Overall (computed by
// codec.js's decodeLegacyPlayerRow via the old 8-key formula) rather than solved for —
// there is nothing to solve against a value that, unlike fresh generation, was never
// a target in the first place.
//
// The player's stored Overall is NOT preserved through this: it is recomputed below
// from the complete new attribute set via the live overallFor, exactly like every other
// player's is, so a migrated player rates consistently against everyone else born after
// this phase rather than carrying a frozen pre-migration number forward forever. The
// scale factor above only keeps the freshly-rolled attributes in the right neighbourhood
// for a player of that quality; it does not pin the outcome.
export function expandLegacyPlayer(player) {
  const legacy = player.attributes;
  const rng = new Rng((player.id * 2654435761) >>> 0);
  const archetype = rng.pick(ARCHETYPE_PROFILE[player.position] || ARCHETYPE_PROFILE.CM);
  const relevance = positionRelevance(player.position);

  const attributes = {
    pace: legacy.pace, finishing: legacy.finishing, passing: legacy.passing,
    tackling: legacy.tackling, technique: legacy.technique,
    handling: legacy.handling, reflexes: legacy.reflexes,
  };
  for (const key of PHYSICAL_CONSTITUENTS) attributes[key] = legacy.physical;

  const k = clamp((player.overall || 50) / 50, 0.3, 2.2);
  for (const key of VISIBLE_ATTRIBUTES) {
    if (key in attributes) continue;
    const p = clamp((relevance[key] || 0) + (archetype.bias[key] || 0), 0, 1.4);
    const noise = 0.6 + (1 - Math.min(1, p)) * 2.0;
    attributes[key] = clamp(Math.max(0.5, 2 + 12 * p + rng.normal(0, noise)) * k, ATTR_MIN, ATTR_MAX);
  }
  attributes.physical = deriveLegacyPhysical(attributes);

  player.attributes = attributes;
  player.hidden = rollHiddenAttributes(rng);
  player.foot = rollFoot(rng, player.position);
  player.traits = rollTraits(rng, attributes, player.position);
  player.archetype = archetype.name;

  player.overall = overallFor(player.attributes, player.position);
  player.value = valueOf(player);
  player.wage = wageOf(player);
  return player;
}

// Fitted to real football: 48 ovr ~ £26k, 60 ~ £395k, 68 ~ £2.5M, 76 ~ £15.6M, 85 ~ £70M.
export function valueOf(player) {
  const base = 5000 * Math.pow(1.2364, player.overall - 40);

  let ageMod;
  const a = player.age;
  if (a <= 18) ageMod = 1.35;
  else if (a <= 21) ageMod = 1.45;
  else if (a <= 23) ageMod = 1.25;
  else if (a <= 28) ageMod = 1.0;
  else if (a <= 30) ageMod = 0.78;
  else if (a <= 32) ageMod = 0.5;
  else if (a <= 34) ageMod = 0.28;
  else ageMod = 0.12;

  // Unfulfilled potential is what clubs actually pay for in a young player.
  const headroom = Math.max(0, player.potential - player.overall);
  const potentialMod = 1 + Math.min(0.9, headroom * 0.035) * (a <= 24 ? 1 : 0.3);

  // A player in the last year of his deal is cheaper; everyone knows he can leave.
  const contractMod = player.contractYears <= 0 ? 0.25 : player.contractYears === 1 ? 0.7 : 1;

  const v = base * ageMod * potentialMod * contractMod;
  return Math.max(1000, Math.round(v / 1000) * 1000);
}

// Fitted so 52 ovr ~ £1.2k/wk, 68 ~ £11k/wk, 76 ~ £34k/wk, 85 ~ £150k/wk.
export function wageOf(player) {
  const base = 1200 * Math.pow(1.1576, player.overall - 52);
  const youthDiscount = player.age <= 19 ? 0.45 : player.age <= 21 ? 0.75 : 1;
  return Math.max(150, Math.round((base * youthDiscount) / 50) * 50);
}

export function refreshDerived(player) {
  player.attributes.physical = deriveLegacyPhysical(player.attributes);
  player.overall = overallFor(player.attributes, player.position);
  player.value = valueOf(player);
  player.wage = wageOf(player);
  return player;
}

// The visible potential range before scouting. Wider for younger, less-known players.
export function potentialRange(player, scoutAccuracy = 0) {
  if (player.scouted) return { min: player.potential, max: player.potential, exact: true };
  const baseSpread = player.age <= 20 ? 11 : player.age <= 24 ? 7 : 4;
  const spread = Math.max(1, Math.round(baseSpread * (1 - scoutAccuracy)));
  return {
    min: clamp(player.potential - spread, player.overall, 99),
    max: clamp(player.potential + spread, player.overall, 99),
    exact: false,
  };
}

export function isInjured(player) {
  return player.injuredFor > 0;
}

export function isAvailable(player) {
  return player.injuredFor <= 0;
}

// Effective ability on the day: raw quality, adjusted for condition and confidence.
export function effectiveRating(player) {
  const fitnessFactor = 0.72 + 0.28 * (player.fitness / 100);
  const moraleFactor = 0.93 + 0.14 * (player.morale / 100);
  const formFactor = 1 + clamp(player.form, -5, 5) * 0.012;
  return player.overall * fitnessFactor * moraleFactor * formFactor;
}

export const MORALE_LABELS = [
  [85, 'Delighted'], [70, 'Happy'], [55, 'Content'], [40, 'Unsettled'], [22, 'Unhappy'], [0, 'Furious'],
];

export function moraleLabel(morale) {
  for (const [floor, label] of MORALE_LABELS) if (morale >= floor) return label;
  return 'Furious';
}
