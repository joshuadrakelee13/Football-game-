// Save and load. One autosave slot in localStorage, plus JSON export and import so a
// save can be moved between browsers.

import { encodeSquad, decodeSquad } from './codec.js';
import { pickBestXI } from './club.js';
import { defaultTactics } from '../data/tactics.js';

export const SAVE_KEY = 'fct.save.v1';
export const SAVE_VERSION = 1;

// The pending event carries closures, which cannot survive a round trip through JSON.
// Squads are re-encoded compactly; everything else in the world is plain data.
function packWorld(world) {
  const { pendingEvent, ...rest } = world;
  return {
    ...rest,
    clubs: packClubs(world.clubs),
    europeClubs: world.europeClubs ? packClubs(world.europeClubs) : undefined,
  };
}

function packClubs(clubs) {
  const out = {};
  for (const [id, club] of Object.entries(clubs)) {
    // The lineup is recomputed on load, so it does not need storing either.
    const { squad, lineup, ...restOfClub } = club;
    out[id] = { ...restOfClub, squad: encodeSquad(squad || []) };
  }
  return out;
}

function unpackClubs(clubs) {
  const out = {};
  for (const [id, club] of Object.entries(clubs)) {
    const restored = {
      ...club,
      squad: decodeSquad(club.squad || []),
      // Backfilled rather than a SAVE_VERSION bump: purely additive fields, safe
      // defaults for any save written before tactics existed.
      tactics: club.tactics ?? defaultTactics(),
      playerTactics: club.playerTactics ?? {},
    };
    restored.lineup = pickBestXI(restored);
    out[id] = restored;
  }
  return out;
}

export function serialise(world) {
  return JSON.stringify({
    version: SAVE_VERSION,
    savedAt: Date.now(),
    world: packWorld(world),
  });
}

export function deserialise(json) {
  const data = typeof json === 'string' ? JSON.parse(json) : json;
  if (!data || typeof data !== 'object') throw new Error('Save file is not readable');
  if (data.version !== SAVE_VERSION) {
    throw new Error(`Save was made by a different version of the game (v${data.version})`);
  }
  const world = data.world;
  world.clubs = unpackClubs(world.clubs || {});
  if (world.europeClubs) world.europeClubs = unpackClubs(world.europeClubs);
  world.pendingEvent = null;
  // Backfilled rather than a SAVE_VERSION bump: purely additive fields, safe defaults
  // for any save written before the negotiation system existed.
  world.sellOnClauses = world.sellOnClauses || [];
  world.installmentSchedules = world.installmentSchedules || [];
  world.riseClauses = world.riseClauses || [];
  world.shortlist = world.shortlist || [];
  return { world, savedAt: data.savedAt };
}

export function save(world) {
  try {
    localStorage.setItem(SAVE_KEY, serialise(world));
    return { ok: true };
  } catch (err) {
    // Quota exceeded, or storage blocked entirely in a private window.
    return { ok: false, error: err?.name === 'QuotaExceededError' ? 'Save is too large for this browser' : 'Could not write to storage' };
  }
}

export function load() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    return deserialise(raw);
  } catch (err) {
    console.warn('Could not load save:', err);
    return null;
  }
}

export function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch {
    return false;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function saveSizeKb(world) {
  return Math.round(serialise(world).length / 1024);
}
