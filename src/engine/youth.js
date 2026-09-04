// The youth academy: producing prospects, and deciding what to do with them.

import { clamp } from '../core/rng.js';
import { generatePlayer } from '../model/player.js';
import { ratingForPrestige, pickBestXI } from '../model/club.js';

const POSITIONS = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST', 'ST'];

// How good the academy is at each level: how often it produces someone, and how high
// their ceiling can be.
const ACADEMY = [
  { chance: 0.16, potentialBonus: 0, spread: [4, 16] },
  { chance: 0.22, potentialBonus: 5, spread: [6, 20] },
  { chance: 0.30, potentialBonus: 11, spread: [8, 25] },
  { chance: 0.38, potentialBonus: 18, spread: [10, 30] },
  { chance: 0.48, potentialBonus: 26, spread: [12, 36] },
];

export function academyLevelInfo(level) {
  return ACADEMY[clamp(level - 1, 0, ACADEMY.length - 1)];
}

// Rolled periodically. Returns a prospect or null.
export function rollProspect(world, club, rng) {
  const level = club.facilities?.youth ?? 1;
  const info = academyLevelInfo(level);
  const focusBonus = club.trainingFocus === 'youth' ? 1.5 : 1;
  if (!rng.chance(info.chance * focusBonus)) return null;
  return generateProspect(world, club, rng);
}

export function generateProspect(world, club, rng) {
  const level = club.facilities?.youth ?? 1;
  const info = academyLevelInfo(level);
  const base = ratingForPrestige(Math.max(8, club.reputation));

  const prospect = generatePlayer(rng, {
    tier: club.tier,
    position: rng.pick(POSITIONS),
    targetOverall: clamp(base - rng.int(2, 10), 24, 70),
    ageBias: 'youth',
  });

  // Academy graduates get their ceiling raised by the quality of the setup.
  const bump = rng.int(info.spread[0], info.spread[1]) + info.potentialBonus;
  prospect.potential = clamp(prospect.overall + bump, prospect.overall + 3, 95);
  prospect.academyGraduate = true;
  prospect.joinedFrom = 'Academy';
  prospect.contractYears = 3;
  prospect.wage = Math.max(120, Math.round(prospect.wage * 0.5 / 10) * 10);
  prospect.scouted = true; // you know your own kids
  return prospect;
}

export function promoteProspect(club, prospect) {
  if (club.squad.length >= 30) return { ok: false, reason: 'Squad is full' };
  club.squad.push(prospect);
  club.lineup = pickBestXI(club);
  return { ok: true };
}

// A rough label for how exciting a prospect is, used in the UI.
export function prospectGrade(prospect) {
  const p = prospect.potential;
  if (p >= 82) return { label: 'Exceptional', tone: 'gold' };
  if (p >= 72) return { label: 'Very promising', tone: 'good' };
  if (p >= 62) return { label: 'Promising', tone: 'good' };
  if (p >= 52) return { label: 'Useful', tone: 'neutral' };
  return { label: 'Limited', tone: 'muted' };
}
