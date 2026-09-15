// Training: where the player's squad actually improves week to week.

import { clamp } from '../core/rng.js';
import { refreshDerived } from '../model/player.js';
import { ATTR_SCALE, ATTR_MIN, ATTR_MAX, GROUPS } from '../data/attributes.js';

// Compiles a focus's per-group (and, for its one or two signature stats, per-attribute)
// rates into a flat {attr: rate} gains table — the same idea data/attributes.js's
// buildWeights uses for position tables, except a gains table needn't sum to anything,
// so every group member gets the FULL rate rather than an even split: an "attack" focus
// training shooting at rate 1.77 means finishing, longShots, penalties and freeKicks
// each individually gain at 1.77 a week, not 1.77 shared four ways. A key entry adds a
// further boost on top of its group, for the handful of attributes that are a focus's
// real signature rather than just part of a broader emphasis.
function buildGains(profile) {
  const gains = {};
  for (const [groupName, rate] of Object.entries(profile.groups || {})) {
    for (const attr of GROUPS[groupName]) gains[attr] = (gains[attr] || 0) + rate;
  }
  for (const [attr, rate] of Object.entries(profile.key || {})) gains[attr] = (gains[attr] || 0) + rate;
  return gains;
}

// Each focus's group rates are calibrated, not guessed: chosen so the squad-weighted
// average Overall-equivalent contribution per week (rate * a position's own share of
// that attribute, summed, averaged across a real 24-player squad's position mix) lands
// within a rounding error of what the original 8-attribute presets gave before the
// attribute foundation existed — verified directly in the E1-P6 commit. Nothing here
// is free: a heavy attacking focus quietly lets the defensive work slide, same as ever.
export const TRAINING_FOCUS = {
  balanced: {
    id: 'balanced', name: 'Balanced', blurb: 'Steady, even development across the squad.',
    gains: buildGains({ groups: Object.fromEntries(Object.keys(GROUPS).map((g) => [g, 0.5])) }),
    fitnessBonus: 0, moraleShift: 0,
  },
  attack: {
    id: 'attack', name: 'Attack', blurb: 'Finishing and movement. Defensive work suffers.',
    gains: buildGains({
      groups: { shooting: 1.77, ballControl: 1.18, speed: 1.03, creation: 0.59, defending: -0.52 },
      key: { finishing: 0.3 },
    }),
    fitnessBonus: 0, moraleShift: 0.4,
  },
  defence: {
    id: 'defence', name: 'Defence', blurb: 'Organisation and tackling. Blunts the attack.',
    gains: buildGains({
      groups: { defending: 1.66, aerial: 0.97, power: 1.11, gkStopping: 1.25, gkSweeping: 0.42, shooting: -0.48, ballControl: -0.21 },
      key: { tackling: 0.3 },
    }),
    fitnessBonus: 0, moraleShift: -0.1,
  },
  fitness: {
    id: 'fitness', name: 'Fitness', blurb: 'Hard running. Players recover faster all season.',
    gains: buildGains({ groups: { power: 1.93, speed: 1.4, workRate: 0.53 }, key: { stamina: 0.3 } }),
    fitnessBonus: 4.5, moraleShift: -0.5,
  },
  passing: {
    id: 'passing', name: 'Passing', blurb: 'Keep the ball. Builds technical quality.',
    gains: buildGains({
      groups: { creation: 2.15, ballControl: 1.43, power: -0.45 },
      key: { passing: 0.3, vision: 0.2 },
    }),
    fitnessBonus: 0, moraleShift: 0.2,
  },
  youth: {
    id: 'youth', name: 'Youth Development', blurb: 'Under-23s develop much faster. Seniors stagnate.',
    gains: buildGains({ groups: Object.fromEntries(Object.keys(GROUPS).map((g) => [g, 0.37])) }),
    youngMultiplier: 3.2, seniorMultiplier: 0.25,
    fitnessBonus: 0, moraleShift: 0,
  },
};

export const FACILITY_UPGRADES = {
  training: [
    { level: 1, name: 'Basic training ground', cost: 0, effect: 'Baseline development' },
    { level: 2, name: 'Improved pitches', cost: 250_000, effect: '+35% development, faster recovery' },
    { level: 3, name: 'Modern complex', cost: 900_000, effect: '+75% development' },
    { level: 4, name: 'Elite performance centre', cost: 3_200_000, effect: '+120% development' },
    { level: 5, name: 'World-class campus', cost: 11_000_000, effect: '+180% development' },
  ],
  youth: [
    { level: 1, name: 'Basic youth academy', cost: 0, effect: 'Occasional modest prospects' },
    { level: 2, name: 'Regional scouting network', cost: 200_000, effect: 'Better prospects, more often' },
    { level: 3, name: 'Category 2 academy', cost: 750_000, effect: 'Strong prospects' },
    { level: 4, name: 'Category 1 academy', cost: 2_800_000, effect: 'Genuine first-team talent' },
    { level: 5, name: 'Elite academy', cost: 9_000_000, effect: 'World-class prospects' },
  ],
  scouting: [
    { level: 1, name: 'One part-time scout', cost: 0, effect: 'Vague potential estimates' },
    { level: 2, name: 'Small scouting team', cost: 150_000, effect: 'Narrower estimates, cheaper reports' },
    { level: 3, name: 'National network', cost: 600_000, effect: 'Accurate estimates' },
    { level: 4, name: 'Continental network', cost: 2_200_000, effect: 'Near-exact estimates, bigger market' },
    { level: 5, name: 'Global network', cost: 7_500_000, effect: 'Exact potential revealed instantly' },
  ],
};

export function facilityInfo(kind, level) {
  const list = FACILITY_UPGRADES[kind];
  return list[clamp(level - 1, 0, list.length - 1)];
}

export function nextFacilityUpgrade(kind, level) {
  const list = FACILITY_UPGRADES[kind];
  return level >= list.length ? null : list[level];
}

// How much better a facility level makes development.
export function trainingMultiplier(level) {
  return [1, 1.35, 1.75, 2.2, 2.8][clamp(level - 1, 0, 4)];
}

// Applied once per week of game time. Small numbers, compounded over a long season.
export function applyTraining(club, weeks, rng) {
  const focus = TRAINING_FOCUS[club.trainingFocus] || TRAINING_FOCUS.balanced;
  const multiplier = trainingMultiplier(club.facilities?.training ?? 1) * weeks * 0.16;

  for (const player of club.squad) {
    if (player.injuredFor > 0) continue;

    let scale = 1;
    if (focus.youngMultiplier) {
      scale = player.age <= 23 ? focus.youngMultiplier : focus.seniorMultiplier;
    }
    // Nobody trains past their ceiling, and everybody past thirty is fighting decline.
    const headroom = player.potential - player.overall;
    if (headroom <= 0 && player.age >= 29) scale *= 0.15;
    else if (headroom <= 0) scale *= 0.3;

    let changed = false;
    for (const [attr, rate] of Object.entries(focus.gains)) {
      // Gain rates are authored in Overall points; attributes are 1-20, hence /ATTR_SCALE.
      // "physical" is never a key here (see buildGains) — it's purely derived from
      // strength/stamina/balance/naturalFitness by refreshDerived below, so a direct
      // write to any real attribute name is all that's needed, no adapter required.
      const delta = (rate * multiplier * scale * rng.float(0.6, 1.4)) / ATTR_SCALE;
      if (Math.abs(delta) < 0.001 / ATTR_SCALE) continue;
      player.attributes[attr] = clamp((player.attributes[attr] ?? 0) + delta, ATTR_MIN, ATTR_MAX);
      changed = true;
    }
    if (changed) {
      const before = player.overall;
      refreshDerived(player);
      // Training cannot push a player beyond the potential he was born with. The
      // overshoot is measured in Overall points, so it has to be converted before it
      // is taken off each attribute — subtracting it raw would strip five times too
      // much and gut any squad that trains past its ceiling.
      if (player.overall > player.potential) {
        const excess = (player.overall - player.potential) / ATTR_SCALE;
        for (const attr in player.attributes) player.attributes[attr] -= excess;
        refreshDerived(player);
      }
      player.trainingDelta = (player.trainingDelta || 0) + (player.overall - before);
    }

    if (focus.fitnessBonus) player.fitness = clamp(player.fitness + focus.fitnessBonus * weeks * 0.3, 25, 100);
    if (focus.moraleShift) player.morale = clamp(player.morale + focus.moraleShift * weeks, 5, 100);
  }
}

export function upgradeFacility(club, kind) {
  const level = club.facilities[kind] ?? 1;
  const next = nextFacilityUpgrade(kind, level);
  if (!next) return { ok: false, reason: 'Already at the highest level' };
  if (club.balance < next.cost) return { ok: false, reason: 'Not enough money in the bank' };
  return { ok: true, cost: next.cost, next };
}
