// Player generation, valuation and development.
//
// Attributes are generated first and Overall is derived from them, never the other way
// round. That is what lets a striker have elite finishing and hopeless passing while
// still rating 74 — and it means playing him at centre-back genuinely ruins him.

import { clamp } from '../core/rng.js';
import { POSITION_WEIGHTS, overallFor } from '../data/positions.js';
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

// Archetypes give players a recognisable shape rather than a flat stat line.
const ARCHETYPES = {
  GK: [
    { name: 'Shot-stopper', mods: { reflexes: 7, handling: 2, passing: -5 } },
    { name: 'Sweeper keeper', mods: { passing: 9, reflexes: -3, physical: 2 } },
    { name: 'Commanding', mods: { physical: 8, handling: 5, reflexes: -4 } },
  ],
  CB: [
    { name: 'Ball-playing', mods: { passing: 10, technique: 8, physical: -6, tackling: -3 } },
    { name: 'No-nonsense', mods: { tackling: 8, physical: 9, pace: -7, technique: -6 } },
    { name: 'Quick recovery', mods: { pace: 11, physical: -5, tackling: -1 } },
  ],
  LB: [
    { name: 'Overlapping', mods: { pace: 9, passing: 5, tackling: -6 } },
    { name: 'Defensive', mods: { tackling: 9, physical: 6, pace: -6, technique: -4 } },
    { name: 'Inverted', mods: { passing: 9, technique: 8, pace: -5 } },
  ],
  RB: [
    { name: 'Overlapping', mods: { pace: 9, passing: 5, tackling: -6 } },
    { name: 'Defensive', mods: { tackling: 9, physical: 6, pace: -6, technique: -4 } },
    { name: 'Inverted', mods: { passing: 9, technique: 8, pace: -5 } },
  ],
  CDM: [
    { name: 'Destroyer', mods: { tackling: 10, physical: 8, technique: -8, passing: -4 } },
    { name: 'Deep-lying playmaker', mods: { passing: 12, technique: 8, physical: -7, pace: -4 } },
    { name: 'Anchor', mods: { physical: 9, tackling: 6, pace: -8 } },
  ],
  CM: [
    { name: 'Playmaker', mods: { passing: 11, technique: 9, pace: -6, tackling: -6 } },
    { name: 'Box-to-box', mods: { physical: 8, pace: 7, technique: -4 } },
    { name: 'Ball-winner', mods: { tackling: 10, physical: 6, technique: -7 } },
  ],
  CAM: [
    { name: 'Creator', mods: { passing: 11, technique: 9, physical: -8 } },
    { name: 'Shadow striker', mods: { finishing: 12, pace: 6, passing: -7 } },
    { name: 'Dribbler', mods: { technique: 12, pace: 8, physical: -8, tackling: -4 } },
  ],
  LW: [
    { name: 'Flying winger', mods: { pace: 12, technique: 5, physical: -7, finishing: -4 } },
    { name: 'Inside forward', mods: { finishing: 10, technique: 7, pace: -3 } },
    { name: 'Creator', mods: { passing: 11, technique: 7, finishing: -6 } },
  ],
  RW: [
    { name: 'Flying winger', mods: { pace: 12, technique: 5, physical: -7, finishing: -4 } },
    { name: 'Inside forward', mods: { finishing: 10, technique: 7, pace: -3 } },
    { name: 'Creator', mods: { passing: 11, technique: 7, finishing: -6 } },
  ],
  ST: [
    { name: 'Poacher', mods: { finishing: 12, passing: -9, tackling: -6, physical: -2 } },
    { name: 'Target man', mods: { physical: 13, finishing: 4, pace: -10, technique: -4 } },
    { name: 'Pacey forward', mods: { pace: 13, finishing: 3, physical: -8 } },
    { name: 'Complete forward', mods: { technique: 7, passing: 6, finishing: 4, pace: 2 } },
  ],
};

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

export function generatePlayer(rng, { tier = 3, position = 'CM', targetOverall = 55, ageBias = null, nationOverride = null } = {}) {
  const age = rollAge(rng, ageBias);

  // Younger players are generated below their eventual level; that is the headroom.
  let ability = targetOverall;
  if (age <= 18) ability -= rng.int(8, 18);
  else if (age <= 20) ability -= rng.int(4, 11);
  else if (age <= 22) ability -= rng.int(1, 6);
  else if (age >= 33) ability -= rng.int(1, 5);
  ability = clamp(Math.round(ability + rng.normal(0, 2)), 20, 94);

  const archetype = rng.pick(ARCHETYPES[position]);
  const attributes = {};
  const weights = POSITION_WEIGHTS[position];
  const topWeight = Math.max(...Object.values(weights));

  // Attributes the position does not care about drop away sharply. A striker is not
  // secretly a fine tackler just because he is a fine player; the penalty scales with
  // how little the position values that attribute.
  for (const key of ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique', 'handling', 'reflexes']) {
    const relevance = (weights[key] || 0) / topWeight;
    const penalty = (1 - relevance) * 26;
    attributes[key] = ability - penalty + rng.normal(0, 5) + (archetype.mods[key] || 0);
  }

  // Nudge every attribute by a constant so the derived Overall lands on `ability`.
  const drift = ability - overallFor(attributes, position);
  for (const key in attributes) attributes[key] = clamp(Math.round(attributes[key] + drift), 8, 99);

  const overall = overallFor(attributes, position);
  const potential = rollPotential(rng, overall, age);

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
  };

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
