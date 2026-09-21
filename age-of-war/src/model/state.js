// The battle state: two symmetrical sides and the entities between them.
//
// Both sides are the same shape, so every rule in the engine is written once and
// the AI is genuinely playing the game you are rather than a simplified version
// of it. Nothing in here touches the DOM, which is what lets tools/*.mjs import
// the whole simulation and run a full battle in a couple of hundred milliseconds.

import { nextId, resetIds } from '../core/ids.js';
import { AGES, DIFFICULTY, LANE, TUNING, UNITS } from '../data/balance.js';

export function createState({ seed = 1, difficulty = 'normal' } = {}) {
  resetIds();
  const profile = DIFFICULTY[difficulty] ?? DIFFICULTY.normal;
  return {
    seed,
    tick: 0,
    time: 0,
    difficulty,
    over: null,                 // { winner, reason, time } once decided
    sides: [createSide(0, { gold: TUNING.startGold, xp: TUNING.startXp }),
            createSide(1, { gold: profile.startGold, xp: profile.startXp, isAi: true, profile: difficulty })],
    projectiles: [],
    specials: [],               // specials mid-telegraph
    intents: [],                // queued this tick, applied at the top of the next
    events: [],                 // cosmetic output, read and cleared by the renderer
    emitEvents: true,
    lastActivity: 0,            // time of the last kill or base hit
    lastBaseDamage: 0,          // time either base was last hit, for the stalemate valve
    stats: {
      spawned: [0, 0], killed: [0, 0],
      goldEarned: [0, 0], xpEarned: [0, 0],
      evolvedAt: [[], []],
      specialsFired: [0, 0],
    },
  };
}

export function createSide(index, { gold = 0, xp = 0, isAi = false, profile = null } = {}) {
  const lane = LANE.base[index];
  return {
    index,
    dir: lane.dir,
    isAi,
    profile,
    ai: null,                   // scratch space owned by engine/ai.js
    gold,
    xp,
    xpSpent: 0,
    age: 0,
    units: [],                  // permanently sorted FRONT (0) to BACK
    queue: [],                  // [{ key, remaining }], head builds first
    base: {
      hp: AGES[0].baseHp,
      maxHp: AGES[0].baseHp,
      anchorX: lane.anchorX,
      frontX: lane.frontX,
    },
    slots: [makeSlot(0, index)],
    slotsOwned: 1,
    specialCooldown: 0,
    secretUnlocked: false,      // Super Soldier, player side only
  };
}

export function makeSlot(slotIndex, sideIndex) {
  const lane = LANE.base[sideIndex];
  // Slots climb the base, stacked back from the front face so turret muzzles
  // clear the wall and read as sitting on the structure.
  return {
    index: slotIndex,
    turret: null,               // { key, reload, buildT, ready }
    x: lane.anchorX - lane.dir * (slotIndex % 2) * 26,
    y: TUNING.stage.groundY - 58 - Math.floor(slotIndex / 2) * 44 - (slotIndex % 2) * 18,
  };
}

// ---------------------------------------------------------------------------

export function unitDef(u) {
  return UNITS[u.key];
}

export function makeUnit(side, key) {
  const def = UNITS[key];
  const id = nextId();
  return {
    id,
    key,
    side: side.index,
    x: side.base.frontX,
    px: side.base.frontX,
    // Lane jitter is derived from the id rather than the rng, so art changes can
    // never shift the random stream the simulation depends on.
    yOff: ((id * 2654435761) % 7) - 3,
    travelled: 0,
    hp: def.hp,
    attackTimer: 0,
    anim: 'walk',
    animT: 0,
    dead: false,
  };
}

export function allUnits(state) {
  return [...state.sides[0].units, ...state.sides[1].units];
}

export function unitCount(side) {
  return side.units.length;
}

// ---------------------------------------------------------------------------
// Determinism check. FNV-1a over a canonical field list: if two runs of the same
// seed ever diverge, this is what catches it.

export function hashState(state) {
  let h = 0x811c9dc5;
  const mix = (n) => {
    const v = Math.round(n * 1000) | 0;
    h ^= v & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 8) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 16) & 0xff; h = Math.imul(h, 0x01000193);
    h ^= (v >>> 24) & 0xff; h = Math.imul(h, 0x01000193);
  };
  mix(state.tick);
  for (const side of state.sides) {
    mix(side.gold); mix(side.xp); mix(side.age);
    mix(side.base.hp); mix(side.slotsOwned); mix(side.specialCooldown);
    mix(side.units.length); mix(side.queue.length);
    for (const u of side.units) { mix(u.id); mix(u.x); mix(u.hp); mix(u.attackTimer); }
    for (const q of side.queue) mix(q.remaining);
    for (const s of side.slots) mix(s.turret ? s.turret.reload : -1);
  }
  mix(state.projectiles.length);
  for (const p of state.projectiles) { mix(p.x); mix(p.t); }
  return h >>> 0;
}
