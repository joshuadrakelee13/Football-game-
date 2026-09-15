// Compact player encoding for save files.
//
// Players are ~90% of a save's bytes, and a world holds nearly 3,000 of them. Written
// as objects with full keys a save runs to several megabytes, which overruns what
// browsers will store. Encoding each player as a fixed-order array, and attributes as
// a packed string rather than a JSON number array, keeps a full-squad world under
// ~1 MB even with 47 visible + 13 hidden attributes per player instead of the
// original 8 — measured: naive JSON numbers for the full set projected to ~2.1 MB
// (~4.2 MB in localStorage's UTF-16 accounting, dangerously close to the 5 MiB quota).
//
// PLAYER_FIELDS is the single source of truth for the scalar field order. Add new
// scalar fields at the END only; decoding tolerates short arrays so older saves still
// load. The attribute/hidden/foot/traits payloads that follow are versioned by
// SAVE_VERSION instead — see model/save.js's migrator — because their *shape*, not
// just their length, changed when this game moved from 8 attributes to the full set.

import { overallFor, ATTR_SCALE, ATTR_MIN, ATTR_MAX } from '../data/positions.js';
import { VISIBLE_ATTRIBUTES, HIDDEN_ATTRIBUTES } from '../data/attributes.js';
import { valueOf, wageOf, deriveLegacyPhysical } from './player.js';

const PLAYER_FIELDS = [
  'id', 'first', 'last', 'age', 'nation', 'position', 'potential', 'archetype',
  'morale', 'fitness', 'form', 'goals', 'assists', 'apps', 'cleanSheets',
  'seasonGoals', 'seasonAssists', 'seasonApps', 'careerGoals', 'careerApps',
  'contractYears', 'injuredFor', 'injuryType', 'scouted', 'yellowCards', 'redCards',
  'academyGraduate', 'joinedFrom', 'trainingDelta', 'askingPrice', 'fromClub', 'freeAgent',
];

const BOOLEAN_FIELDS = new Set(['scouted', 'academyGraduate', 'freeAgent']);

// ---------------------------------------------------------------------------
// Attribute packing. Each visible attribute gets 2 characters (12 bits, 4096 levels
// across 1.0-20.0 — a grain of 0.0046, against ~0.016 of movement from one week of
// training, so quantisation can never eat real progress). Each hidden attribute gets
// 1 character (6 bits, 64 levels) — hidden attributes barely move at all, so the
// coarser grain costs nothing visible. Foot is 2 characters the same way. Traits are a
// handful of short ids at most, so they ride as a plain comma-joined string rather
// than needing their own packing scheme.
// ---------------------------------------------------------------------------

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const RANGE = ATTR_MAX - ATTR_MIN;

function packAttr12(value) {
  const v = Math.max(ATTR_MIN, Math.min(ATTR_MAX, value ?? ATTR_MIN));
  const code = Math.round(((v - ATTR_MIN) / RANGE) * 4095);
  return B64[Math.floor(code / 64)] + B64[code % 64];
}

function unpackAttr12(chars) {
  const hi = B64.indexOf(chars?.[0]);
  const lo = B64.indexOf(chars?.[1]);
  const code = Math.max(0, hi) * 64 + Math.max(0, lo);
  return ATTR_MIN + (code / 4095) * RANGE;
}

function packAttr6(value) {
  const v = Math.max(ATTR_MIN, Math.min(ATTR_MAX, value ?? ATTR_MIN));
  const code = Math.round(((v - ATTR_MIN) / RANGE) * 63);
  return B64[code];
}

function unpackAttr6(char) {
  const code = Math.max(0, B64.indexOf(char));
  return ATTR_MIN + (code / 63) * RANGE;
}

function packVisibleAttributes(attributes = {}) {
  return VISIBLE_ATTRIBUTES.map((a) => packAttr12(attributes[a])).join('');
}

function unpackVisibleAttributes(str = '') {
  const out = {};
  VISIBLE_ATTRIBUTES.forEach((a, i) => { out[a] = unpackAttr12(str.slice(i * 2, i * 2 + 2)); });
  return out;
}

function packHiddenAttributes(hidden = {}) {
  return HIDDEN_ATTRIBUTES.map((a) => packAttr6(hidden[a])).join('');
}

function unpackHiddenAttributes(str = '') {
  const out = {};
  HIDDEN_ATTRIBUTES.forEach((a, i) => { out[a] = unpackAttr6(str[i]); });
  return out;
}

function packFoot(foot = {}) {
  return packAttr6(foot.left) + packAttr6(foot.right);
}

function unpackFoot(str = '') {
  return { left: unpackAttr6(str[0]), right: unpackAttr6(str[1]) };
}

// Non-attribute fields carry fractional training progress on rare occasions
// (trainingDelta); three decimals keeps the file free of long floating-point tails.
function roundSmall(n) {
  if (!Number.isFinite(n)) return 0;
  return Math.round(n * 1000) / 1000;
}

export function encodePlayer(player) {
  const row = PLAYER_FIELDS.map((field) => {
    const value = player[field];
    if (value === undefined) return null;
    if (typeof value === 'boolean') return value ? 1 : 0;
    if (typeof value === 'number') return roundSmall(value);
    return value;
  });
  row.push(packVisibleAttributes(player.attributes));
  row.push(packHiddenAttributes(player.hidden));
  row.push(packFoot(player.foot));
  row.push((player.traits || []).join(','));
  return row;
}

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

  const i = PLAYER_FIELDS.length;
  player.attributes = unpackVisibleAttributes(row[i]);
  player.attributes.physical = deriveLegacyPhysical(player.attributes);
  player.hidden = unpackHiddenAttributes(row[i + 1]);
  player.foot = unpackFoot(row[i + 2]);
  player.traits = row[i + 3] ? row[i + 3].split(',').filter(Boolean) : [];

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

// ---------------------------------------------------------------------------
// Legacy (pre-full-attribute-set) decoding, used only by model/save.js's migrator.
// A frozen copy of what decodePlayer used to be: attributes are a plain JSON array of
// 8 numbers, one name each, no hidden/foot/traits payload at all. Kept alongside the
// current codec rather than reconstructed from it, since "read the old shape" and
// "read the current shape" are genuinely different formats that happen to share a
// scalar-field prefix — collapsing them into one conditional function would make
// both harder to read for no real gain.
// ---------------------------------------------------------------------------

const LEGACY_ATTR_ORDER = ['pace', 'finishing', 'passing', 'tackling', 'physical', 'technique', 'handling', 'reflexes'];

export function decodeLegacyPlayerRow(row) {
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
  LEGACY_ATTR_ORDER.forEach((a, i) => { player.attributes[a] = attrs[i] ?? 0; });

  player.name = `${player.first} ${player.last}`;
  player.overall = overallFor(player.attributes, player.position);
  player.value = valueOf(player);
  player.wage = wageOf(player);
  return player;
}

// v1 saves stored attributes on the 0-99 scale, before they moved to FM's 1-20.
// Rescaling the encoded row in place, before decode, means nothing downstream ever
// sees a mixed-scale player. Operates on the legacy 8-value array shape specifically.
export function rescaleLegacySquad(rows) {
  for (const row of rows) {
    const attrs = row[PLAYER_FIELDS.length];
    if (!Array.isArray(attrs)) continue;
    for (let j = 0; j < attrs.length; j++) attrs[j] = (attrs[j] ?? 0) / ATTR_SCALE;
  }
  return rows;
}

// Same conversion for players stored as plain objects rather than encoded rows —
// the transfer market, free agents and youth prospects ride in the save uncompressed.
export function rescaleLegacyPlayers(players) {
  for (const p of players) {
    if (!p?.attributes) continue;
    for (const key in p.attributes) p.attributes[key] = (p.attributes[key] ?? 0) / ATTR_SCALE;
  }
  return players;
}
