// Training: where the player's squad actually improves week to week.

import { clamp } from '../core/rng.js';
import { refreshDerived } from '../model/player.js';

// Each focus pushes a different set of attributes. Nothing is free: a heavy attacking
// focus quietly lets the defensive work slide.
export const TRAINING_FOCUS = {
  balanced: {
    id: 'balanced', name: 'Balanced', blurb: 'Steady, even development across the squad.',
    gains: { pace: 0.5, finishing: 0.5, passing: 0.5, tackling: 0.5, physical: 0.5, technique: 0.5, handling: 0.5, reflexes: 0.5 },
    fitnessBonus: 0, moraleShift: 0,
  },
  attack: {
    id: 'attack', name: 'Attack', blurb: 'Finishing and movement. Defensive work suffers.',
    gains: { finishing: 1.5, technique: 0.9, pace: 0.6, passing: 0.3, tackling: -0.35, physical: 0 },
    fitnessBonus: 0, moraleShift: 0.4,
  },
  defence: {
    id: 'defence', name: 'Defence', blurb: 'Organisation and tackling. Blunts the attack.',
    gains: { tackling: 1.5, physical: 0.9, handling: 0.9, reflexes: 0.9, finishing: -0.35, technique: 0 },
    fitnessBonus: 0, moraleShift: -0.1,
  },
  fitness: {
    id: 'fitness', name: 'Fitness', blurb: 'Hard running. Players recover faster all season.',
    gains: { physical: 1.3, pace: 0.9, tackling: 0.2, technique: 0 },
    fitnessBonus: 4.5, moraleShift: -0.5,
  },
  passing: {
    id: 'passing', name: 'Passing', blurb: 'Keep the ball. Builds technical quality.',
    gains: { passing: 1.5, technique: 1.1, pace: 0, physical: -0.2 },
    fitnessBonus: 0, moraleShift: 0.2,
  },
  youth: {
    id: 'youth', name: 'Youth Development', blurb: 'Under-23s develop much faster. Seniors stagnate.',
    gains: { pace: 0.4, finishing: 0.4, passing: 0.4, tackling: 0.4, physical: 0.4, technique: 0.4 },
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
      if (player.attributes[attr] === undefined) continue;
      const delta = rate * multiplier * scale * rng.float(0.6, 1.4);
      if (Math.abs(delta) < 0.001) continue;
      player.attributes[attr] = clamp(player.attributes[attr] + delta, 6, 99);
      changed = true;
    }
    if (changed) {
      const before = player.overall;
      refreshDerived(player);
      // Training cannot push a player beyond the potential he was born with.
      if (player.overall > player.potential) {
        const excess = player.overall - player.potential;
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
