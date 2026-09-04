// Scouting: turning a vague potential range into a number you can act on.

import { clamp } from '../core/rng.js';
import { potentialRange } from '../model/player.js';
import { recordLedger } from './finance.js';

// Better departments give narrower estimates and charge less per report.
const SCOUT_LEVELS = [
  { accuracy: 0.0, costMultiplier: 1.0, marketBonus: 0 },
  { accuracy: 0.35, costMultiplier: 0.8, marketBonus: 3 },
  { accuracy: 0.62, costMultiplier: 0.65, marketBonus: 6 },
  { accuracy: 0.85, costMultiplier: 0.5, marketBonus: 10 },
  { accuracy: 1.0, costMultiplier: 0.35, marketBonus: 14 },
];

export function scoutLevelInfo(level) {
  return SCOUT_LEVELS[clamp(level - 1, 0, SCOUT_LEVELS.length - 1)];
}

// A report costs more for a player who is worth more: you are paying for the
// information that matters.
export function scoutCost(club, player) {
  const level = club.facilities?.scouting ?? 1;
  const info = scoutLevelInfo(level);
  const base = 2_000 + player.value * 0.02;
  return Math.max(500, Math.round((base * info.costMultiplier) / 100) * 100);
}

export function visiblePotential(club, player) {
  const level = club.facilities?.scouting ?? 1;
  const info = scoutLevelInfo(level);
  if (info.accuracy >= 1) return { min: player.potential, max: player.potential, exact: true };
  return potentialRange(player, info.accuracy);
}

export function scoutPlayer(world, club, player) {
  if (player.scouted) return { ok: false, reason: 'Already scouted' };
  const cost = scoutCost(club, player);
  if (club.balance < cost) return { ok: false, reason: 'Not enough money in the bank' };

  recordLedger(club, world.seasonNumber, 'scouting', `Scout report: ${player.name}`, -cost);
  player.scouted = true;
  return { ok: true, cost, potential: player.potential };
}

// Higher levels widen the market: more players are on your radar at all.
export function marketSizeBonus(club) {
  return scoutLevelInfo(club.facilities?.scouting ?? 1).marketBonus;
}
