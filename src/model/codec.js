// Compact player encoding for save files.
//
// Players are ~90% of a save's bytes, and a world holds nearly 3,000 of them. Written
// as objects with full keys a save runs to several megabytes, which overruns what
// browsers will store. Encoding each player as a fixed-order array cuts that by
// roughly four times.
//
// PLAYER_FIELDS is the single source of truth for the order. Add new fields at the
// END only; decoding tolerates short arrays so older saves still load.

import { overallFor } from '../data/positions.js';
import { valueOf, wageOf } from './player.js';

const PLAYER_FIELDS = [
  'id', 'first', 'last', 'age', 'nation', 'position', 'potential', 'archetype',
  'morale', 'fitness', 'form', 'goals', 'assists', 'apps', 'cleanSheets',
  'seasonGoals', 'seasonAssists', 'seasonApps', 'careerGoals', 'careerApps',
  'contractYears', 'injuredFor', 'injuryType', 'scouted', 'yellowCards', 'redCards',
  'academyGraduate', 'joinedFrom', 'trainingDelta', 'askingPrice', 'fromClub', 'freeAgent',
];

const ATTR_ORDER = ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique', 'handling', 'reflexes'];

export function encodePlayer(player) {
  const row = PLAYER_FIELDS.map((field) => {
    const value = player[field];
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return roundSmall(value);
    return value;
  });
  // Attributes ride along as one array on the end.
  row.push(ATTR_ORDER.map((a) => roundSmall(player.attributes?.[a] ?? 0)));
  return row;
}

// Attributes carry fractional training progress. Three decimals keeps the file free
// of long floating-point tails without letting a rounding boundary flip the derived
// Overall rating by a point on reload.
function roundSmall(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

const BOOLEAN_FIELDS = new Set(['scouted', 'academyGraduate', 'freeAgent']);

export function decodePlayer(row) {
  const player = {};
  PLAYER_FIELDS.forEach((field, i) => {
    let value = row[i];
    if (value === null || value === undefined) {
      if (BOOLEAN_FIELDS.has(field)) value = false;
      else return;
    }
    player[field] = BOOLEAN_FIELDS.has(field) ? !!value : value;
  });

  const attrs = row[PLAYER_FIELDS.length] || [];
  player.attributes = {};
  ATTR_ORDER.forEach((a, i) => { player.attributes[a] = attrs[i] ?? 0; });

  // Name, overall, value and wage are all derived, so they never go in the file.
  player.name = `${player.first} ${player.last}`;
  player.overall = overallFor(player.attributes, player.position);
  player.value = valueOf(player);
  player.wage = wageOf(player);
  return player;
}

export function encodeSquad(squad) {
  return squad.map(encodePlayer);
}

export function decodeSquad(rows) {
  return rows.map(decodePlayer);
}
